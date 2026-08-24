/* ─────────────────────────────────────────────────────────────────────
   ken/lab/probe.mjs — measuring what an agent still has, without telling
   it to keep anything.

   THE DESIGN THAT DOES NOT WORK, and it was the first one proposed:
   plant k constraints in the setup brief, say "carry these forward", and
   count survivors. That measures compliance with an instruction to copy.
   Tell a chain to preserve pi to twenty places and it will preserve pi to
   twenty places, and lambda comes back at 1 having measured nothing.

   THE QUANTITY WE ACTUALLY WANT is the one you would fail on if asked
   today how the literature search for module three went. It was
   load-bearing when it happened. Nobody told you to keep it. It is not
   your current task. And you cannot bluff it, because there was a
   specific answer.

   ── WHAT A RESIDUE HAS TO BE ─────────────────────────────────────────

   Four properties, and dropping any one breaks the measurement:

     INCIDENTAL      never named in any brief as something to carry. The
                     moment it is named, this becomes a copying test.
     LOAD-BEARING    it mattered when it was produced. Noise decays too,
                     and its decay tells you nothing.
     RECOVERABLE     there is a well-posed question whose answer is it,
                     scoreable without a judge.
     NOT GUESSABLE   a fresh agent given only the task cannot produce it.
                     This one is not assumed. It is MEASURED, by the
                     floor arm below, and subtracted.

   ── THE FLOOR ARM IS THE WHOLE DESIGN ────────────────────────────────

   A descendant asked "which files did the first turn read" can guess.
   Some guesses are right, because plausible files are often the real
   ones. Without a control that guessing rate is scored as memory and
   lambda is inflated toward 1 — the same failure as the pi design, by a
   quieter route.

   So every probe runs a FLOOR arm: an agent with no lineage at all, given
   the task statement only, asked the same question. Its recall f is what
   the question is worth to somebody who was never there. Retention is
   measured above f, never against zero.

       recall(d) = f + (1 - f) * lambda^(d-1)

   At d = 1 recall is 1 by construction, so the fit has one free
   parameter and the floor is measured rather than fitted.
   ───────────────────────────────────────────────────────────────────── */

import { mulberry32 } from '../graph/rng.mjs';

/**
 * The residue kinds this instrument can score, in the order they are
 * worth trying. Each is a SET, never a token: a set can be scored by
 * overlap without a judge, and a single memorable token is exactly the
 * salience trap.
 */
export const RESIDUES = {
  readSet: {
    name: 'files read and not changed',
    how: 'the harness already logs every file each turn opened. The first turn reads a dozen '
      + 'and changes two; the ten it read and left alone are residue.',
    incidental: 'no brief mentions reading, only the task',
    loadBearing: 'the decision was made by reading them',
    scoring: 'set overlap against the tool log, which is ground truth and needs no annotation',
    guessable: 'partly — a later turn can name plausible files, which is what the floor arm measures',
  },
  rejected: {
    name: 'alternatives considered and rejected',
    how: 'the first turn is asked to weigh several approaches and proceed with one. Its handoff '
      + 'carries the choice. The others, and the ground for dropping them, are residue.',
    incidental: 'the brief asks for a choice, never for a record of the rejects',
    loadBearing: 'the choice was made against them',
    scoring: 'set overlap against the first turn`s own stated list',
    guessable: 'a fresh agent can propose alternatives, and some will coincide. The floor arm '
      + 'measures exactly that coincidence.',
  },
  obstacles: {
    name: 'errors hit and worked around',
    how: 'failures the first turn recovered from without the fix reaching the artefact: a wrong '
      + 'path, a stale cache, a flag that did not exist.',
    incidental: 'never mentioned; the artefact records the fix, not the stumble',
    loadBearing: 'they cost real turns',
    scoring: 'set overlap against the transcript',
    guessable: 'least of the three, since a fresh agent has no reason to invent our exact errors',
  },
};

/**
 * Recall of one probe: how much of the residue the descendant produced.
 * Set overlap, so no judge is involved and B3 stays off the critical path.
 */
export function recall(reported, truth) {
  const t = new Set(truth);
  if (!t.size) return null;
  const hits = new Set([...new Set(reported)].filter((x) => t.has(x)));
  return { k: t.size, hits: hits.size, recall: hits.size / t.size };
}

/**
 * Fit lambda to a decay curve, correcting for the floor.
 *
 *   recall(d) = f + (1 - f) lambda^(d-1)
 *
 * so (recall - f) / (1 - f) = lambda^(d-1), and lambda is the slope of
 * the log of that against d - 1. Depth 1 carries no information about
 * lambda and is dropped: it is 1 by construction.
 *
 * Returns null rather than a number when the data cannot support a fit,
 * which is the case that matters and is the one a naive estimator would
 * paper over with a plausible-looking value.
 */
