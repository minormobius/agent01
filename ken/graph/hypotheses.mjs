/* ─────────────────────────────────────────────────────────────────────
   ken/graph/hypotheses.mjs — THE HYPOTHESES, as data.

   They were prose in two papers with no status anywhere, so a reader had
   to reconstruct what was still open by reading both and the log. This
   is the same move refs.js made for the bibliography: one definition,
   rendered wherever it is needed, and the selftest asserts the pages
   agree with it.

   THE STATUS FIELD IS THE POINT. A hypothesis with no recorded outcome
   is indistinguishable from one nobody got round to, and this programme
   is exactly the kind that accumulates the second sort. Every entry
   carries `status`, and `open` is a claim that must be kept true.

   Values for `status`:
     untested    stated, nothing run, nothing computed
     designed    a design exists and is priced, no data
     supported   evidence consistent with it, with the evidence named
     undecided   measured, and the measurement does not decide it
     refuted     evidence against it, with the evidence named
   ───────────────────────────────────────────────────────────────────── */

export const HYPOTHESES = {
  H1: {
    id: 'H1', name: 'structure', curriculumUnit: 'II', owner: '/wp1',
    outcome: "Sarle's bimodality coefficient per task.",
    analysisUnit: 'the task',
    claim: 'Per-task quality scores are unimodal rather than bimodal.',
    test: "Sarle's bimodality coefficient against the uniform reference of 5/9.",
    refutedBy: ['A coefficient above 5/9 on tasks with enough runs to see it.',
      'Or a run count too small to distinguish the two, which makes it untestable rather than false.'],
    status: 'untested',
    evidence: null,
    cost: 'a 24-run pilot detects a 2-SD separation 69% of the time and a 3-SD one always',
  },

  H2: {
    id: 'H2', name: 'magnitude', curriculumUnit: 'II', owner: '/wp1',
    outcome: 'The intraclass correlation of quality by cell, with its interval.',
    analysisUnit: 'the cell',
    claim: 'ICC ≥ 0.5, so most variation is task difficulty and pairing pays.',
    test: 'Variance components from a replicated pilot.',
    refutedBy: ['An interval whose upper bound falls below 0.5.',
      'The point estimate alone does not do it, which is why the status below is undecided.'],
    /* Measured after WP1 was published, and WP1 did not say so until the
       addendum. The point estimate sits below 0.5 and the interval spans
       almost the whole parameter range, so it decides nothing either way.
       Recording that as `undecided` rather than `refuted` matters: the
       stated refutation condition is not met. */
    status: 'undecided',
    evidence: 'ICC of judged quality by cell is 0.413, 95% interval [0.00, 0.88], from 56 verdicts '
      + 'over 28 pairs of the 12 race-02 entries. The point estimate is below 0.5; the interval '
      + 'does not exclude either side, so the stated refutation condition is not met.',
    cost: 'reaching ±0.16 on the ICC takes 144 runs',
  },

  H3: {
    id: 'H3', name: 'allocation', curriculumUnit: 'II', owner: '/wp1',
    outcome: 'The standard error of the mean at each allocation.',
    analysisUnit: 'the allocation',
    claim: 'At a fixed run budget the standard error is minimised at one repeat per task.',
    test: 'The algebra, then simulation against it.',
    refutedBy: ['A simulated allocation beating one repeat by more than simulation error.',
      'Or a budget model where repeats and tasks do not trade one for one.'],
    status: 'supported',
    evidence: 'Predicted and simulated SE agree to about 1% across six allocations, and one repeat '
      + 'wins at every ICC, as the algebra requires. Settled without spending a run.',
    cost: 'nothing; it is a claim about the estimator',
  },

  H4: {
    id: 'H4', name: 'exchangeability', curriculumUnit: 'II', owner: '/log',
    outcome: 'Turn duration by within-task position.',
    analysisUnit: 'the turn',
    claim: 'Runs of one task are exchangeable: no drift, no within-task order effect.',
    test: 'Permutation test on within-task position, with a leave-one-out sweep.',
    refutedBy: ['An order effect that survives dropping any single task.',
      'Or drift across the run that survives controlling for task composition.'],
    status: 'supported',
    evidence: 'Pooled slope −0.47 log-seconds per position (p = 0.012, 20,000 shuffles), but dropping '
      + 'lp-16d590 takes it to −0.10 at p = 0.17 while six other leave-one-outs move it under 0.1. '
      + 'The effect is one bead whose four runs were all gate failures. Exploratory: the outcome is '
      + 'duration, because the loop recorded no quality scores.',
    cost: 'already paid, since it reuses the loop ledger',
  },

  H5: {
    id: 'H5', name: 'position', curriculumUnit: 'IV', owner: '/wp2',
    outcome: 'Of k constraints planted in the setup brief, how many the sink still honours.',
    analysisUnit: 'the turn, not the run — so one run yields six observations and runs are blocks',
    claim: 'Fidelity to the original brief falls with the ken ratio, and depth acts only through it.',
    test: 'Plant k constraints in the setup brief; count how many the sink still honours. '
      + 'chain against briefed, the same task run as both, paired.',
    predicts: [
      ['briefed > chain', 'same six turns, same depth, ken 1.00 against 0.33'],
      ['bottleneck ~ chain', 'ken matched at 0.33 while depth differs, 3 against 5'],
      ['star > bottleneck', 'depth matched near the shallow end, ken 0.83 against 0.33'],
    ],
    refutedBy: [
      'bottleneck and chain differ once ken is matched, which would mean depth acts on its own.',
      'briefed and chain do not differ, which would make the ratio decorative.',
      "The ordering holds but tracks the sink's in-degree alone, which is cheaper to compute and would make the ratio surplus.",
      'The run is found not to have been isolated, in which case nothing was tested and the result is void rather than null.',
    ],
    /* Added at revision 19. Without this the independent variable has no
       variance: see visibility.mjs. Stated as a requirement rather than a
       limitation, because a run that does not meet it does not test this. */
    requires: 'The isolated regime. Each turn receives its in-edges and nothing else, with no inherited worktree and no readable history. Under lineage or sharing the ken ratio is 1 for every turn of every shape and this hypothesis is undefined.',
    status: 'designed',
    evidence: null,
    cost: '180 turns paired at d = 0.8, and the manipulation is four edges and no extra turns. '
      + 'But the effect size depends on lambda, which H8 measures for one chain run: the gap runs '
      + 'from 0.667 at lambda 0 to 0.079 at lambda 0.95, so H8 should be run first because it '
      + 'prices this.',
  },

  H6: {
    id: 'H6', name: 'symmetry', curriculumUnit: 'IV', owner: '/wp2',
    outcome: 'The standard error of a within-run contrast, measured, against the value deff predicts from orbit size.',
    analysisUnit: 'the run, comparing observed SE to predicted SE',
    claim: 'Turns in one automorphism orbit are exchangeable, so the largest orbit is replication '
      + 'the run already contains.',
    test: 'The measured standard error of a within-run contrast against the value the design '
      + 'effect predicts from orbit size.',
    predicts: [
      ['SE(star) / SE(chain) = sqrt(1.00 / 1.79) = 0.75', 'from orbit sizes 4 and 1 at rho = 0.413, before any data'],
      ['within-orbit variance does not depend on which member', 'that is the exchangeability claim itself'],
      ['between-orbit contrasts stay confounded with position', 'no shape rescues those'],
    ],
    refutedBy: [
      'The observed SE ratio departs from the predicted one, so orbit members are not exchangeable after all.',
      'Within-orbit variance depends on member identity, say w1 always beating w4, which would mean dispatch order leaks and the orbit is not one in practice.',
    ],
    /* Added at revision 19. Without this the independent variable has no
       variance: see visibility.mjs. Stated as a requirement rather than a
       limitation, because a run that does not meet it does not test this. */
    requires: 'The isolated regime. Each turn receives its in-edges and nothing else, with no inherited worktree and no readable history. Under lineage or sharing the ken ratio is 1 for every turn of every shape and this hypothesis is undefined.',
    status: 'designed',
    evidence: null,
    cost: 'no extra turns, being a re-analysis of any run of a shape whose largest orbit exceeds one',
  },

  H7: {
    id: 'H7', name: 'ancestry', curriculumUnit: 'IV', owner: '/wp2',
    outcome: 'Within-cell variance of a digest class, pooled across shapes against pooled within one.',
    analysisUnit: 'the ancestry class',
    claim: 'Turns with equal ancestry digests are the same experimental condition, across '
      + 'different plans as well as within one.',
    test: 'Pool by digest across a catalogue run and compare the within-cell variance to the '
      + 'within-shape variance for the same cell.',
    predicts: [
      ['the 13-turn cross-shape cell behaves as one condition', 'its within-cell variance matches the within-shape variance for the same digest'],
      ['the six sources form a second cell at deff exactly 1', 'one per run, so they are independent'],
    ],
    refutedBy: [
      'Cross-shape pooling shows more variance than within-shape pooling of the same digest.',
      'That would mean the runner leaks something the plan does not contain, which is an R15 violation rather than a fact about agents.',
    ],
    /* Added at revision 19. Without this the independent variable has no
       variance: see visibility.mjs. Stated as a requirement rather than a
       limitation, because a run that does not meet it does not test this. */
    requires: 'The isolated regime. Each turn receives its in-edges and nothing else, with no inherited worktree and no readable history. Under lineage or sharing the ken ratio is 1 for every turn of every shape and this hypothesis is undefined.',
    status: 'designed',
    evidence: null,
    cost: 'nothing beyond running the catalogue, which H5 already pays for',
  },

  H8: {
    id: 'H8', name: 'attenuation', curriculumUnit: 'IV', owner: '/wp2',
    outcome: 'The survival curve of k constraints planted at the source, counted at each depth '
      + 'of a chain, and the decay rate lambda fitted to it.',
    analysisUnit: 'the hop — one observation per depth per planted constraint',
    claim: 'What an agent receives from an ancestor decays geometrically in the number of hops, '
      + 'at a rate lambda that is a property of the handoff and the regime rather than of the shape.',
    test: 'One chain run. Plant k distinguishable constraints in the setup brief and count how '
      + 'many survive at each depth. Fit lambda to the decay. Repeat on a second shape to check '
      + 'lambda does not move with it.',
    predicts: [
      ['survival is geometric in depth', 'a straight line on a log scale, not a cliff and not flat'],
      ['lambda is the same on a chain and on a bottleneck', 'it is a property of the handoff, not the plan'],
      ['lambda under sharing is near 1', 'nothing is lost when nothing is withheld, which is the control'],
    ],
    /* This is the parameter every shape claim on this site turns out to
       depend on, and nobody had measured it. It also dissolves the
       isolated-versus-lineage argument: those are lambda = 0 and
       lambda = 1, and the truth is a number between them. */
    refutedBy: [
      'Survival does not decay geometrically, in which case one rate does not describe the handoff and the model is wrong rather than imprecise.',
      'lambda differs by shape, which would mean it is not a property of the handoff and cannot be carried between designs.',
      'lambda is indistinguishable from 1, which would make every skip edge worthless and H5 undefined.',
      'lambda is indistinguishable from 0, which would mean nothing survives a hop and the published ken ratio was right all along.',
    ],
    requires: 'Only that the run states its regime. lambda is measured for a (handoff, regime) pair '
      + 'rather than assumed, so unlike H5 this is testable in any regime — and measuring it under '
      + 'sharing is the control that should return lambda near 1.',
    status: 'designed',
    evidence: null,
    cost: 'ONE chain run, and a second to check lambda does not move with the shape. The cheapest '
      + 'experiment on this site, and it prices H5: the chain-against-briefed gap runs from 0.667 '
      + 'at lambda 0 to 0.079 at lambda 0.95.',
  },
};

