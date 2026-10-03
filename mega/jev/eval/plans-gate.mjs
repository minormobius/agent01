// eval/plans-gate.mjs — the trading floor's macros against their controls.
//
//   node mega/jev/eval/plans-gate.mjs [--coins BTC,ETH,SOL] [--seeds 30] [--refresh] [--out mega/jev/lab/plans-gate.json]
//
// No model calls. Every arm walks the same 1-minute tapes with the same engine
// (lab/plans.mjs): decide only when no plan is open, let the plan's own exits
// run. The arms are the measurements the plan menu has to beat:
//   wait        stands aside forever: exactly 0, the bar every arm must clear
//   random      a uniformly random plan at every decision, many seeds: the null
//   fixed:<k>   the same plan every time it is offered
//   bestRecent  the plan with the best trailing record, if that record made money
//   baseline    a hand-written regime script (revert / trail / dip / rip / wait)
// Tapes are cached under lab/fixtures/ (Hyperliquid candleSnapshot; 1m bars go
// back ~3.5-5 days) so a rerun measures the same thing; --refresh refetches.
import { writeFileSync } from 'node:fs';
import { MACROS, DECIDERS, walk } from '../lab/plans.mjs';
import { loadTape, toBars } from '../lab/tape.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const coins = arg('coins', 'BTC,ETH,SOL').split(',');
const nSeeds = +arg('seeds', 30);
const out = arg('out', null), refresh = process.argv.includes('--refresh');

const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v) => { const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1)); };
const pick = (t) => ({ decisions: t.decisions, trades: t.trades, targets: t.targets, stops: t.stops, timeouts: t.timeouts, unfilled: t.unfilled, waits: t.waits, ambiguous: t.ambiguous, net_bp: t.net_bp, gross_bp: t.gross_bp, cost_bp: t.cost_bp, mean_net_bp: t.mean_net_bp, se_bp: t.se_bp, t_gross: t.t_gross, hit_rate: t.hit_rate, coin_flip_hit_rate: t.coin_flip_hit_rate, coin_flip_net_bp: t.coin_flip_net_bp, by_plan: t.by_plan });

const t0 = Date.now();
const report = { ran: new Date().toISOString(), seeds: nSeeds, tapes: {}, arms: {}, pooled: {} };
const ARMS = [
  ['wait', () => DECIDERS.wait, false],
  ...Object.keys(MACROS).filter((k) => k !== 'wait').map((k) => [`fixed:${k}`, () => DECIDERS.fixed(k), false]),
  ['baseline', () => DECIDERS.baseline(), false],
  ['bestRecent', () => DECIDERS.bestRecent(), true],
];
for (const coin of coins) {
  const tape = await loadTape(coin, { refresh });
  const bars = toBars(tape);
  const days = (bars.length - 300) / 1440;
  report.tapes[coin] = { bars: bars.length, from: new Date(bars[0].t).toISOString(), to: new Date(bars.at(-1).t).toISOString(), days: +days.toFixed(2), move_bp: +((bars.at(-1).c / bars[300].c - 1) * 1e4).toFixed(1) };
  const nulls = [];
  for (let s = 1; s <= nSeeds; s++) nulls.push((await walk(bars, DECIDERS.random(s), { record: false })).net_bp);
  report.arms[`random@${coin}`] = { seeds: nSeeds, mean_net_bp: +mean(nulls).toFixed(1), sd_net_bp: +sd(nulls).toFixed(1), min: Math.min(...nulls), max: Math.max(...nulls) };
  for (const [name, make, record] of ARMS) {
    const r = await walk(bars, make(), { record });
    const z = (r.net_bp - mean(nulls)) / Math.max(1e-9, sd(nulls));
    report.arms[`${name}@${coin}`] = { ...pick(r), net_bp_per_day: +(r.net_bp / days).toFixed(1), z_vs_random: +z.toFixed(2) };
  }
  console.log(`${coin}: ${bars.length} bars, ${days.toFixed(1)} days, moved ${report.tapes[coin].move_bp}bp; random ${mean(nulls).toFixed(0)} ± ${sd(nulls).toFixed(0)}bp  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
// pooled across tapes: one row per arm
const names = ['random', ...ARMS.map((a) => a[0])];
for (const n of names) {
  const rows = coins.map((c) => report.arms[`${n}@${c}`]);
  if (n === 'random') { report.pooled[n] = { net_bp: +rows.reduce((a, r) => a + r.mean_net_bp, 0).toFixed(1), sd_bp: +Math.sqrt(rows.reduce((a, r) => a + r.sd_net_bp ** 2, 0)).toFixed(1) }; continue; }
  const trades = rows.reduce((a, r) => a + r.trades, 0), targets = rows.reduce((a, r) => a + r.targets, 0);
  report.pooled[n] = { net_bp: +rows.reduce((a, r) => a + r.net_bp, 0).toFixed(1), gross_bp: +rows.reduce((a, r) => a + r.gross_bp, 0).toFixed(1), cost_bp: +rows.reduce((a, r) => a + r.cost_bp, 0).toFixed(1), trades, target_first: trades ? +(targets / trades).toFixed(3) : null, mean_net_bp: trades ? +(rows.reduce((a, r) => a + r.net_bp, 0) / trades).toFixed(2) : 0 };
  const hr = rows.filter((r) => r.hit_rate != null);
  const tg = rows.reduce((a, r) => a + r.targets, 0), st = rows.reduce((a, r) => a + r.stops, 0);
  report.pooled[n].hit_rate = tg + st ? +(tg / (tg + st)).toFixed(3) : null;
  report.pooled[n].coin_flip_hit_rate = hr.length ? +(hr.reduce((a, r) => a + (r.coin_flip_hit_rate || 0) * (r.targets + r.stops), 0) / Math.max(1, hr.reduce((a, r) => a + r.targets + r.stops, 0))).toFixed(3) : null;
  report.pooled[n].timeouts = rows.reduce((a, r) => a + r.timeouts, 0);
  // gross per trade as a t, pooled from the per-tape standard errors
  const g = rows.filter((r) => r.trades > 1);
  report.pooled[n].t_gross = g.length ? +((g.reduce((a, r) => a + r.gross_bp, 0)) / Math.max(1e-9, Math.sqrt(g.reduce((a, r) => a + (r.trades * (r.gross_bp / r.trades / (r.t_gross || 1e9))) ** 2, 0)))).toFixed(2) : null;
  report.pooled[n].z_vs_random = +((report.pooled[n].net_bp - report.pooled.random.net_bp) / report.pooled.random.sd_bp).toFixed(2);
}
console.log('\narm                      net bp   gross    cost  trades  hit (coin)    t gross  mean/trade  z vs random');
for (const [n, r] of Object.entries(report.pooled)) {
  if (n === 'random') { console.log(`${n.padEnd(22)} ${String(r.net_bp).padStart(8)}  ± ${r.sd_bp} (sd over ${nSeeds} seeds)`); continue; }
  const hit = r.hit_rate == null ? '        -   ' : `${(r.hit_rate * 100).toFixed(0).padStart(3)}% (${r.coin_flip_hit_rate == null ? ' -' : (r.coin_flip_hit_rate * 100).toFixed(0)}%)`;
  console.log(`${n.padEnd(22)} ${String(r.net_bp).padStart(8)} ${String(r.gross_bp).padStart(7)} ${String(r.cost_bp).padStart(7)} ${String(r.trades).padStart(7)}  ${hit.padEnd(11)} ${String(r.t_gross ?? '-').padStart(8)} ${String(r.mean_net_bp).padStart(10)} ${String(r.z_vs_random).padStart(10)}`);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
