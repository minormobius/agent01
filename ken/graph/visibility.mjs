/* ─────────────────────────────────────────────────────────────────────
   ken/graph/visibility.mjs — an edge is a permission, and the absence of
   one is a prohibition somebody has to enforce.

   Everything before this module treated the drawn graph as the graph. It
   is not. What a turn can actually learn arrives by three channels and
   the plan controls only the first:

     brief        the planner hands it text. Fully controlled. This is
                  what an edge in the drawn graph means.
     artifact     it reads files an earlier turn wrote. Controlled only
                  by whether the worktrees are separate.
     provenance   it reads git log, the ledger, its own transcript.
                  Controlled only by what is in the tree at all.

   If the second and third channels are open, the drawn graph is
   decorative. The turn sees what it sees regardless of which arrows were
   drawn, and every invariant computed off those arrows is a description
   of a fiction.

   ── THE MEASUREMENT ──────────────────────────────────────────────────

   Of the 1,960 distinct shapes on six turns:

     regime      effective shapes    distinct sink-ken values
     isolated              1,960                           5
     lineage                  16                           1
     shared                    8                           1

   Under either sharing regime the ken ratio is 1.000 for every shape. It
   is not that the effect is small; the independent variable has no
   variance at all, so H5 is not merely underpowered but undefined.

   ── AND WHY, WHICH IS DEFINITIONAL RATHER THAN EMPIRICAL ─────────────

   ken(v) = |in-neighbours of v, and v| / |ancestors of v, and v|.

   Under `lineage` a turn inherits the accumulated worktree of everything
   upstream, so its effective in-neighbourhood IS its ancestry and the
   ratio is 1 by construction. That is a tautology, and it was sitting in
   the definition from the revision the ratio was introduced. Nobody
   asked when the numerator and the denominator could differ. They differ
   exactly when the plan WITHHOLDS, and withholding needs a mechanism.

   So the whole shape programme is a programme about deliberately
   partitioned work. That is a real engineering regime — this repo's own
   agent tooling takes an `isolation: "worktree"` flag — but it is a
   precondition, not a default, and it had gone unstated.
   ───────────────────────────────────────────────────────────────────── */

import { topological, adjacency, kenRatio } from './roles.mjs';

export const REGIMES = ['isolated', 'lineage', 'shared'];

export const REGIME_NOTE = {
  isolated: 'each turn receives its in-edges and nothing else. The drawn graph is the '
    + 'effective graph. Needs a fresh context and a fresh tree per turn, with handoff by '
    + 'explicit artefact.',
  lineage: 'each turn inherits the accumulated worktree of everything upstream of it. The '
    + 'effective graph is the transitive closure of the drawn one, so ken is 1 everywhere by '
    + 'construction. This is what a per-lane worktree with merges at joins actually gives.',
  shared: 'one worktree for the whole run, so a turn can read anything that finished before '
    + 'it started. The effective graph depends only on the depth histogram, and 1,960 shapes '
    + 'at six turns become 8.',
};

/** Ancestors of every node, over the drawn edges. */
export function ancestors(graph) {
  const { ins } = adjacency(graph);
  const up = new Map(graph.nodes.map((n) => [n.id, new Set()]));
  for (const id of topological(graph)) {
    const s = up.get(id);
    for (const p of ins.get(id)) { s.add(p); for (const x of up.get(p)) s.add(x); }
  }
  return up;
}

/**
 * The graph a turn actually experiences, given how the environment is
 * managed. `isolated` returns the drawn graph unchanged; the other two
 * add the edges the environment supplies whether or not anyone drew them.
 */
export function effectiveGraph(graph, regime = 'isolated') {
  if (!REGIMES.includes(regime)) throw new Error(`unknown regime "${regime}"`);
  if (regime === 'isolated') return graph;

  if (regime === 'lineage') {
    const up = ancestors(graph);
    return {
      ...graph,
      edges: graph.nodes.flatMap((n) => [...up.get(n.id)].sort().map((p) => ({ from: p, to: n.id }))),
    };
  }
  // shared: everything at a strictly lower depth was already on disk
  const depth = new Map(graph.nodes.map((n) => [n.id, n.depth ?? 0]));
  const edges = [];
  for (const a of graph.nodes) {
    for (const b of graph.nodes) if (depth.get(a.id) < depth.get(b.id)) edges.push({ from: a.id, to: b.id });
  }
  return { ...graph, edges };
}

/**
 * What a regime does to one plan: how many edges the environment adds
 * that the plan never declared, and what happens to the sink's ken.
 *
 * `leaked` is the count that matters. It is the number of arrows the
 * drawing does not have and the run does.
 */
export function auditRegime(graph, regime = 'isolated') {
  const eff = effectiveGraph(graph, regime);
  const drawn = new Set(graph.edges.map((e) => `${e.from}>${e.to}`));
  const leaked = eff.edges.filter((e) => !drawn.has(`${e.from}>${e.to}`)).length;
  const sink = graph.sink ?? graph.nodes.find((n) => !graph.edges.some((e) => e.from === n.id))?.id;
  return {
    regime,
    drawnEdges: graph.edges.length,
    effectiveEdges: eff.edges.length,
    leaked,
    sinkKenDrawn: round(kenRatio(graph).get(sink)),
    sinkKenEffective: round(kenRatio(eff).get(sink)),
    /* A regime that leaks nothing is one where the plan is enforced. Any
       other value means the drawn graph overstates what was withheld. */
    enforced: leaked === 0,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

/**
 * How far a set of shapes collapses under a regime.
 *
 * `canonicalOf` is passed in rather than imported, so this module stays
 * free of the enumeration machinery and can be used on any graph list.
 */
export function collapse(graphs, regime, canonicalOf) {
  const n = graphs[0]?.nodes.length ?? 0;
  const before = new Set(graphs.map((g) => canonicalOf(g, n)));
  const after = new Set(graphs.map((g) => canonicalOf(effectiveGraph(g, regime), n)));
  const kens = graphs.map((g) => {
    const eff = effectiveGraph(g, regime);
    const sink = g.sink ?? g.nodes.find((x) => !g.edges.some((e) => e.from === x.id)).id;
    return round(kenRatio(eff).get(sink));
  });
  return {
    regime,
    shapesDrawn: before.size,
    shapesEffective: after.size,
    collapseFactor: after.size ? round(before.size / after.size) : Infinity,
    distinctSinkKen: new Set(kens).size,
    /* The programme is only measurable while the independent variable
       still varies. One distinct value means it does not. */
    measurable: new Set(kens).size > 1,
  };
}

/**
 * The precondition, stated so it can be cited rather than re-derived.
 * R16 in the house standard is this sentence with a procedure attached.
 */
export const PRECONDITION = 'Every hypothesis about plan shape requires the isolated regime. '
  + 'Under lineage or sharing the ken ratio is 1 for every turn of every shape, so the '
  + 'independent variable has no variance and the question is undefined rather than merely '
  + 'hard. A run must state its regime and demonstrate it, because the graph cannot.';
