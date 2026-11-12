// MANDELBRACT's page: four 4D Mandelbrot sets, seen through your slice.
//   SOLID: the 3D slice of the set your frame cuts, sphere-traced by a fragment shader on the distance estimates in
//     fractal.js (the shader is their twin, formula for formula). "Cut open" removes the half toward you: the cut face
//     is the 2D plane through the middle of your view, the same picture PLANE shows.
//   PLANE: the 2D slice through the middle of your view, the classic escape-time picture. Squared up on the cz set it is
//     the Mandelbrot set; twist it into w and it turns into the Julia sets.
// One frame for both: the rotation R (rows: your view's x, y, z, w in the set's coordinates), the centre ctr, the size
// that fits, and w0, how far ana your slice sits. The pad and lever are kata's, as in HILBERT⁴.
import { SETS, FRAMES, march } from './fractal.js';
import { rotation4, turn4 } from '../../hilbert/js/hilbert.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

const TILT = [0, 0.55, 0, 0.38, 0, 0];   // a look from above and to the side, nothing turned into w
const S = {
  set: 'cz', view: 'solid', iters: 24, power: 8, colour: 'orbit', cut: false, spin: false,
  R: rotation4(TILT), ctr: FRAMES.cz.ctr.slice(), size: FRAMES.cz.size, w0: 0, zoom: FRAMES.cz.zoom,
};

