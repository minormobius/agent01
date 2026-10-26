/* ATOM⁴'s shapes, no DOM: the six regular 4D polytopes (Schläfli's), the hybrid-orbital geometry of carbon and darbon,
   and the honeycomb → diamond → darbon's-diamond family of nets. Every point is a 4-vector; 2D and 3D things have
   their extra coordinates zero. The tile viewer (./tile.js) draws them; the selftest checks them. */

export const PHI = (1 + Math.sqrt(5)) / 2;
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (a, k) => a.map((v) => v * k);
const norm = (a) => Math.sqrt(dot(a, a));
const pad4 = (a) => [...a, 0, 0, 0, 0].slice(0, 4);

/* d + 1 unit vectors in d dimensions, every pair at cos θ = −1/d: the corners of a regular simplex */
export function simplex(d) {
  const n = d + 1, u = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0) - 1 / n)), basis = [];
  for (let i = 0; i < d; i++) { let v = u[i].slice(); for (const b of basis) v = sub(v, scale(b, dot(v, b))); basis.push(scale(v, 1 / norm(v))); }
  return u.map((x) => { const c = basis.map((b) => dot(x, b)); return scale(c, 1 / norm(c)); });
}

/* ---------------------------------------------------------------- the six */
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
const parity = (p) => { let s = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s++; return s % 2; };
const signs = (a) => a.reduce((out, v) => out.flatMap((p) => (v === 0 ? [[...p, 0]] : [[...p, v], [...p, -v]])), [[]]);
const uniq = (pts) => { const seen = new Map(); for (const p of pts) seen.set(p.map((v) => Math.round(v * 1e6)).join(","), p); return [...seen.values()]; };
const allPerms = (a) => uniq(perms(a).flatMap(signs));

const V5 = () => simplex(4);
const V8 = () => signs([1, 1, 1, 1]);
const V16 = () => allPerms([1, 0, 0, 0]);
const V24 = () => allPerms([1, 1, 0, 0]);
const V24dual = () => [...allPerms([1, 0, 0, 0]), ...signs([0.5, 0.5, 0.5, 0.5])];
function V600() {
  const even = perms([0, 1, 2, 3]).filter((p) => !parity(p)), out = [...V16(), ...signs([0.5, 0.5, 0.5, 0.5])];
  for (const base of signs([PHI / 2, 0.5, 1 / (2 * PHI)])) for (const p of even) { const v = [...base, 0]; out.push(p.map((k) => v[k])); }
  return uniq(out);
}

/* edges: the pairs at the least distance */
export function edgesOf(V) {
  let m = Infinity; for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) m = Math.min(m, norm(sub(V[i], V[j])));
  const E = []; for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (Math.abs(norm(sub(V[i], V[j])) - m) < 1e-6 * m) E.push([i, j]);
  return E;
}
const adjacency = (n, E) => { const A = Array.from({ length: n }, () => []); for (const [a, b] of E) { A[a].push(b); A[b].push(a); } return A; };
/* the rank of a set of vectors (Gram–Schmidt) */
export function rank(vs) { const basis = []; for (let v of vs) { for (const b of basis) v = sub(v, scale(b, dot(v, b))); const n = norm(v); if (n > 1e-7) basis.push(scale(v, 1 / n)); } return basis.length; }
/* faces: the cycles of k edges whose corners lie in one plane */
export function facesOf(V, E, k) {
  const A = adjacency(V.length, E), F = [];
  for (let r = 0; r < V.length; r++) {
    const walk = (path) => {
      const last = path[path.length - 1];
      if (path.length === k) { if (A[last].includes(r) && path[1] < last && rank(path.slice(1).map((i) => sub(V[i], V[r]))) === 2) F.push(path.slice()); return; }
      for (const n of A[last]) if (n > r && !path.includes(n)) { path.push(n); walk(path); path.pop(); }
    };
    walk([r]);
  }
  return F;
}
/* cells: for each vertex of the dual, the vertices farthest along it */
export function cellsOf(V, dualDirs) {
  return dualDirs.map((n) => { const s = V.map((v) => dot(v, n)), m = Math.max(...s); return s.map((x, i) => (x > m - 1e-6 ? i : -1)).filter((i) => i >= 0); });
}
const centroid = (V, idx) => scale(idx.reduce((a, i) => add(a, V[i]), [0, 0, 0, 0]), 1 / idx.length);
/* the 4-cliques of a graph: the tetrahedral cells of a simplicial polytope */
function tetrahedra(n, E) {
  const A = adjacency(n, E).map((x) => new Set(x)), out = [];
  for (const [a, b] of E) for (const c of A[a]) if (c > b && A[b].has(c)) for (const d of A[a]) if (d > c && A[b].has(d) && A[c].has(d)) out.push([a, b, c, d]);
  return out;
}

