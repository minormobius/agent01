// MOONLET's page. You ride a bicycle round the outside of a 4-ball of rock 100 m in radius, held by its own weak
// gravity (moonlet.js). A fragment shader ray-traces your 3D slice (your forward, up and right) of the rock, its
// painted roads (the Hopf link and a trefoil), the beacons, the two pebble moons and your bike, all as 4D shapes lit by
// a sun that is a direction in 4D. A 2D overlay projects the forecast of your flight, where it comes down, and the
// beacons; a minimap shows the whole rock as a ball on your own axes.
import * as M from './moonlet.js';
const { dot, add, scale, norm, unit } = M;

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), ov = $('ov'), ctx = ov.getContext('2d');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

const R = M.WORLD.R, DT = 1 / 120;
const SUN = unit([0.55, 0.35, -0.45, 0.6]);
const S = {
  k: M.makeBike(M.START.at, M.START.facing), t: 0, cam: null, lock: 'free', fore: true, auto: matchMedia('(pointer: coarse)').matches,
  mode: 'slalom', sas: true, limiter: true, forces: true, gates: M.GATES.map(() => 0), gateNext: 0, slStart: null, slDone: null, slBest: null, slMiss: 0, prevX: null,
  res: 0.8, taken: new Set(), started: null, done: null, best: null, forecast: null, foreT: 0, escaped: false,
};

