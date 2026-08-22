/* ─────────────────────────────────────────────────────────────────────
   ken/lab/shapes.mjs — six org charts that all cost six turns.

   The binding constraint on this programme is sample size. /run priced
   it: at the measured rho = 0.413, a 96-turn budget reaches d = 1.07 and
   no further, so only enormous effects are affordable.

   A factor that costs NOTHING is therefore worth more than a good one
   that costs runs. Shape is such a factor. Six turns admit many DAGs,
   and rewiring them changes every structural quantity in roles.mjs while
   the bill stays six turns.

   Better than that: shape varies POSITION WITHIN a run. The unit of
   analysis for a position effect is the turn, not the run, so a run
   yields six observations rather than one and runs become blocks. In
   split-plot terms (Yates 1935, already in the syllabus) position is the
   sub-plot factor — the one estimated against the small error term. The
   factor we can afford is the factor the design was always going to
   measure best.

   ── THE CATALOGUE, AND WHY THESE SIX ─────────────────────────────────

   Depth and ken ratio are correlated across the obvious shapes: chains
   are deep and blind, fans are shallow and sighted. Correlated factors
   cannot be told apart, so two shapes are here specifically to break it:

     bottleneck   shallow AND blind  (depth 3, sink ken 0.33)
     briefed      deep AND sighted   (depth 5, sink ken 1.00)

   With chain (deep, blind) and star (shallow, sighted) that is a 2x2 on
   depth by ken, at six turns a cell. `standard` and `lattice` are what
   this repo actually runs, and differ from each other only in the wiring
   of wave B — which is the bug of the last revision, kept deliberately,
   because an accidental complete-bipartite wave and a lane-wired one are
   a controlled contrast if you run them on purpose.
   ───────────────────────────────────────────────────────────────────── */

import { depths } from './plan.mjs';
import { shapeInvariants, positionTable, roles } from './roles.mjs';

/**
 * A shape is a node list and an edge list over those names. Six turns
 * each, one source, one sink, asserted by `buildShape`.
 */
export const SHAPES = {
  chain: {
    title: 'Chain',
    gloss: 'Each turn hands to the next. One agent holds the state at a time.',
    real: 'the naive loop: turn N reads turn N-1',
    nodes: ['setup', 't1', 't2', 't3', 't4', 'report'],
    edges: [['setup', 't1'], ['t1', 't2'], ['t2', 't3'], ['t3', 't4'], ['t4', 'report']],
  },

  standard: {
    title: 'Standard run',
    gloss: 'Setup, two paired waves in lanes, cleanup. What /run specifies.',
    real: 'ken R14, the current unit of work',
    nodes: ['setup', 'A1', 'A2', 'B1', 'B2', 'cleanup'],
    edges: [['setup', 'A1'], ['setup', 'A2'], ['A1', 'B1'], ['A2', 'B2'],
      ['B1', 'cleanup'], ['B2', 'cleanup']],
  },

  lattice: {
    title: 'Lattice',
    gloss: 'The same two waves, but every B turn waits on every A turn.',
    real: 'the wiring bug of revision 13, kept as a deliberate arm',
    nodes: ['setup', 'A1', 'A2', 'B1', 'B2', 'cleanup'],
    edges: [['setup', 'A1'], ['setup', 'A2'],
      ['A1', 'B1'], ['A1', 'B2'], ['A2', 'B1'], ['A2', 'B2'],
      ['B1', 'cleanup'], ['B2', 'cleanup']],
  },

  star: {
    title: 'Star',
    gloss: 'One brief, four independent workers, one assembly.',
    real: 'the bake-off: parallel entries judged together',
    nodes: ['setup', 'w1', 'w2', 'w3', 'w4', 'assemble'],
    edges: [['setup', 'w1'], ['setup', 'w2'], ['setup', 'w3'], ['setup', 'w4'],
      ['w1', 'assemble'], ['w2', 'assemble'], ['w3', 'assemble'], ['w4', 'assemble']],
  },

  bottleneck: {
    title: 'Bottleneck',
    gloss: 'Three workers report to one summariser, who alone speaks to the last turn.',
    real: 'a lead who reports up on behalf of a team',
    nodes: ['setup', 'w1', 'w2', 'w3', 'lead', 'report'],
    edges: [['setup', 'w1'], ['setup', 'w2'], ['setup', 'w3'],
      ['w1', 'lead'], ['w2', 'lead'], ['w3', 'lead'], ['lead', 'report']],
  },

  briefed: {
    title: 'Briefed chain',
    gloss: 'A chain, but every turn also copies the last one directly.',
    real: 'cc the final agent on every intermediate turn — free, and the point of the test',
    nodes: ['setup', 't1', 't2', 't3', 't4', 'report'],
    edges: [['setup', 't1'], ['t1', 't2'], ['t2', 't3'], ['t3', 't4'],
      ['setup', 'report'], ['t1', 'report'], ['t2', 'report'], ['t3', 'report'], ['t4', 'report']],
  },
};

