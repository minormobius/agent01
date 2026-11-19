// PRISM's page: a level's room (prisms, mirrors, walls, targets) drawn as FOLD draws polytopes (each 3D cell whole in
// the shadow, as its section in the slice), and the beams over it on the 2D overlay: whole glowing lines in the shadow,
// sparks where they pierce the slice. The camera and the pad, lever and ⊞ are CAD⁴'s (as on FOLD and JOHNSON).
import * as O from './optics.js';
import { polytope, cellFaces } from '../../fold/js/unfold4.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
const gl = canvas.getContext('webgl2', { antialias: true });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

const S = { view: 'shadow', spin: false, R: 4, centre: [0, 0, 0], level: 0, k: [], scene: null, rays: [], score: null };
let E = ident(), off = 0, yaw = -0.6, pitch = 0.5, zoom = 1, dirty = true, need = true;
function ident() { return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; }
/** The frame each view starts from. The slice: squared up, our space. The shadow: turned 35° between z and w, so the
 *  eye isn't straight out along w; seen from there, a beam bent into w would look almost straight. Tilted, w shows as
 *  its own slant on the screen. */
const TILT = (35 * Math.PI) / 180;
const homeE = () => (S.view === 'shadow' ? [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, Math.cos(TILT), Math.sin(TILT)], [0, 0, -Math.sin(TILT), Math.cos(TILT)]] : ident());
const dot = O.dot, sub = (a, b) => a.map((v, i) => v - b[i]);
function turn(a, n, th) { const c = Math.cos(th) - 1, s = Math.sin(th); E = E.map((v) => { const va = dot(v, a), vn = dot(v, n); return v.map((x, i) => x + c * (va * a[i] + vn * n[i]) + s * (va * n[i] - vn * a[i])); }); for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) { const d = dot(E[i], E[j]); E[i] = E[i].map((x, k) => x - d * E[j][k]); } const l = Math.hypot(...E[i]); E[i] = E[i].map((x) => x / l); } }
function view() {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const f = [-cp * sy, -sp, -cp * cy], r = [cy, 0, -sy], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]], dist = (2.6 * S.R) / zoom;
  return { f, r, u, cam: S.centre.map((c, i) => c - f[i] * dist) };
}
const lift = (v3) => [0, 1, 2, 3].map((i) => v3[0] * E[0][i] + v3[1] * E[1][i] + v3[2] * E[2][i]);
const origin = () => E[3].map((x) => x * off);

// ------------------------------------------------------------------ GL (as FOLD's)
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

