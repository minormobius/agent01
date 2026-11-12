// HILBERT⁴'s page: draws what hilbert.js computes, two ways.
//   SHADOW: the whole curve projected, 4D → 3D → screen. Each segment an instanced quad as wide as the hypertube's
//     radius makes it at its depth (a line strip when that's under ~2 px); the turn and both perspectives in the shader.
//   SLICE: your 3D slice through the hypertubes, ray-traced. Each pixel's ray lies in the slice; the fragment shader
//     walks it through the 4D grid cell by cell (traceTubes in hilbert.js is its twin, held to brute force by the
//     selftest) and shades the first tube it enters.
// Both share one frame: the rotation R (unit tesseract → your axes) and w0, how far ana your slice is.
import { curve4, cellCount, curveLength, maxOrder, indexToPoint, digits, rotation4, turn4, cube4,
  cellLinks, gridSize } from './hilbert.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

const AXES = 'xyzw';
const HOME = [0.18, 0.62, 0.55, 0.42, 0.35, 0.0];   // xy xz xw yz yw zw: the classic cell-within-a-cell look
const SQUARE = [0.18, 0.62, 0, 0.42, 0, 0];         // the same, with nothing turned into w: your slice is w = const

const S = {
  view: 'shadow', n: 4, b: 2, drag: '3', colour: 't', proj: 'p', spin: true,
  trace: 1, playing: false, band: false, w0: 0, thk: 0.18, zoom: 1, r: 0.12,
  R: rotation4(HOME),
};
const fit = () => (S.n === 4 ? 1 : 1.45);         // the square and cube fill the view like the tesseract
const zk = () => S.zoom * fit() * 0.32;           // NDC per unit of your axes, at the eye's distance

