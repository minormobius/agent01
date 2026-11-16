// JOHNSON's page. Three modes: the 92 Johnson solids (spin and zoom); in 4D (prisms and pyramids over them, the Blind
// polytopes, the 600-cell and the snub 24-cell, seen as a 3D slice or a shadow); and the 600-cell diminisher (tap a
// vertex to cut it off). Everything is triangles and lines rebuilt when something changes; the controls are CAD⁴'s
// (kata.mino.mobi/cad4): drag to orbit, pinch or wheel to zoom, the pad twists the slice into w about what you see as
// across and up, the lever moves it ana and kata, ⊞ squares it up, and the axes in the corner show where x, y, z, w lie.
import { JOHNSON } from './johnson-data.js';
import * as P from './poly.js';
import { SNUB_DODECAHEDRON } from './johnson-data.js';
import { seating, FAMILIES, familyOf } from './seat.js';
import * as AT from './atlas.js';
import { CENSUS, TOTAL } from './atlas-census.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
const gl = canvas.getContext('webgl2', { antialias: true });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

// ------------------------------------------------------------------ state
const SEAT = seating().seat, SNUB = SNUB_DODECAHEDRON;
const S = { mode: '92', seatSel: -1, seatT: 0, mirror: false, famHi: -1, j: 1, view: 'slice', spin: true, obj: 'prism', cut: new Set(), trail: [], hot: null, walking: null, poly: null, R: 1.5, msg: '' };
let E = ident(), off = 0, yaw = -0.6, pitch = 0.35, zoom = 1, dirty = true, scale = 1;
function ident() { return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; }
const dot4 = P.dot;
function turn(a, n, th) { const c = Math.cos(th) - 1, s = Math.sin(th); E = E.map((v) => { const va = dot4(v, a), vn = dot4(v, n); return v.map((x, i) => x + c * (va * a[i] + vn * n[i]) + s * (va * n[i] - vn * a[i])); }); ortho(); }
function ortho() { for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) { const d = dot4(E[i], E[j]); E[i] = E[i].map((x, k) => x - d * E[j][k]); } const l = Math.hypot(...E[i]); E[i] = E[i].map((x) => x / l); } }
function view() {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const f = [-cp * sy, -sp, -cp * cy], r = [cy, 0, -sy], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dist = (3.2 * S.R) / zoom;
  // the pivot: the middle of things, or, with a solid summoned, that solid (gliding there as it flies out and back as it
  // goes home), so a zoom closes in on it
  const w = S.mode === 'seat' && S.seatSel >= 0 && S.summonAt ? ease(S.seatT) : 0, T = w ? S.summonAt.map((x) => x * w) : [0, 0, 0];
  return { f, r, u, cam: T.map((t, i) => t - f[i] * dist), dist, T };
}
const lift = (v3) => [0, 1, 2, 3].map((i) => v3[0] * E[0][i] + v3[1] * E[1][i] + v3[2] * E[2][i]);
const origin = () => E[3].map((x) => x * off);

// ------------------------------------------------------------------ colours
const NGON = { 3: [0.44, 0.84, 1.0], 4: [1.0, 0.8, 0.42], 5: [1.0, 0.5, 0.74], 6: [0.7, 0.56, 1.0], 8: [0.5, 0.88, 0.55], 10: [1.0, 0.6, 0.32] };
const NAME = { 3: 'triangles', 4: 'squares', 5: 'pentagons', 6: 'hexagons', 8: 'octagons', 10: 'decagons' };
const CELL = { tetrahedron: [0.44, 0.84, 1.0], icosahedron: [1.0, 0.8, 0.42], cap: [0.92, 0.9, 0.86] };
function cellColour(c) {
  if (CELL[c.kind]) return CELL[c.kind];
  const n = parseInt(c.kind, 10);
  if (c.kind.endsWith('prism')) return NGON[n] ? NGON[n].map((x) => x * 0.8 + 0.1) : [0.8, 0.8, 0.8];
  if (c.kind.endsWith('bipyramid')) return [0.7, 0.56, 1.0];
  return NGON[n] || [0.8, 0.8, 0.8];
}
const hex = (c) => `rgb(${c.map((x) => Math.round(x * 255)).join(',')})`;

