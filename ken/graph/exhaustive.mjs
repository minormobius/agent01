/* ─────────────────────────────────────────────────────────────────────
   ken/graph/exhaustive.mjs — the whole space, and how little of it the
   layered family was showing.

   `profiles.mjs` enumerates LAYERED plans: a composition of n, wired
   between adjacent layers. That is a real family and the isoperimetric
   trade is real. It is also a sliver.

     n      one-source one-sink DAGs      the layered family     covered
     3                             2                       2      100%
     4                            10                       4       40%
     5                            98                      10       10%
     6                         1,960                      18       0.9%
     7                        80,176                       -          -

   Counts computed twice by different methods, and the second was wrong
   the first time. Brute force over all n! relabellings gave 98 and 1,960;
   a refinement-restricted canonical form gave 122 and 3,274 until two
   bugs were fixed, one of which ordered the colour classes by discovery
   rather than by an invariant. The agreement of the two methods is the
   check, not either method on its own.

   ── WHAT THE LAYERED FAMILY LEAVES OUT ───────────────────────────────

   Every edge in a layered plan joins ADJACENT layers, so every path from
   the source to a node has the same length and depth equals layer index.
   Real plans are not like that. A turn may feed something three stages
   later; two arms may rejoin unevenly; `briefed` is exactly a layered
   chain plus skip edges to the sink, and it had to be special-cased into
   the generator because the family could not otherwise express it.

   ── THE THREE MODES, AND WHY THREE ───────────────────────────────────

   exact       n <= 6. Enumerate every shape, up to isomorphism. ~100ms.
   layered     any n. The structured family, now with skip policies, so
               it is wider than it was but still a named subset.
   sampled     any n. Random plans, deterministic under a seed. NOT a
               uniform sample of the space, and the distribution it shows
               is the sampler's as much as the space's. Say so wherever
               its numbers appear.
   ───────────────────────────────────────────────────────────────────── */

import { mulberry32 } from './rng.mjs';
import { depths } from './plan.mjs';

// ── canonical form ────────────────────────────────────────────────────

/**
 * Colour refinement over an adjacency matrix.
 *
 * The renumbering step sorts the signatures before assigning labels. An
 * earlier version numbered them in discovery order, which is a property
 * of the loop rather than of the graph, so two isomorphic graphs got
 * different colourings and the count came out 67% too high.
 */
export function refineMatrix(adj, n) {
  let col = new Array(n);
  for (let v = 0; v < n; v++) {
    let ind = 0, outd = 0;
    for (let u = 0; u < n; u++) { ind += adj[u][v]; outd += adj[v][u]; }
    col[v] = `${ind}:${outd}`;
  }
  for (let round = 0; round < n; round++) {
    const sig = new Array(n);
    for (let v = 0; v < n; v++) {
      const up = [], dn = [];
      for (let u = 0; u < n; u++) {
        if (adj[u][v]) up.push(col[u]);
        if (adj[v][u]) dn.push(col[u]);
      }
      sig[v] = `${col[v]}|<${up.sort().join(',')}|>${dn.sort().join(',')}`;
    }
    const keys = [...new Set(sig)].sort();
    const map = new Map(keys.map((k, i) => [k, `c${String(i).padStart(3, '0')}`]));
    const next = sig.map((x) => map.get(x));
    const before = new Set(col).size;
    col = next;
    if (new Set(col).size === before) break;
  }
  return col;
}

