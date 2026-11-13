// HYPERBALL: bike-ball in a four-dimensional arena. The arena is the inside of a small hollow 3-sphere (arena.js); a
// fragment shader ray-traces your 3D slice of it, vaporwave: a neon grid on the floor (the planes x_k = const cutting
// the 3-sphere), a striped sunset sun at the centre, the ball, your bike, the two spherinder goals, and the aiming
// aids painted on the floor: the path to where you'll meet the ball (its kerbs teal on the ana side, pink on the kata
// side) and the shot line from the ball to their goal. A 2D overlay draws the ball's marker (and how far ana or kata of
// your slice it is when ball lock is off), the goals' markers, a minimap, the score, the clock and your boost.
import * as H from './habitat.js';
import * as G from './arena.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), ov = $('ov'), ctx = ov.getContext('2d');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
if (!gl) { $('nogl').hidden = false; throw new Error('no WebGL2'); }
const A = G.ARENA, R = A.R;

const S = {
  mode: 'arcade', assist: 'path', lock: true, ballCam: true, autoThrottle: matchMedia('(pointer: coarse)').matches,
  state: 'title', clock: 180, banner: '', bannerT: 0, countdown: 0,
  team: '2', skill: 'normal', goals: { cyan: 0, orange: 0 }, mine: 0,
  match: null, ball: null, bike: null, aim: null, it: null, itT: 0, touches: 0,
};
// A kickoff. team '0' is solo practice (you alone, from a random side); otherwise n a side, you cyan's first bike, the
// rest bots (arena.js botInput). S.ball and S.bike are the match's ball and your bike, which the camera and aids use.
function newKickoff() {
  const n = +S.team;
  if (n === 0) {
    const ko = G.kickoff(G.ARENA, Math.random);
    S.match = { ball: ko.ball, bikes: [{ k: ko.bike, team: 'cyan', brain: {}, human: true, name: 'you' }] };
  } else S.match = G.newMatch(n, G.ARENA, Math.random, true);
  S.matchTeam = S.team;
  S.ball = S.match.ball; S.bike = S.match.bikes[0].k; S.camState = null; S.aim = null; S.countdown = 3;
}
newKickoff();

