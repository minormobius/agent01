// sidequest.selftest.mjs — pins the generation orchestrator (hoop/story/sidequest.js) + the prompt
// builder (hoop/story/prompt.js): the adapter→stamp→GATE→repair flow, persistence, and beat checks.
// The adapter + persist client are MOCKED, so the whole policy is node-testable with no network/model.
// Run: node hoop/test/sidequest.selftest.mjs
import { generateSidequest, persistSidequest, beatIssues } from '../story/sidequest.js';
import { buildSidequestPrompt, buildRepairPrompt } from '../story/prompt.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// a valid, gate-passing content_item (lore_fragment — no dialogue tree to validate, empty requires so no orphan gate)
const item = (id) => ({ id, type: 'lore_fragment', revelation_tier: 1, narrative_tier: 1, power_tier: 1, approved: true, status: 'active', tags: ['rind'], content: { name: id, description: 'a stencil older than any map' } });
const validArc = { items: [item('sq-a'), item('sq-b')], beats: [{ id: 'sb-1', completes_when: { facts: { 'flag.sq': true } } }] };
const dupArc = { items: [item('sq-a'), item('sq-a')] };   // dup id in batch ⇒ review BLOCK

// adapter that replays a script of outputs, one per generate() call
const mockAdapter = (outputs, provider = 'gemini-2.5-flash') => {
  let i = 0; return { provider, enabled: true, async generate() { return outputs[Math.min(i++, outputs.length - 1)]; } };
};
const input = { bible: 'BIBLETEXT', profile: { roles: { mend: 2 }, factions: { rindwalker: 1 } }, descriptor: 'rind salvage margin', existing: [], features: [] };

// ── disabled / no-output ⇒ SKIP (procedural fallback, nothing frozen) ──
await (async () => {
  ok((await generateSidequest(null, input)).verdict === 'SKIP', 'null adapter ⇒ SKIP');
  ok((await generateSidequest({ enabled: false, provider: 'off' }, input)).reason === 'disabled', 'disabled adapter ⇒ SKIP/disabled');
  ok((await generateSidequest(mockAdapter([null]), input)).reason === 'no-output', 'null model output ⇒ SKIP/no-output');
})();

// ── happy path: valid arc passes the gate, items stamped with provenance ──
await (async () => {
  const r = await generateSidequest(mockAdapter([validArc]), input);
  ok(r.ok && r.verdict === 'PASS', 'valid arc passes the gate');
  ok(r.attempts === 1, 'a clean arc takes one attempt (no repair)');
  ok(r.items.length === 2 && r.items.every((it) => it.lane === 'sidequest'), 'items are stamped lane:sidequest');
  ok(r.items.every((it) => it.provider === 'gemini-2.5-flash'), 'items carry the provider (filterable)');
  ok(/^[0-9a-f]{8}$/.test(r.genState) && r.items.every((it) => it.genState === r.genState), 'a genState digest steers + stamps every item');
  ok(r.beats.length === 1, 'beats pass through');
})();

// ── repair pass: a rejected first attempt is fixed on the second ──
await (async () => {
  const r = await generateSidequest(mockAdapter([dupArc, validArc]), input);
  ok(r.verdict === 'PASS' && r.attempts === 2, 'a BLOCKed first attempt is repaired on the second');
})();

// ── persistent conflict: BLOCK after the repair, nothing freezable ──
await (async () => {
  const r = await generateSidequest(mockAdapter([dupArc, dupArc]), input);
  ok(!r.ok && r.verdict === 'BLOCK', 'an unrepairable arc stays BLOCK (ok:false)');
  ok(r.report && r.report.conflicts.some((c) => c.code === 'dup_in_batch'), 'the gate report names the conflict');
  ok(r.attempts === 2, 'exactly one repair attempt is made');
})();

// ── persistSidequest: per-item tolerant writes to the player repo ──
await (async () => {
  const client = { async putRecord(col, rkey) { return { uri: `at://me/${col}/${rkey}` }; } };
  const { written, errors } = await persistSidequest(client, validArc.items);
  ok(written.length === 2 && errors.length === 0, 'all items written to the player repo');
  ok(written[0].uri.includes('com.minomobi.hoop.story.content/sq-a'), 'writes go to the story.content collection keyed by id');

  let n = 0;
  const flaky = { async putRecord(col, rkey) { if (++n === 1) throw new Error('rate limit'); return { uri: `at://me/${col}/${rkey}` }; } };
  const res = await persistSidequest(flaky, validArc.items);
  ok(res.written.length === 1 && res.errors.length === 1, 'a single failed write is collected, the rest still land');
})();

// ── beatIssues ──
ok(beatIssues([{ id: 'b1', completes_when: { facts: {} } }]).length === 0, 'a well-formed beat is clean');
ok(beatIssues([{ completes_when: {} }]).some((i) => i.code === 'beat_no_id'), 'a beat without id is flagged');
ok(beatIssues([{ id: 'b2' }]).some((i) => i.code === 'beat_no_close'), 'a beat without completes_when is flagged');

// ── prompt builder ──
{
  const p = buildSidequestPrompt({ bible: 'BIBLETEXT', profile: { factions: { drift: 1 } }, descriptor: 'desc', chunkThickness: 5, thicknessGap: 3, existing: [{ id: 'sp1', type: 'npc', content: { name: 'Olo' } }] });
  ok(p.prompt.includes('BIBLETEXT'), 'prompt stuffs the bible whole');
  ok(p.prompt.includes('sp1') && p.prompt.includes('Olo'), 'prompt lists nearby ids/names to avoid collisions');
  ok(p.prompt.includes('thickness: 5'), 'prompt states the chunk thickness');
  ok(p.minItems >= 4, 'a thickness gap of 3 demands at least 4 items (gap+1)');
  ok(p.schema && Array.isArray(p.schema.items), 'a JSON schema hint is attached');
  const rep = buildRepairPrompt(p, { conflicts: [{ code: 'dup_in_batch', id: 'sq-a', msg: 'dup' }] });
  ok(rep.prompt.includes('REJECTED') && rep.prompt.includes('dup_in_batch'), 'repair prompt appends the conflict report');
}

console.log(`sidequest.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
