// kith/community.js — community structure of a follow graph. Pure: no DOM, no
// network, deterministic for a given seed, so every number on the page can be
// reproduced in node (kith.selftest.mjs).
//
// THE QUESTION IT ANSWERS. cluster finds gold/silver/bronze as maximum cliques
// with shells peeled around each. That answers "who is the tightest group", not
// "what groups are there". Silver is only the biggest clique left once gold's
// core is removed, so when a network has merged into one community, silver lands
// inside it and the two shell sets mostly coincide (133 + 120 people for 193
// distinct, seen 2026-11-13). Community detection asks the other question:
// partition everyone so edges fall inside groups more than chance predicts.
//
// THE METHOD.
//   Louvain modularity maximisation, with the resolution γ exposed: γ < 1 merges
//   toward a few broad blocs, γ > 1 splits toward many tight cliques. A community
//   is then split into its connected components — plain Louvain can return a
//   community that is not even connected, and Leiden's main fix is exactly
//   this guarantee.
//   One run is one sample from a random node order, so every analysis runs many
//   seeds: the best-Q partition is shown, and agreement ACROSS runs (adjusted
//   Rand, per-person stability) says whether the communities are real structure
//   or one arbitrary cut through an evenly connected blob.
//   A null model gives Q its meaning: the same degrees, rewired at random, also
//   score some modularity. Only the excess over that is community structure.
//
// THE GRAPH. Nodes are DIDs. `rows` maps a DID whose follow list was read to the
// DIDs it follows. Edges are only drawn between nodes in the set (the induced
// subgraph). mode 'mutual' keeps reciprocal follows (weight 1); mode 'any' adds
// one-way follows at weight 0.5.

// ── seeded randomness ────────────────────────────────────────────────────────
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// ── graph ────────────────────────────────────────────────────────────────────
/**
 * @param {string[]} ids          the node set
 * @param {Map<string,string[]>|Object} rows  did → dids it follows (read rows only)
 * @param {{mode?:'mutual'|'any', exclude?:string[]}} [opts]
 * Nodes whose row was never read are dropped: an edge to them is known from one
 * side only, so a mutual could never be confirmed and they would look isolated.
 */
export function buildGraph(ids, rows, { mode = 'mutual', exclude = [] } = {}) {
  const get = rows instanceof Map ? (d) => rows.get(d) : (d) => rows[d];
  const skip = new Set(exclude);
  const nodes = [...new Set(ids)].filter((d) => !skip.has(d) && get(d));
  const index = new Map(nodes.map((d, i) => [d, i]));
  const out = nodes.map((d) => {
    const s = new Set();
    for (const t of get(d) || []) { const j = index.get(t); if (j !== undefined && t !== d) s.add(j); }
    return s;
  });
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (const j of out[i]) {
      if (j < i && out[j].has(i)) continue;           // mutual: counted from j's side
      const mutual = out[j].has(i);
      if (mode === 'mutual' && !mutual) continue;
      edges.push([i, j, mutual ? 1 : 0.5]);
    }
  }
  return fromEdges(nodes, edges);
}

/** Graph from an explicit undirected edge list [[i, j, w?], …]. */
export function fromEdges(ids, edges) {
  const n = ids.length;
  const adj = Array.from({ length: n }, () => new Map());
  for (const [i, j, w = 1] of edges) {
    if (i === j) continue;
    adj[i].set(j, (adj[i].get(j) || 0) + w);
    adj[j].set(i, (adj[j].get(i) || 0) + w);
  }
  return finish(ids, adj);
}
function finish(ids, adj) {
  const deg = adj.map((m) => { let s = 0; for (const w of m.values()) s += w; return s; });
  const m2 = deg.reduce((a, b) => a + b, 0);           // 2m: every edge counted twice
  let edgeCount = 0;
  for (const m of adj) edgeCount += m.size;
  return { ids, n: ids.length, adj, deg, m2, edgeCount: edgeCount / 2 };
}

