/* ─────────────────────────────────────────────────────────────────────
   ken/graph/equivalence.mjs — how many automated turns buy one directed
   turn.

   THE QUESTION, in the form it was actually asked: three turns in a chain
   with a lot of human feedback is what a working session looks like. Would
   six turns of nobody-watching rival it?

   That is answerable rather than rhetorical, because "having a human in
   the loop" is not one thing. A human at a handoff supplies TWO goods and
   they are separately purchasable:

     CONTEXT      the human carries the thread across the handoff, so the
                  next turn starts where the last one stopped. In the
                  language of attenuation.mjs this is lambda near 1.
     CORRECTION   the human sees a defect and says so. No wiring supplies
                  this. It is the good that costs.

   The first is already cheap. `briefed` in shapes.mjs takes sink ken to
   1.000 for zero extra turns, which is the whole of H5. So the interesting
   half of direction is correction, and this file models only that.

   ── THE MODEL ────────────────────────────────────────────────────────

   Every turn introduces defects at some rate r. A defect introduced at
   turn i is caught by a later turn j with probability

       q * lambda^(j - i - 1)

   for a per-turn catch rate q and the attenuation lambda of H8. The
   lambda factor is the load-bearing part and it is not decoration: a turn
   can only catch what it can still SEE, and what it can see decays with
   the number of handoffs since the defect was made.

   Write S(m) for the chance a defect survives m downstream turns:

       S(m) = PROD over k = 1..m of ( 1 - q * lambda^(k-1) )

   After n turns the run holds r * SUM over m = 0..n-1 of S(m) defects and
   has delivered n turns of work, so the DEFECT DENSITY is

       D(n) = r * mean of S(0) .. S(n-1)

   ── TWO CONSEQUENCES, AND THEY ARE THE POINT ─────────────────────────

   (1) r CANCELS. The exchange rate compares two densities, so how buggy a
       turn is drops out entirely. What remains is lambda, and q in each
       regime. Three parameters, and one of them already has an instrument.

   (2) AUTOMATED RUNS HAVE A FLOOR AND DIRECTED RUNS DO NOT. At lambda = 1
       the product S(m) = (1-q)^m goes to zero, so enough turns drive
       density to nothing. At lambda < 1 the product CONVERGES to a
       positive number: the later chances are worth so little that they
       stop helping. Some share of defects becomes permanently invisible.

       That is the qualitative difference between watched and unwatched
       work, and it is not that a person is smarter per turn. It is that a
       person's context does not decay, so they keep getting fresh chances
       at old mistakes. A chain's chances decay geometrically and the sum
       of them is finite.

   So the exchange rate can be a small number, a large one, or INFINITE,
   and which one it is depends on quantities nobody here has measured yet.
   That is H9, and it is why H8 comes first.
   ───────────────────────────────────────────────────────────────────── */

/** A directed turn is modelled as one whose context does not decay. */
export const DIRECTED_LAMBDA = 1;

/** No measurement stands behind these. They are the illustration's defaults. */
export const ILLUSTRATIVE = { lambda: 0.6, g: 0.45, h: 0.7, directedTurns: 3 };

const check = (name, x, { max = 1, maxExclusive = false } = {}) => {
  const okHigh = maxExclusive ? x < max : x <= max;
  if (!(typeof x === 'number' && Number.isFinite(x) && x >= 0 && okHigh)) {
    throw new Error(`${name} must be in [0, ${max}${maxExclusive ? ')' : ']'}, got ${x}`);
  }
};

/**
 * S(m): the chance a defect survives m downstream turns.
 *
 * S(0) = 1 by construction — the last turn's mistakes have nobody after
 * them, which is why no design drives density to zero at finite n.
 */
export function survival(m, { q, lambda }) {
  check('q', q);
  check('lambda', lambda);
  let s = 1;
  for (let k = 1; k <= m; k++) s *= 1 - q * lambda ** (k - 1);
  return s;
}

/**
 * The limit of S(m). Positive whenever lambda < 1 and q < 1, and that
 * positive number is the share of defects no amount of downstream work
 * will ever see again.
 *
 * Computed by running the product until the factors stop moving it, with
 * a hard cap so a pathological argument cannot spin. lambda = 1 is
 * returned as an exact 0 rather than approached, since (1-q)^m has no
 * floor and iterating to it wastes time and lies about precision.
 */
export function residue({ q, lambda }, { tol = 1e-12, cap = 20000 } = {}) {
  check('q', q);
  check('lambda', lambda);
  if (q === 0) return 1;
  if (lambda === 1) return 0;
  let s = 1;
  for (let k = 1; k <= cap; k++) {
    const f = 1 - q * lambda ** (k - 1);
    const next = s * f;
    if (s - next < tol) return next;
    s = next;
  }
  return s;
}

/**
 * Defect density after n turns, in units of r. Decreasing in n, since
 * S is decreasing and this is its running mean, and bounded below by
 * `residue`.
 */
export function density(n, { q, lambda }) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`n must be a positive integer, got ${n}`);
  let s = 1, total = 0;
  for (let m = 0; m < n; m++) {
    total += s;
    s *= 1 - q * lambda ** m;
  }
  return total / n;
}

