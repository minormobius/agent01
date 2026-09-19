// cross-gate.mjs — does the >=0.9 confidence gate fire on a MARKET state
// document when the question is finally determinate?
//
// This surface carries two numbers that have never been reconciled:
//
//   the gate is 66/66 perfect on determinate questions
//   the gate fires 0 times in 342 on market questions
//
// The stated explanation is that market questions are predictions, and
// predictions have no determinate answer. That has never been tested, because
// no determinate market question was ever asked. Here is one.
//
// THE DESIGN, and why it is the clean version. Determinate and predictive
// questions go in the SAME call against the SAME document — one state, one
// moment, one model — so nothing differs between the arms except whether the
// answer exists yet. Questions are evaluated in parallel and in isolation
// (measured: a neighbouring question shouting instructions moved the answer by
// 0.000), so pairing them costs nothing and removes every confound a
// between-call comparison would carry.
//
// Ground truth is COMPUTED, never labelled: the determinate answers from the
// figures the document itself prints, the predictive ones from bars the
// document has never seen.
//
//   node mega/jev/eval/cross-gate.mjs [--windows 48] [--bars 1m] [--out path]
import { writeFileSync } from 'node:fs';
import { assetFigures, crossSection, crossDoc, buildProbes, groundTruth, readAnswer, isDeterminate }
  from '../lab/cross.mjs';

const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const UNIVERSE = ['BTC', 'ETH', 'SOL'];
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N_WINDOWS = Number(arg('windows', 48));
const INTERVAL = arg('bars', '1m');
const OUT = arg('out', null);
const W = 60;            // the trailing window the probes ask about, in bars
const STRIDE = 2 * W;    // non-overlapping: trailing 60 then forward 60
const BAR_MS = { '1m': 60_000, '5m': 300_000, '15m': 900_000 }[INTERVAL];
// The proxy allows 30 calls a minute per IP. Stay under it rather than
// discovering the 429 path mid-experiment.
const SPACING_MS = 2400;

async function candles(coin, bars = 5000) {
  const end = Date.now();
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot',
      req: { coin, interval: INTERVAL, startTime: end - bars * BAR_MS, endTime: end } }),
  });
  if (!res.ok) throw new Error(`hyperliquid ${res.status} for ${coin}`);
  return (await res.json()).map((c) => Number(c.c));
}

