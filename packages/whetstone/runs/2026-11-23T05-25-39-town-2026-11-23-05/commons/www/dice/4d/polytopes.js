// The six regular 4-D solids as dice. Modulo, 2026-10-29, for the person's "yes please build the 4d dice roller".
// A 4-D die lands with one cell (a 3-D solid) flat on the 3-D floor. Its cells are its faces:
//   d5 = 5-cell (tetrahedra), d8 = tesseract (cubes), d16 = 16-cell (tetrahedra), d24 = 24-cell (octahedra),
//   d120 = 120-cell (dodecahedra), d600 = 600-cell (tetrahedra).
// Nothing here decides a roll: the face is drawn elsewhere, 1 + below(sides). This file only says what the die
// looks like with a given cell lit. Each solid is built from coordinates, its edges are the closest vertex pairs,
// its cells are found from the dual's vertices, and it is drawn in its Coxeter plane: the plane in which a
// Petrie polygon (h = 5, 8, 8, 12, 30, 30) projects to a regular h-gon, so the picture has h-fold symmetry.
// Labels: opposite cells sum to sides + 1, as on real dice. The d5 has no opposite cells.
// The same file is served at https://miniphim.minomobi.com/dice/4d/polytopes.js for the page.

const PHI = (1 + Math.sqrt(5)) / 2, EPS = 1e-6;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const d2 = (a, b) => { let s = 0; for (let i = 0; i < 4; i++) s += (a[i] - b[i]) ** 2; return s; };
const key = (v) => v.map((x) => Math.round(x * 1e5)).join(',');
const uniq = (vs) => { const m = new Map(); for (const v of vs) m.set(key(v), v); return [...m.values()]; };
function perms(a) {   // [perm, parity] for every ordering of a
  if (a.length <= 1) return [[a.slice(), 0]];
  const out = [];
  a.forEach((x, i) => { for (const [p, s] of perms(a.filter((_, j) => j !== i))) out.push([[x, ...p], (s + i) % 2]); });
  return out;
}
const signs = (v) => uniq(Array.from({ length: 16 }, (_, m) => v.map((x, i) => (m >> i & 1 ? -x : x))));
const allPerms = (v) => uniq(perms(v).flatMap(([p]) => signs(p)));
const evenPerms = (v) => uniq(perms(v).filter(([, s]) => s === 0).flatMap(([p]) => signs(p)));

function edgesOf(V) {
  let m = Infinity;
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) { const d = d2(V[i], V[j]); if (d > EPS && d < m) m = d; }
  const E = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) if (Math.abs(d2(V[i], V[j]) - m) < 1e-4 * m) E.push([i, j]);
  return E;
}
function tetraCentroids(V, E) {   // centroids of the 4-cliques of the edge graph: the 600-cell's cells
  const adj = V.map(() => new Set());
  for (const [i, j] of E) { adj[i].add(j); adj[j].add(i); }
  const out = [];
  for (const [i, j] of E) for (const k of adj[i]) if (k > j && adj[j].has(k)) for (const l of adj[k]) if (l > k && adj[i].has(l) && adj[j].has(l))
    out.push([0, 1, 2, 3].map((c) => (V[i][c] + V[j][c] + V[k][c] + V[l][c]) / 4));
  return out;
}

const COORDS = {
  5: () => { const t = PHI / 2, v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [t, t, t, t]], c = [0, 1, 2, 3].map((i) => v.reduce((a, x) => a + x[i], 0) / 5); return v.map((x) => x.map((y, i) => y - c[i])); },
  8: () => signs([1, 1, 1, 1]),
  16: () => allPerms([1, 0, 0, 0]),
  24: () => allPerms([1, 1, 0, 0]),
  600: () => [...signs([0.5, 0.5, 0.5, 0.5]), ...allPerms([1, 0, 0, 0]), ...evenPerms([PHI / 2, 0.5, 1 / (2 * PHI), 0])],
};
const PETRIE = { 5: 5, 8: 8, 16: 8, 24: 12, 120: 30, 600: 30 };
export const SIDES4 = [5, 8, 16, 24, 120, 600];
export const NAME4 = { 5: '5-cell', 8: 'tesseract', 16: '16-cell', 24: '24-cell', 120: '120-cell', 600: '600-cell' };

