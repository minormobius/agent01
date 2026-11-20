// COIN's page: the coin (two hemispheres, heads' picture and tails' half-turned copy) slid in 4D onto the projective
// plane, drawn as a shadow (from an eye out in w) or a slice (the curves a 3D hyperplane cuts from it); the walker and
// its little frame on the overlay. The camera and the pad, lever and ⊞ are CAD⁴'s (as on FOLD and PRISM).
import * as C from './coin.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
const gl = canvas.getContext('webgl2', { antialias: true });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

const S = { view: 'shadow', spin: true, turning: false, t: 0, gluing: 0, walk: null, R: 2.2, centre: [0, 0, 0], flips: { heads: 0, tails: 0 } };
let E = ident(), off = 0, yaw = -0.4, pitch = 0.75, zoom = 1, dirty = true, need = true;
function ident() { return [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]; }
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], sub = (a, b) => a.map((v, i) => v - b[i]);
function turn(a, n, th) { const c = Math.cos(th) - 1, s = Math.sin(th); E = E.map((v) => { const va = dot(v, a), vn = dot(v, n); return v.map((x, i) => x + c * (va * a[i] + vn * n[i]) + s * (va * n[i] - vn * a[i])); }); for (let i = 0; i < 4; i++) { for (let j = 0; j < i; j++) { const d = dot(E[i], E[j]); E[i] = E[i].map((x, k) => x - d * E[j][k]); } const l = Math.hypot(...E[i]); E[i] = E[i].map((x) => x / l); } }
function view() {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const f = [-cp * sy, -sp, -cp * cy], r = [cy, 0, -sy], u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]], dist = (2.6 * S.R) / zoom;
  return { f, r, u, cam: S.centre.map((c, i) => c - f[i] * dist) };
}
const lift = (v3) => [0, 1, 2, 3].map((i) => v3[0] * E[0][i] + v3[1] * E[1][i] + v3[2] * E[2][i]);
const origin = () => E[3].map((x) => x * off);

// ------------------------------------------------------------------ GL (as PRISM's)
const VS = `#version 300 es
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm; layout(location=2) in vec3 col;
uniform mat4 M; out vec3 vN; out vec3 vC; out vec3 vP;
void main() { vN = nrm; vC = col; vP = pos; gl_Position = M * vec4(pos, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vC; in vec3 vP; out vec4 o; uniform vec3 eye; uniform int lit; uniform sampler2D tex;
void main() {
  if (lit == 0) { o = vec4(vC, 1.0); return; }
  vec3 base = texture(tex, vC.xy).rgb;   // the faces carry the picture's coordinates in their colour slot
  vec3 n = normalize(vN), v = normalize(eye - vP); if (dot(n, v) < 0.0) n = -n;
  float d = 0.35 + 0.6 * max(dot(n, normalize(vec3(0.5, 0.8, 0.6))), 0.0) + 0.2 * max(dot(n, normalize(vec3(-0.6, 0.2, -0.5))), 0.0);
  vec3 h = normalize(normalize(vec3(0.5, 0.8, 0.6)) + v);
  o = vec4(base * d + 0.35 * pow(max(dot(n, h), 0.0), 40.0), 1.0);
}`;
const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
const U = { M: gl.getUniformLocation(prog, 'M'), eye: gl.getUniformLocation(prog, 'eye'), lit: gl.getUniformLocation(prog, 'lit'), tex: gl.getUniformLocation(prog, 'tex') };
const buf = () => { const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 36, i * 12); } return { vao, b, n: 0, data: new Float32Array(0), set(a, n) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a.subarray(0, n), gl.DYNAMIC_DRAW); this.n = n / 9; } }; };
const TRI = buf(), LIN = buf();
gl.enable(gl.DEPTH_TEST);

