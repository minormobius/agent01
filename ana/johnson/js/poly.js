// JOHNSON's geometry, no DOM. Polyhedra (3D) and polychora (4D), exact where they can be: the 600-cell from its 120
// vertices, its tetrahedra as the 4-cliques of its edge graph, and diminishing (cut off a vertex: the 20 tetrahedra
// round it become the icosahedron of its 12 neighbours); prisms, pyramids and bipyramids over polyhedra. A 4D polytope
// is kept as vertices, edges and cells, each cell with its outward half-space n·x ≤ b, so a 3D slice of it is the
// intersection of those half-spaces in the slice (`slice`), and its shadow is its edges projected (`shadow`).
// The selftest (test/johnson.selftest.mjs) holds every claim.

export const PHI = (1 + Math.sqrt(5)) / 2;
export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const add = (a, b, k = 1) => a.map((v, i) => v + k * b[i]);
export const scale = (a, k) => a.map((v) => v * k);
export const norm = (a) => Math.sqrt(dot(a, a));
export const unit = (a) => scale(a, 1 / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const centroid = (P) => scale(P.reduce((s, p) => add(s, p), P[0].map(() => 0)), 1 / P.length);
const det3 = (a, b, c) => dot(a, cross(b, c));

// ------------------------------------------------------------------ polyhedra
/** The convex hull of points in 3D, as faces (each a polygon of vertex indices, counter-clockwise seen from outside,
 *  coplanar points merged into one face) with their outward unit normals. Brute force over triples: fine to 60
 *  points, and simple enough to trust as a check. */
export function hull3(V, eps = 1e-7) {
  const n = V.length, planes = [];
  const seen = (nm, b) => planes.some((p) => Math.abs(dot(p.n, nm) - 1) < 1e-9 && Math.abs(p.b - b) < 1e-7);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let nm = cross(sub(V[j], V[i]), sub(V[k], V[i]));
    const l = norm(nm);
    if (l < 1e-9) continue;
    nm = scale(nm, 1 / l);
    let b = dot(nm, V[i]), pos = 0, neg = 0;
    for (const p of V) { const d = dot(nm, p) - b; if (d > eps) pos++; else if (d < -eps) neg++; if (pos && neg) break; }
    if (pos && neg) continue;
    if (pos) { nm = scale(nm, -1); b = -b; }
    if (!seen(nm, b)) planes.push({ n: nm, b });
  }
  return planes.map(({ n: nm, b }) => {
    const on = []; for (let i = 0; i < n; i++) if (Math.abs(dot(nm, V[i]) - b) < eps * 10) on.push(i);
    const c = centroid(on.map((i) => V[i])), u = unit(sub(V[on[0]], c)), w = cross(nm, u);
    on.sort((a, b2) => Math.atan2(dot(sub(V[a], c), w), dot(sub(V[a], c), u)) - Math.atan2(dot(sub(V[b2], c), w), dot(sub(V[b2], c), u)));
    return { f: on, n: nm, b };
  });
}
/** Edges of a polyhedron given its faces. */
export function edges3(F) {
  const E = new Map();
  for (const f of F) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; E.set(a < b ? `${a},${b}` : `${b},${a}`, [Math.min(a, b), Math.max(a, b)]); }
  return [...E.values()];
}
/** Volume of a closed polyhedron with outward-oriented faces (fan triangulation from each face's first vertex). */
export function volume3(V, F) {
  let v = 0;
  for (const f of F) for (let i = 1; i + 1 < f.length; i++) v += det3(V[f[0]], V[f[i]], V[f[i + 1]]);
  return v / 6;
}
/** Orient each face counter-clockwise from outside (the solid's centroid is inside a convex solid). */
export function orient(V, F) {
  const c = centroid(V);
  return F.map((f) => { const nm = cross(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]])); return dot(nm, sub(V[f[0]], c)) < 0 ? [...f].reverse() : f; });
}
/** How regular a face is: the worst deviation of its edges from `edge` and of its vertices from the circle a regular
 *  polygon would sit on, and from its plane. */