export const TURNS_PER_SHAPE = 6;

/**
 * Turn a shape into the same graph object `plan.mjs` build() returns, so
 * roles.mjs, layout.mjs and the figure renderer all take it unchanged.
 *
 * Depth comes from plan.mjs's Kahn pass rather than a second copy, for
 * the reason plan.mjs gives: two definitions of depth eventually differ.
 */
export function buildShape(name) {
  const s = SHAPES[name];
  if (!s) throw new Error(`no shape named "${name}"`);
  const nodes = s.nodes.map((id) => ({ id, label: id, kind: 'turn', turns: 1 }));
  const edges = s.edges.map(([from, to]) => ({ from, to }));
  const g = { nodes, edges };
  const d = depths(g);

  const sources = nodes.filter((n) => !edges.some((e) => e.to === n.id));
  const sinks = nodes.filter((n) => !edges.some((e) => e.from === n.id));
  if (nodes.length !== TURNS_PER_SHAPE) throw new Error(`${name}: ${nodes.length} turns, not ${TURNS_PER_SHAPE}`);
  if (sources.length !== 1) throw new Error(`${name}: ${sources.length} sources, not 1`);
  if (sinks.length !== 1) throw new Error(`${name}: ${sinks.length} sinks, not 1`);

  return {
    name,
    title: s.title,
    gloss: s.gloss,
    real: s.real,
    nodes: nodes.map((n) => ({ ...n, depth: d.get(n.id) })),
    edges,
    turns: nodes.length,
    source: sources[0].id,
    sink: sinks[0].id,
    depth: Math.max(...d.values()),
  };
}

export const shapeNames = () => Object.keys(SHAPES);

/** The catalogue as one table: a row per shape, every invariant computed. */
export function catalogue() {
  return shapeNames().map((name) => {
    const g = buildShape(name);
    const inv = shapeInvariants(g);
    const sinkRow = positionTable(g).find((r) => r.id === g.sink);
    return { name, title: g.title, real: g.real, ...inv, sinkKen: sinkRow.ken, sinkInDeg: sinkRow.inDeg };
  });
}

// ── the factorial hiding in the catalogue ─────────────────────────────

/**
 * Depth and sink-ken cross, and the crossing is what makes the two
 * separable. Returns the 2x2 with the shape sitting in each cell, and
 * the correlation across the whole catalogue so the claim is checkable
 * rather than asserted.
 */
export function depthKenDesign() {
  const rows = catalogue();
  const deep = (r) => r.depth >= 4;
  const sighted = (r) => r.sinkKen >= 0.6;
  const cell = (d, s) => rows.filter((r) => deep(r) === d && sighted(r) === s).map((r) => r.name);
  const xs = rows.map((r) => r.depth);
  const ys = rows.map((r) => r.sinkKen);
  return {
    cells: {
      'deep/blind': cell(true, false),
      'deep/sighted': cell(true, true),
      'shallow/blind': cell(false, false),
      'shallow/sighted': cell(false, true),
    },
    correlation: round(pearson(xs, ys)),
    crossed: [cell(true, false), cell(true, true), cell(false, false), cell(false, true)].every((c) => c.length > 0),
  };
}

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

const round = (x) => Math.round(x * 1000) / 1000;

// ── free replication, which fell out rather than being designed in ────

/**
 * HOW MANY EXCHANGEABLE OBSERVATIONS ONE RUN CONTAINS.
 *
 * The largest automorphism orbit is the number of turns in a run that
 * are structurally indistinguishable — same in-neighbourhood shape, same
 * out-neighbourhood shape, no property of the plan telling them apart.
 * Those are replicates. Not by assumption: by symmetry.
 *
 * A star run holds four of them. A chain run holds one, because every
 * orbit in a chain is a singleton, so a chain contains no replication at
 * all and no amount of care in running it will produce any.
 *
 * They are correlated, being in one run, so the gain is the design
 * effect rather than the raw count (Cochran 1977, already in the WP1
 * survey): deff = 1 + (m - 1)rho, effective m = m / deff. At the
 * measured rho that turns four raw replicates into 1.79 effective ones —
 * against a chain's 1.00, for the same six turns.
 *
 * This was not the point of the catalogue. It is the more useful half.
 */
