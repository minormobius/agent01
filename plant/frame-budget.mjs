// frame-budget.mjs — GATE 7 of the oracle stack (`foam/FACTORIO.md` §2):
// what does ONE TURN cost?
//
// ----------------------------------------------------------------- the claim
//
// A turn in foam is one shiva action, and the expensive one is PLANT: insert a
// seed and let the whole lattice reform around it. `reformPocket` rebuilds the
// entire voronoi complex from scratch — every cell clipped against every
// candidate, the whole thing welded, the nav graph re-derived. Nothing about
// that is incremental, so the cost is a function of the TOTAL SEED COUNT, and
// a factory that summons rich objects raises that count on purpose.
//
// So the number this file produces is not "frames per second". It is
//
//     per-turn cost (ms) as a function of the pocket's seed count
//
// and the interesting consequence is the one nobody in this repo has had
// before: HOW MANY SUMMONS CAN YOU AFFORD before a plant stops feeling
// immediate. A dodecahedron is 13 seeds. Ten of them is +130 against a
// shipping pocket of 294. That is a 44% rise in N against a cost that is
// quadratic in N, and until this file existed every performance claim about it
// was a guess.
//
// ------------------------------------------------------------- what is measured
//
// `plantSeries()` plants real seeds into a real pocket, one at a time, timing
// each `reformPocket` call. It screens every candidate through
// `placement.mjs`'s `legalSeed` first, so a refusal that costs no time (the
// seed-gap pre-check returns before any work) can never be recorded as a cheap
// sample. A late refusal — the closure gate, or a target chamber that lost its
// floor — is DISCARDED rather than timed, because those return from different
// depths and would mix two different amounts of work into one number.
//
// ----------------------------------------------------------------- the shape
//
// The model is a power law, `ms = a · n^b`, fitted by ordinary least squares on
// log-log. That choice is not cosmetic. `buildComplex` clips each of n cells
// against a candidate list that, on the reform path (`allCandidates`), is ALL
// n−1 other seeds — sorted, and then walked with an early-out that still costs
// a pass over the cell's vertices. That is Θ(n²) with an n² log n sort riding
// on top, so the honest claim is "quadratic, plus a log", i.e. b slightly above
// 2. Fitting the exponent rather than asserting one number at one n is the
// whole point: a change that turns the reform cubic would sail past a
// single-N threshold on a fast enough runner and would be caught here.
//
// The fitter is deliberately separable from the timing, so it can be pinned
// against synthetic known answers (t = 3n², t = 5n, t = 2n³, t = const) that
// have nothing to do with how fast the machine is. See the selftest: those
// assertions are exact, and they are what stops `fitPower` from being a
// function that returns 2 no matter what you feed it.
//
// Node-and-browser, no dependencies beyond this tree.

import { generatePocket, reformPocket, fnv, mulberry } from './foamworld.js';
import { SOLIDS } from './solids.mjs';
import { legalSeed } from './placement.mjs';

/** Monotonic milliseconds. `performance.now()` where it exists (node ≥16 and
 *  every browser); `Date.now()` is the fallback and is only ~1 ms granular,
 *  which is why samples are taken in batches and reduced with a median. */
export const now = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
  ? () => performance.now()
  : () => Date.now();

/** Seeds a summon of each solid costs: one centre plus one neighbour per face.
 *  DERIVED from `SOLIDS`, never tabulated — a second copy of this table is how
 *  it would come to disagree with `constellation()`. */
export const SUMMON_SEEDS = Object.fromEntries(
  Object.entries(SOLIDS).map(([name, spec]) => [name, spec.faces + 1]),
);

export function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ------------------------------------------------------------- the power fit
//
// log t = log a + b·log n, ordinary least squares. Returns null rather than a
// degenerate answer when there is nothing to fit — one point, or every point at
// the same n — because a fit through a single n is exactly the single-threshold
// measurement this gate exists to replace, and silently returning b = 0 for it
// would look like a result.

