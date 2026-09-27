// main.js — Accretion: a flow that grows its own crystal house, lives in it, and leaves a reef.
//
// packages/attractor/lib/shell.js (copied to ../vendor/attractor) is the creature: its genome, its
// flow and its shell, stepped. This page steps it (15 steps a second at 1×), re-meshes the shell when
// it has changed, and draws the flow over it. The hash carries the seed: #seed=42 (and &at=900 to
// start that far in, grown off-screen first).

import { Creature, pose, liveHalf } from '../vendor/attractor/lib/shell.js';
import { PALETTES } from '../vendor/attractor/lib/avatar.js';
import { makeRenderer } from './gl.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c'), host = $('stage');
let R;
try { R = makeRenderer(canvas); } catch (e) { $('phase').textContent = 'this page needs WebGL'; throw e; }

const look = { cut: true, shell: true, flow: true, xray: 1, flowCol: [1, 0.6, 0.25], pointSize: 1 };
const state = { seed: 1, speed: 1, at: 0 };
const SPEEDS = [[0, 'hold'], [1, '1×'], [4, '4×'], [12, '12×']];
let C = null, carry = 0, meshedAt = -1, meshedVersion = -1, reefAt = -1e9, tau = 0;

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  state.seed = Number(q.get('seed')) || 1 + Math.floor(Math.random() * 1e6);
  state.at = Number(q.get('at')) || 0;
}
function writeHash() { history.replaceState(null, '', `#seed=${state.seed}`); }

function start() {
  C = new Creature(state.seed);
  const pal = Object.values(PALETTES).filter(Boolean);
  look.flowCol = pal[state.seed % pal.length][0];
  meshedVersion = -1; carry = 0;
  if (state.at > 0) C.run(Math.min(6000, state.at));
  writeHash(); info();
}

// ---- the camera: it follows the creature; drag orbits, pinch or wheel zooms ------------------------
const cam = { yaw: 0.7, pitch: 0.38, dist: 88, turn: true, target: null };
let lastTouch = -1e9;
function viewAt(s) {
  const c = pose(C.g, s).c;
  cam.target = cam.target ? cam.target.map((v, i) => v + (c[i] - v) * 0.04) : c.slice();
  const t = cam.target, cp = Math.cos(cam.pitch);
  return { eye: [t[0] + Math.sin(cam.yaw) * cp * cam.dist, t[1] + Math.sin(cam.pitch) * cam.dist, t[2] + Math.cos(cam.yaw) * cp * cam.dist], target: t, fov: 0.75 };
}

// ---- the flow: points running the attractor (by index, a function of time), placed by the pose ------
const M = 1600, LAG = 5;
function flowPoints(s) {
  const buf = R.points(M * LAG), { c, R: Rm, k } = pose(C.g, s), P = C.cloud.p, n = C.cloud.n;
  let o = 0;
  for (let j = 0; j < M; j++) {
    const off = (j * 2654435761) % n, rate = 60 + ((j * 40503) % 100) * 0.9;
    for (let l = 0; l < LAG; l++) {
      const q = (Math.floor((tau - l * 0.022) * rate) + off) % n, u = P[q * 3] * k, v = P[q * 3 + 1] * k, w = P[q * 3 + 2] * k;
      buf[o] = c[0] + Rm[0][0] * u + Rm[0][1] * v + Rm[0][2] * w; buf[o + 1] = c[1] + Rm[1][0] * u + Rm[1][1] * v + Rm[1][2] * w;
      buf[o + 2] = c[2] + Rm[2][0] * u + Rm[2][1] * v + Rm[2][2] * w; buf[o + 3] = 1 - l / LAG; o += 4;
    }
  }
  return buf;
}

function size() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(host.clientWidth * dpr); canvas.height = Math.round(host.clientHeight * dpr);
}
new ResizeObserver(size).observe(host); size();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!C) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now; tau += dt;
  // the growth: 15 steps a second at 1×, at most a few a frame (the page must stay smooth)
  carry += dt * 15 * state.speed;
  let n = Math.min(Math.floor(carry), state.speed > 4 ? 16 : 6);
  carry -= Math.floor(carry);
  const t0 = performance.now();
  while (n-- > 0 && performance.now() - t0 < 24) C.step();
  if (C.version !== meshedVersion && now - meshedAt > 60) {
    const P = pose(C.g, C.s), half = liveHalf(P.k);
    if (now - reefAt > 3000 || meshedVersion < 0) { R.meshReef(C, P.c, half); reefAt = now; }
    R.meshLive(C, P.c, half); meshedVersion = C.version; meshedAt = now;
  }
  if (cam.turn && now / 1000 - lastTouch > 4) cam.yaw += dt * 0.12;
  const s = C.s + carry, view = viewAt(s);
  look.centre = pose(C.g, s).c;
  R.draw(view, s, C.g, flowPoints(s), M * LAG, look);
  if ((frame.k = (frame.k || 0) + 1) % 15 === 0) phase();
}
requestAnimationFrame(frame);

function phase() {
  const g = C.g, s = C.s;
  $('phase').textContent = s < g.grow ? `growing · ${C.count} crystals` : `living · ${C.count} crystals · grown ${C.laid} · dissolved ${C.lost}`;
}
function info() {
  const g = C.g;
  $('info').innerHTML = [
    `<b>seed</b>     ${g.seed}`,
    `<b>flow</b>     ${g.key}`,
    `<b>mineral</b>  ${g.mineral}`,
    `<b>crystals</b> girth ${g.girth.toFixed(2)}, reach ${g.reach.toFixed(1)}, ${g.habit ? 'habit ' + g.habit.toFixed(2) : 'free-grown'}, clustering ${g.cluster.toFixed(2)}`,
    `<b>feeds at</b> ${g.halo.toFixed(3)}   <b>current</b> ${g.channel.toFixed(3)}`,
    `<b>grows</b>    ${g.grow} steps, then wanders at ${g.pace.toFixed(2)}`,
  ].join('\n');
}

// ---- controls ------------------------------------------------------------------------------------
function speeds() {
  $('speeds').innerHTML = '';
  for (const [v, label] of SPEEDS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = v === state.speed ? 'on' : ''; b.onclick = () => { state.speed = v; speeds(); }; $('speeds').append(b); }
}
speeds();
const toggle = (id, fn) => $(id).addEventListener('click', (e) => { const on = !e.target.classList.contains('on'); e.target.classList.toggle('on', on); fn(on); });
toggle('shell', (on) => { look.shell = on; });
toggle('cut', (on) => { look.cut = on; });
toggle('flow', (on) => { look.flow = on; });
toggle('xray', (on) => { look.xray = on ? 1 : 0; });
toggle('turn', (on) => { cam.turn = on; });
$('lucky').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 1e6); state.at = 0; cam.target = null; start(); });
$('restart').addEventListener('click', () => { state.at = 0; cam.target = null; start(); });
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
    else if (pts.size === 2) { const [a, b] = [...pts.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist = Math.max(25, Math.min(220, cam.dist * pinch / dd)); pinch = dd; }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(25, Math.min(220, cam.dist * Math.exp(e.deltaY * 0.0012))); lastTouch = performance.now() / 1000; }, { passive: false });
}

readHash(); start();
window.__accretion = { get C() { return C; }, cam, look, state, R };