// ------------------------------------------------------------------ shader --
const VS = `#version 300 es
layout(location=0) in vec2 corner;
out vec2 ndc;
void main() { ndc = corner; gl_Position = vec4(corner, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec2 ndc;
out vec4 o;
uniform float R, tanH, aspect, time, ballR, goalR, goalH, sunR, pathEnd, shotEnd;
uniform vec4 E, L, U, Rt, Wv, ball, own, enemy, pathA, pathB, shotA, shotB;
// the bikes, up to six: two wheels, a body from bA to bB, a flame when boosting; bT the team (0 you, 1 cyan, 2 orange)
uniform vec4 wA[6], wB[6], bA[6], bB[6], fl[6];
uniform float bT[6], bBoost[6];
uniform int nB;
uniform float pathOn, shotOn;

float sphere(vec4 ro, vec4 rd, vec4 c, float r) {
  vec4 oc = ro - c; float b = dot(oc, rd), h = b * b - (dot(oc, oc) - r * r);
  if (h < 0.0) return -1.0;
  float t = -b - sqrt(h);
  return t > 0.0 ? t : -1.0;
}
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
// distance along the floor (metres) from unit point u to a great-circle arc from a, heading b, for angle len
vec2 arcNear(vec4 u, vec4 a, vec4 b, float len) {
  float th = clamp(atan(dot(u, b), dot(u, a)), 0.0, len);
  vec4 p = cos(th) * a + sin(th) * b;
  return vec2(length(u - p) * R, th);
}
vec3 kerb(vec4 u, vec4 a, vec4 b, float th) {      // teal on the ana side of the line, pink on the kata side
  vec4 off = u - (cos(th) * a + sin(th) * b);
  float s = dot(off, Wv) / max(length(off), 1e-9);
  return s > 0.0 ? mix(vec3(0.9), vec3(0.15, 1.0, 0.9), smoothstep(0.1, 0.8, s)) : mix(vec3(0.9), vec3(1.0, 0.35, 0.75), smoothstep(0.1, 0.8, -s));
}

vec3 floorCol(vec4 p, float t) {
  vec4 u = p / R;
  vec3 c = vec3(0.07, 0.025, 0.13);
  // the grid: the planes x_k = 5 m · n cut the 3-sphere in 2-spheres; your slice cuts those in curves
  vec3 lineCol[4] = vec3[4](vec3(1.0, 0.2, 0.75), vec3(0.2, 0.9, 1.0), vec3(0.65, 0.35, 1.0), vec3(1.0, 0.55, 0.25));
  for (int k = 0; k < 4; k++) {
    float d = abs(fract(p[k] / 5.0 + 0.5) - 0.5) * 5.0, aa = fwidth(p[k]);
    float l = 1.0 - smoothstep(0.035, 0.035 + aa * 1.6, d);
    // fade the lines out where they're too fine to draw (a few pixels apart): blurred, they wash the floor pink
    l *= 1.0 - smoothstep(0.06, 0.3, aa / 5.0);
    c += lineCol[k] * l * 0.55;
  }
  // the halfway sphere (equally far from both goals), and the goal circles
  float half_ = abs(asin(clamp(dot(u, own), -1.0, 1.0))) * R;
  // (thin and faint: it's a whole 2-sphere in the floor, and a slice running nearly along it smears it into a sheet)
  c = mix(c, vec3(1.0, 0.3, 0.85), (1.0 - smoothstep(0.06, 0.14, half_)) * 0.35);
  float dOwn = acos(clamp(dot(u, own), -1.0, 1.0)) * R, dEn = acos(clamp(dot(u, enemy), -1.0, 1.0)) * R;
  c = mix(c, vec3(0.2, 0.95, 1.0), (1.0 - smoothstep(0.1, 0.25, abs(dOwn - goalR))) * 0.9);
  c = mix(c, vec3(1.0, 0.6, 0.15), (1.0 - smoothstep(0.1, 0.25, abs(dEn - goalR))) * 0.9);
  c = mix(c, vec3(0.2, 0.95, 1.0), (1.0 - smoothstep(0.05, 0.15, abs(dOwn - 2.0 * goalR))) * 0.35);
  c = mix(c, vec3(1.0, 0.6, 0.15), (1.0 - smoothstep(0.05, 0.15, abs(dEn - 2.0 * goalR))) * 0.35);
  // shadows: the ball's and the bike's, straight below them
  float sb = acos(clamp(dot(u, normalize(ball)), -1.0, 1.0)) * R;
  c *= mix(0.35, 1.0, smoothstep(ballR * 0.55, ballR * 1.05, sb));
  for (int i = 0; i < 6; i++) {
    if (i >= nB) break;
    float sk = acos(clamp(dot(u, normalize(bA[i])), -1.0, 1.0)) * R;
    c *= mix(0.45, 1.0, smoothstep(0.4, 0.9, sk));
  }
  // the shot line: from the ball toward their goal, gold dashes
  if (shotOn > 0.5) {
    vec2 s = arcNear(u, shotA, shotB, shotEnd);
    if (s.x < 0.18 && fract(s.y * R / 1.6) > 0.45) c = mix(c, vec3(1.0, 0.82, 0.35), 0.9);
  }
  // the path to the ball: a cyan ribbon with chevrons running toward the ball, kerbs teal (ana) and pink (kata)
  if (pathOn > 0.5) {
    vec2 a = arcNear(u, pathA, pathB, pathEnd);
    float w = max(0.55, t * tanH * 2.0 / 700.0);
    if (a.x < w) {
      float chev = step(0.55, fract(a.y * R / 2.2 - a.x * 0.35 / 2.2 - time * 2.0));
      c = mix(c, vec3(0.2, 0.85, 1.0), 0.35 + 0.3 * chev);
      if (a.x > w * 0.72) c = kerb(u, pathA, pathB, a.y);
    }
  }
  return c;
}

void main() {
  vec4 d = normalize(L + ndc.x * aspect * tanH * Rt + ndc.y * tanH * U);
  vec4 ro = E;
  float b = dot(ro, d), c = dot(ro, ro) - R * R;
  float t = -b + sqrt(max(b * b - c, 0.0));
  int kind = 0;
  // the sun at the centre: a vaporwave sunset, striped through its lower half
  float ts = sphere(ro, d, vec4(0.0), sunR);
  if (ts > 0.0 && ts < t) {
    vec4 p = ro + d * ts;
    float y = dot(p, U) / sunR;                      // up the sun, as you see it
    bool gap = y < 0.15 && fract((y + time * 0.03) * 7.0) < 0.15 + 0.5 * clamp(-y, 0.0, 1.0);
    if (!gap) { t = ts; kind = 2; }
  }
  float tb = sphere(ro, d, ball, ballR);
  if (tb > 0.0 && tb < t) { t = tb; kind = 3; }
  int who = 0;
  for (int i = 0; i < 6; i++) {
    if (i >= nB) break;
    float tw = sphere(ro, d, wA[i], 0.45);
    if (tw > 0.0 && tw < t) { t = tw; kind = 4; who = i; }
    tw = sphere(ro, d, wB[i], 0.45);
    if (tw > 0.0 && tw < t) { t = tw; kind = 4; who = i; }
    float tc = capsule(ro, d, bA[i], bB[i], 0.33);
    if (tc > 0.0 && tc < t) { t = tc; kind = 5; who = i; }
    if (bBoost[i] > 0.5) {
      float tf = capsule(ro, d, bA[i], fl[i], 0.22);
      if (tf > 0.0 && tf < t) { t = tf; kind = 6; who = i; }
    }
  }
  vec3 teamCol = bT[who] < 0.5 ? vec3(1.0, 0.35, 0.75) : bT[who] < 1.5 ? vec3(0.2, 0.9, 1.0) : vec3(1.0, 0.55, 0.15);
  vec4 p = ro + d * t;
  vec3 col;
  if (kind == 0) col = floorCol(p, t);
  else if (kind == 2) {
    float y = dot(p, U) / sunR;
    col = mix(vec3(1.0, 0.2, 0.6), vec3(1.0, 0.85, 0.3), smoothstep(-0.9, 0.8, y)) * 1.25;
  } else if (kind == 3) {                            // the ball: chrome, a magenta rim
    vec4 n = normalize(p - ball);
    float facing = abs(dot(n, d));
    float lit = max(dot(n, -normalize(p)), 0.0);
    col = mix(vec3(0.95, 0.95, 1.0) * (0.45 + 0.55 * lit), vec3(1.0, 0.3, 0.85), pow(1.0 - facing, 2.5));
    col += vec3(0.2, 0.9, 1.0) * pow(max(dot(reflect(d, n), -normalize(p)), 0.0), 12.0) * 0.5;
  } else if (kind == 4) col = vec3(0.12, 0.1, 0.18) + teamCol * 0.35;
  else if (kind == 5) {
    vec4 n = normalize(p - bA[who]);
    col = teamCol * (0.5 + 0.5 * max(dot(n, -normalize(p)), 0.0));
  } else col = vec3(1.0, 0.7, 0.25) * 1.6;
  // the goals: translucent spherinders, a cone wall (all the points the goal's radius from its pole) and a roof
  for (int g = 0; g < 2; g++) {
    vec4 Gp = g == 0 ? own : enemy;
    vec3 gc = g == 0 ? vec3(0.2, 0.95, 1.0) : vec3(1.0, 0.6, 0.15);
    float c0 = cos(goalR / R), a0 = dot(ro, Gp), a1 = dot(d, Gp), oo = dot(ro, ro), od = dot(ro, d);
    float qa = a1 * a1 - c0 * c0, qb = 2.0 * (a0 * a1 - c0 * c0 * od), qc = a0 * a0 - c0 * c0 * oo;
    float disc = qb * qb - 4.0 * qa * qc;
    if (disc > 0.0 && abs(qa) > 1e-9) {
      for (int r = 0; r < 2; r++) {
        float tt = (-qb + (r == 0 ? -1.0 : 1.0) * sqrt(disc)) / (2.0 * qa);
        if (tt > 0.0 && tt < t) {
          vec4 x = ro + d * tt; float rr = length(x);
          if (dot(x, Gp) > 0.0 && rr > R - goalH && rr < R) {
            float net = step(0.82, fract((R - rr) / 0.8)) + step(0.9, fract(atan(dot(x, Rt), dot(x, U)) * 6.0));
            col = mix(col, gc, 0.22 + 0.4 * min(net, 1.0));
          }
        }
      }
    }
    // the roof: the sphere at height h, within the goal's radius of its pole
    float rb = dot(ro, d), rh = rb * rb - (oo - (R - goalH) * (R - goalH));
    if (rh > 0.0) for (int r = 0; r < 2; r++) {
      float tt = -rb + (r == 0 ? -1.0 : 1.0) * sqrt(rh);
      if (tt > 0.0 && tt < t) {
        vec4 x = ro + d * tt;
        if (acos(clamp(dot(normalize(x), Gp), -1.0, 1.0)) * R < goalR) col = mix(col, gc, 0.3);
      }
    }
  }
  // haze: purple to pink with distance
  float f = 1.0 - exp(-t / (3.2 * R));
  col = mix(col, mix(vec3(0.16, 0.04, 0.26), vec3(0.75, 0.2, 0.55), clamp(dot(d, -normalize(ro)) * 0.5 + 0.5, 0.0, 1.0) * 0.45), f * 0.55);
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
const Un = {};
for (let i = 0, c = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); i < c; i++) { const n = gl.getActiveUniform(prog, i).name; Un[n] = gl.getUniformLocation(prog, n); }
const vao = gl.createVertexArray(), vbuf = gl.createBuffer();
gl.bindVertexArray(vao);
gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// ------------------------------------------------------------------ camera --
// arena.js chaseCamera: behind the bike on the line from the ball, looking at the ball (ball cam) or ahead, the bike
// always in frame, its turn rate capped, its frame built so it can't flip. Its slice is the bike's, so ball lock holds.
const TAN = Math.tan((70 * Math.PI) / 360);
const LOCK = { rate: 1.5, tol: 0.4 };   // ball lock: at most 86°/s, and only once the ball is 0.4 m off your slice
function camera(dt) {
  if (!S.camState) S.camState = {};
  return G.chaseCamera(S.camState, S.bike, S.ball.x, { ballCam: S.ballCam }, Math.max(dt, 1 / 240));
}
let lastCam = null;
function draw(dt) {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  const cam = camera(dt); lastCam = cam;
  const set1 = (n, v) => Un[n] && gl.uniform1f(Un[n], v), set4 = (n, v) => Un[n] && gl.uniform4f(Un[n], ...v);
  set1('R', R); set1('tanH', TAN); set1('aspect', w / h); set1('time', performance.now() / 1000);
  set1('ballR', A.ball.r); set1('goalR', A.goal.r); set1('goalH', A.goal.h); set1('sunR', 6.5);
  set4('E', cam.eye); set4('L', cam.look); set4('U', cam.up); set4('Rt', cam.right); set4('Wv', cam.w);
  set4('ball', S.ball.x);
  // every bike: two wheels, a body leaning toward its turn, a flame when boosting
  const bikes = S.match.bikes, n = Math.min(6, bikes.length), arr = () => new Float32Array(24);
  const wa = arr(), wb = arr(), ba = arr(), bb = arr(), fla = arr(), team = new Float32Array(6), boost = new Float32Array(6);
  bikes.slice(0, n).forEach((b, i) => {
    const k = b.k, u = G.up(k.x), F = k.ground ? k.F : H.unit(H.add(k.F, u, -H.dot(k.F, u))), lu = H.unit(H.add(u, k.lean, 1));
    const b0 = H.add(k.x, lu, 0.7);
    wa.set(H.add(H.add(k.x, F, 0.75), lu, 0.45), i * 4); wb.set(H.add(H.add(k.x, F, -0.75), lu, 0.45), i * 4);
    ba.set(b0, i * 4); bb.set(H.add(H.add(k.x, lu, 1.55), F, 0.15), i * 4);
    fla.set(H.add(H.add(b0, F, -1.3 - 0.3 * Math.random()), lu, -0.1), i * 4);
    team[i] = b.human ? 0 : b.team === 'cyan' ? 1 : 2; boost[i] = k.boosting ? 1 : 0;
  });
  const loc = (nm) => gl.getUniformLocation(prog, nm);
  gl.uniform4fv(loc('wA'), wa); gl.uniform4fv(loc('wB'), wb); gl.uniform4fv(loc('bA'), ba); gl.uniform4fv(loc('bB'), bb); gl.uniform4fv(loc('fl'), fla);
  gl.uniform1fv(loc('bT'), team); gl.uniform1fv(loc('bBoost'), boost); gl.uniform1i(loc('nB'), n);
  set4('own', G.OWN); set4('enemy', G.ENEMY);
  // the aids
  const showPath = S.assist !== 'off' && S.aim && S.state === 'play';
  set1('pathOn', showPath ? 1 : 0);
  if (showPath) { set4('pathA', S.aim.a); set4('pathB', S.aim.b); set1('pathEnd', S.aim.len); }
  const shot = S.assist !== 'off' ? shotLine() : null;
  set1('shotOn', shot ? 1 : 0);
  if (shot) { set4('shotA', shot.a); set4('shotB', shot.b); set1('shotEnd', shot.len); }
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  overlay(cam);
}
// an arc on the floor from unit point a toward b: its heading and length
function arc(a, b) {
  const ah = H.unit(a), bh = H.unit(b), d = H.add(bh, ah, -H.dot(bh, ah));
  if (H.norm(d) < 1e-9) return null;
  return { a: ah, b: H.unit(d), len: Math.acos(Math.max(-1, Math.min(1, H.dot(ah, bh)))) };
}
function shotLine() {
  const bh = H.unit(S.ball.x), len = Math.min(Math.PI - 1e-3, 22 / R + 0 * 1), a = arc(bh, G.ENEMY);
  return a ? { a: a.a, b: a.b, len: Math.min(a.len, len) } : null;
}

// ------------------------------------------------------------------ overlay --
function project(cam, p, W, Hh) {
  const rel = H.add(p, cam.eye, -1), f = H.dot(rel, cam.look);
  const x = H.dot(rel, cam.right), y = H.dot(rel, cam.up);
  return { x: W / 2 + (x / Math.max(f, 1e-3)) * (Hh / 2) / TAN, y: Hh / 2 - (y / Math.max(f, 1e-3)) * (Hh / 2) / TAN, f, w: H.dot(rel, cam.w), dist: H.norm(rel) };
}
function overlay(cam) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = ov.clientWidth, Hh = ov.clientHeight;
  if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(Hh * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(Hh * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, Hh);
  if (S.state === 'title') return;
  // the ball's marker: a ring at the ball, or an arrow at the screen's edge pointing to it; ana/kata of your slice
  const q = project(cam, S.ball.x, W, Hh), off = q.w;
  const onScreen = q.f > 0 && q.x > 20 && q.x < W - 20 && q.y > 20 && q.y < Hh - 20;
  const wc = Math.abs(off) < A.ball.r ? '#ffffff' : off > 0 ? '#38f2e0' : '#ff66b8';
  ctx.lineWidth = 2.5; ctx.strokeStyle = wc; ctx.fillStyle = wc; ctx.font = '700 12px ui-monospace, monospace'; ctx.textAlign = 'center';
  if (onScreen) {
    const rad = Math.max(10, (A.ball.r * (Hh / 2) / TAN) / q.f + 6);
    ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 2 * Math.PI); ctx.stroke();
    if (Math.abs(off) >= A.ball.r) ctx.fillText(`${off > 0 ? '▲ ana' : '▼ kata'} ${Math.abs(off).toFixed(1)} m`, q.x, q.y - rad - 6);
    ctx.fillText(`${Math.round(q.dist)} m`, q.x, q.y + rad + 14);
  } else {
    let dx = q.x - W / 2, dy = q.y - Hh / 2;
    if (q.f <= 0) { dx = -dx; dy = -dy; }
    const m = Math.hypot(dx, dy) || 1, ex = W / 2 + (dx / m) * (Math.min(W, Hh) / 2 - 34), ey = Hh / 2 + (dy / m) * (Math.min(W, Hh) / 2 - 34);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillText('BALL', ex, ey + 24);
  }
  // the other bikes: a small tag over each, in its team's colour; ▲ ▼ when it's off your slice (ana, kata)
  ctx.font = '700 10px ui-monospace, monospace';
  for (const b of S.match.bikes) {
    if (b.human) continue;
    const g = project(cam, H.add(G.bikeBody(b.k), G.up(b.k.x), 1.6), W, Hh);
    if (!(g.f > 0 && g.x > 0 && g.x < W && g.y > 0 && g.y < Hh)) continue;
    const col = b.team === 'cyan' ? '#3af0ff' : '#ffa23a', offs = Math.abs(g.w) < 1 ? '' : g.w > 0 ? ' ▲' : ' ▼';
    ctx.fillStyle = col; ctx.fillText(`${b.team === 'cyan' ? 'MATE' : 'OPP'}${offs}`, g.x, g.y);
  }
  ctx.font = '700 12px ui-monospace, monospace';
  // goal markers
  for (const [pole, name, col] of [[G.ENEMY, 'THEIR GOAL', '#ffa23a'], [G.OWN, 'YOURS', '#3af0ff']]) {
    const g = project(cam, H.scale(pole, R - A.goal.h), W, Hh);
    if (g.f > 0 && g.x > 0 && g.x < W && g.y > 0 && g.y < Hh) {
      ctx.fillStyle = col; ctx.fillText(`${name} ${Math.round(G.along(S.bike.x, H.scale(pole, R)))} m`, g.x, g.y - 6);
    }
  }
  ctx.textAlign = 'left';
  minimap();
}

// The minimap: the whole arena as a ball, on your axes (right, forward, ana up), every point at its walking distance
// (habitat.js mapOf); the rim is the point opposite you.
const mapCv = $('map'), mctx = mapCv.getContext('2d');
function minimap() {
  const size = mapCv.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (mapCv.width !== Math.round(size * dpr)) { mapCv.width = mapCv.height = Math.round(size * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mctx.clearRect(0, 0, size, size);
  const k = S.bike, xh = H.unit(k.x), fr = [k.F, k.Rt, k.N], sc = (size * 0.46) / (Math.PI * R), pitch = 0.7;
  const P = (m) => ({ x: size / 2 + sc * m[0], y: size / 2 - sc * (m[1] * Math.cos(pitch) + m[2] * Math.sin(pitch)), w: m[2] });
  mctx.strokeStyle = 'rgba(255,90,200,0.35)'; mctx.beginPath(); mctx.arc(size / 2, size / 2, size * 0.46, 0, 2 * Math.PI); mctx.stroke();
  for (const [pole, col] of [[G.OWN, '#3af0ff'], [G.ENEMY, '#ffa23a']]) {
    const p = P(H.mapOf(xh, fr, pole, R));
    mctx.fillStyle = col; mctx.beginPath(); mctx.arc(p.x, p.y, 6, 0, 2 * Math.PI); mctx.fill();
  }
  for (const b of S.match.bikes) {
    if (b.human) continue;
    const p = P(H.mapOf(xh, fr, H.unit(b.k.x), R));
    mctx.fillStyle = b.team === 'cyan' ? '#3af0ff' : '#ffa23a';
    mctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
  }
  const bp = P(H.mapOf(xh, fr, H.unit(S.ball.x), R));
  mctx.fillStyle = Math.abs(bp.w) < 3 ? '#fff' : bp.w > 0 ? '#38f2e0' : '#ff66b8';
  mctx.beginPath(); mctx.arc(bp.x, bp.y, 4, 0, 2 * Math.PI); mctx.fill();
  // you
  const o = P([0, 0, 0]), f = P([0, R * 0.35, 0]), wq = P([0, 0, R * 0.25]);
  mctx.strokeStyle = '#38f2e0'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.moveTo(o.x, o.y); mctx.lineTo(wq.x, wq.y); mctx.stroke();
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2.5; mctx.beginPath(); mctx.moveTo(o.x, o.y); mctx.lineTo(f.x, f.y); mctx.stroke();
}

// ------------------------------------------------------------------ input --
const keys = new Set(), pads = { stick: [0, 0] }, btn = { go: false, brake: false, jump: false, boost: false, twist: 0 };
let jumpPressed = false;
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.target.tagName === 'INPUT') return;
  if (k === ' ' && !keys.has(' ')) jumpPressed = true;
  if (k === 'c') setOpt('ballCam', !S.ballCam);
  if (k === 'l') setOpt('lock', !S.lock);
  if (k === 'p' || k === 'escape') toggleMenu();
  if (k === 'enter' && S.state !== 'play') start();
  keys.add(k);
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
});
document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
function stickPad(el, knob) {
  let id = null;
  const move = (e) => {
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = -(e.clientY - r.top - r.height / 2) / (r.height / 2);
    const m = Math.hypot(dx, dy), k = m > 1 ? 1 / m : 1;
    pads.stick = [dx * k, dy * k];
    knob.style.transform = `translate(${dx * k * r.width / 2}px, ${-dy * k * r.height / 2}px)`;
  };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(id); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, (e) => { if (e.pointerId !== id) return; id = null; pads.stick = [0, 0]; knob.style.transform = ''; });
}
stickPad($('stick'), $('stickKnob'));
for (const [id, key] of [['bgo', 'go'], ['bbrake', 'brake'], ['bjump', 'jump'], ['bboost', 'boost']]) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); btn[key] = true; if (key === 'jump') jumpPressed = true; el.classList.add('on'); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { btn[key] = false; el.classList.remove('on'); });
}
const kv = (a, b) => (keys.has(a) ? 1 : 0) - (keys.has(b) ? 1 : 0);
function readInput() {
  const steer = [pads.stick[0] + kv('d', 'a') + kv('arrowright', 'arrowleft'), pads.stick[1] + kv('e', 'q') + kv('r', 'f')].map((v) => Math.max(-1, Math.min(1, v)));
  let throttle = kv('w', 's') + kv('arrowup', 'arrowdown') + (btn.go ? 1 : 0) - (btn.brake ? 1 : 0);
  if (S.autoThrottle && !btn.brake && throttle === 0) throttle = 1;
  return { throttle: Math.max(-1, Math.min(1, throttle)), steer, jump: jumpPressed, jumpHeld: keys.has(' ') || btn.jump, boost: keys.has('shift') || btn.boost };
}

// ------------------------------------------------------------------ the game --
const DT = 1 / 120;
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.state === 'play') {
    acc += dt;
    // stop stepping the moment a step ends play (a goal): the ball is still in the net, and it mustn't count twice
    while (acc >= DT && S.state === 'play') { step(DT); acc -= DT; }
    if (S.state !== 'play') acc = 0;
  } else if (S.state === 'goal') {
    S.bannerT -= dt;
    for (let i = 0; i < Math.round(dt / DT); i++) G.stepBall(S.ball, DT, S.mode);   // the ball rolls on in the net
    if (S.bannerT <= 0) { if (S.clock <= 0) end(); else { newKickoff(); S.state = 'play'; } }
  }
  draw(dt);
  hud();
  if (document.body.dataset.state !== S.state) document.body.dataset.state = S.state;
  requestAnimationFrame(frame);
}
function step(dt) {
  if (S.countdown > 0) {                         // kickoff: frozen, the clock waits
    S.countdown -= dt; jumpPressed = false;
    if (S.lock) G.lockSlice(S.bike, S.ball.x);
    return;
  }
  S.clock -= dt;
  let input = readInput();
  jumpPressed = false;
  const youBefore = S.match.last;
  // the aids: where to meet the ball (refreshed ten times a second), and, on auto, steering along it
  S.itT -= dt;
  if (S.itT <= 0 || !S.aim) {
    S.itT = 0.1;
    const sp = Math.max(9, Math.abs(S.bike.speed));
    const it = G.intercept(S.bike, S.ball, S.mode, sp);
    let target = it.floor;
    if (G.height(S.ball.x) < A.ball.r + 1.2) target = G.approach(it.floor).point;   // a low ball: come from behind it
    S.target = target;
    S.aim = arc(S.bike.x, target);
  }
  if (S.assist === 'steer' && S.bike.ground && S.target) {
    const s = G.steerToward(S.bike, S.target);
    if (Math.hypot(...input.steer) < 0.15) input = { ...input, steer: s.steer };
  }
  // the twist: J and L turn your slice about your heading (when ball lock is off)
  const tw = kv('l', 'j');
  if (tw && !S.lock) { const a = tw * 1.4 * dt, k = S.bike, c = Math.cos(a), s = Math.sin(a), R0 = k.Rt; k.Rt = H.add(H.scale(R0, c), k.N, s); k.N = H.add(H.scale(k.N, c), R0, -s); }
  // everyone moves together: you by your input, the bots by theirs (arena.js stepMatch)
  const r = G.stepMatch(S.match, dt, S.mode, S.skill, Math.random, () => input);
  void youBefore;
  if (S.lock) G.lockSlice(S.bike, S.ball.x, dt, LOCK.rate, LOCK.tol);
  if (r === 'touch' && S.match.last && S.match.last.human) { S.touches++; flash('hit'); }
  if (r === 'cyan' || r === 'orange') goal(r);
  if (S.clock <= 0 && S.state === 'play') end();
}
function goal(side) {
  S.goals[side]++;
  const lastB = S.match.last, yours = lastB && lastB.human && side === 'cyan';
  if (yours) S.mine++;
  S.state = 'goal'; S.bannerT = 2.6;
  const ownGoal = lastB && lastB.team !== side;
  S.banner = side === 'cyan' ? (yours ? 'GOAL!' : 'GOAL') : (+S.team === 0 ? 'OWN GOAL' : ownGoal ? 'OWN GOAL' : 'THEY SCORE');
  $('banner').textContent = S.banner; $('banner').className = `banner show ${side === 'cyan' ? 'ours' : 'theirs'}`;
  setTimeout(() => { $('banner').className = 'banner'; }, 2300);
}
function end() {
  S.state = 'over';
  const c = S.goals.cyan, o = S.goals.orange, n = +S.team;
  const verdict = n === 0 ? '' : c > o ? 'YOU WIN · ' : c < o ? 'YOU LOSE · ' : 'DRAW · ';
  $('final').innerHTML = n === 0 ? `<b>${c}</b> goal${c === 1 ? '' : 's'}${o ? ` · ${o} own goal${o === 1 ? '' : 's'}` : ''} · ${S.touches} touches`
    : `${verdict}<b class="cyan">${c}</b> – <b class="orange">${o}</b> · ${S.mine} yours · ${S.touches} touches`;
  $('title').classList.add('over'); $('title').hidden = false;
}
function start() {
  S.clock = 180; S.goals = { cyan: 0, orange: 0 }; S.mine = 0; S.touches = 0;
  newKickoff(); S.state = 'play';
  $('title').hidden = true; $('title').classList.remove('over');
}
function flash(what) { void what; $('hitfx').classList.remove('go'); void $('hitfx').offsetWidth; $('hitfx').classList.add('go'); }

function hud() {
  const k = S.bike, m = Math.max(0, Math.ceil(S.clock));
  $('clock').textContent = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  $('score').textContent = S.goals.cyan;
  $('conceded').textContent = +S.team === 0 ? (S.goals.orange ? `−${S.goals.orange}` : '') : S.goals.orange;
  $('boostfill').style.height = `${k.boost.toFixed(0)}%`;
  $('boostnum').textContent = Math.round(k.boost);
  $('speed').textContent = `${Math.round(Math.abs(k.ground ? k.speed : H.norm(k.v)) * 3.6)} km/h`;
  $('count').textContent = S.state === 'play' && S.countdown > 0 ? Math.ceil(S.countdown) : '';
  $('count').classList.toggle('show', S.state === 'play' && S.countdown > 0);
}

// ------------------------------------------------------------------ menu --
// Settings are saved on this device (localStorage, when the browser allows it) and restored on the next visit.
const SAVED = ['team', 'skill', 'mode', 'assist', 'lock', 'ballCam', 'autoThrottle'];
function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem('hyperball.settings') || '{}');
    for (const k of SAVED) if (k in o && typeof o[k] === typeof S[k]) S[k] = o[k];
  } catch (e) { /* private window or storage blocked: defaults */ }
}
function saveSettings() {
  try { localStorage.setItem('hyperball.settings', JSON.stringify(Object.fromEntries(SAVED.map((k) => [k, S[k]])))); } catch (e) { /* fine */ }
}
function setOpt(key, val) {
  S[key] = val;
  saveSettings();
  if (key === 'team') $('teamnote').hidden = !(S.state === 'paused' && S.team !== S.matchTeam);
  for (const el of document.querySelectorAll(`[data-opt="${key}"]`)) for (const b of el.children) b.classList.toggle('on', b.dataset.v === String(val));
}
for (const el of document.querySelectorAll('[data-opt]')) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const key = el.dataset.opt, v = b.dataset.v;
    setOpt(key, v === 'true' ? true : v === 'false' ? false : v);
  });
}
function openMenu() {
  $('menu').hidden = false;
  if (S.state === 'play') S.state = 'paused';
  $('teamnote').hidden = true;
  $('menuback').textContent = S.state === 'paused' ? 'BACK TO THE GAME' : 'DONE';
}
function closeMenu() {
  $('menu').hidden = true;
  if (S.state === 'paused') {
    if (S.team !== S.matchTeam) { start(); toast(`new match · ${S.team === '0' ? 'solo' : `${S.team}v${S.team}`}`); }
    else { S.state = 'play'; toast('settings saved'); }
  } else toast('settings saved');
}
function toggleMenu() { if ($('menu').hidden) openMenu(); else closeMenu(); }
function toast(text) { const el = $('toast'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
$('menubtn').onclick = openMenu;
$('titlemenu').onclick = openMenu;
$('menuclose').onclick = closeMenu;
$('menuback').onclick = closeMenu;
$('play').onclick = start;
loadSettings();
for (const k of SAVED) { const v = S[k]; for (const el of document.querySelectorAll(`[data-opt="${k}"]`)) for (const b of el.children) b.classList.toggle('on', b.dataset.v === String(v)); }
addEventListener('resize', () => draw(0));
window.hyperball = { S };   // the game's state, for checking it from outside (tests, the console)
requestAnimationFrame(frame);