export function fitPower(samples) {
  const pts = samples.filter((s) => s.n > 0 && s.ms > 0);
  const k = pts.length;
  if (k < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of pts) {
    const x = Math.log(p.n), y = Math.log(p.ms);
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const den = k * sxx - sx * sx;
  if (!(Math.abs(den) > 1e-12)) return null;      // every sample at one n
  const b = (k * sxy - sx * sy) / den;
  const a = Math.exp((sy - b * sx) / k);
  let nMin = Infinity, nMax = -Infinity;
  for (const p of pts) { nMin = Math.min(nMin, p.n); nMax = Math.max(nMax, p.n); }
  return { a, b, points: k, nMin, nMax };
}

export function predictMs(fit, n) { return fit.a * Math.pow(n, fit.b); }

/** How badly the worst sample disagrees with the fit, as a ratio ≥ 1. A perfect
 *  power law returns exactly 1. This is the residual in the only form worth
 *  asserting on a shared runner: multiplicative, and dominated by the worst
 *  point rather than averaged over the good ones. */
export function fitMaxRatio(fit, samples) {
  let worst = 1;
  for (const s of samples) {
    if (!(s.n > 0 && s.ms > 0)) continue;
    const p = predictMs(fit, s.n);
    worst = Math.max(worst, s.ms / p, p / s.ms);
  }
  return worst;
}

/** The quadratic coefficient, normalised: milliseconds per (100 seeds)². If the
 *  cost really is quadratic this is a MACHINE CONSTANT — the same number at
 *  every n — which makes it the right thing to compare across fixture sizes
 *  and the right thing to put a regression ceiling on. */
export function quadraticUnit(n, ms) { return ms / ((n / 100) ** 2); }

// --------------------------------------------------------- the summon budget

export function seedsAfterSummons(base, solid, N) {
  const per = SUMMON_SEEDS[solid];
  if (!per) throw new Error(`frame-budget: unknown solid "${solid}"`);
  return base + N * per;
}

/**
 * How many summons of `solid` fit inside `budgetMs` PER TURN, starting from a
 * pocket of `base` seeds. The cost charged to the N-th summon is the cost of
 * its LAST seed — the most expensive plant of that summon — because the player
 * waits for each one and the worst wait is what they remember.
 *
 * `cap` bounds the search so a nonsense fit (b ≤ 0) cannot spin.
 */
export function summonsWithinBudget(fit, base, solid, budgetMs, cap = 1000) {
  let N = 0;
  while (N < cap && predictMs(fit, seedsAfterSummons(base, solid, N + 1)) <= budgetMs) N++;
  return N;
}

// ------------------------------------------------------------ the workloads

/** A deterministic lattice of candidate plant points, well inside the hull and
 *  spaced far enough apart that two of them can never be inside each other's
 *  1.5 m seed gap. */
export function candidateLattice(pocket, { step = 4, margin = 4, levels = [0.35, 0.55, 0.75] } = {}) {
  const out = [];
  for (let x = margin; x <= pocket.W - margin; x += step) {
    for (let z = margin; z <= pocket.D - margin; z += step) {
      for (const f of levels) out.push([x, pocket.H * f, z]);
    }
  }
  return out;
}

/** Fisher–Yates with the foam's own RNG, so the candidate order is spread over
 *  the whole pocket instead of walking one corner — and is still identical on
 *  every machine and every run. */
export function shuffled(xs, seed = 7) {
  const rng = mulberry(fnv(0x60A7, seed, xs.length));
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/**
 * Plant seeds one at a time, timing each rebuild.
 *
 * Returns `{ pocket, samples, refused, skipped, tried }`. `samples` holds
 * `{ n, ms }` where **n is the number of seeds in the complex that was built**
 * (the pocket's count plus the one being planted), which is the quantity the
 * cost is a function of.
 *
 * Three ways an attempt does not become a sample, and they are counted
 * separately because they mean different things:
 *   `skipped`  — `legalSeed` refused it, so no rebuild happened and no time was
 *                spent. Cheap, and NOT a measurement.
 *   `refused`  — the rebuild ran and `reformPocket` returned null anyway
 *                (closure gate, or the target chamber lost its floor). The time
 *                is real but it is a PARTIAL rebuild, so it is discarded rather
 *                than mixed into the fit.
 *   deadline   — `deadlineAt` passed. The series stops where it is.
 */
export function plantSeries(pocket, points, {
  count = 4, warmup = 0, deadlineAt = Infinity, maxRebuilds = Infinity,
} = {}) {
  const samples = [];
  let p = pocket, refused = 0, skipped = 0, tried = 0, warmed = 0;
  for (const pt of points) {
    if (samples.length >= count) break;
    if (tried >= maxRebuilds) break;
    if (now() >= deadlineAt) break;
    if (!legalSeed(p, pt).ok) { skipped++; continue; }
    tried++;
    const n = p.seeds.length + 1;
    const t0 = now();
    const q = reformPocket(p, pt);
    const ms = now() - t0;
    if (!q) { refused++; continue; }
    p = q;
    // The first insert pays for JIT compilation of the whole kernel and is not
    // representative of the ninth. Discarding it biases nothing in the gate's
    // favour: a cold first sample at the SMALLEST n would flatten the fitted
    // exponent, which is the direction that hides a regression.
    if (warmed < warmup) { warmed++; continue; }
    samples.push({ n, ms });
  }
  return { pocket: p, samples, refused, skipped, tried };
}

/** Build one fixture and measure it. `opts` goes straight to `generatePocket`.
 *  A fixture that cannot be generated returns `{ ok:false, error }` instead of
 *  throwing, so an exploratory pocket size can be tried without putting the
 *  whole gate at the mercy of whether it happens to be solvable. */
export function measureFixture(label, opts, {
  count = 4, warmup = 0, deadlineAt = Infinity, maxRebuilds = Infinity,
} = {}) {
  let pocket;
  const g0 = now();
  try {
    pocket = generatePocket(opts);
  } catch (e) {
    return { ok: false, label, error: String((e && e.message) || e), generateMs: now() - g0 };
  }
  const generateMs = now() - g0;
  const base = pocket.seeds.length;
  const series = plantSeries(pocket, shuffled(candidateLattice(pocket), base),
    { count, warmup, deadlineAt, maxRebuilds });
  const ok = series.samples.length > 0;
  return {
    ok, label, base, generateMs, ...series,
    error: ok ? null : `${series.tried} rebuilds, ${series.refused} refused, ${series.skipped} not placeable`,
    medianMs: median(series.samples.map((s) => s.ms)),
    medianN: median(series.samples.map((s) => s.n)),
  };
}
