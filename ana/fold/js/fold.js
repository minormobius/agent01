// FOLD: origami one dimension up, no DOM. A polychoron's 3D net folds up through w the way a paper net folds up
// through our third dimension: each cell hangs off its parent cell by a shared 2D face (the hinge), and folding is a
// rotation about that face's plane. And a fold through w is a mirror: a solid turned half a turn in a plane that
// contains w lands as its own mirror image, which no turn in 3D can do.
//
// The tesseract: 8 cubic cells, normals ±e₁ … ±e₄, centred at half a unit along them (edge 1). Two cells share a
// square unless they're opposite, so the cells' adjacency is the 16-cell's edge graph (K₂,₂,₂,₂: 24 hinges), and a net
// is a spanning tree of it (7 hinges): 82,944 trees, every one unfolding without overlap, 261 shapes (Turney, 1984). Unfolding: the root cell (−e₄) stays in our space (the hyperplane x₄ = −½); a child c of a parent p is
// turned a quarter turn about their shared square, in the plane of their normals, from standing (inside the tesseract)
// to lying flat beyond the square in p's hyperplane; its whole subtree turns with it.

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
const scale = (a, k) => a.map((v) => v * k);
const e = (i, s = 1) => { const v = [0, 0, 0, 0]; v[i] = s; return v; };

/** The tesseract's cells: { n (outward normal), axis, sign, V (its 8 vertices) }. Order: +x −x +y −y +z −z +w −w. */
export const CELLS = [0, 1, 2, 3].flatMap((axis) => [1, -1].map((sign) => {
  const n = e(axis, sign), others = [0, 1, 2, 3].filter((k) => k !== axis), V = [];
  for (let m = 0; m < 8; m++) { const v = scale(n, 0.5); others.forEach((k, j) => { v[k] = (m >> j) & 1 ? 0.5 : -0.5; }); V.push(v); }
  return { n, axis, sign, V };
}));
export const ROOT = 7;                                    // −w: it stays in our space
const opposite = (a, b) => CELLS[a].axis === CELLS[b].axis;
export const DUAL_EDGES = [];
for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) if (!opposite(a, b)) DUAL_EDGES.push([a, b]);   // 24 hinges

