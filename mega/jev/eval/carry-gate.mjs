// carry-gate.mjs — the risk monitor, measured.
//
// Same design as cross-gate: determinate and predictive probes in ONE call
// against ONE document, ground truth computed, self-check riding along. The
// question is whether carry — the first signal on this surface that is
// OBSERVED rather than forecast — behaves like the determinate arm.
//
//   node mega/jev/eval/carry-gate.mjs [--windows 30] [--out path]
import { writeFileSync } from 'node:fs';
import { carryStats, rankCarry, carryDoc, buildCarryProbes, carryTruth,
  positionRisk, toAnnualPct } from '../lab/carry.mjs';
import { readAnswer } from '../lab/cross.mjs';

const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const UNIVERSE = ['BTC', 'ETH', 'SOL', 'HYPE', 'UNI', 'ARB', 'XMR'];
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('windows', 30));
const OUT = arg('out', null);
const SPACING_MS = 2400;   // the proxy allows 30/min per IP
const LOOKBACK_H = 24 * 90;
const FORWARD_H = 24;      // the predictive arm's horizon

const post = async (b) => {
  const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  if (!r.ok) throw new Error(`hyperliquid ${r.status}`);
  return r.json();
};

// Hyperliquid returns the FIRST 500 prints from startTime, so pagination walks
// FORWARD. Walking backwards silently returns the OLDEST window and reports
// months-old funding as current — which is exactly what it did on the first
// attempt at this measurement.
async function fundingHistory(coin, hours) {
  const out = new Map();
  let s = Date.now() - hours * 3600_000;
  for (let i = 0; i < 24; i++) {
    const h = await post({ type: 'fundingHistory', coin, startTime: s, endTime: Date.now() });
    if (!h?.length) break;
    let fresh = 0;
    for (const x of h) if (!out.has(x.time)) { out.set(x.time, Number(x.fundingRate)); fresh++; }
    if (!fresh) break;
    s = h[h.length - 1].time + 1;
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]);
}

const ask = async (state, questions) => {
  const r = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
  const b = await r.json();
  if (!r.ok) throw new Error(`jev ${r.status}: ${JSON.stringify(b).slice(0, 180)}`);
  return b;
};

const series = {};
for (const c of UNIVERSE) series[c] = await fundingHistory(c, LOOKBACK_H);
const len = Math.min(...UNIVERSE.map((c) => series[c].length));
console.log(`${len} hourly funding prints per asset across ${UNIVERSE.length} assets ` +
  `(${(len / 24).toFixed(0)} days)\n`);

// Non-overlapping evaluation points: each needs its own trailing history and a
// forward window that no document ever sees.
const first = Math.floor(len * 0.3);
const usable = len - FORWARD_H - first;
const stride = Math.max(FORWARD_H, Math.floor(usable / N));
const points = [];
for (let i = first; i + FORWARD_H < len; i += stride) points.push(i);
console.log(`${points.length} evaluation points, stride ${stride}h, ${FORWARD_H}h forward window\n`);

const rows = [];
let call = 0;
for (const i of points.slice(0, N)) {
  const stats = {}, forward = {};
  for (const c of UNIVERSE) {
    const hist = series[c].slice(0, i).map((x) => x[1]);
    const cur = series[c][i][1];
    stats[c] = carryStats(hist, { current: cur });
    const fwd = series[c].slice(i, i + FORWARD_H).map((x) => x[1]);
    forward[c] = fwd.length ? toAnnualPct(fwd.reduce((a, b) => a + b, 0) / fwd.length) : NaN;
  }
  const rank = rankCarry(stats);
  if (!rank) continue;
  const truth = carryTruth(rank, forward);
  const probes = buildCarryProbes(rank, { selfCheck: true });
  // The position example uses SOL, not whichever asset happens to be richest.
  // A delta-neutral basis trade needs a spot leg you can actually hold, and
  // the richest funding is usually richest BECAUSE its spot leg is hard to
  // source — XMR pays 100%+ precisely because you cannot easily be long it.
  // Pairing XMR funding with a Solana staking yield would be an incoherent
  // position dressed up as an example.
  const solRow = rank.rows.find((r) => r.coin === 'SOL') || rank.rows[0];
  const pos = positionRisk({ fundingPct: solRow.currentPct, spotYieldPct: 4.86, leverage: 3 });
  const doc = carryDoc(rank, { position: pos });

  if (call++) await new Promise((r) => setTimeout(r, SPACING_MS));
  let reply;
  try { reply = await ask(doc, probes); }
  catch (e) { console.error(`  point ${i}: ${e.message}`); continue; }

  for (const id of Object.keys(probes)) {
    if (id.startsWith('have__')) continue;
    const { value, confidence } = readAnswer(reply.answers?.[id]);
    if (value === null || truth[id] === undefined || truth[id] === null) continue;
    const sc = reply.answers?.[`have__${id}`];
    rows.push({ i, id, determinate: id.startsWith('d_'), value, truth: truth[id],
      correct: value === truth[id], confidence,
      have: typeof sc?.noul === 'number' ? sc.noul : null, source: reply.source });
  }
  if (call % 6 === 0) process.stdout.write(`  ${call} points\n`);
}