/** The subgraph induced on node indices `keep` (drill-down into one community). */
export function subgraph(G, keep) {
  const local = new Map(keep.map((g, i) => [g, i]));
  const adj = keep.map(() => new Map());
  keep.forEach((g, i) => {
    for (const [j, w] of G.adj[g]) { const lj = local.get(j); if (lj !== undefined) adj[i].set(lj, w); }
  });
  return finish(keep.map((g) => G.ids[g]), adj);
}

// ── modularity ───────────────────────────────────────────────────────────────
/** Newman–Girvan modularity with resolution γ. `part[i]` = community label. */
export function modularity(G, part, gamma = 1) {
  if (!G.m2) return 0;
  const inW = new Map(), tot = new Map();
  for (let i = 0; i < G.n; i++) {
    const c = part[i];
    tot.set(c, (tot.get(c) || 0) + G.deg[i]);
    for (const [j, w] of G.adj[i]) if (part[j] === c) inW.set(c, (inW.get(c) || 0) + w);
  }
  let q = 0;
  for (const [c, t] of tot) q += (inW.get(c) || 0) / G.m2 - gamma * (t / G.m2) ** 2;
  return q;
}

// ── Louvain ──────────────────────────────────────────────────────────────────
// Works on a compact weighted graph: nbr[i] = [[j, w], …], self[i] = internal
// weight already absorbed into i (counted twice, as modularity's sum does).
function oneLevel(nbr, self, deg, m2, gamma, rng) {
  const n = nbr.length;
  const comm = Array.from({ length: n }, (_, i) => i);
  const tot = deg.slice();
  const order = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  let moved = false, improved = true, guard = 0;
  const wTo = new Map();
  while (improved && guard++ < 100) {
    improved = false;
    for (const i of order) {
      const ci = comm[i], ki = deg[i];
      wTo.clear();
      for (const [j, w] of nbr[i]) if (j !== i) wTo.set(comm[j], (wTo.get(comm[j]) || 0) + w);
      tot[ci] -= ki;
      let best = ci;
      let bestGain = (wTo.get(ci) || 0) - gamma * tot[ci] * ki / m2;
      for (const [c, w] of wTo) {
        const gain = w - gamma * tot[c] * ki / m2;
        if (gain > bestGain + 1e-12) { bestGain = gain; best = c; }
      }
      tot[best] += ki;
      if (best !== ci) { comm[i] = best; improved = true; moved = true; }
    }
  }
  return { comm, moved };
}

function relabel(arr) {
  const map = new Map();
  return arr.map((c) => { if (!map.has(c)) map.set(c, map.size); return map.get(c); });
}

/** One Louvain run. Returns a community label per node (0..k-1, connected). */
export function louvain(G, { gamma = 1, seed = 1 } = {}) {
  const rng = mulberry32(seed);
  let nbr = G.adj.map((m) => [...m]);
  let self = new Array(G.n).fill(0);
  let deg = G.deg.slice();
  let member = Array.from({ length: G.n }, (_, i) => i);     // original node → current supernode
  if (!G.m2) return new Array(G.n).fill(0).map((_, i) => i);

  for (let level = 0; level < 50; level++) {
    const { comm, moved } = oneLevel(nbr, self, deg, G.m2, gamma, rng);
    if (!moved) break;
    const lab = relabel(comm);
    const k = Math.max(...lab) + 1;
    member = member.map((s) => lab[s]);
    // aggregate
    const agg = Array.from({ length: k }, () => new Map());
    const aggSelf = new Array(k).fill(0), aggDeg = new Array(k).fill(0);
    for (let i = 0; i < nbr.length; i++) {
      const ci = lab[i];
      aggSelf[ci] += self[i];
      aggDeg[ci] += deg[i];
      for (const [j, w] of nbr[i]) {
        const cj = lab[j];
        if (ci === cj) aggSelf[ci] += w;
        else agg[ci].set(cj, (agg[ci].get(cj) || 0) + w);
      }
    }
    nbr = agg.map((m) => [...m]); self = aggSelf; deg = aggDeg;
    if (k === 1) break;
  }
  return relabel(splitDisconnected(G, member));
}

