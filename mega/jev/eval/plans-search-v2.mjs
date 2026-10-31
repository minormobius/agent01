// eval/plans-search-v2.mjs — the second registered search (lab/plans-search-prereg-v2.json).
//
//   node mega/jev/eval/plans-search-v2.mjs [--out mega/jev/lab/plans-search-v2.json]
//
// All 15 assets; selection on the dev period, confirmation on the validation
// period; trades scored in R; the statistic is a t over calendar weeks (each
// week = the sum of R of every trade exiting in it), because 15 crypto assets
// in one week are one bet, not fifteen. And the beta rule: longs and shorts
// must each have mean R >= 0 over both periods together. No model calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTape, toBars } from '../lab/tape.mjs';
import { FAMILIES, GRID, label, runStrategy, costsFor } from '../lab/strategies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REG = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-search-prereg-v2.json'), 'utf8'));
const V1 = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-search-prereg.json'), 'utf8'));
const outI = process.argv.indexOf('--out'), out = outI > 0 ? process.argv[outI + 1] : null;
const ASSETS = [...V1.data.dev_assets, ...V1.data.holdout_assets];
const WARM = 200, SPLIT = 3000, END = 5000, WEEK = 7 * 864e5;
if (GRID.length !== 18) throw new Error('grid changed since registration');

const tapes = {};
for (const c of ASSETS) { const b = toBars(await loadTape(c, { interval: '4h' })); tapes[c] = Object.assign(b.slice(0, END), { barMin: b.barMin }); }

export function weeklyT(trades) {
  if (trades.length < 2) return { weeks: 0, t: null, sumR: trades.reduce((a, p) => a + p.R, 0) };
  const wk = new Map();
  for (const p of trades) { const w = Math.floor(p.exitT / WEEK); wk.set(w, (wk.get(w) || 0) + p.R); }
  const ws = [...wk.keys()], lo = Math.min(...ws), hi = Math.max(...ws), v = [];
  for (let w = lo; w <= hi; w++) v.push(wk.get(w) || 0);
  const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  return { weeks: v.length, sumR: +(m * v.length).toFixed(2), meanR_week: +m.toFixed(3), t: sd ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null };
}
function trades(g, from, to) {
  const sig = FAMILIES[g.family](g), all = [];
  for (const c of ASSETS) for (const p of runStrategy(tapes[c], sig, { from, to, costs: costsFor(c) })) if (p.filled) all.push({ coin: c, side: p.side, R: p.R, net: p.netBp, exitT: tapes[c][p.exitBar].t, reason: p.reason });
  return all;
}
const meanR = (ts) => (ts.length ? +(ts.reduce((a, p) => a + p.R, 0) / ts.length).toFixed(3) : null);
const summary = (ts) => ({ trades: ts.length, meanR_trade: meanR(ts), ...weeklyT(ts), longs: { n: ts.filter((p) => p.side > 0).length, meanR: meanR(ts.filter((p) => p.side > 0)) }, shorts: { n: ts.filter((p) => p.side < 0).length, meanR: meanR(ts.filter((p) => p.side < 0)) } });

const report = { registration: REG.id, ran: new Date().toISOString(), dev: {}, survivors: [], confirmation: {} };
console.log('config                       trades  meanR/trade  weeks  sumR   weekly t   longs R   shorts R');
for (const g of GRID) {
  const s = summary(trades(g, WARM, SPLIT));
  report.dev[label(g)] = s;
  const pass = s.sumR > 0 && s.t != null && s.t >= 2.77;
  if (pass) report.survivors.push(label(g));
  console.log(`${label(g).padEnd(28)} ${String(s.trades).padStart(6)} ${String(s.meanR_trade).padStart(11)} ${String(s.weeks).padStart(6)} ${String(s.sumR).padStart(6)} ${String(s.t).padStart(9)} ${String(s.longs.meanR).padStart(9)} ${String(s.shorts.meanR).padStart(10)}${pass ? '   SURVIVES' : ''}`);
}
let carry = report.survivors.slice();
if (!carry.length) { carry = [Object.entries(report.dev).filter(([, r]) => r.t != null).sort((a, b) => b[1].t - a[1].t)[0][0]]; report.failed_selection = true; console.log(`\nnothing survived; carrying ${carry[0]} labelled failed`); }
const m = Math.max(1, report.survivors.length), zc = { 1: 1.645, 2: 1.96, 3: 2.128, 4: 2.241, 5: 2.326 }[m] ?? 2.5;
console.log(`\nconfirmation on validation: sumR > 0, weekly t >= ${zc}, and longs and shorts each mean R >= 0 over both periods\n`);
for (const name of carry) {
  const g = GRID.find((x) => label(x) === name);
  const v = trades(g, SPLIT, END), both = [...trades(g, WARM, SPLIT), ...v], sv = summary(v), sb = summary(both);
  const beta = sb.longs.meanR >= 0 && sb.shorts.meanR >= 0;
  const confirmed = !report.failed_selection && sv.sumR > 0 && sv.t != null && sv.t >= zc && beta;
  report.confirmation[name] = { validation: sv, both_periods: sb, beta_rule_passed: beta, confirmed };
  console.log(`${name}: validation ${sv.trades} trades, mean R ${sv.meanR_trade}, weekly t ${sv.t} (longs ${sv.longs.meanR}, shorts ${sv.shorts.meanR}); both periods longs ${sb.longs.meanR}, shorts ${sb.shorts.meanR} → beta rule ${beta ? 'passed' : 'FAILED'} → ${confirmed ? 'CONFIRMED' : 'not confirmed'}`);
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
