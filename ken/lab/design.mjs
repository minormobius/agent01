/* ─────────────────────────────────────────────────────────────────────
   ken/lab/design.mjs — the design calculator.

   Node-only. Not served (see ../.assetsignore). Statistics come from the
   shared library at packages/dataviz; nothing is reimplemented here.

   WHAT THIS IS FOR. Running the same prompt twice is a project manager's
   dream and a statistician's bill. Model output varies run to run, so any
   claim that one condition beat another needs enough replication to
   outrun that variance, and replication is what costs money. Every
   function here exists to answer one of three questions BEFORE any of it
   is spent:

     1. How many runs would it take to detect an effect this size?
     2. Given the budget I have, what is the smallest effect I could
        detect at all? (Usually the more useful direction.)
     3. What design change would make the same claim cheaper?

   Question 3 has real answers, and they are worth more than any amount of
   careful reporting after the fact. The largest is pairing: run every
   condition on the SAME tasks and the between-task variance cancels,
   cutting the required observations by a factor of (1 − ρ). With the
   correlation between conditions on a shared task typically high, that is
   routinely a 3–5x saving. See `pairedTotal` and `designComparison`.

   THE FIRST THING TO SPEND ON is not a comparison. It is a variance
   pilot: one condition, several tasks, several repeats, which yields the
   variance components every other calculation needs as input. Until that
   exists, every cost estimate here rests on an assumed ICC and should be
   read as a range rather than a number. See `variancePilot`.
   ───────────────────────────────────────────────────────────────────── */
import { stats } from '../../packages/dataviz/index.mjs';

const { normalQuantile, mean } = stats;

// ── small helpers ─────────────────────────────────────────────────────

/** z for a one-sided upper tail probability, e.g. z(0.975) ≈ 1.959964. */
export function z(p) {
  if (!(p > 0 && p < 1)) throw new RangeError(`z(p): p must be in (0,1), got ${p}`);
  return normalQuantile(p);
}

/** Binomial coefficient, exact for the sizes an enumeration test can reach. */
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

const zSum = (alpha, power, tails) => z(1 - alpha / tails) + z(power);

// ── 1. how many runs? ─────────────────────────────────────────────────

/**
 * Runs per arm for a two-arm comparison of means, normal approximation.
 *   n = 2(z_{1-α/tails} + z_{power})² / d²
 * `d` is a standardised effect: the difference you care about, divided by
 * the standard deviation of a single run.
 *
 * The normal approximation runs a little light at small n (it gives ~63 for
 * d=0.5 where the t-based calculation gives 64). `exact: true` adds the
 * conventional +1 correction rather than pretending to more precision.
 */
export function perArm({ d, alpha = 0.05, power = 0.8, tails = 2, exact = false }) {
  if (!(d > 0)) throw new RangeError('perArm: d must be > 0');
  const n = (2 * zSum(alpha, power, tails) ** 2) / d ** 2;
  return Math.ceil(n) + (exact ? 1 : 0);
}

/**
 * The inverse, and usually the question worth asking: with `n` runs per arm,
 * what is the smallest standardised effect detectable at this power?
 */
export function mde({ n, alpha = 0.05, power = 0.8, tails = 2 }) {
  if (!(n > 0)) throw new RangeError('mde: n must be > 0');
  return zSum(alpha, power, tails) * Math.sqrt(2 / n);
}

// ── 2. pairing, which is where the money is ───────────────────────────

/**
 * Total observations for an UNPAIRED two-arm comparison (both arms summed).
 */
export function unpairedTotal({ d, alpha = 0.05, power = 0.8, tails = 2 }) {
  return 2 * perArm({ d, alpha, power, tails });
}

/**
 * Total observations for a PAIRED comparison: every condition run on the same
 * tasks, so whatever makes a task hard cancels out of the difference.
 *
 *   Var(difference) = 2σ²(1 − ρ)   ⇒   pairs = 2(z+z)²(1 − ρ) / d²
 *
 * Total observations are therefore the unpaired total scaled by (1 − ρ).
 * ρ is the correlation between the two conditions' scores on a shared task.
 */
export function pairedTotal({ d, rho, alpha = 0.05, power = 0.8, tails = 2 }) {
  if (!(rho >= -1 && rho < 1)) throw new RangeError('pairedTotal: rho must be in [-1, 1)');
  const pairs = Math.ceil((2 * zSum(alpha, power, tails) ** 2 * (1 - rho)) / d ** 2);
  return { pairs, observations: 2 * pairs };
}