// ------------------------------------------------------------------ shader --
const VS = `#version 300 es
layout(location=0) in vec2 corner;
out vec2 ndc;
void main() { ndc = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp int;
in vec2 ndc;
uniform int set, maxIter, view, colour, cut;
uniform float power, w0, zk, aspect, size, pix;
uniform vec4 ctr;
uniform mat4 R;
out vec4 o;
const float BAIL = 256.0;

// fractal.js, formula for formula. Each returns the distance estimate (0 if the orbit stays bounded) and writes the
// orbit trap and how many steps it took.
float deCZ(vec4 p, out float trap, out float n) {
  vec2 c = p.xy, z = p.zw, dc = vec2(0.0), d0 = vec2(1.0, 0.0);
  trap = 1e9;
  for (int i = 0; i < 512; i++) {
    if (i >= maxIter) break;
    dc = 2.0 * vec2(z.x * dc.x - z.y * dc.y, z.x * dc.y + z.y * dc.x) + vec2(1.0, 0.0);
    d0 = 2.0 * vec2(z.x * d0.x - z.y * d0.y, z.x * d0.y + z.y * d0.x);
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    float r2 = dot(z, z);
    trap = min(trap, sqrt(r2));
    if (r2 > BAIL * BAIL) {
      float r = sqrt(r2);
      n = float(i) + 1.0 - log2(log(r) / log(BAIL));
      return 0.5 * r * log(r) / sqrt(dot(dc, dc) + dot(d0, d0));
    }
  }
  n = float(maxIter);
  return 0.0;
}
float deM(vec2 c, out float trap, out float n) { return deCZ(vec4(c, 0.0, 0.0), trap, n); }
float deBicomplex(vec4 p, out float trap, out float n) {
  float t1, t2, n1, n2;
  float a = deM(vec2(p.x + p.w, p.y - p.z), t1, n1), b = deM(vec2(p.x - p.w, p.y + p.z), t2, n2);
  trap = min(t1, t2); n = min(n1, n2);
  return length(vec2(a, b)) / 1.41421356;
}
float deQuaternion(vec4 p, out float trap, out float n) {
  vec4 z = vec4(0.0); float dr = 0.0; trap = 1e9;
  for (int i = 0; i < 512; i++) {
    if (i >= maxIter) break;
    dr = 2.0 * length(z) * dr + 1.0;
    z = vec4(z.x * z.x - dot(z.yzw, z.yzw), 2.0 * z.x * z.yzw) + p;
    float r2 = dot(z, z);
    trap = min(trap, sqrt(r2));
    if (r2 > BAIL * BAIL) {
      float r = sqrt(r2);
      n = float(i) + 1.0 - log2(log(r) / log(BAIL));
      return 0.5 * r * log(r) / dr;
    }
  }
  n = float(maxIter);
  return 0.0;
}
float deBulb(vec4 p, out float trap, out float n) {
  vec4 z = p; float dr = 1.0; trap = 1e9;
  for (int i = 0; i < 512; i++) {
    if (i >= maxIter) break;
    float r = length(z);
    trap = min(trap, r);
    if (r > 2.0) { n = float(i); return 0.5 * log(r) * r / dr; }
    dr = power * pow(r, power - 1.0) * dr + 1.0;
    float a = acos(clamp(z.x / max(r, 1e-20), -1.0, 1.0)) * power;
    float b = atan(length(z.zw), z.y) * power;
    float g = atan(z.w, z.z) * power;
    float rn = pow(r, power), sa = sin(a), sb = sin(b);
    z = rn * vec4(cos(a), sa * cos(b), sa * sb * cos(g), sa * sb * sin(g)) + p;
  }
  n = float(maxIter);
  return 0.0;
}
float de(vec4 p, out float trap, out float n) {
  if (set == 0) return deCZ(p, trap, n);
  if (set == 1) return deBicomplex(p, trap, n);
  if (set == 2) return deQuaternion(p, trap, n);
  return deBulb(p, trap, n);
}
// your view → the set: p = ctr + size · Rᵀ q (q * R is Rᵀ q)
vec4 toSet(vec4 q) { return ctr + size * (q * R); }
float deView(vec4 q, out float trap, out float n) { return de(toSet(q), trap, n) / size; }

vec3 along(float t) {
  vec3 a = vec3(0.435, 0.878, 1.0), b = vec3(0.722, 0.549, 1.0), c = vec3(1.0, 0.525, 0.776), d = vec3(1.0, 0.824, 0.478);
  t = fract(t) * 4.0;
  return t < 1.0 ? mix(a, b, t) : t < 2.0 ? mix(b, c, t - 1.0) : t < 3.0 ? mix(c, d, t - 2.0) : mix(d, a, t - 3.0);
}
vec3 anakata(float s) {
  s = clamp(s, -1.0, 1.0);
  return s > 0.0 ? mix(vec3(0.92), vec3(0.2, 0.9, 0.8), s) : mix(vec3(0.92), vec3(1.0, 0.42, 0.66), -s);
}
vec3 inner(float trap) { return mix(vec3(0.05, 0.04, 0.10), along(0.35 + trap * 0.6) * 0.55, clamp(trap * 1.6, 0.0, 1.0)); }
vec3 outer(float n, float d) {
  float t = clamp(n / float(maxIter), 0.0, 1.0);
  vec3 c = vec3(0.027, 0.031, 0.047) + along(0.15 + 2.5 * sqrt(t)) * 0.9 * pow(t, 0.75);
  return c + vec3(0.9, 0.85, 1.0) * 0.45 * exp(-d / (2.5 * pix));   // a glow along the edge
}

void main() {
  vec3 bg = vec3(0.027, 0.031, 0.047);
  float trap, n;
  if (view == 1) {   // PLANE: the 2D slice through the middle of your view
    vec4 q = vec4(ndc.x * aspect / zk, ndc.y / zk, 0.0, w0);
    float d = deView(q, trap, n);
    o = vec4(d == 0.0 ? inner(trap) : outer(n, d), 1.0);
    return;
  }
  // SOLID: the eye at z = 4 in your slice; rays through each pixel
  const float D = 4.0;
  vec3 rd = normalize(vec3(ndc.x * aspect / (D * zk), ndc.y / (D * zk), -1.0));
  vec3 ro = vec3(0.0, 0.0, D);
  // a ball of radius 2.6 holds every set at its fitted size ((c, z₀) reaches |c|, |z₀| = 2)
  float bb = dot(ro, rd), cc = dot(ro, ro) - 2.6 * 2.6, hh = bb * bb - cc;
  if (hh < 0.0) { o = vec4(bg, 1.0); return; }
  float t = max(0.0, -bb - sqrt(hh)), tEnd = -bb + sqrt(hh);
  if (cut == 1) {
    float tc = D / -rd.z;                         // where the ray crosses z = 0
    if (tc > t) {
      t = tc;
      if (t < tEnd) {
        vec3 x = ro + rd * t;
        float d0 = deView(vec4(x, w0), trap, n);
        if (d0 == 0.0) { o = vec4(inner(trap) * 1.25 + vec3(0.02), 1.0); return; }   // the cut face: the plane
      }
    }
  }
  int steps = 0; bool hit = false;
  for (int i = 0; i < 260; i++) {
    if (t > tEnd) break;
    vec3 x = ro + rd * t;
    float d = deView(vec4(x, w0), trap, n);
    float eps = max(1e-5, t * pix * 0.6);
    if (d < eps) { hit = true; break; }
    t += 0.6 * d;
    steps = i;
  }
  if (!hit) { o = vec4(bg, 1.0); return; }
  vec3 x = ro + rd * t;
  // the gradient on your four axes: three in your slice (the cut surface's normal), one out of it (ana or kata)
  float e = max(1e-5, t * pix * 0.5), tr, nn;
  vec4 g = vec4(
    deView(vec4(x + vec3(e, 0, 0), w0), tr, nn) - deView(vec4(x - vec3(e, 0, 0), w0), tr, nn),
    deView(vec4(x + vec3(0, e, 0), w0), tr, nn) - deView(vec4(x - vec3(0, e, 0), w0), tr, nn),
    deView(vec4(x + vec3(0, 0, e), w0), tr, nn) - deView(vec4(x - vec3(0, 0, e), w0), tr, nn),
    deView(vec4(x, w0 + e), tr, nn) - deView(vec4(x, w0 - e), tr, nn));
  vec3 nrm = normalize(g.xyz + vec3(0.0, 0.0, 1e-9));
  float ana = g.w / max(length(g), 1e-9);
  vec3 base = colour == 0 ? along(0.1 + trap * 0.9) : anakata(ana * 1.6);
  vec3 L = normalize(vec3(-0.5, 0.7, 0.8));
  float dif = max(dot(nrm, L), 0.0), spec = pow(max(dot(reflect(-L, nrm), -rd), 0.0), 30.0);
  float ao = 1.0 - float(steps) / 260.0;
  vec3 col = base * (0.18 + 0.82 * dif) * (0.35 + 0.65 * ao * ao) + vec3(0.25) * spec;
  col = mix(col, bg, clamp((t - D + 2.6) / 5.2, 0.0, 1.0) * 0.35);   // a little haze with depth
  o = vec4(col, 1.0);
}`;

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
const U = {};
for (let i = 0, c = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < c; i++) {
  const name = gl.getActiveUniform(prog, i).name; U[name] = gl.getUniformLocation(prog, name);
}
const vao = gl.createVertexArray(), buf = gl.createBuffer();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// ------------------------------------------------------------------- draw --
// A frame costs a lot: draw only when something changed, at half resolution while it's moving, then once sharp.
let dirty = true, lastMove = 0, sharp = false;
const touch = () => { dirty = true; lastMove = performance.now(); sharp = false; };
// NDC per unit of your view, fitted to the narrower side so a phone in portrait sees it all
const zk = () => S.zoom * 0.42 * Math.min(1, (canvas.clientWidth / Math.max(1, canvas.clientHeight)) / 0.85);

