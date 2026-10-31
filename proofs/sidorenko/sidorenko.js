// proofs/sidorenko/sidorenko.js — the 35-vertex, 66-edge counterexample pattern to
// Sidorenko's conjecture. The only copy of the maths: the page and sidorenko.selftest.mjs
// import this file.
//
// Sidorenko's conjecture: for bipartite H with an edge and any graph G,
//   t(H, G) ≥ p(G)^{|E(H)|},  t(H,G) = Hom(H,G) / |V(G)|^{|V(H)|},  p(G) = 2|E(G)| / |V(G)|².
// The 2026 paper's H is the incidence graph of 22 triples on 13 points.

// The faces, verbatim from the Lean statement (`faces : Fin 22 → Finset (Fin 13)`)
export const FACES = [
  [0, 1, 3], [0, 1, 9], [0, 2, 3], [0, 2, 9], [1, 3, 10], [1, 7, 10],
  [1, 7, 12], [1, 9, 12], [2, 3, 4], [2, 4, 9], [3, 4, 11], [3, 10, 11],
  [4, 8, 9], [4, 8, 11], [5, 6, 7], [5, 6, 11], [5, 7, 10], [5, 10, 11],
  [6, 7, 12], [6, 8, 11], [6, 8, 12], [8, 9, 12]];
export const NP = 13, NF = 22;
// Table 1 of the paper: the opposite faces j12, j13, j23 and the bit labels
export const OPPOSITE = [[1, 2, 4], [0, 3, 7], [3, 0, 8], [2, 1, 9], [0, 5, 11], [6, 4, 16], [5, 7, 18], [1, 6, 21], [2, 9, 10], [8, 3, 12], [8, 11, 13], [4, 10, 17], [13, 9, 21], [12, 10, 19], [15, 16, 18], [14, 17, 19], [14, 17, 5], [16, 15, 11], [14, 20, 6], [20, 15, 13], [19, 18, 21], [12, 20, 7]];
export const BITS = ['000', '010', '001', '110', '001', '000', '100', '110', '101', '100', '111', '101', '101', '011', '000', '110', '010', '111', '001', '010', '011', '111'];
// Table 2: an exposure order for each bit class, with the new point each later face brings
export const ORDERS = [
  { pos: 1, val: 0, faces: [0, 1, 2, 4, 5, 16, 14, 18, 20, 19, 13], fresh: [9, 2, 10, 7, 5, 6, 12, 8, 11, 4] },
  { pos: 1, val: 1, faces: [3, 9, 8, 10, 11, 17, 15, 12, 21, 7, 6], fresh: [4, 3, 11, 10, 5, 6, 8, 12, 1, 7] },
  { pos: 2, val: 0, faces: [0, 2, 8, 9, 12, 4, 11, 5, 6, 18, 14], fresh: [2, 4, 9, 8, 10, 11, 7, 12, 6, 5] },
  { pos: 2, val: 1, faces: [1, 3, 7, 21, 20, 19, 13, 10, 15, 17, 16], fresh: [2, 12, 8, 6, 11, 4, 3, 5, 10, 7] },
  { pos: 3, val: 0, faces: [0, 1, 3, 9, 7, 6, 5, 16, 14, 15, 19], fresh: [9, 2, 4, 12, 7, 10, 5, 6, 11, 8] },
  { pos: 3, val: 1, faces: [2, 8, 10, 11, 4, 17, 13, 12, 21, 20, 18], fresh: [4, 11, 10, 1, 5, 8, 9, 12, 6, 7] }];
// equation (complex-colors): point degree in (I,E) and numbers of neighbours of degree 4, 5, 6
export const DEGREE_TABLE = [[4, 1, 0, 3], [6, 1, 3, 2], [4, 1, 1, 2], [6, 2, 2, 2], [5, 1, 1, 3], [4, 0, 3, 1], [5, 1, 3, 1], [5, 1, 3, 1], [5, 0, 3, 2], [6, 2, 3, 1], [5, 1, 1, 3], [6, 1, 4, 1], [5, 0, 3, 2]];

