// HILBERT⁴'s page: draws what hilbert.js computes. WebGL2, every segment an instanced screen-space quad so the path
// has a width at any order; the 4D turn and both projections happen in the vertex shader.
import { curve4, cellCount, curveLength, maxOrder, indexToPoint, digits, rotation4, turn4, cube4 } from './hilbert.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

const AXES = 'xyzw';
const HOME = [0.18, 0.62, 0.55, 0.42, 0.35, 0.0];   // xy xz xw yz yw zw: the classic cell-within-a-cell look

const S = {
  n: 4, b: 2, drag: '3', colour: 't', proj: 'p', spin: true,
  trace: 1, playing: false, slice: false, w0: 0, thk: 0.18, zoom: 1,
  R: rotation4(HOME),
};

// ------------------------------------------------------------------ shader --
const HEAD = `#version 300 es
precision highp float;
uniform mat4 R;                          // the 4D turn (applied to centred coordinates)
uniform float persp4, zoom, width, aspect;
uniform vec2 res;
out float vt; out float vw; out float vz;
vec3 project(vec4 p, out float w, out float z) {
  vec4 q = R * ((p - vec4(0.5)) * 2.0);
  w = q.w;
  float k = persp4 > 0.5 ? 4.0 / (4.0 - q.w) : 1.0;
  vec3 r = q.xyz * k;
  z = r.z;
  float f = 8.0 / (8.0 - r.z);
  return vec3(r.x * f * zoom * 0.32 / aspect, r.y * f * zoom * 0.32, -r.z / 8.0);
}
`;
// Quads: every segment an instance, widened in screen space.
const VS = HEAD + `
layout(location=0) in vec2 corner;      // (s along the segment 0..1, side −1..1)
layout(location=1) in vec4 a0;          // endpoints in the unit cube
layout(location=2) in float t0;
layout(location=3) in vec4 a1;
layout(location=4) in float t1;
void main() {
  float w0, w1, z0, z1;
  vec3 p0 = project(a0, w0, z0), p1 = project(a1, w1, z1);
  vec2 d = (p1.xy - p0.xy) * res;
  float L = length(d);
  d = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-d.y, d.x);
  vec3 p = mix(p0, p1, corner.x);
  vec2 off = (nrm * corner.y + d * (corner.x * 2.0 - 1.0)) * width * 0.5;   // half a width past each end: square joints
  gl_Position = vec4(p.xy + off * 2.0 / res, p.z, 1.0);
  vt = mix(t0, t1, corner.x); vw = mix(w0, w1, corner.x); vz = mix(z0, z1, corner.x);
}`;
// A plain line strip, for orders so fine a quad would be a pixel wide anyway: a quarter of the vertices.
const VS_LINE = HEAD + `
layout(location=1) in vec4 a0;
layout(location=2) in float t0;
void main() {
  float w, z;
  vec3 p = project(a0, w, z);
  gl_Position = vec4(p, 1.0);
  vt = t0; vw = w; vz = z;
}`;

