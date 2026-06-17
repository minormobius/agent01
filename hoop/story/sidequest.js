// hoop/story/sidequest.js — the SIDE-QUEST GENERATION ORCHESTRATOR. The testable core that the worker
// HTTP-wraps: prompt → adapter.generate → provenance stamp → review.js/gates.js/validate.js GATE → one
// repair pass → return. The adapter and the persist client are injected, so this whole flow is
// node-testable with mocks (no network). The worker is then a thin shell; the policy lives here.
//
// Discipline: NOTHING is frozen unless the gate verdict is PASS. A disabled adapter (no key) returns a
// SKIP — the caller falls back to the procedural pool. The hot path never depends on this succeeding.

import { reviewBatch } from './review.js';
import { stampProvenance } from './filter.js';
import { chunkDescriptor } from './spine.js';
import { buildSidequestPrompt, buildRepairPrompt, steerFromPulse } from './prompt.js';
import { putContent } from './atproto.js';

// tiny stable digest (FNV-1a → hex) — the genState provenance key (what steered this generation).
function digest(text) {
  let h = 2166136261 >>> 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const stampAll = (items, provider, genState) =>
  (items || []).map((it) => stampProvenance(it, { lane: 'sidequest', provider, genState }));

// Light structural sanity for storyboard beats (review.js gates content_items, not beats). Non-blocking
// — returns warnings the caller can surface; a malformed beat is dropped, never frozen as content.
export function beatIssues(beats) {
  const out = [];
  for (const b of beats || []) {
    if (!b || !b.id) out.push({ code: 'beat_no_id', msg: 'beat missing id' });
    else if (!b.completes_when) out.push({ code: 'beat_no_close', id: b.id, msg: 'beat has no completes_when' });
  }
  return out;
}

// adapter: { provider, enabled, generate({system,prompt,schema}) } from story/llm. input carries the
// chunk context the browser computed (bible text, the econ ChunkProfile, the spine match result + nearby
// pool/features for the gate). Returns { ok, verdict, items, beats, report, provider, genState, attempts }.
export async function generateSidequest(adapter, input = {}) {
  const empty = (reason) => ({ ok: false, verdict: 'SKIP', reason, items: [], beats: [], provider: adapter && adapter.provider, attempts: 0 });
  if (!adapter || !adapter.enabled) return empty('disabled');

  const { bible = '', profile = {}, existing = [], features = [], match = {} } = input;
  const cd = chunkDescriptor(profile);
  const descriptor = input.descriptor || cd.text;
  const genState = digest(descriptor);
  const thicknessGap = match.thicknessGap != null ? match.thicknessGap
    : (match.candidates && match.candidates[0] ? match.candidates[0].thicknessGap : 0);
  const steer = steerFromPulse(input.pulse);   // the Director's pulse biases the arc toward where the playerbase is

  let req = buildSidequestPrompt({ bible, profile, descriptor, chunkThickness: cd.thickness, thicknessGap, existing, steer });
  let attempts = 0, report = null, items = [], beats = [];

  for (let pass = 0; pass < 2; pass++) {            // attempt + one repair
    attempts++;
    const out = await adapter.generate({ system: req.system, prompt: req.prompt, schema: req.schema });
    if (!out) return empty('no-output');
    items = stampAll(out.items, adapter.provider, genState);
    beats = Array.isArray(out.beats) ? out.beats : [];
    report = reviewBatch(existing, items, features);
    if (report.verdict === 'PASS') break;
    req = buildRepairPrompt(req, report);          // feed the conflicts back and try once more
  }

  return {
    ok: report && report.verdict === 'PASS', verdict: report ? report.verdict : 'BLOCK',
    items, beats, report, beatWarnings: beatIssues(beats),
    provider: adapter.provider, genState, attempts,
  };
}

// Freeze the gated arc into the PLAYER'S OWN repo (lane:'sidequest'). `client` authed for the player
// (AuthClient.pds). Per-item tolerant: one failed write doesn't sink the rest. Returns {written, errors}.
export async function persistSidequest(client, items) {
  const written = [], errors = [];
  for (const ci of items || []) {
    try { const res = await putContent(client, ci); written.push({ id: ci.id, uri: res && (res.uri || res.cid) || null }); }
    catch (e) { errors.push({ id: ci.id, error: String(e && e.message || e) }); }
  }
  return { written, errors };
}
