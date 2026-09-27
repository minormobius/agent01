// main.js — Accretion: flows that grow their own crystal houses, live in them, and share a world.
//
// packages/attractor/lib/shell.js (copied to ../vendor/attractor) is the world: a medium of dissolved
// mineral in veins, and creatures (a flow and its house each) that graze it, build from it, push and
// carve each other, and move by hunger. This page steps it (15 steps a second at 1×), re-meshes each
// house when it has changed, and draws the flows over them. The hash carries the world:
// #seed=42&n=3 (and &at=900 to start that far in, grown off-screen first).

import { World, liveHalf } from '../vendor/attractor/lib/shell.js';
import { PALETTES } from '../vendor/attractor/lib/avatar.js';
import { makeRenderer } from './gl.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c'), host = $('stage');
let R;
try { R = makeRenderer(canvas); } catch (e) { $('phase').textContent = 'this page needs WebGL'; throw e; }

const look = { cut: true, shell: true, flow: true, crust: true, glow: false, xray: 1, pointSize: 1 };
const state = { seed: 1, n: 3, speed: 1, at: 0, follow: -1 };      // follow: -1 the whole world, else a creature
const SPEEDS = [[0, 'hold'], [1, '1×'], [4, '4×'], [12, '12×']];
let W = null, carry = 0, meshedAt = -1, meshedVersion = -1, reefAt = -1e9, tau = 0, cols = [];

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  state.seed = Number(q.get('seed')) || 1 + Math.floor(Math.random() * 1e6);
  state.n = Math.max(1, Math.min(5, Number(q.get('n')) || 3));
  state.at = Number(q.get('at')) || 0;
}
function writeHash() { history.replaceState(null, '', `#seed=${state.seed}&n=${state.n}`); }

function start() {
  R.forget();
  W = new World(state.seed, state.n);
  const pal = Object.values(PALETTES).filter(Boolean);
  cols = W.creatures.map((C, i) => pal[(state.seed + i * 3) % pal.length][0]);
  meshedVersion = -1; carry = 0; state.follow = Math.min(state.follow, W.creatures.length - 1);
  if (state.at > 0) W.run(Math.min(6000, state.at));
  writeHash(); info(); follows();
}

// ---- the camera: it follows the world (or one creature); drag orbits, pinch or wheel zooms -----------
const cam = { yaw: 0.7, pitch: 0.42, dist: 1, turn: true, target: null };
let lastTouch = -1e9;
function focus(f) {
  const Cs = state.follow >= 0 ? [W.creatures[state.follow]] : W.creatures;
  const cs = Cs.map((C) => C.poseAt(f).c), m = [0, 1, 2].map((q) => cs.reduce((a, c) => a + c[q], 0) / cs.length);
  const spread = Math.max(...cs.map((c) => Math.hypot(c[0] - m[0], c[2] - m[2]))) + Math.max(...Cs.map((C) => C.g.scale)) * 2.2;
  return { m, spread };
}
function viewAt(f) {
  const { m, spread } = focus(f);
  cam.target = cam.target ? cam.target.map((v, i) => v + (m[i] - v) * 0.03) : m.slice();
  cam.base = cam.base ? cam.base + (spread * 1.9 - cam.base) * 0.02 : spread * 1.9;
  const t = cam.target, cp = Math.cos(cam.pitch), d = cam.base * cam.dist;
  return { eye: [t[0] + Math.sin(cam.yaw) * cp * d, t[1] + Math.sin(cam.pitch) * d, t[2] + Math.cos(cam.yaw) * cp * d], target: t, fov: 0.75 };
}

// ---- the flows: points running each attractor (by index, a function of time), placed by its pose -----
const M = 1400, LAG = 5, bufs = [];
function flows(f) {
  return W.creatures.map((C, ci) => {
    const buf = (bufs[ci] ||= new Float32Array(M * LAG * 4)), P = C.poseAt(f), { c, R: Rm, k } = P, Pp = C.cloud.p, n = C.cloud.n;
    let o = 0;
    for (let j = 0; j < M; j++) {
      const off = (j * 2654435761 + ci * 7919) % n, rate = 60 + ((j * 40503) % 100) * 0.9;
      for (let l = 0; l < LAG; l++) {
        const q = (Math.floor((tau - l * 0.022) * rate) + off) % n, u = Pp[q * 3] * k, v = Pp[q * 3 + 1] * k, w = Pp[q * 3 + 2] * k;
        buf[o] = c[0] + Rm[0][0] * u + Rm[0][1] * v + Rm[0][2] * w; buf[o + 1] = c[1] + Rm[1][0] * u + Rm[1][1] * v + Rm[1][2] * w;
        buf[o + 2] = c[2] + Rm[2][0] * u + Rm[2][1] * v + Rm[2][2] * w; buf[o + 3] = 1 - l / LAG; o += 4;
      }
    }
    return { buf, n: M * LAG, col: cols[ci], centre: c };
  });
}

function size() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(host.clientWidth * dpr); canvas.height = Math.round(host.clientHeight * dpr);
}
new ResizeObserver(size).observe(host); size();