const permsOf = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) =>
  permsOf([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

/**
 * A canonical adjacency string: the lexicographically smallest one over
 * every relabelling consistent with the refinement.
 *
 * Refinement gives an invariant ordering of the colour classes, so only
 * permutations WITHIN a class need trying. That is nauty's idea in
 * miniature and it is what makes n = 7 finish at all.
 */
export function canonical(adj, n, { cap = 20000 } = {}) {
  const col = refineMatrix(adj, n);
  const classes = new Map();
  for (let v = 0; v < n; v++) {
    if (!classes.has(col[v])) classes.set(col[v], []);
    classes.get(col[v]).push(v);
  }
  let orders = [[]];
  for (const key of [...classes.keys()].sort()) {
    const ps = permsOf(classes.get(key));
    const next = [];
    for (const o of orders) for (const p of ps) next.push([...o, ...p]);
    orders = next;
    if (orders.length > cap) break;   // a pathologically symmetric graph
  }
  let best = null;
  for (const p of orders) {
    let s = '';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += adj[p[i]][p[j]];
    if (best === null || s < best) best = s;
  }
  return best;
}

// ── the space ─────────────────────────────────────────────────────────

/** One source, one sink, and every node on some source-to-sink path. */
function wellFormed(adj, n) {
  let src = 0, snk = 0;
  for (let v = 0; v < n; v++) {
    let ind = 0, outd = 0;
    for (let u = 0; u < n; u++) { ind += adj[u][v]; outd += adj[v][u]; }
    if (ind === 0) src++;
    if (outd === 0) snk++;
  }
  return src === 1 && snk === 1;
}

const toGraph = (adj, n, id = (i) => `t${i}`) => {
  const nodes = Array.from({ length: n }, (_, i) => ({ id: id(i), label: id(i), kind: 'turn', turns: 1 }));
  const edges = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (adj[i][j]) edges.push({ from: id(i), to: id(j) });
  const g = { nodes, edges };
  const d = depths(g);
  return {
    nodes: nodes.map((x) => ({ ...x, depth: d.get(x.id) })),
    edges,
    turns: n,
    depth: Math.max(...d.values()),
    source: nodes.find((x) => !edges.some((e) => e.to === x.id)).id,
    sink: nodes.find((x) => !edges.some((e) => e.from === x.id)).id,
  };
};

export const EXACT_LIMIT = 7;

/** How many DAGs the enumeration must sift for a given n. */
export const searchSize = (n) => 2 ** ((n * (n - 1)) / 2);

/**
 * Every shape on n turns, up to isomorphism.
 *
 * A DAG with a fixed topological order is an upper-triangular 0/1
 * matrix, so the search is over 2^(n(n-1)/2) masks. That is 32,768 at
 * n = 6 and 2,097,152 at n = 7, which is why the limit is where it is.
 */
export function allShapes(n, { limit = Infinity } = {}) {
  if (n < 3) throw new Error('a shape needs at least a source, a middle and a sink');
  if (n > EXACT_LIMIT) throw new Error(`exact enumeration stops at ${EXACT_LIMIT} turns; ${searchSize(n).toLocaleString()} masks is too many`);
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  const seen = new Map();
  const total = 1 << pairs.length;
  for (let mask = 0; mask < total; mask++) {
    const adj = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let b = 0; b < pairs.length; b++) if (mask & (1 << b)) adj[pairs[b][0]][pairs[b][1]] = 1;
    if (!wellFormed(adj, n)) continue;
    const c = canonical(adj, n);
    if (!seen.has(c)) {
      seen.set(c, adj);
      if (seen.size >= limit) break;
    }
  }
  return [...seen.values()].map((adj) => toGraph(adj, n));
}

/** Just the count, without building the graphs. */
export function countShapes(n) {
  return allShapes(n).length;
}

// ── sampling, for the sizes enumeration cannot reach ──────────────────

/**
 * A random plan on n turns with one source and one sink.
 *
 * Constructed rather than rejected: every non-source gets at least one
 * predecessor and every non-sink at least one successor, then extra
 * edges are added with probability `density`. That guarantees a valid
 * shape on every draw, and it is emphatically NOT a uniform sample of
 * the space. It is a sample of THIS CONSTRUCTION, and the shapes it
 * favours are the ones a chain-and-fan generator favours.
 */
export function sampleShape(n, seed = 1, { density = 0.3 } = {}) {
  const rng = mulberry32(seed);
  const adj = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let v = 1; v < n; v++) {
    // at least one predecessor, chosen from the earlier nodes
    adj[Math.floor(rng() * v)][v] = 1;
  }
  for (let v = 0; v < n - 1; v++) {
    // at least one successor, chosen from the later nodes
    const later = n - 1 - v;
    if (!adj[v].some((x, j) => x && j > v)) adj[v][v + 1 + Math.floor(rng() * later)] = 1;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!adj[i][j] && rng() < density) adj[i][j] = 1;
    }
  }
  // the construction can leave an interior node with no successor if the
  // only one it got was later removed; it never is, so this is a guard
  if (!wellFormed(adj, n)) {
    for (let v = 1; v < n - 1; v++) {
      if (!adj[v].some(Boolean)) adj[v][n - 1] = 1;
      if (!adj.some((r) => r[v])) adj[0][v] = 1;
    }
  }
  return toGraph(adj, n);
}

/** `count` distinct sampled shapes, deterministic in `seed`. */
export function sampleShapes(n, count = 200, { seed = 1, density = 0.3 } = {}) {
  const seen = new Map();
  for (let i = 0; i < count * 12 && seen.size < count; i++) {
    const g = sampleShape(n, seed + i * 7919, { density });
    const adj = Array.from({ length: n }, () => new Array(n).fill(0));
    const idx = new Map(g.nodes.map((x, k) => [x.id, k]));
    for (const e of g.edges) adj[idx.get(e.from)][idx.get(e.to)] = 1;
    const c = canonical(adj, n);
    if (!seen.has(c)) seen.set(c, g);
  }
  return [...seen.values()];
}

// ── the measurement this module exists for ────────────────────────────

/**
 * What fraction of the real space a candidate family reaches.
 *
 * `built` is a list of graph objects. Returns the exact space size, how
 * many distinct shapes the family contributes, and whether any of them
 * failed to be a valid shape at all, which would be a bug in the family
 * rather than a coverage number.
 */
export function coverage(n, built) {
  const truth = new Set(allShapes(n).map((g) => canonicalOf(g, n)));
  const mine = new Set(built.map((g) => canonicalOf(g, n)));
  const outside = [...mine].filter((c) => !truth.has(c));
  return {
    n,
    space: truth.size,
    family: mine.size,
    fraction: Math.round((mine.size / truth.size) * 10000) / 10000,
    percent: Math.round((mine.size / truth.size) * 1000) / 10,
    outside: outside.length,
  };
}

/** The canonical string of a graph object, whatever its node names. */
export function canonicalOf(g, n = g.nodes.length) {
  const idx = new Map(g.nodes.map((x, i) => [x.id, i]));
  const adj = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of g.edges) adj[idx.get(e.from)][idx.get(e.to)] = 1;
  return canonical(adj, n);
}

/**
 * The counts, pinned. These are the ground truth every other method here
 * is checked against, and they were computed twice by different code.
 */
export const KNOWN_COUNTS = { 3: 2, 4: 10, 5: 98, 6: 1960 };