/** Side-by-side, with the saving stated as a multiple. */
export function designComparison({ d, rho, alpha = 0.05, power = 0.8, tails = 2 }) {
  const unpaired = unpairedTotal({ d, alpha, power, tails });
  const paired = pairedTotal({ d, rho, alpha, power, tails });
  return {
    d, rho,
    unpairedObservations: unpaired,
    pairedObservations: paired.observations,
    pairs: paired.pairs,
    saving: unpaired / paired.observations,
  };
}

// ── 3. where the variance actually lives ──────────────────────────────

/**
 * One-way random-effects variance components from replicated groups.
 * `groups` is an array of arrays: one inner array per task (or per cell),
 * holding that task's repeated scores.
 *
 *   σ²_within  = MSW                     — how much one task varies run to run
 *   σ²_between = (MSB − MSW) / n₀        — how much tasks differ from each other
 *   ICC        = σ²_b / (σ²_b + σ²_w)    — the share of variance that is task
 *
 * ICC is the number that decides everything downstream. High ICC means most
 * of the spread is which task you drew, so pairing buys a great deal and
 * adding tasks matters more than adding repeats. Low ICC means the model
 * itself is the noise, and only repeats help.
 *
 * σ²_between is clamped at zero: the moment estimator can go negative when
 * tasks genuinely do not differ, and a negative variance is not a finding.
 */
export function varianceComponents(groups) {
  const k = groups.length;
  if (k < 2) throw new RangeError('varianceComponents: need at least 2 groups');
  if (groups.some((g) => g.length < 1)) throw new RangeError('varianceComponents: every group needs at least 1 observation');

  const N = groups.reduce((a, g) => a + g.length, 0);
  const groupMeans = groups.map(mean);
  const grand = groups.flat().reduce((a, b) => a + b, 0) / N;

  const ssb = groups.reduce((a, g, i) => a + g.length * (groupMeans[i] - grand) ** 2, 0);
  const ssw = groups.reduce((a, g, i) => a + g.reduce((s, y) => s + (y - groupMeans[i]) ** 2, 0), 0);

  const dfB = k - 1;
  const dfW = N - k;
  if (dfW <= 0) throw new RangeError('varianceComponents: need repeats within at least one group');

  const msb = ssb / dfB;
  const msw = ssw / dfW;

  // balanced → n₀ is the group size; unbalanced → the standard adjustment
  const sumSq = groups.reduce((a, g) => a + g.length ** 2, 0);
  const n0 = (N - sumSq / N) / dfB;

  const withinVar = msw;
  const betweenVar = Math.max(0, (msb - msw) / n0);
  const total = withinVar + betweenVar;

  return {
    k, N, n0, msb, msw, withinVar, betweenVar,
    icc: total > 0 ? betweenVar / total : 0,
    grandMean: grand,
  };
}

/**
 * Standard error of one condition's mean under a tasks × repeats allocation.
 *   Var(mean) = σ²_between / tasks + σ²_within / (tasks · repeats)
 * Note that repeats only ever divide the within term. Once σ²_between
 * dominates, additional repeats on the same tasks stop buying precision,
 * which is the most commonly ignored fact in this whole area.
 */
export function seOfMean({ betweenVar, withinVar, tasks, repeats }) {
  if (!(tasks > 0 && repeats > 0)) throw new RangeError('seOfMean: tasks and repeats must be > 0');
  return Math.sqrt(betweenVar / tasks + withinVar / (tasks * repeats));
}

/**
 * Given a fixed run budget, the tasks × repeats split minimising the standard
 * error of a condition mean. Returns the full ranked grid so the shape of the
 * trade-off is visible rather than just its argmin.
 *
 * THE ANSWER IS ALWAYS ONE REPEAT, and it is worth understanding why rather
 * than treating it as a quirk. With the budget fixed at R = tasks · repeats,
 *
 *   Var(mean) = σ²_b / tasks + σ²_w / R
 *
 * and the second term does not depend on the split at all. So every run spent
 * repeating a task you already have is a run not spent on a task you do not,
 * and maximising tasks wins at every ICC.
 *
 * The consequence is counter-intuitive and it is the main practical finding of
 * this module: **repeats do not buy precision, they buy a variance estimate.**
 * Running the same prompt into the same situation twice tells you how noisy
 * the model is; it does not help you beat that noise. Beating it takes more
 * distinct situations.
 *
 * Which is why `repeats: 1` is a trap for a different reason: at one repeat
 * per task, dfWithin = 0 and σ²_within is not estimable at all. You need
 * repeats on some tasks to know the noise, and tasks everywhere else to
 * outrun it. `minRepeats` defaults to 1 so the grid shows the true optimum,
 * and `finding` says out loud what that optimum costs you.
 */