/* each: name, Schläfli symbol, its 3D cousin, the face and cell shapes, then V, E, F, cells. Circumradius 1. */
let CACHE = null;
export function polytopes() {
  if (CACHE) return CACHE;
  const build = (key, name, sym, cousin, k, cellName, V, dual) => {
    const r = norm(V[0]), Vn = V.map((v) => scale(v, 1 / r)), E = edgesOf(Vn), F = facesOf(Vn, E, k);
    return { key, name, sym, cousin, faceName: ["", "", "", "triangle", "square", "pentagon"][k], cellName, V: Vn, E, F, C: cellsOf(Vn, dual) };
  };
  const v600 = V600(), e600 = edgesOf(v600.map((v) => scale(v, 1 / norm(v)))), t600 = tetrahedra(v600.length, e600), v120 = t600.map((t) => centroid(v600, t));
  CACHE = [
    build("5", "5-cell", "{3,3,3}", "tetrahedron", 3, "tetrahedra", V5(), V5().map((v) => scale(v, -1))),
    build("8", "tesseract", "{4,3,3}", "cube", 4, "cubes", V8(), V16()),
    build("16", "16-cell", "{3,3,4}", "octahedron", 3, "tetrahedra", V16(), V8()),
    build("24", "24-cell", "{3,4,3}", "none: it's 4D's own", 3, "octahedra", V24(), V24dual()),
    build("120", "120-cell", "{5,3,3}", "dodecahedron", 5, "dodecahedra", v120, v600),
    build("600", "600-cell", "{3,3,5}", "icosahedron", 3, "tetrahedra", v600, v120),
  ];
  return CACHE;
}

/* ---------------------------------------------------------------- bonds: hybrid orbitals
   s mixed with d p orbitals into d + 1 equal hybrids, h_i = a s + b (e_i · p): orthonormal iff a² + b² = 1 and
   a² + b² e_i·e_j = 0, so a² = 1/(d + 1): a quarter s in 3D (sp³), a fifth in 4D (sp⁴). They point to the simplex */
export const hybrid = (d) => ({ s: Math.sqrt(1 / (d + 1)), p: Math.sqrt(d / (d + 1)) });
export const bondAngleDeg = (d) => (Math.acos(-1 / d) * 180) / Math.PI;
/* an alkane-like chain of n atoms with v bonds each: hydrogens = v n − 2(n − 1) */
export const chainH = (n, v) => v * n - 2 * (n - 1);

/* a molecule: a centre with d + 1 neighbours on the simplex, as balls and bonds */
export const ELEMENT = { C: { c: "#5d6470", r: 0.34 }, D: { c: "#2f8f9d", r: 0.36 }, H: { c: "#e9e4da", r: 0.22 }, F: { c: "#8fe388", r: 0.26 }, Cl: { c: "#2fbf4a", r: 0.3 }, Br: { c: "#a8322d", r: 0.32 }, I: { c: "#8a4fd8", r: 0.34 } };
export function star(d, centre, around, { bond = 1, at = [0, 0, 0, 0], group = 0 } = {}) {
  const dirs = simplex(d).map(pad4), balls = [{ p: at.slice(), el: centre, group }], bonds = [];
  dirs.forEach((e, i) => { balls.push({ p: add(at, scale(e, bond)), el: around[i % around.length], group }); bonds.push([0, balls.length - 1]); });
  return { balls, bonds, ghost: d === 4 || d === 3 ? edgesOf(dirs).map(([a, b]) => [a + 1, b + 1]) : [] };
}

/* ---------------------------------------------------------------- the diamond family
   Two copies of the root lattice A_d (generated by e_i − e_j), one bond apart: each node of one copy bonds to x + e_i,
   each of the other to y − e_i. d = 2 is graphene's honeycomb, d = 3 diamond, d = 4 darbon's diamond. Nodes within
   radius R of the middle of a bond */
export function diamondNet(d, R) {
  const e = simplex(d).map(pad4), mid = scale(e[0], 0.5), key = (p) => p.map((v) => Math.round(v * 1e5)).join(","); // not toFixed: "-0.00000" would split a site in two
  const nodes = [{ p: [0, 0, 0, 0], side: 0 }], index = new Map([[key(nodes[0].p), 0]]), bonds = [], seen = new Set();
  for (let q = 0; q < nodes.length; q++) {
    const { p, side } = nodes[q];
    for (const ei of e) {
      const n = side ? sub(p, ei) : add(p, ei);
      if (norm(sub(n, mid)) > R) continue;
      let j = index.get(key(n)); if (j === undefined) { j = nodes.length; nodes.push({ p: n, side: 1 - side }); index.set(key(n), j); }
      const b = q < j ? `${q}-${j}` : `${j}-${q}`; if (!seen.has(b)) { seen.add(b); bonds.push([q, j]); }
    }
  }
  return { nodes, bonds, dirs: e, centre: mid };
}