const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—');
const summarise = (label, rs) => {
  const g = rs.filter((r) => r.confidence >= 0.9);
  console.log(`${label.padEnd(14)} n=${String(rs.length).padStart(4)}  accuracy ${pct(rs.filter((r) => r.correct).length, rs.length).padStart(7)}  ` +
    `mean conf ${(rs.reduce((s, r) => s + (r.confidence ?? 0), 0) / (rs.length || 1)).toFixed(3)}  |  ` +
    `>=0.9 fired ${String(g.length).padStart(3)}/${rs.length} (${pct(g.length, rs.length).padStart(6)}), right ${pct(g.filter((r) => r.correct).length, g.length)}`);
  return { n: rs.length, correct: rs.filter((r) => r.correct).length, gated: g.length,
    gatedCorrect: g.filter((r) => r.correct).length,
    meanConfidence: rs.reduce((s, r) => s + (r.confidence ?? 0), 0) / (rs.length || 1) };
};

const det = rows.filter((r) => r.determinate), pre = rows.filter((r) => !r.determinate);
console.log(`\nsource: ${rows[0]?.source || 'none'}   ${rows.length} probes over ${call} calls\n`);
const summary = { determinate: summarise('DETERMINATE', det), predictive: summarise('PREDICTIVE', pre) };

console.log('\nper probe:');
const by = {};
for (const r of rows) (by[r.id] ??= []).push(r);
for (const id of Object.keys(by)) {
  const rs = by[id];
  console.log(`  ${id.padEnd(22)} n=${String(rs.length).padStart(3)}  acc ${pct(rs.filter((r) => r.correct).length, rs.length).padStart(7)}  ` +
    `conf ${(rs.reduce((s, r) => s + r.confidence, 0) / rs.length).toFixed(3)}  ` +
    `p(have) ${(rs.reduce((s, r) => s + (r.have ?? 0), 0) / rs.length).toFixed(3)}`);
  summary[id] = { n: rs.length, correct: rs.filter((r) => r.correct).length,
    gated: rs.filter((r) => r.confidence >= 0.9).length };
}

const hv = rows.filter((r) => Number.isFinite(r.have));
if (hv.length) {
  const hd = hv.filter((r) => r.determinate), hp = hv.filter((r) => !r.determinate);
  const mh = (rs) => rs.reduce((s, r) => s + r.have, 0) / (rs.length || 1);
  console.log('\nTHE SELF-CHECK, same call:');
  console.log(`  determinate  mean p(have) ${mh(hd).toFixed(3)}   over 0.5: ${pct(hd.filter((r) => r.have > 0.5).length, hd.length)}`);
  console.log(`  predictive   mean p(have) ${mh(hp).toFixed(3)}   over 0.5: ${pct(hp.filter((r) => r.have > 0.5).length, hp.length)}`);
  console.log(`  MARGIN ${((mh(hd) - mh(hp)) * 100).toFixed(1)} points (answer-confidence margin ${((summary.determinate.meanConfidence - summary.predictive.meanConfidence) * 100).toFixed(1)})`);
  const route = (label, keep) => {
    const k = hv.filter(keep);
    console.log(`  ${label.padEnd(24)} keeps ${String(k.length).padStart(3)} (acc ${pct(k.filter((r) => r.correct).length, k.length).padStart(7)})  predictive wrongly kept: ${k.filter((r) => !r.determinate).length}`);
    return { kept: k.length, correct: k.filter((r) => r.correct).length, predictiveKept: k.filter((r) => !r.determinate).length };
  };
  summary.routing = { confidence: route('confidence>=0.9', (r) => r.confidence >= 0.9),
    selfCheck: route('p(have)>0.5', (r) => r.have > 0.5),
    both: route('both', (r) => r.confidence >= 0.9 && r.have > 0.5) };
  summary.selfCheck = { determinate: mh(hd), predictive: mh(hp), margin: mh(hd) - mh(hp) };
}

if (OUT) { writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(),
  universe: UNIVERSE, lookbackHours: LOOKBACK_H, forwardHours: FORWARD_H, summary, rows }, null, 1));
  console.log(`\nwrote ${OUT}`); }
