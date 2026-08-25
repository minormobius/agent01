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
    outcome: 'Recall of an INCIDENTAL residue at each depth of a chain, scored as set overlap '
      + 'against the harness log, minus the recall a fresh agent achieves on the same question.',
    analysisUnit: 'the residue item — k items observed at each of d depths',
    claim: 'What an agent still holds from an ancestor decays geometrically in hops, at a rate '
      + 'lambda belonging to the handoff and the regime rather than to the shape.',
    test: 'Six standard runs. The first turn of each does real work that leaves a residue it was '
      + 'never asked to keep: the files it read and did not change, the alternatives it weighed '
      + 'and dropped, the errors it worked around. At each later depth a probe asks for that '
      + 'residue and recall is scored by set overlap against the tool log. A FLOOR ARM of agents '
      + 'with no lineage answers the same question from the task statement alone; lambda is '
      + 'fitted above that floor, never against zero.',
    predicts: [
      ['recall decays geometrically above the floor', 'straight on a log scale, not a cliff and not flat'],
      ['lambda is the same on a chain and on a bottleneck', 'it belongs to the handoff, not the plan'],
      ['lambda under a shared worktree is near 1', 'nothing is lost when nothing is withheld — the control'],
      ['the floor is well above zero', 'if it were zero the residue would be unguessable, which no real residue is'],
    ],
    /* THE FAILURE THIS DESIGN EXISTS TO AVOID, and the first version of
       H8 walked straight into it. "Plant k constraints and carry them
       forward" measures compliance with an instruction to copy. Tell a
       chain to preserve pi to twenty places and it will, and lambda comes
       back at 1 having measured nothing. The residue must never be named
       in any brief, and must be a SET rather than a memorable token. */
    refutedBy: [
      'Recall does not decay geometrically above the floor, in which case one rate does not describe the handoff and the model is wrong rather than imprecise.',
      'lambda differs by shape, which would mean it is not a property of the handoff and cannot be carried between designs.',
      'The floor arm scores as well as the descendants, in which case the probe measures guessability and not retention at all.',
      'The residue turns out to have been named or implied somewhere in the briefs, in which case it is a copying test and the result is void rather than null.',
    ],
    requires: 'Only that the run states its regime, since lambda belongs to a handoff-and-regime '
      + 'pair rather than to the world. Measuring it under a shared worktree is the control, not a '
      + 'mistake. What it does require absolutely is that no brief anywhere names the residue.',
    status: 'designed',
    evidence: null,
    /* Simulated before proposing, per R13, and the simulation corrected
       the first estimate by a factor of six. */
    cost: 'THIRTY-SIX TURNS, not the one this originally claimed. Simulation puts a single '
      + 'six-turn chain at a 95% width of 0.36 on lambda, with 6% of runs failing to identify it '
      + 'at all. Six chains at forty residue items each reach a width of 0.19. Depth beyond six '
      + 'HURTS: recall reaches the floor and the extra points are noise, taking the width from '
      + '0.25 at depth 6 to 0.30 at depth 12 and the bias from -0.005 to +0.073.',
  },

  H9: {
    id: 'H9', name: 'exchange rate', curriculumUnit: 'IV', owner: '/wp3',
    outcome: 'Defect density — surviving seeded defects per turn of delivered work — for an '
      + 'unattended chain at each length, against the same quantity for a chain a person reads at '
      + 'every handoff. The reported quantity is which of three bands the crossing falls in, not '
      + 'where exactly it falls.',
    analysisUnit: 'the seeded defect, observed at each gap from the turn that introduced it',
    claim: 'Six unattended turns reach the defect density of three directed ones, and whether they '
      + 'do is decided by two rates: how much context survives a handoff, and what share of live '
      + 'defects an unattended turn removes.',
    test: 'Seed k defects into the setup artefact without announcing them. Run the chain. Score '
      + 'removals by the gap between the seeding turn and the turn that removed them, which gives '
      + 'the catch rate g discounted by the attenuation lambda that H8 measures. Run the same '
      + 'design with a person at each handoff and take that arm`s density as the target rather '
      + 'than modelling it, so h is never estimated and one unknown disappears.',
    predicts: [
      ['defect density falls with chain length and then flattens',
        'the flattening height is the residue, and it is above zero for any lambda under 1'],
      ['the directed arm keeps falling where the unattended arm has flattened',
        'a person`s context does not decay, so their later chances stay worth something'],
      ['the crossing is finite when g and lambda are both moderate and absent when both are low',
        'the two rates substitute for each other, so briefing can rescue a weak gate'],
      ['giving turns better tools moves g and not lambda',
        'a compiler or a search catches more of what a turn can already see; it does not restore what a handoff dropped'],
    ],
    /* THE FAILURE THIS DESIGN EXISTS TO AVOID is the seeded-defect twin
       of H8's: a turn told the artefact contains twelve planted faults
       hunts for twelve planted faults, and the number that comes back is
       a hunting rate rather than a working rate. */
    refutedBy: [
      'Defect density does not flatten with chain length, in which case there is no residue and the model`s central asymmetry between watched and unwatched work is wrong.',
      'The unattended arm matches the directed one at equal length, which would mean direction supplies nothing this model can see and the whole decomposition is idle.',
      'g varies with chain length rather than staying a property of the turn, which would make it not a rate and nothing here would compose.',
      'The seeded defects turn out to have been announced or inferable, in which case a hunting rate was measured and the result is void rather than null.',
    ],
    requires: 'A stated regime, as every Unit IV hypothesis does, and the seeds must be invisible: '
      + 'no brief names them, and they must be the kind of fault the task would plausibly contain. '
      + 'It also requires lambda, so H8 runs first — g is estimated by discounting exposure by '
      + 'lambda, and a wrong lambda biases g in the direction that flatters the unattended arm.',
    status: 'designed',
    evidence: null,
    /* Simulated before proposing. The simulation did not change the price
       so much as change the OUTCOME: the exchange rate is not estimable
       near its own feasibility boundary at any affordable size, because
       it is genuinely steep there. */
    cost: 'SEVENTY-TWO TURNS, half of them read by a person, at forty seeded defects across six '
      + 'six-turn chains per arm. THE SIMULATION CHANGED THE OUTCOME RATHER THAN THE PRICE. Far '
      + 'from the feasibility boundary that design calls the three-way verdict right 100% of the '
      + 'time. Near it, the same design is right 96% on the three-way verdict and only 37% on the '
      + 'exchange rate itself, because a swing of 0.05 in g moves the rate from 40 turns to 9. So '
      + 'the outcome is the band and not the number, and a study sized on parameter precision '
      + 'would have bought a figure nobody could act on.',
  },

  H10: {
    id: 'H10', name: 'the non-attenuating gate', curriculumUnit: 'IV', owner: '/wp4',
    outcome: 'Detection rate for seeded defects, by the gap between the turn that made the defect '
      + 'and the turn that ran the check, for defects inside the check`s coverage.',
    analysisUnit: 'the seeded defect at one gap',
    claim: 'An executable check does not attenuate. Its detection rate is flat in gap, where an '
      + 'unattended turn`s falls geometrically, because a check is re-run rather than remembered.',
    test: 'H9`s seeded-defect run with one turn added: a check written at turn 2 and re-run at '
      + 'every later turn. Fit detection against gap for in-coverage defects and compare the fitted '
      + 'slope with the one the same run measures for turns.',
    predicts: [
      ['in-coverage detection is flat in gap', 'a check written at turn 2 is as sharp at turn 6 as at turn 3'],
      ['out-of-coverage detection decays at the lambda H8 measured', 'the control, and it is in the same run'],
      ['the integrator`s own defects are detected at the same rate as anyone else`s',
        'a check has somebody after the last turn, which is the part WP3`s model could not have'],
      ['some passing artefacts are wrong in a way the check asserts',
        'unsoundness is not zero and this measures it directly'],
    ],
    refutedBy: [
      'In-coverage detection falls with gap, which would mean a check is remembered rather than re-run and the whole distinction collapses.',
      'In-coverage and out-of-coverage detection decay alike, in which case coverage is not the right partition and the model is wrong rather than imprecise.',
      'Detection is flat because it is flat at zero — a check nothing trips is not a gate, and the loop ledger`s probe ceiling is what that looks like.',
      'The checks turn out to have been written against the seeded defects, in which case the seeds were announced by the back door and the result is void rather than null.',
    ],
    requires: 'A stated regime, and the same absolute condition as H9: no brief names the seeds, and '
      + 'the check-writing turn must not see them. It also requires that the check be genuinely '
      + 're-run at each later turn rather than summarised, since a summarised check IS a remembered '
      + 'one and would attenuate as the model says everything else does.',
    status: 'designed',
    evidence: null,
    cost: 'TWELVE TURNS on top of H9, being two six-turn chains with a check-writing turn, since the '
      + 'control arm is H9`s own out-of-coverage defects and is already paid for. The cheapest '
      + 'hypothesis on the site since H7, and the one with the largest consequence if it holds: a '
      + 'gate would be the only known way to put a floor under an unattended run.',
  },

  H11: {
    id: 'H11', name: 'specify-first against build-twice', curriculumUnit: 'IV', owner: '/wp4',
    outcome: 'Surviving defect density of the integrated artefact under three assignments of the '
      + 'same six turns: ungated, specify-first, and build-twice with disagreement as the detector.',
    analysisUnit: 'the run, paired on task across the three assignments',
    claim: 'Which verification strategy wins is decided by whether a check can be written more '
      + 'reliably than the work can be done twice: specify-first below an unsoundness of about the '
      + 'ungated density, build-twice above it, and the crossing moves with error correlation.',
    test: 'Three arms over the same tasks, all six turns, differing only in what the middle four do. '
      + 'Score the integrated artefact against a held-out check written by nobody in the run. The '
      + 'build-twice arm also yields the error correlation directly, by how often the two versions '
      + 'fail on the same input.',
    predicts: [
      ['the two versions in build-twice fail together more often than independence predicts',
        'Knight and Leveson found this for people; one model sampled twice has less reason to differ'],
      ['specify-first leaves defects the check certifies as passing', 'that is the term with no other source'],
      ['specify-first`s advantage shrinks as the briefing improves',
        'context and verification are substitutes, so raising lambda lowers the optimal coverage'],
      ['neither beats the other everywhere', 'if one did, the theory has one strategy in it and not three'],
    ],
    refutedBy: [
      'One strategy wins at every setting, which would mean the crossing this theory is built around does not exist.',
      'The two versions in build-twice fail independently, which would contradict the only empirical anchor the strategy has and make its floor p squared after all.',
      'Specify-first leaves no certified defects at all, in which case unsoundness is zero, checks are free, and the interesting half of the model is idle.',
      'Density does not differ across arms by more than the run-to-run variation, in which case six turns cannot resolve this and the design is underpowered rather than the theory wrong.',
    ],
    requires: 'A stated regime, and a held-out scorer: the check used to score the artefact must be '
      + 'written by somebody outside all three arms, or specify-first is graded by its own homework. '
      + 'It also requires that the three arms be paired on task, since the run-to-run variance here '
      + 'is the ICC of 0.413 and unpaired arms at this size would resolve nothing.',
    status: 'designed',
    evidence: null,
    cost: 'EIGHTEEN TURNS PER TASK, three six-turn arms, and the pairing is what makes that '
      + 'affordable: at the measured rho of 0.413 the paired design needs about 40% fewer tasks '
      + 'than three independent arms would. The held-out scorer is the real expense and it is human '
      + 'or it is worthless.',
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