/** Split every community into its connected components (the Leiden guarantee). */
export function splitDisconnected(G, part) {
  const out = new Array(G.n).fill(-1);
  let next = 0;
  for (let s = 0; s < G.n; s++) {
    if (out[s] !== -1) continue;
    const c = part[s], stack = [s];
    out[s] = next;
    while (stack.length) {
      const i = stack.pop();
      for (const j of G.adj[i].keys()) if (out[j] === -1 && part[j] === c) { out[j] = next; stack.push(j); }
    }
    next++;
  }
  return out;
}

// ── agreement between partitions ─────────────────────────────────────────────
/** Adjusted Rand index: 1 = identical, ~0 = no better than chance. */
export function ari(a, b) {
  const n = a.length;
  if (n < 2) return 1;
  const cont = new Map(), ra = new Map(), rb = new Map();
  for (let i = 0; i < n; i++) {
    const key = a[i] + ',' + b[i];
    cont.set(key, (cont.get(key) || 0) + 1);
    ra.set(a[i], (ra.get(a[i]) || 0) + 1);
    rb.set(b[i], (rb.get(b[i]) || 0) + 1);
  }
  const c2 = (x) => x * (x - 1) / 2;
  let sIJ = 0, sA = 0, sB = 0;
  for (const v of cont.values()) sIJ += c2(v);
  for (const v of ra.values()) sA += c2(v);
  for (const v of rb.values()) sB += c2(v);
  const expected = sA * sB / c2(n), max = (sA + sB) / 2;
  if (max === expected) return 1;
  return (sIJ - expected) / (max - expected);
}

/**
 * Many seeds at one resolution. The best-Q partition is the answer; the spread
 * across runs is how much to believe it.
 *   agreement — mean ARI of every run against the best one
 *   stability[i] — mean Jaccard between i's community in each run and in the best
 */
export function consensus(G, { gamma = 1, runs = 12, seed = 1 } = {}) {
  const parts = [];
  for (let r = 0; r < runs; r++) parts.push(louvain(G, { gamma, seed: seed * 7919 + r * 104729 + 1 }));
  const qs = parts.map((p) => modularity(G, p, gamma));
  let bi = 0;
  for (let r = 1; r < runs; r++) if (qs[r] > qs[bi] + 1e-12) bi = r;
  const best = sortBySize(parts[bi]);

  const groups = (p) => { const g = new Map(); p.forEach((c, i) => { if (!g.has(c)) g.set(c, []); g.get(c).push(i); }); return g; };
  const bestG = groups(best);
  const stability = new Array(G.n).fill(0);
  let agree = 0, others = 0;
  for (let r = 0; r < runs; r++) {
    if (r === bi) continue;
    others++;
    agree += ari(best, parts[r]);
    const g = groups(parts[r]);
    const sets = new Map([...g].map(([c, arr]) => [c, new Set(arr)]));
    for (let i = 0; i < G.n; i++) {
      const A = bestG.get(best[i]), B = sets.get(parts[r][i]);
      let inter = 0; for (const x of A) if (B.has(x)) inter++;
      stability[i] += inter / (A.length + B.size - inter);
    }
  }
  if (others) for (let i = 0; i < G.n; i++) stability[i] /= others;
  else stability.fill(1);
  return { part: best, q: qs[bi], agreement: others ? agree / others : 1, stability, runs };
}

/** Relabel so community 0 is the largest (ties broken by first appearance). */
export function sortBySize(part) {
  const size = new Map(), first = new Map();
  part.forEach((c, i) => { size.set(c, (size.get(c) || 0) + 1); if (!first.has(c)) first.set(c, i); });
  const order = [...size.keys()].sort((a, b) => size.get(b) - size.get(a) || first.get(a) - first.get(b));
  const map = new Map(order.map((c, i) => [c, i]));
  return part.map((c) => map.get(c));
}

// ── the null model ───────────────────────────────────────────────────────────
/**
 * Degree-preserving rewiring (double edge swaps). Each node keeps its degree;
 * who it is connected to becomes random. Weights travel with their edge.
 */
