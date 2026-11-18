// Ridge unfoldings of 4D polytopes, and whether they overlap. No DOM.
//
// A polytope here is vertices V and cells, each cell an outward unit normal n and its vertex indices. A ridge
// unfolding cuts the boundary along ridges so the cells stay joined along a spanning tree of their adjacency and lie
// flat in one hyperplane (the root cell's): each child turns about its shared ridge, in the plane of the two cells'
// normals, by the angle between them, which takes its normal onto its parent's and lays it beyond the ridge. The
// unfolding is a NET if no two cells then overlap in positive volume. (In 3D this is Dürer's question for edges; in 4D,
// for ridges. Whether every convex polytope has a net is open in every dimension ≥ 3.)
//
// Overlap is decided by clipping one cell (a convex polyhedron, in the root's 3D) by the other's face planes and
// measuring the volume left. A witness for an overlap is a point strictly inside both cells, with its margins.
import { hull3, volume3, orient } from '../../johnson/js/poly.js';

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
const scale = (a, k) => a.map((v) => v * k);
const norm = (a) => Math.sqrt(dot(a, a));
const unit = (a) => scale(a, 1 / norm(a));
const signs = (a) => a.reduce((out, v) => out.flatMap((p) => (v === 0 ? [[...p, 0]] : [[...p, v], [...p, -v]])), [[]]);
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
const uniq = (P) => { const m = new Map(); for (const p of P) m.set(p.map((v) => Math.round(v * 1e9)).join(','), p); return [...m.values()]; };

/** A polytope from vertices and cell normals: each cell is the vertices maximising n·x. Adjacent cells share a ridge
 *  (three or more vertices spanning a plane). */
export function polytope(V, normals) {
  const cells = normals.map((n0) => {
    const n = unit(n0), b = Math.max(...V.map((v) => dot(v, n)));
    return { n, b, verts: V.map((v, i) => [dot(v, n), i]).filter(([d]) => d > b - 1e-9).map(([, i]) => i) };
  });
  const adj = cells.map(() => new Map());       // neighbour → shared vertex indices
  for (let a = 0; a < cells.length; a++) for (let c = a + 1; c < cells.length; c++) {
    const S = new Set(cells[a].verts), sh = cells[c].verts.filter((v) => S.has(v));
    if (sh.length >= 3) { adj[a].set(c, sh); adj[c].set(a, sh); }
  }
  return { V, cells, adj };
}
/** The convex hull of points in 4D, as a polytope: every hyperplane through four of them with all the rest on one
 *  side is a facet's (merged when several quadruples give the same one). Brute force: fine to ~25 points. */
export function hull4(V, eps = 1e-9) {
  const n = V.length, normals = [];
  const det3 = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  const normal = (p0, p1, p2, p3) => {
    const a = add(p1, p0, -1), b = add(p2, p0, -1), c = add(p3, p0, -1), col = (i) => [0, 1, 2, 3].filter((k) => k !== i);
    return [0, 1, 2, 3].map((i) => (i % 2 ? -1 : 1) * det3(...[a, b, c].map((v) => col(i).map((k) => v[k]))));
  };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
    let m = normal(V[i], V[j], V[k], V[l]); const len = norm(m);
    if (len < 1e-12) continue;
    m = scale(m, 1 / len);
    const b = dot(m, V[i]); let pos = 0, neg = 0;
    for (const v of V) { const t = dot(m, v) - b; if (t > eps) pos++; else if (t < -eps) neg++; if (pos && neg) break; }
    if (pos && neg) continue;
    if (pos) m = scale(m, -1);
    if (!normals.some((q) => dot(q, m) > 1 - 1e-9)) normals.push(m);
  }
  return polytope(V, normals);
}
/** How many spanning trees the cells' adjacency has (Kirchhoff's theorem: a cofactor of the Laplacian). */
export function treeCount(P) {
  const n = P.cells.length, L = Array.from({ length: n - 1 }, (_, i) => Array.from({ length: n - 1 }, (_, j) => (i === j ? P.adj[i].size : P.adj[i].has(j) ? -1 : 0)));
  let det = 1;
  for (let i = 0; i < n - 1; i++) {
    let p = i; for (let r = i + 1; r < n - 1; r++) if (Math.abs(L[r][i]) > Math.abs(L[p][i])) p = r;
    if (Math.abs(L[p][i]) < 1e-12) return 0;
    if (p !== i) { [L[p], L[i]] = [L[i], L[p]]; det = -det; }
    det *= L[i][i];
    for (let r = i + 1; r < n - 1; r++) { const f = L[r][i] / L[i][i]; for (let c = i; c < n - 1; c++) L[r][c] -= f * L[i][c]; }
  }
  return Math.round(det);
}
/** Every spanning tree of the cells' adjacency, as parent arrays from cell 0, one at a time to `visit` (return true to
 *  stop). Edges in a fixed order; include-or-exclude, pruning when the rest can no longer connect the cells. */