export function effectiveReplication(name, { rho = 0.413 } = {}) {
  const g = buildShape(name);
  const inv = shapeInvariants(g);
  const m = inv.largestOrbit;
  const deff = 1 + (m - 1) * rho;
  return {
    shape: name,
    orbits: inv.orbitCount,
    rawReplicates: m,
    deff: round(deff),
    effective: round(m / deff),
    perTurn: round((m / deff) / TURNS_PER_SHAPE),
    rho,
  };
}

/** The whole catalogue ranked by what a run of it actually buys. */
export function replicationLadder({ rho = 0.413 } = {}) {
  const rows = shapeNames().map((n) => effectiveReplication(n, { rho }));
  const chain = rows.find((r) => r.shape === 'chain').effective;
  return rows
    .map((r) => ({ ...r, relativeToChain: round(r.effective / chain) }))
    .sort((a, b) => b.effective - a.effective);
}

// ── whether the two position covariates can be told apart ─────────────

/**
 * DEPTH AND KEN ARE ORTHOGONAL ACROSS SHAPES AND COLLINEAR WITHIN THEM.
 *
 * This is the correction that matters and it went the other way from my
 * first framing. `depthKenDesign()` shows r = 0.05 across the catalogue,
 * which says the BETWEEN-shape contrast identifies them. Inside one run
 * they mostly move together — a chain gets deeper and blinder at every
 * step, r = -0.97 — so a within-run regression of fidelity on both
 * estimates a joint position effect and calls it whichever term it
 * happens to load on.
 *
 * One shape escapes. `briefed` advances depth while the last turn keeps
 * full ken, so within a single briefed run r = -0.38 and the variance
 * inflation is 1.17, which is nothing. Every other shape is 2.5 to 15.
 *
 * So the cheap design and the free intervention turn out to be the same
 * shape, which was luck rather than judgment.
 */
export function collinearity() {
  return shapeNames().map((name) => {
    const g = buildShape(name);
    const t = positionTable(g);
    const r = pearson(t.map((x) => x.depth), t.map((x) => x.ken));
    return {
      shape: name,
      r: round(r),
      vif: round(1 / (1 - r * r)),
      kenSpread: round(Math.max(...t.map((x) => x.ken)) - Math.min(...t.map((x) => x.ken))),
      separable: 1 / (1 - r * r) < 2,
    };
  }).sort((a, b) => a.vif - b.vif);
}

/**
 * chain and briefed are the same graph plus five edges, and their
 * position tables agree at every turn except the last. That makes them a
 * matched pair on everything but the quantity under test.
 */
export function chainBriefedContrast() {
  const rows = ['chain', 'briefed'].map((n) => positionTable(buildShape(n))
    .sort((a, b) => a.depth - b.depth));
  const [c, b] = rows;
  const matched = c.map((x, i) => ({
    depth: x.depth,
    chainKen: x.ken,
    briefedKen: b[i].ken,
    same: x.depth === b[i].depth && x.ken === b[i].ken,
  }));
  return {
    matched,
    differingTurns: matched.filter((m) => !m.same).length,
    extraEdges: SHAPES.briefed.edges.length - SHAPES.chain.edges.length,
    extraTurns: 0,
    kenGap: round(matched[matched.length - 1].briefedKen - matched[matched.length - 1].chainKen),
  };
}

// ── H5, stated so it can lose ─────────────────────────────────────────

/**
 * The hypothesis the catalogue exists to test, with its refutation
 * written next to it, per R2.
 */
export const H5 = {
  id: 'H5',
  name: 'position',
  claim: 'Fidelity to the original brief falls with ken ratio, and depth acts only through it.',
  outcome: 'Of k constraints planted in the setup brief, how many the sink still honours.',
  unit: 'the turn, not the run — so one run yields six observations and runs are blocks',
  predicts: [
    ['briefed > chain', 'same six turns, same depth, ken 1.00 against 0.33'],
    ['bottleneck ~ chain', 'ken matched at 0.33 while depth differs, 3 against 5'],
    ['star > bottleneck', 'depth matched near the shallow end, ken 0.83 against 0.33'],
  ],
  refutedBy: [
    'bottleneck and chain differ once ken is matched — then depth acts on its own',
    'briefed and chain do not differ — then ken ratio predicts nothing and the invariant is decorative',
    'the ordering holds but tracks in-degree of the sink alone, which is cheaper to compute and would make the ratio surplus',
  ],
  /**
   * The honest read on what a null would mean. A null here is a result:
   * it says copying the last agent on everything does not help, which is
   * worth knowing precisely because it is free to do and widely assumed
   * to work.
   */
  nullIsInformative: true,
};

