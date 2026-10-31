// eval/plans-search.mjs — the registered strategy search (lab/plans-search-prereg.json).
//
//   node mega/jev/eval/plans-search.mjs [--out mega/jev/lab/plans-search.json]
//
// Mechanical: every number that decides anything comes from the registration.
// 18 configurations; selection on the dev assets over the dev period; each
// survivor confirmed (or not) on the dev assets over the validation period AND
// on the holdout assets over the validation period. No model calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTape, toBars } from '../lab/tape.mjs';
import { FAMILIES, GRID, label, runStrategy, tNet, costsFor } from '../lab/strategies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REG = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-search-prereg.json'), 'utf8'));
const outI = process.argv.indexOf('--out'), out = outI > 0 ? process.argv[outI + 1] : null;
const DEV = REG.data.dev_assets, HOLD = REG.data.holdout_assets;
const WARM = 200, SPLIT = 3000, END = 5000;
if (GRID.length !== REG.trials) throw new Error('grid does not match the registration');

const tapes = {};
for (const c of [...DEV, ...HOLD]) { const b = toBars(await loadTape(c, { interval: '4h' })); tapes[c] = Object.assign(b.slice(0, END), { barMin: b.barMin }); }
const span = (c, a, z) => `${new Date(tapes[c][a].t).toISOString().slice(0, 10)}→${new Date(tapes[c][z - 1].t).toISOString().slice(0, 10)}`;

// run one configuration over a set of assets and a bar window
function evaluate(g, assets, from, to) {
  const sig = FAMILIES[g.family](g), all = [], per = {};
  for (const c of assets) {
    const plans = runStrategy(tapes[c], sig, { from, to, costs: costsFor(c) });
    per[c] = tNet(plans); all.push(...plans);
  }
  const t = tNet(all), filled = all.filter((p) => p.filled);
  const side = (s) => tNet(filled.filter((p) => p.side === s));
  return { ...t, longs: side(1), shorts: side(-1), gross: +filled.reduce((a, p) => a + p.grossBp, 0).toFixed(1), cost: +filled.reduce((a, p) => a + p.costBp, 0).toFixed(1), bars_held: filled.reduce((a, p) => a + p.exitBar - p.entryBar + 1, 0), per };
}
const buyHold = (assets, from, to) => Object.fromEntries(assets.map((c) => [c, +((tapes[c][to - 1].c / tapes[c][from].o - 1) * 1e4).toFixed(0)]));

const report = { registration: REG.id, ran: new Date().toISOString(), periods: { dev: span('BTC', 0, SPLIT), validation: span('BTC', SPLIT, END) }, dev: {}, survivors: [], confirmation: {} };
const tSel = 2.77;
console.log(`dev ${report.periods.dev} on ${DEV.join(',')} — selection needs net > 0 and t >= ${tSel}\n`);
console.log('config                       trades   net bp  mean/trade     t   longs t  shorts t');
for (const g of GRID) {
  const r = evaluate(g, DEV, WARM, SPLIT);
  report.dev[label(g)] = r;
  const pass = r.net > 0 && r.t != null && r.t >= tSel;
  if (pass) report.survivors.push(label(g));
  console.log(`${label(g).padEnd(28)} ${String(r.n).padStart(6)} ${String(r.net).padStart(8)} ${String(r.mean).padStart(10)} ${String(r.t).padStart(6)} ${String(r.longs.t).padStart(8)} ${String(r.shorts.t).padStart(9)}${pass ? '   SURVIVES' : ''}`);
}
let carry = report.survivors.slice();
if (!carry.length) {
  const best = Object.entries(report.dev).filter(([, r]) => r.t != null).sort((a, b) => b[1].t - a[1].t)[0][0];
  report.failed_selection = true; carry = [best];
  console.log(`\nno configuration survived selection; carrying the best by dev t, ${best}, labelled as failed`);
}
const m = Math.max(1, report.survivors.length), z = { 1: 1.645, 2: 1.96, 3: 2.128, 4: 2.241, 5: 2.326 }[m] ?? 2.5;
console.log(`\nconfirmation (validation ${report.periods.validation}): net > 0 and t >= ${z} on BOTH sets\n`);
for (const name of carry) {
  const g = GRID.find((x) => label(x) === name);
  const a = evaluate(g, DEV, SPLIT, END), b = evaluate(g, HOLD, SPLIT, END), hd = evaluate(g, HOLD, WARM, SPLIT);
  const ok = (r) => r.net > 0 && r.t != null && r.t >= z;
  const confirmed = !report.failed_selection && ok(a) && ok(b);
  report.confirmation[name] = { dev_assets_validation: a, holdout_validation: b, holdout_dev_period_reported_only: hd, confirmed, buy_hold_validation: { dev: buyHold(DEV, SPLIT, END), holdout: buyHold(HOLD, SPLIT, END) } };
  for (const [k, r] of [['dev assets, validation', a], ['holdout assets, validation', b], ['holdout assets, dev period (reported only)', hd]])
    console.log(`${name}  ${k.padEnd(44)} trades ${r.n}  net ${r.net}  mean ${r.mean}  t ${r.t}  (longs t ${r.longs.t}, shorts t ${r.shorts.t})`);
  console.log(`  → ${confirmed ? 'CONFIRMED' : 'not confirmed'}\n`);
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
