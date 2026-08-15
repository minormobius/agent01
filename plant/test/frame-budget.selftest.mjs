// plant/test/frame-budget.selftest.mjs — GATE 7: a per-turn number, and a
// claim about how it grows.
//
// Run: node plant/test/frame-budget.selftest.mjs
//
// ---------------------------------------------------------------- what this is
//
// Every performance claim in this repo has been a guess. This is the first
// measurement. It answers one question — **what does one plant cost, and how
// does that cost move as a factory fills the pocket with summon seeds?** — and
// it turns the answer into a gate that fails when it gets worse.
//
// ------------------------------------------------------ the two halves, and why
//
// Half of this file is TIMING and half of it is ARITHMETIC, and they are kept
// apart on purpose.
//
//   · The arithmetic half (§1–§3) pins `frame-budget.mjs` against synthetic
//     known answers: a series that is exactly 3n² must fit b = 2 and a = 3, a
//     series that is exactly 5n must fit b = 1, a constant series must fit
//     b = 0. None of that depends on how fast the machine is, and it is what
//     stops the fitter from being a function that returns 2 whatever you feed
//     it. A timing gate whose analysis is unverified is a number generator.
//
//   · The timing half (§4–§6) plants real seeds into real pockets at three
//     sizes and fits the curve. Wall-clock on a shared CI runner is the least
//     trustworthy instrument available, so every assertion made on it is
//     either a RATIO (machine-independent) or carries deliberate headroom, and
//     the headroom is stated rather than implied.
//
// ------------------------------------------------------------------ the budget
//
// `PER_TURN_BUDGET_MS` is the constant that fails this gate, and here is where
// it comes from.
//
// A plant is a turn, and the player is waiting on it. The relevant human number
// is the one-second limit — the longest delay over which a person still feels
// they are directly manipulating the thing rather than waiting for a machine
// (Miller 1968; Card, Robertson & Mackinlay 1991; popularised as Nielsen's
// middle response-time limit). Below ~0.1 s feels instantaneous and is not
// reachable for a full voronoi rebuild; above ~10 s attention is gone.
//
// So the PRODUCT number is 1000 ms and it is `FLOW_LIMIT_MS`. It is REPORTED,
// not asserted, and the report includes the thing the game actually needs to
// know: how many summons fit inside it.
//
// The ASSERTED number is 2× that. The measurement is taken on a two-core shared
// CI runner, which is neither the target device nor a stable one, and a gate
// that fails on runner weather is the gate someone deletes — at which point it
// protects nothing. 2000 ms still catches roughly a 7× regression at the
// largest fixture, which is the class of change that matters (an early-out
// removed, a candidate list that stops being pruned, an accidental O(n³)).
//
// Two further ceilings catch what an absolute threshold cannot:
//
//   `QUADRATIC_CEILING`   ms per (100 seeds)². If the cost is quadratic this is
//                         a machine constant, so comparing it ACROSS fixture
//                         sizes tests the normalisation itself.
//   `EXPONENT_CEILING`    the fitted b. The reform is Θ(n²) with an n² log n
//                         sort on top and a rising interior-cell fraction as
//                         the fixture grows, so ~2.0–2.4 is the honest
//                         expectation and 2.75 is the line past which the
//                         algorithm changed class. That is a REAL separation
//                         from cubic (≈3.0) but not a wide one, and §5 says so
//                         rather than leaving it to be inferred. It is still
//                         the assertion a single-N threshold cannot make, and
//                         the regression it catches is the one that would kill
//                         the game rather than merely annoy it.
//
// ------------------------------------------------------------- staying under 10s
//
// Requirement (c) of the ticket, enforced by the file on itself: `TOTAL_BUDGET_MS`
// is asserted at the bottom, and every phase is deadline-guarded so a slow
// machine loses SAMPLES rather than blowing the budget. The out-of-sample check
// against the shipping pocket is the expensive one, so it is entered only if the
// fit — which by then exists — predicts it is affordable. The benchmark uses its
// own measurement to decide what it can afford to measure.