/** Every spanning tree of the cells' adjacency (K₂,₂,₂,₂): 82,944 of them. Each as a parent array from ROOT. */
export function spanningTrees() {
  const out = [], m = DUAL_EDGES.length;
  const pick = (start, chosen) => {
    if (chosen.length === 7) {
      const adj = Array.from({ length: 8 }, () => []);
      for (const i of chosen) { const [a, b] = DUAL_EDGES[i]; adj[a].push(b); adj[b].push(a); }
      const parent = new Array(8).fill(-2); parent[ROOT] = -1; const q = [ROOT];
      for (let k = 0; k < q.length; k++) for (const u of adj[q[k]]) if (parent[u] === -2) { parent[u] = q[k]; q.push(u); }
      if (q.length === 8) out.push(parent);
      return;
    }
    for (let i = start; i < m; i++) { chosen.push(i); pick(i + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  return out;
}

/** Each cell's distance from the root down the hinge tree (the root 0, its children 1, …). */
export function depths(parent) { return parent.map((_, c) => { let k = 0; for (let x = c; parent[x] >= 0; x = parent[x]) k++; return k; }); }
/** Each hinge's angle (radians from folded; π/2 flat) at fold parameter t (0 folded, 1 flat). All at once: every hinge
 *  at t·90°. Ring by ring: the root's children fold first, carrying their subtrees flat, then the next ring, and so on;
 *  t sweeps the rings in equal shares. Ring by ring no two cubes of any of the 261 nets ever pass through each other;
 *  all at once, 33 of them do near the end (the selftest checks both). */
export function hingeAngles(parent, t, ring = false) {
  if (!ring) return parent.map(() => (t * Math.PI) / 2);
  const d = depths(parent), H = Math.max(...d), s = (1 - t) * H;
  return d.map((k) => (Math.PI / 2) * (1 - Math.min(1, Math.max(0, s - (k - 1)))));
}
/** The rigid motion of each cell at fold angle t (0 folded up into the tesseract, 1 flat net): a function x → x′.
 *  Child c of parent p turns by t·90° about their shared square (where x·n_p = ½ and x·n_c = ½), in the plane of
 *  n_p and n_c, sending its inward direction −n_p toward +n_c; then everything p's motion does. */
export function motions(parent, t, ring = false) {
  const ang = hingeAngles(parent, t, ring);
  const M = new Array(8);
  const order = []; { const seen = new Set([ROOT]); order.push(ROOT); for (let k = 0; k < order.length; k++) for (let c = 0; c < 8; c++) if (parent[c] === order[k] && !seen.has(c)) { seen.add(c); order.push(c); } }
  for (const c of order) {
    if (c === ROOT) { M[c] = (x) => x; continue; }
    const p = parent[c], np = CELLS[p].n, nc = CELLS[c].n, q = add(scale(np, 0.5), nc, 0.5), th = ang[c], co = Math.cos(th), si = Math.sin(th);
    const R = (x) => {                                    // turn about the square through q: n_p → co·n_p − si·n_c, n_c → co·n_c + si·n_p
      const d = add(x, q, -1), a = dot(d, np), b = dot(d, nc);
      const r = add(add(d, np, a * (co - 1) + b * si), nc, -a * si + b * (co - 1));
      return add(r, q);
    };
    const Mp = M[p];
    M[c] = (x) => Mp(R(x));
  }
  return M;
}
/** The flat net: each cell's centre in our space (x, y, z of the root's hyperplane), as integers. */
export function netCentres(parent) {
  const M = motions(parent, 1);
  return CELLS.map((c, i) => M[i](scale(c.n, 0.5)).slice(0, 3).map((v) => Math.round(v * 1e9) / 1e9));
}
/** The 48 symmetries of the cube (signed permutations of three coordinates). */
export const CUBE_SYM = (() => {
  const P = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]], out = [];
  for (const p of P) for (let s = 0; s < 8; s++) out.push({ p, s: [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1], det: Math.sign((s & 1 ? -1 : 1) * (s & 2 ? -1 : 1) * (s & 4 ? -1 : 1)) * parity(p) });
  return out;
})();
function parity(p) { let n = 0; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (p[i] > p[j]) n++; return n % 2 ? -1 : 1; }
/** A polycube's canonical form under the cube's symmetries (with `mirror`, all 48; without, the 24 rotations). */
export function canonicalCubes(C, mirror = true) {
  let best = null;
  for (const g of CUBE_SYM) {
    if (!mirror && g.det < 0) continue;
    const pts = C.map((c) => [0, 1, 2].map((i) => g.s[i] * c[g.p[i]]));
    const lo = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])));
    const key = pts.map((p) => p.map((v, i) => Math.round(v - lo[i])).join(',')).sort().join(';');
    if (best === null || key < best) best = key;
  }
  return best;
}
/** The distinct nets: spanning trees whose unfolding never puts two cubes in one place, grouped by shape (congruent
 *  in our space, mirror images counted the same). Each: { parent (one tree that makes it), cubes, key, trees }. */