function transpose(M) {
  const T = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) T[j * 4 + i] = M[i * 4 + j];
  return T;
}
function draw(scale) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  gl.uniform1i(U.set, SETS.indexOf(S.set));
  gl.uniform1i(U.maxIter, S.iters);
  gl.uniform1i(U.view, S.view === 'plane' ? 1 : 0);
  gl.uniform1i(U.colour, S.colour === 'orbit' ? 0 : 1);
  gl.uniform1i(U.cut, S.cut ? 1 : 0);
  gl.uniform1f(U.power, S.power);
  gl.uniform1f(U.w0, S.w0);
  gl.uniform1f(U.zk, zk());
  gl.uniform1f(U.aspect, w / h);
  gl.uniform1f(U.size, S.size);
  gl.uniform1f(U.pix, 2 / (h * zk()));          // one pixel, in your view's units at the middle
  gl.uniform4f(U.ctr, ...S.ctr);
  gl.uniformMatrix4fv(U.R, false, transpose(S.R));
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ------------------------------------------------------------------- loop --
const pads = { tw: [0, 0], an: 0 };
const keys = new Set();
const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const tx = pads.tw[0] + kv('l', 'j'), ty = pads.tw[1] + kv('i', 'k'), an = pads.an + kv('r', 'f');
  const rate = (35 * Math.PI) / 180;
  if (tx) { S.R = turn4(S.R, 0, 3, -tx * rate * dt); touch(); }
  if (ty) { S.R = turn4(S.R, 1, 3, -ty * rate * dt); touch(); }
  if (an) { S.w0 = Math.max(-1.8, Math.min(1.8, S.w0 + an * 0.5 * dt)); touch(); }
  if (S.spin) { S.R = turn4(S.R, 0, 3, 0.12 * dt); S.R = turn4(S.R, 0, 2, 0.08 * dt); touch(); }
  if (dirty) {
    const moving = now - lastMove < 180 || dragging;
    if (moving) { draw(0.5); dirty = true; }
    else { draw(1); dirty = false; sharp = true; }
    readout();
  }
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
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
    const d1 = Math.hypot(a[0] - b[0], a[1] - b[1]), d0 = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
    if (d0 > 0) { S.zoom = Math.min(400, Math.max(0.3, S.zoom * d1 / d0)); touch(); }
    return;
  }
  const mx = e.clientX - px, my = e.clientY - py;
  const dx = mx / canvas.clientWidth * 3, dy = my / canvas.clientHeight * 3;
  px = e.clientX; py = e.clientY;
  if (S.view === 'plane' && S.drag !== 'w' && !e.shiftKey) {
    // in the plane, dragging slides it under your finger: a pixel is 2/(height·zk) of your view's units
    const k = (2 / (canvas.clientHeight * zk())) * S.size;
    for (let j = 0; j < 4; j++) S.ctr[j] -= k * (mx * S.R[j] - my * S.R[4 + j]);
  } else if (S.drag === 'w' || e.shiftKey) { S.R = turn4(S.R, 0, 3, dx); S.R = turn4(S.R, 1, 3, -dy); }
  else { S.R = turn4(S.R, 0, 2, dx); S.R = turn4(S.R, 1, 2, -dy); }
  touch();
});
const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) { dragging = false; touch(); } };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  S.zoom = Math.min(400, Math.max(0.3, S.zoom * Math.exp(-e.deltaY * 0.0015)));
  touch();
}, { passive: false });