import {
  now, median, fitPower, predictMs, fitMaxRatio, quadraticUnit,
  SUMMON_SEEDS, seedsAfterSummons, summonsWithinBudget,
  candidateLattice, shuffled, measureFixture,
} from '../frame-budget.mjs';
import { hullViolation } from '../placement.mjs';
import { seedGap } from '../solids.mjs';

const T0 = now();
let checks = 0, failures = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('  ✗ ' + msg); }
}
const elapsed = () => now() - T0;

// ------------------------------------------------------------- the constants
const FLOW_LIMIT_MS = 1000;      // reported: the product requirement
const PER_TURN_BUDGET_MS = 2000; // asserted: 2× the above, for a CI runner
const QUADRATIC_CEILING = 2500;  // ms per (100 seeds)² — ~17× the cost this was written at
const EXPONENT_CEILING = 2.75;   // Θ(n² log n) fits under this; Θ(n³) does not
const FIT_RATIO_CEILING = 2.0;   // worst FIXTURE MEDIAN vs the fit (not a single sample)
const TOTAL_BUDGET_MS = 9500;    // requirement (c), asserted on ourselves

// Three staggered guards, and the stagger is the point: a slow machine must
// lose SAMPLES, never the runtime budget. Entry is gated well before the
// sampling deadline because generating a fixture is itself unbudgeted work, so
// a machine that crawls declines to start a pocket it cannot afford to measure
// rather than discovering that halfway through.
const FIXTURE_ENTRY_MS = 4500;   // do not START another fixture after this
const FIXTURE_DEADLINE = 7000;   // do not START another plant after this
const OOS_ENTRY_MS = 3500;       // only start the shipping-pocket check before this
const OOS_MAX_PREDICT_MS = 1500; // …and only if the fit says one plant costs less

// ===========================================================================
// §1. the seed arithmetic — derived, not tabulated
// ===========================================================================
ok(SUMMON_SEEDS.tetrahedron === 5, `summon seeds: tetrahedron 5 (got ${SUMMON_SEEDS.tetrahedron})`);
ok(SUMMON_SEEDS.cube === 7, `summon seeds: cube 7 (got ${SUMMON_SEEDS.cube})`);
ok(SUMMON_SEEDS.octahedron === 9, `summon seeds: octahedron 9 (got ${SUMMON_SEEDS.octahedron})`);
ok(SUMMON_SEEDS.dodecahedron === 13, `summon seeds: dodecahedron 13 (got ${SUMMON_SEEDS.dodecahedron})`);
ok(SUMMON_SEEDS.icosahedron === 21, `summon seeds: icosahedron 21 (got ${SUMMON_SEEDS.icosahedron})`);

// the ticket's own arithmetic, pinned: ten dodecahedra is +130 on 294
ok(seedsAfterSummons(294, 'dodecahedron', 10) === 424, 'ten dodecahedra take a 294-seed pocket to 424');
ok(seedsAfterSummons(294, 'dodecahedron', 0) === 294, 'zero summons changes nothing');
{
  let threw = false;
  try { seedsAfterSummons(294, 'rhombicuboctahedron', 1); } catch { threw = true; }
  ok(threw, 'an unknown solid throws rather than returning NaN');
}

ok(median([3, 1, 2]) === 2, 'median: odd length');
ok(median([1, 2, 3, 4]) === 2.5, 'median: even length averages the middle pair');