// ------------------------------------------------------------------ GL
const VS = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm; layout(location=2) in vec3 col;
uniform mat4 M; uniform float psize;
out vec3 vN; out vec3 vC; out vec3 vP;
void main() { vN = nrm; vC = col; vP = pos; gl_Position = M * vec4(pos, 1.0); gl_PointSize = psize; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vC; in vec3 vP; out vec4 o;
uniform vec3 eye; uniform int lit; uniform int round_;
void main() {
  if (round_ == 1) { vec2 q = gl_PointCoord * 2.0 - 1.0; if (dot(q, q) > 1.0) discard; }
  if (lit == 0) { o = vec4(vC, 1.0); return; }
  vec3 n = normalize(vN), v = normalize(eye - vP);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l1 = normalize(vec3(0.5, 0.8, 0.6)), l2 = normalize(vec3(-0.6, 0.2, -0.5));
  float d = 0.28 + 0.62 * max(dot(n, l1), 0.0) + 0.22 * max(dot(n, l2), 0.0);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.25;
  o = vec4(vC * d + rim, 1.0);
}`;
function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
const U = { M: gl.getUniformLocation(prog, 'M'), eye: gl.getUniformLocation(prog, 'eye'), lit: gl.getUniformLocation(prog, 'lit'), psize: gl.getUniformLocation(prog, 'psize'), round_: gl.getUniformLocation(prog, 'round_') };
function makeBuf() {
  const vao = gl.createVertexArray(), b = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); }
  return { vao, b, n: 0, set(arr) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW); this.n = arr.length / 9; } };
}
const TRI = makeBuf(), LIN = makeBuf(), PTS = makeBuf();
gl.enable(gl.DEPTH_TEST);

// ------------------------------------------------------------------ the scene: build triangles, lines, points
let pickable = [];      // shadow vertices for tapping: { p:[x,y,z], i }
function build() {
  const tri = [], lin = [], pts = []; pickable = [];
  const T = (a, b, c, n, col) => { for (const p of [a, b, c]) tri.push(...p, ...n, ...col); };
  const L = (a, b, col) => { lin.push(...a, 0, 0, 0, ...col, ...b, 0, 0, 0, ...col); };
  if (S.mode === 'seat') {
    buildSeat(T, L);
  } else if (S.mode === '92') {
    const s = JOHNSON[S.j - 1];
    S.R = Math.max(...s.V.map((v) => Math.hypot(...v)));
    for (const f of P.orient(s.V, s.F)) {
      const pts3 = f.map((i) => s.V[i]), n = nrm3(pts3), col = NGON[f.length];
      for (let i = 1; i + 1 < f.length; i++) T(pts3[0], pts3[i], pts3[i + 1], n, col);
    }
    for (const [a, b] of P.edges3(s.F)) L(s.V[a], s.V[b], [0.06, 0.06, 0.09]);
  } else {
    const poly = S.poly;
    S.R = Math.max(...poly.V.map((v) => Math.hypot(...v))) * (S.view === 'shadow' ? 1.25 : 1);
    if (S.view === 'slice') {
      const faces = P.slice(poly, origin(), E.slice(0, 3), S.R * 2 + 2);
      S.sliceFaces = faces.length;
      for (const f of faces) {
        const c = poly.cells[f.cell], lean = dot4(c.n, E[3]);
        let col = cellColour(c);
        const tint = Math.min(1, Math.abs(lean) * 1.4);
        if (lean < -0.05) col = col.map((x, i) => x * (1 - 0.6 * tint) + [0.22, 0.95, 0.88][i] * 0.6 * tint);     // grows as you go ana
        else if (lean > 0.05) col = col.map((x, i) => x * (1 - 0.6 * tint) + [1.0, 0.4, 0.72][i] * 0.6 * tint);
        const n = nrm3(f.pts);
        for (let i = 1; i + 1 < f.pts.length; i++) T(f.pts[0], f.pts[i], f.pts[i + 1], n, col);
        for (let i = 0; i < f.pts.length; i++) L(f.pts[i], f.pts[(i + 1) % f.pts.length], [0.05, 0.05, 0.08]);
      }
      // the atlas in slice view: the 600-cell's vertices within half an edge of your slice, at where they project into
      // it, to tap (gold cut, white cuttable, tinted teal ana / rose kata by their side, dim if a neighbour is cut)
      if (S.mode === '600') {
        const H = P.h600(), O = origin(), blocked = new Set(); for (const c of S.cut) for (const u of H.A[c]) blocked.add(u);
        H.V.forEach((v, i) => {
          const d = P.sub(v, O), w = dot4(d, E[3]);
          if (Math.abs(w) > 0.5) return;
          const p3 = [dot4(d, E[0]), dot4(d, E[1]), dot4(d, E[2])], t = Math.min(1, Math.abs(w) / 0.5);
          let col = S.cut.has(i) ? [1.0, 0.8, 0.4] : S.hot && S.hot.has(i) ? [1.0, 0.35, 0.9] : blocked.has(i) ? [0.32, 0.32, 0.36] : [0.97, 0.97, 0.97];
          if (!S.cut.has(i) && !blocked.has(i) && !(S.hot && S.hot.has(i))) col = col.map((x, k) => x * (1 - 0.6 * t) + (w > 0 ? [0.22, 0.95, 0.88] : [1.0, 0.4, 0.72])[k] * 0.6 * t);
          pts.push(...p3, 0, 0, 0, ...col); pickable.push({ p: p3, i });
        });
      }
    } else {
      const sh = P.shadow(poly, origin(), E, S.R * 2.2);
      const wcol = (w) => { const t = Math.max(-1, Math.min(1, w / S.R)); return t > 0 ? [0.85 - 0.6 * t, 0.85 + 0.1 * t, 0.85 + 0.03 * t] : [0.85 + 0.15 * -t, 0.85 - 0.45 * -t, 0.85 - 0.13 * -t]; };
      const gold = new Set();
      if (poly.ico) for (const [a, b] of poly.icoEdges) gold.add(`${a},${b}`);
      for (const [a, b] of poly.E) { const isG = gold.has(`${a},${b}`) || gold.has(`${b},${a}`); L(sh[a].p, sh[b].p, isG ? [1.0, 0.8, 0.4] : wcol((sh[a].w + sh[b].w) / 2)); }
      if (S.mode === '600') {
        const H = P.h600(), shH = P.shadow({ V: H.V }, origin(), E, S.R * 2.2);
        // gold: cut; bright: the next cut you're pointing at; white: could be cut; dim: blocked (next to a cut)
        const blocked = new Set(); for (const c of S.cut) for (const u of H.A[c]) blocked.add(u);
        H.V.forEach((_, i) => {
          const col = S.cut.has(i) ? [1.0, 0.8, 0.4] : S.hot && S.hot.has(i) ? [1.0, 0.35, 0.9] : blocked.has(i) ? [0.28, 0.28, 0.32] : [0.95, 0.95, 0.95];
          if (!S.cut.has(i) && !blocked.has(i) && !(S.hot && S.hot.has(i))) col.forEach((x, k) => { col[k] = x * 0.55 + wcol(shH[i].w)[k] * 0.45; });
          pts.push(...shH[i].p, 0, 0, 0, ...col); pickable.push({ p: shH[i].p, i });
        });
      }
    }
  }
  TRI.set(tri); LIN.set(lin); PTS.set(pts);
}
/** The seat: the snub dodecahedron (scaled so its edge is K), each face in its family's colour, and on each face its
 *  Johnson solid in miniature, standing on it; the chosen one flies out and grows. */
const K = 1, SNUB_R = Math.max(...SNUB.V.map((v) => Math.hypot(...v)));
const FACE = SNUB.F.map((f) => {
  const P3 = f.map((i) => SNUB.V[i]), c = [0, 1, 2].map((k) => P3.reduce((s, p) => s + p[k], 0) / P3.length);
  let n = nrm3(P3); if (P.dot(n, c) < 0) n = n.map((x) => -x);
  const u = P.unit(P.sub(P3[0], c)), v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const inr = Math.min(...P3.map((p, i) => { const q = P3[(i + 1) % P3.length], d = P.sub(q, p), t = P.dot(P.sub(c, p), d) / P.dot(d, d); return Math.hypot(...P.sub(c, P.add(p, d, t))); }));
  return { c, n, u, v, inr };
});
const RADIUS = JOHNSON.map((s) => Math.max(...s.V.map((v) => Math.hypot(...v))));
function buildSeat(T, L) {
  const mir = (p) => (S.mirror ? [-p[0], p[1], p[2]] : p);
  S.R = SNUB_R * K * 1.05;
  SNUB.F.forEach((f, i) => {
    const fam = familyOf(SEAT[i]), lit = S.famHi === fam ? 1.7 : S.famHi < 0 ? 1 : 0.35, out = S.seatSel >= 0 ? 0.6 : 1;
    const col = FAMILIES[fam].col.map((x) => x * 0.42 * lit * out + 0.04), P3 = f.map((k) => mir(SNUB.V[k].map((x) => x * K))), n = mir(FACE[i].n);
    for (let a = 1; a + 1 < f.length; a++) T(P3[0], P3[a], P3[a + 1], n, col);
    for (let a = 0; a < f.length; a++) L(P3[a], P3[(a + 1) % f.length], [0.02, 0.02, 0.03]);
  });
  SNUB.F.forEach((_, i) => {
    const j = SEAT[i], s = JOHNSON[j - 1], F = FACE[i], fam = familyOf(j);
    if (S.famHi >= 0 && S.famHi !== fam && i !== S.seatSel) return;
    // seated: circumradius 0.72 of the face's inradius, standing just off the face; flying: out along the normal, growing
    const t = i === S.seatSel ? ease(S.seatT) : 0;
    const seated = F.inr * (SNUB.F[i].length === 5 ? 0.5 : 0.66), rad = seated * (1 - t) + 0.55 * t, k = (rad / RADIUS[j - 1]) * K;
    const at = P.add(F.c.map((x) => x * K), F.n, (rad + 0.02) * (1 - t) + 1.3 * t);
    // out of its seat it turns (about the face's normal and tipped toward you), so its shape reads in 3D
    // seated, its axes are the face's (u, v, n); summoned, they're S.Q, which turns idly until you drag it yourself
    const [qu, qv, qn] = i === S.seatSel && S.Q ? S.Q : [F.u, F.v, F.n];
    const place = (p) => mir(P.add(P.add(P.add(at, qu, p[0] * k), qv, p[1] * k), qn, p[2] * k));
    if (i === S.seatSel) S.summonAt = mir(at);
    const W = s.V.map(place);
    for (const f of P.orient(s.V, s.F)) {
      const pts = f.map((q) => W[q]), n = nrm3(pts), col = NGON[f.length];
      for (let a = 1; a + 1 < f.length; a++) T(pts[0], pts[a], pts[a + 1], n, col);
    }
    if (i === S.seatSel) for (const [a, b] of P.edges3(s.F)) L(W[a], W[b], [0.06, 0.06, 0.09]);
  });
}
const ease = (x) => x * x * (3 - 2 * x);
function nrm3(p) { const a = P.sub(p[1], p[0]), b = P.sub(p[2], p[0]); const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const l = Math.hypot(...n) || 1; return n.map((x) => x / l); }

// ------------------------------------------------------------------ matrices
function matrix(v, aspect) {
  const near = 0.05, far = 100, f = 1 / Math.tan((50 * Math.PI) / 360);
  const z = v.f.map((x) => -x), x = v.r, y = v.u, e = v.cam;
  const Vm = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -P.dot(x, e), -P.dot(y, e), -P.dot(z, e), 1];
  const Pm = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += Pm[k * 4 + r] * Vm[c * 4 + k];
  return out;
}
function project(M, p, W, H) {
  const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
  return { x: (x / w * 0.5 + 0.5) * W, y: (1 - (y / w * 0.5 + 0.5)) * H, w };
}

// ------------------------------------------------------------------ draw
let needBuild = true, lastM = null;
function draw() {
  if (needBuild) { build(); needBuild = false; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale, w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.027, 0.031, 0.047, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(prog);
  const v = view(), M = matrix(v, w / h); lastM = M;
  gl.uniformMatrix4fv(U.M, false, M); gl.uniform3fv(U.eye, v.cam); gl.uniform1f(U.psize, 7 * dpr); gl.uniform1i(U.round_, 0);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
  gl.uniform1i(U.lit, 1); gl.bindVertexArray(TRI.vao); gl.drawArrays(gl.TRIANGLES, 0, TRI.n);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.uniform1i(U.lit, 0); gl.bindVertexArray(LIN.vao); gl.drawArrays(gl.LINES, 0, LIN.n);
  if (PTS.n) { gl.disable(gl.DEPTH_TEST); gl.uniform1i(U.round_, 1); gl.bindVertexArray(PTS.vao); gl.drawArrays(gl.POINTS, 0, PTS.n); gl.enable(gl.DEPTH_TEST); }   // vertices on top: tappable even inside the solid
  overlay(v);
}
/** J-numbers on the seats facing you. */
function seatLabels(v, w, h) {
  if (!lastM || S.seatSel >= 0) return;            // a summoned solid has the stage to itself
  octx.font = '600 10px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
  SNUB.F.forEach((_, i) => {
    if (i === S.seatSel && S.seatT > 0.05) return;
    const F = FACE[i], c = S.mirror ? [-F.c[0], F.c[1], F.c[2]] : F.c, n = S.mirror ? [-F.n[0], F.n[1], F.n[2]] : F.n;
    if (P.dot(n, P.sub(v.cam, c)) <= 0.2) return;
    const fam = familyOf(SEAT[i]); if (S.famHi >= 0 && S.famHi !== fam) return;
    const q = project(lastM, P.add(c, n, F.inr * 1.5 + 0.05), w, h);
    if (q.w <= 0) return;
    octx.fillStyle = 'rgba(7,8,12,0.55)'; octx.fillRect(q.x - 12, q.y - 7, 24, 13);
    octx.fillStyle = hex(FAMILIES[fam].col); octx.fillText(`J${SEAT[i]}`, q.x, q.y);
  });
}
const AX = [['x', '#e9e4da'], ['y', '#e9e4da'], ['z', '#e9e4da'], ['w', '#ffd27a']];
function overlay(v) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, w, h);
  if (S.mode === 'seat') { seatLabels(v, w, h); return; }
  if (S.mode === '92') return;
  // CAD⁴'s axes: where x, y, z and w lie in your slice (shorter the more they lean out of it)
  const cx = w - 52, cy = 96, L = 34; octx.lineWidth = 1.6; octx.font = '600 11px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
  const items = AX.map(([name, colr], a) => { const s3 = [E[0][a], E[1][a], E[2][a]], len = Math.hypot(...s3); return { name, colr, len, x: P.dot(s3, v.r), y: P.dot(s3, v.u), z: -P.dot(s3, v.f) }; }).sort((a, b) => a.z - b.z);
  for (const it of items) { if (it.len < 0.04) continue; octx.globalAlpha = 0.35 + 0.65 * it.len; octx.strokeStyle = octx.fillStyle = it.colr; octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(cx + it.x * L, cy - it.y * L); octx.stroke(); octx.fillText(it.name, cx + it.x * (L + 9), cy - it.y * (L + 9)); }
  octx.globalAlpha = 1; octx.fillStyle = '#9a958c';
  const n = E[3], main = n.findIndex((x) => Math.abs(x) > 0.9995), f2 = (x) => (Math.abs(x) < 0.005 ? '0' : x.toFixed(2));
  const txt = S.view === 'shadow' ? `shadow, from an eye ${S.view === 'shadow' ? 'out along ' + (main >= 0 ? 'xyzw'[main] : 'your w') : ''}` : main >= 0 ? `slice: ${'xyzw'[main]} = ${f2(off * Math.sign(n[main]))}` : `slice ⟂ (${n.map(f2).join(', ')}) at ${f2(off)}`;
  octx.fillText(txt, w / 2, h - 14);
  if (S.view === 'slice' && S.sliceFaces === 0) { octx.fillStyle = '#9a958c'; octx.fillText('your slice misses it', w / 2, h / 2); }
}

// ------------------------------------------------------------------ the objects
const FAMILY = [[1, 6, 'pyramids, cupolae and the rotunda'], [7, 17, 'elongated and gyroelongated pyramids and bipyramids'], [18, 25, 'elongated and gyroelongated cupolae and rotundas'], [26, 48, 'bicupolae, cupolarotundas, birotundas'], [49, 57, 'augmented prisms'], [58, 64, 'augmented dodecahedra, diminished icosahedra'], [65, 71, 'augmented truncated solids'], [72, 83, 'gyrate and diminished rhombicosidodecahedra'], [84, 92, 'the elementary ones']];
const family = (j) => FAMILY.find(([a, b]) => j >= a && j <= b)[2];
const OBJ = {
  prism: { label: (s) => `prism over J${s.j}`, make: (s) => P.prism(s), note: 'Two copies of the solid, one ana and one kata, joined by a prism over every face: every 2D face regular (CRF), cells include the Johnson solid itself.' },
  pyramid: { label: (s) => `pyramid over J${s.j}`, make: (s) => P.pyramid(s), ok: (s) => !!P.pyramid(s), note: 'An apex out in w, one edge from every vertex: possible only when the solid has a circumsphere of radius under one edge. Of the 92 only J1, J2, J11, J62, J63.' },
  bipyramid: { label: (s) => `bipyramid over J${s.j}`, make: (s) => P.pyramid(s, true), ok: (s) => !!P.pyramid(s, true), note: 'Apexes both ana and kata: needs the circumcentre inside the solid too (not J2). Over J1 the square\'s two cells fuse into an octahedron: it is the octahedral pyramid.' },
  'tet-pyr': { label: () => 'tetrahedral pyramid = the 5-cell', make: () => P.pyramid(P.platonic('tetrahedron')), blind: true },
  'oct-pyr': { label: () => 'octahedral pyramid', make: () => P.pyramid(P.platonic('octahedron')), blind: true },
  'oct-bip': { label: () => 'octahedral bipyramid = the 16-cell', make: () => P.pyramid(P.platonic('octahedron'), true), blind: true },
  'ico-pyr': { label: () => 'icosahedral pyramid', make: () => P.pyramid(P.platonic('icosahedron')), blind: true },
  'ico-bip': { label: () => 'icosahedral bipyramid', make: () => P.pyramid(P.platonic('icosahedron'), true), blind: true },
  'cube-pyr': { label: () => 'cubic pyramid (CRF, not Blind: its cells are square pyramids)', make: () => P.pyramid(P.platonic('cube')) },
  'snub24': { label: () => 'the snub 24-cell (the 600-cell, 24 vertices cut)', make: () => withIco(P.diminished(P.SNUB24), P.SNUB24), blind: true },
  '600': { label: () => 'the 600-cell', make: () => P.diminished([]), blind: true },
};
function withIco(poly, cut) {
  // the icosahedra's edges (between neighbours of a cut vertex), in the diminished polytope's numbering, drawn gold
  const H = P.h600(), keep = new Map(); let n = 0;
  H.V.forEach((_, i) => { if (!new Set(cut).has(i)) keep.set(i, n++); });
  poly.ico = true; poly.icoEdges = [];
  for (const c of cut) { const nb = [...H.A[c]]; for (const a of nb) for (const b of nb) if (a < b && H.A[a].has(b)) poly.icoEdges.push([keep.get(a), keep.get(b)]); }
  return poly;
}

// ------------------------------------------------------------------ choosing
function setMode(m) {
  S.mode = m; document.body.classList.toggle('is4', m === '4d' || m === '600'); document.body.classList.toggle('isSeat', m === 'seat');
  $('seatSec').hidden = m !== 'seat'; if (m === 'seat') { S.spin = true; $('spinB').classList.add('on'); legend(); }
  for (const b of $('mode').children) b.classList.toggle('on', b.dataset.v === m);
  $('pick').hidden = m === '600' || m === 'seat'; $('prev').hidden = $('next').hidden = m !== '92';
  $('dimSec').hidden = m !== '600'; $('kitSec').hidden = m !== '4d';
  if (m === '600') { S.view = 'shadow'; }
  fillPick(); choose(); squareUp(true);
}
function fillPick() {
  const sel = $('pick'); sel.textContent = '';
  if (S.mode === '92') {
    for (const [a, b, title] of FAMILY) { const g = document.createElement('optgroup'); g.label = title; for (let j = a; j <= b; j++) { const o = document.createElement('option'); o.value = j; o.textContent = `J${j} ${JOHNSON[j - 1].name}`; g.append(o); } sel.append(g); }
    sel.value = S.j;
  } else if (S.mode === '4d') {
    const s = JOHNSON[S.j - 1], g1 = document.createElement('optgroup'), g2 = document.createElement('optgroup');
    g1.label = `over J${S.j} ${s.name}`; g2.label = 'Blind polytopes (every cell regular) and friends';
    for (const k of ['prism', 'pyramid', 'bipyramid']) { const o = document.createElement('option'); o.value = k; o.textContent = OBJ[k].label(s) + (OBJ[k].ok && !OBJ[k].ok(s) ? ' (impossible)' : ''); o.disabled = !!(OBJ[k].ok && !OBJ[k].ok(s)); g1.append(o); }
    for (const k of ['tet-pyr', 'oct-pyr', 'oct-bip', 'ico-pyr', 'ico-bip', 'cube-pyr', '600', 'snub24']) { const o = document.createElement('option'); o.value = k; o.textContent = OBJ[k].label(s); g2.append(o); }
    sel.append(g1, g2); if (OBJ[S.obj].ok && !OBJ[S.obj].ok(s)) S.obj = 'prism'; sel.value = S.obj;
  }
}
function choose() {
  if (S.mode === '4d') { const s = JOHNSON[S.j - 1]; S.poly = OBJ[S.obj].make(s); if (S.obj === '600') withIco(S.poly, []); }
  else if (S.mode === '600') S.poly = withIco(P.diminished([...S.cut]), [...S.cut]);
  for (const b of $('view').children) b.classList.toggle('on', b.dataset.v === S.view);
  needBuild = true; dirty = true; info();
}
function squareUp(resetZoom) { E = ident(); off = 0; if (resetZoom) zoom = 1; needBuild = true; dirty = true; }
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }

// ------------------------------------------------------------------ the panel
function rows(el, list) { el.textContent = ''; for (const [k, v] of list) { const a = document.createElement('i'), b = document.createElement('span'); a.textContent = k; b.textContent = v; el.append(a, b); } }
function info() {
  const chips = $('chips'); chips.textContent = '';
  const chip = (col, text) => { const s = document.createElement('span'), i = document.createElement('i'); i.style.background = hex(col); s.append(i, text); chips.append(s); };
  if (S.mode === 'seat' && S.seatSel < 0) {
    $('title').textContent = 'the seat: the snub dodecahedron';
    rows($('facts'), [['faces', '92: 12 pentagons, 80 triangles'], ['vertices · edges', '60 · 150'], ['handedness', S.mirror ? 'dextro (mirrored)' : 'laevo'], ['the most faces any Johnson solid has', '62 (J71–J75)']]);
    $('cap').textContent = 'The snub dodecahedron, the one solid with 92 faces: every Johnson solid has a seat. Families sit together; the 12 pentagons hold the rhombicosidodecahedron\'s 12. Tap a seat to bring its solid out.';
    return;
  }
  if (S.mode === '92' || S.mode === 'seat') {
    if (S.mode === 'seat') S.j = SEAT[S.seatSel];
    const s = JOHNSON[S.j - 1], E3 = P.edges3(s.F), counts = {};
    for (const f of s.F) counts[f.length] = (counts[f.length] || 0) + 1;
    const cs = P.circumsphere(s.V), vol = P.volume3(s.V, P.orient(s.V, s.F));
    $('title').textContent = `J${s.j} · ${s.name}`;
    rows($('facts'), [['family', family(s.j)], ['vertices · edges · faces', `${s.V.length} · ${E3.length} · ${s.F.length}`], ['volume (edge 1)', vol.toFixed(6)], ['circumsphere', cs ? `radius ${cs.r.toFixed(4)}` : 'none: its vertices aren\'t on one sphere'], ['in 4D', [P.pyramid(s) ? 'a pyramid' : null, P.pyramid(s, true) ? 'a bipyramid' : null, 'a prism'].filter(Boolean).join(', ')]]);
    for (const n of Object.keys(counts).map(Number).sort((a, b) => a - b)) chip(NGON[n], `${counts[n]} ${NAME[n]}`);
    $('cap').textContent = S.mode === 'seat' ? `J${s.j}, the ${s.name.toLowerCase()}, out of its seat (a ${SNUB.F[S.seatSel].length === 5 ? 'pentagon' : 'triangle'} in the ${family(s.j)}). Tap it, or anywhere off it, to send it home.` : `J${s.j}, the ${s.name.toLowerCase()}: ${family(s.j)}. Every face regular, every edge the same length. Drag to turn it, pinch or scroll to zoom; ‹ › or , . for the next.`;
  } else {
    const poly = S.poly, c = P.check4(poly), kinds = {};
    for (const cl of poly.cells) kinds[cl.kind] = (kinds[cl.kind] || 0) + 1;
    const label = S.mode === '600' ? (S.cut.size ? `the 600-cell, ${S.cut.size} cut` : 'the 600-cell') : OBJ[S.obj].label(JOHNSON[S.j - 1]);
    $('title').textContent = label;
    rows($('facts'), [['vertices · edges · faces · cells', `${c.V} · ${c.E} · ${c.F} · ${c.C}`], ['Euler V − E + F − C', String(c.euler)], ['convex, every edge 1', c.outside < 1e-9 && c.edge < 1e-9 ? 'yes (checked)' : 'NO'], ['class', S.mode === '600' || OBJ[S.obj]?.blind ? 'Blind: every cell regular' : 'CRF: every 2D face regular']]);
    const plural = (k, n) => (k === 'cap' ? (S.obj === 'prism' ? `copies of J${S.j}` : 'base') : n === 1 ? k : k === 'tetrahedron' ? 'tetrahedra' : k === 'icosahedron' ? 'icosahedra' : `${k}s`);
    for (const [k, n] of Object.entries(kinds)) chip(cellColour({ kind: k }), `${n} ${plural(k, n)}`);
    if (S.mode === '4d') { $('kitNote').textContent = OBJ[S.obj].note || ''; kitButtons(); }
    if (S.mode === '600') atlasPanel();
    $('cap').textContent = S.mode === '600'
      ? (S.view === 'slice' ? 'Your slice of it: tetrahedra blue, icosahedra gold. The dots are the vertices within half an edge of your slice (teal ana of it, rose kata): tap one to cut it; move the slice with the lever to reach others.' : 'The 600-cell: 600 tetrahedra, 5 round every edge. Tap a vertex in the shadow to cut it off; gold edges are the icosahedra the cuts leave. Drag to turn, pad and lever to turn and move through w.')
      : `${label}. ${S.view === 'slice' ? 'Your 3D slice: each face is a cell cut through, coloured by the cell, teal where the cell leans ana, rose kata.' : 'Its shadow: every edge, projected from an eye in w; teal ana, rose kata.'} Twist the slice with the pad, move it with the lever.`;
  }
}
// ------------------------------------------------------------------ the atlas
// where you are among the diminished 600-cells (your cut up to the 14,400 symmetries), the census chart with your walk,
// and the genuinely different next cuts
const fmtN = (n) => n.toLocaleString('en-US');
const ANG = (a, b) => Math.round((Math.acos(Math.max(-1, Math.min(1, P.dot(AT.group().Q[a], AT.group().Q[b])))) * 180) / Math.PI);
let NEXT = [];
function atlasPanel() {
  $('aTotal').textContent = fmtN(TOTAL - 1);
  const cut = [...S.cut], k = cut.length, stab = AT.stabilizer(cut).length, ways = 14400 / stab;
  const key = AT.canonical(cut), tag = fingerprint(key);
  rows($('here'), [
    ['cut', `${k} of the 120 vertices`],
    ['cells', `${600 - 20 * k} tetrahedra · ${k} icosahedr${k === 1 ? 'on' : 'a'}`],
    ['shapes with this many cuts', fmtN(CENSUS[k] || 0)],
    ['this one', k ? `#${tag}${k === 24 ? ' · the snub 24-cell' : ''}` : 'the uncut 600-cell'],
    ['symmetries it keeps', `${fmtN(stab)} of 14,400`],
    ['cuts that make this same shape', fmtN(ways)],
  ]);
  NEXT = AT.nextCuts(cut);
  $('nextN').textContent = NEXT.length ? `· ${NEXT.length} genuinely different` : '';
  const el = $('nextCuts'); el.textContent = '';
  if (!NEXT.length) { const d = document.createElement('div'); d.className = 'end'; d.textContent = k ? `the end of this walk: every vertex left touches a cut. ${k === 24 ? 'You are at the snub 24-cell, the only shape with 24 cuts.' : `A maximal cut with ${k}.`}` : ''; el.append(d); }
  for (const c of NEXT) {
    const b = document.createElement('button'), sm = document.createElement('small');
    const angs = k ? cut.map((x) => ANG(x, c.v)).sort((a, z) => a - z) : [];
    const tally = []; for (const a of angs) { const t = tally.find((x) => x[0] === a); if (t) t[1]++; else tally.push([a, 1]); }
    b.textContent = k ? tally.map(([a, n]) => `${a}°${n > 1 ? '×' + n : ''}`).join(' · ') : 'any vertex (they are all alike)';
    sm.textContent = `${c.count} ${c.count === 1 ? 'vertex' : 'vertices'} · keeps ${fmtN(c.stab)} symmetr${c.stab === 1 ? 'y' : 'ies'}`;
    b.append(sm);
    const orbit = () => { const st = AT.stabilizer(cut), g = AT.group(), o = new Set(); for (const x of st) o.add(g.perms[x * 120 + c.v]); return o; };
    b.onpointerenter = () => { S.hot = orbit(); needBuild = true; dirty = true; };
    b.onpointerleave = () => { S.hot = null; needBuild = true; dirty = true; };
    b.onclick = () => { stopWalk(); cutVertex(c.v); };
    el.append(b);
  }
  chart();
}
/** A short name for a shape: a hash of its canonical form (the same shape always gets the same name). */
function fingerprint(key) { let h = 2166136261; for (const v of key) { h ^= v + 1; h = Math.imul(h, 16777619) >>> 0; } return h.toString(36).toUpperCase().padStart(7, '0').slice(-6); }
function cutVertex(v) { S.trail.push([...S.cut]); S.cut.add(v); S.hot = null; choose(); }
function stopWalk() { if (S.walking) { clearInterval(S.walking); S.walking = null; } }
function walk(pick) {
  stopWalk();
  S.walking = setInterval(() => { if (!NEXT.length) { stopWalk(); toast(`the end: ${S.cut.size} cut, nothing more can be`); return; } cutVertex(pick(NEXT).v); }, 450);
}
/** The census, log scale: a bar for each number of cuts; your walk's steps lit, where you are in gold. */
function chart() {
  const cv = $('chart'), dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, Hh = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, Hh);
  const n = 25, bw = (W - 16) / n, top = Math.log10(Math.max(...CENSUS)), y0 = Hh - 16, k = S.cut.size;
  c.font = '9px ui-monospace, Menlo, monospace'; c.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const v = CENSUS[i], h = v ? ((Math.log10(v) + 0.3) / (top + 0.3)) * (y0 - 14) : 0, x = 8 + i * bw;
    c.fillStyle = i === k ? '#ffd27a' : i < k ? 'rgba(255,210,122,0.45)' : 'rgba(111,224,255,0.35)';
    c.fillRect(x + 1, y0 - h, bw - 2, h);
    if (i % 4 === 0 || i === k) { c.fillStyle = i === k ? '#ffd27a' : '#9a958c'; c.fillText(String(i), x + bw / 2, Hh - 4); }
  }
  const x = 8 + k * bw + bw / 2;
  c.fillStyle = '#ffd27a'; c.fillText(fmtN(CENSUS[k]), Math.min(W - 30, Math.max(30, x)), 10);
}
function kitButtons() {
  const k = $('kit'); k.textContent = '';
  for (const [v, t] of [['slice', 'slice'], ['shadow', 'shadow']]) { const b = document.createElement('button'); b.textContent = t; b.classList.toggle('on', S.view === v); b.onclick = () => { S.view = v; choose(); }; k.append(b); }
}