let EYE = 6;                           // the shadow's eye, out along your w: kept beyond everything drawn
const nrm3 = (p) => { const a = sub(p[1], p[0]), b = sub(p[2], p[0]); const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; const l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
/** Into your 3D view: shadow (perspective from an eye at EYE along your w) or slice coordinates. */
function to3(x, O0) { const d = sub(x, O0), w = dot(d, E[3]), k = S.view === 'shadow' ? EYE / (EYE - w) : 1; return [dot(d, E[0]) * k, dot(d, E[1]) * k, dot(d, E[2]) * k]; }
/** A 3D cell lying somewhere in 4D (its vertices W, faces, edges): in shadow, all of it; in slice, itself if it lies in
 *  the slice, else where the slice cuts it (a flat polygon), or nothing. (FOLD's piece(), without the lean tint.) */
function piece(W, faces, edges, c, T, L, O0, edgeCol) {
  const s = W.map((x) => dot(sub(x, O0), E[3]));
  if (S.view === 'shadow' || s.every((v) => Math.abs(v) < 1e-6)) {
    const P = W.map((x) => to3(x, O0));
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
  const P = u.map((x) => to3(x, O0)), cen = [0, 1, 2].map((k) => P.reduce((t, p) => t + p[k], 0) / P.length);
  const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let n = [0, 0, 0];
  for (let i = 1; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const cc = cr(sub(P[i], P[0]), sub(P[j], P[0])); if (Math.hypot(...cc) > Math.hypot(...n)) n = cc; }
  n = n.map((v) => v / (Math.hypot(...n) || 1));
  const e1 = sub(P[0], cen), e1n = e1.map((v) => v / (Math.hypot(...e1) || 1)), e2 = cr(n, e1n);
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ord = P.map((p, i) => [Math.atan2(d3(sub(p, cen), e2), d3(sub(p, cen), e1n)), i]).sort((x, y) => x[0] - y[0]).map((x) => P[x[1]]);
  for (let a = 1; a + 1 < ord.length; a++) T(ord[0], ord[a], ord[a + 1], n, c);
  for (let a = 0; a < ord.length; a++) L(ord[a], ord[(a + 1) % ord.length], edgeCol);
}

// ------------------------------------------------------------------ the level
const BAND = { red: [1.0, 0.36, 0.3], green: [0.42, 1.0, 0.52], blue: [0.42, 0.62, 1.0], any: [1.0, 0.82, 0.42] };
const CSS = (c, a = 1) => `rgba(${c.map((x) => Math.round(x * 255)).join(',')},${a})`;
/** A body's cells, their faces and edges, for drawing. */
function geometry(b) {
  const P = polytope(b.verts, b.faces.map((f) => f.n)), F = cellFaces(P);
  return P.cells.map((c, i) => {
    const m = new Map(); for (const f of F[i]) for (let j = 0; j < f.length; j++) { const a = f[j], z = f[(j + 1) % f.length]; m.set(a < z ? `${a},${z}` : `${z},${a}`, [Math.min(a, z), Math.max(a, z)]); }
    return { W: c.verts.map((v) => P.V[v]), faces: F[i], edges: [...m.values()] };
  });
}
function colourOf(b, i) {
  if (b.kind === 'glass') return { c: [0.6, 0.86, 1.0], e: [0.75, 0.92, 1.0] };
  if (b.kind === 'mirror') return { c: [0.78, 0.8, 0.86], e: [0.95, 0.96, 1.0] };
  if (b.kind === 'wall') return { c: [0.42, 0.3, 0.36], e: [0.6, 0.45, 0.52] };
  if (b.kind === 'source') return { c: [1.0, 0.95, 0.8], e: [1, 1, 1] };
  const col = BAND[b.want] || BAND.any, lit = S.score?.lit[i];
  return { c: lit ? col : col.map((x) => x * 0.35), e: lit ? [1, 1, 1] : col.map((x) => x * 0.7) };
}
const GEO = new Map();
function setKnobs(k) {
  const L = O.LEVELS[S.level]; S.k = k.slice();
  S.scene = O.scene(L, S.k); S.rays = O.shine(S.scene); S.score = O.score(S.scene, S.rays);
  S.geo = S.scene.bodies.map((b) => { const key = b.verts.flat().map((x) => x.toFixed(9)).join(); if (!GEO.has(key)) GEO.set(key, geometry(b)); return GEO.get(key); });
  if (GEO.size > 400) GEO.clear();
  need = dirty = true; info();
}
/** The points the beams are drawn through: the last segment cut to a sensible length. */
const beamPts = (r) => { const p = r.path.slice(0, -1); p.push(r.end === 'absorbed' ? r.path[r.path.length - 1] : O.add(r.path[r.path.length - 2], r.dir, 9)); return p; };

function build() {
  const tri = [], lin = [];
  const T = (a, b, c, n, col) => { for (const p of [a, b, c]) tri.push(...p, ...n, ...col); };
  const L = (a, b, col) => lin.push(...a, 0, 0, 0, ...col, ...b, 0, 0, 0, ...col);
  const O0 = origin();
  // the eye in w sits beyond every body and beam point, so the shadow never inverts
  let mw = 0; for (const b of S.scene.bodies) for (const v of b.verts) mw = Math.max(mw, dot(sub(v, O0), E[3]));
  for (const r of S.rays) for (const p of beamPts(r)) mw = Math.max(mw, dot(sub(p, O0), E[3]));
  EYE = Math.max(6, mw * 1.6 + 1);
  S.scene.bodies.forEach((b, i) => { const { c, e } = colourOf(b, i); for (const cell of S.geo[i]) piece(cell.W, cell.faces, cell.edges, c, T, L, O0, e); });
  TRI.set(tri); LIN.set(lin);
}
/** Frame the level: centre and size from its bodies and solved beams, in the squared-up shadow. */
function frame() {
  const L = O.LEVELS[S.level], sol = O.scene(L, L.knobs.map((k) => k.sol)), pts = [...sol.bodies.flatMap((b) => b.verts), ...O.shine(sol).flatMap(beamPts)];
  const sv = S.view; S.view = 'shadow'; const E0 = E; E = homeE(); const o0 = off; off = 0;
  let mw = 0; for (const p of pts) mw = Math.max(mw, dot(p, E[3])); EYE = Math.max(6, mw * 1.6 + 1);
  const P = pts.map((p) => to3(p, [0, 0, 0, 0])), lo = [0, 1, 2].map((k) => Math.min(...P.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...P.map((p) => p[k])));
  S.centre = lo.map((x, k) => (x + hi[k]) / 2); S.R = Math.max(2, Math.hypot(...hi.map((x, k) => x - lo[k])) / 2);
  S.view = sv; E = E0; off = o0;
}
function matrix(v, aspect) {
  const near = 0.05, far = 200, f = 1 / Math.tan((50 * Math.PI) / 360), z = v.f.map((x) => -x), x = v.r, y = v.u, e = v.cam;
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const Vm = [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d3(x, e), -d3(y, e), -d3(z, e), 1];
  const Pm = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const out = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += Pm[k * 4 + r] * Vm[c * 4 + k];
  return out;
}
let scale = 1, MVP = null;
function draw() {
  if (need) { build(); need = false; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale, w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h); gl.clearColor(0.027, 0.031, 0.047, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(prog);
  const v = view(); MVP = matrix(v, w / h); gl.uniformMatrix4fv(U.M, false, MVP); gl.uniform3fv(U.eye, v.cam);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
  // see-through, so beams and targets show through the glass and each other
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  gl.uniform1f(U.alpha, S.view === 'shadow' ? 0.3 : 0.55);
  gl.uniform1i(U.lit, 1); gl.bindVertexArray(TRI.vao); gl.drawArrays(gl.TRIANGLES, 0, TRI.n);
  gl.disable(gl.BLEND); gl.depthMask(true); gl.uniform1f(U.alpha, 1);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.uniform1i(U.lit, 0); gl.bindVertexArray(LIN.vao); gl.drawArrays(gl.LINES, 0, LIN.n);
  overlay(v);
}

// ------------------------------------------------------------------ the beams and the axes, on the overlay
const AX = [['x', '#e9e4da'], ['y', '#e9e4da'], ['z', '#e9e4da'], ['w', '#ffd27a']];
function overlay(v) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, w, h);
  const scr = (p) => { const M = MVP, x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], q = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15]; return q < 0.05 ? null : [((x / q + 1) / 2) * w, ((1 - y / q) / 2) * h]; };
  const O0 = origin();
  octx.lineCap = 'round';
  for (const r of S.rays) {
    const col = BAND[r.band], pts = beamPts(r), multi = S.rays.length > 1;
    if (S.view === 'shadow') {
      octx.strokeStyle = CSS(col, 0.95); octx.lineWidth = multi ? 2 : 2.6; octx.shadowColor = CSS(col, 0.9); octx.shadowBlur = 10;
      octx.beginPath(); let pen = false;
      for (const p of pts) { const s = scr(to3(p, O0)); if (!s) { pen = false; continue; } if (pen) octx.lineTo(...s); else octx.moveTo(...s); pen = true; }
      octx.stroke(); octx.shadowBlur = 0;
    } else {
      // the slice: where each segment pierces it, a spark ringed by which way it's going (teal ana, rose kata)
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], sa = dot(sub(a, O0), E[3]), sb = dot(sub(b, O0), E[3]);
        if (Math.abs(sa) < 1e-6 && Math.abs(sb) < 1e-6) { const p = scr(to3(a, O0)), q = scr(to3(b, O0)); if (p && q) { octx.strokeStyle = CSS(col); octx.lineWidth = 2.6; octx.shadowColor = CSS(col); octx.shadowBlur = 10; octx.beginPath(); octx.moveTo(...p); octx.lineTo(...q); octx.stroke(); octx.shadowBlur = 0; } continue; }
        if ((sa < 0) === (sb < 0)) continue;
        const t = sa / (sa - sb), x = O0.map((_, k) => a[k] + (b[k] - a[k]) * t), s = scr(to3(x, O0)); if (!s) continue;
        const g = octx.createRadialGradient(s[0], s[1], 0, s[0], s[1], 14); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, CSS(col, 0.95)); g.addColorStop(1, CSS(col, 0));
        octx.fillStyle = g; octx.beginPath(); octx.arc(s[0], s[1], 14, 0, 7); octx.fill();
        octx.strokeStyle = sb > sa ? '#38f2e0' : '#ff66b8'; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(s[0], s[1], 9, 0, 7); octx.stroke();
      }
    }
  }
  // the axes gizmo and the view's label (as FOLD's)
  const cx = w - 52, cy = 96, Lx = 34; octx.lineWidth = 1.6; octx.font = '600 11px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const items = AX.map(([name, colr], a) => { const s3 = [E[0][a], E[1][a], E[2][a]]; return { name, colr, len: Math.hypot(...s3), x: d3(s3, v.r), y: d3(s3, v.u), z: -d3(s3, v.f) }; }).sort((a, b) => a.z - b.z);
  for (const it of items) { if (it.len < 0.04) continue; octx.globalAlpha = 0.35 + 0.65 * it.len; octx.strokeStyle = octx.fillStyle = it.colr; octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(cx + it.x * Lx, cy - it.y * Lx); octx.stroke(); octx.fillText(it.name, cx + it.x * (Lx + 9), cy - it.y * (Lx + 9)); }
  octx.globalAlpha = 1; octx.fillStyle = '#9a958c';
  const n = E[3], main = n.findIndex((x) => Math.abs(x) > 0.9995);
  octx.fillText(S.view === 'shadow' ? 'shadow: everything, seen from an eye out in w' : main >= 0 ? `slice: ${'xyzw'[main]} = ${(off * Math.sign(n[main])).toFixed(2)}` : `slice at ${off.toFixed(2)} along a tilted w`, w / 2, h - 14);
}

