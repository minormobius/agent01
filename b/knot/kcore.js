// knot/kcore.js — find the dense core of a mutual-follow graph you cannot afford
// to download.
//
// THE PROBLEM. 1,329 mutuals means 1,329 follow-lists to know the induced
// subgraph — about 20,000 paginated requests, eleven minutes at good
// concurrency. The old cluster tool waits for all of it and then shows you
// something. Nobody waits eleven minutes.
//
// THE SHAPE OF THE DATA. Fetching one account's follow list gives you a COMPLETE
// ROW of the adjacency matrix, not a sample of it. A mutual edge X<->Y is
// confirmed once both rows are in. So after k rows you know the induced subgraph
// on those k accounts exactly — and the ORDER you fetch decides which k.
//
// THE GUARANTEE. Take the fetched subgraph and find a set S where everyone has
// at least k mutuals inside S. Every one of those edges is real, and every node
// outside S can only ADD degree to its members. So S is a genuine k-core of the
// full graph, found from a fraction of it. More rows can raise k; they can never
// invalidate what you already have. Every intermediate answer is true — which is
// what makes stopping early legitimate rather than a guess.
//
// THE STEERING. An unfetched account's in-degree from already-fetched rows is a
// free estimate of how central it is: if twelve accounts you have already read
// follow it, it is probably in the same dense region they are. Fetch highest
// first and the core assembles in the first few hundred rows instead of the last.
//
// A k-core is not a clique, and that is deliberate. "Everyone follows everyone"
// is maximum-clique, which is NP-hard and brittle — one person who missed one
// follow splits the group in two. "Everyone here has at least k mutuals here" is
// linear to compute, robust to a missing edge, and a better description of what
// a community actually is.

/** Deterministic PRNG, so the same account always bootstraps the same way. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export class Knot {
  /**
   * @param {string[]} nodes  the candidate set (your mutuals, plus you)
   * @param {string}   seed   a DID used only to make the bootstrap order stable
   */
  constructor(nodes, seed = '') {
    this.nodes = [...new Set(nodes)];
    this.index = new Map(this.nodes.map((d, i) => [d, i]));
    this.out = new Map();          // did -> Set of in-set dids it follows
    this.inDegree = new Int32Array(this.nodes.length);   // from fetched rows only
    this.rand = mulberry32(hashSeed(seed || 'knot'));
    this._order = null;
  }

  get total() { return this.nodes.length; }
  get fetched() { return this.out.size; }
  has(did) { return this.index.has(did); }

  /**
   * Record one account's outward edges. `following` may be the account's entire
   * follow list — anything outside the candidate set is dropped here rather than
   * by the caller, so the caller never has to think about it.
   */
  addRow(did, following) {
    if (!this.index.has(did) || this.out.has(did)) return;
    const inSet = new Set();
    for (const t of following) {
      const i = this.index.get(t);
      if (i === undefined) continue;
      inSet.add(t);
      this.inDegree[i]++;
    }
    this.out.set(did, inSet);
  }

  /** Confirmed mutual edges: both rows fetched, and both directions present. */
  adjacency() {
    const adj = new Map();
    for (const d of this.out.keys()) adj.set(d, new Set());
    for (const [a, outs] of this.out) {
      for (const b of outs) {
        const back = this.out.get(b);
        if (back && back.has(a)) { adj.get(a).add(b); adj.get(b).add(a); }
      }
    }
    return adj;
  }

  /**
   * Core numbers by degeneracy peeling: repeatedly remove the lowest-degree
   * vertex, remembering the highest degree we were ever forced to accept.
   * O(V^2) with a linear min scan, which at V≈1,400 is nothing next to a single
   * network round trip.
   */
  static coreNumbers(adj) {
    const deg = new Map();
    for (const [v, ns] of adj) deg.set(v, ns.size);
    const left = new Set(adj.keys());
    const core = new Map();
    let k = 0;
    while (left.size) {
      let pick = null, best = Infinity;
      for (const v of left) { const d = deg.get(v); if (d < best) { best = d; pick = v; } }
      k = Math.max(k, best);
      core.set(pick, k);
      left.delete(pick);
      for (const n of adj.get(pick)) if (left.has(n)) deg.set(n, deg.get(n) - 1);
    }
    return core;
  }

  /**
   * The densest core confirmed so far. Always a real k-core of the full graph —
   * see the note at the top — so it is safe to show and safe to stop on.
   */
  core() {
    const adj = this.adjacency();
    if (!adj.size) return { k: 0, members: [], adj, edges: 0 };
    const core = Knot.coreNumbers(adj);
    let k = 0;
    for (const v of core.values()) if (v > k) k = v;
    const members = [...core].filter(([, v]) => v >= k).map(([d]) => d);
    const inCore = new Set(members);
    let edges = 0;
    for (const m of members) for (const n of adj.get(m)) if (inCore.has(n)) edges++;
    return { k, members, adj, edges: edges / 2, coreNumbers: core };
  }

  /**
   * What to fetch next, best first.
   *
   * Before anything is known every candidate looks identical, so the first
   * BOOTSTRAP picks are a deterministic shuffle — random enough to land in
   * several regions at once, stable enough that the same account reproduces.
   * After that it is pure in-degree: the accounts that the rows we already have
   * point at hardest.
   */
  nextTargets(n = 8, bootstrap = 32) {
    const pending = [];
    for (let i = 0; i < this.nodes.length; i++) {
      if (!this.out.has(this.nodes[i])) pending.push(i);
    }
    if (!pending.length) return [];

    if (this.fetched < bootstrap) {
      if (!this._order) {
        this._order = pending.slice();
        for (let i = this._order.length - 1; i > 0; i--) {
          const j = Math.floor(this.rand() * (i + 1));
          [this._order[i], this._order[j]] = [this._order[j], this._order[i]];
        }
      }
      const out = [];
      for (const i of this._order) {
        if (!this.out.has(this.nodes[i])) out.push(this.nodes[i]);
        if (out.length >= n) break;
      }
      return out;
    }

    pending.sort((a, b) => this.inDegree[b] - this.inDegree[a]);
    return pending.slice(0, n).map((i) => this.nodes[i]);
  }

  /** Enough to drive a progress readout without recomputing the core. */
  stats() {
    let known = 0;
    for (const s of this.out.values()) known += s.size;
    return { fetched: this.fetched, total: this.total, directedEdges: known };
  }
}
