/* ─────────────────────────────────────────────────────────────────────
   ken/lab/seeded.mjs — pricing H9 before running it.

   graph/equivalence.mjs turns three numbers into an exchange rate. Two of
   the three have no instrument, so this file builds one and then asks the
   only question that matters about it: how much does it cost to be RIGHT,
   where right means landing on the correct side of the feasibility
   boundary rather than reporting a plausible g.

   ── THE INSTRUMENT ───────────────────────────────────────────────────

   Seed k known defects into the setup artefact. Run the chain. A turn at
   gap k from the seed removes a live defect with probability
   g * lambda^(k-1), so pooling over gaps gives a method-of-moments
   estimate that needs no likelihood:

       g-hat = total removals / SUM over gaps of ( live * lambda^(gap-1) )

   The denominator is exposure: how many chances there were, discounted by
   how much of the defect's context still reached the turn that had them.

   THE SEEDS MUST NOT BE ANNOUNCED. A turn told the artefact contains
   twelve planted faults hunts for twelve planted faults, and what comes
   back is the hunting rate rather than the working rate. This is the same
   discipline the attenuation probe needed and it fails the same way, so
   it is a stated precondition of H9 and not a footnote.

   ── WHAT THE SIMULATION IS FOR ───────────────────────────────────────

   The exchange rate is a STEP function of g and it has a discontinuity at
   the feasibility boundary, where the answer changes from a number to
   never. An estimator good enough for a plot can therefore be useless for
   the decision, and a study sized on parameter precision alone would not
   notice. So the reported quantity here is the VERDICT accuracy: how often
   a run of this size puts the exchange rate in the right band.
   ───────────────────────────────────────────────────────────────────── */
import { mulberry32 } from '../graph/rng.mjs';
import { exchangeRate } from '../graph/equivalence.mjs';

/**
 * One seeded run. k defects planted at the source, `turns` later turns
 * each getting a discounted chance at whatever is still live.
 *
 * Returns the sufficient statistics rather than the estimate, so a caller
 * can pool runs before estimating, which is what the design does.
 */
export function seededRun({ k, q, lambda, turns, rng }) {
  let live = k;
  let removals = 0, exposure = 0;
  for (let gap = 1; gap <= turns; gap++) {
    const p = q * lambda ** (gap - 1);
    exposure += live * lambda ** (gap - 1);
    let caught = 0;
    for (let i = 0; i < live; i++) if (rng() < p) caught++;
    removals += caught;
    live -= caught;
  }
  return { removals, exposure, live, k, turns };
}

/** g-hat from pooled sufficient statistics, or null when nothing was exposed. */
export function estimate({ removals, exposure }) {
  if (!(exposure > 0)) return null;
  const q = removals / exposure;
  return q > 1 ? 1 : Math.round(q * 10000) / 10000;
}

/**
 * The three answers the programme can act on. A number is not one of
 * them: told the exchange rate is 22 rather than 26, nobody does anything
 * differently. Told it is 5 rather than never, everything changes.
 */
export const VERDICTS = ['six suffices', 'more than six', 'never'];

/** Which of the three an exchange rate falls into. */
export function verdictOf(n, budget = 6) {
  if (n === null) return 'never';
  return n <= budget ? 'six suffices' : 'more than six';
}

/**
 * The sampling distribution of g-hat, and — the reason this file exists —
 * of the VERDICT it implies.
 *
 * Two accuracies are reported and they differ enormously. The three-way
 * verdict is the decision the programme faces. The numeric agreement is
 * what a study sized on parameter precision would have chased, and near
 * the feasibility boundary it is unattainable at any price, because the
 * exchange rate genuinely IS steep there. That is a property of the
 * question rather than a defect of the instrument, and the design's
 * answer to it is to report the side rather than the number.
 */
export function simulateSeeded({
  k = 12, lambda = 0.6, g = 0.45, h = 0.7, turns = 5, runs = 3,
  trials = 1500, seed = 17, verdictTol = 0.25, budget = 6,
} = {}) {
  const rng = mulberry32(seed);
  const truth = exchangeRate({ lambda, g, h });
  const trueVerdict = verdictOf(truth.n, budget);
  const ests = [];
  let numeric = 0, threeWay = 0, falseFinite = 0, falseNever = 0;
  for (let t = 0; t < trials; t++) {
    let removals = 0, exposure = 0;
    for (let r = 0; r < runs; r++) {
      const s = seededRun({ k, q: g, lambda, turns, rng });
      removals += s.removals; exposure += s.exposure;
    }
    const gHat = estimate({ removals, exposure });
    if (gHat === null) continue;
    ests.push(gHat);
    const got = exchangeRate({ lambda, g: gHat, h });
    if (verdictOf(got.n, budget) === trueVerdict) threeWay++;
    if (truth.n === null && got.n === null) numeric++;
    else if (truth.n !== null && got.n !== null
      && Math.abs(got.n - truth.n) <= Math.max(1, verdictTol * truth.n)) numeric++;
    else if (truth.n === null && got.n !== null) falseFinite++;
    else falseNever++;
  }
  ests.sort((a, b) => a - b);
  const qt = (p) => (ests.length ? ests[Math.min(ests.length - 1, Math.floor(p * ests.length))] : null);
  const mean = ests.length ? ests.reduce((a, b) => a + b, 0) / ests.length : null;
  return {
    settings: { k, lambda, g, h, turns, runs, trials, verdictTol, budget },
    turnsSpent: runs * (turns + 1),
    truth: truth.n, truthReachable: truth.reachable, trueVerdict,
    median: qt(0.5), lo: qt(0.025), hi: qt(0.975),
    width: qt(0.975) === null ? null : round(qt(0.975) - qt(0.025)),
    bias: mean === null ? null : round(mean - g),
    verdictAccuracy: round(threeWay / ests.length),
    numericAccuracy: round(numeric / ests.length),
    falseFinite, falseNever,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * Verdict accuracy against study size, at a g far from the boundary and a
 * g close to it. The gap between those two columns is the finding: the
 * same study is decisive in one place and useless in the other, and where
 * we sit is not known in advance.
 */
export function costLadder({ lambda = 0.6, h = 0.7, turns = 5, seed = 23 } = {}) {
  const rows = [];
  for (const [k, runs] of [[6, 1], [12, 1], [12, 2], [12, 3], [20, 3], [20, 6], [40, 6]]) {
    const easy = simulateSeeded({ k, runs, lambda, g: 0.65, h, turns, trials: 1200, seed });
    const hard = simulateSeeded({ k, runs, lambda, g: 0.32, h, turns, trials: 1200, seed: seed + 1 });
    rows.push({
      k, runs, turns: runs * (turns + 1),
      easyWidth: easy.width, easyVerdict: easy.verdictAccuracy, easyNumeric: easy.numericAccuracy,
      hardWidth: hard.width, hardVerdict: hard.verdictAccuracy, hardNumeric: hard.numericAccuracy,
    });
  }
  return { rows, lambda, h, boundaryNote: 'the feasibility boundary at this lambda sits at g = 0.28, so the hard column is 0.04 above it' };
}