// ------------------------------------------------------------- structure ---
export const pairKey = (a, b) => (a < b ? a * 16 + b : b * 16 + a);
export function pairs() {               // point pair → faces containing it
  const m = new Map();
  FACES.forEach((f, j) => { for (const [a, b] of [[f[0], f[1]], [f[0], f[2]], [f[1], f[2]]]) { const k = pairKey(a, b); if (!m.has(k)) m.set(k, []); m.get(k).push(j); } });
  return m;
}
// the incidence graph H: point i ↔ face j; vertices 0..12 points, 13..34 faces
export function incidenceGraph() {
  const adj = Array.from({ length: NP + NF }, () => []);
  FACES.forEach((f, j) => { for (const i of f) { adj[i].push(NP + j); adj[NP + j].push(i); } });
  return adj;
}
export function faceNeighbours() {
  const P = pairs(), nb = Array.from({ length: NF }, () => new Set());
  for (const fs of P.values()) if (fs.length === 2) { nb[fs[0]].add(fs[1]); nb[fs[1]].add(fs[0]); }
  return nb;
}
export function connected(adjSets, n, start = 0, allowed = null) {
  const seen = new Set([start]), st = [start];
  while (st.length) { const x = st.pop(); for (const y of adjSets[x]) if (!seen.has(y) && (!allowed || allowed.has(y))) { seen.add(y); st.push(y); } }
  return seen.size === (allowed ? allowed.size : n);
}
// a_e = (number of bit positions where the two faces on e differ) / 3, as an integer 0..3
export function separations() {
  const out = [];
  for (const [k, fs] of pairs()) { const [x, y] = fs; let d = 0; for (let b = 0; b < 3; b++) if (BITS[x][b] !== BITS[y][b]) d++; out.push({ a: Math.floor(k / 16), b: k % 16, faces: fs, sep: d }); }
  return out;
}
// Colour refinement on H from two colours (points, faces): returns the partition sizes per round
export function colourRefinement() {
  const adj = incidenceGraph(), n = adj.length;
  let col = adj.map((_, v) => (v < NP ? 0 : 1)), rounds = [];
  for (let r = 0; r < 40; r++) {
    const sig = col.map((c, v) => c + '|' + adj[v].map((u) => col[u]).sort((a, b) => a - b).join(','));
    const ids = new Map(); const next = sig.map((s) => { if (!ids.has(s)) ids.set(s, ids.size); return ids.get(s); });
    rounds.push({ classes: new Set(col).size, colours: col.slice() });
    if (new Set(next).size === new Set(col).size) break;
    col = next;
  }
  const last = rounds[rounds.length - 1].colours;
  const discretePoints = new Set(last.slice(0, NP)).size === NP, discreteFaces = new Set(last.slice(NP)).size === NF;
  return { rounds, discretePoints, discreteFaces };
}