// ------------------------------------------------------------------ controls (CAD⁴'s)
{
  const pts = new Map(); let pinch = 0, moved = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; moved = 0; $('cap').classList.add('min'); });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) {
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; moved += Math.abs(dx) + Math.abs(dy);
      if (S.mode === 'seat' && S.seatSel >= 0 && !S.seatGoing && moved >= 6) turnSummoned(dx, dy);   // drag turns the summoned solid
      else if (!(S.mode === 'seat' && S.seatSel >= 0)) { yaw -= dx * 0.008; pitch = Math.max(-1.5, Math.min(1.5, pitch + dy * 0.008)); }
      dirty = true;
    }
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { moved += 99; const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { zoom = Math.max(0.3, Math.min(8, (zoom * d) / pinch)); dirty = true; } pinch = d; }
  });
  const up = (e) => { if (pts.size === 1 && moved < 6) { if (S.mode === '600') tap(e); else if (S.mode === 'seat') seatTap(e); } pts.delete(e.pointerId); pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = 0; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.3, Math.min(8, zoom * Math.exp(-e.deltaY * 0.0015))); dirty = true; }, { passive: false });
}
/** Tap a vertex of the 600-cell's shadow: cut it, or uncut it; refuse a neighbour of one already cut. */
function tap(e) {
  if (!lastM) return;
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  let best = null, bd = 18;
  for (const q of pickable) { const s = project(lastM, q.p, r.width, r.height); if (s.w <= 0) continue; const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = q; } }
  if (!best) return;
  const H = P.h600(), i = best.i;
  stopWalk();
  if (S.cut.has(i)) { S.trail.push([...S.cut]); S.cut.delete(i); toast(`vertex ${i} back: its 20 tetrahedra return`); }
  else if ([...S.cut].some((c) => H.A[c].has(i))) { toast('a neighbour of that vertex is already cut: cutting both would cut through their edge'); return; }
  else { S.trail.push([...S.cut]); S.cut.add(i); toast(`cut vertex ${i}: 20 tetrahedra become an icosahedron`); }
  choose();
}
/** Tap a seat (the nearest face facing you whose outline holds the tap): its solid flies out; tap again, it goes home. */
function seatTap(e) {
  if (!lastM) return;
  const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, v = view();
  if (S.seatSel >= 0) { S.seatGoing = true; S.zoomAway = zoom; return; }
  let best = -1, bz = Infinity;
  SNUB.F.forEach((f, i) => {
    const F = FACE[i], c = S.mirror ? [-F.c[0], F.c[1], F.c[2]] : F.c, n = S.mirror ? [-F.n[0], F.n[1], F.n[2]] : F.n;
    if (P.dot(n, P.sub(v.cam, c)) <= 0) return;
    const poly = f.map((k) => { const p = SNUB.V[k]; return project(lastM, S.mirror ? [-p[0], p[1], p[2]] : p, r.width, r.height); });
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) if ((poly[a].y > y) !== (poly[b].y > y) && x < ((poly[b].x - poly[a].x) * (y - poly[a].y)) / (poly[b].y - poly[a].y) + poly[a].x) inside = !inside;
    const z = P.dot(P.sub(c, v.cam), v.f);
    if (inside && z < bz) { bz = z; best = i; }
  });
  if (best < 0) return;
  if (S.famHi >= 0 && S.famHi !== familyOf(SEAT[best])) return;
  S.seatSel = best; S.seatT = 0; S.seatGoing = false; S.spin = false; $('spinB').classList.remove('on');
  S.Q = [FACE[best].u, FACE[best].v, FACE[best].n]; S.touched = false; S.zoomBefore = zoom;
  info();
}
/** Rotate a vector about a unit axis by th (Rodrigues). */
function rodrigues(v, a, th) {
  const c = Math.cos(th), s = Math.sin(th), d = P.dot(a, v), x = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]];
  return v.map((vi, i) => vi * c + x[i] * s + a[i] * d * (1 - c));
}
/** Drag the summoned solid: sideways turns it about the screen's up, up-down about the screen's right (as if you'd
 *  grabbed it). In the mirrored world the axes are mirrored and the turns reversed. */
