// The Hopf habitat's page. You stand on the inner floor of a hollow 3-sphere spun at equal rates in two planes; the
// fragment shader ray-traces your 3D slice of it (your forward, right and up; the fourth way, w, hidden): the floor
// rising all round you, the 24 towers, the spin circles painted as roads (yours gold), the sun at the centre. An
// overlay draws the balls you drop and throw, from habitat.js's exact flights, coloured by how far ana or kata of your
// slice they are. Controls: drag to look, the walk pad (or W A S D) to walk, the twist pad (J L I K) to turn your
// slice into w, the lever (R F) to step ana and kata.
import * as H from './habitat.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), ov = $('ov'), ctx = ov.getContext('2d');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }

const G0 = 9.80665, EYE = 1.7;
const S = {
  R: 300, g: G0, xh: [1, 0, 0, 0], fwd: [0, 0, 1, 0], right: [0, 1, 0, 0], wS: [0, 0, 0, 1], pitch: 0.18,
  speed: 15, dropH: 20, slow: false, balls: [], t: 0, last: null, vel: [0, 0, 0, 0],
};
const TOWERS = H.towers(), ROADS = H.roads();
const omega = () => H.spin(S.R, S.g).omega;

// ------------------------------------------------------------------ shader --
const VS = `#version 300 es
layout(location=0) in vec2 corner;
out vec2 ndc;
void main() { ndc = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 ndc;
out vec4 o;
uniform float R, tanH, aspect, towerH, towerA, roadW, sunR;
uniform vec4 E, L, U, Rt, me;
uniform vec4 towers[24];
uniform vec3 roads[12];

float hash(vec4 p) {
  p = fract(p * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p += dot(p, p.wzxy + 33.33);
  return fract((p.x + p.y) * (p.z + p.w));
}
float n4(vec4 x) {       // value noise in four dimensions: sixteen corners
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
float fbm(vec4 x) { return 0.55 * n4(x) + 0.3 * n4(x * 2.03 + 7.1) + 0.15 * n4(x * 4.1 + 3.3); }
// habitat.js hopf: the same point for every point of one spin circle
vec3 hopf(vec4 x) { return vec3(2.0 * (x.x * x.z + x.y * x.w), 2.0 * (x.y * x.z - x.x * x.w), dot(x.xy, x.xy) - dot(x.zw, x.zw)); }

float capsule(vec4 ro, vec4 rd, vec4 pa, vec4 pb, float ra) {
  vec4 ba = pb - pa, oa = ro - pa;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
  float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - ra * ra * baba, h = b * b - a * c;
  if (h >= 0.0) {
    float t = (-b - sqrt(h)) / a, y = baoa + t * bard;
    if (y > 0.0 && y < baba) return t;
    vec4 oc = y <= 0.0 ? oa : ro - pb;
    b = dot(rd, oc); c = dot(oc, oc) - ra * ra; h = b * b - c;
    if (h > 0.0) return -b - sqrt(h);
  }
  return -1.0;
}

vec3 terrain(vec4 u, float t) {
  float n = fbm(u * 9.0), m = fbm(u * 3.2 + 11.0), k = fbm(u * 40.0 + 2.0);
  vec3 c = mix(vec3(0.17, 0.33, 0.14), vec3(0.40, 0.46, 0.19), smoothstep(0.35, 0.68, n));
  c = mix(c, vec3(0.55, 0.47, 0.26), smoothstep(0.62, 0.7, k) * 0.6);                  // fields
  c *= 0.85 + 0.3 * k;
  if (m < 0.37) c = mix(vec3(0.10, 0.26, 0.40), vec3(0.18, 0.42, 0.56), smoothstep(0.2, 0.37, m));   // lakes
  // the spin circles: roads along the Hopf circles over 12 points of the base sphere, dashed every 12 m
  vec3 hb = hopf(u);
  float th = dot(u.xy, u.xy) > dot(u.zw, u.zw) ? atan(u.y, u.x) : atan(u.w, u.z);
  float dash = step(0.45, fract(R * th / 12.0));
  float px = t * tanH * 2.0 / 900.0;                       // about a pixel, in metres, at this distance
  float wide = max(roadW, px * 1.2);
  for (int k = 0; k < 12; k++) {
    float a = acos(clamp(dot(hb, roads[k]), -1.0, 1.0)) * 0.5 * R;   // metres to that circle
    if (a < wide) c = mix(vec3(0.34, 0.34, 0.36), vec3(0.85, 0.84, 0.78), dash * step(a, wide * 0.25));
  }
  // your own spin circle, the one under your feet, gold
  float am = acos(clamp(dot(hb, hopf(me)), -1.0, 1.0)) * 0.5 * R;
  if (am < max(0.3, px)) c = mix(c, vec3(1.0, 0.82, 0.42), 0.85);
  return c;
}

void main() {
  vec4 d = normalize(L + ndc.x * aspect * tanH * Rt + ndc.y * tanH * U);
  vec4 ro = E;
  float b = dot(ro, d), c = dot(ro, ro) - R * R;
  float t = -b + sqrt(max(b * b - c, 0.0));                // the floor, from inside
  int kind = 0; int which = 0;
  // the sun at the centre
  float sb = dot(ro, d), sc = dot(ro, ro) - sunR * sunR, sh = sb * sb - sc;
  if (sh > 0.0 && -sb - sqrt(sh) > 0.0 && -sb - sqrt(sh) < t) { t = -sb - sqrt(sh); kind = 2; }
  for (int k = 0; k < 24; k++) {
    float tt = capsule(ro, d, towers[k] * R, towers[k] * (R - towerH), towerA);
    if (tt > 0.0 && tt < t) { t = tt; kind = 1; which = k; }
  }
  vec4 p = ro + d * t;
  vec3 col;
  if (kind == 0) col = terrain(p / R, t);
  else if (kind == 1) {
    vec4 q = towers[which], cp = q * clamp(dot(p, q), R - towerH, R);
    vec4 n = normalize(p - cp);
    if (length(p) < R - towerH + 0.01 * towerA) n = -q;  // the cap, facing up
    float lam = max(dot(n, -normalize(p)), 0.0);          // lit from the sun at the centre
    float side = 0.5 + 0.5 * dot(n, normalize(Rt + L));
    float band = step(0.5, fract((R - length(p)) / 10.0)); // a stripe every 10 m of height
    col = mix(vec3(0.62, 0.62, 0.66), vec3(0.78, 0.76, 0.72), band) * (0.32 + 0.45 * lam + 0.23 * side);
  } else col = vec3(1.0, 0.95, 0.8) * 1.4;
  // air: the far side of the habitat fades into haze
  float f = 1.0 - exp(-t / (1.7 * R));
  col = mix(col, vec3(0.62, 0.72, 0.86), f * 0.72);
  float gc = max(dot(d, normalize(-ro)), 0.0);
  col += vec3(1.0, 0.92, 0.7) * (pow(gc, 600.0) * 0.8 + pow(gc, 30.0) * 0.10);
  o = vec4(pow(col, vec3(0.95)), 1.0);
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
  const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, ''); Un[name] = gl.getUniformLocation(prog, gl.getActiveUniform(prog, i).name);
}
const vao = gl.createVertexArray(), buf = gl.createBuffer();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// ------------------------------------------------------------------ camera --
const TAN = Math.tan((62 * Math.PI) / 360);
function camera() {
  const up = H.scale(S.xh, -1), c = Math.cos(S.pitch), s = Math.sin(S.pitch);
  return {
    eye: H.scale(S.xh, S.R - EYE),
    look: H.add(H.scale(S.fwd, c), up, s),
    up: H.add(H.scale(S.fwd, -s), up, c),
    right: S.right, w: S.wS,
  };
}

function draw() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * (moving() ? 0.6 : 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  const cam = camera();
  gl.uniform1f(Un.R, S.R); gl.uniform1f(Un.tanH, TAN); gl.uniform1f(Un.aspect, w / h);
  gl.uniform1f(Un.towerH, 0.3 * S.R); gl.uniform1f(Un.towerA, Math.max(3, 0.014 * S.R));
  gl.uniform1f(Un.roadW, Math.max(1.5, 0.004 * S.R)); gl.uniform1f(Un.sunR, 0.04 * S.R);
  gl.uniform4f(Un.E, ...cam.eye); gl.uniform4f(Un.L, ...cam.look); gl.uniform4f(Un.U, ...cam.up); gl.uniform4f(Un.Rt, ...cam.right);
  gl.uniform4f(Un.me, ...S.xh);
  gl.uniform4fv(Un.towers, new Float32Array(TOWERS.flat()));
  gl.uniform3fv(Un.roads, new Float32Array(ROADS.flat()));
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  overlay(cam);
}

// ------------------------------------------------------------------ overlay --
// A point of the habitat on your screen: its depth along your look, its place across, and how far ana (+) or kata (−)
// of your slice it is.
function project(cam, p, W, Hh) {
  const rel = H.add(p, cam.eye, -1), f = H.dot(rel, cam.look);
  if (f < 0.2) return null;
  const sx = H.dot(rel, cam.right) / f / (TAN * (W / Hh)), sy = H.dot(rel, cam.up) / f / TAN;
  return { x: ((sx + 1) / 2) * W, y: ((1 - sy) / 2) * Hh, f, w: H.dot(rel, cam.w) };
}
const wColour = (w, a = 1) => {
  const s = Math.max(-1, Math.min(1, w / 2));
  const c = s > 0 ? [235 + (51 - 235) * s, 235 + (230 - 235) * s, 235 + (204 - 235) * s] : [235 + (255 - 235) * -s, 235 + (107 - 235) * -s, 235 + (168 - 235) * -s];
  return `rgba(${c.map(Math.round).join(',')},${a})`;
};
const BALL = 0.15;   // a ball's radius, metres
function overlay(cam) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = ov.clientWidth, Hh = ov.clientHeight;
  if (ov.width !== Math.round(W * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(Hh * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, Hh);
  const focal = Hh / (2 * TAN);
  for (const b of S.balls) {
    const tau = Math.min(S.t - b.t0, b.fl.tLand);
    // the trail so far
    ctx.lineWidth = 2;
    let prev = null;
    for (const s of b.trail) {
      if (s.t > tau) break;
      const q = project(cam, s.p, W, Hh);
      if (q && prev) { ctx.strokeStyle = wColour(q.w, 0.75); ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      prev = q;
    }
    // the ball: solid where your slice cuts it, a ring where it's off your slice
    const pos = b.fl.at(tau), q = project(cam, pos, W, Hh);
    if (!q) continue;
    const rad = Math.max(3, (BALL * focal) / q.f);
    const cut = Math.abs(q.w) < BALL ? Math.sqrt(BALL * BALL - q.w * q.w) / BALL : 0;
    ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 2 * Math.PI);
    if (cut > 0) { ctx.fillStyle = '#ffd27a'; ctx.fill(); }
    else { ctx.strokeStyle = wColour(q.w); ctx.lineWidth = 2; ctx.stroke(); }
    if (b.landed && Math.abs(q.w) >= BALL) {
      ctx.fillStyle = wColour(q.w); ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(`${q.w > 0 ? 'ana' : 'kata'} ${Math.abs(q.w).toFixed(1)} m`, q.x + rad + 4, q.y + 4);
    }
  }
  // crosshair
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W / 2 - 6, Hh / 2); ctx.lineTo(W / 2 + 6, Hh / 2); ctx.moveTo(W / 2, Hh / 2 - 6); ctx.lineTo(W / 2, Hh / 2 + 6); ctx.stroke();
  compass();
}

// spinward, as it lies in your frame: an arrow over forward/right, a bar for the part in w you can't see
function compass() {
  const f = H.J(S.xh), a = H.dot(f, S.fwd), r = H.dot(f, S.right), w = H.dot(f, S.wS);
  const el = $('compass');
  el.querySelector('.arrow').style.transform = `rotate(${Math.atan2(r, a)}rad) scaleY(${Math.hypot(a, r).toFixed(3)})`;
  el.querySelector('.wbar i').style.width = `${(Math.abs(w) * 50).toFixed(1)}%`;
  el.querySelector('.wbar i').style.left = w >= 0 ? '50%' : `${(50 - Math.abs(w) * 50).toFixed(1)}%`;
  el.querySelector('.wbar i').style.background = w >= 0 ? '#38f2e0' : '#ff66b8';
}

// ------------------------------------------------------------------- balls --
function launch(x0, v0, kind, aim) {
  const w = omega(), fl = H.flight(x0, v0, w, S.R);
  const trail = [];
  const n = 160;
  for (let i = 0; i <= n; i++) { const t = (fl.tLand * i) / n; trail.push({ t, p: fl.at(t) }); }
  const start = H.unit(x0);
  S.balls.push({ fl, t0: S.t, trail, kind, start, aim, x0, landed: false });
  if (S.balls.length > 8) S.balls.shift();
  touch(true);
}
function throwBall() {
  const cam = camera();
  launch(cam.eye, H.scale(cam.look, S.speed), 'throw', H.unit(H.add(cam.look, S.xh, -H.dot(cam.look, S.xh))));
}
function dropBall() {
  // from the drop height, six metres in front of you, at rest on the floor's terms
  const ahead = H.walk(S.xh, S.fwd, 6, S.R, []).xhat;
  launch(H.scale(ahead, S.R - S.dropH), [0, 0, 0, 0], 'drop', null);
}

// where a landed ball came down, in the floor's terms at its start, and against your slice
function report(b) {
  const land = b.fl.land, F = H.floorFrame(b.start);
  const base = H.scale(b.start, S.R);
  const disp = H.add(land, base, -1);
  const spinArc = S.R * Math.atan2(H.dot(land, F.f), H.dot(land, b.start));
  const acrossV = H.add(H.add(disp, F.f, -H.dot(disp, F.f)), F.down, -H.dot(disp, F.down));
  const across = H.norm(acrossV);
  let txt = `<b>${b.kind === 'drop' ? `dropped from ${S.dropH} m` : `thrown at ${S.speed} m/s`}</b> · ${b.fl.tLand.toFixed(2)} s in the air<br>`;
  if (b.kind === 'drop') {
    txt += `landed <b>${Math.abs(spinArc).toFixed(2)} m ${spinArc < 0 ? 'antispinward' : 'spinward'}</b> of the spot beneath it, ${across.toFixed(3)} m across the spin.`;
  } else {
    const horiz = H.add(disp, F.down, -H.dot(disp, F.down)), along = H.dot(horiz, b.aim);
    const side = H.add(horiz, b.aim, -along), sideN = H.norm(side), sideW = H.dot(side, S.wS);
    txt += `landed ${H.norm(horiz).toFixed(1)} m away, <b>${sideN.toFixed(2)} m off your aim</b>`;
    txt += sideN > 0.01 ? `, ${Math.abs(sideW).toFixed(2)} m of it ${sideW >= 0 ? 'ana' : 'kata'}, out of your slice.` : '.';
    txt += `<br><span class="k">of the swerve: ${Math.abs(H.dot(side, F.f)).toFixed(2)} m along the spin, ${H.norm(H.add(side, F.f, -H.dot(side, F.f))).toFixed(2)} m across it</span>`;
  }
  $('result').innerHTML = txt;
}

// ------------------------------------------------------------------- loop --
let dirty = true, lastMove = 0;
const touch = (keep) => { dirty = true; if (!keep) lastMove = performance.now(); };
const moving = () => performance.now() - lastMove < 150;
const pads = { tw: [0, 0], an: 0, walk: [0, 0] };
const keys = new Set();
const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
let last = performance.now();
function tick(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  // walking: the walk pad or W A S D, the lever or R F (ana and kata), shift to run
  const run = keys.has('shift') ? 5 : 1.6;
  const vf = (pads.walk[1] + kv('w', 's')) * run, vr = (pads.walk[0] + kv('d', 'a')) * run, vw = (pads.an + kv('r', 'f')) * run;
  S.vel = H.add(H.add(H.scale(S.fwd, vf), S.right, vr), S.wS, vw);
  const sp = H.norm(S.vel);
  if (sp > 1e-6) {
    const m = H.scale(S.vel, 1 / sp), r = H.walk(S.xh, m, sp * dt, S.R, [S.fwd, S.right, S.wS]);
    S.xh = r.xhat; [S.fwd, S.right, S.wS] = r.vectors; touch();
  }
  // turning: arrow keys and the twist pad (J L I K) turn your view; the pad turns forward and right into w
  const yaw = kv('arrowright', 'arrowleft') * 1.4 * dt, pit = kv('arrowup', 'arrowdown') * 1.0 * dt;
  if (yaw) rot('fwd', 'right', yaw);
  if (pit) { S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch + pit)); touch(); }
  const tx = pads.tw[0] + kv('l', 'j'), ty = pads.tw[1] + kv('i', 'k'), rate = (40 * Math.PI) / 180;
  if (tx) rot('right', 'wS', tx * rate * dt);
  if (ty) rot('fwd', 'wS', ty * rate * dt);
  // the balls fly
  S.t += Math.min(0.25, raw) * (S.slow ? 0.25 : 1);
  let flying = false;
  for (const b of S.balls) {
    const done = S.t - b.t0 >= b.fl.tLand;
    if (!done) flying = true;
    if (done && !b.landed) { b.landed = true; report(b); }
  }
  if (flying) dirty = true;
  if (dirty || moving()) { draw(); dirty = flying; readout(); }
  requestAnimationFrame(tick);
}
function rot(a, b, th) {
  const c = Math.cos(th), s = Math.sin(th), A = S[a], B = S[b];
  S[a] = H.add(H.scale(A, c), B, s); S[b] = H.add(H.scale(B, c), A, -s);
  [S.fwd, S.right, S.wS] = H.orthonormalTo(S.xh, [S.fwd, S.right, S.wS]);
  touch();
}

// --------------------------------------------------------------- controls --
let dragging = false, px = 0, py = 0;
canvas.parentElement.addEventListener('pointerdown', (e) => {
  if (e.target !== ov) return;
  ov.setPointerCapture(e.pointerId); dragging = true; px = e.clientX; py = e.clientY;
});
ov.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = (e.clientX - px) / ov.clientHeight * 2.2, dy = (e.clientY - py) / ov.clientHeight * 2.2;
  px = e.clientX; py = e.clientY;
  if (e.shiftKey) { rot('right', 'wS', dx); rot('fwd', 'wS', -dy); return; }
  rot('fwd', 'right', dx);
  S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch + dy)); touch();
});
for (const ev of ['pointerup', 'pointercancel']) ov.addEventListener(ev, () => { dragging = false; touch(); });
ov.addEventListener('dblclick', throwBall);

function padDrag(el, onMove, onEnd) {
  let id = null;
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* fine */ } el.classList.add('live'); onMove(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) onMove(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
    el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove('live'); onEnd(); touch(); });
}
function stick(el, knob, key) {
  padDrag(el, (e) => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = -(e.clientY - r.top - r.height / 2) / (r.height / 2);
    const m = Math.hypot(dx, dy), k = m > 1 ? 1 / m : 1;
    pads[key] = [dx * k, dy * k];
    knob.style.transform = `translate(${dx * k * r.width / 2}px, ${-dy * k * r.height / 2}px)`;
  }, () => { pads[key] = [0, 0]; knob.style.transform = ''; });
}
stick($('twist'), $('twistKnob'), 'tw');
stick($('walk'), $('walkKnob'), 'walk');
padDrag($('ana'), (e) => {
  const r = $('ana').getBoundingClientRect();
  const dy = Math.max(-1, Math.min(1, -(e.clientY - r.top - r.height / 2) / (r.height / 2)));
  pads.an = dy;
  $('anaKnob').style.transform = `translateY(${-dy * r.height / 2 * 0.8}px)`;
}, () => { pads.an = 0; $('anaKnob').style.transform = ''; });

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); throwBall(); return; }
  if (k === 'g') { dropBall(); return; }
  if (k === 'z') { squareUp(); return; }
  if ('wasdrfijkl'.includes(k) && k.length === 1 || k.startsWith('arrow') || k === 'shift') { keys.add(k); e.preventDefault(); }
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => touch());

// square up: turn so that spinward is straight ahead and your hidden w lies across the spin
function squareUp() {
  const F = H.floorFrame(S.xh);
  S.fwd = F.f; S.right = F.e; S.wS = F.Je; S.pitch = 0.18; touch();
}

const logR = (v) => 50 * Math.pow(400, v / 1000);
$('radius').oninput = (e) => { S.R = logR(+e.target.value); S.balls = []; $('result').textContent = ''; specs(); touch(); };
$('grav').oninput = (e) => { S.g = (+e.target.value / 100) * G0; S.balls = []; specs(); touch(); };
$('speed').oninput = (e) => { S.speed = +e.target.value; $('speedOut').textContent = `${S.speed} m/s`; };
$('droph').oninput = (e) => { S.dropH = +e.target.value; $('dropOut').textContent = `${S.dropH} m`; };
$('throw').onclick = throwBall;
$('drop').onclick = dropBall;
$('clear').onclick = () => { S.balls = []; $('result').textContent = ''; touch(); };
$('slow').onchange = (e) => { S.slow = e.target.checked; };
$('square').onclick = squareUp;

// ---------------------------------------------------------------- readouts --
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 1e4 ? 0 : 1)} km` : `${Math.round(m)} m`);
function specs() {
  const s = H.spin(S.R, S.g);
  $('radiusOut').textContent = km(S.R);
  $('gravOut').textContent = `${(S.g / G0).toFixed(2)} g`;
  $('spec').innerHTML =
    `one turn every <b>${s.period < 120 ? s.period.toFixed(1) + ' s' : (s.period / 60).toFixed(1) + ' min'}</b> in both planes at once · the floor moves at <b>${s.rim.toFixed(0)} m/s</b><br>` +
    `the hull, carrying only itself, needs σ/ρ = gR/3 = <b>${(H.hoopStress.hopf(S.g, S.R) / 1e3).toFixed(1)} kJ/kg</b>; a cylinder's would need gR = ${(H.hoopStress.cylinder(S.g, S.R) / 1e3).toFixed(1)}`;
  const rows = H.MATERIALS.map((m) => `<tr><td>${m.name}</td><td>${km(H.maxRadius.cylinder(m.s, S.g))}</td><td><b>${km(H.maxRadius.hopf(m.s, S.g))}</b></td></tr>`).join('');
  $('stress').innerHTML = `<tr><th>the biggest hull of</th><th>cylinder</th><th>Hopf</th></tr>${rows}`;
}
function readout() {
  const w = omega(), wt = H.weight(H.scale(S.xh, S.R), S.vel, w) / S.g;
  const f = H.J(S.xh), wshare = H.dot(f, S.wS);
  $('live').innerHTML = `<span class="k">you weigh</span> <b>${wt.toFixed(3)} g</b>${H.norm(S.vel) > 0.1 ? (H.dot(S.vel, f) > 0.3 ? ' (walking spinward: heavier)' : H.dot(S.vel, f) < -0.3 ? ' (walking against the spin: lighter)' : ' (walking across the spin)') : ''}<br>` +
    `<span class="k">spinward</span> ${Math.abs(wshare) > 0.9 ? `almost all ${wshare > 0 ? 'ana' : 'kata'}, out of your slice` : `${(100 * wshare * wshare).toFixed(0)}% in your hidden w`}`;
}