export function fitLambda(points, floor) {
  if (!(floor >= 0 && floor < 1)) return { lambda: null, reason: 'floor must be in [0, 1)' };
  const usable = points
    .filter((p) => p.depth >= 2)
    .map((p) => ({ x: p.depth - 1, y: (p.recall - floor) / (1 - floor) }))
    .filter((p) => p.y > 0);          // a zero or negative survives no log
  if (usable.length < 2) {
    return {
      lambda: null,
      reason: `only ${usable.length} usable depth(s) above the floor — lambda is not identified`,
      usable: usable.length,
    };
  }
  // least squares through the origin on log y = (d-1) log lambda
  const num = usable.reduce((s, p) => s + p.x * Math.log(p.y), 0);
  const den = usable.reduce((s, p) => s + p.x * p.x, 0);
  const lambda = Math.exp(num / den);
  return { lambda: clamp(lambda), reason: null, usable: usable.length, floor };
}

const clamp = (x) => Math.max(0, Math.min(1, Math.round(x * 1000) / 1000));

// ── simulate before running, which is R13 ─────────────────────────────

/**
 * One simulated chain: k residue items, true lambda, true floor, depth D.
 *
 * Each item at depth d is reported with probability f + (1-f) lambda^(d-1),
 * drawn independently. That is the model the estimator assumes, so this
 * measures the estimator's precision rather than its robustness, and the
 * limits section says so.
 */
export function simulateChain({ k, lambda, floor, depth, rng }) {
  const points = [];
  for (let d = 1; d <= depth; d++) {
    const p = floor + (1 - floor) * lambda ** (d - 1);
    let hits = 0;
    for (let i = 0; i < k; i++) if (rng() < p) hits++;
    points.push({ depth: d, recall: hits / k });
  }
  return points;
}

/**
 * The sampling distribution of lambda-hat over `trials` replications of
 * `chains` chains. Deterministic in `seed`, per the house rule.
 */
export function simulateFit({
  k = 10, lambda = 0.6, floor = 0.2, depth = 6, chains = 1,
  floorK = 10, trials = 2000, seed = 11,
} = {}) {
  const rng = mulberry32(seed);
  const ests = [];
  let unidentified = 0;
  for (let t = 0; t < trials; t++) {
    // pool the chains at each depth
    const pooled = [];
    for (let d = 1; d <= depth; d++) pooled.push({ depth: d, hits: 0, n: 0 });
    for (let c = 0; c < chains; c++) {
      const pts = simulateChain({ k, lambda, floor, depth, rng });
      pts.forEach((p, i) => { pooled[i].hits += p.recall * k; pooled[i].n += k; });
    }
    // the floor arm is itself estimated, from floorK draws
    let fh = 0;
    for (let i = 0; i < floorK; i++) if (rng() < floor) fh++;
    const fHat = fh / floorK;
    const fit = fitLambda(pooled.map((p) => ({ depth: p.depth, recall: p.hits / p.n })),
      Math.min(fHat, 0.95));
    if (fit.lambda === null) { unidentified++; continue; }
    ests.push(fit.lambda);
  }
  ests.sort((a, b) => a - b);
  const q = (p) => (ests.length ? ests[Math.min(ests.length - 1, Math.floor(p * ests.length))] : null);
  const mean = ests.length ? ests.reduce((a, b) => a + b, 0) / ests.length : null;
  return {
    settings: { k, lambda, floor, depth, chains, floorK, trials },
    n: ests.length,
    unidentified,
    median: q(0.5),
    lo: q(0.025),
    hi: q(0.975),
    width: q(0.975) !== null ? round(q(0.975) - q(0.025)) : null,
    bias: mean === null ? null : round(mean - lambda),
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * What it takes to pin lambda to a stated width. The answer to "how many
 * chain runs", computed rather than asserted, because the first version
 * of H8 claimed one run without checking.
 */
export function costToPin({ target = 0.2, lambda = 0.6, floor = 0.2, k = 10, depth = 6, seed = 5 } = {}) {
  const rows = [];
  for (const chains of [1, 2, 3, 5, 8, 12, 20]) {
    const s = simulateFit({ k, lambda, floor, depth, chains, floorK: k * chains, trials: 1500, seed });
    rows.push({ chains, turns: chains * depth, width: s.width, bias: s.bias, unidentified: s.unidentified });
  }
  const first = rows.find((r) => r.width !== null && r.width <= target);
  return { target, rows, enough: first ?? null };
}
