/* ─────────────────────────────────────────────────────────────────────
   ken/lab/design.selftest.mjs — known answers for the design calculator.

   Every assertion here is a value that can be derived by hand or looked up,
   not a snapshot of what the code happened to return. A calculator whose
   only test is its own output is a rubric nobody has watched fail.
   ───────────────────────────────────────────────────────────────────── */
import {
  z, choose, perArm, mde, unpairedTotal, pairedTotal, designComparison,
  varianceComponents, seOfMean, allocate, allocateComparison, pairedComparisonSe, variancePilot,
  ladyTastingTea, permutationTest, sprtBounds, costToDetect,
} from './design.mjs';

let checks = 0, failures = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.error(`  ✗ ${msg}`); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`);
const throws = (fn, msg) => { checks++; try { fn(); failures++; console.error(`  ✗ ${msg} (did not throw)`); } catch { /* expected */ } };
const section = (t) => console.log(`\n${t}`);

// ── z, from published tables ──────────────────────────────────────────
section('normal quantiles');
near(z(0.975), 1.959964, 1e-5, 'z(0.975) is the familiar 1.96');
near(z(0.95), 1.644854, 1e-5, 'z(0.95)');
near(z(0.8), 0.841621, 1e-5, 'z(0.80), the usual power term');
near(z(0.5), 0, 1e-9, 'z(0.50) is zero');
throws(() => z(0), 'z(0) is rejected');
throws(() => z(1), 'z(1) is rejected');

// ── combinatorics ─────────────────────────────────────────────────────
section('combinatorics');
ok(choose(8, 4) === 70, 'C(8,4) = 70, the tea experiment');
ok(choose(6, 3) === 20, 'C(6,3) = 20');
ok(choose(5, 0) === 1 && choose(5, 5) === 1, 'C(n,0) = C(n,n) = 1');
ok(choose(4, 5) === 0, 'C(n,k) = 0 for k > n');

// ── sample size, against the textbook case ────────────────────────────
section('sample size');
// n = 2(1.959964 + 0.841621)² / 0.25 = 62.79 → 63 by normal approximation
const n50 = perArm({ d: 0.5 });
ok(n50 === 63, `d=0.5, α=.05, power=.80 → 63 per arm by normal approximation (got ${n50})`);
ok(perArm({ d: 0.5, exact: true }) === 64, 'the +1 correction gives the t-based 64 quoted in textbooks');
ok(perArm({ d: 1.0 }) === 16, 'd=1.0 → 16 per arm');
ok(perArm({ d: 0.25 }) === 252, 'd=0.25 → 252 per arm');
ok(perArm({ d: 0.5, power: 0.9 }) > n50, 'more power costs more runs');
ok(perArm({ d: 0.5, alpha: 0.01 }) > n50, 'a stricter α costs more runs');
throws(() => perArm({ d: 0 }), 'a zero effect size is rejected');

// halving the effect quadruples the requirement
near(perArm({ d: 0.25 }) / perArm({ d: 0.5 }), 4, 0.05, 'halving d quadruples n');

// ── mde is the inverse ────────────────────────────────────────────────
section('minimum detectable effect');
near(mde({ n: 63 }), 0.5, 0.005, 'mde at n=63 round-trips to d≈0.5');
near(mde({ n: 16 }), 1.0, 0.01, 'mde at n=16 round-trips to d≈1.0');
ok(mde({ n: 10 }) > mde({ n: 100 }), 'fewer runs means only larger effects are detectable');

// ── pairing ───────────────────────────────────────────────────────────
section('pairing');
const cmp0 = designComparison({ d: 0.5, rho: 0 });
near(cmp0.saving, 1, 0.02, 'with ρ=0 pairing saves nothing');
const cmp7 = designComparison({ d: 0.5, rho: 0.7 });
near(cmp7.saving, 1 / 0.3, 0.15, 'with ρ=0.7 pairing saves about 1/(1−ρ) ≈ 3.3, to within run rounding');
ok(cmp7.pairedObservations < cmp0.pairedObservations, 'higher ρ needs fewer observations');
ok(unpairedTotal({ d: 0.5 }) === 2 * perArm({ d: 0.5 }), 'unpaired total is both arms summed');
throws(() => pairedTotal({ d: 0.5, rho: 1 }), 'ρ = 1 is rejected as degenerate');

// ── variance components, worked by hand ───────────────────────────────
section('variance components');
// groups [[1,3],[5,7]]: means 2 and 6, grand 4
//   SSB = 2(2−4)² + 2(6−4)² = 16, df 1 → MSB = 16
//   SSW = 1+1+1+1 = 4,       df 2 → MSW = 2
//   σ²_w = 2 ; σ²_b = (16−2)/2 = 7 ; ICC = 7/9
const vc = varianceComponents([[1, 3], [5, 7]]);
near(vc.msb, 16, 1e-9, 'MSB = 16 by hand');
near(vc.msw, 2, 1e-9, 'MSW = 2 by hand');
near(vc.n0, 2, 1e-9, 'n₀ = 2 for balanced groups of 2');
near(vc.withinVar, 2, 1e-9, 'σ²_within = MSW = 2');
near(vc.betweenVar, 7, 1e-9, 'σ²_between = (MSB − MSW)/n₀ = 7');
near(vc.icc, 7 / 9, 1e-9, 'ICC = 7/9');
near(vc.grandMean, 4, 1e-9, 'grand mean = 4');

// identical groups: no between-task variance, and the estimator must clamp
const vcFlat = varianceComponents([[1, 3], [1, 3]]);
ok(vcFlat.betweenVar === 0, 'a negative moment estimate is clamped to zero, not reported');
ok(vcFlat.icc === 0, 'ICC = 0 when tasks do not differ');

// all variance between, none within
const vcSplit = varianceComponents([[5, 5], [9, 9]]);
near(vcSplit.withinVar, 0, 1e-9, 'σ²_within = 0 when repeats agree exactly');
near(vcSplit.icc, 1, 1e-9, 'ICC = 1 when all variance is between tasks');

throws(() => varianceComponents([[1, 2]]), 'one group is rejected');
throws(() => varianceComponents([[1], [2]]), 'no within-group repeats is rejected');

// unbalanced n₀: N=5, Σnᵢ² = 3² + 2² = 13, so n₀ = (5 − 13/5)/1 = 2.4.
// It sits below the arithmetic mean group size of 2.5, which is the point of
// the adjustment: an unbalanced design carries less information than a
// balanced one with the same N.
const vcUn = varianceComponents([[1, 2, 3], [5, 7]]);
near(vcUn.n0, 2.4, 1e-9, 'the unbalanced n₀ adjustment matches the standard formula');
ok(vcUn.n0 < 2.5, 'the adjusted n₀ is below the mean group size');

// ── allocation ────────────────────────────────────────────────────────
section('allocation');
// when all variance is between tasks, repeats buy nothing: spend on tasks
const allTasks = allocate({ betweenVar: 1, withinVar: 0, budget: 24 });
ok(allTasks.best.repeats === 1, 'with σ²_within = 0 the optimum is 1 repeat and maximum tasks');
// when all variance is within a task, tasks and repeats are interchangeable
// With σ²_between = 0 the SE depends only on total runs. The grid floors
// tasks = budget/repeats, so runs vary across it and the SEs are NOT equal;
// what is invariant is se·√runs.
const allWithin = allocate({ betweenVar: 0, withinVar: 1, budget: 24 });
const scaled = allWithin.options.map((o) => o.se * Math.sqrt(o.runs));
near(Math.max(...scaled), Math.min(...scaled), 1e-9,
  'with σ²_between = 0 the SE depends only on total runs, so se·√runs is constant');
ok(allWithin.options.some((o) => o.runs < 24),
  'flooring tasks = budget/repeats leaves some splits short of the full budget');
ok(seOfMean({ betweenVar: 1, withinVar: 1, tasks: 8, repeats: 3 })
   < seOfMean({ betweenVar: 1, withinVar: 1, tasks: 4, repeats: 3 }),
  'more tasks lowers the standard error');
// repeats hit diminishing returns that tasks do not
const r1 = seOfMean({ betweenVar: 1, withinVar: 1, tasks: 8, repeats: 1 });
const r8 = seOfMean({ betweenVar: 1, withinVar: 1, tasks: 8, repeats: 8 });
ok(r8 / r1 > 0.5, 'eight repeats does not halve the SE when between-task variance is present');
throws(() => allocate({ betweenVar: 1, withinVar: 1, budget: 1 }), 'a budget under 2 tasks is rejected');

// the module's main practical finding: the optimum is always 1 repeat, at every ICC
for (const icc of [0.1, 0.35, 0.6, 0.9]) {
  const a = allocate({ betweenVar: icc, withinVar: 1 - icc, budget: 24 });
  ok(a.best.repeats === 1, `optimum is 1 repeat at ICC=${icc} (got ${a.best.repeats})`);
  ok(a.varianceEstimable === false, `and at 1 repeat the within variance is flagged unestimable (ICC=${icc})`);
  ok(/dfWithin = 0/.test(a.finding), 'the finding names the cost of that optimum');
}

// paired comparison: same conclusion, and flat when the interaction term is zero
section('paired allocation');
const ac = allocateComparison({ interactionVar: 0.4, withinVar: 0.6, budget: 48 });
ok(ac.best.repeats === 1, 'the paired optimum is also 1 repeat');
const acFlat = allocateComparison({ interactionVar: 0, withinVar: 1, budget: 48 });
const scaledFlat = acFlat.options.map((o) => o.se * Math.sqrt(o.runs));
near(Math.max(...scaledFlat), Math.min(...scaledFlat), 1e-9,
  'with no task × condition interaction the split is immaterial once runs are held equal');
ok(acFlat.interactionFlat === true, 'the zero-interaction case is flagged');
// the SE formula itself
near(pairedComparisonSe({ interactionVar: 0, withinVar: 0.5, tasks: 10, repeats: 1 }),
  Math.sqrt(1 / 10), 1e-12, 'paired SE reduces to sqrt(2σ²_w/tasks) at one repeat');
ok(pairedComparisonSe({ interactionVar: 1, withinVar: 1, tasks: 20, repeats: 2 })
   < pairedComparisonSe({ interactionVar: 1, withinVar: 1, tasks: 10, repeats: 2 }),
  'more tasks lowers the paired SE');
throws(() => pairedComparisonSe({ interactionVar: 1, withinVar: 1, tasks: 0, repeats: 1 }),
  'zero tasks is rejected');

// ── the variance pilot ────────────────────────────────────────────────
section('variance pilot');
const vp = variancePilot();
ok(vp.runs === 24 && vp.tasks === 8 && vp.repeats === 3, 'the default pilot is 8 tasks × 3 repeats = 24 runs');
ok(vp.dfBetween === 7 && vp.dfWithin === 16, 'degrees of freedom are 7 between and 16 within');
ok(variancePilot({ costPerRun: 0.5 }).cost === 12, 'cost is runs × costPerRun');

// ── the lady tasting tea ──────────────────────────────────────────────
section('randomisation inference');
const tea = ladyTastingTea(8);
ok(tea.total === 70, 'eight cups give 70 assignments');
near(tea.smallestP, 1 / 70, 1e-12, 'all four correct has p = 1/70 ≈ 0.0143');
ok(tea.rows.reduce((a, r) => a + r.ways, 0) === 70, 'the null distribution sums to every assignment');
ok(tea.rows.find((r) => r.correct === 4).ways === 1, 'exactly one assignment gets all four right');
ok(tea.rows.find((r) => r.correct === 3).ways === 16, 'sixteen assignments get three right');
// the design lesson: six cups cannot reach 0.05
const tea6 = ladyTastingTea(6);
ok(tea6.total === 20, 'six cups give 20 assignments');
near(tea6.smallestP, 0.05, 1e-12, 'at six cups the smallest achievable p is exactly 0.05');
ok(tea6.smallestP > tea.smallestP, 'six cups cannot beat eight, which is why Fisher used eight');
throws(() => ladyTastingTea(7), 'an odd number of cups is rejected');

// exact permutation test
const pt = permutationTest([1, 2, 3], [7, 8, 9]);
ok(pt.assignments === 20, 'C(6,3) = 20 assignments enumerated');
near(pt.p, 2 / 20, 1e-12, 'the most extreme split of two clean groups gives p = 2/20');
const ptNull = permutationTest([1, 2, 3], [1, 2, 3]);
ok(ptNull.p === 1, 'identical groups give p = 1');
throws(() => permutationTest(Array(15).fill(1), Array(15).fill(2), { maxAssignments: 1000 }),
  'the enumeration cap refuses rather than silently sampling');

// ── sequential boundaries ─────────────────────────────────────────────
section('sequential stopping');
const sb = sprtBounds({ alpha: 0.05, beta: 0.2 });
near(sb.upper, Math.log(16), 1e-12, 'upper boundary = ln((1−β)/α) = ln 16 ≈ 2.773');
near(sb.lower, Math.log(0.2 / 0.95), 1e-12, 'lower boundary = ln(β/(1−α)) ≈ −1.558');
ok(sb.lower < 0 && sb.upper > 0, 'the continuation region straddles zero');
ok(sprtBounds({ alpha: 0.01, beta: 0.2 }).upper > sb.upper, 'a stricter α widens the region');

// ── cost ──────────────────────────────────────────────────────────────
section('cost');
const c = costToDetect({ d: 0.5, rho: 0.6, costPerRun: 0.4, conditions: 2 });
ok(c.unpairedCost === c.unpairedObservations * 0.4, 'unpaired cost is observations × unit cost');
ok(c.pairedCost < c.unpairedCost, 'pairing is cheaper at ρ > 0');
// Continuous theory says 1/(1−ρ) = 2.5. Both totals are ceiled to whole runs
// (126 and 52), so the realised saving is 2.42. Assert the integers, and
// check the ratio only loosely against theory.
ok(c.unpairedObservations === 126 && c.pairedObservations === 52,
  `ρ=0.6, d=0.5 → 126 unpaired vs 52 paired observations (got ${c.unpairedObservations} and ${c.pairedObservations})`);
near(c.saving, 1 / 0.4, 0.12, 'the realised saving tracks the continuous 1/(1−ρ) to within rounding');
const c4 = costToDetect({ d: 0.5, rho: 0.6, costPerRun: 0.4, conditions: 4 });
ok(c4.contrasts === 6, 'four conditions give six pairwise contrasts');
ok(c4.sharedDesignRuns < c4.pairwiseWorstCaseRuns, 'a shared design beats running every contrast separately');
throws(() => costToDetect({ d: 0.5, rho: 0.5 }), 'costPerRun is required rather than assumed');

// ── report ────────────────────────────────────────────────────────────
console.log('');
if (failures) {
  console.error(`✗ design calculator FAILED — ${failures} of ${checks} checks`);
  process.exit(1);
}
console.log(`✓ design calculator passed — ${checks} known-answer checks`);
