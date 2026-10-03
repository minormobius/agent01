// eval/plans-replay.mjs — re-score a recorded run without calling anything.
//
//   node mega/jev/eval/plans-replay.mjs mega/jev/lab/plans-jev-forced.jsonl [--no-wait] [--out file.json]
//
// A run's .jsonl holds every pick with the bar it was made on. The walk is
// deterministic given the picks, so replaying them reproduces the run plan for
// plan, and lets the scoring change (or a harness change be tested) offline:
// the model held fixed, only the harness varied. Prints each tape's tally,
// the pooled total, and the null (random picks from the same menu, 30 seeds).
import { readFileSync, writeFileSync } from 'node:fs';
import { walk, DECIDERS } from '../lab/plans.mjs';
import { loadTape, toBars } from '../lab/tape.mjs';

const file = process.argv[2];
const noWait = process.argv.includes('--no-wait');
const outI = process.argv.indexOf('--out'), out = outI > 0 ? process.argv[outI + 1] : null;
const recs = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const menu = noWait ? (o) => (o.length > 1 ? o.filter((x) => x.key !== 'wait') : o) : undefined;
const report = { file, noWait, tapes: {}, pooled: {} };
let net = 0, gross = 0, trades = 0, nullMean = 0, nullVar = 0, T = 0, R = 0, coinT = 0;
for (const coin of [...new Set(recs.map((r) => r.coin))]) {
  const bars = toBars(await loadTape(coin));
  const at = new Map(recs.filter((r) => r.coin === coin).map((r) => [r.i, r.chose]));
  let missing = 0;
  const r = await walk(bars, (opts, st, { i }) => { if (!at.has(i)) { missing++; return 'wait'; } return at.get(i); }, { menu, record: false });
  const nulls = [];
  for (let s = 1; s <= 30; s++) nulls.push((await walk(bars, DECIDERS.random(s), { menu, record: false })).net_bp);
  const m = nulls.reduce((a, b) => a + b, 0) / 30, sd = Math.sqrt(nulls.reduce((a, b) => a + (b - m) ** 2, 0) / 29);
  const { plans, ...t } = r;
  report.tapes[coin] = { ...t, random_same_menu: { mean_net_bp: +m.toFixed(1), sd_net_bp: +sd.toFixed(1), z: +((t.net_bp - m) / sd).toFixed(2) }, unreplayed: missing };
  net += t.net_bp; gross += t.gross_bp; trades += t.trades; nullMean += m; nullVar += sd * sd;
  if (t.hit_rate != null) { T += t.hit_rate * t.resolved; R += t.resolved; coinT += (t.coin_flip_hit_rate ?? 0) * t.resolved; }
  console.log(`${coin}: net ${t.net_bp} (gross ${t.gross_bp}, t ${t.t_gross}) over ${t.trades} trades; hit ${t.hit_rate} (coin flip ${t.coin_flip_hit_rate}, n ${t.resolved}); random same menu ${m.toFixed(0)} ± ${sd.toFixed(0)}, z ${report.tapes[coin].random_same_menu.z}${missing ? `; ${missing} decisions not in the record` : ''}`);
}
const hit = R ? T / R : null, coin = R ? coinT / R : null;
report.pooled = { net_bp: +net.toFixed(1), gross_bp: +gross.toFixed(1), trades, random_same_menu: { mean_net_bp: +nullMean.toFixed(1), sd_net_bp: +Math.sqrt(nullVar).toFixed(1), z: +((net - nullMean) / Math.sqrt(nullVar)).toFixed(2) },
  hit_rate: hit && +hit.toFixed(3), coin_flip_hit_rate: coin && +coin.toFixed(3), resolved: R, hit_z: R ? +((hit - coin) / Math.sqrt(coin * (1 - coin) / R)).toFixed(2) : null };
console.log('pooled', JSON.stringify(report.pooled));
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