export function faceError(V, f, edge = 1) {
  const P = f.map((i) => V[i]), c = centroid(P), n = f.length, rc = edge / (2 * Math.sin(Math.PI / n));
  const nm = unit(cross(sub(P[1], P[0]), sub(P[2], P[0])));
  let e = 0;
  for (let i = 0; i < n; i++) {
    e = Math.max(e, Math.abs(norm(sub(P[(i + 1) % n], P[i])) - edge), Math.abs(norm(sub(P[i], c)) - rc), Math.abs(dot(sub(P[i], P[0]), nm)));
  }
  return e;
}
/** The sphere through all the vertices, if there is one: { r, c } or null. */
export function circumsphere(V, tol = 1e-7) {
  // the centre: least squares on |v − c|² = |v₀ − c|² for every vertex (a sphere through all of them, if there is one)
  const A = [], y = [];
  for (let i = 1; i < V.length; i++) { A.push(scale(sub(V[i], V[0]), 2)); y.push(dot(V[i], V[i]) - dot(V[0], V[0])); }
  const d = V[0].length, AtA = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => A.reduce((s, row) => s + row[i] * row[j], 0)));
  const Aty = Array.from({ length: d }, (_, i) => A.reduce((s, row, k) => s + row[i] * y[k], 0));
  const x = solve(AtA, Aty);
  if (!x) return null;
  const rs = V.map((p) => norm(sub(p, x)));
  const spread = Math.max(...rs) - Math.min(...rs);
  return spread < tol ? { c: x, r: rs[0] } : null;
}
function solve(M, y) {
  const n = y.length, A = M.map((r, i) => [...r, y[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    if (Math.abs(A[p][i]) < 1e-12) return null;
    [A[i], A[p]] = [A[p], A[i]];
    for (let k = 0; k < n; k++) if (k !== i) { const f = A[k][i] / A[i][i]; for (let j = i; j <= n; j++) A[k][j] -= f * A[i][j]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}

// ------------------------------------------------------------------ 4D: building blocks
/** The unit normal to the hyperplane through four points in 4D (generalized cross product of three differences). */
export function normal4(p0, p1, p2, p3) {
  const a = sub(p1, p0), b = sub(p2, p0), c = sub(p3, p0);
  const m = (i, j, k) => a[i] * (b[j] * c[k] - b[k] * c[j]) - a[j] * (b[i] * c[k] - b[k] * c[i]) + a[k] * (b[i] * c[j] - b[j] * c[i]);
  return [m(1, 2, 3), -m(0, 2, 3), m(0, 1, 3), -m(0, 1, 2)];
}
/** A cell's outward half-space from its vertices: n·x ≤ b with n unit, pointing away from `inside`. */
export function halfspace(P, inside) {
  // pick four affinely independent points
  let best = null;
  for (let i = 1; i < P.length && !best; i++) for (let j = i + 1; j < P.length && !best; j++) for (let k = j + 1; k < P.length && !best; k++) {
    const nm = normal4(P[0], P[i], P[j], P[k]); if (norm(nm) > 1e-6) best = nm;
  }
  let n = unit(best), b = dot(n, P[0]);
  if (dot(n, inside) > b) { n = scale(n, -1); b = -b; }
  return { n, b };
}
const pairKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
/** Edges at the given length (to a tolerance). */
export function edgesAt(V, len, tol = 1e-6) {
  const E = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (Math.abs(norm(sub(V[i], V[j])) - len) < tol) E.push([i, j]);
  return E;
}
const adjacency = (n, E) => { const A = Array.from({ length: n }, () => new Set()); for (const [a, b] of E) { A[a].add(b); A[b].add(a); } return A; };

// ------------------------------------------------------------------ the 600-cell and its diminishings
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
const parity = (p) => { let s = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++; return s % 2; };
const signs = (a) => a.reduce((out, v) => out.flatMap((p) => (v === 0 ? [[...p, 0]] : [[...p, v], [...p, -v]])), [[]]);
/** The 600-cell, unit edge: 120 vertices (circumradius φ), 720 edges, 1200 triangles, 600 tetrahedra. The first 24
 *  vertices are the 24-cell inside it (the 8 (±1,0,0,0)·φ and the 16 (±½,±½,±½,±½)·φ): cut those off and you have
 *  the snub 24-cell. */
export function hexacosichoron() {
  const V = [];
  for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const v = [0, 0, 0, 0]; v[i] = s; V.push(v); }
  for (const v of signs([0.5, 0.5, 0.5, 0.5])) V.push(v);
  const base = [PHI / 2, 0.5, 1 / (2 * PHI), 0];
  for (const p of perms([0, 1, 2, 3])) if (parity(p) === 0) for (const v of signs(p.map((i) => base[i]))) V.push(v);
  const Vu = V.map((v) => scale(v, PHI));                     // edge 1/φ → 1
  const E = edgesAt(Vu, 1), A = adjacency(Vu.length, E);
  const T = [];
  for (const [a, b] of E) for (const c of A[a]) if (c > b && A[b].has(c)) for (const d of A[a]) if (d > c && A[b].has(d) && A[c].has(d)) T.push([a, b, c, d]);
  return { V: Vu, E, A, T };
}
let H600 = null;
export const h600 = () => (H600 ??= hexacosichoron());
/** Can these vertices all be cut off together? (no two adjacent) */
export function independent(cut, A = h600().A) { const s = [...cut]; return s.every((a, i) => s.slice(i + 1).every((b) => !A[a].has(b))); }
/** The 600-cell with the vertices in `cut` (no two adjacent) cut off: each becomes an icosahedral cell of its 12
 *  neighbours; the tetrahedra that touched it are gone. */
export function diminished(cut) {
  const H = h600(), C = new Set(cut);
  if (!independent(C, H.A)) throw new Error('two of those vertices are adjacent: cutting both would cut through an edge');
  const keep = H.V.map((_, i) => !C.has(i)), idx = new Map(); let n = 0;
  H.V.forEach((_, i) => { if (keep[i]) idx.set(i, n++); });
  const V = H.V.filter((_, i) => keep[i]);
  const E = H.E.filter(([a, b]) => keep[a] && keep[b]).map(([a, b]) => [idx.get(a), idx.get(b)]);
  const O = [0, 0, 0, 0], cells = [];
  for (const t of H.T) if (t.every((i) => keep[i])) { const P = t.map((i) => H.V[i]); cells.push({ kind: 'tetrahedron', verts: t.map((i) => idx.get(i)), ...halfspace(P, O) }); }
  for (const c of C) { const nb = [...H.A[c]]; cells.push({ kind: 'icosahedron', verts: nb.map((i) => idx.get(i)), ...halfspace(nb.map((i) => H.V[i]), O), cut: c }); }
  return { name: '', V, E, cells };
}
/** A random maximal set of vertices no two adjacent (greedy in a shuffled order). */
export function randomMaximal(rnd = Math.random) {
  const H = h600(), order = H.V.map((_, i) => i).sort(() => rnd() - 0.5), out = new Set();
  for (const v of order) if ([...out].every((u) => !H.A[v].has(u))) out.add(v);
  return out;
}
export const SNUB24 = Array.from({ length: 24 }, (_, i) => i);

// ------------------------------------------------------------------ prisms, pyramids, bipyramids over polyhedra
/** A polyhedron {V, F} times a unit interval along w: two copies of it, and a prism over each face. */
export function prism(P) {
  const n = P.V.length, V = [...P.V.map((v) => [...v, -0.5]), ...P.V.map((v) => [...v, 0.5])];
  const E3 = edges3(P.F), E = [...E3, ...E3.map(([a, b]) => [a + n, b + n]), ...P.V.map((_, i) => [i, i + n])];
  const O = [0, 0, 0, 0];
  const cells = [
    { kind: 'cap', verts: P.V.map((_, i) => i), n: [0, 0, 0, -1], b: 0.5 },
    { kind: 'cap', verts: P.V.map((_, i) => i + n), n: [0, 0, 0, 1], b: 0.5 },
    ...P.F.map((f) => ({ kind: `${f.length}-prism`, verts: [...f, ...f.map((i) => i + n)], ...halfspace([...f.map((i) => V[i]), ...f.map((i) => V[i + n])], O) })),
  ];
  return { V, E, cells };
}
/** A polyhedron {V, F} with an apex in w at unit distance from every vertex: possible only if it has a circumsphere
 *  of radius under 1, and then every face becomes a pyramid cell (whose 2-faces are regular only for faces up to
 *  pentagons). `both` gives the bipyramid. Returns null when it can't be done. */
export function pyramid(P, both = false) {
  const s = circumsphere(P.V);
  if (!s || s.r >= 1 - 1e-9) return null;
  // a bipyramid needs the circumcentre inside the solid (or on it): otherwise the two apexes sit beyond a face and the
  // shape folds in (the pentagonal pyramid's centre is 0.43 below its pentagon, so it has a pyramid but no bipyramid)
  if (both) for (const h of hull3(P.V)) if (dot(h.n, s.c) - h.b > 1e-9) return null;
  const h = Math.sqrt(1 - s.r * s.r), n = P.V.length;
  const V = [...P.V.map((v) => [...sub(v, s.c), 0]), [0, 0, 0, h], ...(both ? [[0, 0, 0, -h]] : [])];
  const E3 = edges3(P.F), E = [...E3, ...P.V.map((_, i) => [i, n]), ...(both ? P.V.map((_, i) => [i, n + 1]) : [])];
  const inside = centroid(V);                                 // strictly inside (a point on a face would orient nothing)
  const cells = [];
  if (!both) cells.push({ kind: 'cap', verts: P.V.map((_, i) => i), n: [0, 0, 0, -1], b: 0 });
  for (const apex of both ? [n, n + 1] : [n]) for (const f of P.F) cells.push({ kind: `${f.length}-pyramid`, verts: [...f, apex], ...halfspace([...f.map((i) => V[i]), V[apex]], inside) });
  return { V, E, cells: merge(cells), h };
}
/** Cells that turn out to lie in one hyperplane are one cell (over a face through the circumcentre, the two apexes'
 *  pyramids are halves of one bipyramid: the square pyramid's bipyramid is the octahedral pyramid). */
function merge(cells) {
  const out = [];
  for (const c of cells) {
    const m = out.find((o) => Math.abs(dot(o.n, c.n) - 1) < 1e-9 && Math.abs(o.b - c.b) < 1e-9);
    if (m) { m.verts = [...new Set([...m.verts, ...c.verts])]; m.kind = `${m.verts.length - 2}-bipyramid`; } else out.push({ ...c });
  }
  return out;
}

// ------------------------------------------------------------------ the Platonic solids, unit edge (bases for 4D)
export function platonic(name) {
  let V;
  if (name === 'tetrahedron') V = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((v) => scale(v, 1 / (2 * Math.SQRT2)));
  else if (name === 'cube') V = signs([0.5, 0.5, 0.5]);
  else if (name === 'octahedron') V = [0, 1, 2].flatMap((i) => [1, -1].map((s) => { const v = [0, 0, 0]; v[i] = s * Math.SQRT1_2; return v; }));
  else if (name === 'icosahedron') V = [0, 1, 2].flatMap((i) => signs([0, 0.5, PHI / 2]).map((v) => [v[i % 3], v[(i + 1) % 3], v[(i + 2) % 3]]));
  else if (name === 'dodecahedron') V = [...signs([1, 1, 1]), ...[0, 1, 2].flatMap((i) => signs([0, 1 / PHI, PHI]).map((v) => [v[i % 3], v[(i + 1) % 3], v[(i + 2) % 3]]))].map((v) => scale(v, PHI / 2));
  const F = hull3(V).map((h) => h.f);
  return { name, V, F: orient(V, F) };
}

// ------------------------------------------------------------------ checking a 4D polytope
/** Every vertex inside or on every cell's half-space (convex), each cell's vertices on its hyperplane, all edges unit,
 *  and Euler's V − E + F − C = 0 (F counted from the cells' 2-faces). Returns the worst numbers. */
export function check4(P) {
  let outside = 0, offPlane = 0, edge = 0;
  for (const c of P.cells) {
    for (const v of P.V) outside = Math.max(outside, dot(c.n, v) - c.b);
    for (const i of c.verts) offPlane = Math.max(offPlane, Math.abs(dot(c.n, P.V[i]) - c.b));
  }
  for (const [a, b] of P.E) edge = Math.max(edge, Math.abs(norm(sub(P.V[a], P.V[b])) - 1));
  // 2-faces: sets of vertices shared by two cells that span a plane (3+ points, affine dimension 2)
  const faces = new Set();
  for (let i = 0; i < P.cells.length; i++) for (let j = i + 1; j < P.cells.length; j++) {
    const a = new Set(P.cells[i].verts), s = P.cells[j].verts.filter((v) => a.has(v));
    if (s.length >= 3) faces.add(s.sort((x, y) => x - y).join(','));
  }
  return { outside, offPlane, edge, V: P.V.length, E: P.E.length, F: faces.size, C: P.cells.length, euler: P.V.length - P.E.length + faces.size - P.cells.length };
}

// ------------------------------------------------------------------ viewing a 4D polytope
/** The 3D slice through O spanned by E0, E1, E2: the polyhedron of points y with every cell's n·(O + Σ yᵢEᵢ) ≤ b.
 *  Returns faces (polygons in slice coordinates) each with the cell it came from and that cell's normal. A convex
 *  polyhedron clipped plane by plane from a big cube. */
export function slice(P, O, E, R = 10) {
  let poly = cube(R);
  for (let ci = 0; ci < P.cells.length; ci++) {
    const c = P.cells[ci], m = [dot(c.n, E[0]), dot(c.n, E[1]), dot(c.n, E[2])], ml = norm(m), b = c.b - dot(c.n, O);
    if (ml < 1e-9) { if (b < 0) return []; continue; }      // the cell's hyperplane is parallel to the slice
    poly = clip(poly, scale(m, 1 / ml), b / ml, ci);
    if (!poly.length) return [];
  }
  return poly.filter((f) => f.cell >= 0);
}
function cube(R) {
  const v = (x, y, z) => [x * R, y * R, z * R], F = [];
  const q = [[[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]];
  for (const f of q) F.push({ pts: f.map((p) => v(...p)), cell: -1 });
  return F;
}
/** Keep the part of a convex polyhedron (a list of faces) with m·y ≤ b; cap the cut with a new face from `cell`. */
function clip(faces, m, b, cell) {
  const out = [], cut = [];
  for (const f of faces) {
    const P = f.pts, n = P.length, q = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], c = P[(i + 1) % n], da = dot(m, a) - b, dc = dot(m, c) - b;
      if (da <= 1e-12) q.push(a);
      if ((da < -1e-12 && dc > 1e-12) || (da > 1e-12 && dc < -1e-12)) { const t = da / (da - dc), p = add(a, sub(c, a), t); q.push(p); cut.push(p); }
      else if (Math.abs(da) <= 1e-12) cut.push(a);
    }
    if (q.length >= 3) out.push({ pts: q, cell: f.cell });
  }
  if (cut.length >= 3) {
    // order the cap's points round their centre, counter-clockwise seen from outside (along +m)
    const u = []; for (const p of cut) if (!u.some((x) => norm(sub(x, p)) < 1e-9)) u.push(p);
    if (u.length >= 3) {
      const c = centroid(u), e1 = unit(sub(u[0], c)), e2 = cross(m, e1);
      u.sort((a, z) => Math.atan2(dot(sub(a, c), e2), dot(sub(a, c), e1)) - Math.atan2(dot(sub(z, c), e2), dot(sub(z, c), e1)));
      out.push({ pts: u, cell });
    }
  }
  return out;
}
/** The shadow: each vertex projected to 3D, perspective from an eye at distance `eye` along E3 (as in HILBERT⁴), with
 *  how far ana (+) or kata (−) along E3 it is. */
export function shadow(P, O, E, eye = 4) {
  return P.V.map((v) => {
    const d = sub(v, O), w = dot(d, E[3]), k = eye / (eye - w);
    return { p: [dot(d, E[0]) * k, dot(d, E[1]) * k, dot(d, E[2]) * k], w };
  });
}
