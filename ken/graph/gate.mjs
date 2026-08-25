/* ─────────────────────────────────────────────────────────────────────
   ken/graph/gate.mjs — a theory of the gate.

   WP3 gave an unattended chain a floor: a share of defects that no
   downstream turn can see any more, because what a turn can see decays
   at lambda per handoff. This file asks what a CHECK does to that floor,
   and the answer turns on one property.

   ── A GATE IS CONTEXT THAT DOES NOT ATTENUATE ────────────────────────

   Everything a turn knows about its ancestors arrives discounted by
   lambda^(k-1). An executable check does not, because it is RE-RUN
   rather than remembered. Written at turn 2, it is exactly as sharp at
   turn 6 as it was at turn 3.

   Two things follow, and the second is the one WP3 could not have.

     NO DECAY      a defect inside the check's coverage is detected at
                   whatever gap, so it contributes nothing to the floor.
     NO LAST TURN  WP3's floor is partly S(0) = 1: the final turn's
                   mistakes have nobody after them. A check has somebody
                   after them. It runs on the integrator's output too.

   ── WHY THAT IS NOT THE END OF IT ────────────────────────────────────

   A check is written by a turn, and that turn can be wrong in a way the
   check itself certifies. An assertion that states the wrong thing turns
   a would-be-correct implementation into a defect AND marks it passing.
   That failure is invisible to the mechanism that created it, so it
   needs its own parameter, and the premise this file was handed says
   what shape that parameter has: it is at least as hard to verify as to
   design. A check that covers more asserts more, and the assertions you
   add last are the ambitious ones you are likeliest to get wrong.

     c      COVERAGE      share of defects the check detects
     u      UNSOUNDNESS   share a COMPLETE specification would get wrong
     gamma  TAIL          how much harder the last assertions are than
                          the first; 1 is uniform, above 1 puts the
                          difficulty at the end
     beta   PRESSURE      how much the uncovered part rots as effort
                          follows the measured part — Goodhart, arranged
                          deliberately

   ── THE DECISION RULE ────────────────────────────────────────────────

   Density under specify-first, in units of the introduction rate:

       D(c) = (1 - c)(1 + beta*c) * M  +  u * c^gamma

   where M is the ungated density from WP3. The gate-created term is
   superlinear whenever gamma > 1, which gives an interior optimum and
   two statements worth arguing with.

       THE FIRST ASSERTIONS ARE ALWAYS WORTH WRITING. At gamma > 1 the
       derivative at c = 0 is -M, so a little coverage always pays. The
       question was never whether to check, only where to stop.

       STOP AT   c* = ( M / (gamma * u) ) ^ ( 1 / (gamma - 1) )

   And an uncomfortable corollary, since M falls as lambda rises:
   IMPROVING THE BRIEFING REDUCES THE OPTIMAL AMOUNT OF SPECIFICATION.
   Context and verification are substitutes, not complements. Fix the
   handoff and some of your tests stop paying for themselves.

   ── WHEN YOU CANNOT WRITE A SOUND CHECK ──────────────────────────────

   Build the thing twice, independently, and treat disagreement as the
   detector. That has a floor of its own, and it is not p^2. Knight and
   Leveson had 27 versions written independently from one specification
   and rejected the independence assumption at the 99% level; Eckhardt
   and Lee give the model, in which inputs vary in difficulty and
   versions fail together on the hard ones. `agreementFloor` implements
   that model rather than the independence one, because the independence
   one is known to be false.
   ───────────────────────────────────────────────────────────────────── */

import { density } from './equivalence.mjs';

/** The three things a run can do about its own defects. */
export const STRATEGIES = ['ungated', 'specify-first', 'build-twice'];

const check = (name, x, { max = 1 } = {}) => {
  if (!(typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max)) {
    throw new Error(`${name} must be in [0, ${max}], got ${x}`);
  }
};

/**
 * WP3's density with no check at all, at a stated chain length. This is
 * the M every rule below compares against, and it is a function of the
 * two rates that paper leaves unmeasured.
 */
export function ungated({ lambda = 0.6, g = 0.45, turns = 6 } = {}) {
  return round(density(turns, { q: g, lambda }));
}

/**
 * Density under specify-first: one turn writes the check, a later one
 * builds against it.
 *
 * The three terms are the three ways this can go, and keeping them
 * separate is what makes the failure modes nameable rather than a single
 * fudge factor.
 */
export function specifyFirst({
  lambda = 0.6, g = 0.45, turns = 6,
  coverage = 0.6, unsoundness = 0.3, tail = 2, goodhart = 0,
} = {}) {
  check('coverage', coverage);
  check('unsoundness', unsoundness);
  check('goodhart', goodhart, { max: 10 });
  if (!(tail >= 1 && tail <= 8)) throw new Error(`tail must be in [1, 8], got ${tail}`);
  const M = density(turns, { q: g, lambda });
  const missed = (1 - coverage) * (1 + goodhart * coverage) * M;
  const certified = unsoundness * coverage ** tail;
  return {
    density: round(missed + certified),
    missed: round(missed),
    certified: round(certified),
    ungated: round(M),
    /* The share of what is left that the gate itself put there. At high
       coverage and imperfect soundness this goes to 1, which is the
       perfectly-gated-and-perfectly-wrong corner. */
    selfInflicted: missed + certified === 0 ? 0 : round(certified / (missed + certified)),
  };
}