// ------------------------------------------------------------ shadow view --
const HEAD = `#version 300 es
precision highp float;
uniform mat4 R;                          // the 4D turn (applied to centred coordinates)
uniform float persp4, zk, width, rho, aspect;
uniform vec2 res;
out float vt; out float vw; out float vz;
out float vside, va, vL, vW, vrad;       // for round, shaded tubes: across (−1..1), along (px), length, width, radius
// your axes: q = R (p − ½)·2, so the tesseract spans [−1, 1]⁴ before turning
vec3 project(vec4 p, out float w, out float z, out float scale) {
  vec4 q = R * ((p - vec4(0.5)) * 2.0);
  w = q.w;
  float k = persp4 > 0.5 ? 4.0 / (4.0 - q.w) : 1.0;
  vec3 r = q.xyz * k;
  z = r.z;
  float f = 8.0 / (8.0 - r.z);
  scale = k * f * zk;
  return vec3(r.x * f * zk / aspect, r.y * f * zk, -r.z / 8.0);
}
`;
const VS = HEAD + `
layout(location=0) in vec2 corner;      // (s along the segment 0..1, side −1..1)
layout(location=1) in vec4 a0;          // endpoints in the unit tesseract
layout(location=2) in float t0;
layout(location=3) in vec4 a1;
layout(location=4) in float t1;
void main() {
  float w0, w1, z0, z1, s0, s1;
  vec3 p0 = project(a0, w0, z0, s0), p1 = project(a1, w1, z1, s1);
  vec2 d = (p1.xy - p0.xy) * res;
  float L = length(d);
  d = L > 1e-4 ? d / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-d.y, d.x);
  vec3 p = mix(p0, p1, corner.x);
  // the tube's width where it is: rho is its radius on your axes, ×scale into NDC, ×res.y/2 into pixels, ×2 to a
  // width. A fixed width in pixels when rho is 0 (the tesseract's edges, the marker).
  float wpx = rho > 0.0 ? max(1.0, rho * mix(s0, s1, corner.x) * res.y) : width;
  // half a width past each end; the fragment shader rounds those ends off, so every joint is a ball
  float ext = wpx * 0.5;
  vec2 off = nrm * corner.y * wpx * 0.5 + d * (corner.x * 2.0 - 1.0) * ext;
  gl_Position = vec4(p.xy + off * 2.0 / res, p.z, 1.0);
  vt = mix(t0, t1, corner.x); vw = mix(w0, w1, corner.x); vz = mix(z0, z1, corner.x);
  vside = corner.y; va = corner.x * (L + 2.0 * ext) - ext; vL = L; vW = wpx; vrad = rho;
}`;
const VS_LINE = HEAD + `
layout(location=1) in vec4 a0;
layout(location=2) in float t0;
void main() {
  float w, z, s;
  vec3 p = project(a0, w, z, s);
  gl_Position = vec4(p, 1.0);
  vt = t0; vw = w; vz = z;
  vside = 0.0; va = 0.0; vL = 0.0; vW = 1.0; vrad = 0.0;
}`;
const PALETTE = `
vec3 along(float t) {      // ice → violet → rose → gold, the site's gradient
  vec3 a = vec3(0.435, 0.878, 1.0), b = vec3(0.722, 0.549, 1.0), c = vec3(1.0, 0.525, 0.776), d = vec3(1.0, 0.824, 0.478);
  t = clamp(t, 0.0, 1.0) * 3.0;
  return t < 1.0 ? mix(a, b, t) : t < 2.0 ? mix(b, c, t - 1.0) : mix(c, d, t - 2.0);
}
vec3 anakata(float s) {    // ana teal, kata rose, white between; s in [−1, 1]
  s = clamp(s, -1.0, 1.0);
  return s > 0.0 ? mix(vec3(0.92), vec3(0.2, 0.9, 0.8), s) : mix(vec3(0.92), vec3(1.0, 0.42, 0.66), -s);
}
`;
const FS = `#version 300 es
precision highp float;
in float vt; in float vw; in float vz;
in float vside, va, vL, vW, vrad;
uniform int mode;          // 0 the path coloured along it, 1 coloured by w, 2 a flat colour
uniform vec3 flat_;
uniform float bandOn, w0, thk, pass_;
out vec4 o;
${PALETTE}
void main() {
  vec3 c = mode == 0 ? along(vt) : mode == 1 ? anakata(vw / 1.6) : flat_;
  c *= mix(1.15, 0.5, clamp((3.0 - vz) / 6.0, 0.0, 1.0));   // nearer (larger z) is brighter
  float depth = gl_FragCoord.z;
  if (vrad > 0.0) {
    // a tube seen side on: round past its ends, shaded across, and bulging toward you in depth so tubes that
    // cross cut into each other properly
    float hw = 0.5 * vW, dy = vside * hw, dx = va < 0.0 ? va : va > vL ? va - vL : 0.0;
    float r2 = (dx * dx + dy * dy) / (hw * hw);
    if (r2 > 1.0) discard;
    float cz = sqrt(1.0 - r2), lit = max(0.0, 0.55 * cz - 0.45 * dy / hw + 0.3 * dx / hw);
    c = c * (0.28 + 0.72 * lit) + vec3(0.3) * pow(lit, 14.0);
    depth -= cz * vrad / 16.0;
  }
  gl_FragDepth = depth;
  float inside = bandOn > 0.5 ? step(abs(vw - w0), thk) : 1.0;
  if (pass_ < 0.5) { if (inside > 0.5) discard; o = vec4(c * 0.55, 0.12); }
  else { if (inside < 0.5) discard; o = vec4(c, 1.0); }
}`;