// ===========================================================================
// §2. the fitter, against exact known answers
//
// These have no timing in them at all. If `fitPower` is wrong, every number in
// §4–§6 is decoration, and this is the only place that can say so.
// ===========================================================================
{
  // t = 3n², exactly
  const quad = [{ n: 10, ms: 300 }, { n: 20, ms: 1200 }, { n: 40, ms: 4800 }];
  const f = fitPower(quad);
  ok(f !== null && Math.abs(f.b - 2) < 1e-9, `fit: 3n² recovers b=2 (got ${f && f.b})`);
  ok(f !== null && Math.abs(f.a - 3) < 1e-9, `fit: 3n² recovers a=3 (got ${f && f.a})`);
  ok(f !== null && f.nMin === 10 && f.nMax === 40 && f.points === 3, 'fit: reports its own sample range');
  ok(Math.abs(fitMaxRatio(f, quad) - 1) < 1e-9, 'fit: a perfect power law has residual ratio exactly 1');

  // t = 5n, exactly — the control that kills "fitPower always says 2"
  const lin = fitPower([{ n: 8, ms: 40 }, { n: 64, ms: 320 }]);
  ok(lin !== null && Math.abs(lin.b - 1) < 1e-9, `fit: 5n recovers b=1 (got ${lin && lin.b})`);
  ok(lin !== null && Math.abs(lin.a - 5) < 1e-9, `fit: 5n recovers a=5 (got ${lin && lin.a})`);

  // t = 2n³ — and it is above the ceiling this gate enforces, which is the
  // point: a cubic reform must not be able to pass §5.
  const cub = fitPower([{ n: 5, ms: 250 }, { n: 10, ms: 2000 }, { n: 20, ms: 16000 }]);
  ok(cub !== null && Math.abs(cub.b - 3) < 1e-9, `fit: 2n³ recovers b=3 (got ${cub && cub.b})`);
  ok(cub !== null && cub.b > EXPONENT_CEILING, 'fit: a cubic series would FAIL the exponent ceiling');

  // constant cost — b = 0, not b = 2
  const flat = fitPower([{ n: 10, ms: 100 }, { n: 20, ms: 100 }, { n: 40, ms: 100 }]);
  ok(flat !== null && Math.abs(flat.b) < 1e-12, `fit: a constant series recovers b=0 (got ${flat && flat.b})`);

  // refusals: nothing to fit is null, not a degenerate answer
  ok(fitPower([{ n: 10, ms: 100 }]) === null, 'fit: one point is not a curve');
  ok(fitPower([{ n: 64, ms: 10 }, { n: 64, ms: 20 }]) === null, 'fit: two points at the same n is not a curve');
  ok(fitPower([]) === null, 'fit: no points is null');

  ok(predictMs({ a: 3, b: 2 }, 100) === 30000, 'predict: 3·100² = 30000');
  ok(Math.abs(fitMaxRatio({ a: 3, b: 2 }, [{ n: 10, ms: 600 }]) - 2) < 1e-9,
     'residual: a sample at 2× the prediction reports exactly 2');
  ok(Math.abs(fitMaxRatio({ a: 3, b: 2 }, [{ n: 10, ms: 150 }]) - 2) < 1e-9,
     'residual: …and so does one at half, because the ratio is two-sided');

  // the normalisation is scale-free on exactly-quadratic data — that is what
  // makes QUADRATIC_CEILING comparable across fixture sizes
  ok(quadraticUnit(100, 250) === 250 && quadraticUnit(200, 1000) === 250,
     'normalise: ms/(100 seeds)² is the same number at n=100 and n=200 for a quadratic cost');
}

// ===========================================================================
// §3. the summon budget, on a synthetic fit
// ===========================================================================
{
  const unit = { a: 1, b: 1 };            // 1 ms per seed — arithmetic, not a claim
  ok(summonsWithinBudget(unit, 100, 'dodecahedron', 200) === 7,
     `budget: 7 dodecahedra fit in 200 ms from 100 seeds (got ${summonsWithinBudget(unit, 100, 'dodecahedron', 200)})`);
  ok(summonsWithinBudget(unit, 100, 'tetrahedron', 200) === 20,
     'budget: …and 20 tetrahedra, because a tetrahedron is 5 seeds not 13');
  ok(summonsWithinBudget(unit, 100, 'dodecahedron', 100) === 0,
     'budget: zero when the first summon already exceeds it');
  ok(summonsWithinBudget({ a: 1, b: 0 }, 100, 'cube', 0.5, 50) === 0,
     'budget: a cost that never fits returns 0 rather than spinning to the cap');
}

