/* ─────────────────────────────────────────────────────────────────────
   ken/lab/simulate.mjs — simulate a design before running it.

   Node-only, not served. Deterministic throughout: a seeded mulberry32,
   never Math.random, so a reported sampling distribution is reproducible
   from its seed and a selftest can assert exact values.

   WHY THIS EXISTS. design.mjs answers "how many runs would this take"
   under a model. This module asks whether the model survives contact
   with the design you can actually afford. Two questions it is built
   for:

     1. If I run a pilot of this size, how precisely will it estimate the
        variance components? A point estimate with a CI wider than the
        parameter range is not an estimate.
     2. Would I notice if the normal random-effects model were wrong?
        Specifically, if a task's outcome is bimodal — the model either
        gets it or does not — the mean and variance are describing a
        distribution with no mass at either.

   Simulating the design first is standard practice in every field that
   spends real money on experiments, and it is the step our own house
   standard implies at R4 without naming.
   ───────────────────────────────────────────────────────────────────── */
import { varianceComponents, seOfMean } from './design.mjs';
import { stats } from '../../packages/dataviz/index.mjs';

const { mean, quantile } = stats;

// ── deterministic randomness ──────────────────────────────────────────

// mulberry32 lives in ../graph/rng.mjs so the browser-served layout can
// have it without dragging design.mjs and dataviz into the page.
// Imported as well as re-exported: `export ... from` forwards the binding
// without introducing it here, so the calls below would see undefined.
import { mulberry32 } from '../graph/rng.mjs';

export { mulberry32 };

/** Standard normal by Box–Muller, drawing two uniforms per value. */
export function normalDeviate(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── generating data from a stated model ───────────────────────────────

/**
 * One condition's scores under a normal one-way random-effects model:
 * a task effect drawn once per task, plus independent run noise.
 */
export function simulateRandomEffects({ tasks, repeats, betweenVar, withinVar, rng }) {
  const sb = Math.sqrt(betweenVar), sw = Math.sqrt(withinVar);
  const out = [];
  for (let t = 0; t < tasks; t++) {
    const taskEffect = sb * normalDeviate(rng);
    const row = [];
    for (let r = 0; r < repeats; r++) row.push(taskEffect + sw * normalDeviate(rng));
    out.push(row);
  }
  return out;
}

/**
 * The same, but each run succeeds with probability `p` and the score is
 * drawn from one of two well-separated modes. This is the alternative the
 * normal model would miss: a task the model either solves or does not.
 */
export function simulateBimodal({ tasks, repeats, p = 0.5, gap = 3, noise = 0.35, rng }) {
  const out = [];
  for (let t = 0; t < tasks; t++) {
    const row = [];
    for (let r = 0; r < repeats; r++) {
      const hit = rng() < p;
      row.push((hit ? gap : 0) + noise * normalDeviate(rng));
    }
    out.push(row);
  }
  return out;
}

// ── how well does a pilot of this size estimate ICC? ──────────────────

/**
 * The sampling distribution of the ICC estimate for a given pilot shape.
 * Returns the estimates, their central tendency, the bias against the true
 * value, and a percentile interval. The interval is the number that decides
 * whether the pilot is worth running.
 */
export function iccSamplingDistribution({
  tasks, repeats, trueIcc, trials = 2000, seed = 1,
}) {
  const rng = mulberry32(seed);
  const betweenVar = trueIcc;
  const withinVar = 1 - trueIcc;
  const est = [];
  for (let i = 0; i < trials; i++) {
    const groups = simulateRandomEffects({ tasks, repeats, betweenVar, withinVar, rng });
    est.push(varianceComponents(groups).icc);
  }
  est.sort((a, b) => a - b);
  const lo = quantile(est, 0.025), hi = quantile(est, 0.975);
  return {
    tasks, repeats, runs: tasks * repeats, trueIcc, trials,
    mean: mean(est),
    median: quantile(est, 0.5),
    lo, hi,
    width: hi - lo,
    bias: mean(est) - trueIcc,
    atZero: est.filter((e) => e === 0).length / trials,
  };
}

/**
 * Sweep pilot shapes at a fixed run budget and report what each buys.
 * `targetWidth` is the widest 95% interval on ICC you would accept.
 */
export function pilotSweep({
  budget = 24, trueIcc = 0.5, trials = 2000, seed = 7,
  shapes = null, targetWidth = 0.4,
}) {
  const grid = shapes || [[4, 6], [6, 4], [8, 3], [12, 2], [24, 1]]
    .filter(([t, r]) => t * r <= budget && r >= 2);
  return grid.map(([tasks, repeats], i) => {
    const d = iccSamplingDistribution({ tasks, repeats, trueIcc, trials, seed: seed + i });
    return { ...d, acceptable: d.width <= targetWidth };
  });
}

/** The smallest pilot whose 95% interval on ICC is no wider than `targetWidth`. */
export function pilotSizeFor({
  trueIcc = 0.5, targetWidth = 0.4, repeats = 3, trials = 1000,
  taskGrid = [8, 12, 16, 24, 32, 48, 64, 96, 128], seed = 11,
}) {
  for (let i = 0; i < taskGrid.length; i++) {
    const d = iccSamplingDistribution({ tasks: taskGrid[i], repeats, trueIcc, trials, seed: seed + i });
    if (d.width <= targetWidth) return { found: true, ...d, targetWidth };
  }
  const last = iccSamplingDistribution({
    tasks: taskGrid[taskGrid.length - 1], repeats, trueIcc, trials, seed,
  });
  return { found: false, ...last, targetWidth };
}

// ── would we notice the model is wrong? ───────────────────────────────

/**
 * Sarle's bimodality coefficient.
 *   BC = (γ² + 1) / (κ + 3(n−1)² / ((n−2)(n−3)))
 * with γ the sample skewness and κ the sample excess kurtosis.
 *
 * Reference points, exact in the large-n limit: a normal gives 1/3, a
 * uniform gives 5/9, and a two-point distribution gives 1. The
 * conventional threshold is the uniform value, 5/9 ≈ 0.5556: above it the
 * distribution is more bimodal than flat.
 */
export function bimodalityCoefficient(xs) {
  const n = xs.length;
  if (n < 4) throw new RangeError('bimodalityCoefficient: need at least 4 values');
  const m = mean(xs);
  const mom = (k) => xs.reduce((a, x) => a + (x - m) ** k, 0) / n;
  const m2 = mom(2);
  if (m2 === 0) throw new RangeError('bimodalityCoefficient: zero variance');
  const g = mom(3) / m2 ** 1.5;
  const k = mom(4) / m2 ** 2 - 3;
  return (g * g + 1) / (k + (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)));
}