// ------------------------------------------------------------------ shader --
const VS = `#version 300 es
layout(location=0) in vec2 corner;
out vec2 ndc;
void main() { ndc = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 ndc;
out vec4 o;
uniform float R, tanH, aspect, time, burn, pebR;
uniform vec4 E, L, U, Rt, Wv, sun;
uniform vec4 bx, bF, bU, bL;            // the bike: position, heading, up (its frame), lean
uniform vec4 beacons[8];
uniform float taken[8];
uniform float next;
uniform vec4 peb[2];
uniform vec4 hillC[8];
uniform vec2 hillAS[8];              // each hill's height A (m) and width s (rad)
uniform vec4 gC[10], gF[10], gA[10], gB[10], gN[10];
uniform float gState[10];            // 0 ahead, 1 passed, 2 missed
uniform float slalom, gNext, gR, gPost;

float hash(vec4 p) {
  p = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p += dot(p, p.wzxy + 33.33);
  return fract((p.x + p.y) * (p.z + p.w));
}
float n4(vec4 x) {
  vec4 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float r = 0.0;
  for (int k = 0; k < 16; k++) {
    vec4 c = vec4(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1), float((k >> 3) & 1));
    vec4 w = mix(1.0 - f, f, c);
    r += hash(i + c) * w.x * w.y * w.z * w.w;
  }
  return r;
}
float capsule(vec4 p, vec4 a, vec4 b, float r) {
  vec4 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
// a wheel: a ring of radius rw in the plane of the bike's heading and up, centred at c
float wheel(vec4 p, vec4 c, float rw, float tube) {
  vec4 q = p - c;
  float a = dot(q, bF), b = dot(q, bU);
  vec4 rest = q - a * bF - b * bU;
  return length(vec2(length(vec2(a, b)) - rw, length(rest))) - tube;
}
// moonlet.js roadDist, twinned: angles on the unit 3-sphere to ring 1, ring 2 and the trefoil
float wrapA(float a) { return a - 6.2831853 * floor(a / 6.2831853 + 0.5); }
vec3 roadDist(vec4 u) {
  float r1 = length(u.xy), r2 = length(u.zw), psi = atan(r2, r1);
  float al = atan(u.y, u.x), be = atan(u.w, u.z);
  float across = abs(wrapA(3.0 * al - 2.0 * be)) / sqrt(13.0) * 0.70710678;
  return vec3(psi, 1.5707963 - psi, length(vec2(psi - 0.78539816, across)));
}

// moonlet.js roadPt, twinned: the nearest point of road j to u
vec4 roadPt(int j, vec4 u) {
  if (j == 0) return vec4(normalize(u.xy), 0.0, 0.0);
  if (j == 1) return vec4(0.0, 0.0, normalize(u.zw));
  float al = atan(u.y, u.x), be = atan(u.w, u.z), c = wrapA(3.0 * al - 2.0 * be);
  float a2 = al - 3.0 * c / 13.0, b2 = be + 2.0 * c / 13.0;
  return vec4(cos(a2), sin(a2), cos(b2), sin(b2)) * 0.70710678;
}
// moonlet.js height, twinned: the hills, h = Σ A·exp(−θ²/s²), θ = 2·asin(|û − c|/2)
float heightAt(vec4 u) {
  float h = 0.0;
  for (int i = 0; i < 8; i++) { float th = 2.0 * asin(min(1.0, 0.5 * length(u - hillC[i]))); h += hillAS[i].x * exp(-th * th / (hillAS[i].y * hillAS[i].y)); }
  return h;
}
// a slalom gate: a ring of radius gR across the course (in the plane of its A and B), standing gPost tall
float gateD(vec4 p, int i) {
  vec4 q = p - gC[i];
  float lq = length(q);
  if (lq > gR + gPost + 1.5) return lq - (gR + gPost + 1.0);
  float along = dot(q, gF[i]), up = dot(q, gN[i]), rad = length(vec2(dot(q, gA[i]), dot(q, gB[i])));
  float dy = up - clamp(up, 0.0, gPost);
  return length(vec3(along, rad - gR, dy)) - 0.14;
}
vec4 lu() { return normalize(bU + bL); }   // the bike's up, leaning into its turn
float bikeD(vec4 p) {
  vec4 up = lu();
  float rw = 0.34;
  vec4 wa = bx + bF * 0.55 + up * rw, wb = bx - bF * 0.55 + up * rw;
  float d = min(wheel(p, wa, rw, 0.05), wheel(p, wb, rw, 0.05));
  vec4 seat = bx + up * 0.95 - bF * 0.12, bars = bx + up * 1.0 + bF * 0.42;
  d = min(d, capsule(p, wb, seat, 0.05));
  d = min(d, capsule(p, wa, bars, 0.05));
  d = min(d, capsule(p, seat, bars, 0.05));
  d = min(d, capsule(p, seat, bx + up * 1.55 + bF * 0.18, 0.17));          // the rider
  d = min(d, length(p - (bx + up * 1.78 + bF * 0.24)) - 0.15);              // helmet
  d = min(d, capsule(p, bx + up * 0.75 - bF * 0.35, bx + up * 0.75 - bF * 0.85, 0.11));   // the rocket
  return d;
}
float beaconD(vec4 p, vec4 b) { return capsule(p, b * R, b * (R + 6.0), 0.45); }
// the whole scene: distance and what was hit (0 rock, 1 bike, 2 beacon, 3 moon)
vec2 scene(vec4 p) {
  float lp = length(p);
  vec2 r = vec2(0.85 * (lp - R - (lp < R + 14.0 ? heightAt(p / lp) : 0.0)), 0.0);   // the ground, hills and all (0.85: the slopes)
  float d = length(p - bx) - 2.4;                                   // the bike's bounding ball first
  if (d < r.x) { d = d < 0.3 ? bikeD(p) : d; if (d < r.x) r = vec2(d, d < 0.3 ? 1.0 : 9.0); }
  if (length(p) < R + 8.0)
    for (int i = 0; i < 8; i++) { if (taken[i] > 0.5) continue; d = beaconD(p, beacons[i]); if (d < r.x) r = vec2(d, 2.0 + float(i) * 0.01); }
  for (int i = 0; i < 2; i++) { d = length(p - peb[i]) - pebR; if (d < r.x) r = vec2(d, 3.0 + float(i) * 0.1); }
  if (slalom > 0.5 && lp < R + 20.0)
    for (int i = 0; i < 10; i++) { d = gateD(p, i); if (d < r.x) r = vec2(d, 4.0 + float(i) * 0.01); }
  return r;
}
vec4 normalAt(vec4 p) {
  const float e = 0.004;
  return normalize(vec4(
    scene(p + vec4(e, 0, 0, 0)).x - scene(p - vec4(e, 0, 0, 0)).x,
    scene(p + vec4(0, e, 0, 0)).x - scene(p - vec4(0, e, 0, 0)).x,
    scene(p + vec4(0, 0, e, 0)).x - scene(p - vec4(0, 0, e, 0)).x,
    scene(p + vec4(0, 0, 0, e)).x - scene(p - vec4(0, 0, 0, e)).x));
}
// shadow: march toward the sun (a 4D direction, so this ray leaves your slice) against the bike, beacons, moons
float shadow(vec4 p) {
  float t = 0.05, s = 1.0;
  for (int i = 0; i < 28; i++) {
    vec4 q = p + sun * t;
    float d = bikeD(q);
    for (int j = 0; j < 8; j++) if (taken[j] < 0.5) d = min(d, beaconD(q, beacons[j]));
    s = min(s, 8.0 * d / t);
    t += clamp(d, 0.05, 2.0);
    if (s < 0.01 || t > 40.0) break;
  }
  return clamp(s, 0.0, 1.0);
}
vec3 sky(vec4 d) {
  vec3 c = vec3(0.004, 0.005, 0.012);
  vec4 cell = floor(d * 90.0), f = fract(d * 90.0) - 0.5;
  float h = hash(cell);
  if (h > 0.985) { float s = smoothstep(0.32, 0.0, length(f)); c += s * mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.6), hash(cell + 3.1)) * (h - 0.985) * 60.0; }
  float g = max(dot(d, sun), 0.0);
  c += vec3(1.0, 0.9, 0.7) * (pow(g, 1500.0) * 6.0 + pow(g, 40.0) * 0.06);
  return c;
}
void main() {
  vec4 d = normalize(L + ndc.x * aspect * tanH * Rt + ndc.y * tanH * U);
  float t = 0.0; vec2 h = vec2(1e9, -1.0);
  float glow = 0.0;
  for (int i = 0; i < 120; i++) {
    vec4 p = E + d * t;
    h = scene(p);
    if (h.x < 0.002 * t + 0.002) {
      if (h.y < 8.5) break;
      h = vec2(bikeD(p), 1.0);                       // stopped on the bike's bounding ball: look at the bike itself
      if (h.x < 0.002 * t + 0.002) break;
    }
    // the flame and the beacons' halo, gathered along the ray
    if (burn > 0.5) { vec4 up = lu(); float f = capsule(p, bx + up * 0.75 - bF * 0.9, bx + up * 0.75 - bF * (1.7 + 0.25 * sin(time * 40.0)), 0.06); glow += 0.04 / (0.02 + f * f) * min(h.x, 0.5); }
    t += h.x;
    if (t > 1600.0) { h.y = -1.0; break; }
  }
  vec3 col;
  vec3 halo = vec3(1.0, 0.55, 0.2) * glow * 0.12;
  if (h.y < 0.0 || t > 1600.0) { o = vec4(pow(sky(d) + halo, vec3(0.9)), 1.0); return; }
  vec4 p = E + d * t, n = normalAt(p);
  float sh = h.y < 0.5 ? shadow(p + n * 0.02) : 1.0;
  float lam = max(dot(n, sun), 0.0) * sh;
  if (h.y < 0.5) {
    // the rock: regolith with darker maria and fine grain; the roads painted on
    vec4 u = normalize(p);
    float m = n4(u * 6.0 + 3.0), grain = n4(u * 140.0);
    vec3 base = mix(vec3(0.33, 0.31, 0.29), vec3(0.52, 0.49, 0.45), smoothstep(0.35, 0.65, m)) * (0.85 + 0.3 * grain);
    vec3 rd = roadDist(u) * R;                        // metres to each road
    // the roads: tubes in the three-dimensional surface, 5 m across. Your slice cuts across a tube; its kerbs are
    // coloured by which side of the centre they lie against your slice (tailspin's, and the habitat's): teal ana,
    // pink kata, white in it. Teal kerbs: you're ana of the road, lean kata. The centre line, in the road's own
    // colour, shows only where your slice runs through the middle.
    int jb = -1; float db = 1e9;
    for (int j = 0; j < 3; j++) if (rd[j] < db) { db = rd[j]; jb = j; }
    float half_ = 2.5;
    float emit = 0.0;
    if (db < half_) {
      vec3 cs[3]; cs[0] = vec3(0.55, 0.9, 1.0); cs[1] = vec3(0.75, 0.6, 1.0); cs[2] = vec3(1.0, 0.8, 0.42);
      vec4 q = roadPt(jb, u), off = u - q;
      float along = jb == 0 ? atan(u.y, u.x) * R : jb == 1 ? atan(u.w, u.z) * R : atan(q.y, q.x) * 0.5 * R * 2.5495;
      base = vec3(0.15, 0.15, 0.17) * (0.9 + 0.2 * grain);
      if (db > half_ - 0.6) {
        float sd = dot(off, Wv) / max(length(off), 1e-9);
        vec3 kerb = sd > 0.0 ? mix(vec3(0.93), vec3(0.22, 0.9, 0.85), smoothstep(0.1, 0.8, sd)) : mix(vec3(0.93), vec3(1.0, 0.42, 0.68), smoothstep(0.1, 0.8, -sd));
        base = kerb * (0.8 + 0.2 * step(0.5, fract(along / 2.0)));
        emit = 0.35;
      } else if (db < 0.14 && fract(along / 5.0) > 0.45) { base = cs[jb]; emit = 0.5; }
    }
    col = base * (0.05 + 1.1 * lam) + base * emit * 0.3;
  } else if (h.y < 1.5) {
    col = vec3(0.92, 0.9, 0.86) * (0.12 + 0.9 * lam);
    // the rider's jersey: rose
    if (length(p - (bx + lu() * 1.3)) < 0.45) col = vec3(1.0, 0.45, 0.7) * (0.15 + 0.9 * lam);
  } else if (h.y < 2.5) {
    int i = int((h.y - 2.0) * 100.0 + 0.5);
    float isNext = abs(float(i) - next) < 0.5 ? 1.0 : 0.0;
    float pulse = 0.6 + 0.4 * sin(time * 4.0);
    col = mix(vec3(0.95, 0.85, 0.5), vec3(1.0, 0.95, 0.7), isNext) * (0.35 + 0.7 * lam + isNext * 0.5 * pulse);
  } else if (h.y > 3.95) {
    // a gate's posts: coloured like the kerbs, by which side of the gate's centre they stand against your slice
    // (teal ana, pink kata, white in it); passed gates green, missed red, the next one bright
    int i = int((h.y - 4.0) * 100.0 + 0.5);
    vec4 q = p - gC[i], off = dot(q, gA[i]) * gA[i] + dot(q, gB[i]) * gB[i];
    float sd = dot(off, Wv) / max(length(off), 1e-6);
    vec3 c = sd > 0.0 ? mix(vec3(0.95), vec3(0.22, 0.9, 0.85), smoothstep(0.1, 0.8, sd)) : mix(vec3(0.95), vec3(1.0, 0.42, 0.68), smoothstep(0.1, 0.8, -sd));
    float st = gState[i], isNext = abs(float(i) - gNext) < 0.5 ? 1.0 : 0.0;
    if (st > 1.5) c = vec3(0.6, 0.15, 0.12); else if (st > 0.5) c = vec3(0.25, 0.75, 0.35);
    float band = step(0.5, fract(dot(q, gN[i]) / 0.8));
    col = c * (0.3 + 0.7 * lam + 0.35 * isNext * (0.7 + 0.3 * sin(time * 5.0))) * (0.85 + 0.15 * band);
  } else {
    float m = n4(p * 0.6);
    col = mix(vec3(0.35, 0.33, 0.4), vec3(0.6, 0.55, 0.62), m) * (0.04 + 1.0 * lam);
  }
  float fog = 1.0 - exp(-t * 0.0006);
  col = mix(col, vec3(0.01, 0.012, 0.03), fog * 0.3);
  o = vec4(pow(col + halo, vec3(0.9)), 1.0);
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
const Un = {};
for (let i = 0, c = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < c; i++) {
  const nm = gl.getActiveUniform(prog, i).name;
  Un[nm.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, nm);
}
const vao = gl.createVertexArray(), buf = gl.createBuffer();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// ------------------------------------------------------------------ camera --
// Behind and above the bike in its slice (heading, up, right; N hidden). The heading and up the camera uses ease after
// the bike's (so a landing or a gyro turn doesn't snap the view), then are made orthonormal with the across pair.
const TAN = Math.tan((64 * Math.PI) / 360);
function gsFrame(vs) {
  const out = [];
  for (const v0 of vs) { let v = v0; for (const u of out) v = add(v, u, -dot(v, u)); if (norm(v) < 1e-6) for (const ax of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]) { v = ax; for (const u of out) v = add(v, u, -dot(v, u)); if (norm(v) > 0.3) break; } out.push(unit(v)); }
  return out;
}
function camera(dt) {
  const k = S.k;
  const wantU = unit(add(k.U, k.lean, 0.6)), wantF = k.F;
  if (!S.cam) S.cam = { F: wantF, U: wantU };
  const a = 1 - Math.exp(-dt * 5);
  S.cam.U = unit(add(scale(S.cam.U, 1 - a), wantU, a));
  S.cam.F = unit(add(scale(S.cam.F, 1 - a), wantF, a));
  const [u, f, right, w] = gsFrame([S.cam.U, S.cam.F, k.Rt, k.N]);
  const alt = Math.max(0, norm(k.x) - R);
  const back = 6.5 + Math.min(25, alt * 0.15), high = 2.4 + Math.min(30, alt * 0.35);   // higher up, the camera rises over the bike
  const eye = add(add(add(k.x, u, high), f, -back), right, 1.6);
  // look down by the horizon's dip (acos R/r: how far below level the rock's edge is) so the rock stays in view
  const pitch = Math.min(0.2 + 0.85 * Math.acos(Math.min(1, R / (R + alt + high))), Math.atan2(high, back) + 0.35);   // never so far the bike leaves the frame
  const look = unit(add(add(scale(f, Math.cos(pitch)), u, -Math.sin(pitch)), right, -1.6 / back));
  // an orthonormal frame for the view: up and right made square to look (the shader and the overlay both assume it)
  const [, upO, rightO, wO] = gsFrame([look, u, right, w]);
  return { eye, look, up: upO, right: rightO, w: wO };
}

let lastCam = null;
function draw(dt) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25) * S.res;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  const cam = camera(dt); lastCam = cam;
  const k = S.k;
  gl.uniform1f(Un.R, R); gl.uniform1f(Un.tanH, TAN); gl.uniform1f(Un.aspect, w / h); gl.uniform1f(Un.time, performance.now() / 1000);
  gl.uniform1f(Un.burn, k.burning ? 1 : 0); gl.uniform1f(Un.pebR, M.PEBBLE.size);
  gl.uniform4f(Un.E, ...cam.eye); gl.uniform4f(Un.L, ...cam.look); gl.uniform4f(Un.U, ...cam.up); gl.uniform4f(Un.Rt, ...cam.right); gl.uniform4f(Un.Wv, ...cam.w);
  gl.uniform4f(Un.sun, ...SUN);
  gl.uniform4f(Un.bx, ...k.x); gl.uniform4f(Un.bF, ...k.F); gl.uniform4f(Un.bU, ...k.U); gl.uniform4f(Un.bL, ...scale(k.lean, 1));
  gl.uniform4fv(Un.beacons, new Float32Array(M.BEACONS.flatMap((b) => b.p)));
  gl.uniform1fv(Un.taken, new Float32Array(M.BEACONS.map((b) => (S.mode !== 'beacons' || S.taken.has(b.name) ? 1 : 0))));
  const nx = nextBeacon();
  gl.uniform1f(Un.next, nx ? M.BEACONS.indexOf(nx) : -1);
  gl.uniform4fv(Un.peb, new Float32Array(M.pebbles(S.t).flat()));
  const hills = Array.from({ length: 8 }, (_, i) => M.HILLS[i] || { c: [1, 0, 0, 0], A: 0, s: 1 });
  gl.uniform4fv(Un.hillC, new Float32Array(hills.flatMap((h) => h.c)));
  gl.uniform2fv(Un.hillAS, new Float32Array(hills.flatMap((h) => [h.A, h.s])));
  for (const [u, f] of [['gC', 'c'], ['gF', 'F'], ['gA', 'A'], ['gB', 'B'], ['gN', 'n']]) gl.uniform4fv(Un[u], new Float32Array(M.GATES.flatMap((G) => G[f])));
  gl.uniform1fv(Un.gState, new Float32Array(S.gates));
  gl.uniform1f(Un.slalom, S.mode === 'slalom' ? 1 : 0); gl.uniform1f(Un.gNext, S.gateNext);
  gl.uniform1f(Un.gR, M.COURSE.r); gl.uniform1f(Un.gPost, M.COURSE.post);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  overlay(cam);
  drawMap();
}

// ------------------------------------------------------------------ overlay --
function project(cam, p, W, Hh) {
  const rel = add(p, cam.eye, -1), f = dot(rel, cam.look);
  const x = dot(rel, cam.right), y = dot(rel, cam.up);
  return { x: W / 2 + (x / Math.max(f, 1e-3)) * (Hh / 2) / TAN, y: Hh / 2 - (y / Math.max(f, 1e-3)) * (Hh / 2) / TAN, f, w: dot(rel, cam.w), dist: norm(rel) };
}
/** Is p behind the rock from the eye? (the segment eye→p passes inside the 4-ball) */
function hidden(eye, p) {
  const d = add(p, eye, -1), t = Math.max(0, Math.min(1, -dot(eye, d) / dot(d, d)));
  return norm(add(eye, d, t)) < R - 0.5;
}
const wcol = (w, near = 1) => (Math.abs(w) < near ? 'rgba(255,255,255,0.9)' : w > 0 ? '#38f2e0' : '#ff66b8');
function overlay(cam) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = ov.clientWidth, Hh = ov.clientHeight;
  if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(Hh * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(Hh * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, Hh);
  ctx.font = '600 11px ui-monospace, monospace'; ctx.textAlign = 'center';
  // the forecast: where you'll fly with the rocket off; ✕ where you'll come down
  const fc = S.forecast;
  if (S.fore && fc && !S.k.ground) {
    ctx.lineWidth = 2;
    let prev = null;
    for (const p of fc.pts) {
      const q = project(cam, p, W, Hh);
      q.hid = hidden(cam.eye, p);
      if (q.f > 0.5 && prev && prev.f > 0.5) {
        ctx.strokeStyle = wcol(q.w); ctx.globalAlpha = q.hid ? 0.3 : 1; ctx.setLineDash(q.hid ? [4, 5] : []);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      prev = q;
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    if (fc.impact) {
      const q = project(cam, fc.impact.x, W, Hh);
      ctx.globalAlpha = hidden(cam.eye, add(fc.impact.x, unit(fc.impact.x), 0.6)) ? 0.4 : 1;
      if (q.f > 0.5) {
        ctx.strokeStyle = ctx.fillStyle = '#ffd27a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(q.x - 7, q.y - 7); ctx.lineTo(q.x + 7, q.y + 7); ctx.moveTo(q.x + 7, q.y - 7); ctx.lineTo(q.x - 7, q.y + 7); ctx.stroke();
        ctx.fillText(`down in ${Math.max(0, fc.impact.t - S.foreAge).toFixed(0)} s`, q.x, q.y + 20);
      }
      ctx.globalAlpha = 1;
    }
  }
  // the beacons: the next one ringed and named (or an arrow at the edge); the others small
  const nx = nextBeacon();
  for (const b of S.mode === 'beacons' ? M.BEACONS : []) {
    if (S.taken.has(b.name)) continue;
    const top = scale(b.p, R + 6.6), q = project(cam, top, W, Hh), isNext = b === nx;
    const on = q.f > 0.5 && q.x > 16 && q.x < W - 16 && q.y > 16 && q.y < Hh - 16;
    const dist = R * Math.acos(Math.max(-1, Math.min(1, dot(unit(S.k.x), b.p))));
    if (on) {
      ctx.globalAlpha = hidden(cam.eye, top) ? 0.35 : 1;
      ctx.fillStyle = ctx.strokeStyle = wcol(q.w, 2);
      if (isNext) { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, 2 * Math.PI); ctx.stroke(); }
      const off = Math.abs(q.w) < 2 ? '' : q.w > 0 ? ` ▲ ana ${q.w.toFixed(0)} m` : ` ▼ kata ${(-q.w).toFixed(0)} m`;
      ctx.fillText(`${b.name}${isNext ? ` ${dist.toFixed(0)} m${off}` : ''}`, q.x, q.y - 13);
      ctx.globalAlpha = 1;
    } else if (isNext) {
      let dx = q.x - W / 2, dy = q.y - Hh / 2;
      if (q.f <= 0.5) { dx = -dx; dy = -dy; }
      const m = Math.hypot(dx, dy) || 1, ex = W / 2 + (dx / m) * (Math.min(W, Hh) / 2 - 30), ey = Hh / 2 + (dy / m) * (Math.min(W, Hh) / 2 - 30);
      ctx.fillStyle = wcol(q.w, 2);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(dy, dx)); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-7, -9); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillText(`${b.name} ${dist.toFixed(0)} m`, ex, ey + 22);
    }
  }
  // the next gate: its name, distance, and how far ana or kata of your slice its centre lies
  if (S.mode === 'slalom') {
    const G = M.GATES[S.gateNext];
    if (G) {
      const top = add(G.c, G.n, M.COURSE.post + 0.8), q = project(cam, top, W, Hh);
      const wOff = dot(add(G.c, S.k.x, -1), cam.w), d = norm(add(G.c, S.k.x, -1));
      const lab = `GATE ${S.gateNext + 1} · ${d.toFixed(0)} m${Math.abs(wOff) < 0.5 ? '' : wOff > 0 ? ` · ▲ ana ${wOff.toFixed(1)} m` : ` · ▼ kata ${(-wOff).toFixed(1)} m`}`;
      ctx.fillStyle = wcol(wOff, Math.min(0.5, M.COURSE.r));
      const on = q.f > 0.5 && q.x > 20 && q.x < W - 20 && q.y > 20 && q.y < Hh - 20;
      if (on) { ctx.globalAlpha = hidden(cam.eye, top) ? 0.4 : 1; ctx.fillText(lab, q.x, q.y - 6); ctx.globalAlpha = 1; }
      else {
        let dx = q.x - W / 2, dy = q.y - Hh / 2;
        if (q.f <= 0.5) { dx = -dx; dy = -dy; }
        const m = Math.hypot(dx, dy) || 1, ex = W / 2 + (dx / m) * (Math.min(W, Hh) / 2 - 30), ey = Hh / 2 + (dy / m) * (Math.min(W, Hh) / 2 - 30);
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(dy, dx)); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-7, -9); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillText(lab, ex, ey + 22);
      }
    }
  }
  // the forces on the bike, as computed this step: arrows from its middle, 1 m per 25 N
  if (S.forces && S.k.forces) {
    const k = S.k, o = add(k.x, k.U, 0.9), f = k.forces;
    const arrows = [['gravity', f.gravity, '#ffd27a'], ['ground', f.normal, '#e9e4da'], ['tyres', f.tyre, '#6fe0ff'], ['rocket', f.thrust, '#ff9a5a']];
    ctx.lineWidth = 2.5; ctx.font = '600 10px ui-monospace, monospace';
    const a = project(cam, o, W, Hh);
    for (const [name, F, col] of arrows) {
      const mag = norm(F);
      if (mag < 0.5 || a.f < 0.5) continue;
      const b = project(cam, add(o, F, 1 / 25), W, Hh);
      if (b.f < 0.5) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y);
      ctx.strokeStyle = ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (len > 6) { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - 8 * Math.cos(ang - 0.4), b.y - 8 * Math.sin(ang - 0.4)); ctx.lineTo(b.x - 8 * Math.cos(ang + 0.4), b.y - 8 * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill(); }
      ctx.fillText(`${name} ${mag.toFixed(0)} N`, b.x + 8 * Math.cos(ang), b.y + 8 * Math.sin(ang) + 4);
    }
    ctx.font = '600 11px ui-monospace, monospace';
  }
  // the moons
  M.pebbles(S.t).forEach((p, i) => {
    const q = project(cam, p, W, Hh);
    if (q.f > 1 && q.x > 0 && q.x < W && q.y > 0 && q.y < Hh) { ctx.fillStyle = wcol(q.w, M.PEBBLE.size); ctx.fillText(`moon ${i + 1}`, q.x, q.y - 14 - (M.PEBBLE.size * (Hh / 2)) / TAN / q.f); }
  });
}

// ---------------------------------------------------------------- the map --
// The whole rock as a ball on your own axes (habitat.js mapOf: the 3-sphere's log at you): forward up the map, right to
// the right, ana tilted toward you. Roads, beacons, the forecast's ground track, and you at the centre.
const mapCv = $('map'), mctx = mapCv.getContext('2d');
const ROADPTS = Object.entries(M.ROADS).map(([n, f]) => ({ n, pts: Array.from({ length: 241 }, (_, i) => f((2 * Math.PI * i) / 240)) }));
const ROADCOL = { ring1: '#6fe0ff', ring2: '#b28cff', trefoil: '#ffd27a' };
function drawMap() {
  const size = mapCv.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (mapCv.width !== Math.round(size * dpr)) { mapCv.width = mapCv.height = Math.round(size * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, size, size);
  const k = S.k, xh = unit(k.x), fr = [k.F, k.Rt, k.N], sc = (size * 0.46) / (Math.PI * R), pitch = 0.7;
  const P = (m) => ({ x: size / 2 + sc * m[1], y: size / 2 - sc * (m[0] * Math.cos(pitch) + m[2] * Math.sin(pitch)), w: m[2], r: Math.hypot(...m) });
  const at = (u) => P(M.mapOf(xh, fr, u, R));
  mctx.fillStyle = 'rgba(7,8,12,0.55)'; mctx.beginPath(); mctx.arc(size / 2, size / 2, size * 0.47, 0, 2 * Math.PI); mctx.fill();
  mctx.strokeStyle = 'rgba(255,255,255,0.2)'; mctx.stroke();
  mctx.lineWidth = 1.2;
  for (const rd of ROADPTS) {
    mctx.strokeStyle = ROADCOL[rd.n]; mctx.globalAlpha = 0.55; mctx.beginPath();
    let prev = null;
    for (const u of rd.pts) { const q = at(u); if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) < size * 0.3) { mctx.moveTo(prev.x, prev.y); mctx.lineTo(q.x, q.y); } prev = q; }
    mctx.stroke();
  }
  mctx.globalAlpha = 1;
  const nx = nextBeacon();
  for (const b of M.BEACONS) {
    if (S.taken.has(b.name)) continue;
    const q = at(b.p);
    mctx.fillStyle = b === nx ? '#ffd27a' : 'rgba(255,210,122,0.5)';
    mctx.beginPath(); mctx.arc(q.x, q.y, b === nx ? 4 : 2.5, 0, 2 * Math.PI); mctx.fill();
  }
  if (S.mode === 'slalom') M.GATES.forEach((G, i) => {
    const q = at(unit(G.c));
    mctx.strokeStyle = S.gates[i] === 1 ? '#5c5' : S.gates[i] === 2 ? '#c44' : i === S.gateNext ? '#fff' : 'rgba(255,255,255,0.45)';
    mctx.lineWidth = i === S.gateNext ? 2 : 1; mctx.beginPath(); mctx.arc(q.x, q.y, i === S.gateNext ? 4 : 3, 0, 2 * Math.PI); mctx.stroke();
  });
  mctx.lineWidth = 1.2;
  if (S.forecast && !k.ground) {
    mctx.strokeStyle = 'rgba(255,255,255,0.8)'; mctx.beginPath();
    let prev = null;
    for (const p of S.forecast.pts) { const q = at(unit(p)); if (prev && Math.hypot(q.x - prev.x, q.y - prev.y) < size * 0.3) { mctx.moveTo(prev.x, prev.y); mctx.lineTo(q.x, q.y); } prev = q; }
    mctx.stroke();
  }
  const o = P([0, 0, 0]), f = P([R * 0.4, 0, 0]);
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(o.x, o.y); mctx.lineTo(f.x, f.y); mctx.stroke();
  mctx.fillStyle = '#ff86c6'; mctx.beginPath(); mctx.arc(o.x, o.y, 3.5, 0, 2 * Math.PI); mctx.fill();
}

// ------------------------------------------------------------------ input --
const keys = new Set(), pad = { stick: [0, 0], twist: 0 }, btn = { go: false, brake: false, jump: false, burn: false, circ: false };
let jumpPressed = false;
document.addEventListener('keydown', (e) => {
  const kk = e.key.toLowerCase();
  if (e.target.tagName === 'INPUT') return;
  if (kk === ' ' && !keys.has(' ')) jumpPressed = true;
  if (kk === 'h') goHome();
  keys.add(kk);
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(kk)) e.preventDefault();
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
function stickPad(el, knob, set) {
  let id = null;
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = -(e.clientY - r.top - r.height / 2) / (r.height / 2);
    const m = Math.hypot(dx, dy), s = m > 1 ? 1 / m : 1;
    set([dx * s, dy * s]);
    knob.style.transform = `translate(${dx * s * r.width / 2}px, ${-dy * s * r.height / 2}px)`;
  };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; set([0, 0]); knob.style.transform = ''; });
}
stickPad($('stick'), $('stickKnob'), (v) => { pad.stick = v; });
stickPad($('twist'), $('twistKnob'), (v) => { pad.twist = v[0]; });
for (const [id, key] of [['bgo', 'go'], ['bbrake', 'brake'], ['bjump', 'jump'], ['bburn', 'burn'], ['bcirc', 'circ']]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); btn[key] = true; if (key === 'jump') jumpPressed = true; el.classList.add('on'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { btn[key] = false; el.classList.remove('on'); });
}
const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
function readInput() {
  const steer = [pad.stick[0] + kv('d', 'a') + kv('arrowright', 'arrowleft'), pad.stick[1] + kv('e', 'q')].map((v) => Math.max(-1, Math.min(1, v)));
  let throttle = kv('w', 's') + kv('arrowup', 'arrowdown') + (btn.go ? 1 : 0) - (btn.brake ? 1 : 0);
  if (S.auto && S.k.ground && !btn.brake && throttle === 0) throttle = 1;   // (in the air the throttle pitches: never automatic)
  const circ = keys.has('c') || btn.circ;
  return { throttle: Math.max(-1, Math.min(1, throttle)), steer, jump: jumpPressed, boost: keys.has('shift') || btn.burn, assist: circ && !S.k.ground ? 'circularize' : null, sas: S.sas, limiter: S.limiter };
}

// ------------------------------------------------------------------ the ride --
function nextBeacon() {
  const xh = unit(S.k.x);
  let best = null, bd = Infinity;
  for (const b of M.BEACONS) { if (S.taken.has(b.name)) continue; const d = Math.acos(Math.max(-1, Math.min(1, dot(xh, b.p)))); if (d < bd) { bd = d; best = b; } }
  return best;
}
/** Turn your across-pair about your heading so the target lies in your slice: lazily (only once it's 1.5 m out), at
 *  most 0.8 rad/s, toward the nearer of ±right (so passing it never flips the view). */
function lockOn(target, dt) {
  const k = S.k, d = add(target, k.x, -1), a = dot(d, k.Rt), b = dot(d, k.N);
  if (Math.abs(b) < 1.5) return;
  const th = Math.atan(b / (a || 1e-9)), s = Math.sign(th) * Math.min(Math.abs(th), 0.8 * dt);
  twist(s);
}
function twist(th) {
  const k = S.k, c = Math.cos(th), s = Math.sin(th);
  const R0 = k.Rt; k.Rt = add(scale(R0, c), k.N, s); k.N = add(scale(k.N, c), R0, -s);
}
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt;
  while (acc >= DT) { step(DT); acc -= DT; }
  draw(dt);
  hud();
  // resolution follows the frame rate: down when frames are slow, back up when there's room
  S.ft = 0.9 * (S.ft ?? dt) + 0.1 * dt;
  if (S.ft > 1 / 40 && S.res > 0.45) S.res = Math.max(0.45, S.res - 0.01);
  else if (S.ft < 1 / 55 && S.res < 1) S.res = Math.min(1, S.res + 0.005);
  requestAnimationFrame(frame);
}
function step(dt) {
  let k = S.k; const input = readInput();
  jumpPressed = false;
  if (input.throttle || norm(input.steer) || input.jump || input.boost) S.started ??= S.t;
  const x0 = k.x.slice();
  M.step(S.k, input, dt);
  S.refuelling = M.refuel(S.k, dt);
  S.t += dt;
  if (S.mode === 'slalom') slalomStep(x0, S.k.x);
  // your slice: twisted by hand (pad, J L), or following the next beacon
  const tw = pad.twist + kv('l', 'j');
  if (tw) twist(tw * 1.2 * dt);
  else if (S.lock === 'target') { const tg = target(); if (tg) lockOn(tg, dt); }
  k = S.k;
  // beacons: touch one (within 3 m along the ground, under its 6 m top)
  if (S.mode === 'beacons') for (const b of M.BEACONS) {
    if (S.taken.has(b.name)) continue;
    const along = R * Math.acos(Math.max(-1, Math.min(1, dot(unit(k.x), b.p)))), alt = norm(k.x) - R;
    if (along < 3 && alt < 7) {
      S.taken.add(b.name);
      if (S.taken.size === M.BEACONS.length) { S.done = S.t - (S.started ?? S.t); if (!S.best || S.done < S.best) { S.best = S.done; try { localStorage.setItem('moonlet.best', String(S.best)); } catch (e) { /* fine */ } } banner(`ALL EIGHT · ${fmt(S.done)}`); }
      else banner(`BEACON ${b.name} · ${S.taken.size} of 8`);
    }
  }
  // the forecast, five times a second
  S.foreT -= dt; S.foreAge = (S.foreAge || 0) + dt;
  if (S.foreT <= 0) { S.foreT = 0.2; S.foreAge = 0; S.forecast = k.ground ? null : M.predict(k.x, k.v, { dt: 0.1, T: 300, max: 240 }); }
  const el = M.elements(k.x, k.v);
  if (!k.ground && el.escaping && norm(k.x) > 2 * R && !S.escaped) { S.escaped = true; banner('ESCAPING · H or "back to the start"', 4); }
}
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
let bannerT = null;
function banner(text, sec = 2.2) {
  $('banner').textContent = text; $('banner').classList.add('show');
  clearTimeout(bannerT); bannerT = setTimeout(() => $('banner').classList.remove('show'), sec * 1000);
}
function goHome() { S.k = M.makeBike(M.START.at, M.START.facing); S.cam = null; S.escaped = false; S.forecast = null; }
function newHunt() { goHome(); S.taken.clear(); S.started = null; S.done = null; S.gates = M.GATES.map(() => 0); S.gateNext = 0; S.slStart = null; S.slDone = null; S.slMiss = 0; }
/** What "slice follows the target" turns toward: the next gate's centre, or the next beacon. */
function target() {
  if (S.mode === 'slalom') { const G = M.GATES[S.gateNext]; return G ? add(G.c, G.n, 1) : null; }
  const nx = nextBeacon(); return nx ? scale(nx.p, R + 3) : null;
}
/** The slalom: the next gate counts when you cross its plane, through its disk (pass) or not (miss: +5 s). */
function slalomStep(x0, x1) {
  const G = M.GATES[S.gateNext];
  if (!G) return;
  const r = M.gateCross(G, x0, x1);
  if (!r) return;
  if (S.gateNext === 0 && S.slStart == null) S.slStart = S.t;
  S.gates[S.gateNext] = r === 'pass' ? 1 : 2;
  if (r === 'miss') S.slMiss++;
  S.gateNext++;
  if (S.gateNext === M.GATES.length) {
    S.slDone = S.t - S.slStart + 5 * S.slMiss;
    if (!S.slBest || S.slDone < S.slBest) { S.slBest = S.slDone; try { localStorage.setItem('moonlet.slalom', String(S.slBest)); } catch (e) { /* fine */ } }
    banner(`FINISH · ${fmt(S.slDone)}${S.slMiss ? ` (${S.slMiss} missed, +${5 * S.slMiss} s)` : ''}`, 4);
  } else banner(r === 'pass' ? `THROUGH GATE ${S.gateNext} of ${M.GATES.length}` : `MISSED GATE ${S.gateNext} · +5 s`);
}

// ------------------------------------------------------------------ readouts --
let hudT = 0;
function hud() {
  const k = S.k, r = norm(k.x), alt = r - M.surfaceR(unit(k.x)), sp = norm(k.v), m = M.mass(k), W0 = m * M.WORLD.g;
  const wt = k.ground ? k.normal / W0 : 0, use = k.grip > 0 ? norm(k.tyre) / k.grip : 0;
  const el = M.elements(k.x, k.v);
  const state = S.refuelling ? 'REFUELLING' : k.ground ? (k.skid ? 'SLIDING' : wt < 0.15 ? 'RIDING · ALMOST WEIGHTLESS' : 'RIDING') : el.escaping ? 'ESCAPING' : el.peri > R + 15 ? 'IN ORBIT' : 'FLYING';
  $('state').textContent = state;
  $('gauges').innerHTML = `<b>${sp.toFixed(1)}</b> <span class="k">m/s · orbit ${M.vOrbit(Math.max(r, R)).toFixed(2)}</span><br>`
    + `<span class="k">weight ${k.ground ? `${k.normal.toFixed(0)} N` : '0'}</span><div class="bar w"><i style="width:${Math.min(100, wt * 100).toFixed(0)}%"></i></div>`
    + `<span class="k">grip used ${(use * 100).toFixed(0)}%</span><div class="bar g"><i style="width:${Math.min(100, use * 100).toFixed(0)}%"></i></div>`
    + `<span class="k">fuel ${k.fuel.toFixed(2)} kg · Δv ${M.dvLeft(k).toFixed(1)} m/s</span><div class="bar"><i style="width:${(k.fuel / M.BIKE.tank * 100).toFixed(0)}%"></i></div>`
    + (k.ground ? '' : `<span class="k">up</span> ${alt.toFixed(1)} m`);
  $('bcirc').hidden = k.ground;
  if ((hudT = (hudT + 1) % 6) !== 0) return;
  const per = el.escaping ? '—' : `${el.period.toFixed(0)} s`, f = k.forces || { gravity: [0, 0, 0, 0], thrust: [0, 0, 0, 0] };
  $('live').innerHTML = `<b>${state.toLowerCase()}</b> <span class="k">· every number here is this step's arithmetic</span><br>`
    + `mass <b>${m.toFixed(2)} kg</b> · speed <b>${sp.toFixed(2)} m/s</b> <span class="k">(orbital here ${M.vOrbit(Math.max(r, R)).toFixed(2)}, escape ${M.vEscape(Math.max(r, R)).toFixed(2)})</span><br>`
    + `gravity <b>${norm(f.gravity).toFixed(1)} N</b> <span class="k">(GMm/r², r = ${r.toFixed(1)} m)</span> · rocket <b>${norm(f.thrust).toFixed(0)} N</b><br>`
    + (k.ground
      ? `ground pushes <b>${k.normal.toFixed(1)} N</b> <span class="k">(${(wt * 100).toFixed(0)}% of standing weight: −(pull + thrust)·n − mκv²)</span><br>`
        + `tyres <b>${norm(k.tyre).toFixed(1)}</b> of <b>${k.grip.toFixed(1)} N</b> <span class="k">(μN)</span>${k.skid ? ' · <span class="warn">sliding</span>' : ''} · lean <b>${(Math.atan(norm(k.lean)) * 180 / Math.PI).toFixed(0)}°</b>`
      : `height <b>${alt.toFixed(1)} m</b> · ${el.peri > R ? `orbit <b>${(el.peri - R).toFixed(1)}</b> to <b>${el.escaping ? '∞' : (el.apo - R).toFixed(1)}</b> m up <span class="k">(e ${el.e.toFixed(3)}, ${per} round)</span>` : el.escaping ? 'on the way out' : `a hop, peaking <b>${(el.apo - R).toFixed(1)} m</b> up`}`
        + (S.forecast?.impact ? `<br>comes down in <b>${Math.max(0, S.forecast.impact.t - S.foreAge).toFixed(1)} s</b>, at ${norm(S.forecast.impact.v).toFixed(1)} m/s` : el.escaping ? '<br><span class="warn">leaving: nothing brings you back</span>' : '<br>no landing: you\'re in orbit'))
    + `<br>fuel <b>${k.fuel.toFixed(2)} kg</b> · Δv <b>${M.dvLeft(k).toFixed(2)} m/s</b> <span class="k">(vₑ ln(m/m_dry); refuel standing on the pad)</span>${k.crashes ? ` · crashes ${k.crashes}` : ''}`;
  if (S.mode === 'slalom') {
    const time = S.slDone != null ? S.slDone : S.slStart != null ? S.t - S.slStart + 5 * S.slMiss : 0, G = M.GATES[S.gateNext];
    $('hunt').innerHTML = `slalom <b>${S.gates.filter((g) => g === 1).length} of ${M.GATES.length}</b> through${S.slMiss ? ` · ${S.slMiss} missed` : ''} · ${S.slDone != null ? 'finished in' : 'time'} <b>${fmt(time)}</b>${S.slBest ? ` <span class="k">· best ${fmt(S.slBest)}</span>` : ''}<br>`
      + (G ? `next: <b>gate ${S.gateNext + 1}</b>, set ${M.COURSE.offset} m to the <b>${G.side}</b> of the course${G.side === 'ana' || G.side === 'kata' ? ' (out of your slice: steer by the post colours)' : ''}` : 'done: "start again" to go again');
  } else {
    const nx = nextBeacon(), time = S.done != null ? S.done : S.started != null ? S.t - S.started : 0;
    $('hunt').innerHTML = `beacons <b>${S.taken.size} of 8</b> · ${S.done != null ? 'done in' : 'time'} <b>${fmt(time)}</b>${S.best ? ` <span class="k">· best ${fmt(S.best)}</span>` : ''}<br>`
      + (nx ? `next: <b>${nx.name}</b>, ${(R * Math.acos(Math.max(-1, Math.min(1, dot(unit(k.x), nx.p))))).toFixed(0)} m away along the ground` : 'all eight found: "start again" to go again');
  }
}

// ------------------------------------------------------------------ panel --
function seg(id, key, parse = (v) => v) {
  const el = $(id);
  const show = () => { for (const b of el.children) b.classList.toggle('on', b.dataset.v === String(S[key])); };
  el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S[key] = parse(b.dataset.v); show(); });
  show();
}
seg('lock', 'lock');
seg('mode', 'mode');
seg('sas', 'sas', (v) => v === 'true');
seg('limiter', 'limiter', (v) => v === 'true');
seg('forces', 'forces', (v) => v === 'true');
seg('fore', 'fore', (v) => v === 'true');
seg('auto', 'auto', (v) => v === 'true');
$('home').onclick = goHome;
$('again').onclick = newHunt;
try { const b = +localStorage.getItem('moonlet.best'); if (b > 0) S.best = b; const c = +localStorage.getItem('moonlet.slalom'); if (c > 0) S.slBest = c; } catch (e) { /* fine */ }
addEventListener('resize', () => draw(0));
window.moonlet = { S, M, project, cam: () => lastCam };   // the state, for checking from outside
requestAnimationFrame(frame);
