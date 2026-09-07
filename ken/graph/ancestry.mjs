/* ─────────────────────────────────────────────────────────────────────
   ken/graph/ancestry.mjs — a turn's state is its precedents, so hash them.

   WP2 licensed pooling by AUTOMORPHISM ORBIT: two turns may be averaged
   when a symmetry of the plan exchanges them. That is right about the
   graph and slightly wrong about the agent, and this module is the
   correction.

   An orbit is defined by in- AND out-structure. An agent's state is
   defined by its in-structure alone. Who reads a turn's output later
   cannot affect what that turn does. So the equivalence that licenses
   pooling BEHAVIOUR is the ancestry, not the orbit — coarser in one
   direction, because it ignores out-edges, and finer in the other,
   because it can carry content.

   ── THE CONSTRUCTION, TAKEN FROM hoop ────────────────────────────────

   `hoop-archive/js/postal.js` folds a quadtree of world chunks into one
   digest: a leaf hashes a chunk's contents, an internal node mixes
   (seed, level, bx, by) into the accumulator BEFORE folding its four
   children, and a whole sector "@ this genome" gets one verifiable hash,
   derived on demand and never stored. Two sectors are the same design
   state exactly when their digests match.

   Both features transfer and both matter:

   1. DOMAIN SEPARATION BEFORE THE FOLD. hoop mixes the node's own
      coordinates in first, so a leaf digest can never be confused with
      an internal one. Here the analogue is the node's arity and its
      children's sorted digests: without that, a turn fed by {A} and a
      turn fed by {A, A} would collide.

   2. DERIVED ON DEMAND, NEVER STORED. The digest is a function of the
      plan. Nothing has to persist it and nothing can disagree with it.

   ── AND hoop's WARNING, WHICH IS THE MORE USEFUL IMPORT ──────────────

   hoop states plainly: "A Merkle tree does not speed up routing — the
   Hilbert/quadtree index does that; Merkle is purely for verifiable and
   forkable state."

   The same limit binds here and it is worth being blunt about, because
   the tempting claim is false. A digest does NOT reduce what an agent
   must read to do its work. It does not restore ken. An agent handed a
   32-bit root instead of five upstream reports knows only whether it has
   seen this state before; it cannot act on the contents. Briefing costs
   in-degree n-1 at the last turn, and no hash makes that cheaper.

   What the digest buys is IDENTITY, which is a different and cheaper
   thing: two turns with equal ancestry digests received the same inputs,
   so any difference in what they produce is run-to-run variance and
   nothing else. That is a free blocking variable, and it is the sharpest
   instrument on this site for the one quantity every cost estimate here
   depends on.
   ───────────────────────────────────────────────────────────────────── */

import { adjacency, topological } from './roles.mjs';

/* FNV-1a over 32 bits. Not a cryptographic hash and not used as one:
   nothing here defends against an adversary choosing a collision, it
   only distinguishes states that a run actually produced. hoop uses a
   32-bit integer mixer for the same reason. If this ever needs to resist
   a forged claim of equality, it needs a real hash. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashStr(s, seed = FNV_OFFSET) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

export const hex = (h) => (h >>> 0).toString(16).padStart(8, '0');

/**
 * The digest of what a turn RECEIVES.
 *
 * Recursive, memoised over a topological order, and folded in the order
 * hoop uses: the node's own arity first, then its children's digests
 * sorted. Sorting is what makes the digest a property of the SET of
 * inputs rather than of the order they happen to sit in the edge list,
 * which is required — the four workers of a star are fed identically and
 * must agree.
 *
 * `contentOf(node)` supplies what the turn is, if anything is known. The
 * default is the empty string, which gives the purely STRUCTURAL digest:
 * two turns agree exactly when their ancestry sub-DAGs are isomorphic as
 * rooted labelled-by-nothing DAGs. Pass real briefs and it becomes the
 * content-addressed version.
 */
export function ancestryDigests(graph, { contentOf = () => '' } = {}) {
  const { ins } = adjacency(graph);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const self = new Map(); // digest of a node INCLUDING itself
  const anc = new Map(); // digest of everything upstream, EXCLUDING itself

  for (const id of topological(graph)) {
    const parents = ins.get(id).map((p) => self.get(p)).sort((a, b) => a - b);
    // arity first, exactly as hoop mixes (seed, level, bx, by) before its
    // children: without it {A} and {A, A} fold to the same value.
    let h = hashStr(`^${parents.length}`);
    for (const p of parents) h = hashStr(hex(p), h);
    anc.set(id, h >>> 0);
    self.set(id, hashStr(`|${contentOf(byId.get(id))}`, h) >>> 0);
  }
  return { anc, self };
}