// ---------------------------------------------------- the complex is a sphere ---
// (an observation of this page, not a claim of the paper)
export function surface() {
  const V = NP, E = pairs().size, F = NF;
  const linksAreCycles = [...Array(NP).keys()].every((v) => {
    const edges = FACES.filter((f) => f.includes(v)).map((f) => f.filter((x) => x !== v));
    const deg = new Map(); for (const [a, b] of edges) { deg.set(a, (deg.get(a) || 0) + 1); deg.set(b, (deg.get(b) || 0) + 1); }
    if (![...deg.values()].every((d) => d === 2)) return false;
    const adj = new Map(); for (const [a, b] of edges) { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); }
    return connected(adj instanceof Map ? Object.fromEntries(adj) : adj, deg.size, edges[0][0]);
  });
  // consistent orientation: neighbouring faces traverse their shared pair in opposite directions
  const dir = (f, s) => (s > 0 ? [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]] : [[f[1], f[0]], [f[2], f[1]], [f[0], f[2]]]);
  const or = new Array(NF).fill(0); or[0] = 1; const q = [0]; let clash = 0;
  while (q.length) {
    const j = q.shift();
    for (const [a, b] of dir(FACES[j], or[j])) for (let k = 0; k < NF; k++) if (k !== j && FACES[k].includes(a) && FACES[k].includes(b)) {
      const want = dir(FACES[k], 1).some(([x, y]) => x === b && y === a) ? 1 : -1;
      if (!or[k]) { or[k] = want; q.push(k); } else if (or[k] !== want) clash++;
    }
  }
  return { V, E, F, euler: V - E + F, linksAreCycles, orientable: clash === 0, orientation: or };
}
// Tutte's barycentric embedding with one face as the outer triangle: a crossing-free
// straight-line drawing of the triangulation (3-connected planar graphs only)
export function tutte(outer = 14, iters = 3000, rounds = 0) {
  const nb = Array.from({ length: NP }, () => new Set());
  for (const f of FACES) for (const a of f) for (const b of f) if (a !== b) nb[a].add(b);
  const pos = Array.from({ length: NP }, () => [0, 0]), fixed = FACES[outer];
  fixed.forEach((v, i) => { const t = Math.PI / 2 + (2 * Math.PI * i) / 3; pos[v] = [Math.cos(t), -Math.sin(t)]; });
  // weighted barycentres: any positive weights give a crossing-free drawing (Tutte, Floater);
  // re-weighting by the current edge lengths a few times evens out the spacing
  const w = new Map(); const key = (a, b) => (a < b ? a * 16 + b : b * 16 + a);
  for (let r = 0; r <= rounds; r++) {
    for (let it = 0; it < iters; it++) for (let v = 0; v < NP; v++) if (!fixed.includes(v)) {
      let x = 0, y = 0, sw = 0; for (const u of nb[v]) { const wt = w.get(key(u, v)) ?? 1; x += wt * pos[u][0]; y += wt * pos[u][1]; sw += wt; } pos[v] = [x / sw, y / sw];
    }
    for (let v = 0; v < NP; v++) for (const u of nb[v]) w.set(key(u, v), Math.hypot(pos[u][0] - pos[v][0], pos[u][1] - pos[v][1]) ** 1.5 * (w.get(key(u, v)) ?? 1));
  }
  return { pos, outer };
}
export function minSpacing(emb) { let m = Infinity; for (let a = 0; a < NP; a++) for (let b = a + 1; b < NP; b++) m = Math.min(m, Math.hypot(emb.pos[a][0] - emb.pos[b][0], emb.pos[a][1] - emb.pos[b][1])); return m; }
const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
export function embeddingIsValid(emb) {        // every inner face has the orientation the sphere assigns, never zero
  const S = surface(); let sgn = 0;
  for (let j = 0; j < NF; j++) {
    if (j === emb.outer) continue;
    const [a, b, c] = FACES[j], o = orient(emb.pos[a], emb.pos[b], emb.pos[c]) * S.orientation[j];
    if (Math.abs(o) < 1e-12) return false;
    if (!sgn) sgn = Math.sign(o); else if (Math.sign(o) !== sgn) return false;
  }
  return true;
}