// is a point near any flow? (then its crystal is live: fed, grown or carved; otherwise it is reef)
const nearAny = () => {
  const boxes = W.creatures.map((C) => { const P = C.poseAt(1); return [P.c, liveHalf(P.k) + 1]; });
  return (x, y, z) => boxes.some(([c, h]) => Math.abs(x - c[0]) < h && Math.abs(y - c[1]) < h && Math.abs(z - c[2]) < h);
};

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!W) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now; tau += dt;
  // the world: 15 steps a second at 1×, at most a few a frame (the page must stay smooth)
  carry += dt * 15 * state.speed;
  let n = Math.min(Math.floor(carry), state.speed > 4 ? 12 : 5);
  carry -= Math.floor(carry);
  const t0 = performance.now();
  while (n-- > 0 && performance.now() - t0 < 24) W.step();
  if (W.version !== meshedVersion && now - meshedAt > 70) {
    const near = nearAny();
    if (now - reefAt > 3000 || meshedVersion < 0) { for (const C of W.creatures) R.meshReef(C, near); reefAt = now; }
    for (const C of W.creatures) R.meshLive(C, near);
    meshedVersion = W.version; meshedAt = now;
  }
  if (cam.turn && now / 1000 - lastTouch > 4) cam.yaw += dt * 0.1;
  const f = Math.min(1, carry), view = viewAt(f);
  R.draw(view, W.s - 1 + f, W, flows(f), look);
  if ((frame.k = (frame.k || 0) + 1) % 15 === 0) phase();
}
requestAnimationFrame(frame);

function phase() {
  $('phase').textContent = `step ${W.s} · ${W.count} crystals · ` + W.creatures.map((C, i) => `${i + 1} ${C.hunger > 0.6 ? 'hungry' : C.hunger > 0.15 ? 'grazing' : 'fed'}`).join(' · ');
}
function info() {
  $('info').innerHTML = [`<b>world</b>    seed ${state.seed}, ${W.creatures.length} ${W.creatures.length > 1 ? 'creatures' : 'creature'}`, ...W.creatures.map((C, i) => {
    const g = C.g;
    return `<b>${i + 1}</b>  ${g.mineral}, ${g.key.slice(0, 10)}…  girth ${g.girth.toFixed(2)} reach ${g.reach.toFixed(1)}${g.habit ? ' habit ' + g.habit.toFixed(2) : ''}  appetite ${g.appetite.toFixed(2)} restless ${g.restless.toFixed(2)}`;
  })].join('\n');
}

// ---- controls ------------------------------------------------------------------------------------
function speeds() {
  $('speeds').innerHTML = '';
  for (const [v, label] of SPEEDS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = v === state.speed ? 'on' : ''; b.onclick = () => { state.speed = v; speeds(); }; $('speeds').append(b); }
}
function follows() {
  $('follow').innerHTML = '';
  for (const i of [-1, ...W.creatures.map((_, k) => k)]) { const b = document.createElement('button'); b.type = 'button'; b.textContent = i < 0 ? 'the world' : `follow ${i + 1}`; b.className = i === state.follow ? 'on' : ''; b.onclick = () => { state.follow = i; follows(); }; $('follow').append(b); }
}
speeds();
const toggle = (id, fn) => $(id).addEventListener('click', (e) => { const on = !e.target.classList.contains('on'); e.target.classList.toggle('on', on); fn(on); });
toggle('shell', (on) => { look.shell = on; });
toggle('cut', (on) => { look.cut = on; });
toggle('crust', (on) => { look.crust = on; });
toggle('glow', (on) => { look.glow = on; });
toggle('flow', (on) => { look.flow = on; });
toggle('xray', (on) => { look.xray = on ? 1 : 0; });
toggle('turn', (on) => { cam.turn = on; });
$('lucky').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 1e6); state.at = 0; cam.target = null; start(); });
$('restart').addEventListener('click', () => { state.at = 0; cam.target = null; start(); });
$('more').addEventListener('click', () => { state.n = state.n % 5 + 1; state.at = 0; cam.target = null; start(); });
window.addEventListener('keydown', (e) => { if (e.key === 'l' || e.key === 'L') $('lucky').click(); });
window.addEventListener('hashchange', () => { readHash(); cam.target = null; start(); });

{
  const pts = new Map(); let pinch = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ } pts.set(e.pointerId, [e.clientX, e.clientY]); lastTouch = performance.now() / 1000; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const d = [e.clientX - p[0], e.clientY - p[1]]; pts.set(e.pointerId, [e.clientX, e.clientY]); lastTouch = performance.now() / 1000;
    if (pts.size === 1) { cam.yaw -= d[0] * 0.007; cam.pitch = Math.max(-1.2, Math.min(1.45, cam.pitch + d[1] * 0.006)); }
    else if (pts.size === 2) { const [a, b] = [...pts.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist = Math.max(0.25, Math.min(3, cam.dist * pinch / dd)); pinch = dd; }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(0.25, Math.min(3, cam.dist * Math.exp(e.deltaY * 0.0012))); lastTouch = performance.now() / 1000; }, { passive: false });
}

readHash(); start();
window.__accretion = { get W() { return W; }, get C() { return W.creatures[0]; }, cam, look, state, R };