export function allocate({ betweenVar, withinVar, budget, minRepeats = 1, maxRepeats = 12 }) {
  const options = [];
  for (let r = minRepeats; r <= maxRepeats; r++) {
    const tasks = Math.floor(budget / r);
    if (tasks < 2) continue;
    options.push({
      repeats: r, tasks, runs: tasks * r,
      se: seOfMean({ betweenVar, withinVar, tasks, repeats: r }),
    });
  }
  if (!options.length) throw new RangeError('allocate: budget too small for 2 tasks');
  options.sort((a, b) => a.se - b.se);
  const best = options[0];
  return {
    best, options,
    varianceEstimable: best.repeats >= 2,
    finding: best.repeats === 1
      ? 'Optimum is 1 repeat: with the budget fixed, the within-task term is constant, '
        + 'so every repeat is a task forgone. But at 1 repeat dfWithin = 0 and σ²_within '
        + 'cannot be estimated, so run a separate variance pilot rather than folding '
        + 'repeats into the comparison.'
      : 'Optimum uses repeats, which happens only under constraints beyond a plain run budget.',
  };
}

/**
 * Standard error of a PAIRED difference between two conditions run on the same
 * tasks. The task effect cancels, so what remains is the task × condition
 * interaction (does this condition suit this task?) plus run-to-run noise:
 *
 *   Var(mean difference) = ( σ²_interaction + 2σ²_within / repeats ) / tasks
 */
export function pairedComparisonSe({ interactionVar, withinVar, tasks, repeats }) {
  if (!(tasks > 0 && repeats > 0)) throw new RangeError('pairedComparisonSe: tasks and repeats must be > 0');
  return Math.sqrt((interactionVar + (2 * withinVar) / repeats) / tasks);
}

/**
 * The same allocation question for a paired two-condition comparison, where
 * the budget buys 2 · tasks · repeats runs.
 *
 * The conclusion matches `allocate` and for the same reason: substituting
 * tasks = R/(2·repeats) gives Var ∝ (2·repeats·σ²_int + 4σ²_within)/R, which
 * is increasing in repeats, and flat only when the interaction term is zero.
 * More distinct tasks, not more repeats of the same one.
 */
export function allocateComparison({ interactionVar, withinVar, budget, maxRepeats = 12 }) {
  const options = [];
  for (let r = 1; r <= maxRepeats; r++) {
    const tasks = Math.floor(budget / (2 * r));
    if (tasks < 2) continue;
    options.push({
      repeats: r, tasks, runs: 2 * tasks * r,
      se: pairedComparisonSe({ interactionVar, withinVar, tasks, repeats: r }),
    });
  }
  if (!options.length) throw new RangeError('allocateComparison: budget too small for 2 tasks per arm');
  options.sort((a, b) => a.se - b.se);
  return {
    best: options[0], options,
    interactionFlat: interactionVar === 0,
  };
}

// ── 4. the variance pilot ─────────────────────────────────────────────

/**
 * The run to buy first. One condition, `tasks` tasks, `repeats` repeats each,
 * which yields the variance components everything above needs as input.
 *
 * Defaults of 8 × 3 = 24 runs cost little enough not to need a decision.
 *
 * WHAT IT DOES NOT DO. This function originally claimed to buy the variance
 * components. Simulating it (ken/lab/simulate.mjs, written up at /wp1) showed
 * otherwise: at a true ICC of 0.5 a pilot this size returns a 95% interval of
 * roughly [0.00, 0.80], and at a true 0.2 it returns exactly zero a quarter of
 * the time because the moment estimator is clamped. Reallocating the same 24
 * runs does not help; the limit is the run count.
 *
 * What it IS well powered for is checking whether the model holds at all: the
 * same 24 runs detect a two-SD bimodal separation about 69% of the time and a
 * three-SD one every time. Use it for that, and treat estimating ICC to a
 * useful width (~144 runs) as a separate, deliberate spend.
 */
export function variancePilot({ tasks = 8, repeats = 3, costPerRun = null } = {}) {
  const runs = tasks * repeats;
  return {
    tasks, repeats, runs,
    dfBetween: tasks - 1,
    dfWithin: runs - tasks,
    cost: costPerRun == null ? null : runs * costPerRun,
    note: 'One condition only. SCOPE REVISED: simulation (see ken/lab/simulate.mjs and '
        + '/wp1) shows a pilot this size returns a 95% interval on ICC of about [0.00, 0.80] '
        + 'at a true 0.5, so it is a MODEL CHECK, not a parameter estimate. Reaching an '
        + 'interval of +/-0.16 takes about 144 runs.',
  };
}

// ── 5. exact randomisation inference ──────────────────────────────────