// ---------------------------------------------------------------- densities ---
// t(H, G) = Hom(H,G)/n^35. Summing out each face first,
//   Hom(H, G) = Σ_{x ∈ V^13} Π_faces c(x_a, x_b, x_c),  c = number of common neighbours,
// and the sum over the 13 points is done by variable elimination along a fixed order
// (the point graph is a planar triangulation of treewidth ≤ 5).
// an elimination order of width 5 (bags of 6 points), found offline by randomised local
// search for the least total table size; any order gives the same value
export const ELIM = [5, 2, 7, 6, 0, 10, 12, 1, 3, 11, 4, 9, 8];
// generic elimination over a number system {zero, one, add, mul, array}. Each step multiplies
// the factors that mention the eliminated point and sums it out; offsets into every table
// are kept up to date by an odometer, so the inner loop is one multiply per factor.
const BIG = { zero: 0n, one: 1n, add: (a, b) => a + b, mul: (a, b) => a * b, array: (m) => new Array(m).fill(0n) };
const FLT = { zero: 0, one: 1, add: (a, b) => a + b, mul: (a, b) => a * b, array: (m) => new Float64Array(m) };
function eliminateTables(n, tables, num, order = ELIM) {
  let factors = FACES.map((f, j) => ({ vars: f.slice(), table: tables[j] }));
  let scalar = num.one, width = 0;
  for (const v of order) {
    const touch = factors.filter((f) => f.vars.includes(v)), rest = factors.filter((f) => !f.vars.includes(v));
    const vars = [...new Set(touch.flatMap((f) => f.vars))].filter((x) => x !== v).sort((a, b) => a - b);
    width = Math.max(width, vars.length);
    const all = [...vars, v], D = all.length, out = num.array(n ** vars.length);
    // coef[t][d]: how much digit d moves factor t's offset
    const coef = touch.map((f) => all.map((x) => { const k = f.vars.indexOf(x); return k < 0 ? 0 : n ** (f.vars.length - 1 - k); }));
    const off = new Array(touch.length).fill(0), idx = new Array(D).fill(0), T = touch.length;
    const total = n ** D;
    if (num === FLT) {                                     // the same loop, inlined for speed
      const tabs = touch.map((f) => f.table);
      for (let c = 0; c < total; c++) {
        let prod = 1;
        for (let t = 0; t < T; t++) prod *= tabs[t][off[t]];
        out[(c - idx[D - 1]) / n] += prod;
        for (let d = D - 1; d >= 0; d--) {
          if (++idx[d] < n) { for (let t = 0; t < T; t++) off[t] += coef[t][d]; break; }
          idx[d] = 0; for (let t = 0; t < T; t++) off[t] -= coef[t][d] * (n - 1);
        }
      }
    } else for (let c = 0; c < total; c++) {
      let prod = num.one;
      for (let t = 0; t < T; t++) { prod = num.mul(prod, touch[t].table[off[t]]); }
      const o = (c - idx[D - 1]) / n;
      out[o] = num.add(out[o], prod);
      // odometer: the last digit (v) runs fastest
      for (let d = D - 1; d >= 0; d--) {
        if (++idx[d] < n) { for (let t = 0; t < T; t++) off[t] += coef[t][d]; break; }
        idx[d] = 0; for (let t = 0; t < T; t++) off[t] -= coef[t][d] * (n - 1);
      }
    }
    if (!vars.length) scalar = num.mul(scalar, out[0]);
    else rest.push({ vars, table: out });
    factors = rest;
  }
  for (const f of factors) scalar = num.mul(scalar, f.table[0]);
  return { value: scalar, width };
}
const eliminate = (n, faceTable, num) => eliminateTables(n, FACES.map(() => faceTable), num);
// common-neighbour tables c(a,b,c) for a graph given as adjacency bitmasks (n ≤ 30)
function popcount(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
export function codegreeTable(adj, n) {
  const T = new Array(n * n * n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const ab = adj[a] & adj[b]; for (let c = 0; c < n; c++) T[(a * n + b) * n + c] = popcount(ab & adj[c]); }
  return T;
}
export function homCountExact(adj, n, order = ELIM) { const T = codegreeTable(adj, n).map(BigInt); return eliminateTables(n, FACES.map(() => T), BIG, order).value; }
// t(H,G)/p(G)^66 in floating point, with every face factor scaled to a density in [0,1]
export function ratio(adj, n) {
  const T = Float64Array.from(codegreeTable(adj, n), (c) => c / n);
  const t = eliminate(n, T, FLT).value / n ** NP;
  let e2 = 0; for (let i = 0; i < n; i++) e2 += popcount(adj[i]);
  const p = e2 / (n * n);
  return { t, p, ratio: t / p ** 66, log10ratio: Math.log10(t) - 66 * Math.log10(p) };
}
// exact comparison: Hom·n^132 versus (2|E|)^66·n^35, i.e. t(H,G) versus p(G)^66
export function exactCompare(adj, n) {
  const hom = homCountExact(adj, n);
  let e2 = 0n; for (let i = 0; i < n; i++) e2 += BigInt(popcount(adj[i]));
  const N = BigInt(n), lhs = hom * N ** 132n, rhs = e2 ** 66n * N ** 35n;
  return { hom, edges: e2 / 2n, sign: lhs > rhs ? 1 : lhs < rhs ? -1 : 0 };
}
// literal homomorphism count by brute force over all maps of H (tiny hosts only), for checking
export function homCountBrute(adj, n) {
  const H = incidenceGraph(), N = H.length, map = new Array(N).fill(-1);
  let count = 0n;
  const go = (v) => {
    if (v === N) { count++; return; }
    for (let x = 0; x < n; x++) {
      let ok = true;
      for (const u of H[v]) if (u < v && !(adj[map[u]] & (1 << x))) { ok = false; break; }
      if (ok) { map[v] = x; go(v + 1); }
    }
  };
  go(0);
  return count;
}
// a bipartite step kernel: W[x][y] ≥ 0 with weights α on point atoms and β on face atoms.
// t(H,W) = E Π W(x_i, y_j) over independent x's (points) and y's (faces); same elimination
// with face factor c(a,b,c) = Σ_y β_y W(a,y)W(b,y)W(c,y).
export function kernelRatio(W, alpha, beta) {
  const k = W.length, l = W[0].length, T = new Array(k * k * k);
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) for (let c = 0; c < k; c++) { let s = 0; for (let y = 0; y < l; y++) s += beta[y] * W[a][y] * W[b][y] * W[c][y]; T[(a * k + b) * k + c] = s; }
  // the point weights enter as a one-variable factor on each point: fold α into the faces of
  // each point's first face, exactly once per point
  const firstFace = Array.from({ length: NP }, (_, i) => FACES.findIndex((f) => f.includes(i)));
  let factors = FACES.map((f, j) => {
    const tab = T.slice();
    for (const i of f) if (firstFace[i] === j) { const pos = f.indexOf(i); for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) for (let c = 0; c < k; c++) { const idx = [a, b, c][pos]; tab[(a * k + b) * k + c] *= alpha[idx]; } }
    return tab;
  });
  // elimination with per-face tables: reuse the generic routine by running it on a combined index
  const t = eliminateTables(k, factors, FLT).value;
  let mean = 0; for (let x = 0; x < k; x++) for (let y = 0; y < l; y++) mean += alpha[x] * beta[y] * W[x][y];
  return { t, mean, ratio: t / mean ** 66, log10ratio: Math.log10(t) - 66 * Math.log10(mean) };
}
// ----------------------------------------------------------------- hosts ---
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function randomGraph(n, p, rnd) {
  const adj = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < p) { adj[i] |= 1 << j; adj[j] |= 1 << i; }
  return adj;
}
export const HOSTS = {
  'K₂ (one edge)': () => [0b10, 0b01],
  'K₃': () => [0b110, 0b101, 0b011],
  'K₅': () => [0b11110, 0b11101, 0b11011, 0b10111, 0b01111],
  'C₅': () => [0, 1, 2, 3, 4].map((i) => (1 << ((i + 1) % 5)) | (1 << ((i + 4) % 5))),
  'Petersen': () => { const a = new Array(10).fill(0), e = (x, y) => { a[x] |= 1 << y; a[y] |= 1 << x; }; for (let i = 0; i < 5; i++) { e(i, (i + 1) % 5); e(i, i + 5); e(5 + i, 5 + ((i + 2) % 5)); } return a; },
  'cube Q₃': () => Array.from({ length: 8 }, (_, v) => (1 << (v ^ 1)) | (1 << (v ^ 2)) | (1 << (v ^ 4))),
  'Paley(13)': () => { const sq = new Set([1, 3, 4, 9, 10, 12]); return Array.from({ length: 13 }, (_, i) => { let m = 0; for (let j = 0; j < 13; j++) if (i !== j && sq.has((((i - j) % 13) + 13) % 13)) m |= 1 << j; return m; }); },
  'K₄,₄': () => Array.from({ length: 8 }, (_, v) => (v < 4 ? 0xf0 : 0x0f)),
};
// the sign identity behind the construction: E_η (1 + cηa)(1 + cηb) = 1 + ab for signs a, b, c
export function signIdentity() {
  const rows = [];
  for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) {
    const lhs = ([1, -1].reduce((s, eta) => s + (1 + c * eta * a) * (1 + c * eta * b), 0)) / 2;
    rows.push({ a, b, c, lhs, rhs: 1 + a * b });
  }
  return rows;
}
// Σ over all 13-point assignments directly, no elimination (tiny hosts only), for checking
export function homCountDirect(adj, n) {
  const T = codegreeTable(adj, n).map(BigInt), x = new Array(NP).fill(0);
  let total = 0n;
  const total13 = n ** NP;
  for (let c = 0; c < total13; c++) {
    let r = c; for (let i = 0; i < NP; i++) { x[i] = r % n; r = (r - x[i]) / n; }
    let p = 1n; for (const f of FACES) { p *= T[(x[f[0]] * n + x[f[1]]) * n + x[f[2]]]; if (!p) break; }
    total += p;
  }
  return total;
}