/**
 * The ceiling a complete specification's error rate has to sit under
 * before specifying everything beats specifying nothing.
 *
 * D(1) = u and D(0) = M, so the comparison is that bare: WRITE THE WHOLE
 * THING IFF u < M. You have to be likelier to get an assertion right
 * than the chain is to leave the defect anyway, which is the premise
 * this file was handed, turned into an inequality.
 */
export function unsoundnessCeiling({ lambda = 0.6, g = 0.45, turns = 6 } = {}) {
  const M = round(density(turns, { q: g, lambda }));
  return { ceiling: M, ungated: M };
}

/**
 * Where to stop specifying, in closed form, at beta = 0. Returned
 * alongside the searched answer so the two can be compared, since the
 * closed form is only valid for gamma > 1 and inside [0, 1] and a number
 * outside its own domain is worse than no number.
 */
export function stoppingPoint({ lambda = 0.6, g = 0.45, turns = 6, unsoundness = 0.3, tail = 2 } = {}) {
  const M = density(turns, { q: g, lambda });
  if (tail <= 1) {
    return { coverage: M > unsoundness ? 1 : 0, interior: false,
      reason: 'at tail 1 the trade is linear, so the optimum is a corner: specify everything or nothing' };
  }
  const c = (M / (tail * unsoundness)) ** (1 / (tail - 1));
  return c >= 1
    ? { coverage: 1, interior: false, reason: 'the closed form lands above 1, so specify everything' }
    : { coverage: round(c), interior: true, reason: null };
}

/**
 * With Goodhart pressure the optimum moves off the corners. Reported by
 * search rather than by the closed form, because the closed form is only
 * valid where the interior point lands inside [0, 1] and reporting a
 * number outside it would be worse than useless.
 */
export function optimalCoverage({
  lambda = 0.6, g = 0.45, turns = 6, unsoundness = 0.3, tail = 2, goodhart = 0, step = 0.005,
} = {}) {
  let best = null;
  for (let c = 0; c <= 1 + 1e-9; c += step) {
    const cc = Math.min(1, round(c));
    const d = specifyFirst({ lambda, g, turns, coverage: cc, unsoundness, tail, goodhart }).density;
    if (best === null || d < best.density - 1e-12) best = { coverage: cc, density: d };
  }
  const none = specifyFirst({ lambda, g, turns, coverage: 0, unsoundness, tail, goodhart }).density;
  return { ...best, noGate: round(none), improvement: round(none - best.density) };
}

/**
 * Eckhardt–Lee: k independently built versions, each failing on a share
 * p of inputs, failing TOGETHER more often than independence predicts
 * because inputs differ in difficulty.
 *
 * Difficulty is Beta with mean p and the variance implied by rho, so
 * P(all k fail) = E[theta^k] = PROD (a+i)/(a+b+i). At rho = 0 this is
 * p^k and at rho = 1 it is p, which is the honest statement that
 * perfectly correlated versions buy nothing at all.
 */
export function agreementFloor({ p = 0.2, correlation = 0.3, versions = 2 } = {}) {
  check('p', p);
  check('correlation', correlation);
  if (!Number.isInteger(versions) || versions < 2) throw new Error(`versions must be an integer >= 2, got ${versions}`);
  if (correlation === 0) return round(p ** versions);
  if (correlation === 1) return round(p);
  const ab = 1 / correlation - 1;          // a + b
  const a = p * ab;
  let e = 1;
  for (let i = 0; i < versions; i++) e *= (a + i) / (ab + i);
  return round(e);
}

/**
 * All three strategies at one point in the parameter space, ranked, with
 * the turns each spends on something other than the artefact.
 *
 * The overhead column is the honest part. Specify-first spends a turn
 * writing a check; build-twice spends a whole second implementation. A
 * floor comparison that ignores that would recommend build-twice
 * everywhere.
 */