// Double-tap: centre on the point under your finger (the set's surface in SOLID, the plane's point in PLANE) and zoom
// in twice. The march is fractal.js's, the shader's twin, run once on the CPU.
canvas.addEventListener('dblclick', (e) => {
  const r = canvas.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = 1 - ((e.clientY - r.top) / r.height) * 2;
  const aspect = r.width / r.height, Rt = (q) => [0, 1, 2, 3].map((j) => q.reduce((s, v, i) => s + v * S.R[i * 4 + j], 0));
  let p;
  if (S.view === 'plane') {
    const q = [nx * aspect / zk(), ny / zk(), 0, S.w0], d = Rt(q);
    p = S.ctr.map((v, j) => v + S.size * d[j]);
  } else {
    const D = 4, rd3 = [nx * aspect / (D * zk()), ny / (D * zk()), -1], m = Math.hypot(...rd3);
    const ro = S.ctr.map((v, j) => v + S.size * Rt([0, 0, D, S.w0])[j]);
    const rd = Rt(rd3.map((v) => v / m).concat(0));
    const hit = march(S.set, ro, rd, { maxIter: S.iters, power: S.power, tMax: 12 * S.size, eps: 1e-3 * S.size / S.zoom });
    if (!hit) return;
    p = hit.p;
  }
  S.ctr = p; S.w0 = 0; S.zoom *= 2;
  touch();
});

function padDrag(el, onMove, onEnd) {
  let id = null;
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* fine */ } el.classList.add('live'); onMove(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) onMove(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove('live'); onEnd(); touch(); });
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

// presets: where to stand
const PERM = (rows) => { const M = new Float32Array(16); rows.forEach((j, i) => { M[i * 4 + j] = 1; }); return M; };
const PRESETS = {
  solid: () => ({ set: S.set, view: 'solid', R: rotation4(TILT), ctr: FRAMES[S.set].ctr.slice(), w0: 0, zoom: FRAMES[S.set].zoom }),
  mandel: () => ({ set: 'cz', view: 'plane', R: PERM([0, 1, 2, 3]), ctr: [-0.5, 0, 0, 0], w0: 0, zoom: 1 }),
  julia: () => ({ set: 'cz', view: 'plane', R: PERM([2, 3, 0, 1]), ctr: [-0.1226, 0.7449, 0, 0], w0: 0, zoom: 1.15 }),
  between: () => {
    // halfway: your x is Re c and Re z₀ together, your y Im c and Im z₀ together
    const s = Math.SQRT1_2, M = new Float32Array([s, 0, s, 0, 0, s, 0, s, -s, 0, s, 0, 0, -s, 0, s]);
    return { set: 'cz', view: 'plane', R: M, ctr: [-0.25, 0, 0, 0], w0: 0, zoom: 0.9 };
  },
  julia3d: () => ({ set: 'cz', view: 'solid', R: mulRot(PERM([2, 3, 0, 1])), ctr: [-0.1226, 0.7449, 0, 0], w0: 0, zoom: 1.1 }),
};
function mulRot(M) {   // the tilt applied on top of a frame
  const T = rotation4(TILT), C = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += T[i * 4 + k] * M[k * 4 + j]; C[i * 4 + j] = s; }
  return C;
}
function apply(p) {
  Object.assign(S, p);
  if (p.set) S.size = FRAMES[S.set].size;
  syncButtons(); touch();
}