// a Petrie polygon: every 4 consecutive vertices share a cell, no 5 do (depth-first; quick for these sizes)
function petrie(V, E, cells, h) {
  const adj = V.map(() => []);
  for (const [i, j] of E) { adj[i].push(j); adj[j].push(i); }
  const inCell = (ids) => cells.some((c) => ids.every((x) => c.has(x)));
  const path = [0];
  const ok = (p, closed) => {   // open: the windows ending at the newest vertex; closed: every cyclic window
    const L = p.length, w = (k, len) => Array.from({ length: len }, (_, i) => p[(k + i) % L]);
    if (closed) { for (let k = 0; k < L; k++) if (!inCell(w(k, 4)) || inCell(w(k, 5))) return false; return true; }
    if (L >= 4 && !inCell(w(L - 4, 4))) return false;
    if (L >= 5 && inCell(w(L - 5, 5))) return false;
    return true;
  };
  const go = () => {
    if (path.length === h) return adj[path[h - 1]].includes(path[0]) && ok(path, true);
    for (const nx of adj[path[path.length - 1]]) {
      if (path.includes(nx)) continue;
      path.push(nx);
      if (ok(path, false) && go()) return true;
      path.pop();
    }
    return false;
  };
  if (!go()) throw new Error('no Petrie polygon found');
  return path;
}

function build(sides) {
  let V, C;
  if (sides === 120) { const P = get(600); V = tetraCentroids(P.V, P.E); C = P.V; }
  else {
    V = COORDS[sides]();
    C = sides === 5 ? V.map((v) => v.map((x) => -x)) : sides === 8 ? COORDS[16]() : sides === 16 ? COORDS[8]() : sides === 24 ? [...allPerms([1, 0, 0, 0]), ...signs([0.5, 0.5, 0.5, 0.5])] : null;
    if (sides === 600) C = tetraCentroids(V, edgesOf(V));
  }
  const E = edgesOf(V);
  const cells = C.map((c) => { const ds = V.map((v) => dot(v, c)), m = Math.max(...ds); return new Set(ds.flatMap((d, i) => (d > m - 1e-4 ? [i] : []))); });
  // labels: centres in a fixed order; each unlabelled one takes the next number, its opposite takes sides + 1 - that
  const order = C.map((c, i) => i).sort((a, b) => { for (let k = 0; k < 4; k++) { const d = C[b][k] - C[a][k]; if (Math.abs(d) > EPS) return d; } return 0; });
  const label = new Array(C.length).fill(0); let next = 1;
  for (const i of order) {
    if (label[i]) continue;
    label[i] = next;
    const o = C.findIndex((c, j) => !label[j] && d2(c, C[i].map((x) => -x)) < 1e-6);
    if (o >= 0) label[o] = sides + 1 - next;
    next++;
  }
  // the Coxeter plane: the first Fourier component of a Petrie polygon (the 120-cell uses its dual's)
  let plane;
  if (sides === 120) plane = get(600).plane;
  else {
    const h = PETRIE[sides], p = petrie(V, E, cells, h);
    let u = [0, 0, 0, 0], w = [0, 0, 0, 0];
    p.forEach((vi, k) => { for (let c = 0; c < 4; c++) { u[c] += V[vi][c] * Math.cos(2 * Math.PI * k / h); w[c] += V[vi][c] * Math.sin(2 * Math.PI * k / h); } });
    const n = (a) => { const l = Math.sqrt(dot(a, a)); return a.map((x) => x / l); };
    u = n(u); const uw = dot(u, w); w = n(w.map((x, c) => x - uw * u[c]));
    plane = [u, w];
  }
  const xy = V.map((v) => [dot(v, plane[0]), dot(v, plane[1])]);
  const r = Math.max(...xy.map(([x, y]) => Math.hypot(x, y)));
  // turned a quarter so the Petrie polygon's first vertex points up (screen y runs down)
  return { sides, V, E, C, cells, label, plane, xy: xy.map(([x, y]) => [y / r, -x / r]) };
}
const CACHE = {};
function get(sides) { return CACHE[sides] || (CACHE[sides] = build(sides)); }
export function polytope(sides) {
  if (!SIDES4.includes(sides)) throw new Error('no 4-D die d' + sides);
  return get(sides);
}
// the picture of one die showing `value`: unit-disc 2-D segments, the lit cell's segments apart
export function wire(sides, value) {
  const P = polytope(sides), ci = P.label.indexOf(value), cell = P.cells[ci];
  const lit = [], dim = [];
  for (const [i, j] of P.E) (cell && cell.has(i) && cell.has(j) ? lit : dim).push([...P.xy[i], ...P.xy[j]]);
  return { dim, lit };
}