export function rewire(G, { seed = 1, swapsPerEdge = 10 } = {}) {
  const rng = mulberry32(seed);
  const edges = [];
  for (let i = 0; i < G.n; i++) for (const [j, w] of G.adj[i]) if (i < j) edges.push([i, j, w]);
  const has = new Set(edges.map(([a, b]) => a < b ? a * G.n + b : b * G.n + a));
  const key = (a, b) => (a < b ? a * G.n + b : b * G.n + a);
  const tries = edges.length * swapsPerEdge;
  for (let t = 0; t < tries && edges.length > 1; t++) {
    const x = Math.floor(rng() * edges.length), y = Math.floor(rng() * edges.length);
    if (x === y) continue;
    const [a, b, w1] = edges[x], [c, d, w2] = edges[y];
    const flip = rng() < 0.5;
    const [p, q] = flip ? [d, c] : [c, d];               // a–b, p–q → a–q, p–b
    if (a === q || p === b || has.has(key(a, q)) || has.has(key(p, b))) continue;
    has.delete(key(a, b)); has.delete(key(p, q));
    has.add(key(a, q)); has.add(key(p, b));
    edges[x] = [a, q, w1]; edges[y] = [p, b, w2];
  }
  return fromEdges(G.ids, edges);
}

/** Modularity a random graph with these degrees reaches, averaged over `samples`. */
export function nullModularity(G, { gamma = 1, samples = 5, seed = 1 } = {}) {
  const qs = [];
  for (let s = 0; s < samples; s++) {
    const R = rewire(G, { seed: seed + s * 31 });
    qs.push(consensus(R, { gamma, runs: 3, seed: seed + s }).q);
  }
  const mean = qs.reduce((a, b) => a + b, 0) / (qs.length || 1);
  const sd = Math.sqrt(qs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, qs.length - 1));
  return { mean, sd, samples: qs };
}

// ── structure measures ───────────────────────────────────────────────────────
/** k-core number of every node (unweighted). */
export function coreNumbers(G, nodes = null) {
  const set = nodes ? new Set(nodes) : null;
  const idx = nodes || Array.from({ length: G.n }, (_, i) => i);
  const d = new Map(), core = new Map();
  for (const i of idx) { let k = 0; for (const j of G.adj[i].keys()) if (!set || set.has(j)) k++; d.set(i, k); }
  const removed = new Set();
  let k = 0;
  while (removed.size < idx.length) {
    let pick = -1, low = Infinity;
    for (const i of idx) if (!removed.has(i) && d.get(i) < low) { low = d.get(i); pick = i; }
    k = Math.max(k, low);
    core.set(pick, k); removed.add(pick);
    for (const j of G.adj[pick].keys()) if ((!set || set.has(j)) && !removed.has(j)) d.set(j, d.get(j) - 1);
  }
  return core;
}

/** Local clustering coefficient of each node in `nodes` (within that set). */
export function clustering(G, nodes = null) {
  const set = nodes ? new Set(nodes) : null;
  const idx = nodes || Array.from({ length: G.n }, (_, i) => i);
  const out = new Map();
  let triangles = 0, triples = 0;
  for (const i of idx) {
    const nb = [...G.adj[i].keys()].filter((j) => !set || set.has(j));
    const k = nb.length;
    if (k < 2) { out.set(i, 0); continue; }
    let t = 0;
    for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) if (G.adj[nb[a]].has(nb[b])) t++;
    out.set(i, t / (k * (k - 1) / 2));
    triangles += t; triples += k * (k - 1) / 2;
  }
  return { local: out, transitivity: triples ? triangles / triples : 0 };
}