export function eachTree(P, visit) {
  const n = P.cells.length, E = [];
  for (let a = 0; a < n; a++) for (const b of P.adj[a].keys()) if (a < b) E.push([a, b]);
  const parentOf = (chosen) => {
    const adj = Array.from({ length: n }, () => []); for (const [a, b] of chosen) { adj[a].push(b); adj[b].push(a); }
    const par = new Array(n).fill(-2); par[0] = -1; const q = [0];
    for (let k = 0; k < q.length; k++) for (const u of adj[q[k]]) if (par[u] === -2) { par[u] = q[k]; q.push(u); }
    return par;
  };
  const find = (uf, x) => { while (uf[x] !== x) x = uf[x] = uf[uf[x]]; return x; };
  let stop = false;
  const rec = (i, chosen, uf) => {
    if (stop) return;
    if (chosen.length === n - 1) { if (visit(parentOf(chosen))) stop = true; return; }
    if (E.length - i < n - 1 - chosen.length) return;
    // can the edges from i on still join every component? (a quick test: union them all)
    { const u2 = uf.slice(); for (let k = i; k < E.length; k++) { const a = find(u2, E[k][0]), b = find(u2, E[k][1]); if (a !== b) u2[a] = b; } const r = find(u2, 0); for (let v = 1; v < n; v++) if (find(u2, v) !== r) return; }
    const [a, b] = E[i], ra = find(uf, a), rb = find(uf, b);
    if (ra !== rb) { const u2 = uf.slice(); u2[ra] = rb; chosen.push(E[i]); rec(i + 1, chosen, u2); chosen.pop(); }
    rec(i + 1, chosen, uf);
  };
  rec(0, [], Array.from({ length: n }, (_, i) => i));
  return stop;
}
/** The p,q-duoprism, edges 1: a p-gon times a q-gon. Its cells are two linked rings: p q-gonal prisms (cells 0…p−1,
 *  one over each edge of the p-gon, normals in the xy plane) and q p-gonal prisms (cells p…p+q−1, normals in zw). */
export function duoprism(p, q) {
  const a = 1 / (2 * Math.sin(Math.PI / p)), b = 1 / (2 * Math.sin(Math.PI / q)), V = [], N = [], t = 2 * Math.PI;
  for (let i = 0; i < p; i++) for (let j = 0; j < q; j++) V.push([a * Math.cos((t * i) / p), a * Math.sin((t * i) / p), b * Math.cos((t * j) / q), b * Math.sin((t * j) / q)]);
  for (let k = 0; k < p; k++) N.push([Math.cos((t * (k + 0.5)) / p), Math.sin((t * (k + 0.5)) / p), 0, 0]);
  for (let k = 0; k < q; k++) N.push([0, 0, Math.cos((t * (k + 0.5)) / q), Math.sin((t * (k + 0.5)) / q)]);
  return polytope(V, N);
}
export function cell24() {
  const V = uniq(perms([1, 1, 0, 0]).flatMap(signs));                       // 24 vertices, edge √2
  const N = [...uniq(perms([1, 0, 0, 0]).flatMap(signs)), ...signs([0.5, 0.5, 0.5, 0.5])];   // 24 octahedral cells
  return polytope(V, N);
}
export function tesseract() { return polytope(signs([0.5, 0.5, 0.5, 0.5]), uniq(perms([1, 0, 0, 0]).flatMap(signs))); }

/** Lay a polytope's cells flat along a spanning tree (parent[] from root; parent[root] = −1). Returns each cell's
 *  vertices in 3D coordinates of the root's hyperplane. Exact rigid motions, composed down the tree. */
