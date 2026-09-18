// run.mjs — the three-tier cascade, end to end, with real keys.
//
//   tier 1  Jev            via the deployed proxy (no key needed here)
//   tier 2  ds4-flash      DeepSeek's Anthropic-compatible endpoint
//   tier 3  claude-opus-5  the one we are trying not to call
//
// Runs in CI, where all three keys exist. Reports what the cascade routed,
// what it got right, and what it cost — against the baseline of sending
// every decision to tier 3 with the whole state, which is the thing the
// architecture has to beat to be worth anything.
//
// Both upper tiers speak the Messages API, so one client class serves both
// with a different baseURL — DeepSeek exposes /anthropic for exactly this.
import Anthropic from '@anthropic-ai/sdk';
import { runCascade, sizeOf } from '../cascade.mjs';
import { buildCorpus, shouldStayLocal } from './corpus.mjs';

const JEV_ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const TIER3_MODEL = process.env.TIER3_MODEL || 'claude-opus-5';
const TIER2_MODEL = process.env.DEEPSEEK_FLASH_MODEL || 'deepseek-v4-flash';
// Anthropic first-party rates, $ per 1M tokens. DeepSeek's are not published
// here, so tier 2 is reported in tokens only rather than guessed at.
const OPUS_IN = 5.00, OPUS_OUT = 25.00;
const JEV_IN = 0.042;

const usage = { jev_in: 0, jev_out: 0, t2_in: 0, t2_out: 0, t3_in: 0, t3_out: 0 };
const timing = { t2: [], t3: [] };

