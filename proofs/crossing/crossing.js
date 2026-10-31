// proofs/crossing/crossing.js — crossing numbers of K_n and K_{m,n}:
// the classical optimal drawings, counted exactly, and the finite checks a
// browser can honestly run against the 2026 claims that they are optimal.
//
// The ONE copy of the maths: index.html imports it with <script type="module">,
// crossing.selftest.mjs imports it unchanged.
//
// Sources (openai/math, family 165, both Lean-formalized):
//   "The crossing number of complete graphs"            — Harary–Hill
//   "The crossing number of complete bipartite graphs"  — Zarankiewicz / Turán
// The formulas below are written exactly as the Lean challenge statements
// write them (natural-number floor division), so the page cannot drift from
// what was formalized.

// ------------------------------------------------------------- formulas ----
/** Lean `hill`: (n/2 · (n−1)/2 · (n−2)/2 · (n−3)/2) / 4, all floor division. */
export function hill(n) {
  if (n < 3) return 0;
  const f = (k) => Math.floor(k / 2);
  return (f(n) * f(n - 1) * f(n - 2) * f(n - 3)) / 4;
}
/** Lean `axisPairs` (the paper's d_r): ⌊r/2⌋·⌊(r−1)/2⌋. */
export const axisPairs = (r) => Math.floor(r / 2) * Math.floor((r - 1) / 2);
/** Zarankiewicz: cr(K_{m,n}) = d_m · d_n. */
export const zarankiewicz = (m, n) => axisPairs(m) * axisPairs(n);

// ---------------------------------------------------- K_n, two pages -------
// The paper's §"A matching two-page drawing" (de Klerk–Pasechnik–Salazar's
// endpoint-sum rule, after Blažek–Koman): vertices 0..n−1 on a line, edge ij
// above the line iff (i + j) mod n < ⌊n/2⌋, below otherwise, each edge a
// semicircle on its two endpoints.

/** All edges of K_n as [i, j] with i < j. */
export function completeEdges(n) {
  const e = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e.push([i, j]);
  return e;
}
/** The paper's page assignment: 0 = above the spine, 1 = below. */
export function endpointSumPages(n) {
  const m = Math.floor(n / 2);
  return completeEdges(n).map(([i, j]) => ((i + j) % n < m ? 0 : 1));
}
/** Two chords on a line cross iff their endpoints alternate. */
export const interleave = ([a, b], [c, d]) => (a < c && c < b && b < d) || (c < a && a < d && d < b);

/**
 * Crossings of a two-page drawing: pairs of edges on the same page whose
 * endpoints alternate along the spine. Exact and combinatorial — the paper
 * proves this is the true point count for semicircles at generic positions.
 * Returns { count, pairs } (pairs only when asked).
 */
export function twoPageCrossings(n, pages, { list = false } = {}) {
  const E = completeEdges(n);
  let count = 0;
  const pairs = list ? [] : null;
  for (let x = 0; x < E.length; x++)
    for (let y = x + 1; y < E.length; y++)
      if (pages[x] === pages[y] && interleave(E[x], E[y])) { count++; if (list) pairs.push([x, y]); }
  return { count, pairs };
}

/** Per-edge crossing counts, for colouring the busiest edges. */
export function edgeLoads(n, pages) {
  const E = completeEdges(n), load = new Array(E.length).fill(0);
  for (let x = 0; x < E.length; x++)
    for (let y = x + 1; y < E.length; y++)
      if (pages[x] === pages[y] && interleave(E[x], E[y])) { load[x]++; load[y]++; }
  return load;
}

/**
 * The geometric check the combinatorial count relies on: place the vertices
 * at the given x-positions, draw every edge as a semicircle on its page, and
 * intersect the semicircles as real curves. y² = (x−a)(b−x) for both arcs
 * makes the difference affine in x, so each pair meets at most once, at
 * x = (ab − cd)/(a + b − c − d). Returns the crossing points, independent of
 * `interleave`.
 */
export function semicirclePoints(n, pages, xs) {
  const E = completeEdges(n), pts = [];
  for (let p = 0; p < E.length; p++)
    for (let q = p + 1; q < E.length; q++) {
      if (pages[p] !== pages[q]) continue;
      const [i, j] = E[p], [k, l] = E[q];
      if (i === k || i === l || j === k || j === l) continue;   // share an endpoint: meet only there
      const a = xs[i], b = xs[j], c = xs[k], d = xs[l];
      const den = a + b - c - d;
      if (Math.abs(den) < 1e-15) continue;
      const x = (a * b - c * d) / den;
      const y2 = (x - a) * (b - x);
      if (x > Math.min(a, b) && x < Math.max(a, b) && x > Math.min(c, d) && x < Math.max(c, d) && y2 > 0)
        pts.push({ x, y: (pages[p] === 0 ? 1 : -1) * Math.sqrt(y2), edges: [p, q] });
    }
  return pts;
}

/** Generic positions: the paper asks for them to rule out triple crossings. */
export function genericPositions(n, seed = 1) {
  let s = seed >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, (_, i) => i + 0.18 * (r() - 0.5));
}