export const HYPOTHESIS_IDS = Object.keys(HYPOTHESES);

export const STATUSES = ['untested', 'designed', 'undecided', 'supported', 'refuted'];

/** How many sit in each status. The shape of the programme, in one line. */
export function statusCounts() {
  const out = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const h of Object.values(HYPOTHESES)) out[h.status] += 1;
  return out;
}

/**
 * A hypothesis with evidence must name it, and one without must not
 * claim any. Asserted rather than trusted, because the failure this
 * guards against is the quiet upgrade: a status moved to `supported`
 * while the evidence field stays empty.
 */
export function auditHypotheses() {
  const problems = [];
  for (const h of Object.values(HYPOTHESES)) {
    if (!STATUSES.includes(h.status)) problems.push(`${h.id}: unknown status "${h.status}"`);
    const decided = ['supported', 'undecided', 'refuted'].includes(h.status);
    if (decided && !h.evidence) problems.push(`${h.id}: status "${h.status}" with no evidence named`);
    if (!decided && h.evidence) problems.push(`${h.id}: status "${h.status}" but evidence is recorded`);
    for (const f of ['claim', 'test', 'cost', 'owner', 'curriculumUnit', 'outcome', 'analysisUnit']) {
      if (!h[f]) problems.push(`${h.id}: missing ${f}`);
    }
    if (!Array.isArray(h.refutedBy) || h.refutedBy.length < 2) {
      problems.push(`${h.id}: needs at least two ways to lose`);
    }
    /* A shape hypothesis without a stated regime is one that can be run
       under sharing and quietly measure nothing. */
    if (h.curriculumUnit === 'IV' && !h.requires) {
      problems.push(`${h.id}: a shape hypothesis must state the regime it requires`);
    }
  }
  return problems;
}
