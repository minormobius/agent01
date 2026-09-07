/* ─────────────────────────────────────────────────────────────────────
   ken/lab/runshape.mjs — the standard run, and what a claim costs in them.

   THE SHAPE. Six turns in four stages, maximum width two:

       setup  →  wave A (2 in parallel)  →  wave B (2 in parallel)  →  cleanup

   Fixing the shape does three things measurement needs. Runs become
   comparable, because the unit of analysis is one whole run rather than
   an arbitrary stretch of turns. Cost becomes countable in advance.
   And — the part worth designing around — each wave is two agents given
   the same state at the same time, which is a matched pair.

   Pairing is the largest lever in design.mjs: it removes whatever makes a
   task hard from the difference between conditions and cuts required
   observations by (1 − ρ). A wave of two gets that for free IF the two
   agents receive identical context. If they receive different context the
   wave is two independent draws and the saving is gone, so the pairing is
   a property of how the wave is dispatched, not of the shape alone.
   ───────────────────────────────────────────────────────────────────── */
import { designComparison, mde, perArm } from './design.mjs';

export const STANDARD_RUN = {
  name: 'six-turn standard run',
  stages: [
    { stage: 'setup', width: 1, turns: 1, role: 'block', paired: false },
    { stage: 'wave A', width: 2, turns: 2, role: 'treatment', paired: true },
    { stage: 'wave B', width: 2, turns: 2, role: 'treatment', paired: true },
    { stage: 'cleanup', width: 1, turns: 1, role: 'block', paired: false },
  ],
};

export function shapeSummary(shape = STANDARD_RUN) {
  const turns = shape.stages.reduce((a, s) => a + s.turns, 0);
  return {
    name: shape.name,
    turns,
    stages: shape.stages.length,
    maxWidth: Math.max(...shape.stages.map((s) => s.width)),
    serialDepth: shape.stages.length,
    pairedSlots: shape.stages.filter((s) => s.paired).reduce((a, s) => a + s.width, 0),
    blockTurns: shape.stages.filter((s) => s.role === 'block').reduce((a, s) => a + s.turns, 0),
    treatmentTurns: shape.stages.filter((s) => s.role === 'treatment').reduce((a, s) => a + s.turns, 0),
  };
}

/**
 * What a two-condition comparison costs, counted in standard runs.
 *
 * `rho` defaults to the only value this programme has measured: 0.413, the
 * intraclass correlation of judged quality across bake-off cells. It carries
 * a 95% interval of [0.00, 0.88], so treat every figure here as an order of
 * magnitude and report the interval beside it.
 */
export const MEASURED_RHO = 0.413;
export const MEASURED_RHO_INTERVAL = [0.0, 0.88];

export function costInRuns({
  d, rho = MEASURED_RHO, alpha = 0.05, power = 0.8, shape = STANDARD_RUN,
}) {
  const turnsPerRun = shapeSummary(shape).turns;
  const cmp = designComparison({ d, rho, alpha, power });
  return {
    d, rho,
    unpairedRuns: cmp.unpairedObservations,
    pairedRuns: cmp.pairedObservations,
    unpairedTurns: cmp.unpairedObservations * turnsPerRun,
    pairedTurns: cmp.pairedObservations * turnsPerRun,
    turnsPerRun,
    saving: cmp.saving,
  };
}

/** The same question backwards: given a turn budget, what is detectable? */
export function reachWithin({ turns, rho = MEASURED_RHO, alpha = 0.05, power = 0.8, shape = STANDARD_RUN }) {
  const turnsPerRun = shapeSummary(shape).turns;
  const runs = Math.floor(turns / turnsPerRun);
  if (runs < 4) return { turns, runs, turnsPerRun, feasible: false };
  // paired: `runs` observations are runs/2 pairs, and the paired variance is
  // 2σ²(1−ρ), so the effective per-arm count is pairs / (1 − ρ).
  const pairs = Math.floor(runs / 2);
  const effectiveN = pairs / (1 - rho);
  return {
    turns, runs, pairs, turnsPerRun, feasible: true,
    detectableD: mde({ n: effectiveN, alpha, power }),
    unpairedDetectableD: mde({ n: runs / 2, alpha, power }),
  };
}

/** A ladder of budgets, for deciding what is worth claiming. */
export function budgetLadder({
  budgets = [24, 48, 96, 144, 288, 480], rho = MEASURED_RHO, shape = STANDARD_RUN,
} = {}) {
  return budgets.map((turns) => {
    const r = reachWithin({ turns, rho, shape });
    return {
      turns, runs: r.runs,
      detectableD: r.feasible ? r.detectableD : null,
      note: r.feasible ? null : 'fewer than four runs: no comparison',
    };
  });
}

/** Sanity: the sample size a fixed shape implies for a wanted effect. */
export function runsForEffect(d, opts = {}) {
  return costInRuns({ d, ...opts }).pairedRuns;
}

export { perArm };
