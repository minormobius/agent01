// eval/plans-search-v3.mjs — the third registered search (lab/plans-search-prereg-v3.json):
// six market-neutral cross-sectional books. No model calls.
//
//   node mega/jev/eval/plans-search-v3.mjs [--out mega/jev/lab/plans-search-v3.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTape, toBars, loadFunding } from '../lab/tape.mjs';
import { GRID3, label3, runBook, weekly, tWeeks, corr } from '../lab/books.mjs';
import { costsFor } from '../lab/strategies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REG = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-search-prereg-v3.json'), 'utf8'));
const V1 = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-search-prereg.json'), 'utf8'));
const outI = process.argv.indexOf('--out'), out = outI > 0 ? process.argv[outI + 1] : null;
const COINS = [...V1.data.dev_assets, ...V1.data.holdout_assets];
const WARM = 200, SPLIT = 3000, END = 5000;
if (GRID3.length !== REG.trials) throw new Error('grid does not match the registration');

const tapes = {}, funds = {}, costBps = {};
for (const c of COINS) {
  const b = toBars(await loadTape(c, { interval: '4h' }));
  tapes[c] = Object.assign(b.slice(0, END), { barMin: b.barMin });
  funds[c] = (await loadFunding(c, b)).slice(0, END);
  const k = costsFor(c); costBps[c] = k.takerBps + k.halfSpreadBps;
}
const t0 = tapes.BTC[0].t;
for (const c of COINS) if (tapes[c][0].t !== t0 || tapes[c].length !== END) throw new Error(`${c} is not aligned with BTC`);
// the equal-weight market, per bar, for the beta rule
const market = (from, to) => { const rows = []; for (let i = from; i < to; i++) rows.push({ t: tapes.BTC[i].t, ret: COINS.reduce((a, c) => a + (tapes[c][i].c / tapes[c][i - 1].c - 1) * 1e4, 0) / COINS.length }); return rows; };
const run = (g, from, to) => { const rows = runBook(tapes, funds, COINS, g, { from, to, costBps }); const wk = weekly(rows); return { rows, wk, stats: tWeeks(wk.map((x) => x[1])), parts: { gross: +rows.reduce((a, r) => a + r.gross, 0).toFixed(0), funding: +rows.reduce((a, r) => a + r.funding, 0).toFixed(0), cost: +rows.reduce((a, r) => a + r.cost, 0).toFixed(0) } }; };
const betaCorr = (wk, from, to) => { const mk = new Map(weekly(market(from, to))); const k = wk.filter(([w]) => mk.has(w)); return corr(k.map((x) => x[1]), k.map(([w]) => mk.get(w))); };

const report = { registration: REG.id, ran: new Date().toISOString(), dev: {}, survivors: [], confirmation: {} };
console.log('book                            weeks  bp/week     t   total bp   (gross / funding / costs)');
for (const g of GRID3) {
  const r = run(g, WARM, SPLIT);
  report.dev[label3(g)] = { ...r.stats, parts: r.parts };
  const pass = r.stats.mean_bp_week > 0 && r.stats.t >= 2.39;
  if (pass) report.survivors.push(label3(g));
  console.log(`${label3(g).padEnd(31)} ${String(r.stats.weeks).padStart(5)} ${String(r.stats.mean_bp_week).padStart(8)} ${String(r.stats.t).padStart(5)} ${String(r.stats.total_bp).padStart(10)}   (${r.parts.gross} / ${r.parts.funding} / ${r.parts.cost})${pass ? '   SURVIVES' : ''}`);
}
let carry = report.survivors.slice();
if (!carry.length) { carry = [Object.entries(report.dev).sort((a, b) => b[1].t - a[1].t)[0][0]]; report.failed_selection = true; console.log(`\nnothing survived; carrying ${carry[0]} labelled failed`); }
const m = Math.max(1, report.survivors.length), zc = { 1: 1.645, 2: 1.96, 3: 2.128, 4: 2.241, 5: 2.326, 6: 2.394 }[m];
console.log(`\nconfirmation on validation: mean > 0, t >= ${zc}, |corr with the market| < 0.3 over both periods\n`);
for (const name of carry) {
  const g = GRID3.find((x) => label3(x) === name);
  const v = run(g, SPLIT, END), all = run(g, WARM, END), c = betaCorr(all.wk, WARM, END);
  const confirmed = !report.failed_selection && v.stats.mean_bp_week > 0 && v.stats.t >= zc && Math.abs(c) < 0.3;
  report.confirmation[name] = { validation: { ...v.stats, parts: v.parts }, both_periods: { ...all.stats, parts: all.parts }, market_corr: c, confirmed };
  console.log(`${name}: validation ${v.stats.weeks} weeks, ${v.stats.mean_bp_week} bp/week, t ${v.stats.t}, total ${v.stats.total_bp}bp (${v.parts.gross} / ${v.parts.funding} / ${v.parts.cost}); corr with market ${c} → ${confirmed ? 'CONFIRMED' : 'not confirmed'}`);
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
