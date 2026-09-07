/* ken/lab/simulate.selftest.mjs — known answers for the simulator.

   The bimodality coefficient has exact large-n reference values (1/3 for a
   normal, 5/9 for a uniform, 1 for two points), which makes it testable
   without trusting the generator. The generator is checked separately for
   determinism and for recovering moments it was given. */
import {
  mulberry32, normalDeviate, simulateRandomEffects, simulateBimodal,
  bimodalityCoefficient, BC_NORMAL, BC_UNIFORM,
  iccSamplingDistribution, allocationCheck, bimodalityPower,
} from './simulate.mjs';
import { varianceComponents } from './design.mjs';

let checks = 0, failures = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.error(`  ✗ ${m}`); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b}±${tol})`);
const throws = (fn, m) => { checks++; try { fn(); failures++; console.error(`  ✗ ${m} (did not throw)`); } catch {} };
const section = (t) => console.log(`\n${t}`);

// ── determinism ───────────────────────────────────────────────────────
section('determinism');
{
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const seqA = Array.from({ length: 6 }, () => a());
  const seqB = Array.from({ length: 6 }, () => b());
  const seqC = Array.from({ length: 6 }, () => c());
  ok(JSON.stringify(seqA) === JSON.stringify(seqB), 'the same seed gives the same sequence');
  ok(JSON.stringify(seqA) !== JSON.stringify(seqC), 'a different seed gives a different sequence');
  ok(seqA.every((x) => x >= 0 && x < 1), 'draws lie in [0, 1)');
}
{
  const g1 = simulateRandomEffects({ tasks: 4, repeats: 3, betweenVar: 1, withinVar: 1, rng: mulberry32(9) });
  const g2 = simulateRandomEffects({ tasks: 4, repeats: 3, betweenVar: 1, withinVar: 1, rng: mulberry32(9) });
  ok(JSON.stringify(g1) === JSON.stringify(g2), 'simulated data is reproducible from its seed');
  ok(g1.length === 4 && g1[0].length === 3, 'shape is tasks × repeats');
}

// ── the generator reproduces the moments it was given ─────────────────
section('generator moments');
{
  const rng = mulberry32(1234);
  const xs = Array.from({ length: 40000 }, () => normalDeviate(rng));
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;
  near(m, 0, 0.02, 'normal deviates have mean 0');
  near(v, 1, 0.03, 'normal deviates have variance 1');
}
{
  // a large draw should recover the variance components it was built from
  const g = simulateRandomEffects({ tasks: 400, repeats: 8, betweenVar: 3, withinVar: 1, rng: mulberry32(77) });
  const vc = varianceComponents(g);
  near(vc.withinVar, 1, 0.1, 'large-sample σ²_within is recovered');
  near(vc.betweenVar, 3, 0.5, 'large-sample σ²_between is recovered');
  near(vc.icc, 0.75, 0.05, 'large-sample ICC is recovered');
}
{
  const g = simulateRandomEffects({ tasks: 300, repeats: 6, betweenVar: 0, withinVar: 1, rng: mulberry32(5) });
  ok(varianceComponents(g).icc < 0.05, 'ICC is near zero when no task effect was generated');
}

// ── Sarle's coefficient, against exact reference values ───────────────
section('bimodality coefficient');
{
  // two-point distribution: skew 0, excess kurtosis −2 → BC → 1
  const two = Array.from({ length: 2000 }, (_, i) => (i % 2 ? 1 : -1));
  near(bimodalityCoefficient(two), 1, 0.01, 'a two-point distribution gives BC ≈ 1');
  // discrete uniform: excess kurtosis → −1.2 → BC → 5/9
  const uni = Array.from({ length: 4000 }, (_, i) => i / 3999);
  near(bimodalityCoefficient(uni), BC_UNIFORM, 0.01, 'a uniform gives BC ≈ 5/9, the conventional threshold');
  // normal: skew 0, excess kurtosis 0 → BC → 1/3
  const rng = mulberry32(2024);
  const norm = Array.from({ length: 60000 }, () => normalDeviate(rng));
  near(bimodalityCoefficient(norm), BC_NORMAL, 0.02, 'a normal gives BC ≈ 1/3');
  ok(bimodalityCoefficient(two) > BC_UNIFORM && bimodalityCoefficient(norm) < BC_UNIFORM,
     'the threshold separates the two-point case from the normal case');
  throws(() => bimodalityCoefficient([1, 2, 3]), 'fewer than four values is rejected');
  throws(() => bimodalityCoefficient([2, 2, 2, 2]), 'zero variance is rejected');
}

// ── the ICC sampling distribution behaves ─────────────────────────────
section('icc sampling distribution');
{
  const small = iccSamplingDistribution({ tasks: 8, repeats: 3, trueIcc: 0.5, trials: 400, seed: 2 });
  const large = iccSamplingDistribution({ tasks: 64, repeats: 3, trueIcc: 0.5, trials: 400, seed: 2 });
  ok(small.width > large.width, 'a larger pilot gives a narrower interval on ICC');
  ok(small.lo >= 0 && small.hi <= 1, 'ICC estimates stay in [0, 1]');
  ok(large.width > 0, 'the interval has positive width');
  near(large.median, 0.5, 0.12, 'a large pilot centres near the true ICC');
  const zero = iccSamplingDistribution({ tasks: 8, repeats: 3, trueIcc: 0, trials: 400, seed: 4 });
  ok(zero.atZero > 0.3, 'at a true ICC of zero the clamped estimator piles up at zero');
}

// ── the allocation prediction, checked against draws ──────────────────
section('allocation, empirically');
{
  const a = allocationCheck({ budget: 48, betweenVar: 0.5, withinVar: 0.5, trials: 800, seed: 5 });
  ok(a.bestRepeats === 1, `simulated draws agree that 1 repeat minimises the SE (got ${a.bestRepeats})`);
  for (const r of a.rows) {
    near(r.empiricalSe, r.predictedSe, 0.03,
      `predicted and empirical SE agree at ${r.repeats} repeat(s)`);
  }
}

// ── bimodality power responds to separation ───────────────────────────
section('bimodality power');
{
  const wide = bimodalityPower({ tasks: 8, repeats: 3, gap: 4, noise: 0.3, trials: 300, seed: 8 });
  const none = bimodalityPower({ tasks: 8, repeats: 3, gap: 0, noise: 1, trials: 300, seed: 8 });
  ok(wide.power > none.power, 'a well-separated bimodal process is flagged more often than an unseparated one');
  ok(none.power < 0.5, 'a unimodal process is not routinely flagged as bimodal');
  ok(wide.runs === 24, 'run count is tasks × repeats');
}

console.log('');
if (failures) { console.error(`✗ simulator FAILED — ${failures} of ${checks} checks`); process.exit(1); }
console.log(`✓ simulator passed — ${checks} known-answer checks`);