function turnSummoned(dx, dy) {
  const v = view(), m = (a) => (S.mirror ? [-a[0], a[1], a[2]] : a), sg = S.mirror ? -1 : 1;
  S.touched = true;
  S.Q = S.Q.map((q) => rodrigues(rodrigues(q, m(v.u), sg * dx * 0.01), m(v.r), sg * dy * 0.01));
  needBuild = true;
}
function legend() {
  const el = $('legend'); el.textContent = '';
  FAMILIES.forEach((f, i) => {
    const b = document.createElement('button'), sw = document.createElement('i'), em = document.createElement('em');
    sw.style.background = hex(f.col); em.textContent = `J${f.a}–J${f.b} · ${f.b - f.a + 1}`;
    b.append(sw, f.name, em); b.classList.toggle('on', S.famHi === i);
    b.onclick = () => { S.famHi = S.famHi === i ? -1 : i; legend(); needBuild = true; dirty = true; };
    el.append(b);
  });
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
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    if (e.key === ',' || e.key === '<') step(-1); else if (e.key === '.' || e.key === '>') step(1); else keys.add(e.key);
    if (e.key.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.key));
}
function step(d) { if (S.mode !== '92') return; S.j = ((S.j - 1 + d + 92) % 92) + 1; $('pick').value = S.j; choose(); }
for (const b of $('mode').children) b.addEventListener('click', () => setMode(b.dataset.v));
for (const b of $('view').children) b.addEventListener('click', () => { S.view = b.dataset.v; choose(); });
$('pick').addEventListener('change', () => { if (S.mode === '92') S.j = +$('pick').value; else S.obj = $('pick').value; choose(); history.replaceState(null, '', `#${S.mode === '92' ? 'J' + S.j : S.obj}`); });
$('prev').onclick = () => step(-1); $('next').onclick = () => step(1);
$('squareB').onclick = () => squareUp(false);
$('mirrorB').onclick = () => { S.mirror = !S.mirror; $('mirrorB').classList.toggle('on', S.mirror); needBuild = true; dirty = true; info(); };
$('spinB').onclick = () => { S.spin = !S.spin; $('spinB').classList.toggle('on', S.spin); };
$('cap').onclick = () => $('cap').classList.toggle('min');
$('dClear').onclick = () => { stopWalk(); S.trail = []; S.cut.clear(); choose(); };
$('dSnub').onclick = () => { stopWalk(); S.trail.push([...S.cut]); S.cut = new Set(P.SNUB24); choose(); toast('24 cut: the snub 24-cell, 120 tetrahedra and 24 icosahedra, the only shape with 24 cuts'); };
$('aBack').onclick = () => { stopWalk(); if (S.trail.length) { S.cut = new Set(S.trail.pop()); choose(); } };
// at random: each next shape weighted by how many vertices lead to it (a uniformly random cuttable vertex)
$('aRand').onclick = () => walk((L) => { let r = Math.random() * L.reduce((a, c) => a + c.count, 0); for (const c of L) { r -= c.count; if (r < 0) return c; } return L[0]; });
$('aSym').onclick = () => walk((L) => L.reduce((a, c) => (c.stab > a.stab ? c : a)));