// ------------------------------------------------------------------ the panel
function rows(el, list) { el.textContent = ''; for (const [k, v, sw] of list) { const a = document.createElement('i'), b = document.createElement('span'); if (sw) { const s = document.createElement('span'); s.className = 'sw'; s.style.background = sw; a.append(s); } a.append(k); b.textContent = v; el.append(a, b); } }
const DONE = (() => { try { return new Set(JSON.parse(localStorage.getItem('prism-done') || '[]')); } catch { return new Set(); } })();
const saveDone = () => { try { localStorage.setItem('prism-done', JSON.stringify([...DONE])); } catch { /* private window */ } };
/** Which way a direction heads, in words: its biggest parts. */
const heading = (d) => d.map((x, i) => [x, i]).filter(([x]) => Math.abs(x) > 0.05).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).map(([x, i]) => `${x > 0 ? '+' : '−'}${'xyzw'[i]} ${Math.abs(x).toFixed(2)}`).join(', ');
const EV = { enter: 'into glass', leave: 'out of glass', tir: 'reflects inside the glass', reflect: 'off a mirror', absorbed: 'stopped by the wall' };
function info() {
  const L = O.LEVELS[S.level], sc = S.score;
  $('title').textContent = `${S.level + 1}. ${L.name}`;
  $('story').textContent = L.story;
  for (const b of $('levels').children) { const i = +b.dataset.i; b.classList.toggle('on', i === S.level); b.classList.toggle('done', DONE.has(O.LEVELS[i].id)); }
  const list = [];
  S.scene.bodies.forEach((b, i) => { if (b.kind === 'target') list.push([`target${b.want === 'any' ? '' : ` (${b.want})`}`, sc.lit[i] ? 'lit ✓' : 'dark', CSS(BAND[b.want] || BAND.any)]); });
  for (const r of S.rays) list.push([`${S.rays.length > 1 ? `${r.band} ` : ''}beam`, `${r.events.map((e) => `${EV[e.kind]}${e.angle !== undefined && e.kind !== 'absorbed' ? ` at ${e.angle.toFixed(1)}°` : ''}`).join(', ') || 'nothing in its way'}; ${r.end === 'absorbed' ? 'absorbed' : `heads ${heading(r.dir)}`}`, CSS(BAND[r.band])]);
  rows($('facts'), list);
  $('solved').hidden = !sc.solved;
  $('cap').textContent = sc.solved ? 'Solved: every target lit. On to the next.' : S.view === 'slice' ? 'The slice: a beam is a spark where it pierces our space, ringed teal if it is heading ana, rose if kata. Push the lever to follow it.' : `${L.story.split('. ')[0]}. Shadow: every beam whole, seen from an eye out in w. Try the slice to see where it crosses our space.`;
}
function knobUI() {
  const L = O.LEVELS[S.level], el = $('knobs'); el.textContent = '';
  L.knobs.forEach((k, i) => {
    const d = document.createElement('div'); d.className = 'knob';
    d.innerHTML = `<label><span>${k.label}</span><b></b></label><div class="slider"><span>${k.min}°</span><input type="range" min="${k.min}" max="${k.max}" step="${k.step || 1}" /><span>${k.max}°</span></div>`;
    const inp = d.querySelector('input'), out = d.querySelector('b'); inp.value = S.k[i]; out.textContent = `${S.k[i]}°`;
    inp.oninput = () => { const kk = S.k.slice(); kk[i] = +inp.value; out.textContent = `${kk[i]}°`; const was = S.score.solved; setKnobs(kk); if (S.score.solved && !was) { DONE.add(L.id); saveDone(); toast('solved!'); info(); } };
    el.append(d);
  });
}
function setLevel(i) {
  S.level = Math.max(0, Math.min(O.LEVELS.length - 1, i)); const L = O.LEVELS[S.level];
  E = homeE(); off = 0; zoom = 1;
  setKnobs(L.knobs.map((k) => k.start)); frame(); knobUI(); info();
  history.replaceState(null, '', `#${L.id}`);
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }
O.LEVELS.forEach((L, i) => { const b = document.createElement('button'); b.dataset.i = i; b.textContent = String(i + 1); b.title = L.name; b.onclick = () => setLevel(i); $('levels').append(b); });
$('resetB').onclick = () => setLevel(S.level);
$('nextB').onclick = () => setLevel((S.level + 1) % O.LEVELS.length);
for (const b of $('view').children) b.onclick = () => { S.view = b.dataset.v; for (const x of $('view').children) x.classList.toggle('on', x === b); E = homeE(); need = dirty = true; info(); };
$('squareB').onclick = () => { E = homeE(); off = 0; need = dirty = true; };
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
  addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; keys.add(e.key); if (e.key.startsWith('Arrow')) e.preventDefault(); });
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
  if (ly) { off = Math.max(-9, Math.min(9, off + ly * 1.6 * dt)); need = dirty = true; }
  if (S.spin) { yaw += dt * 0.22; dirty = true; }
  if (dirty) { dirty = false; draw(); slow = raw > 45 ? slow + 1 : Math.max(0, slow - 1); if (slow > 8 && scale > 0.5) { scale *= 0.8; slow = 0; } }
  requestAnimationFrame(tick);
}
addEventListener('resize', () => { dirty = true; });
{ const h = location.hash.slice(1), i = O.LEVELS.findIndex((L) => L.id === h); setLevel(i >= 0 ? i : 0); }
window.prism = { S, O, setLevel, setKnobs, pose: (p) => { if (p.E) E = p.E; if (p.off !== undefined) off = p.off; if (p.yaw !== undefined) yaw = p.yaw; if (p.pitch !== undefined) pitch = p.pitch; need = dirty = true; } };
requestAnimationFrame(tick);