/**
 * THE ANSWER TO THE QUESTION. How many automated turns match the defect
 * density of `directedTurns` directed ones.
 *
 * Returns `{ n, target, floor, reachable }`. When the automated floor sits
 * above the directed target the answer is that no number of turns
 * suffices, and it is returned as `n: null` with a reason rather than as a
 * large number, because "700" and "never" are different claims and only
 * one of them is true.
 */
export function exchangeRate({
  lambda = ILLUSTRATIVE.lambda,
  g = ILLUSTRATIVE.g,
  h = ILLUSTRATIVE.h,
  directedTurns = ILLUSTRATIVE.directedTurns,
  lambdaDirected = DIRECTED_LAMBDA,
  cap = 500,
} = {}) {
  const target = density(directedTurns, { q: h, lambda: lambdaDirected });
  const floor = residue({ q: g, lambda });
  if (floor > target) {
    return {
      n: null, target: round(target), floor: round(floor), reachable: false,
      reason: `the automated floor is ${round(floor)} and the directed target is ${round(target)}`
        + ' — no number of turns closes that, because the chances decay faster than they accumulate',
    };
  }
  for (let n = 1; n <= cap; n++) {
    if (density(n, { q: g, lambda }) <= target) {
      return { n, target: round(target), floor: round(floor), reachable: true, reason: null };
    }
  }
  return {
    n: null, target: round(target), floor: round(floor), reachable: true,
    reason: `reachable in principle, since the floor ${round(floor)} is under the target, but not within ${cap} turns`,
  };
}

const round = (x) => Math.round(x * 10000) / 10000;

/**
 * The curve behind the widget: density against turn count, for the
 * automated regime and the directed one, plus where they cross.
 */
export function curve({
  lambda = ILLUSTRATIVE.lambda, g = ILLUSTRATIVE.g, h = ILLUSTRATIVE.h,
  lambdaDirected = DIRECTED_LAMBDA, upTo = 12,
} = {}) {
  const rows = [];
  for (let n = 1; n <= upTo; n++) {
    rows.push({
      n,
      automated: round(density(n, { q: g, lambda })),
      directed: round(density(n, { q: h, lambda: lambdaDirected })),
    });
  }
  return { rows, floor: round(residue({ q: g, lambda })), settings: { lambda, g, h, lambdaDirected } };
}

/**
 * Where the answer is six. The claim under test is a point in a space, so
 * the honest way to show it is the region rather than the point: sweep
 * lambda and g at a fixed human, and report what the exchange rate is at
 * each cell.
 *
 * A cell holding `null` is one where no number of automated turns matches
 * three directed ones. Those cells are not a failure of the sweep; they
 * are the result.
 */
export function grid({
  lambdas = [0.2, 0.4, 0.6, 0.8, 0.95],
  gs = [0.2, 0.35, 0.5, 0.65, 0.8],
  h = ILLUSTRATIVE.h, directedTurns = ILLUSTRATIVE.directedTurns,
} = {}) {
  return lambdas.map((lambda) => ({
    lambda,
    cells: gs.map((g) => {
      const r = exchangeRate({ lambda, g, h, directedTurns });
      return { g, n: r.n, reachable: r.reachable };
    }),
  }));
}

/**
 * The cells of a sweep whose exchange rate lands in a stated band, which
 * is how the six-turn intuition gets tested rather than adopted. If six
 * is right, it is right somewhere specific, and this says where.
 */
export function bandFor({ band = [5, 7], step = 0.05, h = ILLUSTRATIVE.h, directedTurns = 3 } = {}) {
  const hits = [];
  let total = 0;
  for (let lambda = step; lambda < 1; lambda += step) {
    for (let g = step; g < 1; g += step) {
      total++;
      const { n } = exchangeRate({ lambda: r2(lambda), g: r2(g), h, directedTurns });
      if (n !== null && n >= band[0] && n <= band[1]) hits.push({ lambda: r2(lambda), g: r2(g), n });
    }
  }
  return {
    band, total, hits,
    share: round(hits.length / total),
    lambdaRange: hits.length ? [Math.min(...hits.map((x) => x.lambda)), Math.max(...hits.map((x) => x.lambda))] : null,
    gRange: hits.length ? [Math.min(...hits.map((x) => x.g)), Math.max(...hits.map((x) => x.g))] : null,
  };
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * What a run has to measure before any of this is more than algebra.
 * Each entry names the parameter, what would measure it, and what stands
 * behind it today, which in two of three cases is nothing.
 */
export const PARAMETERS = [
  {
    symbol: 'lambda',
    name: 'attenuation',
    role: 'how much of a defect`s context survives one handoff',
    instrument: 'H8, the incidental-residue probe, priced at 36 turns',
    standing: 'designed, not run',
  },
  {
    symbol: 'g',
    name: 'automated catch rate',
    role: 'the share of live defects one unattended turn removes',
    instrument: 'a seeded-defect run: plant known faults, count removals by depth',
    standing: 'nothing. The loop ledger records 17 gate failures over 89 turns, which counts what the '
      + 'gate CAUGHT and says nothing about what it missed',
  },
  {
    symbol: 'h',
    name: 'directed catch rate',
    role: 'the same, for a turn a person is reading',
    instrument: 'the same seeded-defect run with a person at the handoff',
    standing: 'nothing, and it is the expensive one to get',
  },
  {
    symbol: 'r',
    name: 'defect introduction rate',
    role: 'defects made per turn',
    instrument: 'not needed',
    standing: 'CANCELS. It scales both densities equally and leaves the ratio alone',
  },
];