// gravity across the floor, a 3D sphere spun about an axis against the Hopf habitat
(function chart() {
  const W = 300, Hc = 120, pad = 26, N = 60;
  const x = (lat) => pad + (lat / (Math.PI / 2)) * (W - pad - 8), y = (g) => Hc - 18 - g * (Hc - 36);
  let d3 = '', d4 = '';
  for (let i = 0; i <= N; i++) { const lat = (i / N) * (Math.PI / 2); d3 += `${i ? 'L' : 'M'}${x(lat).toFixed(1)},${y(H.floorGravity.sphere3(lat)).toFixed(1)}`; d4 += `${i ? 'L' : 'M'}${x(lat).toFixed(1)},${y(H.floorGravity.hopf(lat)).toFixed(1)}`; }
  $('chart').innerHTML = `<svg viewBox="0 0 ${W} ${Hc}" role="img" aria-label="spin gravity across the floor: a 3D sphere spun about an axis falls to zero at its poles; the Hopf habitat is the same everywhere">
    <line x1="${pad}" y1="${y(0)}" x2="${W - 8}" y2="${y(0)}" stroke="#262833"/><line x1="${pad}" y1="${y(1)}" x2="${W - 8}" y2="${y(1)}" stroke="#262833" stroke-dasharray="2 3"/>
    <path d="${d3}" fill="none" stroke="#ff86c6" stroke-width="2"/><path d="${d4}" fill="none" stroke="#6fe0ff" stroke-width="2.5"/>
    <text x="${pad - 4}" y="${y(1) + 4}" text-anchor="end">1 g</text><text x="${pad - 4}" y="${y(0) + 4}" text-anchor="end">0</text>
    <text x="${pad}" y="${Hc - 3}">equator</text><text x="${W - 8}" y="${Hc - 3}" text-anchor="end">pole (3D) · anywhere (4D)</text>
    <text x="${x(0.95)}" y="${y(0.62)}" fill="#ff86c6">a 3D sphere</text><text x="${x(0.2)}" y="${y(1) - 6}" fill="#6fe0ff">the Hopf habitat</text></svg>`;
})();

$('radius').value = Math.round((1000 * Math.log(S.R / 50)) / Math.log(400));
specs();
$('speedOut').textContent = `${S.speed} m/s`; $('dropOut').textContent = `${S.dropH} m`;
requestAnimationFrame(tick);