/** Brandes betweenness, unweighted, normalised to [0, 1]. */
export function betweenness(G) {
  const n = G.n, bc = new Float64Array(n);
  const S = new Int32Array(n), dist = new Int32Array(n), sigma = new Float64Array(n), delta = new Float64Array(n);
  const preds = Array.from({ length: n }, () => []);
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    let sp = 0;
    for (let i = 0; i < n; i++) { preds[i].length = 0; dist[i] = -1; sigma[i] = 0; delta[i] = 0; }
    sigma[s] = 1; dist[s] = 0;
    let qh = 0, qt = 0; queue[qt++] = s;
    while (qh < qt) {
      const v = queue[qh++]; S[sp++] = v;
      for (const w of G.adj[v].keys()) {
        if (dist[w] < 0) { dist[w] = dist[v] + 1; queue[qt++] = w; }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; preds[w].push(v); }
      }
    }
    while (sp > 0) {
      const w = S[--sp];
      for (const v of preds[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) bc[w] += delta[w];
    }
  }
  const norm = n > 2 ? 1 / ((n - 1) * (n - 2)) : 0;     // undirected: /2 twice-counted, ×2 pair norm
  return Array.from(bc, (x) => x * norm);
}

/**
 * Everything the page shows about one partition.
 * Per community: size, internal/cut weight, density, lift over the whole graph's
 * density, conductance, cohesion (mean share of a member's ties that stay
 * inside), internal k-core, mean clustering, and its links to other communities.
 * Per person: degree, internal degree, participation coefficient P (0 = every
 * tie in one community, → 1 = spread evenly), within-community z-score, role.
 */
export function describe(G, part) {
  const k = Math.max(-1, ...part) + 1;
  const members = Array.from({ length: k }, () => []);
  part.forEach((c, i) => members[c].push(i));

  const kin = new Array(G.n).fill(0), kTo = Array.from({ length: G.n }, () => new Map());
  for (let i = 0; i < G.n; i++) {
    for (const [j, w] of G.adj[i]) {
      const c = part[j];
      kTo[i].set(c, (kTo[i].get(c) || 0) + w);
      if (c === part[i]) kin[i] += w;
    }
  }
  const pairs = G.n * (G.n - 1) / 2;
  const graphDensity = pairs ? G.edgeCount / pairs : 0;
  const between = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < G.n; i++) for (const [j, w] of G.adj[i]) if (i < j && part[i] !== part[j]) {
    between[part[i]][part[j]] += w; between[part[j]][part[i]] += w;
  }

  const communities = members.map((mem, c) => {
    const n = mem.length;
    let inEdges = 0, inW = 0, vol = 0;
    for (const i of mem) {
      vol += G.deg[i];
      for (const [j, w] of G.adj[i]) if (part[j] === c) { inW += w; if (i < j) inEdges++; }
    }
    inW /= 2;
    const cut = vol - 2 * inW;
    const density = n > 1 ? inEdges / (n * (n - 1) / 2) : 0;
    const conductance = Math.min(vol, G.m2 - vol) > 0 ? cut / Math.min(vol, G.m2 - vol) : 0;
    const cohesion = n ? mem.reduce((s, i) => s + (G.deg[i] ? kin[i] / G.deg[i] : 0), 0) / n : 0;
    const cores = coreNumbers(G, mem);
    const cl = clustering(G, mem);
    let cs = 0; for (const v of cl.local.values()) cs += v;
    return {
      id: c, size: n, members: mem, inEdges, inWeight: inW, cut, volume: vol,
      density, lift: graphDensity ? density / graphDensity : 0, conductance, cohesion,
      kcore: Math.max(0, ...cores.values()), clustering: n ? cs / n : 0,
      links: between[c],
    };
  });

  // within-community degree z-score (Guimerà & Amaral) and participation
  const zs = new Array(G.n).fill(0), P = new Array(G.n).fill(0);
  for (const com of communities) {
    const vals = com.members.map((i) => kin[i]);
    const mu = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / (vals.length || 1));
    for (const i of com.members) zs[i] = sd > 0 ? (kin[i] - mu) / sd : 0;
  }
  for (let i = 0; i < G.n; i++) {
    if (!G.deg[i]) continue;
    let s = 0; for (const w of kTo[i].values()) s += (w / G.deg[i]) ** 2;
    P[i] = 1 - s;
  }
  const people = Array.from({ length: G.n }, (_, i) => ({
    i, id: G.ids[i], community: part[i], degree: G.deg[i], internal: kin[i],
    participation: P[i], z: zs[i], role: role(G.deg[i], kin[i], zs[i], P[i]),
    reaches: [...kTo[i]].filter(([c]) => c !== part[i]).sort((a, b) => b[1] - a[1]),
  }));
  return { communities, people, graphDensity };
}