export function unfold(P, parent) {
  const M = motionsAt(P, parent, 1), root = parent.indexOf(-1);
  // coordinates in the root's hyperplane: an orthonormal basis of n_root's complement
  const nr = P.cells[root].n, basis = rootBasis(P, root);
  const o = P.V[P.cells[root].verts[0]];
  let off = 0;
  const cells = P.cells.map((c, i) => c.verts.map((v) => { const x = M[i](P.V[v]); off = Math.max(off, Math.abs(dot(add(x, o, -1), nr))); return basis.map((b) => dot(add(x, o, -1), b)); }));
  return { cells, offPlane: off };
}
/** Three orthonormal vectors spanning the root cell's hyperplane directions. */
export function rootBasis(P, root) {
  const nr = P.cells[root].n, basis = [];
  for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { let v = add(ax, nr, -dot(ax, nr)); for (const b of basis) v = add(v, b, -dot(v, b)); if (norm(v) > 0.3 && basis.length < 3) basis.push(unit(v)); }
  return basis;
}
/** Each cell's distance from the root down the tree. */
export function treeDepths(parent) { return parent.map((_, c) => { let k = 0; for (let x = c; parent[x] >= 0; x = parent[x]) k++; return k; }); }
/** How far each hinge has turned toward flat (0 folded, 1 flat) at fold fraction t. All at once: t for every hinge.
 *  Ring by ring (folding from flat as t goes 1 → 0): the root's neighbours first, carrying their subtrees flat, then
 *  the next ring out; t sweeps the rings in equal shares. */
export function hingeFractions(parent, t, ring = false) {
  if (!ring) return parent.map(() => t);
  const d = treeDepths(parent), H = Math.max(...d), s = (1 - t) * H;
  return d.map((k) => 1 - Math.min(1, Math.max(0, s - (k - 1))));
}
/** Each cell's rigid motion at fold fraction t (0 the polytope as it is, 1 the flat unfolding): each hinge turned by
 *  its fraction (hingeFractions) of its full angle, composed down the tree. */
export function motionsAt(P, parent, t, ring = false) {
  const frac = hingeFractions(parent, t, ring);
  const root = parent.indexOf(-1), n = P.cells.length;
  const order = [root]; { const seen = new Set([root]); for (let k = 0; k < order.length; k++) for (let c = 0; c < n; c++) if (parent[c] === order[k] && !seen.has(c)) { seen.add(c); order.push(c); } }
  if (order.length !== n) throw new Error('not a spanning tree');
  const M = new Array(n);
  for (const c of order) {
    if (c === root) { M[c] = (x) => x; continue; }
    const p = parent[c], np = P.cells[p].n, nc = P.cells[c].n, ridge = P.adj[p].get(c);
    if (!ridge) throw new Error(`cells ${p} and ${c} don't share a ridge`);
    const q = P.V[ridge[0]];
    // the plane of the two normals: u = n_p, v = n_c's part across it; n_c = cos φ u + sin φ v. Turn by −φ.
    const u = np, vv = unit(add(nc, np, -dot(nc, np))), phi = frac[c] * Math.acos(Math.max(-1, Math.min(1, dot(np, nc)))), co = Math.cos(-phi), si = Math.sin(-phi);
    const R = (x) => { const d = add(x, q, -1), a = dot(d, u), b = dot(d, vv); return add(add(add(d, u, a * (co - 1) - b * si), vv, a * si + b * (co - 1)), q); };
    const Mp = M[p];
    M[c] = (x) => Mp(R(x));
  }
  return M;
}
/** Each cell's faces, as polygons of indices into its own vertex list (a hull in its hyperplane). */
export function cellFaces(P) {
  return P.cells.map((c) => {
    const n = c.n, B = []; for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { let v = add(ax, n, -dot(ax, n)); for (const b of B) v = add(v, b, -dot(v, b)); if (norm(v) > 0.3 && B.length < 3) B.push(unit(v)); }
    const pts = c.verts.map((v) => B.map((b) => dot(P.V[v], b)));
    return hull3(pts).map((h) => h.f);
  });
}

/** Each cell as { o, P, H } for clash.js's depthCells, after the motions M: o + P·u for u in the cell's own 3D
 *  coordinates, H its faces there (unit normals). */
export function movedCells(P, M) {
  return P.cells.map((c, i) => {
    const n = c.n, B = []; for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { let v = add(ax, n, -dot(ax, n)); for (const b of B) v = add(v, b, -dot(v, b)); if (norm(v) > 0.3 && B.length < 3) B.push(unit(v)); }
    const pts = c.verts.map((v) => B.map((b) => dot(P.V[v], b))), H = hull3(pts).map((h) => ({ n: h.n, b: h.b }));
    const base = scale(n, c.b), o = M[i](base);
    const Pm = B.map((b) => add(M[i](add(base, b)), o, -1));
    const ctr = scale(c.verts.reduce((s, v) => add(s, M[i](P.V[v])), [0, 0, 0, 0]), 1 / c.verts.length);
    const rad = Math.max(...c.verts.map((v) => norm(add(M[i](P.V[v]), ctr, -1))));
    return { o, P: Pm, H, ctr, rad, pts: c.verts.map((v) => M[i](P.V[v])) };
  });
}