/**
 * Exact minimum of a two-page drawing of K_n over all 2^(E−1) page
 * assignments (vertex order is irrelevant for K_n: any order is a relabelling).
 * Branch and bound: every unassigned edge will cross at least
 * min(conflicts above, conflicts below) with the edges already placed.
 * `target` lets the caller ask only "is there anything below target?".
 * Returns { min, nodes, witness }.
 */
export function twoPageMinimum(n, { target = Infinity, onProgress = null } = {}) {
  const E = completeEdges(n), m = E.length;
  // order edges longest-first: long chords conflict most, so bounds bite early
  const order = [...E.keys()].sort((x, y) => (E[y][1] - E[y][0]) - (E[x][1] - E[x][0]));
  const conf = order.map((x) => order.map((y) => (x !== y && interleave(E[x], E[y]) ? 1 : 0)));
  const page = new Int8Array(m).fill(-1);
  // c[k][p]: crossings unassigned edge k would get with placed edges if put on page p
  const c = Array.from({ length: m }, () => [0, 0]);
  let best = target === Infinity ? Infinity : target, witness = null, nodes = 0;
  const go = (k, cur) => {
    nodes++;
    if (onProgress && (nodes & 0xfffff) === 0) onProgress(nodes);
    if (k === m) { if (cur < best) { best = cur; witness = Array.from(page); } return; }
    let lb = cur;
    for (let r = k; r < m; r++) lb += Math.min(c[r][0], c[r][1]);
    if (lb >= best) return;
    for (const p of k === 0 ? [0] : [0, 1]) {          // flipping every edge is a symmetry: fix the first
      page[k] = p;
      for (let r = k + 1; r < m; r++) if (conf[k][r]) c[r][p]++;
      go(k + 1, cur + c[k][p]);
      for (let r = k + 1; r < m; r++) if (conf[k][r]) c[r][p]--;
    }
    page[k] = -1;
  };
  go(0, 0);
  let w = null;
  if (witness) { w = new Array(m); order.forEach((e, k) => { w[e] = witness[k]; }); }
  return { min: best, nodes, witness: w };
}

/** Greedy descent: flip the edge that saves the most, until no flip helps. */
export function descend(n, pages) {
  const E = completeEdges(n), P = [...pages];
  for (let guard = 0; guard < 10000; guard++) {
    let bestGain = 0, bestEdge = -1;
    for (let x = 0; x < E.length; x++) {
      let same = 0, other = 0;
      for (let y = 0; y < E.length; y++) {
        if (x === y || !interleave(E[x], E[y])) continue;
        if (P[y] === P[x]) same++; else other++;
      }
      if (same - other > bestGain) { bestGain = same - other; bestEdge = x; }
    }
    if (bestEdge < 0) break;
    P[bestEdge] ^= 1;
  }
  return P;
}

// -------------------------------------------------- K_{m,n}, brickyard ------
// Zarankiewicz's drawing: one class on the x-axis, the other on the y-axis,
// each split as evenly as possible between the two sides of the origin;
// straight edges. Integer coordinates, so crossings are decided exactly.

export function axisSplit(r) {
  // r points: ⌈r/2⌉ at +1, +2, …  and ⌊r/2⌋ at −1, −2, …
  const out = [];
  for (let i = 0; i < Math.ceil(r / 2); i++) out.push(i + 1);
  for (let i = 0; i < Math.floor(r / 2); i++) out.push(-(i + 1));
  return out;
}
/** The Zarankiewicz drawing: kilns on the x-axis, yards on the y-axis. */
export function zarankiewiczDrawing(m, n) {
  return { kilns: axisSplit(m).map((x) => [x, 0]), yards: axisSplit(n).map((y) => [0, y]) };
}

const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
/** Do segments pq and rs cross at a single interior point? (shared endpoints excluded) */
export function segmentsCross(p, q, r, s) {
  const d1 = orient(p, q, r), d2 = orient(p, q, s), d3 = orient(r, s, p), d4 = orient(r, s, q);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
/** Crossings of a straight-line drawing of K_{m,n} given vertex positions. */
export function bipartiteCrossings(kilns, yards, { list = false } = {}) {
  const E = [];
  kilns.forEach((a, i) => yards.forEach((b, j) => E.push({ a, b, i, j })));
  let count = 0;
  const pts = list ? [] : null;
  for (let x = 0; x < E.length; x++)
    for (let y = x + 1; y < E.length; y++) {
      const e = E[x], f = E[y];
      if (e.i === f.i || e.j === f.j) continue;               // adjacent edges
      if (segmentsCross(e.a, e.b, f.a, f.b)) {
        count++;
        if (list) {
          const [p, q, r, s] = [e.a, e.b, f.a, f.b];
          const t = orient(r, s, p) / (orient(r, s, p) - orient(r, s, q));
          pts.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
      }
    }
  return { count, points: pts, edges: E.length };
}

// -------------------------------------------------------------- history ----
// What was known before the 2026 claim, as the two papers' introductions say.
export const KN_KNOWN = [
  { upTo: 10, who: 'Guy', year: 1972 },
  { upTo: 12, who: 'Pan & Richter (computer-assisted)', year: 2007 },
  { upTo: 14, who: 'Aichholzer (computer-assisted K₁₃, hence K₁₄)', year: 2021 },
];
export const KMN_KNOWN = 'Kleitman (1970): exact whenever one side has at most 6 vertices. Woodall (1993): K₇,₇ and K₇,₉ by computation.';
