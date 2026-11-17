// FOLD's page: the tesseract's nets folding up through w, and the mirror fold. Triangles and lines rebuilt each frame
// something moves; the camera and the pad, lever and ⊞ are CAD⁴'s (as on JOHNSON).
import * as F from './fold.js';
import { NETS } from './nets-data.js';
import { JOHNSON, SNUB_DODECAHEDRON } from '../../johnson/js/johnson-data.js';
import * as UF from './unfold4.js';
import { depth as clashDepth } from './clash.js';
import { OVERLAP_24, NET_24 } from './unfold4-data.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
const gl = canvas.getContext('webgl2', { antialias: true });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

const DALI = NETS.indexOf(F.daliNet(NETS));
const S = { f24: 0, t24: null, mode: 'nets', view: 'shadow', net: DALI, f: 0, ring: true, playing: 0, spin: true, obj: 'snub', a: 0, R: 2.4 };
let E = ident(), off = -0.5, yaw = -0.5, pitch = 0.45, zoom = 1, dirty = true, need = true;
function ident() { return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; }
const dot = F.dot, sub = (a, b) => a.map((v, i) => v - b[i]);
function turn(a, n, th) { const c = Math.cos(th) - 1, s = Math.sin(th); E = E.map((v) => { const va = dot(v, a), vn = dot(v, n); return v.map((x, i) => x + c * (va * a[i] + vn * n[i]) + s * (va * n[i] - vn * a[i])); }); for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) { const d = dot(E[i], E[j]); E[i] = E[i].map((x, k) => x - d * E[j][k]); } const l = Math.hypot(...E[i]); E[i] = E[i].map((x) => x / l); } }
function view() {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const f = [-cp * sy, -sp, -cp * cy], r = [cy, 0, -sy], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]], dist = (3.2 * S.R) / zoom;
  return { f, r, u, cam: S.centre.map((c, i) => c - f[i] * dist) };
}
const lift = (v3) => [0, 1, 2, 3].map((i) => v3[0] * E[0][i] + v3[1] * E[1][i] + v3[2] * E[2][i]);
const origin = () => E[3].map((x) => x * off);
S.centre = [0, 0, 0];