export function nets() {
  const byKey = new Map();
  let overlapping = 0;
  for (const parent of spanningTrees()) {
    const C = netCentres(parent);
    if (new Set(C.map((c) => c.join(','))).size < 8) { overlapping++; continue; }
    const key = canonicalCubes(C);
    if (!byKey.has(key)) byKey.set(key, { parent, cubes: C, key, trees: 0 });
    byKey.get(key).trees++;
  }
  // order: the longest straight run of cubes first (Dalí's cross has four in a row), then by spread
  const list = [...byKey.values()];
  for (const n of list) { n.run = longestRun(n.cubes); n.spread = [0, 1, 2].reduce((s, i) => s + Math.max(...n.cubes.map((c) => c[i])) - Math.min(...n.cubes.map((c) => c[i])), 0); }
  list.sort((a, b) => b.run - a.run || a.spread - b.spread || (a.key < b.key ? -1 : 1));
  return { list, overlapping, trees: spanningTrees().length };
}
function longestRun(C) {
  const S = new Set(C.map((c) => c.join(','))); let best = 1;
  for (const c of C) for (let a = 0; a < 3; a++) { let n = 1; const d = [0, 0, 0]; d[a] = 1; let x = add([...c, 0], [...d, 0]).slice(0, 3); while (S.has(x.join(','))) { n++; x = x.map((v, i) => v + d[i]); } best = Math.max(best, n); }
  return best;
}
/** Dalí's net (Corpus Hypercubus): four cubes in a column, with four more round the second from the top. */
export function daliNet(list) {
  return list.find((n) => n.run === 4 && n.cubes.some((c) => { const nb = n.cubes.filter((d) => Math.abs(d[0] - c[0]) + Math.abs(d[1] - c[1]) + Math.abs(d[2] - c[2]) === 1); return nb.length === 5; }));
}

// ------------------------------------------------------------------ the mirror fold
/** A half-turn in the plane of x and w (by angle a: a = π is the full fold). A solid in our space (w = 0) comes back
 *  into it with x reversed: its mirror image. */
export const turnXW = (p, a) => [p[0] * Math.cos(a), p[1], p[2], p[0] * Math.sin(a)];
/** Is there a proper rotation of 3D taking point set A onto point set B? (Tries every frame match from a vertex and two
 *  of its nearest neighbours.) Returns 'rotation', 'reflection' or null. */
export function congruence(A, B, tol = 1e-6) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const ca = [0, 1, 2].map((k) => A.reduce((s, p) => s + p[k], 0) / A.length), cb = [0, 1, 2].map((k) => B.reduce((s, p) => s + p[k], 0) / B.length);
  const a0 = A.map((p) => p.map((v, k) => v - ca[k])), b0 = B.map((p) => p.map((v, k) => v - cb[k]));
  const near = (P, i) => P.map((p, j) => [d(P[i], p), j]).filter(([x, j]) => j !== i).sort((x, y) => x[0] - y[0]);
  const frame = (u, v) => { const n = Math.hypot(...u); const e1 = u.map((x) => x / n); let e2 = v.map((x, k) => x - e1[k] * (e1[0] * v[0] + e1[1] * v[1] + e1[2] * v[2])); const m = Math.hypot(...e2); e2 = e2.map((x) => x / m); const e3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; return [e1, e2, e3]; };
  const na = near(a0, 0), fa = frame(a0[0], a0[na[0][1]]);
  const found = new Set();
  for (let i = 0; i < b0.length; i++) {
    if (Math.abs(Math.hypot(...b0[i]) - Math.hypot(...a0[0])) > tol) continue;
    for (const [dist, j] of near(b0, i)) {
      if (Math.abs(dist - na[0][0]) > tol) break;
      const fb = frame(b0[i], b0[j]);
      for (const flip of [1, -1]) {
        const fb2 = [fb[0], fb[1], fb[2].map((x) => x * flip)];
        // map: p → Σ_k (p·fa_k) fb2_k
        const map = (p) => [0, 1, 2].map((r) => fa.reduce((s, f, k) => s + (p[0] * f[0] + p[1] * f[1] + p[2] * f[2]) * fb2[k][r], 0));
        if (a0.every((p) => { const q = map(p); return b0.some((r) => d(q, r) < 1e-5); })) found.add(flip === 1 ? 'rotation' : 'reflection');
      }
    }
  }
  return found.has('rotation') ? 'rotation' : found.has('reflection') ? 'reflection' : null;
}