/** A convex polyhedron (points in 3D) as half-spaces { n, b } (n·x ≤ b), outward. */
export function halfspaces(pts) { return hull3(pts).map((h) => ({ n: h.n, b: h.b, f: h.f })); }
/** The volume of the intersection of two convex polyhedra (each its points), by clipping. */
export function overlapVolume(A, B) {
  const HB = halfspaces(B), HA = halfspaces(A);
  let faces = orient(A, HA.map((h) => h.f)).map((f) => f.map((i) => A[i]));
  for (const h of HB) { faces = clip(faces, h.n, h.b); if (!faces.length) return 0; }
  const V = [], F = []; for (const f of faces) F.push(f.map((p) => { V.push(p); return V.length - 1; }));
  return Math.abs(volume3(V, F));
}
function clip(faces, m, b) {
  const out = [], cut = [];
  for (const P of faces) {
    const q = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[i], c = P[(i + 1) % P.length], da = dot(m, a) - b, dc = dot(m, c) - b;
      if (da <= 1e-12) q.push(a);
      if ((da < -1e-12 && dc > 1e-12) || (da > 1e-12 && dc < -1e-12)) { const t = da / (da - dc), p = add(a, add(c, a, -1), t); q.push(p); cut.push(p); }
      else if (Math.abs(da) <= 1e-12) cut.push(a);
    }
    if (q.length >= 3) out.push(q);
  }
  const u = []; for (const p of cut) if (!u.some((x) => norm(add(x, p, -1)) < 1e-9)) u.push(p);
  if (u.length >= 3) {
    const c = scale(u.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / u.length), e1 = unit(add(u[0], c, -1)), e2 = [m[1] * e1[2] - m[2] * e1[1], m[2] * e1[0] - m[0] * e1[2], m[0] * e1[1] - m[1] * e1[0]];
    u.sort((a, z) => Math.atan2(dot(add(a, c, -1), e2), dot(add(a, c, -1), e1)) - Math.atan2(dot(add(z, c, -1), e2), dot(add(z, c, -1), e1)));
    out.push(u);
  }
  return out;
}
/** Every pair of cells that overlap in volume more than eps (neighbours along the tree only touch: they're checked too). */
export function overlaps(cells, eps = 1e-9) {
  const ctr = cells.map((c) => scale(c.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / c.length));
  const rad = cells.map((c, i) => Math.max(...c.map((p) => norm(add(p, ctr[i], -1)))));
  const out = [];
  for (let a = 0; a < cells.length; a++) for (let b = a + 1; b < cells.length; b++) {
    if (norm(add(ctr[a], ctr[b], -1)) >= rad[a] + rad[b]) continue;
    const v = overlapVolume(cells[a], cells[b]);
    if (v > eps) out.push({ a, b, volume: v });
  }
  return out;
}
/** A witness that two cells overlap: the centroid of their intersection's vertices, and how far inside each it is
 *  (the least margin over both cells' face planes; positive means strictly inside both). */
export function witness(A, B) {
  const HA = halfspaces(A), HB = halfspaces(B);
  let faces = orient(A, HA.map((h) => h.f)).map((f) => f.map((i) => A[i]));
  for (const h of HB) faces = clip(faces, h.n, h.b);
  const pts = faces.flat(), p = scale(pts.reduce((s, q) => add(s, q), [0, 0, 0]), 1 / pts.length);
  const margin = Math.min(...HA.map((h) => h.b - dot(h.n, p)), ...HB.map((h) => h.b - dot(h.n, p)));
  return { p, margin };
}

/** Random spanning trees of the cells' adjacency: 'dfs' (long winding paths, where overlaps live) or 'bfs' (bushy). */
export function randomTree(P, kind, rnd = Math.random, root = 0) {
  const n = P.cells.length, parent = new Array(n).fill(-2); parent[root] = -1;
  if (kind === 'bfs') {
    const q = [root];
    for (let k = 0; k < q.length; k++) { const nb = [...P.adj[q[k]].keys()].sort(() => rnd() - 0.5); for (const c of nb) if (parent[c] === -2) { parent[c] = q[k]; q.push(c); } }
  } else {
    const st = [root];
    while (st.length) { const top = st[st.length - 1], nb = [...P.adj[top].keys()].filter((c) => parent[c] === -2); if (!nb.length) { st.pop(); continue; } const c = nb[Math.floor(rnd() * nb.length)]; parent[c] = top; st.push(c); }
  }
  return parent;
}