// ------------------------------------------------------------------ GL (as JOHNSON's)
const VS = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm; layout(location=2) in vec3 col;
uniform mat4 M; out vec3 vN; out vec3 vC; out vec3 vP;
void main() { vN = nrm; vC = col; vP = pos; gl_Position = M * vec4(pos, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vC; in vec3 vP; out vec4 o; uniform vec3 eye; uniform int lit; uniform float alpha;
void main() {
  if (lit == 0) { o = vec4(vC, 1.0); return; }
  vec3 n = normalize(vN), v = normalize(eye - vP); if (dot(n, v) < 0.0) n = -n;
  float d = 0.3 + 0.6 * max(dot(n, normalize(vec3(0.5, 0.8, 0.6))), 0.0) + 0.2 * max(dot(n, normalize(vec3(-0.6, 0.2, -0.5))), 0.0);
  o = vec4(vC * d + pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.2, alpha);
}`;
const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
const U = { M: gl.getUniformLocation(prog, 'M'), eye: gl.getUniformLocation(prog, 'eye'), lit: gl.getUniformLocation(prog, 'lit'), alpha: gl.getUniformLocation(prog, 'alpha') };
const buf = () => { const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); } return { vao, b, n: 0, set(a) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.DYNAMIC_DRAW); this.n = a.length / 9; } }; };
const TRI = buf(), LIN = buf();
gl.enable(gl.DEPTH_TEST);

let EYE = 2.5;                         // the shadow's eye, out along your w: beyond the furthest the net reaches while folding
const REACH = new Map();
/** How far into w (from our space, w = −½) any vertex of this net gets at any angle of the fold. */
function reach(i) {
  if (REACH.has(i)) return REACH.get(i);
  let m = 0;
  for (let k = 0; k <= 80; k++) { const M = F.motions(NETS[i].parent, (k % 41) / 40, k > 40); F.CELLS.forEach((c, j) => { for (const v of c.V) m = Math.max(m, Math.abs(M[j](v)[3] + 0.5)); }); }
  REACH.set(i, m); return m;
}
/** The cubes passing through each other at this moment of the fold: [{ a, b, d }], d how deep (in cube widths) the
 *  deepest common point is inside both. Touching along a hinge, an edge or a corner doesn't count. */
function clashes(parent, M) {
  const box = (i) => { const c = F.CELLS[i], o = M[i](c.n.map((v) => v / 2)), O0 = M[i]([0, 0, 0, 0]);
    return [o, [0, 1, 2, 3].filter((k) => k !== c.axis).map((k) => { const e = [0, 0, 0, 0]; e[k] = 1; return sub(M[i](e), O0); })]; };
  const B = F.CELLS.map((_, i) => box(i)), out = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
    if (Math.hypot(...sub(B[a][0], B[b][0])) > Math.sqrt(3)) continue;
    const d = clashDepth(B[a][0], B[a][1], 0.5, B[b][0], B[b][1], 0.5); if (d > 1e-6) out.push({ a, b, d });
  }
  return out;
}
// ------------------------------------------------------------------ the scene
// cell colours: ±x ice, ±y gold, ±z rose, ±w violet (the root, −w, the palest)
const CELLCOL = [[0.44, 0.84, 1.0], [0.3, 0.62, 0.85], [1.0, 0.8, 0.42], [0.85, 0.62, 0.3], [1.0, 0.5, 0.74], [0.82, 0.38, 0.6], [0.7, 0.56, 1.0], [0.9, 0.88, 0.95]];
const CUBE_FACES = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];   // by the bit order of CELLS' vertices
const CUBE_EDGES = []; for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) { const x = a ^ b; if (x === 1 || x === 2 || x === 4) CUBE_EDGES.push([a, b]); }
const OBJECTS = { snub: { name: 'the snub dodecahedron', ...SNUB_DODECAHEDRON }, ...Object.fromEntries([44, 45, 46, 47, 48].map((j) => [`J${j}`, { name: `J${j} ${JOHNSON[j - 1].name}`, V: JOHNSON[j - 1].V, F: JOHNSON[j - 1].F }])) };
const NGON = { 3: [0.44, 0.84, 1.0], 4: [1.0, 0.8, 0.42], 5: [1.0, 0.5, 0.74] };
const nrm3 = (p) => { const a = sub(p[1], p[0]), b = sub(p[2], p[0]); const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
const tint = (col, lean) => { const t = Math.min(1, Math.abs(lean) * 1.4); return lean < -0.05 ? col.map((x, i) => x * (1 - 0.55 * t) + [0.22, 0.95, 0.88][i] * 0.55 * t) : lean > 0.05 ? col.map((x, i) => x * (1 - 0.55 * t) + [1.0, 0.4, 0.72][i] * 0.55 * t) : col; };
/** Into your 3D view: shadow (perspective from an eye at distance 4 along your w) or slice coordinates. */
function to3(x, O) { const d = sub(x, O), w = dot(d, E[3]), k = S.view === 'shadow' ? EYE / (EYE - w) : 1; return [dot(d, E[0]) * k, dot(d, E[1]) * k, dot(d, E[2]) * k]; }
/** A 3D piece lying somewhere in 4D (its vertices W, faces, edges): in shadow, all of it; in slice, itself if it lies
 *  in the slice, else where the slice cuts it (a flat polygon), or nothing. */
function piece(W, faces, edges, col, lean, T, L, O, edgeCol = [0.05, 0.05, 0.08]) {
  const c = tint(col, lean), s = W.map((x) => dot(sub(x, O), E[3]));
  if (S.view === 'shadow' || s.every((v) => Math.abs(v) < 1e-6)) {          // the shadow, or a piece lying in the slice: all of it
    const P = W.map((x) => to3(x, O));
    for (const f of faces) { const pts = f.map((i) => P[i]), n = nrm3(pts); for (let a = 1; a + 1 < f.length; a++) T(pts[0], pts[a], pts[a + 1], n, c); }
    for (const [a, b] of edges) L(P[a], P[b], edgeCol);
    return;
  }
  const pts = [];
  for (const [a, b] of edges) {
    if (Math.abs(s[a]) < 1e-9) pts.push(W[a]);
    if ((s[a] < -1e-9 && s[b] > 1e-9) || (s[a] > 1e-9 && s[b] < -1e-9)) { const t = s[a] / (s[a] - s[b]); pts.push(W[a].map((v, i) => v + (W[b][i] - v) * t)); }
  }
  const u = []; for (const p of pts) if (!u.some((q) => Math.hypot(...sub(p, q)) < 1e-7)) u.push(p);
  if (u.length < 3) return;
  const P = u.map((x) => to3(x, O)), cen = [0, 1, 2].map((k) => P.reduce((t, p) => t + p[k], 0) / P.length);
  // the section's plane normal, from its two most independent directions (NOT a Newell sum over the points as they
  // came: unordered, that can cancel or flip, and the polygon then sorts in the wrong plane and draws as a bow-tie)
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let n = [0, 0, 0];
  for (let i = 1; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const c = cr(sub(P[i], P[0]), sub(P[j], P[0])); if (Math.hypot(...c) > Math.hypot(...n)) n = c; }
  n = n.map((v) => v / (Math.hypot(...n) || 1));
  const e1 = sub(P[0], cen), e1n = e1.map((v) => v / (Math.hypot(...e1) || 1)), e2 = [n[1] * e1n[2] - n[2] * e1n[1], n[2] * e1n[0] - n[0] * e1n[2], n[0] * e1n[1] - n[1] * e1n[0]];
  const ord = P.map((p, i) => [Math.atan2(dot([...sub(p, cen), 0], [...e2, 0]), dot([...sub(p, cen), 0], [...e1n, 0])), i]).sort((x, y) => x[0] - y[0]).map((x) => P[x[1]]);
  for (let a = 1; a + 1 < ord.length; a++) T(ord[0], ord[a], ord[a + 1], n, c);
  for (let a = 0; a < ord.length; a++) L(ord[a], ord[(a + 1) % ord.length], edgeCol);
}
// ------------------------------------------------------------------ the 24-cell
const P24 = UF.cell24(), F24 = UF.cellFaces(P24);
const E24 = F24.map((faces) => { const m = new Map(); for (const f of faces) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; m.set(a < b ? `${a},${b}` : `${b},${a}`, [Math.min(a, b), Math.max(a, b)]); } return [...m.values()]; });
// cool colours (ice through teal to violet) so the colliding pair's red stands out
const HUE24 = P24.cells.map((_, i) => { const h = 2.4 + (i / 24) * 2.6, c = 0.5, x = c * (1 - Math.abs((h % 2) - 1)), [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x]; return [r + 0.35, g + 0.35, b + 0.35]; });
const TALLY = { drawn: 0, collided: 0 };
/** Choose a hinge tree for the 24-cell: its overlaps when flat, how far into w it reaches folding, and a frame whose
 *  slice is the root cell's hyperplane (where the flat unfolding lies). */
function set24(parent, label) {
  const root = parent.indexOf(-1), flat = UF.unfold(P24, parent), over = UF.overlaps(flat.cells);
  const basis = UF.rootBasis(P24, root), nr = P24.cells[root].n, o = P24.V[P24.cells[root].verts[0]];
  let reachW = 0; for (let k = 0; k <= 12; k++) { const M = UF.motionsAt(P24, parent, k / 12); P24.cells.forEach((c, i) => { for (const v of c.verts) reachW = Math.max(reachW, Math.abs(dot(sub(M[i](P24.V[v]), o), nr))); }); }
  const cen = [0, 1, 2].map((k) => flat.cells.reduce((t, c) => t + c.reduce((u, p) => u + p[k], 0) / c.length, 0) / 24);
  const R = Math.max(...flat.cells.flat().map((p) => Math.hypot(...p.map((x, k) => x - cen[k])))) + 0.5;
  let wit = null;
  if (over.length) { const w = UF.witness(flat.cells[over[0].a], flat.cells[over[0].b]); wit = { x: [0, 1, 2, 3].map((k) => o[k] + w.p.reduce((t, x, j) => t + x * basis[j][k], 0)), margin: w.margin }; }
  S.t24 = { parent, label, over, reachW, root, frame: [...basis, nr], off: dot(o, nr), cen, R, wit, bad: new Set(over.flatMap((x) => [x.a, x.b])) };
  E = S.t24.frame.map((v) => v.slice()); off = S.t24.off; need = dirty = true; info();
}
function build24(T, L, O) {
  const t = S.t24, M = UF.motionsAt(P24, t.parent, 1 - S.f24);
  EYE = Math.max(2.5, t.reachW * 1.5 + 1);
  P24.cells.forEach((c, i) => {
    const W = c.verts.map((v) => M[i](P24.V[v])), p0 = P24.V[c.verts[0]], nn = sub(M[i](c.n.map((x, k) => x + p0[k])), M[i](p0));
    const bad = t.bad.has(i);
    piece(W, F24[i], E24[i], bad ? [1.0, 0.18, 0.22] : HUE24[i], bad ? 0 : dot(nn, E[3]) * (S.view === 'slice' ? 1 : 0.6), T, L, O, bad ? [1.0, 0.3, 0.3] : undefined);
  });
  // the hinges: each child's shared triangle with its parent, gold
  t.parent.forEach((p, c) => {
    if (p < 0) return;
    const tri = P24.adj[p].get(c).map((v) => M[c](P24.V[v]));
    if (S.view === 'slice' && tri.some((x) => Math.abs(dot(sub(x, O), E[3])) > 1e-6)) return;
    const q = tri.map((x) => to3(x, O)); for (let a = 0; a < 3; a++) L(q[a], q[(a + 1) % 3], [1.0, 0.82, 0.4]);
  });
  // the witness: a point inside both colliding octahedra (only where they collide: lying flat)
  if (t.wit && S.f24 < 0.02) { const c = to3(t.wit.x, O), r = 0.4; for (let k = 0; k < 3; k++) { const a = c.slice(), b = c.slice(); a[k] -= r; b[k] += r; L(a, b, [1.0, 0.85, 0.3]); } }
  const flatCen = t.cen.map((x, k) => x), C3 = to3([0, 1, 2, 3].map((k) => P24.V[P24.cells[t.root].verts[0]][k] + flatCen.reduce((u, v, j) => u + v * t.frame[j][k], 0)), O);
  // framing eases from the flat layout to the closed polytope (centred where the 24-cell's centre falls) as it folds
  const e = S.f24 * S.f24 * (3 - 2 * S.f24), C0 = to3([0, 0, 0, 0], O);
  S.centre = C3.map((x, k) => x * (1 - e) + C0[k] * e); S.R = t.R * (1 - e) + 2.4 * e;
}
function build() {
  const tri = [], lin = [];
  const T = (a, b, c, n, col) => { for (const p of [a, b, c]) tri.push(...p, ...n, ...col); };
  const L = (a, b, col) => lin.push(...a, 0, 0, 0, ...col, ...b, 0, 0, 0, ...col);
  const O = origin();
  if (S.mode === 'c24') build24(T, L, O);
  else if (S.mode === 'nets') {
    const net = NETS[S.net], M = F.motions(net.parent, 1 - S.f, S.ring);
    EYE = Math.max(2.5, reach(S.net) * 1.5 + 1);
    const cl = clashes(net.parent, M), bad = new Set(cl.flatMap((x) => [x.a, x.b]));
    if (JSON.stringify(cl.map((x) => [x.a, x.b])) !== JSON.stringify((S.clash || []).map((x) => [x.a, x.b]))) { S.clash = cl; info(); } else S.clash = cl;
    F.CELLS.forEach((c, i) => {
      const W = c.V.map(M[i]), nn = sub(M[i](c.n), M[i]([0, 0, 0, 0]));
      if (bad.has(i)) piece(W, CUBE_FACES, CUBE_EDGES, [1.0, 0.18, 0.22], 0, T, L, O, [1.0, 0.3, 0.3]);
      else piece(W, CUBE_FACES, CUBE_EDGES, CELLCOL[i], dot(nn, E[3]) * (S.view === 'slice' ? 1 : 0.6), T, L, O);
    });
    // the hinges: each child's shared square with its parent, gold
    net.parent.forEach((p, i) => {
      if (p < 0) return;
      const c = F.CELLS[i], sq = c.V.map((v, k) => [v, k]).filter(([v]) => Math.abs(dot(v, F.CELLS[p].n) - 0.5) < 1e-9).map(([v]) => to3(M[i](v), O));
      if (S.view === 'slice' && c.V.filter((v) => Math.abs(dot(v, F.CELLS[p].n) - 0.5) < 1e-9).some((v) => Math.abs(dot(sub(M[i](v), O), E[3])) > 1e-6)) return;   // a hinge out of the slice
      const ord = [0, 1, 3, 2].map((k) => sq[k]);
      for (let a = 0; a < 4; a++) L(ord[a], ord[(a + 1) % 4], [1.0, 0.82, 0.4]);
    });
    // frame the flat net (and keep that framing while it folds)
    const C = net.cubes, cen = [0, 1, 2].map((k) => C.reduce((t, c) => t + c[k], 0) / C.length);
    S.centre = cen; S.R = Math.max(...C.map((c) => Math.hypot(...c.map((v, k) => v - cen[k])))) + 0.9;
  } else {
    const o = OBJECTS[S.obj], th = S.a * Math.PI;
    EYE = Math.max(2.5, Math.max(...o.V.map((v) => Math.abs(v[0]))) * 1.5 + 1.5);
    const W = o.V.map((p) => F.turnXW([...p, 0], th));
    // the solid, faces by polygon, tinted by which way it leans into w
    const lean = Math.sin(th);
    const tri0 = tri.length;
    piece(W, o.F, edgesOf(o.F), [0.85, 0.85, 0.9], 0, T, L, O);
    // recolour its faces by polygon (shadow / whole): piece() coloured them uniformly
    if (S.view === 'shadow' || Math.abs(lean) < 1e-6 || Math.abs(Math.sin(th)) < 1e-9) { let k = tri0; for (const f of o.F) for (let a = 1; a + 1 < f.length; a++) for (let v = 0; v < 3; v++) { const c = tint(NGON[f.length] || [0.8, 0.8, 0.8], -lean * 0.8); tri[k + 6] = c[0]; tri[k + 7] = c[1]; tri[k + 8] = c[2]; k += 9; } }
    // the target: its mirror image in our space, a faint gold wire, to land on
    const Mv = o.V.map((p) => [-p[0], p[1], p[2], 0]).map((x) => to3(x, O));
    for (const [a, b] of edgesOf(o.F)) L(Mv[a], Mv[b], [0.45, 0.36, 0.16]);
    S.centre = [0, 0, 0]; S.R = Math.max(...o.V.map((v) => Math.hypot(...v))) * 1.1;
  }
  TRI.set(tri); LIN.set(lin);
  // the drawn surface's area (a check for tests: a slice through the folded tesseract is a cube, area 6)
  let area = 0; for (let k = 0; k < tri.length; k += 27) { const a = [tri[k], tri[k + 1], tri[k + 2]], b = [tri[k + 9], tri[k + 10], tri[k + 11]], c = [tri[k + 18], tri[k + 19], tri[k + 20]]; const u = sub(b, a), v = sub(c, a); area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; }
  S.area = area; S.tri = tri;
}
const EDGES = new Map();
function edgesOf(F2) { if (EDGES.has(F2)) return EDGES.get(F2); const m = new Map(); for (const f of F2) for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; m.set(a < b ? `${a},${b}` : `${b},${a}`, [Math.min(a, b), Math.max(a, b)]); } const e = [...m.values()]; EDGES.set(F2, e); return e; }

// ------------------------------------------------------------------ draw
function matrix(v, aspect) {
  const near = 0.05, far = 100, f = 1 / Math.tan((50 * Math.PI) / 360), z = v.f.map((x) => -x), x = v.r, y = v.u, e = v.cam;
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const Vm = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d3(x, e), -d3(y, e), -d3(z, e), 1];
  const Pm = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const out = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += Pm[k * 4 + r] * Vm[c * 4 + k];
  return out;
}
let scale = 1;
function draw() {
  if (need) { build(); need = false; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale, w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h); gl.clearColor(0.027, 0.031, 0.047, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(prog);
  const v = view(); gl.uniformMatrix4fv(U.M, false, matrix(v, w / h)); gl.uniform3fv(U.eye, v.cam);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
  // in the shadow the cubes overlap (the folded tesseract is a cube in a cube): faces see-through, edges solid
  const see = S.view === 'shadow' && S.mode !== 'mirror';
  if (see) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
  gl.uniform1f(U.alpha, see ? 0.32 : 1);
  gl.uniform1i(U.lit, 1); gl.bindVertexArray(TRI.vao); gl.drawArrays(gl.TRIANGLES, 0, TRI.n);
  if (see) { gl.disable(gl.BLEND); gl.depthMask(true); }
  gl.uniform1f(U.alpha, 1);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.uniform1i(U.lit, 0); gl.bindVertexArray(LIN.vao); gl.drawArrays(gl.LINES, 0, LIN.n);
  overlay(v);
}
const AX = [['x', '#e9e4da'], ['y', '#e9e4da'], ['z', '#e9e4da'], ['w', '#ffd27a']];
function overlay(v) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, w, h);
  const cx = w - 52, cy = 96, L = 34; octx.lineWidth = 1.6; octx.font = '600 11px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const items = AX.map(([name, colr], a) => { const s3 = [E[0][a], E[1][a], E[2][a]]; return { name, colr, len: Math.hypot(...s3), x: d3(s3, v.r), y: d3(s3, v.u), z: -d3(s3, v.f) }; }).sort((a, b) => a.z - b.z);
  for (const it of items) { if (it.len < 0.04) continue; octx.globalAlpha = 0.35 + 0.65 * it.len; octx.strokeStyle = octx.fillStyle = it.colr; octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(cx + it.x * L, cy - it.y * L); octx.stroke(); octx.fillText(it.name, cx + it.x * (L + 9), cy - it.y * (L + 9)); }
  octx.globalAlpha = 1; octx.fillStyle = '#9a958c';
  const n = E[3], main = n.findIndex((x) => Math.abs(x) > 0.9995);
  octx.fillText(S.view === 'shadow' ? 'shadow: everything, seen from an eye out in w' : main >= 0 ? `slice: ${'xyzw'[main]} = ${(off * Math.sign(n[main])).toFixed(2)}` : `slice at ${off.toFixed(2)} along a tilted w`, w / 2, h - 14);
}

// ------------------------------------------------------------------ the panel
function rows(el, list) { el.textContent = ''; for (const [k, v] of list) { const a = document.createElement('i'), b = document.createElement('span'); a.textContent = k; b.textContent = v; el.append(a, b); } }
const CELLNAME = ['+x', '−x', '+y', '−y', '+z', '−z', '+w', '−w'];
function ringText(net) {
  const H = Math.max(...F.depths(net.parent)), s = S.f * H;
  return s >= H - 1e-9 ? `100%: all ${H} rings in` : s <= 1e-9 ? `0%: ${H} rings to fold` : `ring ${Math.floor(s) + 1} of ${H}, ${Math.round((s - Math.floor(s)) * 90)}° into w`;
}
function info() {
  if (S.mode === 'nets') {
    const net = NETS[S.net];
    $('netN').value = S.net + 1;
    $('title').textContent = S.net === DALI ? `net ${S.net + 1}: Dalí's` : `net ${S.net + 1} of 261`;
    rows($('facts'), [['hinges', '7 squares (of the 24 two cubes share)'], ['longest row', `${net.run} cubes`], ['hinge trees giving this shape', String(net.trees)], ['its mirror image', net.chiral ? 'a different net' : 'itself'], ['folded', S.ring ? ringText(net) : `${Math.round(S.f * 100)}%: every cube turned ${Math.round(S.f * 90)}° into w`], ['cubes passing through each other', (S.clash || []).length ? S.clash.map((x) => `${CELLNAME[x.a]} and ${CELLNAME[x.b]}, ${(x.d * 100).toFixed(1)}% of a cube deep`).join('; ') : 'none']]);
    $('cap').textContent = S.f < 0.02 ? `Net ${S.net + 1}: the tesseract's eight cubes, flat in our space, hinged on the gold squares. Slide to fold, or ▶.` : S.f > 0.98 ? (S.view === 'slice' ? (Math.abs(off + 0.5) < 0.01 ? 'Folded: the tesseract. Our slice is its bottom cube, the one cell left in our space. Push the lever ana to scan up through it.' : Math.abs(off) <= 0.5 ? 'Folded: the tesseract, sliced partway up in w. The slice is a cube: its six faces are where the six side cubes cross our space.' : 'Folded: the tesseract, and our slice has left it.') : 'Folded: the tesseract: in the shadow, its cube in a cube.') : (S.view === 'slice' ? 'Folding, in our slice: a cube turning about a hinge square that lies in our space leaves it at once; only its hinge stays. Push the lever ana to catch the rising cubes as sections.' : 'Folding: each cube turns about its gold hinge, out of our space into w (teal: going ana).');
    if ((S.clash || []).length && S.f > 0.02 && S.f < 0.98) $('cap').textContent = `Red: cubes ${S.clash.map((x) => `${CELLNAME[x.a]} and ${CELLNAME[x.b]}`).join(', ')} are passing through each other. With every hinge turning at once they can't all get out of each other's way; fold ring by ring and they never meet.`;
  } else if (S.mode === 'c24') {
    const t = S.t24, n = t.over.length;
    $('title24').textContent = `the 24-cell: ${t.label}`;
    rows($('facts24'), [['hinges', '23 triangles (of the 96 two octahedra share)'], ['laid flat', n ? `${n} pair${n > 1 ? 's' : ''} of octahedra overlap (red)` : 'a net: no two octahedra overlap'], ...(t.wit ? [['the gold cross', `inside both by ${t.wit.margin.toFixed(3)} (rounding: ~10⁻¹⁴)`]] : []), ['random draws', TALLY.drawn ? `${TALLY.drawn}: ${TALLY.collided} collided (${((100 * TALLY.collided) / TALLY.drawn).toFixed(1)}%)` : 'none yet'], ['folded', `${Math.round(S.f24 * 100)}%`]]);
    $('cap').textContent = S.f24 > 0.98 ? 'Folded: the 24-cell, 24 octahedra closed up in four dimensions, with nothing like it in three.' : n && S.f24 < 0.02 ? `Laid flat, this unfolding of the 24-cell overlaps: the red octahedra fill the same space (the gold cross is inside both). Fold it up and they pull apart into w.` : n ? 'Folding: the red pair, which collide when flat, pull apart as their hinges turn into w.' : 'The 24-cell laid flat in our space: 24 octahedra hinged on gold triangles, no two overlapping. Slide to fold, or ▶.';
  } else {
    const o = OBJECTS[S.obj];
    rows($('mfacts'), [['solid', o.name], ['hand', S.obj === 'snub' ? 'laevo, landing dextro' : 'chiral: J44–J48 are the only Johnson solids that are'], ['turned', `${Math.round(S.a * 180)}° in the plane of x and w`], ['where it is', S.a < 0.01 ? 'in our space, as it was' : S.a > 0.99 ? 'back in our space: its mirror image, landing on the gold wire' : Math.abs(S.a - 0.5) < 0.02 ? 'edge-on to our space: its slice is a flat section' : 'out in w']]);
    $('cap').textContent = S.a > 0.99 ? `${o.name}, turned half a turn through w: it has landed on the gold wire, its own mirror image. No turn in our space can do that.` : `${o.name}. Turn it through w (slider or ▶) and it comes back as its mirror image, the faint gold wire.`;
  }
}
function setMode(m) {
  S.mode = m; S.playing = 0; $('playB').classList.remove('on'); $('playB').textContent = m === 'nets' ? '▶ fold' : '▶ turn';
  for (const b of $('mode').children) b.classList.toggle('on', b.dataset.v === m);
  $('netSec').hidden = m !== 'nets'; $('mirSec').hidden = m !== 'mirror'; $('c24Sec').hidden = m !== 'c24';
  if (m === 'c24') { if (!S.t24) set24(OVERLAP_24, 'the collision'); else set24(S.t24.parent, S.t24.label); return; }
  off = m === 'nets' ? -0.5 : 0; E = ident(); need = dirty = true; info();
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }
for (const [k, o] of Object.entries(OBJECTS)) { const op = document.createElement('option'); op.value = k; op.textContent = o.name; $('obj').append(op); }
$('obj').onchange = () => { S.obj = $('obj').value; S.a = 0; $('turn').value = 0; need = dirty = true; info(); };
for (const b of $('mode').children) b.onclick = () => setMode(b.dataset.v);
for (const b of $('view').children) b.onclick = () => { S.view = b.dataset.v; for (const x of $('view').children) x.classList.toggle('on', x === b); need = dirty = true; info(); };
$('fold').oninput = () => { S.f = +$('fold').value; S.playing = 0; $('playB').classList.remove('on'); need = dirty = true; info(); };
$('turn').oninput = () => { S.a = +$('turn').value; S.playing = 0; $('playB').classList.remove('on'); need = dirty = true; info(); };
for (const b of $('sched').children) b.onclick = () => { S.ring = b.dataset.v === 'ring'; for (const x of $('sched').children) x.classList.toggle('on', x === b); need = dirty = true; info(); };
const goNet = (i) => { S.net = ((i % 261) + 261) % 261; need = dirty = true; info(); history.replaceState(null, '', `#net${S.net + 1}`); };
$('prevN').onclick = () => goNet(S.net - 1); $('nextN').onclick = () => goNet(S.net + 1);
$('netN').onchange = () => goNet((+$('netN').value || 1) - 1);
$('daliB').onclick = () => goNet(DALI); $('randN').onclick = () => goNet(Math.floor(Math.random() * 261));
$('playB').onclick = () => { const v = S.mode === 'nets' ? S.f : S.mode === 'c24' ? S.f24 : S.a; S.playing = S.playing ? 0 : v < 0.5 ? 1 : -1; $('playB').classList.toggle('on', !!S.playing); };
$('fold24').oninput = () => { S.f24 = +$('fold24').value; S.playing = 0; $('playB').classList.remove('on'); need = dirty = true; info(); };
$('net24B').onclick = () => { S.f24 = 0; $('fold24').value = 0; set24(NET_24, 'a net'); };
$('col24B').onclick = () => { S.f24 = 0; $('fold24').value = 0; set24(OVERLAP_24, 'the collision'); };
// random: as in the search that found the collision, three in four long winding (DFS) trees, one in four bushy (BFS)
$('rand24B').onclick = () => { const kind = Math.random() < 0.75 ? 'dfs' : 'bfs', p = UF.randomTree(P24, kind, Math.random, Math.floor(Math.random() * 24)); S.f24 = 0; $('fold24').value = 0; TALLY.drawn++; const before = TALLY.collided; set24(p, `random #${TALLY.drawn} (${kind === 'dfs' ? 'winding' : 'bushy'})`); if (S.t24.over.length) { TALLY.collided++; toast('this one collides'); } else toast('a net'); void before; info(); };
$('squareB').onclick = () => { if (S.mode === 'c24') { E = S.t24.frame.map((v) => v.slice()); off = S.t24.off; } else { E = ident(); off = S.mode === 'nets' ? -0.5 : 0; } need = dirty = true; };
$('spinB').onclick = () => { S.spin = !S.spin; $('spinB').classList.toggle('on', S.spin); };
$('cap').onclick = () => $('cap').classList.toggle('min');