/** A plain-words role. Thresholds after Guimerà & Amaral (2005), loosened for small groups. */
export function role(deg, kin, z, P) {
  if (!deg) return 'isolate';
  if (!kin) return 'outsider';
  const hub = z >= 1.5;
  if (hub) return P >= 0.5 ? 'broker' : 'anchor';
  if (P >= 0.5) return 'bridge';
  return P < 0.15 ? 'inner' : 'member';
}

/** Whole-graph summary. */
export function summary(G) {
  const comps = splitDisconnected(G, new Array(G.n).fill(0));
  const sizes = new Map(); comps.forEach((c) => sizes.set(c, (sizes.get(c) || 0) + 1));
  const cl = clustering(G);
  let avg = 0; for (const v of cl.local.values()) avg += v;
  const cores = coreNumbers(G);
  return {
    nodes: G.n, edges: G.edgeCount,
    density: G.n > 1 ? G.edgeCount / (G.n * (G.n - 1) / 2) : 0,
    meanDegree: G.n ? 2 * G.edgeCount / G.n : 0,
    transitivity: cl.transitivity, clustering: G.n ? avg / G.n : 0,
    degeneracy: Math.max(0, ...cores.values()),
    components: sizes.size, largest: Math.max(0, ...sizes.values()),
    isolates: G.deg.filter((d) => !d).length,
  };
}

// ── the resolution sweep ─────────────────────────────────────────────────────
export const GAMMAS = [0.25, 0.4, 0.6, 0.8, 1, 1.25, 1.6, 2, 2.6, 3.4];

/**
 * Communities across resolutions — how the loose confederation breaks into
 * tighter groups as γ rises. Each level's communities are traced to the
 * reference partition's community they overlap most (`parent`), so colour can
 * follow lineage.
 */
export function sweep(G, ref, { gammas = GAMMAS, runs = 6, seed = 1, minSize = 2 } = {}) {
  return gammas.map((gamma) => {
    const r = consensus(G, { gamma, runs, seed });
    const k = Math.max(-1, ...r.part) + 1;
    const groups = Array.from({ length: k }, () => []);
    r.part.forEach((c, i) => groups[c].push(i));
    const comms = groups.map((mem) => {
      const tally = new Map();
      for (const i of mem) tally.set(ref[i], (tally.get(ref[i]) || 0) + 1);
      let parent = -1, best = -1;
      for (const [c, v] of tally) if (v > best || (v === best && c < parent)) { best = v; parent = c; }
      return { size: mem.length, parent, purity: best / mem.length, members: mem };
    });
    return {
      gamma, q: r.q, agreement: r.agreement, part: r.part,
      count: comms.filter((c) => c.size >= minSize).length, communities: comms,
    };
  });
}

// ── layout ───────────────────────────────────────────────────────────────────
/**
 * Force layout, deterministic. Communities start on their own arc and feel a
 * gentle pull to their centroid, so the picture shows the partition without
 * inventing separation the edges do not support (the pull is weak; heavily
 * bridged communities still overlap). Repulsion uses a grid, so ~1500 nodes stay
 * interactive. Coordinates come back in [-1, 1].
 */