// ===========================================================================
// §4. the workload generators
// ===========================================================================
{
  const stub = { W: 40, H: 20, D: 40 };
  const L = candidateLattice(stub);
  ok(L.length === 9 * 9 * 3, `lattice: 9×9×3 candidates for a 40×20×40 pocket (got ${L.length})`);
  ok(L.every((p) => hullViolation(stub, p) === null), 'lattice: every candidate is inside the placeable hull');
  // no two candidates can foul each other, so a series never blocks itself
  let minGap = Infinity;
  for (let i = 0; i < L.length; i++) {
    for (let j = i + 1; j < L.length; j++) minGap = Math.min(minGap, seedGap(L[i], L[j], 2.2));
  }
  ok(minGap >= 1.5, `lattice: no two candidates are inside the 1.5 m seed gap (min ${minGap.toFixed(3)})`);

  const a = shuffled(L, 1), b = shuffled(L, 1), c = shuffled(L, 2);
  ok(JSON.stringify(a) === JSON.stringify(b), 'shuffle: deterministic for a given seed');
  ok(JSON.stringify(a) !== JSON.stringify(c), 'shuffle: a different seed gives a different order');
  ok(a.length === L.length && new Set(a.map(String)).size === new Set(L.map(String)).size,
     'shuffle: a permutation, nothing dropped or duplicated');
}

// ===========================================================================
// §5. THE MEASUREMENT — three pocket sizes, one curve
//
// The 4×4 fixture is the one `foamworld.selftest.mjs` and `placement.selftest.mjs`
// both already use, so it is proven generable. The 5×5 and 6×6 sizes are
// exploratory: they exist only to give the fit a lever arm, they are capped at
// four salts, and a failure to generate one drops it from the run rather than
// failing the gate. What the exponent needs is RANGE, and 64→144 seeds is a
// 2.25× span in n and roughly 5× in cost — enough to tell quadratic from cubic
// with the noise a shared runner brings.
// ===========================================================================
const MACRO = { layers: 3, subLayers: 1, cell: 20, layerH: 9, parMin: 3, parTarget: 6 };
const FIXTURES = [
  { label: '4×4 (proven)', opts: { seed: 2, nx: 4, nz: 4, ...MACRO }, warmup: 1, count: 3 },
  { label: '5×5', opts: { seed: 2, nx: 5, nz: 5, maxSalt: 4, ...MACRO }, warmup: 0, count: 3 },
  { label: '6×6', opts: { seed: 2, nx: 6, nz: 6, maxSalt: 4, ...MACRO }, warmup: 0, count: 3 },
];

const runs = [];
for (const F of FIXTURES) {
  if (elapsed() >= FIXTURE_ENTRY_MS) {
    runs.push({ ok: false, label: F.label, error: `out of time (${elapsed().toFixed(0)} ms elapsed)` });
    continue;
  }
  runs.push(measureFixture(F.label, F.opts, {
    // +4 rebuilds of slack: `reformPocket` refuses some perfectly legal points
    // late (the closure gate, or a target chamber that loses its floor) and a
    // fixture that hit two of those in a row would otherwise report no samples.
    // Wall-clock is bounded by `deadlineAt`, not by this.
    count: F.count, warmup: F.warmup, deadlineAt: T0 + FIXTURE_DEADLINE, maxRebuilds: F.count + F.warmup + 4,
  }));
}

const good = runs.filter((r) => r.ok);
const all = good.flatMap((r) => r.samples);

console.log('\n  gate 7 — per-turn foam rebuild cost (one plant, whole-lattice reform)\n');
console.log('    fixture         seeds      samples   median ms   ms/(100 seeds)²');
for (const r of runs) {
  if (!r.ok) { console.log(`    ${r.label.padEnd(15)} —          —         (not measured: ${r.error})`); continue; }
  console.log(
    `    ${r.label.padEnd(15)} ${String(r.base).padEnd(10)} ${String(r.samples.length).padEnd(9)} ` +
    `${r.medianMs.toFixed(1).padStart(9)}   ${quadraticUnit(r.medianN, r.medianMs).toFixed(0).padStart(9)}` +
    `    (gen ${r.generateMs.toFixed(0)} ms, ${r.refused} late refusals)`,
  );
}

ok(good.length >= 2, `measurement: at least two fixture sizes were measured (got ${good.length} of ${FIXTURES.length})`);
ok(all.length >= 4, `measurement: at least four timed plants (got ${all.length})`);

const fit = fitPower(all);
ok(fit !== null, 'measurement: the samples span more than one seed count, so a curve exists');