const FS = `#version 300 es
precision highp float;
in float vt; in float vw; in float vz;
uniform int mode;          // 0 the path coloured along it, 1 coloured by w, 2 a flat colour
uniform vec3 flat_;
uniform float sliceOn, w0, thk, pass_;
out vec4 o;
vec3 along(float t) {      // ice → violet → rose → gold, the site's gradient
  vec3 a = vec3(0.435, 0.878, 1.0), b = vec3(0.722, 0.549, 1.0), c = vec3(1.0, 0.525, 0.776), d = vec3(1.0, 0.824, 0.478);
  t = clamp(t, 0.0, 1.0) * 3.0;
  return t < 1.0 ? mix(a, b, t) : t < 2.0 ? mix(b, c, t - 1.0) : mix(c, d, t - 2.0);
}
void main() {
  vec3 c;
  if (mode == 0) c = along(vt);
  else if (mode == 1) {    // ana teal, kata rose, white in between
    float s = clamp(vw / 1.6, -1.0, 1.0);
    c = s > 0.0 ? mix(vec3(0.92), vec3(0.2, 0.9, 0.8), s) : mix(vec3(0.92), vec3(1.0, 0.42, 0.66), -s);
  } else c = flat_;
  c *= mix(1.15, 0.5, clamp((3.0 - vz) / 6.0, 0.0, 1.0));   // nearer (larger z) is brighter
  float inside = sliceOn > 0.5 ? step(abs(vw - w0), thk) : 1.0;
  if (pass_ < 0.5) { if (inside > 0.5) discard; o = vec4(c * 0.55, 0.12); }
  else { if (inside < 0.5) discard; o = vec4(c, 1.0); }
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (const k of ['R', 'persp4', 'zoom', 'width', 'aspect', 'res', 'mode', 'flat_', 'sliceOn', 'w0', 'thk', 'pass_'])
    u[k] = gl.getUniformLocation(p, k);
  return { p, u };
}
const QUADS = program(VS), LINES = program(VS_LINE);
let U = QUADS.u;

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

// A segment list as a VAO: points of 5 floats (x y z w t); `step` is how many points to advance per instance
// (1 for a path, whose segments share endpoints; 2 for separate edges).
function segments(data, step) {
  const vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  const stride = 20 * step;
  [[1, 4, 0], [2, 1, 16], [3, 4, 20], [4, 1, 36]].forEach(([loc, size, off]) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(loc, 1);
  });
  // the same buffer read one point a vertex, for the line strip
  const strip = gl.createVertexArray();
  gl.bindVertexArray(strip);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
  gl.bindVertexArray(null);
  return { vao, strip, buf, count: Math.floor((data.length / 5 - (step === 1 ? 1 : 0)) / step) };
}
const drop = (g) => { if (g) { gl.deleteBuffer(g.buf); gl.deleteVertexArray(g.vao); gl.deleteVertexArray(g.strip); } };

let path = null, frame = null, marker = null;

function build() {
  const pts = curve4(S.n, S.b), N = cellCount(S.n, S.b);
  const data = new Float32Array(N * 5);
  for (let h = 0; h < N; h++) {
    data.set(pts.subarray(h * 4, h * 4 + 4), h * 5);
    data[h * 5 + 4] = N > 1 ? h / (N - 1) : 0;
  }
  drop(path);
  path = segments(data, 1);

  const { verts, edges } = cube4(S.n);
  const e = new Float32Array(edges.length * 10);
  edges.forEach(([a, b], i) => { e.set([...verts[a], 0], i * 10); e.set([...verts[b], 0], i * 10 + 5); });
  drop(frame);
  frame = segments(e, 2);
  if (!marker) marker = segments(new Float32Array(10), 2);
  ui();
}

// ------------------------------------------------------------------- draw --
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}

function transpose(M) {   // hilbert.js is row-major; GLSL reads column-major
  const T = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) T[j * 4 + i] = M[i * 4 + j];
  return T;
}

function draw() {
  const dpr = resize();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.027, 0.031, 0.047, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const Rt = transpose(S.R);
  const use = (P) => {
    gl.useProgram(P.p); U = P.u;
    gl.uniformMatrix4fv(U.R, false, Rt);
    gl.uniform1f(U.persp4, S.proj === 'p' ? 1 : 0);
    gl.uniform1f(U.zoom, S.zoom * (S.n === 4 ? 1 : 1.45));   // the square and cube fill the view like the tesseract
    gl.uniform1f(U.aspect, canvas.width / canvas.height);
    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1f(U.sliceOn, S.slice ? 1 : 0);
    gl.uniform1f(U.w0, S.w0);
    gl.uniform1f(U.thk, S.thk);
  };
  use(QUADS);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const lineW = Math.max(1, 10 * Math.pow(0.6, S.b - 1) * (S.n === 4 ? 1 : S.n === 3 ? 1.2 : 1.5)) * dpr;
  const thin = lineW < 1.8 * dpr;   // a quad this narrow is a line; draw it as one
  const shown = Math.round(S.trace * path.count);

  // Pass 0: what's outside the slice, faint and behind; pass 1: the rest, opaque, depth-tested.
  for (const pass of S.slice ? [0, 1] : [1]) {
    gl.uniform1f(U.pass_, pass);
    if (pass === 0) { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); }
    else { gl.enable(gl.DEPTH_TEST); gl.depthMask(true); }
    gl.uniform1i(U.mode, 2);
    gl.uniform3f(U.flat_, 0.3, 0.32, 0.4);
    gl.uniform1f(U.width, 1.4 * dpr);
    gl.bindVertexArray(frame.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.count);

    if (thin) use(LINES);
    gl.uniform1f(U.pass_, pass);
    gl.uniform1i(U.mode, S.colour === 't' ? 0 : 1);
    gl.uniform1f(U.width, lineW);
    if (shown > 0) {
      if (thin) { gl.bindVertexArray(path.strip); gl.drawArrays(gl.LINE_STRIP, 0, shown + 1); }
      else { gl.bindVertexArray(path.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, shown); }
    }
    if (thin) use(QUADS);
  }

  // The marker: the cell at the head of the trace, drawn over everything.
  if (S.trace < 1 || S.playing) {
    const N = cellCount(S.n, S.b), h = Math.min(N - 1, shown);
    const X = indexToPoint(h, S.n, S.b), s = 1 / 2 ** S.b, p = [0, 0, 0, 0];
    X.forEach((x, j) => { p[j] = (x + 0.5) * s; });
    gl.bindBuffer(gl.ARRAY_BUFFER, marker.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([...p, 1, ...p, 1]));
    gl.disable(gl.DEPTH_TEST);
    gl.uniform1f(U.pass_, 1); gl.uniform1f(U.sliceOn, 0);
    gl.uniform1i(U.mode, 2); gl.uniform3f(U.flat_, 1, 1, 1);
    gl.uniform1f(U.width, Math.max(lineW * 2.2, 7 * dpr));
    gl.bindVertexArray(marker.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
  }
  gl.bindVertexArray(null);
}

// ------------------------------------------------------------------- loop --
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.spin && !dragging) {
    S.R = turn4(S.R, 0, 3, 0.22 * dt);
    S.R = turn4(S.R, 1, 2, 0.13 * dt);
    S.R = turn4(S.R, 2, 3, 0.07 * dt);
  }
  if (S.playing) {
    // a constant number of cells a second, scaled so a whole trace takes 6 s to 40 s whatever the order
    const N = cellCount(S.n, S.b), secs = Math.min(40, Math.max(6, Math.log2(N) * 2.2));
    S.trace = Math.min(1, S.trace + dt / secs);
    if (S.trace >= 1) S.playing = false;
    $('trace').value = Math.round(S.trace * 1000);
    ui();
  }
  draw();
  requestAnimationFrame(tick);
}

// --------------------------------------------------------------- controls --
let dragging = false, px = 0, py = 0;
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  dragging = true; px = e.clientX; py = e.clientY;
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) {   // pinch to zoom
    const [a, b] = [...pointers.values()];
    const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
    const d1 = Math.hypot(a[0] - b[0], a[1] - b[1]), d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
    if (d0 > 0) S.zoom = Math.min(4, Math.max(0.4, S.zoom * d1 / d0));
    return;
  }
  const dx = (e.clientX - px) / canvas.clientWidth * 4, dy = (e.clientY - py) / canvas.clientHeight * 4;
  px = e.clientX; py = e.clientY;
  const intoW = S.drag === 'w' || e.shiftKey;
  if (intoW) { S.R = turn4(S.R, 0, 3, dx); S.R = turn4(S.R, 1, 3, -dy); }
  else { S.R = turn4(S.R, 0, 2, dx); S.R = turn4(S.R, 1, 2, -dy); }
});
const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) dragging = false; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  S.zoom = Math.min(4, Math.max(0.4, S.zoom * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });

function seg(id, key, parse, after) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S[key] = parse(b.dataset.v);
    for (const x of $(id).children) x.classList.toggle('on', x === b);
    if (after) after(); else ui();
  });
}

function orderButtons() {
  const m = maxOrder(S.n), el = $('order');
  if (S.b > m) S.b = m;
  el.innerHTML = '';
  for (let b = 1; b <= m; b++) {
    const btn = document.createElement('button');
    btn.dataset.v = b; btn.textContent = b;
    if (b === S.b) btn.className = 'on';
    el.appendChild(btn);
  }
}

seg('dim', 'n', Number, () => { orderButtons(); build(); });
seg('order', 'b', Number, build);
seg('drag', 'drag', String);
seg('colour', 'colour', String);
seg('proj', 'proj', String);
seg('spin', 'spin', (v) => v === '1');
$('reset').onclick = () => { S.R = rotation4(HOME); S.zoom = 1; };
$('trace').oninput = (e) => { S.trace = e.target.value / 1000; S.playing = false; ui(); };
$('play').onclick = () => {
  if (S.playing) { S.playing = false; }
  else { if (S.trace >= 1) S.trace = 0; S.playing = true; }
  ui();
};
$('slice').onchange = (e) => { S.slice = e.target.checked; ui(); };
$('w').oninput = (e) => { S.w0 = e.target.value / 1000 * 1.8; S.slice = $('slice').checked = true; ui(); };
$('thk').oninput = (e) => { S.thk = e.target.value / 100; S.slice = $('slice').checked = true; ui(); };
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ') { e.preventDefault(); $('play').click(); }
  else if (e.key === 'w') $('drag').children[S.drag === 'w' ? 0 : 1].click();
  else if (e.key === 'r') $('reset').click();
});

// ---------------------------------------------------------------- readout --
const pad = (s, k) => String(s).padStart(k, '0');
function ui() {
  const N = cellCount(S.n, S.b), base = 2 ** S.n, segs = N - 1;
  const shown = Math.round(S.trace * segs);
  $('traceOut').textContent = `${shown.toLocaleString()} of ${segs.toLocaleString()} steps`;
  $('play').textContent = S.playing ? '❚❚ pause' : '▶ trace';
  $('wOut').textContent = (S.w0 >= 0 ? '+' : '') + S.w0.toFixed(2);
  $('thkOut').textContent = (2 * S.thk).toFixed(2);

  const h = Math.min(N - 1, shown), X = indexToPoint(h, S.n, S.b);
  const ds = digits(h, S.n, S.b).map((d) => d.toString(base).toUpperCase());
  const shape = S.n === 4 ? 'tesseract' : S.n === 3 ? 'cube' : 'square';
  $('readout').innerHTML =
    `<b>${N.toLocaleString()}</b> cells of a ${2 ** S.b}<sup>${S.n}</sup> grid · path length <b>${curveLength(S.n, S.b).toLocaleString(undefined, { maximumFractionDigits: 3 })}</b> unit${S.n > 1 ? 's' : ''} in a unit ${shape}<br>` +
    `<span class="k">cell</span> <b>${h.toLocaleString()}</b> <span class="k">base ${base}:</span> <span class="d">${ds.join(' ')}</span><br>` +
    X.map((x, j) => `<span class="k">${AXES[j]}</span> ${pad(x.toString(2), S.b)}`).join('  ') +
    `<br><span class="k">each digit picks one of ${base} sub-${shape}s, a step deeper; each axis's bits read the same way</span>`;

  $('legend').innerHTML = S.colour === 't'
    ? `start<span class="bar" style="background:linear-gradient(90deg,#6fe0ff,#b88cff,#ff86c6,#ffd27a)"></span>end`
    : `kata −w<span class="bar" style="background:linear-gradient(90deg,#ff6ba8,#ebebeb,#33e6cc)"></span>+w ana`;
  if (S.slice) $('legend').innerHTML += ` · slice ${S.w0.toFixed(2)} ± ${S.thk.toFixed(2)} (in a tesseract 2 across)`;
}

orderButtons();
build();
requestAnimationFrame(tick);
