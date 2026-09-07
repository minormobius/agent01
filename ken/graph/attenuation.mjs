/* ─────────────────────────────────────────────────────────────────────
   ken/graph/attenuation.mjs — you know your grandfather's output, because
   it was your father's input.

   visibility.mjs offered a dichotomy: either a turn sees only what its
   in-edges hand it, or it inherits the whole accumulated tree. Both are
   wrong about how work actually reaches anyone.

   A turn's parent hands over a PRODUCT, and that product was shaped by
   what the parent received. So the grandparent does reach the grandchild
   — narrowed, summarised, lossy, but it reaches. Nobody carries the whole
   programme in their head and nobody starts from nothing either. The
   torch is passed and it dims.

   ── ONE PARAMETER, AND THE TWO OLD MODELS ARE ITS CORNERS ────────────

   Let lambda be the share of an input that survives ONE summarisation
   hop. Fidelity from u to v is then lambda^(d - 1), where d is the
   SHORTEST path from u to v: the best-preserved copy is the one that
   went through fewest hands. A direct edge is d = 1 and costs nothing.

     weightedKen(v) = ( 1 + sum over ancestors u of lambda^(d(u,v)-1) )
                      / ( 1 + |ancestors of v| )

   At lambda = 0 every indirect ancestor contributes zero and the formula
   is exactly the ken ratio this site has published since revision 14.
   Asserted on all 1,960 shapes at six turns, not argued.

   At lambda = 1 every ancestor contributes fully and the ratio is 1 for
   every turn of every shape, which is the `lineage` regime.

   So the two regimes were the endpoints of a segment, and the argument
   about which one is right was an argument about a number nobody had
   measured.

   ── AND THE MIDDLE IS SHARPER THAN EITHER END ────────────────────────

   Across the 1,960 shapes, sink ken takes 5 distinct values at
   lambda = 0 and 1 at lambda = 1. In between it takes 16. The attenuated
   model DISCRIMINATES BETTER than the binary one it replaces: shapes that
   the old ratio could not tell apart separate once fidelity decays
   smoothly rather than falling off a cliff.

   ── WHAT THIS DOES TO H5 ─────────────────────────────────────────────

   The chain-against-briefed gap, which WP2 prices at 180 turns:

     lambda   0.0    0.4    0.6    0.8    0.95   1.0
     gap      0.667  0.558  0.449  0.273  0.079  0.000

   So "do skip edges matter" is not a modelling argument. It is a question
   about lambda, and lambda is measurable from a single chain run: plant k
   constraints at the source and count how many survive at each depth. The
   decay of that curve IS lambda. That is H8, and it is the cheapest
   experiment on this site.
   ───────────────────────────────────────────────────────────────────── */

import { adjacency, topological } from './roles.mjs';

/**
 * Shortest-path distance from every node to every node it can reach.
 *
 * Shortest rather than longest, and that choice is the model: a product
 * that reached you through two hands is better preserved than the same
 * product that reached you through five, so the copy that matters is the
 * one that took the short way.
 */
export function reachDistances(graph) {
  const { outs } = adjacency(graph);
  const dist = new Map();
  for (const s of graph.nodes) {
    const seen = new Map([[s.id, 0]]);
    const queue = [s.id];
    while (queue.length) {
      const x = queue.shift();
      const k = seen.get(x);
      for (const y of outs.get(x)) {
        if (!seen.has(y)) { seen.set(y, k + 1); queue.push(y); }
      }
    }
    dist.set(s.id, seen);
  }
  return dist;
}

/** For each node, the shortest distance from each of its ancestors. */
export function ancestorDistances(graph) {
  const fwd = reachDistances(graph);
  const back = new Map(graph.nodes.map((n) => [n.id, new Map()]));
  for (const s of graph.nodes) {
    for (const [t, k] of fwd.get(s.id)) if (t !== s.id) back.get(t).set(s.id, k);
  }
  return back;
}

export const DEFAULT_LAMBDA = 0.6;

/**
 * The ken ratio, weighted by how much of each ancestor actually arrives.
 *
 * `lambda` is the share surviving one hop beyond the first. A source has
 * no ancestry and scores 1 by definition, as before.
 */