// ------------------------------------------------------------------ the face: a chiral picture, so mirroring shows
const FACE = (() => {
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d');
  const grad = g.createRadialGradient(N * 0.4, N * 0.38, 10, N / 2, N / 2, N / 2); grad.addColorStop(0, '#ffe7a8'); grad.addColorStop(1, '#c08a2c');
  g.fillStyle = grad; g.fillRect(0, 0, N, N);
  g.strokeStyle = '#7a5214'; g.lineWidth = 6; g.beginPath(); g.arc(N / 2, N / 2, N * 0.4, 0, 7); g.stroke();
  g.fillStyle = '#5a3a0c'; g.font = `900 ${N * 0.42}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R', N * 0.5, N * 0.47);
  g.font = `700 ${N * 0.075}px ui-monospace, Menlo, monospace`; g.fillText('ONE SIDE', N * 0.5, N * 0.75);
  g.beginPath(); g.moveTo(N * 0.2, N * 0.25); g.lineTo(N * 0.32, N * 0.2); g.lineTo(N * 0.32, N * 0.3); g.fill();   // an arrow, pointing one way
  // the rim (outside radius 0.86 of the disc) plain metal, the same all round, so heads and tails agree there
  g.save(); g.beginPath(); g.rect(0, 0, N, N); g.moveTo(N / 2 + N * 0.43, N / 2); g.arc(N / 2, N / 2, N * 0.43, 0, 2 * Math.PI); g.fillStyle = '#c79a40'; g.fill('evenodd'); g.restore();
  const tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv); gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const img = g.getImageData(0, 0, N, N).data;
  // the rim (outside radius 0.86 of the disc) is plain metal, the same all round, so heads and tails agree there
  return (x, y) => { const r = Math.hypot(x, y); if (r > 0.86) return [0.78, 0.6, 0.25]; const i = Math.min(N - 1, Math.max(0, Math.round((x * 0.5 + 0.5) * (N - 1)))), j = Math.min(N - 1, Math.max(0, Math.round((0.5 - y * 0.5) * (N - 1)))), k = (j * N + i) * 4; return [img[k] / 255, img[k + 1] / 255, img[k + 2] / 255]; };
})();
// each vertex: its picture coordinates (heads at (x, y), tails at (−x, −y): C.faceAt with a function that returns the
// texture coordinate instead of a colour) for the faces, and the sampled colour for the slice's curves
const UV = (x, y) => [x * 0.5 + 0.5, 0.5 - y * 0.5, 0];
const HEMI = C.hemispheres(48, 144).map((h) => ({ ...h, uv: h.P.map((p) => C.faceAt(p, UV)), col: h.P.map((p) => C.faceAt(p, FACE)) }));

let EYE = 5;
/** Into your 3D view: shadow (perspective from an eye at EYE along your w) or slice coordinates. */
function to3(x, O0) { const d = sub(x, O0), w = dot(d, E[3]), k = S.view === 'shadow' ? EYE / (EYE - w) : 1; return [dot(d, E[0]) * k, dot(d, E[1]) * k, dot(d, E[2]) * k]; }
let triBuf = new Float32Array(0), linBuf = new Float32Array(0);
function build() {
  const O0 = origin(), t = S.t;
  const Q = HEMI.map((h) => h.P.map((p) => C.glued(p, t)));
  let mw = 0; for (const q of Q) for (const x of q) mw = Math.max(mw, dot(sub(x, O0), E[3])); EYE = Math.max(5, mw * 1.6 + 1);
  let nt = 0, nl = 0;
  const need3 = HEMI.reduce((s, h) => s + h.T.length, 0) * 27; if (triBuf.length < need3) triBuf = new Float32Array(need3);
  if (linBuf.length < need3) linBuf = new Float32Array(need3);
  HEMI.forEach((h, hi) => {
    const W = Q[hi];
    if (S.view === 'shadow') {
      const P = W.map((x) => to3(x, O0));
      for (const [a, b, c] of h.T) {
        const u = sub(P[b], P[a]), v = sub(P[c], P[a]), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
        for (const k of [a, b, c]) { triBuf.set(P[k], nt); triBuf[nt + 3] = n[0] / l; triBuf[nt + 4] = n[1] / l; triBuf[nt + 5] = n[2] / l; triBuf.set(h.uv[k], nt + 6); nt += 9; }
      }
    } else {
      // the slice: each triangle the hyperplane crosses gives a segment of the curve
      const s = W.map((x) => dot(sub(x, O0), E[3]));
      for (const tri of h.T) {
        const pts = [];
        for (let e = 0; e < 3; e++) { const a = tri[e], b = tri[(e + 1) % 3]; if ((s[a] < 0) !== (s[b] < 0)) { const f = s[a] / (s[a] - s[b]); pts.push([W[a].map((x, i) => x + (W[b][i] - x) * f), h.col[a].map((x, i) => x + (h.col[b][i] - x) * f)]); } }
        if (pts.length === 2) for (const [x, col] of pts) { linBuf.set(to3(x, O0), nl); linBuf[nl + 3] = linBuf[nl + 4] = linBuf[nl + 5] = 0; linBuf.set(col.map((c) => Math.min(1, c * 1.3)), nl + 6); nl += 9; }
      }
    }
  });
  TRI.set(triBuf, nt); LIN.set(linBuf, nl);
}
function matrix(v, aspect) {
  const near = 0.05, far = 100, f = 1 / Math.tan((50 * Math.PI) / 360), z = v.f.map((x) => -x), x = v.r, y = v.u, e = v.cam;
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
  gl.uniform1i(U.lit, 1); gl.bindVertexArray(TRI.vao); gl.drawArrays(gl.TRIANGLES, 0, TRI.n);
  gl.uniform1i(U.lit, 0); gl.bindVertexArray(LIN.vao); gl.drawArrays(gl.LINES, 0, LIN.n);
  overlay(v);
}

// ------------------------------------------------------------------ the walker, and the axes
const AX = [['x', '#e9e4da'], ['y', '#e9e4da'], ['z', '#e9e4da'], ['w', '#ffd27a']];
/** The walker's place and frame on the sphere at s ∈ [0, 2]: round the great circle through the poles in the xz plane,
 *  left fixed along y. On the glued coin, s = 1 is back at the start. */
const walkAt = (s) => { const th = Math.PI * s; return { p: [Math.sin(th), 0, Math.cos(th)], fwd: [Math.cos(th), 0, -Math.sin(th)], left: [0, 1, 0] }; };
/** A tangent direction on the sphere, carried into 4D by the partly glued map. */
const push = (p, v, t) => { const a = [v[0], v[1], v[2] * C.THICK, 0], b = C.df(p, v); return a.map((x, i) => (1 - t) * x + t * b[i]); };
function overlay(v) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = ov.clientWidth, h = ov.clientHeight;
  if (ov.width !== Math.round(w * dpr) || ov.height !== Math.round(h * dpr)) { ov.width = Math.round(w * dpr); ov.height = Math.round(h * dpr); }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, w, h);
  const scr = (p) => { const M = MVP, x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], q = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15]; return q < 0.05 ? null : [((x / q + 1) / 2) * w, ((1 - y / q) / 2) * h]; };
  const O0 = origin();
  if (S.walk && S.view === 'shadow') {
    // the trail so far, then the walker: a dot, forward (gold) and left (teal)
    octx.strokeStyle = 'rgba(255,255,255,0.75)'; octx.lineWidth = 2; octx.setLineDash([4, 4]); octx.beginPath();
    for (let k = 0; k <= 80; k++) { const s = (S.walk.s * k) / 80, q = scr(to3(C.glued(walkAt(s).p, S.t), O0)); if (!q) continue; if (k) octx.lineTo(...q); else octx.moveTo(...q); }
    octx.stroke(); octx.setLineDash([]);
    const W = walkAt(S.walk.s), X = C.glued(W.p, S.t), here = scr(to3(X, O0));
    const arrow = (vec, col, label) => { const l = Math.hypot(...vec) || 1, tip = scr(to3(X.map((x, i) => x + (0.45 * vec[i]) / l), O0)); if (!here || !tip) return; octx.strokeStyle = octx.fillStyle = col; octx.lineWidth = 3; octx.beginPath(); octx.moveTo(...here); octx.lineTo(...tip); octx.stroke(); const a = Math.atan2(tip[1] - here[1], tip[0] - here[0]); octx.beginPath(); octx.moveTo(...tip); octx.lineTo(tip[0] - 9 * Math.cos(a - 0.45), tip[1] - 9 * Math.sin(a - 0.45)); octx.lineTo(tip[0] - 9 * Math.cos(a + 0.45), tip[1] - 9 * Math.sin(a + 0.45)); octx.fill(); octx.font = '600 11px ui-monospace, Menlo, monospace'; octx.fillText(label, tip[0] + 6, tip[1] - 6); };
    arrow(push(W.p, W.fwd, S.t), '#ffd27a', 'forward'); arrow(push(W.p, W.left, S.t), '#38f2e0', 'left');
    if (here) { octx.fillStyle = '#fff'; octx.beginPath(); octx.arc(here[0], here[1], 5, 0, 7); octx.fill(); }
  }
  const cx = w - 52, cy = 96, Lx = 34; octx.lineWidth = 1.6; octx.font = '600 11px ui-monospace, Menlo, monospace'; octx.textAlign = 'center'; octx.textBaseline = 'middle';
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const items = AX.map(([name, colr], a) => { const s3 = [E[0][a], E[1][a], E[2][a]]; return { name, colr, len: Math.hypot(...s3), x: d3(s3, v.r), y: d3(s3, v.u), z: -d3(s3, v.f) }; }).sort((a, b) => a.z - b.z);
  for (const it of items) { if (it.len < 0.04) continue; octx.globalAlpha = 0.35 + 0.65 * it.len; octx.strokeStyle = octx.fillStyle = it.colr; octx.beginPath(); octx.moveTo(cx, cy); octx.lineTo(cx + it.x * Lx, cy - it.y * Lx); octx.stroke(); octx.fillText(it.name, cx + it.x * (Lx + 9), cy - it.y * (Lx + 9)); }
  octx.globalAlpha = 1; octx.fillStyle = '#9a958c'; octx.textAlign = 'center';
  octx.fillText(S.view === 'shadow' ? 'shadow: seen from an eye out in w' : `slice at ${off.toFixed(2)} along w: the curves it cuts`, w / 2, h - 14);
  octx.textAlign = 'start';
}

// ------------------------------------------------------------------ the panel
function rows(el, list) { el.textContent = ''; for (const [k, v] of list) { const a = document.createElement('i'), b = document.createElement('span'); a.textContent = k; b.textContent = v; el.append(a, b); } }
function info() {
  const t = S.t, gap = 2 * Math.hypot(1, 0) * (1 - t);   // |coin(p) − coin(−p)| is at most 2 (on the rim); glued, (1 − t) of it
  $('glueV').textContent = `${Math.round(t * 100)}%`;
  const wk = S.walk ? (S.walk.s < 1 ? `lap 1: ${Math.round(S.walk.s * 100)}%` : S.walk.s < 2 ? `lap 2: ${Math.round((S.walk.s - 1) * 100)}%` : 'two laps: yourself again') : 'not yet';
  rows($('facts'), [
    ['a point and its opposite', t > 0.999 ? 'the same point' : `up to ${gap.toFixed(2)} apart`],
    ['sides', t > 0.999 ? 'one (heads is tails)' : 'two, for now'],
    ['edge', t > 0.999 ? 'none' : 'none (a coin is a squashed sphere)'],
    ['crossing itself in 4D', t > 0.999 ? 'never (checked from both ends: every image point has one ±p)' : '—'],
    ['the walk', wk],
  ]);
  const n = S.flips.heads + S.flips.tails;
  $('tally').textContent = n ? `${n} flip${n > 1 ? 's' : ''}: ${S.flips.heads} heads, ${S.flips.tails} tails · entropy ${C.entropy(S.flips).toFixed(0)} bits` : '';
  let cap;
  if (S.walk && S.walk.s > 0.999 && S.walk.s < 1.02) cap = t > 0.999 ? 'Home after one pole-to-pole walk: the poles are the same point. Forward points the same way, but left (teal) has flipped to your right: you came back mirrored.' : 'At the south pole, which is not yet the north pole: glue the coin all the way and the walk closes up.';
  else if (S.walk && S.walk.s >= 1.999) cap = 'Two laps: left is left again. On a one-sided surface, which side is "left" depends on the path you took.';
  else if (S.walk) cap = 'Walking: gold is forward, teal is your left.';
  else cap = t < 0.01 ? 'A coin is a squashed sphere: heads on top, tails underneath showing the same picture half-turned (turn it over and look). Slide "glue" to bring each point to the one straight through it.'
    : t < 0.999 ? 'Gluing, in 4D: each point slides toward the one straight through the coin from it. The shadow passes through itself; the surface doesn\'t.'
    : 'Glued: the real projective plane. One side, no edge: heads is tails. Turn it through w, or walk pole to pole.';
  $('cap').textContent = cap;
}
function setT(t) { S.t = Math.max(0, Math.min(1, t)); $('glue').value = S.t; need = dirty = true; info(); }
$('glue').oninput = () => { S.gluing = 0; $('glueB').classList.remove('on'); setT(+$('glue').value); };
$('glueB').onclick = () => { S.gluing = S.gluing ? 0 : S.t < 0.5 ? 1 : -1; $('glueB').classList.toggle('on', !!S.gluing); };
$('walkB').onclick = () => { if (S.t < 0.999) { setT(1); } S.walk = { s: 0, playing: true }; S.spin = false; $('spinB').classList.remove('on'); E = ident(); off = 0; S.view = 'shadow'; for (const x of $('view').children) x.classList.toggle('on', x.dataset.v === 'shadow'); need = dirty = true; info(); };
$('flipB').onclick = () => { S.flips[C.flip()]++; toast('heads'); S.flipAnim = 1; info(); };
for (const b of $('view').children) b.onclick = () => { S.view = b.dataset.v; for (const x of $('view').children) x.classList.toggle('on', x === b); need = dirty = true; info(); };
$('turnB').onclick = () => { S.turning = !S.turning; $('turnB').classList.toggle('on', S.turning); };
$('squareB').onclick = () => { E = ident(); off = 0; need = dirty = true; };
$('spinB').onclick = () => { S.spin = !S.spin; $('spinB').classList.toggle('on', S.spin); };
$('cap').onclick = () => $('cap').classList.toggle('min');
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1600); }

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
  addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys.add(e.key); if (e.key.startsWith('Arrow')) e.preventDefault(); });
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
  if (ly) { off = Math.max(-3, Math.min(3, off + ly * 0.8 * dt)); need = dirty = true; }
  if (S.turning) { turn([1, 0, 0, 0], [0, 0, 0, 1], dt * 0.5); need = dirty = true; }
  if (S.gluing) { setT(S.t + S.gluing * dt * 0.25); if (S.t === 0 || S.t === 1) { S.gluing = 0; $('glueB').classList.remove('on'); } }
  if (S.walk?.playing) { const was = S.walk.s; S.walk.s = Math.min(2, S.walk.s + dt * 0.18); if (was < 1 && S.walk.s >= 1) { S.walk.s = 1; S.walk.playing = false; setTimeout(() => { if (S.walk) S.walk.playing = true; }, 2600); } if (S.walk.s >= 2) S.walk.playing = false; dirty = true; info(); }
  if (S.spin) { yaw += dt * 0.22; dirty = true; }
  if (dirty) { dirty = false; draw(); slow = raw > 45 ? slow + 1 : Math.max(0, slow - 1); if (slow > 8 && scale > 0.5) { scale *= 0.8; slow = 0; } }
  requestAnimationFrame(tick);
}
addEventListener('resize', () => { dirty = true; });
info();
window.coin = { S, C, setT, pose: (p) => { if (p.E) E = p.E; if (p.off !== undefined) off = p.off; if (p.yaw !== undefined) yaw = p.yaw; if (p.pitch !== undefined) pitch = p.pitch; need = dirty = true; } };
requestAnimationFrame(tick);