async function tier1(state, questions) {
  const t0 = Date.now();
  const res = await fetch(JEV_ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, questions }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`tier1 HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  usage.jev_in += body.usage?.input_tokens || 0;
  usage.jev_out += body.usage?.output_tokens || 0;
  body.wall = Date.now() - t0;
  return body;
}

const SYSTEM =
  'You answer one narrow yes/no question about a fragment of a deploy registry. ' +
  'Reply with JSON only: {"answer": true|false|null, "sufficient": true|false, "why": "<12 words"}. ' +
  'Set sufficient to false — and answer to null — when the fragment does not contain what the ' +
  'question needs. Never guess to fill a gap.';

function parseUpper(text) {
  const m = text && text.match(/\{[\s\S]*\}/);
  if (!m) return { answer: null, sufficient: false, why: 'unparseable' };
  try {
    const o = JSON.parse(m[0]);
    return { answer: typeof o.answer === 'boolean' ? o.answer : null,
      sufficient: o.sufficient === true, why: String(o.why || '').slice(0, 80) };
  } catch { return { answer: null, sufficient: false, why: 'unparseable' }; }
}

function makeUpperTier(client, model, bucket, times, extra = {}) {
  return async (payload) => {
    const t0 = Date.now();
    const res = await client.messages.create({
      model, max_tokens: 256, system: SYSTEM, ...extra,
      messages: [{ role: 'user', content:
        `REGISTRY FRAGMENT:\n${payload.context || '(nothing was provided)'}\n\nQUESTION: ${payload.question}` }],
    });
    times.push(Date.now() - t0);
    usage[`${bucket}_in`] += res.usage?.input_tokens || 0;
    usage[`${bucket}_out`] += res.usage?.output_tokens || 0;
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseUpper(text);
  };
}

const dsKey = process.env.DEEPSEEK_API_KEY || '';
const anKey = process.env.ANTHROPIC_API_KEY || '';
// This repo's Claude workflows mostly authenticate with an OAuth token
// rather than an API key. An OAuth token goes on Authorization: Bearer (the
// SDK's `authToken`) and needs the oauth beta header — it is not a drop-in
// for `apiKey`, which is why the first run found no tier 3 at all.
const anOauth = process.env.ANTHROPIC_AUTH_TOKEN || '';
const tier3Client = anKey
  ? new Anthropic({ apiKey: anKey })
  : anOauth
    ? new Anthropic({ authToken: anOauth, defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' } })
    : null;
const tier2 = dsKey
  ? makeUpperTier(new Anthropic({ apiKey: dsKey, baseURL: 'https://api.deepseek.com/anthropic' }),
      TIER2_MODEL, 't2', timing.t2)
  : null;
const tier3 = tier3Client
  ? makeUpperTier(tier3Client, TIER3_MODEL, 't3', timing.t3,
      // Thinking is on by default on Opus 5; low effort is right for a single
      // narrow yes/no and keeps the tier we are trying to avoid from being
      // gratuitously expensive when it does get called.
      { output_config: { effort: 'low' } })
  : null;

const { state, decisions, surfaceCount } = buildCorpus(process.env.REGISTRY || 'deploy-registry.json');
console.log(`corpus: ${decisions.length} decisions over ${surfaceCount} real surfaces, state ${sizeOf(state)}B`);
console.log(`tier 2: ${tier2 ? TIER2_MODEL : 'ABSENT (no DeepSeek key)'}   ` +
  `tier 3: ${tier3 ? `${TIER3_MODEL} (${anKey ? 'api key' : 'oauth token'})` : 'ABSENT — no ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN'}`);
if (!tier3) console.log('  ! with no tier 3, tier 2 is the end of the line: a "0 tier-3 calls" below means\n' +
  '    NOT REACHABLE, not "not needed". Do not read it as the cascade saving a call.\n');

const { resolved, stats } = await runCascade({
  state, decisions, tier1, tier2, tier3,
  options: { maxEscalationRate: 0.8 },
});

// ------------------------------------------------------------- routing ----
const byId = Object.fromEntries(resolved.map((r) => [r.decision.id, r]));
let localOK = 0, localBad = 0, escOK = 0, escWasted = 0;
for (const d of decisions) {
  const r = byId[d.id];
  const stayed = r.tier === 1;
  if (shouldStayLocal(d)) stayed ? localOK++ : escWasted++;
  else stayed ? localBad++ : escOK++;
}
const answerable = decisions.filter(shouldStayLocal);
console.log('ROUTING');
console.log(`  answerable kept at tier 1   : ${localOK}/${answerable.length}`);
console.log(`  answerable sent up (wasted) : ${escWasted}/${answerable.length}`);
console.log(`  unanswerable sent up        : ${escOK}/${decisions.length - answerable.length}`);
console.log(`  unanswerable answered anyway: ${localBad}/${decisions.length - answerable.length}   <- the dangerous cell`);

const keptAnswerable = answerable.filter((d) => byId[d.id].tier === 1);
const right = keptAnswerable.filter((d) => {
  const a = byId[d.id].answer; return typeof a?.noul === 'number' && (a.noul > 0.5) === d.truth;
}).length;
console.log(`\n  accuracy of what tier 1 kept: ${keptAnswerable.length ? (right / keptAnswerable.length * 100).toFixed(1) : '—'}% (${right}/${keptAnswerable.length})`);

const upper = resolved.filter((r) => r.tier > 1);
const upperSuff = upper.filter((r) => r.final?.sufficient === true).length;
console.log(`  escalated decisions: ${upper.length}, of which the upper tiers called ${upperSuff} answerable and ${upper.length - upperSuff} genuinely unanswerable`);

// ---------------------------------------------------------------- cost ----
const med = (xs) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
const cascadeCost = (usage.jev_in / 1e6) * JEV_IN + (usage.t3_in / 1e6) * OPUS_IN + (usage.t3_out / 1e6) * OPUS_OUT;
// Baseline: every decision to tier 3, each carrying the whole state.
const baseInTok = Math.round((sizeOf(state) / 3.8 + 40) * decisions.length);
const baseCost = (baseInTok / 1e6) * OPUS_IN + (decisions.length * 60 / 1e6) * OPUS_OUT;

console.log('\nCOST AND SHAPE');
console.log(`  tier 1  ${String(stats.tier1_ms + 'ms').padEnd(8)} 1 call    ${usage.jev_in} in / ${usage.jev_out} out tokens`);
console.log(`  tier 2  ${String((med(timing.t2) ?? '—') + 'ms').padEnd(8)} ${String(stats.tier2_calls).padEnd(2)} calls   ${usage.t2_in} in / ${usage.t2_out} out tokens (median latency)`);
console.log(`  tier 3  ${String((med(timing.t3) ?? '—') + 'ms').padEnd(8)} ${String(stats.tier3_calls).padEnd(2)} calls   ${usage.t3_in} in / ${usage.t3_out} out tokens (median latency)`);
console.log(`  the choke: upper tiers saw ${(stats.choke_ratio * 100).toFixed(2)}% of the bytes tier 1 read`);
console.log(`\n  cascade   ~$${cascadeCost.toFixed(5)}  (tier 3 priced at $${OPUS_IN}/$${OPUS_OUT} per MTok; DeepSeek not priced here)`);
console.log(`  all-to-QB ~$${baseCost.toFixed(5)}  (${decisions.length} calls, whole state each, est. ${baseInTok} input tokens)`);
console.log(`  ratio     ${(baseCost / Math.max(cascadeCost, 1e-9)).toFixed(1)}x cheaper, total wall ${stats.total_ms}ms`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Jev cascade\n\n` +
    `| | |\n|---|---|\n` +
    `| decisions | ${decisions.length} over ${surfaceCount} real surfaces |\n` +
    `| answerable kept at tier 1 | ${localOK}/${answerable.length} |\n` +
    `| unanswerable answered anyway | **${localBad}** |\n` +
    `| accuracy of what tier 1 kept | ${keptAnswerable.length ? (right / keptAnswerable.length * 100).toFixed(1) : '—'}% |\n` +
    `| tier 3 calls | ${stats.tier3_calls} |\n` +
    `| choke ratio | ${(stats.choke_ratio * 100).toFixed(2)}% |\n` +
    `| cost vs all-to-QB | ${(baseCost / Math.max(cascadeCost, 1e-9)).toFixed(1)}x cheaper |\n`);
}

// The dangerous cell is the one that decides whether this is shippable.
if (localBad > 0) {
  console.error(`\n✗ ${localBad} unanswerable decision(s) were answered locally.`);
  process.exit(1);
}
console.log('\n✓ nothing unanswerable was answered locally');