/**
 * H6 is the design half, and it is cheaper to test than H5 because most
 * of it is arithmetic. Only one step is empirical, and that step is H4
 * asked at the turn level with the graph pointing at where to look.
 */
export const H6 = {
  id: 'H6',
  name: 'symmetry',
  claim: 'Turns in one automorphism orbit are exchangeable, so the largest orbit is the replication a run already contains.',
  outcome: 'The standard error of a within-run contrast, measured, against the value deff predicts from orbit size.',
  unit: 'the run, comparing observed SE to predicted SE',
  predicts: [
    ['SE(star) / SE(chain) = sqrt(1.00 / 1.79) = 0.75', 'from orbit sizes 4 and 1 at rho = 0.413, before any data'],
    ['within-orbit variance does not depend on which member', 'that is the exchangeability claim itself'],
    ['between-orbit contrasts stay confounded with position', 'no shape rescues those'],
  ],
  refutedBy: [
    'observed SE ratio departs from the predicted one — orbit members are then not exchangeable and the symmetry argument is decorative',
    'within-orbit variance depends on member identity, e.g. w1 always beats w4 — then dispatch order leaks and the orbit is not an orbit in practice',
  ],
  /**
   * The second refutation is the one to expect, and it is worth expecting:
   * a graph automorphism says the PLAN cannot tell two turns apart. It
   * says nothing about the runner. If turns are dispatched in a fixed
   * order, or share a rate limit, or read a file the other wrote, the
   * symmetry is in the drawing and not in the world. That gap is the
   * whole content of the test.
   */
  nullIsInformative: true,
};

/**
 * What H5 costs, priced against the measured parameters rather than
 * hopeful ones.
 *
 * Two arithmetics, and the gap between them is the whole argument for
 * testing shape rather than models:
 *
 *   between-run   a shape contrast compared run to run. n is runs.
 *   within-run    a position contrast inside one run. n is turns, and
 *                 the run absorbs its own between-run variance.
 */
export function priceH5({ d = 0.8, rho = 0.413, alpha = 0.05, power = 0.8 } = {}) {
  const zA = 1.959963984540054, zB = 0.8416212335729143; // two-tailed 0.05, power 0.8
  const perArm = Math.ceil(2 * ((zA + zB) / d) ** 2);
  const pairs = Math.ceil(perArm * (1 - rho));
  const unpairedTurns = perArm * 2 * TURNS_PER_SHAPE;
  const pairedTurns = pairs * 2 * TURNS_PER_SHAPE;
  return {
    d, rho, alpha, power,

    /** Two shapes, different tasks. What the naive version costs. */
    unpaired: {
      runs: perArm * 2, turns: unpairedTurns,
      note: 'chain against briefed on independent tasks',
    },

    /**
     * The same task run as both shapes. Pairing is available here because
     * the two shapes are matched at every turn but the last, which is
     * unusual and is the reason to prefer this contrast over any other in
     * the catalogue.
     */
    paired: {
      pairs, runs: pairs * 2, turns: pairedTurns,
      note: 'the same task run as chain and as briefed; the pair is the block',
      saving: round(1 - pairedTurns / unpairedTurns),
    },

    /**
     * Positions inside one run. Cheap, and it does NOT test H5 as stated:
     * within a chain, depth and ken are collinear at r = -0.97, so the
     * slope is a joint position effect. Within `briefed` the inflation is
     * 1.17 and the two are separable, which is why the slope is priced on
     * briefed runs only.
     */
    withinRun: {
      runs: pairs, turns: pairs * TURNS_PER_SHAPE,
      shape: 'briefed',
      vif: collinearity().find((c) => c.shape === 'briefed').vif,
      note: 'the ken slope across the six positions of a briefed run, with depth as a covariate',
      caveat: 'only briefed supports this; every other shape in the catalogue inflates variance 2.5x to 15x',
    },
  };
}