// ------------------------------------------------------------------ controls (CAD⁴'s)
{
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; $('cap').classList.add('min'); });
  canvas.addEventListener('pointermove', (e) => { const p = pts.get(e.pointerId); if (!p) return; if (pts.size === 1) { yaw -= (e.clientX - p[0]) * 0.008; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - p[1]) * 0.008)); dirty = true; } pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { zoom = Math.max(0.3, Math.min(8, (zoom * d) / pinch)); dirty = true; } pinch = d; } });
  const up = (e) => { pts.delete(e.pointerId); pinch = 0; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.3, Math.min(8, zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });
}
const stick = { x: 0, y: 0 }, lever = { y: 0 }, keys = new Set();
{
  const pad = $('twist'), knob = $('twistKnob'), lv = $('ana'), lk = $('anaKnob');
  const padMove = (e) => { const r = pad.getBoundingClientRect(); let x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } stick.x = x; stick.y = -y; knob.style.transform = `translate(${x * 30}px, ${y * 30}px)`; };
  const padEnd = () => { stick.x = stick.y = 0; knob.style.transform = ''; pad.classList.remove('live'); };
  pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); pad.classList.add('live'); padMove(e); }); pad.addEventListener('pointermove', (e) => { if (pad.classList.contains('live')) padMove(e); }); pad.addEventListener('pointerup', padEnd); pad.addEventListener('pointercancel', padEnd);
  const lvMove = (e) => { const r = lv.getBoundingClientRect(); const y = Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1)); lever.y = -y; lk.style.transform = `translateY(${y * 40}px)`; };
  const lvEnd = () => { lever.y = 0; lk.style.transform = ''; lv.classList.remove('live'); };
  lv.addEventListener('pointerdown', (e) => { lv.setPointerCapture(e.pointerId); lv.classList.add('live'); lvMove(e); }); lv.addEventListener('pointermove', (e) => { if (lv.classList.contains('live')) lvMove(e); }); lv.addEventListener('pointerup', lvEnd); lv.addEventListener('pointercancel', lvEnd);
  addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === ',') goNet(S.net - 1); else if (e.key === '.') goNet(S.net + 1); else if (e.key === ' ') { $('playB').click(); e.preventDefault(); } else keys.add(e.key); if (e.key.startsWith('Arrow')) e.preventDefault(); });
  addEventListener('keyup', (e) => keys.delete(e.key));
}