// ------------------------------------------------------------------ the loop
let last = performance.now(), slow = 0;
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000), raw = now - last; last = now;
  let tx = stick.x, ty = stick.y, ly = lever.y;
  if (keys.has('ArrowLeft')) tx -= 1; if (keys.has('ArrowRight')) tx += 1; if (keys.has('ArrowUp')) ty += 1; if (keys.has('ArrowDown')) ty -= 1;
  if (keys.has('q') || keys.has('[')) ly += 1; if (keys.has('e') || keys.has(']')) ly -= 1;
  const four = S.mode !== '92';
  if (four && (tx || ty)) { const v = view(); if (tx) turn(lift(v.r), E[3], tx * 1.1 * dt); if (ty) turn(lift(v.u), E[3], ty * 1.1 * dt); needBuild = true; dirty = true; }
  if (four && ly) { off = Math.max(-1.05 * S.R, Math.min(1.05 * S.R, off + ly * 0.6 * S.R * dt)); needBuild = true; dirty = true; }
  if (S.spin) { yaw += dt * 0.25; dirty = true; }
  if (S.mode === 'seat' && S.seatSel >= 0) {
    needBuild = true; dirty = true;                      // it turns while it's out
    if (!S.touched && S.Q && !S.seatGoing) S.Q = S.Q.map((v) => rodrigues(v, FACE[S.seatSel].n, dt * 0.7 * S.seatT));
    const was = S.seatT;
    S.seatT = Math.max(0, Math.min(1, S.seatT + (S.seatGoing ? -dt : dt) * 1.6));
    if (S.seatT !== was) { needBuild = true; dirty = true; }
    if (S.seatGoing && S.zoomBefore) zoom = S.zoomBefore + (S.zoomAway - S.zoomBefore) * ease(S.seatT);   // the zoom goes home with it
    if (S.seatGoing && S.seatT === 0) { S.seatSel = -1; S.seatGoing = false; S.spin = true; $('spinB').classList.add('on'); info(); }
  }
  if (dirty) {
    dirty = false; draw();
    slow = raw > 45 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 8 && scale > 0.5) { scale *= 0.8; slow = 0; }
  }
  requestAnimationFrame(tick);
}
addEventListener('resize', () => { dirty = true; });

// ------------------------------------------------------------------ start: #J37, #snub24, #600, …
{
  const h = decodeURIComponent(location.hash.slice(1));
  if (/^J\d+$/.test(h) && +h.slice(1) >= 1 && +h.slice(1) <= 92) { S.j = +h.slice(1); setMode('92'); }
  else if (h === '600') setMode('600');
  else if (h === 'seat') setMode('seat');
  else if (OBJ[h]) { S.obj = h; setMode('4d'); }
  else setMode('92');
}
window.johnson = { S, P, JOHNSON, SEAT, setMode, choose, seatTap, pose: (p) => { if (p.E) E = p.E; if (p.off !== undefined) off = p.off; if (p.yaw !== undefined) yaw = p.yaw; if (p.pitch !== undefined) pitch = p.pitch; if (p.zoom !== undefined) zoom = p.zoom; needBuild = true; dirty = true; } };
requestAnimationFrame(tick);