/**
 * The lady tasting tea (Fisher 1935, ch. 2), by enumeration rather than
 * simulation. `n` cups, half of each kind; returns the exact null
 * distribution over the number of correctly identified cups.
 *
 * The design lesson is in the p column: at six cups the smallest achievable
 * p-value is 1/20 = 0.05, which cannot clear a 0.05 threshold. Eight cups is
 * the smallest design that can produce a significant result at all.
 */
export function ladyTastingTea(n = 8) {
  if (n % 2 !== 0) throw new RangeError('ladyTastingTea: n must be even');
  const k = n / 2;
  const total = choose(n, k);
  const rows = [];
  // choosing j of the k true cups correctly leaves k-j wrong picks
  for (let j = 0; j <= k; j++) {
    const ways = choose(k, j) * choose(n - k, k - j);
    rows.push({ correct: j, ways });
  }
  let atLeast = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    atLeast += rows[i].ways;
    rows[i].pAtLeast = atLeast / total;
  }
  return { n, k, total, rows, smallestP: rows[rows.length - 1].pAtLeast };
}

/**
 * Exact two-sample permutation test on the difference of means, by full
 * enumeration of the C(N, n_a) assignments. Refuses above `maxAssignments`
 * rather than silently switching to sampling, because a p-value from an
 * undisclosed Monte Carlo is not the same object.
 */
export function permutationTest(a, b, { maxAssignments = 200000 } = {}) {
  const all = [...a, ...b];
  const N = all.length;
  const na = a.length;
  const assignments = choose(N, na);
  if (assignments > maxAssignments) {
    throw new RangeError(
      `permutationTest: ${assignments} assignments exceeds maxAssignments=${maxAssignments}. ` +
      'Raise the cap deliberately or use a sampling test and say so in the report.');
  }

  const observed = Math.abs(mean(a) - mean(b));
  const total = all.reduce((s, x) => s + x, 0);
  let extreme = 0;

  const idx = [];
  const walk = (start, depth, sumA) => {
    if (depth === na) {
      const mA = sumA / na;
      const mB = (total - sumA) / (N - na);
      if (Math.abs(mA - mB) >= observed - 1e-12) extreme++;
      return;
    }
    for (let i = start; i <= N - (na - depth); i++) {
      idx.push(i);
      walk(i + 1, depth + 1, sumA + all[i]);
      idx.pop();
    }
  };
  walk(0, 0, 0);

  return { observed, assignments, extreme, p: extreme / assignments };
}

// ── 6. stopping early without lying about it ──────────────────────────

/**
 * Wald's sequential probability ratio test boundaries (1945).
 * Accumulate the log-likelihood ratio; stop for H1 above `upper`, for H0
 * below `lower`, otherwise draw another observation.
 *
 * The boundaries depend only on the error rates you are willing to accept,
 * which is what makes early stopping honest: the rule is fixed in advance
 * rather than chosen once the numbers look encouraging.
 */
export function sprtBounds({ alpha = 0.05, beta = 0.2 } = {}) {
  return {
    alpha, beta,
    lower: Math.log(beta / (1 - alpha)),
    upper: Math.log((1 - beta) / alpha),
  };
}

// ── 7. what it costs ──────────────────────────────────────────────────

/**
 * The bill, for a paired and an unpaired version of the same claim.
 * `conditions` is how many arms are being compared; a comparison of c
 * conditions needs c(c−1)/2 pairwise contrasts, though a single ANOVA-style
 * design shares runs across them, so this reports the pairwise-worst case and
 * the shared-design case separately.
 */
export function costToDetect({
  d, rho = 0.5, alpha = 0.05, power = 0.8, tails = 2,
  costPerRun, conditions = 2,
}) {
  if (!(costPerRun >= 0)) throw new RangeError('costToDetect: costPerRun is required');
  const cmp = designComparison({ d, rho, alpha, power, tails });
  const contrasts = (conditions * (conditions - 1)) / 2;
  const sharedRuns = (cmp.pairedObservations / 2) * conditions;
  return {
    ...cmp,
    conditions,
    contrasts,
    unpairedCost: cmp.unpairedObservations * costPerRun,
    pairedCost: cmp.pairedObservations * costPerRun,
    sharedDesignRuns: Math.ceil(sharedRuns),
    sharedDesignCost: Math.ceil(sharedRuns) * costPerRun,
    pairwiseWorstCaseRuns: cmp.pairedObservations * contrasts,
  };
}

/** A cost curve across effect sizes, for deciding what is worth claiming. */
export function costCurve({
  ds = [0.2, 0.3, 0.5, 0.8, 1.2], rho = 0.5, costPerRun,
  alpha = 0.05, power = 0.8, conditions = 2,
}) {
  return ds.map((d) => costToDetect({ d, rho, alpha, power, costPerRun, conditions }));
}