// ------------------------------------------------------------- slice view --
const VS_FULL = `#version 300 es
layout(location=0) in vec2 corner;
out vec2 ndc;
void main() { ndc = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;
const FS_SLICE = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
in vec2 ndc;
uniform usampler2D links;
uniform int texW, shown, mode;
uniform ivec4 sz;
uniform vec4 cs;
uniform mat4 R;
uniform float w0, zk, aspect, rho, N1;
out vec4 o;
${PALETTE}
// hilbert.js hitHalf: the capsule body pa→pb and the ball round pa
float hitHalf(vec4 ro, vec4 rd, vec4 pa, vec4 pb, float ra) {
  vec4 ba = pb - pa, oa = ro - pa;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
  float best = 1e30;
  float a = baba - bard * bard;
  if (a > 1e-12) {
    float bq = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - ra * ra * baba, h = bq * bq - a * c;
    if (h >= 0.0) {
      float t = (-bq - sqrt(h)) / a, y = baoa + t * bard;
      if (y >= 0.0 && y <= baba && t >= 0.0) best = t;
    }
  }
  float hh = rdoa * rdoa - (oaoa - ra * ra);
  if (hh >= 0.0) { float t = -rdoa - sqrt(hh); if (t >= 0.0 && t < best) best = t; }
  return best;
}
vec4 endOf(vec4 c, int code) {
  if (code == 15) return c;
  int j = code >> 1;
  vec4 e = vec4(0.0); e[j] = (code & 1) == 1 ? 0.5 : -0.5;
  return c + e * cs;
}
void main() {
  // the eye at z = 8 on your axes, in your slice (w = w0); the ray through this pixel, then into the tesseract's
  // coordinates: p = ½ + Rᵀ q / 2 (v * R is Rᵀ v)
  vec4 qo = vec4(0.0, 0.0, 8.0, w0);
  vec4 qd = vec4(ndc.x * aspect / (8.0 * zk), ndc.y / (8.0 * zk), -1.0, 0.0);
  vec4 ro = vec4(0.5) + (qo * R) * 0.5;
  vec4 rd = normalize(qd * R);
  vec3 bg = vec3(0.027, 0.031, 0.047);
  float t0 = -1e30, t1 = 1e30;
  for (int j = 0; j < 4; j++) {
    if (abs(rd[j]) < 1e-9) { if (ro[j] < 0.0 || ro[j] > 1.0) { o = vec4(bg, 1.0); return; } continue; }
    float a = -ro[j] / rd[j], c = (1.0 - ro[j]) / rd[j];
    t0 = max(t0, min(a, c)); t1 = min(t1, max(a, c));
  }
  if (t1 < max(t0, 0.0)) { o = vec4(bg, 1.0); return; }
  float tStart = max(t0, 0.0);
  // the slice of the tesseract itself, faintly, by how much of it the ray crosses
  vec3 glass = bg + vec3(0.05, 0.06, 0.09) * clamp((t1 - tStart) * 1.4, 0.0, 1.0);
  ivec4 cell; ivec4 stp; vec4 tMax, tDelta;
  for (int j = 0; j < 4; j++) {
    float x = ro[j] + rd[j] * (tStart + 1e-6);
    cell[j] = clamp(int(floor(x / cs[j])), 0, sz[j] - 1);
    stp[j] = rd[j] > 0.0 ? 1 : -1;
    if (abs(rd[j]) < 1e-9) { tMax[j] = 1e30; tDelta[j] = 1e30; }
    else { tMax[j] = (float(cell[j] + (rd[j] > 0.0 ? 1 : 0)) * cs[j] - ro[j]) / rd[j]; tDelta[j] = cs[j] / abs(rd[j]); }
  }
  int limit = sz.x + sz.y + sz.z + sz.w + 4;
  for (int it = 0; it < 2200; it++) {
    if (it >= limit) break;
    float tExit = min(t1, min(min(tMax.x, tMax.y), min(tMax.z, tMax.w)));
    int lin = cell.x + sz.x * (cell.y + sz.y * (cell.z + sz.z * cell.w));
    uint v = texelFetch(links, ivec2(lin % texW, lin / texW), 0).r;
    int h = int(v >> 8u);
    if (h <= shown) {
      vec4 c = (vec4(cell) + 0.5) * cs;
      vec4 pp = endOf(c, int((v >> 4u) & 15u)), pn = endOf(c, int(v & 15u));
      float tp = hitHalf(ro, rd, c, pp, rho);
      float tn = h < shown ? hitHalf(ro, rd, c, pn, rho) : 1e30;
      float t = min(tp, tn);
      if (t <= tExit + 1e-6) {
        bool isNext = tn < tp;
        vec4 pb = isNext ? pn : pp;
        vec4 x = ro + rd * t, ba = pb - c;
        float baba = dot(ba, ba);
        float s = baba > 0.0 ? clamp(dot(x - c, ba) / baba, 0.0, 1.0) : 0.0;
        vec4 core = c + ba * s;
        vec4 nq = R * normalize(x - core);                  // the tube's normal on your axes
        vec3 n = normalize(nq.xyz + vec3(0.0, 0.0, 1e-5));   // its part in your slice: the cut surface's normal
        float along_ = (float(h) + (isNext ? 0.5 : -0.5) * s) / N1;
        float off = (R * ((core - 0.5) * 2.0)).w - w0;        // how far ana of your slice the tube's core runs
        vec3 base = mode == 0 ? along(along_) : anakata(off / (2.0 * rho));
        vec3 L = normalize(vec3(-0.45, 0.6, 1.0)), V = normalize(-qd.xyz);
        float dif = max(dot(n, L), 0.0), spec = pow(max(dot(reflect(-L, n), V), 0.0), 28.0);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
        vec3 col = base * (0.22 + 0.78 * dif) + vec3(0.35) * spec + base * rim * 0.25;
        if (h == shown && float(shown) < N1) col = mix(col, vec3(1.0), 0.65);   // the head of the trace
        o = vec4(col, 1.0);
        return;
      }
    }
    int k = 0; float m = tMax.x;
    if (tMax.y < m) { k = 1; m = tMax.y; }
    if (tMax.z < m) { k = 2; m = tMax.z; }
    if (tMax.w < m) { k = 3; m = tMax.w; }
    if (m > t1) break;
    cell[k] += stp[k];
    if (cell[k] < 0 || cell[k] >= sz[k]) break;
    tMax[k] += tDelta[k];
  }
  o = vec4(glass, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
const QUADS = program(VS, FS), LINES = program(VS_LINE, FS), SLICE = program(VS_FULL, FS_SLICE);
let U = QUADS.u;
const set1f = (k, v) => { if (U[k]) gl.uniform1f(U[k], v); };

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
const full = gl.createVertexArray(), fullBuf = gl.createBuffer();
gl.bindVertexArray(full);
gl.bindBuffer(gl.ARRAY_BUFFER, fullBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.bindVertexArray(null);

// A segment list as VAOs: points of 5 floats (x y z w t); `step` is how many points to advance per instance
// (1 for a path, whose segments share endpoints; 2 for separate edges). `strip` reads the same buffer a point a vertex.
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

let path = null, frame = null, marker = null, linksTex = null, texW = 1;

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

  // the slice view's grid: one word a cell, packed into rows 1024 wide
  const links = cellLinks(S.n, S.b);
  texW = Math.min(1024, N);
  const rows = Math.ceil(N / texW), padded = new Uint32Array(texW * rows);
  padded.set(links);
  if (linksTex) gl.deleteTexture(linksTex);
  linksTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, linksTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, texW, rows, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, padded);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  ui();
}

// ------------------------------------------------------------------- draw --
function resize() {
  // the slice view traces a ray a pixel: cap its resolution lower than the shadow's
  const dpr = Math.min(window.devicePixelRatio || 1, S.view === 'slice' ? 1.5 : 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}

function transpose(M) {   // hilbert.js is row-major; GLSL reads column-major
  const T = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) T[j * 4 + i] = M[i * 4 + j];
  return T;
}

const rhoUnit = () => S.r / 2 ** S.b;   // the tube's radius in the unit tesseract: r of a cell
const shownSteps = () => Math.round(S.trace * (cellCount(S.n, S.b) - 1));

function draw() {
  const dpr = resize();
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.027, 0.031, 0.047, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const Rt = transpose(S.R), aspect = canvas.width / canvas.height;
  if (S.view === 'slice') { drawSlice(Rt, aspect); return; }

  const use = (P) => {
    gl.useProgram(P.p); U = P.u;
    gl.uniformMatrix4fv(U.R, false, Rt);
    set1f('persp4', S.proj === 'p' ? 1 : 0);
    set1f('zk', zk());
    set1f('aspect', aspect);
    if (U.res) gl.uniform2f(U.res, canvas.width, canvas.height);
    set1f('bandOn', S.band ? 1 : 0);
    set1f('w0', S.w0);
    set1f('thk', S.thk);
  };
  use(QUADS);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // the tube's width in pixels near the middle of the view, to choose quads or a line
  const rhoQ = 2 * rhoUnit();                       // the radius on your axes (the tesseract is 2 across)
  const midPx = rhoQ * zk() * canvas.height;
  const thin = midPx < 1.8 * dpr;
  const shown = shownSteps();

  // Pass 0: what's outside the band, faint and behind; pass 1: the rest, opaque, depth-tested.
  for (const pass of S.band ? [0, 1] : [1]) {
    set1f('pass_', pass);
    if (pass === 0) { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); }
    else { gl.enable(gl.DEPTH_TEST); gl.depthMask(true); }
    gl.uniform1i(U.mode, 2);
    gl.uniform3f(U.flat_, 0.3, 0.32, 0.4);
    set1f('rho', 0);
    set1f('width', 1.4 * dpr);
    gl.bindVertexArray(frame.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, frame.count);

    if (thin) use(LINES);
    set1f('pass_', pass);
    gl.uniform1i(U.mode, S.colour === 't' ? 0 : 1);
    set1f('rho', rhoQ);
    if (shown > 0) {
      if (thin) { gl.bindVertexArray(path.strip); gl.drawArrays(gl.LINE_STRIP, 0, shown + 1); }
      else { gl.bindVertexArray(path.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, shown); }
    }
    if (thin) use(QUADS);
  }

  // The marker: the cell at the head of the trace, drawn over everything.
  if (S.trace < 1 || S.playing) {
    const N = cellCount(S.n, S.b), h = Math.min(N - 1, shown);
    const X = indexToPoint(h, S.n, S.b), s = 1 / 2 ** S.b, p = [0.5, 0.5, 0.5, 0.5];
    X.forEach((x, j) => { p[j] = (x + 0.5) * s; });
    gl.bindBuffer(gl.ARRAY_BUFFER, marker.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array([...p, 1, ...p, 1]));
    gl.disable(gl.DEPTH_TEST);
    set1f('pass_', 1); set1f('bandOn', 0);
    gl.uniform1i(U.mode, 2); gl.uniform3f(U.flat_, 1, 1, 1);
    set1f('rho', 0);
    set1f('width', Math.max(Math.min(midPx * 2, 40 * dpr) * 1.4, 7 * dpr));
    gl.bindVertexArray(marker.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 1);
  }
  gl.bindVertexArray(null);
}

function drawSlice(Rt, aspect) {
  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  const u = SLICE.u, sz = gridSize(S.n, S.b);
  gl.useProgram(SLICE.p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, linksTex);
  gl.uniform1i(u.links, 0);
  gl.uniform1i(u.texW, texW);
  gl.uniform1i(u.shown, shownSteps());
  gl.uniform1i(u.mode, S.colour === 't' ? 0 : 1);
  gl.uniform4i(u.sz, ...sz);
  gl.uniform4f(u.cs, ...sz.map((s) => 1 / s));
  gl.uniformMatrix4fv(u.R, false, Rt);
  gl.uniform1f(u.w0, S.w0);
  gl.uniform1f(u.zk, zk());
  gl.uniform1f(u.aspect, aspect);
  gl.uniform1f(u.rho, rhoUnit());
  gl.uniform1f(u.N1, Math.max(1, cellCount(S.n, S.b) - 1));
  gl.bindVertexArray(full);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}

// ------------------------------------------------------------------- loop --
const pads = { tw: [0, 0], an: 0 };
const keys = new Set();
const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.spin && !dragging) {
    S.R = turn4(S.R, 0, 3, 0.22 * dt);
    S.R = turn4(S.R, 1, 2, 0.13 * dt);
    S.R = turn4(S.R, 2, 3, 0.07 * dt);
  }
  // the pad twists your slice into w at up to 35°/s; the lever moves it ana and kata at up to 0.6 a second
  // (the tesseract is 2 across on your axes)
  const tx = pads.tw[0] + kv('l', 'j'), ty = pads.tw[1] + kv('i', 'k'), an = pads.an + kv('r', 'f');
  const rate = (35 * Math.PI) / 180;
  if (tx) S.R = turn4(S.R, 0, 3, -tx * rate * dt);
  if (ty) S.R = turn4(S.R, 1, 3, -ty * rate * dt);
  if (an) setW(S.w0 + an * 0.6 * dt);
  if (S.playing) {
    // a whole trace takes 6 s to 40 s whatever the order
    const N = cellCount(S.n, S.b), secs = Math.min(40, Math.max(6, Math.log2(N) * 2.2));
    S.trace = Math.min(1, S.trace + dt / secs);
    if (S.trace >= 1) S.playing = false;
    $('trace').value = Math.round(S.trace * 1000);
    ui();
  } else if (S.spin || tx || ty) uiFrame();
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
    if (d0 > 0) S.zoom = Math.min(5, Math.max(0.4, S.zoom * d1 / d0));
    return;
  }
  const dx = (e.clientX - px) / canvas.clientWidth * 4, dy = (e.clientY - py) / canvas.clientHeight * 4;
  px = e.clientX; py = e.clientY;
  const intoW = S.drag === 'w' || e.shiftKey;
  if (intoW) { S.R = turn4(S.R, 0, 3, dx); S.R = turn4(S.R, 1, 3, -dy); }
  else { S.R = turn4(S.R, 0, 2, dx); S.R = turn4(S.R, 1, 2, -dy); }
  uiFrame();
});
const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) dragging = false; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  S.zoom = Math.min(5, Math.max(0.4, S.zoom * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });

// the twist pad and the ana/kata lever, as kata has them: held, they turn and move your slice; let go, they spring back
function padDrag(el, onMove, onEnd) {
  let id = null;
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* fine */ } el.classList.add('live'); onMove(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) onMove(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove('live'); onEnd(); });
}
padDrag($('twist'), (e) => {
  const r = $('twist').getBoundingClientRect();
  const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = -(e.clientY - r.top - r.height / 2) / (r.height / 2);
  const m = Math.hypot(dx, dy), k = m > 1 ? 1 / m : 1;
  pads.tw = [dx * k, dy * k];
  $('twistKnob').style.transform = `translate(${dx * k * r.width / 2}px, ${-dy * k * r.height / 2}px)`;
}, () => { pads.tw = [0, 0]; $('twistKnob').style.transform = ''; });
padDrag($('ana'), (e) => {
  const r = $('ana').getBoundingClientRect();
  const dy = Math.max(-1, Math.min(1, -(e.clientY - r.top - r.height / 2) / (r.height / 2)));
  pads.an = dy;
  $('anaKnob').style.transform = `translateY(${-dy * r.height / 2 * 0.8}px)`;
}, () => { pads.an = 0; $('anaKnob').style.transform = ''; });

function setW(w) {
  S.w0 = Math.max(-2, Math.min(2, w));
  $('w').value = Math.round(S.w0 * 500);
  if (S.view === 'shadow' && !S.band) { S.band = true; $('band').checked = true; }
  uiFrame();
}
function squareUp() { S.R = rotation4(SQUARE); setW(0); }

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
function setView(v) {
  S.view = v;
  for (const x of $('view').children) x.classList.toggle('on', x.dataset.v === v);
  document.body.dataset.view = v;
  ui();
}

seg('dim', 'n', Number, () => { orderButtons(); build(); });
seg('order', 'b', Number, build);
seg('drag', 'drag', String);
seg('colour', 'colour', String);
seg('proj', 'proj', String);
seg('spin', 'spin', (v) => v === '1');
$('view').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });
$('reset').onclick = () => { S.R = rotation4(HOME); S.zoom = 1; setW(0); };
$('square').onclick = squareUp;
$('trace').oninput = (e) => { S.trace = e.target.value / 1000; S.playing = false; ui(); };
$('play').onclick = () => {
  if (S.playing) S.playing = false;
  else { if (S.trace >= 1) S.trace = 0; S.playing = true; }
  ui();
};
$('tube').oninput = (e) => { S.r = e.target.value / 100; ui(); };
$('band').onchange = (e) => { S.band = e.target.checked; ui(); };
$('w').oninput = (e) => setW(e.target.value / 500);
$('thk').oninput = (e) => { S.thk = e.target.value / 100; S.band = $('band').checked = true; ui(); };
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); $('play').click(); }
  else if (k === 'z') squareUp();
  else if (k === 'v') setView(S.view === 'slice' ? 'shadow' : 'slice');
  else if (k === 'w') $('drag').children[S.drag === 'w' ? 0 : 1].click();
  else if (k === '0') $('reset').click();
  else if ('ijklrf'.includes(k) && k.length === 1) { keys.add(k); e.preventDefault(); }
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------- readout --
const pad = (s, k) => String(s).padStart(k, '0');
// your slice: how far ana it is, its normal (the direction you can't see) in the tesseract's axes, how far that's
// turned from w
function uiFrame() {
  const N4 = [S.R[12], S.R[13], S.R[14], S.R[15]];
  const ang = (Math.acos(Math.min(1, Math.abs(N4[3]))) * 180) / Math.PI;
  const el = $('frameOut');
  if (el) el.innerHTML = `<span class="k">slice</span> ${S.w0 >= 0 ? '+' : ''}${S.w0.toFixed(2)} ana · <span class="k">normal</span> (${N4.map((v) => v.toFixed(2)).join(', ')}) · ${ang.toFixed(0)}° from w`;
  $('wOut').textContent = (S.w0 >= 0 ? '+' : '') + S.w0.toFixed(2);
  legend();
}
function legend() {
  let s = S.colour === 't'
    ? `start<span class="bar" style="background:linear-gradient(90deg,#6fe0ff,#b88cff,#ff86c6,#ffd27a)"></span>end`
    : S.view === 'slice'
      ? `tube's core kata<span class="bar" style="background:linear-gradient(90deg,#ff6ba8,#ebebeb,#33e6cc)"></span>ana of you`
      : `kata −w<span class="bar" style="background:linear-gradient(90deg,#ff6ba8,#ebebeb,#33e6cc)"></span>+w ana`;
  if (S.view === 'shadow' && S.band) s += ` · band ${S.w0.toFixed(2)} ± ${S.thk.toFixed(2)}`;
  $('legend').innerHTML = s;
}
function ui() {
  const N = cellCount(S.n, S.b), base = 2 ** S.n, segs = N - 1;
  const shown = shownSteps();
  $('traceOut').textContent = `${shown.toLocaleString()} of ${segs.toLocaleString()} steps`;
  $('play').textContent = S.playing ? '❚❚ pause' : '▶ trace';
  $('thkOut').textContent = (2 * S.thk).toFixed(2);
  $('tubeOut').textContent = `${S.r.toFixed(2)} of a cell${S.r >= 0.5 ? ', touching' : ''}`;

  const h = Math.min(N - 1, shown), X = indexToPoint(h, S.n, S.b);
  const ds = digits(h, S.n, S.b).map((d) => d.toString(base).toUpperCase());
  const shape = S.n === 4 ? 'tesseract' : S.n === 3 ? 'cube' : 'square';
  $('readout').innerHTML =
    `<b>${N.toLocaleString()}</b> cells of a ${2 ** S.b}<sup>${S.n}</sup> grid · path length <b>${curveLength(S.n, S.b).toLocaleString(undefined, { maximumFractionDigits: 3 })}</b> in a unit ${shape}<br>` +
    `<span class="k">cell</span> <b>${h.toLocaleString()}</b> <span class="k">base ${base}:</span> <span class="d">${ds.join(' ')}</span><br>` +
    X.map((x, j) => `<span class="k">${AXES[j]}</span> ${pad(x.toString(2), S.b)}`).join('  ') +
    `<br><span class="k">each digit picks one of ${base} sub-${shape}s, a step deeper</span><br><span id="frameOut"></span>`;
  uiFrame();
}

orderButtons();
document.body.dataset.view = S.view;
build();
requestAnimationFrame(tick);