// ------------------------------------------------------------------ the loop
let last = performance.now(), slow = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000), raw = now - last; last = now;
  let tx = stick.x, ty = stick.y, ly = lever.y;
  if (keys.has('ArrowLeft')) tx -= 1; if (keys.has('ArrowRight')) tx += 1; if (keys.has('ArrowUp')) ty += 1; if (keys.has('ArrowDown')) ty -= 1;
  if (keys.has('q') || keys.has('[')) ly += 1; if (keys.has('e') || keys.has(']')) ly -= 1;
  if (tx || ty) { const v = view(); if (tx) turn(lift(v.r), E[3], tx * 1.1 * dt); if (ty) turn(lift(v.u), E[3], ty * 1.1 * dt); need = dirty = true; }
  if (ly) { off = Math.max(-2, Math.min(2, off + ly * 0.8 * dt)); need = dirty = true; if (S.view === 'slice') info(); }
  if (S.playing) {
    const key = S.mode === 'nets' ? 'f' : S.mode === 'c24' ? 'f24' : 'a';
    S[key] = Math.max(0, Math.min(1, S[key] + S.playing * dt * 0.3));
    $(S.mode === 'nets' ? 'fold' : S.mode === 'c24' ? 'fold24' : 'turn').value = S[key];
    if (S[key] === 0 || S[key] === 1) { S.playing = 0; $('playB').classList.remove('on'); }
    need = dirty = true; info();
  }
  if (S.spin) { yaw += dt * 0.22; dirty = true; }
  if (dirty) { dirty = false; draw(); slow = raw > 45 ? slow + 1 : Math.max(0, slow - 1); if (slow > 8 && scale > 0.5) { scale *= 0.8; slow = 0; } }
  requestAnimationFrame(tick);
}
addEventListener('resize', () => { dirty = true; });
{ const h = location.hash.slice(1); if (h === 'mirror') setMode('mirror'); else if (h === '24') setMode('c24'); else { const m = h.match(/^net(\d+)$/); if (m) S.net = Math.max(0, Math.min(260, +m[1] - 1)); setMode('nets'); } }
window.fold = { S, F, NETS, setMode, pose: (p) => { if (p.E) E = p.E; if (p.off !== undefined) off = p.off; if (p.yaw !== undefined) yaw = p.yaw; if (p.pitch !== undefined) pitch = p.pitch; need = dirty = true; } };
requestAnimationFrame(tick);