export function layout(G, part, { iterations = 260, seed = 1, groupPull = 0.04 } = {}) {
  const n = G.n, rng = mulberry32(seed);
  const k = Math.max(0, ...part) + 1;
  const x = new Float64Array(n), y = new Float64Array(n);
  const sizes = new Array(k).fill(0); part.forEach((c) => sizes[c]++);
  for (let i = 0; i < n; i++) {
    const a = (part[i] / k) * Math.PI * 2, r = k > 1 ? 0.55 : 0;
    const spread = 0.15 + 0.25 * Math.sqrt(sizes[part[i]] / n);
    x[i] = Math.cos(a) * r + (rng() - 0.5) * spread;
    y[i] = Math.sin(a) * r + (rng() - 0.5) * spread;
  }
  if (n < 2) return { x, y };
  const ideal = 1.6 / Math.sqrt(n);
  const cell = ideal * 3;
  const vx = new Float64Array(n), vy = new Float64Array(n);
  for (let it = 0; it < iterations; it++) {
    const temp = 0.08 * (1 - it / iterations) + 0.004;
    vx.fill(0); vy.fill(0);
    // repulsion within neighbouring grid cells
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const key = Math.floor(x[i] / cell) + ',' + Math.floor(y[i] / cell);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    for (const [key, list] of grid) {
      const [gx, gy] = key.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const other = grid.get((gx + dx) + ',' + (gy + dy));
        if (!other) continue;
        for (const i of list) for (const j of other) {
          if (j <= i) continue;
          let ddx = x[i] - x[j], ddy = y[i] - y[j];
          let d2 = ddx * ddx + ddy * ddy;
          if (d2 < 1e-9) { ddx = (rng() - 0.5) * 1e-3; ddy = (rng() - 0.5) * 1e-3; d2 = 1e-6; }
          if (d2 > cell * cell) continue;
          const f = (ideal * ideal) / d2;
          vx[i] += ddx * f; vy[i] += ddy * f; vx[j] -= ddx * f; vy[j] -= ddy * f;
        }
      }
    }
    // attraction along edges
    for (let i = 0; i < n; i++) for (const [j, w] of G.adj[i]) {
      if (j <= i) continue;
      const ddx = x[i] - x[j], ddy = y[i] - y[j];
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1e-6;
      const f = (d / ideal) * w * 0.5;
      vx[i] -= ddx / d * f * ideal; vy[i] -= ddy / d * f * ideal;
      vx[j] += ddx / d * f * ideal; vy[j] += ddy / d * f * ideal;
    }
    // community pull + weak gravity
    const cx = new Float64Array(k), cy = new Float64Array(k);
    for (let i = 0; i < n; i++) { cx[part[i]] += x[i]; cy[part[i]] += y[i]; }
    for (let c = 0; c < k; c++) if (sizes[c]) { cx[c] /= sizes[c]; cy[c] /= sizes[c]; }
    for (let i = 0; i < n; i++) {
      vx[i] += (cx[part[i]] - x[i]) * groupPull - x[i] * 0.01;
      vy[i] += (cy[part[i]] - y[i]) * groupPull - y[i] * 0.01;
      const d = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      if (d > 0) { const s = Math.min(d, temp) / d; x[i] += vx[i] * s; y[i] += vy[i] * s; }
    }
  }
  let mx = 1e-9;
  for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(x[i]), Math.abs(y[i]));
  for (let i = 0; i < n; i++) { x[i] /= mx; y[i] /= mx; }
  return { x, y };
}

/** Matrix order: communities largest first, members by internal degree. */
export function matrixOrder(G, part, desc) {
  const order = [];
  for (const com of desc.communities) {
    const mem = com.members.slice().sort((a, b) => desc.people[b].internal - desc.people[a].internal || a - b);
    order.push(...mem);
  }
  return order;
}

/** One call for the page: partition, its description, the null model, the sweep. */
export function analyse(G, { gamma = 1, runs = 16, seed = 1, nullSamples = 4, withSweep = true, withBetweenness = true } = {}) {
  const c = consensus(G, { gamma, runs, seed });
  const desc = describe(G, c.part);
  const nul = G.edgeCount ? nullModularity(G, { gamma, samples: nullSamples, seed }) : { mean: 0, sd: 0, samples: [] };
  const bc = withBetweenness ? betweenness(G) : null;
  if (bc) for (const p of desc.people) p.betweenness = bc[p.i];
  return {
    gamma, part: c.part, q: c.q, agreement: c.agreement, stability: c.stability,
    nullQ: nul, excessQ: c.q - nul.mean,
    summary: summary(G), ...desc,
    sweep: withSweep ? sweep(G, c.part, { seed }) : null,
  };
}