if (fit) {
  const span = fit.nMax / fit.nMin;
  console.log(`\n    fit:  ms = ${fit.a.toExponential(3)} · n^${fit.b.toFixed(3)}` +
              `   (${fit.points} samples, n ${fit.nMin}…${fit.nMax}, span ${span.toFixed(2)}×,` +
              ` worst residual ${fitMaxRatio(fit, all).toFixed(2)}×)`);

  // The lever arm has to be real or the exponent is noise wearing a decimal
  // point. If this fails the benchmark did not get far enough inside its own
  // time budget — which is itself the news, and is why it fails rather than
  // quietly reporting a fit over a 5% range.
  ok(span >= 1.4, `shape: the sample range is wide enough to fit an exponent (${span.toFixed(2)}× of n)`);

  // (b) THE SHAPE CLAIM, and the ceiling is narrower than it looks — say so.
  //
  // `buildComplex` on the reform path clips each of n cells against ALL n−1
  // other seeds, so the clip loop is Θ(n²); `allCandidates` sorts that list per
  // cell, so the sort is Θ(n² log n) and its per-comparison cost is NOT
  // negligible against the clip loop's. On top of that, a bigger grid has a
  // larger INTERIOR fraction, and an interior cell has more faces than a
  // boundary one — so the measured exponent drifts up with fixture size for a
  // reason that has nothing to do with the algorithm.
  //
  // Expected: ~2.0–2.4. Ceiling 2.75. A genuinely cubic reform fits ≈3.0 and
  // fails. That is a real separation but not a wide one, which is exactly why
  // it is stated rather than left to be inferred from the number.
  ok(fit.b <= EXPONENT_CEILING,
     `shape: the per-turn cost grows no faster than n^${EXPONENT_CEILING} (fitted ${fit.b.toFixed(3)})`);

  // The residual is asserted on FIXTURE MEDIANS, not on single samples. One GC
  // pause inside one 60 ms rebuild is a 3× outlier and means nothing; a fixture
  // whose median sits 2× off the curve means the model is wrong. Asserting the
  // worst single sample would have been a flake generator wearing a
  // goodness-of-fit label.
  const medians = good.map((r) => ({ n: r.medianN, ms: r.medianMs }));
  ok(fitMaxRatio(fit, medians) <= FIT_RATIO_CEILING,
     `shape: every fixture median is within ${FIT_RATIO_CEILING}× of the fitted curve ` +
     `(worst ${fitMaxRatio(fit, medians).toFixed(2)}×; worst single sample ${fitMaxRatio(fit, all).toFixed(2)}×)`);

  // (a) THE BUDGET. Per fixture, on the median — one GC pause must not fail a
  // gate, and one GC pause must not hide a regression either, which is why the
  // worst single sample is printed alongside.
  for (const r of good) {
    const worst = Math.max(...r.samples.map((s) => s.ms));
    ok(r.medianMs <= PER_TURN_BUDGET_MS,
       `budget: ${r.label} — a plant into ${r.medianN} seeds takes ${r.medianMs.toFixed(0)} ms, ` +
       `under the ${PER_TURN_BUDGET_MS} ms per-turn budget (worst sample ${worst.toFixed(0)} ms)`);
    ok(quadraticUnit(r.medianN, r.medianMs) <= QUADRATIC_CEILING,
       `budget: ${r.label} — ${quadraticUnit(r.medianN, r.medianMs).toFixed(0)} ms per (100 seeds)², ` +
       `under the ${QUADRATIC_CEILING} ceiling`);
  }

  // CONTROL: the measurement is measuring something. A bigger pocket must cost
  // more. Expected difference across 64→144 seeds is ~5×, so this survives a
  // very noisy runner and dies instantly if the timer or the fixtures broke.
  if (good.length >= 2) {
    const first = good[0], last = good[good.length - 1];
    ok(last.medianN > first.medianN && last.medianMs > first.medianMs,
       `control: the larger pocket really is slower (${first.medianMs.toFixed(0)} ms at ${first.medianN} seeds ` +
       `→ ${last.medianMs.toFixed(0)} ms at ${last.medianN})`);
  }

  // -------------------------------------------------------------- the number
  const SHIP = 294;   // the shipping pocket: nx 7 × nz 7 × (4+2) layers
  console.log('\n    what this means for the game (extrapolated from the fit):\n');
  console.log(`      one plant into the shipping pocket (${SHIP} seeds):  ${predictMs(fit, SHIP + 1).toFixed(0)} ms`);
  for (const solid of ['tetrahedron', 'cube', 'dodecahedron']) {
    const n10 = seedsAfterSummons(SHIP, solid, 10);
    console.log(
      `      after 10 ${solid.padEnd(13)} (${String(n10).padStart(3)} seeds):  ${predictMs(fit, n10).toFixed(0)} ms/turn` +
      `   → ${summonsWithinBudget(fit, SHIP, solid, FLOW_LIMIT_MS)} summons inside the ${FLOW_LIMIT_MS} ms flow limit`,
    );
  }
  console.log('');

  // ==========================================================================
  // §6. OUT OF SAMPLE — the shipping pocket itself.
  //
  // Everything above is fitted over 64…144 seeds and the game runs at 294, so
  // the headline number is an extrapolation past twice the measured range. This
  // checks it against one real plant at the real density — but only if the fit
  // says that plant is affordable inside this file's own time budget. A gate
  // that decides at runtime whether it can afford its most expensive check is
  // strictly better than one that either always pays or never measures.
  // ==========================================================================
  const predicted = predictMs(fit, SHIP + 1);
  if (elapsed() >= OOS_ENTRY_MS || predicted >= OOS_MAX_PREDICT_MS) {
    console.log(`    out-of-sample check SKIPPED — ${elapsed().toFixed(0)} ms elapsed of ${OOS_ENTRY_MS},` +
                ` predicted plant ${predicted.toFixed(0)} ms of ${OOS_MAX_PREDICT_MS}.`);
    console.log('    The extrapolation to 294 seeds above is therefore UNVERIFIED on this run.\n');
  } else {
    // maxRebuilds: 1 — exactly one plant is attempted. A late refusal loses the
    // check rather than starting a second rebuild whose cost is not budgeted.
    const oos = measureFixture('7×7 (shipping)', { seed: 1 },
      { count: 1, maxRebuilds: 1, deadlineAt: T0 + TOTAL_BUDGET_MS - 1500 });
    if (!oos.ok) {
      console.log(`    out-of-sample check did not land a plant (${oos.error || `${oos.refused} refusals`}) — extrapolation unverified.\n`);
    } else {
      const s = oos.samples[0];
      const ratio = s.ms / predictMs(fit, s.n);
      console.log(`    out-of-sample: a real plant into ${s.n} seeds took ${s.ms.toFixed(0)} ms; ` +
                  `the fit predicted ${predictMs(fit, s.n).toFixed(0)} ms (${ratio.toFixed(2)}×)\n`);
      // Deliberately loose: this is ONE sample, taken past twice the fitted
      // range, on a machine nobody controls. 4× still catches "the
      // extrapolation is nonsense"; anything tighter would be asserting that a
      // single timing has no outliers, which is not true of any timing.
      ok(ratio <= 4 && ratio >= 1 / 4,
         `out-of-sample: the fitted curve predicts the shipping pocket within 4× (${ratio.toFixed(2)}×)`);
      ok(s.ms <= PER_TURN_BUDGET_MS * 3,
         `out-of-sample: a plant at shipping density is ${s.ms.toFixed(0)} ms ` +
         `(ceiling ${PER_TURN_BUDGET_MS * 3} ms — 3× the per-turn budget, because n is 4.6× the proven fixture)`);
    }
  }
}

// ===========================================================================
// §7. requirement (c): this file must not become the reason the suite is off.
// ===========================================================================
const total = elapsed();
console.log(`    total: ${total.toFixed(0)} ms of a ${TOTAL_BUDGET_MS} ms self-imposed budget\n`);
ok(total <= TOTAL_BUDGET_MS,
   `runtime: the gate finished in ${total.toFixed(0)} ms, under its own ${TOTAL_BUDGET_MS} ms budget`);

console.log(failures === 0
  ? `✓ frame-budget selftest — ${checks} checks pass (gate 7: per-turn cost, fitted and bounded)`
  : `✗ frame-budget selftest — ${failures}/${checks} FAILED`);
process.exit(failures === 0 ? 0 : 1);