export function strategies({
  lambda = 0.6, g = 0.45, turns = 6,
  coverage = 0.6, unsoundness = 0.3, tail = 2, goodhart = 0,
  correlation = 0.3, p = null,
} = {}) {
  /* p DEFAULTS TO THE UNGATED DENSITY, and the first version of this
     function took it as a free parameter set to 0.2. That made the three
     rows incomparable: two of them were densities and one was an
     unrelated per-version error rate, so build-twice won by choosing its
     own units. Each independent attempt carries the density an
     unattended effort carries; what survives is the share they get wrong
     together. */
  const perVersion = p === null ? density(turns, { q: g, lambda }) : p;
  const rows = [
    {
      name: 'ungated',
      density: ungated({ lambda, g, turns }),
      overhead: 0,
      note: 'every turn builds; defects are caught only by whoever can still see them',
    },
    {
      name: 'specify-first',
      density: specifyFirst({ lambda, g, turns, coverage, unsoundness, tail, goodhart }).density,
      overhead: 1,
      note: 'one turn writes an executable check, which then runs at every later turn and on the integrator',
    },
    {
      name: 'build-twice',
      density: agreementFloor({ p: perVersion, correlation }),
      overhead: 1,
      note: 'two independent attempts; disagreement is the detector, and correlated error is the residue',
    },
  ];
  rows.sort((a, b) => a.density - b.density);
  return { rows, best: rows[0].name, settings: { lambda, g, turns, coverage, unsoundness, tail, goodhart, correlation, perVersion: round(perVersion) } };
}

const round = (x) => Math.round(x * 10000) / 10000;

/**
 * The six-turn assignment this file was written for, stated as duties
 * over the shape the catalogue already holds.
 *
 * The profile is [1, 2, 2, 1] with lane wiring, which is `standard` in
 * shapes.mjs. Nothing about the GRAPH is new. What is new is that wave
 * A's product is a checker rather than a part, and WP2's nine roles
 * cannot express that: they are read off degree, and degree cannot tell
 * a specification from an implementation.
 *
 * So a turn has a role, which its in- and out-degree force, and a DUTY,
 * which the assignment chooses. The two are orthogonal and both are
 * needed to describe a run.
 */
export const VERIFICATION_FIRST = {
  name: 'verification-first standard run',
  profile: [1, 2, 2, 1],
  wiring: 'lanes',
  sameShapeAs: 'standard',
  /* `roleLanes` is what roles.mjs derives when a builder sees only its
     check. `roleBriefed` is what it derives when the builder also has an
     edge from the setup turn, so it can read the original problem beside
     the check.
     THOSE ARE NOT THE SAME RUN. Four of the six roles change. The first
     open question below reads like a preference and is a structural
     choice, which is the sort of thing this programme exists to notice
     before spending turns rather than after. */
  duties: [
    { turn: 'setup', duty: 'split', roleLanes: 'principal', roleBriefed: 'principal',
      makes: 'two briefs, one per effort' },
    { turn: 'wave A · 1', duty: 'specify', roleLanes: 'relay', roleBriefed: 'delegate',
      makes: 'an executable check for effort 1' },
    { turn: 'wave A · 2', duty: 'specify', roleLanes: 'relay', roleBriefed: 'delegate',
      makes: 'an executable check for effort 2' },
    { turn: 'wave B · 1', duty: 'build', roleLanes: 'relay', roleBriefed: 'funnel',
      makes: 'effort 1, against check 1' },
    { turn: 'wave B · 2', duty: 'build', roleLanes: 'relay', roleBriefed: 'funnel',
      makes: 'effort 2, against check 2' },
    { turn: 'cleanup', duty: 'integrate', roleLanes: 'integrate', roleBriefed: 'integrate',
      makes: 'the artefact, with both checks still running' },
  ],
  openQuestions: [
    ['does the builder see the problem statement, or only the check',
      'ONLY THE CHECK is maximum independence and makes coverage the whole specification. BOTH lets the builder notice an unsound assertion, and changes four of the six derived roles: the specifiers become delegates and the builders become funnels'],
    ['does the builder run the check, or only the integrator',
      'the builder running it is a tighter loop and also self-certification against a possibly-wrong check, which is the unsoundness term with the blindfold on'],
    ['do the two lanes see each other`s checks',
      'lane wiring says no, which preserves the pairing WP2 prices at a 40% saving but forgoes the cross-check that would measure unsoundness for free'],
  ],
};

/**
 * What decides which strategy fits, stated so it can be argued with.
 * `verificationDiscount` is the ratio the whole theory turns on and it
 * is the one quantity here with no instrument at all.
 */
export const CHOICE = [
  {
    quantity: 'verification discount',
    symbol: 'v',
    is: 'cost to check an answer over cost to produce one',
    decides: 'v well under 1 favours specify-first; v near 1 favours build-twice, because a check that costs as much as the work has no advantage over a second attempt',
    standing: 'nothing. It is the quantity this theory most needs and the one nobody here has measured',
  },
  {
    quantity: 'unsoundness at full coverage',
    symbol: 'u',
    is: 'the share of defects a COMPLETE specification would itself introduce by asserting the wrong thing',
    decides: 'where to stop specifying, against the ungated density the chain would have left anyway',
    standing: 'nothing, though it is measurable the same way as g: write checks against a seeded artefact and count wrong assertions',
  },
  {
    quantity: 'error correlation',
    symbol: 'rho',
    is: 'how much two independent attempts fail on the same inputs',
    decides: 'the floor under build-twice, which is p at rho = 1 and p^2 at rho = 0',
    standing: 'nothing here, but the assumption of independence was rejected for human programmers and there is no reason to expect better from one model sampled twice',
  },
];