export const BC_NORMAL = 1 / 3;
export const BC_UNIFORM = 5 / 9;

/**
 * Power to detect bimodality: given a pilot of this shape drawn from a
 * genuinely bimodal process, how often does the coefficient clear the
 * threshold? Pools each task's repeats, because that is the level at which
 * the question is asked.
 */
export function bimodalityPower({
  tasks, repeats, p = 0.5, gap = 3, noise = 0.35,
  trials = 1000, seed = 3, threshold = BC_UNIFORM,
}) {
  const rng = mulberry32(seed);
  let detected = 0, usable = 0;
  for (let i = 0; i < trials; i++) {
    const groups = simulateBimodal({ tasks, repeats, p, gap, noise, rng });
    const pooled = groups.flat();
    try {
      usable++;
      if (bimodalityCoefficient(pooled) > threshold) detected++;
    } catch { usable--; }
  }
  return { tasks, repeats, runs: tasks * repeats, p, gap, trials, usable, power: detected / usable };
}

// ── does the allocation prediction survive resampling? ────────────────

/**
 * design.mjs predicts that at a fixed budget the SE of a condition mean is
 * minimised at one repeat. This checks the prediction against simulated
 * draws rather than the formula it came from, which is the difference
 * between a derivation and a test.
 */
export function allocationCheck({
  budget = 48, betweenVar = 0.5, withinVar = 0.5, trials = 2000, seed = 5,
}) {
  const rows = [];
  for (const repeats of [1, 2, 3, 4, 6, 8]) {
    const tasks = Math.floor(budget / repeats);
    if (tasks < 2) continue;
    const rng = mulberry32(seed + repeats);
    const means = [];
    for (let i = 0; i < trials; i++) {
      const g = simulateRandomEffects({ tasks, repeats, betweenVar, withinVar, rng });
      means.push(mean(g.map(mean)));
    }
    const mu = mean(means);
    const empiricalSe = Math.sqrt(means.reduce((a, x) => a + (x - mu) ** 2, 0) / means.length);
    rows.push({
      repeats, tasks, runs: tasks * repeats,
      predictedSe: seOfMean({ betweenVar, withinVar, tasks, repeats }),
      empiricalSe,
    });
  }
  const best = rows.reduce((a, b) => (b.empiricalSe < a.empiricalSe ? b : a));
  return { rows, bestRepeats: best.repeats, best };
}