export function weightedKen(graph, { lambda = DEFAULT_LAMBDA } = {}) {
  if (!(lambda >= 0 && lambda <= 1)) throw new Error(`lambda must be in [0, 1], got ${lambda}`);
  const back = ancestorDistances(graph);
  return new Map(graph.nodes.map((n) => {
    const ds = [...back.get(n.id).values()];
    if (!ds.length) return [n.id, 1];
    const held = 1 + ds.reduce((s, d) => s + lambda ** (d - 1), 0);
    return [n.id, held / (1 + ds.length)];
  }));
}

/**
 * What a skip edge is worth, as a function of lambda.
 *
 * Adding an edge from u to v takes their distance from d to 1, so the
 * fidelity of u at v goes from lambda^(d-1) to 1. At lambda near 1 that
 * is nearly nothing; at lambda near 0 it is everything. Whether skips are
 * worth drawing is this number.
 */
export function skipValue(distance, lambda = DEFAULT_LAMBDA) {
  if (distance < 2) return 0;                 // already adjacent
  return round(1 - lambda ** (distance - 1));
}

/**
 * The lambda sweep for one contrast: how a two-shape gap in sink ken
 * behaves as fidelity varies. This is the honest way to state an effect
 * size that depends on an unmeasured parameter.
 */
export function contrastCurve(a, b, { lambdas = [0, 0.2, 0.4, 0.6, 0.8, 0.95, 1] } = {}) {
  const sinkOf = (g) => g.sink ?? g.nodes.find((n) => !g.edges.some((e) => e.from === n.id)).id;
  return lambdas.map((lambda) => {
    const ka = weightedKen(a, { lambda }).get(sinkOf(a));
    const kb = weightedKen(b, { lambda }).get(sinkOf(b));
    return { lambda, a: round(ka), b: round(kb), gap: round(kb - ka) };
  });
}

/**
 * How many distinct sink-ken values a set of shapes takes at a given
 * lambda. The discrimination of the instrument, measured.
 */
export function discrimination(graphs, lambda = DEFAULT_LAMBDA) {
  const vals = graphs.map((g) => {
    const sink = g.sink ?? g.nodes.find((n) => !g.edges.some((e) => e.from === n.id)).id;
    return weightedKen(g, { lambda }).get(sink).toFixed(4);
  });
  return { lambda, shapes: graphs.length, distinct: new Set(vals).size };
}

const round = (x) => Math.round(x * 1000) / 1000;

// ── the shape of the ancestry order ───────────────────────────────────

/**
 * The ancestor sets of a plan, ordered by inclusion.
 *
 * MEASURED at n = 4, 5 and 6 over every shape: the image is closed under
 * intersection in 100% of cases and under union in 100%, 100% and 99.0%
 * respectively. So it is always a meet-semilattice on these graphs and
 * usually a lattice, and the twenty exceptions at six turns are the
 * shapes with two branches that share no join before the sink.
 *
 * The general statement is Birkhoff's: the downsets of any poset form a
 * distributive lattice, and a DAG's reachability order embeds in it. The
 * closure of the IMAGE is a stronger and narrower claim, which is why it
 * is reported as a measurement rather than cited.
 */
export function ancestryOrder(graph) {
  const back = ancestorDistances(graph);
  const sets = new Map(graph.nodes.map((n) => [n.id, new Set(back.get(n.id).keys())]));
  const key = (s) => [...s].sort().join(',');
  const image = [...new Set([...sets.values()].map(key))].map((k) => new Set(k ? k.split(',') : []));
  const has = (s) => image.some((c) => key(c) === key(s));
  let meetClosed = true, joinClosed = true;
  for (const a of image) {
    for (const b of image) {
      if (!has(new Set([...a].filter((x) => b.has(x))))) meetClosed = false;
      if (!has(new Set([...a, ...b]))) joinClosed = false;
    }
  }
  return {
    sets, distinct: image.length, meetClosed, joinClosed,
    isLattice: meetClosed && joinClosed,
    isMeetSemilattice: meetClosed,
  };
}