function seg(id, key, parse, after) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    S[key] = parse(b.dataset.v);
    syncButtons();
    if (after) after();
    touch();
  });
}
function syncButtons() {
  for (const [id, key] of [['set', 'set'], ['view', 'view'], ['colour', 'colour'], ['drag', 'drag'], ['cutsw', 'cut'], ['spinsw', 'spin']])
    for (const b of $(id).children) b.classList.toggle('on', String(S[key]) === b.dataset.v);
  document.body.dataset.view = S.view;
  document.body.dataset.set = S.set;
  $('iters').value = S.iters; $('itersOut').textContent = S.iters;
  $('power').value = S.power; $('powerOut').textContent = S.power;
  $('about').innerHTML = ABOUT[S.set];
}
S.drag = '3';
seg('set', 'set', String, () => { apply({ ...PRESETS.solid(), set: S.set, view: S.view }); });
seg('view', 'view', String);
seg('colour', 'colour', String);
seg('drag', 'drag', String);
seg('cutsw', 'cut', (v) => v === 'true');
seg('spinsw', 'spin', (v) => v === 'true');
$('presets').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) apply(PRESETS[b.dataset.p]()); });
$('iters').oninput = (e) => { S.iters = +e.target.value; $('itersOut').textContent = S.iters; touch(); };
$('power').oninput = (e) => { S.power = +e.target.value; $('powerOut').textContent = S.power; touch(); };
$('square').onclick = () => { apply(PRESETS.solid()); };
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'z') $('square').click();
  else if (k === 'v') apply({ view: S.view === 'plane' ? 'solid' : 'plane' });
  else if (k === 'c') apply({ cut: !S.cut });
  else if ('ijklrf'.includes(k) && k.length === 1) { keys.add(k); e.preventDefault(); }
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('resize', touch);

// ---------------------------------------------------------------- readout --
// your view's axes, written in the set's own: what your x, your y and the direction you can't see are made of
function combo(row, axes) {
  const parts = [];
  row.forEach((v, j) => { if (Math.abs(v) > 0.005) parts.push(`${v < 0 ? '−' : parts.length ? '+' : ''}${parts.length && v >= 0 ? ' ' : ''}${Math.abs(v).toFixed(2)} ${axes[j]}`); });
  return parts.join(' ').replace(/\+ /g, '+ ') || '0';
}
function readout() {
  const ax = FRAMES[S.set].axes, row = (i) => [0, 1, 2, 3].map((j) => S.R[i * 4 + j]);
  const N = row(3), off = S.ctr.map((v, j) => v + S.size * S.w0 * N[j]);
  $('readout').innerHTML =
    `<span class="k">your x</span> ${combo(row(0), ax)}<br>` +
    `<span class="k">your y</span> ${combo(row(1), ax)}<br>` +
    `<span class="k">unseen</span> ${combo(N, ax)}<br>` +
    `<span class="k">centre</span> (${off.map((v) => v.toFixed(3)).join(', ')}) · zoom ${S.zoom.toFixed(S.zoom < 10 ? 2 : 0)}×`;
}

const ABOUT = {
  cz: `<b>The real one.</b> Iterate z → z² + c, and let both the parameter <b>c</b> and the starting point <b>z₀</b> vary: two complex numbers, four real dimensions. Nothing new is invented. The plane z₀ = 0 is the Mandelbrot set; the plane through any fixed c is that c's filled Julia set; every picture of either is a slice of this one object. Try <i>Mandelbrot</i>, then twist into w with the pad and watch it become the Julia sets. The fins trailing off past c = −2 are real: for c outside the Mandelbrot set the Julia set is dust, but never empty, so the 4D set goes on for ever as thinning dust; a finite number of iterations draws it as sheets.`,
  bicomplex: `<b>Bicomplex.</b> Numbers z₁ + z₂j with i² = j² = −1 and ij = ji. They commute, but some of them multiply to zero, and that splits every product into two complex products that never talk. So the set is the Mandelbrot set times the Mandelbrot set, a Cartesian product: square-shouldered, and in 3D slices the "tetrabrot".`,
  quaternion: `<b>Quaternions.</b> The one 4D number system you can divide in. But z² = (a² − |b|², 2ab) only sees the <i>length</i> of the imaginary part b, so the set is the Mandelbrot set spun round its real axis. Smooth, and nothing new: it's why the quaternions don't give a 3D Mandelbrot either.`,
  bulb: `<b>The hyperbulb.</b> No number system at all: raise the length to the power n and multiply every angle by n, the Mandelbulb's trick lifted one dimension. Detail everywhere, but no theorem behind it. Your slice at w = 0 is a 3D bulb of the same formula; twist off it and the bulb's sheets wander through w.`,
};

syncButtons();
requestAnimationFrame(tick);