/**
 * The pooling classes this licenses: turns grouped by the digest of what
 * they were fed.
 *
 * A star's four workers land in one class. So do the two A-wave turns of
 * a standard run — AND, because the digest knows nothing about which
 * plan it came from, the star's workers and the standard run's A-wave
 * land in the SAME class as each other. Both are fed exactly one setup
 * turn and nothing else. That is a cross-shape pooling licence the orbit
 * argument cannot give, because the two graphs have no automorphism
 * between them.
 */
export function ancestryClasses(graph, opts = {}) {
  const { anc } = ancestryDigests(graph, opts);
  const cells = new Map();
  for (const n of graph.nodes) {
    const k = hex(anc.get(n.id));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(n.id);
  }
  return [...cells.entries()]
    .map(([digest, ids]) => ({ digest, ids: ids.slice().sort(), size: ids.length }))
    .sort((a, b) => b.size - a.size || a.digest.localeCompare(b.digest));
}

/**
 * Pool across several plans at once. The point of the exercise: a
 * six-turn star and a six-turn standard run contribute to the same cell
 * whenever their turns were fed the same thing.
 */
export function poolAcross(graphs, { rho = 0.413, ...opts } = {}) {
  const cells = new Map();
  for (const [name, g] of Object.entries(graphs)) {
    const { anc } = ancestryDigests(g, opts);
    for (const n of g.nodes) {
      const k = hex(anc.get(n.id));
      if (!cells.has(k)) cells.set(k, { digest: k, members: [], perRun: new Map() });
      cells.get(k).members.push(`${name}/${n.id}`);
      cells.get(k).perRun.set(name, (cells.get(k).perRun.get(name) ?? 0) + 1);
    }
  }
  return [...cells.values()].map((c) => {
    /* The members of a cell sit in several runs, so they are clusters of
       unequal size and the design effect takes Kish's average cluster
       size, Sum(m^2)/Sum(m), not the raw count. Same quantity as the n0
       in design.mjs varianceComponents, and it matters: treating 13 turns
       spread over six runs as one cluster of 13 understates the effective
       sample by a factor of four. */
    const m = [...c.perRun.values()];
    const total = m.reduce((s, x) => s + x, 0);
    const kish = m.reduce((s, x) => s + x * x, 0) / total;
    const deff = 1 + (kish - 1) * rho;
    return {
      digest: c.digest,
      members: c.members,
      shapes: [...c.perRun.keys()].sort(),
      perRun: Object.fromEntries(c.perRun),
      size: total,
      crossShape: c.perRun.size > 1,
      kishClusterSize: r3(kish),
      deff: r3(deff),
      effective: r3(total / deff),
    };
  }).sort((a, b) => b.size - a.size || a.digest.localeCompare(b.digest));
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Orbits and ancestry classes compared on one plan.
 *
 * Neither refines the other in general, which is the whole point and is
 * asserted rather than asserted-away:
 *
 *   an orbit is not an ancestry class — a chain's turns all sit in
 *   singleton orbits AND singleton ancestry classes, but `briefed`'s
 *   interior turns share neither;
 *
 *   an ancestry class is not an orbit — two turns fed identically can
 *   differ in out-degree, and then no automorphism exchanges them.
 *
 * `agreement` reports whether the two partitions coincide on this graph.
 */
export function comparePartitions(graph, orbits, opts = {}) {
  const classes = ancestryClasses(graph, opts);
  const key = (cells) => cells.map((c) => (c.ids ?? c).slice().sort().join(',')).sort().join(' | ');
  return {
    orbitCells: orbits.length,
    ancestryCells: classes.length,
    largestOrbit: Math.max(...orbits.map((o) => o.length)),
    largestAncestryClass: Math.max(...classes.map((c) => c.size)),
    agree: key(orbits) === key(classes),
    classes,
  };
}

/**
 * What the finer instrument buys, in the same currency as WP2.
 *
 * `effectiveReplication` used the largest orbit. The largest ancestry
 * class is the honest replacement when the question is about agent
 * behaviour rather than about the drawing.
 */
export function replicationByAncestry(graph, { rho = 0.413, ...opts } = {}) {
  const classes = ancestryClasses(graph, opts);
  const m = Math.max(...classes.map((c) => c.size));
  const deff = 1 + (m - 1) * rho;
  return {
    classes: classes.length,
    rawReplicates: m,
    deff: Math.round(deff * 1000) / 1000,
    effective: Math.round((m / deff) * 1000) / 1000,
    rho,
  };
}
