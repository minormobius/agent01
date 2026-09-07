/* ken/lab/factorial.selftest.mjs + bt — machinery on constructed inputs, then
   the findings pinned to the committed bake-off results. */
import { loadBakeoff, factorialAnova, permuteF, cellComponents, contrastSensitivity } from './factorial.mjs';
import { fitBradleyTerry, swapRate, tally, connected } from './bt.mjs';
import { varianceComponents } from './design.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
let checks = 0, failures = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.error(`  ✗ ${m}`); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b}±${tol})`);
const throws = (fn, m) => { checks++; try { fn(); failures++; console.error(`  ✗ ${m} (did not throw)`); } catch {} };
const section = (t) => console.log(`\n${t}`);

// ── Bradley–Terry machinery ───────────────────────────────────────────
section('bradley-terry machinery');
{
  // a strict order with every pair played once each way must recover that order
  const items = ['a', 'b', 'c', 'd'];
  const v = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      v.push({ first: items[i], second: items[j], winner: items[i] });
      v.push({ first: items[j], second: items[i], winner: items[i] });
    }
  }
  throws(() => fitBradleyTerry(v), 'a strict order has no MLE and the guard says so');
  const fit = fitBradleyTerry(v, { prior: 0.5 });
  ok(fit.map((r) => r.item).join('') === 'abcd', `the regularised fit recovers the order (got ${fit.map((r) => r.item).join('')})`);
  ok(fit[0].theta > fit[3].theta, 'and orders theta accordingly');
}
{
  // perfect symmetry: everyone splits with everyone
  const v = [];
  for (const [a, b] of [['x', 'y'], ['y', 'z'], ['x', 'z']]) {
    v.push({ first: a, second: b, winner: a }, { first: b, second: a, winner: b });
  }
  const fit = fitBradleyTerry(v, { prior: 0.5 });
  near(Math.max(...fit.map((r) => r.theta)), 0, 1e-6, 'a perfectly balanced set gives theta 0 for all');
  near(swapRate(v).rate, 1, 1e-12, 'and a swap rate of 1');
}
{
  const disconnected = [
    { first: 'p', second: 'q', winner: 'p' }, { first: 'r', second: 's', winner: 'r' },
  ];
  throws(() => fitBradleyTerry(disconnected, { prior: 0.5 }), 'a disconnected graph is refused');
  ok(connected(tally(disconnected)) === false, 'and reported as disconnected');
}
ok(swapRate([{ first: 'a', second: 'b', winner: 'a' }, { first: 'b', second: 'a', winner: 'a' }]).flipped === 0,
   'a consistent pair does not count as flipped');

// ── factorial machinery ───────────────────────────────────────────────
section('factorial machinery');
{
  // a pure model effect, no harness effect, no noise
  const rows = [];
  for (const race of ['race-01', 'race-02'])
    for (const harness of ['claude', 'opencode'])
      for (const [model, sec] of [['kimi3', 100], ['ds4-flash', 200], ['ds4-pro', 400]])
        rows.push({ race, harness, model, cell: `${harness}|${model}`, seconds: sec, patchBytes: 1000, patchValid: true });
  const a = factorialAnova(rows, { outcome: 'seconds' });
  const t = Object.fromEntries(a.table.map((r) => [r.term, r]));
  near(t.harness.ss, 0, 1e-12, 'no harness effect is recovered as zero sum of squares');
  near(t['harness × model'].ss, 0, 1e-12, 'and no interaction');
  ok(t.model.ss > 0, 'the model effect is non-zero');
  near(a.residual.ss, 0, 1e-12, 'noiseless data leaves no residual');
}

// ── the committed bake-off ────────────────────────────────────────────
section('the committed bake-off');
const rows = loadBakeoff();
ok(rows.length === 23, `23 entries across both races (got ${rows.length})`);
ok(rows.filter((r) => !r.patchValid).length === 2, 'two patch records are flagged as collection failures');

const dur = factorialAnova(rows, { outcome: 'seconds' });
const perm = permuteF(rows, { outcome: 'seconds', perms: 5000, seed: 909 });
const term = (n) => dur.table.find((r) => r.term === n);
const pOf = (n) => perm.find((r) => r.term === n).p;
near(term('model').F, 8.80, 0.02, 'model F is 8.80');
near(pOf('model'), 0.001, 0.0015, 'at permutation p 0.001');
near(term('harness').F, 0.00, 0.005, 'harness F is essentially zero');
ok(pOf('harness') > 0.9, `and its p is not distinguishable from chance (${pOf('harness').toFixed(3)})`);
near(term('harness × model').F, 0.51, 0.02, 'interaction F is 0.51');
ok(dur.residual.df === 16, `16 residual degrees of freedom (got ${dur.residual.df})`);
near(dur.residual.sd, 0.378, 0.001, 'residual SD 0.378 in log seconds');
near(Math.exp(dur.residual.sd), 1.46, 0.005, 'a run-to-run factor of 1.46');
near(contrastSensitivity(dur).detectableRatio, 2.88, 0.01, 'smallest resolvable cell ratio 2.88x');
near(cellComponents(rows, { outcome: 'seconds' }).pooled.icc, 0.436, 0.002, 'duration ICC by cell 0.436');

// ── the judging pass ──────────────────────────────────────────────────
section('the judging pass');
const jd = JSON.parse(readFileSync(join(HERE, 'judging', 'race-02.verdicts.json'), 'utf8'));
const key = JSON.parse(readFileSync(join(HERE, 'judging', 'race-02.mapping.json'), 'utf8')).map;
ok(jd.verdicts.length === 56, `56 verdicts (got ${jd.verdicts.length})`);
const sw = swapRate(jd.verdicts);
ok(sw.pairsShownBothWays === 28, `28 pairs shown both ways (got ${sw.pairsShownBothWays})`);
ok(sw.flipped === 5 && Math.round(sw.rate * 100) === 18, `5 flips, 18% (got ${sw.flipped}, ${Math.round(sw.rate * 100)}%)`);
throws(() => fitBradleyTerry(jd.verdicts), 'the plain MLE is refused on this data');

const fit = fitBradleyTerry(jd.verdicts, { prior: 0.5 });
ok(fit.length === 12, '12 entries ranked');
const spread = fit[0].theta - fit[fit.length - 1].theta;
near(spread, 2.63, 0.02, 'the scale spans 2.63 log-odds');
const meanSe = fit.filter((r) => r.se > 0).reduce((a, r) => a + r.se, 0) / fit.filter((r) => r.se > 0).length;
ok(meanSe > 0.8 && meanSe < 1.1, `mean SE is about 0.9 (got ${meanSe.toFixed(2)})`);
ok(spread / meanSe < 3, 'so the whole scale is under three standard errors wide');

const byCell = {};
for (const r of fit) {
  const [h, m] = key[r.item].split('__');
  (byCell[`${h}|${m}`] ||= []).push(r.theta);
}
ok(Object.keys(byCell).length === 6 && Object.values(byCell).every((v) => v.length === 2),
   'six cells, two samples each');
const q = varianceComponents(Object.values(byCell));
near(q.icc, 0.413, 0.002, 'ICC of judged quality by cell is 0.413');
near(Math.sqrt(q.withinVar), 0.710, 0.002, 'within-cell SD 0.710');
ok(q.icc > 0 && q.icc < 1, 'and it is a proper fraction');

console.log('');
if (failures) { console.error(`✗ factorial + BT FAILED — ${failures} of ${checks} checks`); process.exit(1); }
console.log(`✓ factorial + bradley-terry passed — ${checks} checks`);