async function ask(state, questions) {
  const res = await fetch(ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, questions }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`jev ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

const px = {};
for (const a of UNIVERSE) px[a] = await candles(a);
const len = Math.min(...UNIVERSE.map((a) => px[a].length));
for (const a of UNIVERSE) px[a] = px[a].slice(-len);
console.log(`${len} ${INTERVAL} bars per asset (${(len * BAR_MS / 86400_000).toFixed(1)} days)`);

// Non-overlapping windows, spread over the whole history rather than taken
// from its tail — one regime is not a sample.
const picks = [];
for (let i = W; i + W < len; i += STRIDE) picks.push(i);
const step = Math.max(1, Math.floor(picks.length / N_WINDOWS));
const chosen = picks.filter((_, k) => k % step === 0).slice(0, N_WINDOWS);
console.log(`${chosen.length} non-overlapping windows, ${W}-bar trailing and ${W}-bar forward\n`);

const rows = [];
let call = 0;
for (const i of chosen) {
  const figs = Object.fromEntries(UNIVERSE.map((a) => [a, assetFigures(px[a], i, [15, W])]));
  if (Object.values(figs).some((f) => !f)) continue;
  const xs = crossSection(figs, { window: W });
  const forward = Object.fromEntries(UNIVERSE.map((a) =>
    [a, (px[a][i + W] - px[a][i]) / px[a][i] * 1e4]));
  const truth = groundTruth(figs, xs, forward);
  const probes = buildProbes(xs, { selfCheck: true });
  const doc = crossDoc(figs, xs, { unit: INTERVAL.replace(/[0-9]/g, ''), windows: [15, W] });

  if (call++) await new Promise((r) => setTimeout(r, SPACING_MS));
  let reply;
  try { reply = await ask(doc, probes); }
  catch (e) { console.error(`  window ${i}: ${e.message}`); continue; }

  for (const id of Object.keys(probes)) {
    if (id.startsWith('have__')) continue;
    const { value, confidence } = readAnswer(reply.answers?.[id]);
    if (value === null) continue;
    // The self-check rides in the same call, so it sees exactly the state the
    // answer saw. p(have) is the noul itself, NOT max(p, 1-p): the question is
    // "is the information here", so a low number is a real claim of absence
    // and folding it to a distance-from-half would erase the signal.
    const sc = reply.answers?.[`have__${id}`];
    rows.push({ i, id, determinate: isDeterminate(id), value, truth: truth[id],
      correct: value === truth[id], confidence,
      have: typeof sc?.noul === 'number' ? sc.noul : null,
      spreadBps: xs.spreadBps, source: reply.source });
  }
  if (call % 8 === 0) process.stdout.write(`  ${call}/${chosen.length} windows\n`);
}

// ------------------------------------------------------------- report ----
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—');
function summarise(label, rs) {
  const n = rs.length, right = rs.filter((r) => r.correct).length;
  const gated = rs.filter((r) => r.confidence >= 0.9);
  const gRight = gated.filter((r) => r.correct).length;
  const mc = rs.reduce((s, r) => s + (r.confidence ?? 0), 0) / (n || 1);
  console.log(`${label.padEnd(14)} n=${String(n).padStart(4)}  accuracy ${pct(right, n).padStart(7)}  ` +
    `mean confidence ${mc.toFixed(3)}  |  >=0.9 fired ${String(gated.length).padStart(4)}/${n} ` +
    `(${pct(gated.length, n).padStart(6)}), of which correct ${pct(gRight, gated.length)}`);
  return { n, right, accuracy: n ? right / n : null, meanConfidence: mc,
    gated: gated.length, gatedCorrect: gRight, gatedAccuracy: gated.length ? gRight / gated.length : null };
}

const det = rows.filter((r) => r.determinate);
const pre = rows.filter((r) => !r.determinate);
console.log(`\nsource: ${rows[0]?.source || 'none'}   model answered ${rows.length} probes over ${call} calls\n`);
const summary = { determinate: summarise('DETERMINATE', det), predictive: summarise('PREDICTIVE', pre) };

console.log('\nper probe:');
const byId = {};
for (const r of rows) (byId[r.id] ||= []).push(r);
for (const id of Object.keys(byId)) {
  const rs = byId[id];
  const g = rs.filter((r) => r.confidence >= 0.9).length;
  console.log(`  ${id.padEnd(22)} n=${String(rs.length).padStart(3)}  ` +
    `acc ${pct(rs.filter((r) => r.correct).length, rs.length).padStart(7)}  ` +
    `conf ${(rs.reduce((s, r) => s + r.confidence, 0) / rs.length).toFixed(3)}  >=0.9 ${String(g).padStart(3)}`);
  summary[id] = { n: rs.length, correct: rs.filter((r) => r.correct).length, gated: g };
}

console.log('\nconfidence distribution (determinate | predictive):');
for (const [lo, hi] of [[0, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 0.99], [0.99, 1.01]]) {
  const d = det.filter((r) => r.confidence >= lo && r.confidence < hi);
  const p = pre.filter((r) => r.confidence >= lo && r.confidence < hi);
  console.log(`  ${lo.toFixed(2)}-${hi.toFixed(2)}  ${String(d.length).padStart(4)} (${pct(d.filter((x) => x.correct).length, d.length).padStart(7)})` +
    ` | ${String(p.length).padStart(4)} (${pct(p.filter((x) => x.correct).length, p.length).padStart(7)})`);
}

// ------------------------------------------- the self-check, the point ----
const haveRows = rows.filter((r) => Number.isFinite(r.have));
if (haveRows.length) {
  const hd = haveRows.filter((r) => r.determinate), hp = haveRows.filter((r) => !r.determinate);
  const mh = (rs) => rs.reduce((s, r) => s + r.have, 0) / (rs.length || 1);
  console.log('\nTHE SELF-CHECK — "does the state contain what this needs?", same call:');
  console.log(`  determinate  mean p(have) ${mh(hd).toFixed(3)}   over 0.5: ${pct(hd.filter((r) => r.have > 0.5).length, hd.length)}`);
  console.log(`  predictive   mean p(have) ${mh(hp).toFixed(3)}   over 0.5: ${pct(hp.filter((r) => r.have > 0.5).length, hp.length)}`);
  console.log(`  MARGIN ${((mh(hd) - mh(hp)) * 100).toFixed(1)} points ` +
    `(answer-confidence margin was ${((summary.determinate.meanConfidence - summary.predictive.meanConfidence) * 100).toFixed(1)})`);

  // What a router built on each signal would actually do. This is the number
  // that decides whether the primitive is usable here.
  const route = (label, keep) => {
    const kept = haveRows.filter(keep), sent = haveRows.filter((r) => !keep(r));
    const badKept = kept.filter((r) => !r.determinate).length;
    console.log(`  ${label.padEnd(26)} keeps ${String(kept.length).padStart(4)} ` +
      `(acc ${pct(kept.filter((r) => r.correct).length, kept.length).padStart(7)}), ` +
      `escalates ${String(sent.length).padStart(4)}  |  predictive wrongly KEPT: ${badKept}`);
    return { kept: kept.length, keptCorrect: kept.filter((r) => r.correct).length, predictiveKept: badKept };
  };
  summary.routing = {
    confidence: route('gate on confidence>=0.9', (r) => r.confidence >= 0.9),
    selfCheck: route('gate on p(have)>0.5', (r) => r.have > 0.5),
    both: route('gate on both', (r) => r.confidence >= 0.9 && r.have > 0.5),
  };
  summary.selfCheck = { determinate: mh(hd), predictive: mh(hp), margin: mh(hd) - mh(hp) };
}

if (OUT) { writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), interval: INTERVAL,
  window: W, universe: UNIVERSE, summary, rows }, null, 1)); console.log(`\nwrote ${OUT}`); }
