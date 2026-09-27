// main.js — Grown: bodies grown organ by organ from a developmental program, as they eat.
//
// packages/attractor/lib/organism.js (copied to ../vendor/attractor) is the world: a medium of mineral
// in veins and the bodies in it. This page steps it, draws each organ as its attractor, the bonds as
// threads, armour and reef as crystal and the medium as a haze, and tells you who is alive.
// The hash carries the world: #seed=42&with=all (or grazer, reef, swimmer).

import { World, GENOMES, ORGANS, flowsFor, WX, WY, WZ } from '../vendor/attractor/lib/organism.js';
import { makeRenderer, prism } from './gl.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c'), host = $('stage');
let R;
try { R = makeRenderer(canvas); } catch (e) { $('phase').textContent = 'this page needs WebGL'; throw e; }

const NAMES = Object.keys(GENOMES), FOUNDERS = ['all', ...NAMES];
const state = { seed: 1, with: 'all', speed: 1, follow: null, haze: true };
const SPEEDS = [[0, 'hold'], [1, '1×'], [4, '4×'], [16, '16×']];
let W = null, carry = 0, tau = 0, reefLen = -1;
const nameOf = (g) => NAMES.find((n) => GENOMES[n] === g) || 'mutant';

function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  state.seed = Number(q.get('seed')) || 1 + Math.floor(Math.random() * 1e6);
  state.with = FOUNDERS.includes(q.get('with')) ? q.get('with') : 'all';
}
function writeHash() { history.replaceState(null, '', `#seed=${state.seed}&with=${state.with}`); }

function start() {
  W = new World(state.seed, { cap: 60 });
  const kinds = state.with === 'all' ? NAMES : [state.with], per = state.with === 'all' ? 3 : 6;
  kinds.forEach((n, i) => { for (let k = 0; k < per; k++) { const a = ((i * per + k) / (kinds.length * per)) * Math.PI * 2; W.add(GENOMES[n], [WX / 2 + Math.cos(a) * 45, WY / 2, WZ / 2 + Math.sin(a) * 45], a, 4); } });
  state.follow = null; reefLen = -1; carry = 0; cam.target = null;
  writeHash(); buttons();
}

// ---- the camera --------------------------------------------------------------------------------------
const cam = { yaw: 0.6, pitch: 0.5, dist: 1, turn: true, target: null, base: 120 };
let lastTouch = -1e9;
function viewAt(f) {
  let m, spread;
  const B = state.follow != null && W.bodies.find((b) => b.id === state.follow);
  if (B) { m = B.pose(f).p; spread = 4 + B.size() * 1.1; }
  else if (state.follow != null) { state.follow = null; buttons(); return viewAt(f); }
  else if (W.bodies.length) {                              // the living: their middle, and how far they spread
    const ps = W.bodies.map((b) => b.pose(f).p); m = [0, 1, 2].map((q) => ps.reduce((a, p) => a + p[q], 0) / ps.length);
    const r = ps.map((p) => Math.hypot(p[0] - m[0], p[2] - m[2])).sort((x, y) => x - y);
    spread = Math.max(22, Math.min(95, r[Math.floor(r.length * 0.85)] + 8));
  } else { m = [WX / 2, WY / 2, WZ / 2]; spread = WX * 0.5; }
  cam.target = cam.target ? cam.target.map((v, i) => v + (m[i] - v) * 0.05) : m.slice();
  cam.base += (spread * 1.7 - cam.base) * 0.04;
  const t = cam.target, cp = Math.cos(cam.pitch), d = cam.base * cam.dist;
  return { eye: [t[0] + Math.sin(cam.yaw) * cp * d, t[1] + Math.sin(cam.pitch) * d, t[2] + Math.cos(cam.yaw) * cp * d], target: t, fov: 0.75 };
}

// ---- drawing a frame's light and crystal ----------------------------------------------------------------
const gseed = new WeakMap();
const seedOf = (g) => { if (!gseed.has(g)) { let h = 7; for (const ch of JSON.stringify(g)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; gseed.set(g, h >>> 0); } return gseed.get(g); };
function point(buf, p, col, b, size) { buf.need(7); buf.a.set([p[0], p[1], p[2], col[0] * b, col[1] * b, col[2] * b, size], buf.n); buf.n += 7; }
function scene(f) {
  const P = R.points, C = R.crystals; P.n = 0; C.n = 0;
  for (const B of W.bodies) {
    const pose = B.pose(f), flows = flowsFor(seedOf(B.genome)), hungry = Math.max(0, Math.min(1, 1 - B.E / (B.capacity() * 0.3)));
    for (const o of pose.organs) {
      const cl = flows[o.type], n = Math.round(40 + 70 * o.size), r = 0.45 + 0.6 * o.size, d = o.axis;
      let e1 = Math.abs(d[1]) < 0.9 ? [d[2], 0, -d[0]] : [0, -d[2], d[1]]; const l1 = Math.hypot(...e1); e1 = e1.map((v) => v / l1);
      const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
      const col = ORGANS[o.type].colour, glow = (o.type === 'mouth' ? 1.2 : 1) * (1 - 0.6 * hungry);
      for (let j = 0; j < n; j++) {
        const off = (j * 2654435761 + o.i * 40503 + B.id * 97) % cl.n, rate = 50 + ((j * 7919) % 60);
        for (let l = 0; l < 3; l++) {
          const q = (Math.floor((tau - l * 0.03) * rate) + off) % cl.n, x = cl.p[q * 3] * r, y = cl.p[q * 3 + 1] * r, z = cl.p[q * 3 + 2] * r;
          point(P, [o.p[0] + d[0] * x + e1[0] * y + e2[0] * z, o.p[1] + d[1] * x + e1[1] * y + e2[1] * z, o.p[2] + d[2] * x + e1[2] * y + e2[2] * z], col, 0.3 * glow * (1 - l / 3), 0.9);
        }
      }
      if (o.parent >= 0) { const a = pose.organs[o.parent].p; for (let k = 1; k < 10; k++) point(P, [a[0] + (o.p[0] - a[0]) * k / 10, a[1] + (o.p[1] - a[1]) * k / 10, a[2] + (o.p[2] - a[2]) * k / 10], [0.8, 0.75, 0.9], 0.12, 0.7); }
    }
    for (const c of B.crystals) {
      const o = pose.organs[c.organ]; if (!o) continue;
      const F = o.frame, d = [F.r[0] * c.dir[0] + F.u[0] * c.dir[1] + F.f[0] * c.dir[2], F.r[1] * c.dir[0] + F.u[1] * c.dir[1] + F.f[1] * c.dir[2], F.r[2] * c.dir[0] + F.u[2] * c.dir[1] + F.f[2] * c.dir[2]];
      prism(C, [o.p[0] + d[0] * 0.2 * o.size, o.p[1] + d[1] * 0.2 * o.size, o.p[2] + d[2] * 0.2 * o.size], d, c.len, 0.1 + 0.08 * c.len, c.spin, W.s - c.born, (B.lineage % 7) / 7);
    }
  }
  if (W.reef.length !== reefLen) { R.reef.n = 0; for (const c of W.reef) prism(R.reef, c.p, c.dir, c.len, 0.1 + 0.08 * c.len, c.spin, 3000, (c.lineage % 7) / 7); R.uploadReef(); reefLen = W.reef.length; }
  if (state.haze) {                                        // the medium: a mote per cell, as bright as its mineral
    const M = W.medium, MX = WX / 4, MZ = WZ / 4;
    for (let i = 0; i < M.length; i++) { const m = M[i]; if (m < 0.12) continue; const x = i % MX, z = Math.floor(i / MX) % MZ, y = Math.floor(i / (MX * MZ)), h = ((i * 2654435761) >>> 0) / 4294967296, h2 = ((i * 40503 + 7) * 2246822519 >>> 0) / 4294967296, h3 = ((i * 97 + 3) * 3266489917 >>> 0) / 4294967296; point(P, [(x + h) * 4, (y + h2) * 4, (z + h3) * 4], [0.25, 0.55, 0.6], 0.14 * Math.min(1.2, m), 2.2); }
  }
}

function size() { const dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(host.clientWidth * dpr); canvas.height = Math.round(host.clientHeight * dpr); }
new ResizeObserver(size).observe(host); size();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!W) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now; tau += dt;
  carry += dt * 30 * state.speed;
  let n = Math.min(Math.floor(carry), state.speed > 4 ? 40 : 10); carry -= Math.floor(carry);
  const t0 = performance.now();
  while (n-- > 0 && performance.now() - t0 < 22) W.step();
  if (cam.turn && now / 1000 - lastTouch > 4) cam.yaw += dt * 0.08;
  const f = Math.min(1, carry);
  scene(f); R.draw(viewAt(f));
  if ((frame.k = (frame.k || 0) + 1) % 15 === 0) info();
}
requestAnimationFrame(frame);

function info() {
  const by = {}; for (const B of W.bodies) { const n = nameOf(B.genome); by[n] = (by[n] || 0) + 1; }
  $('phase').textContent = `step ${W.s} · ${W.bodies.length} alive (${Object.entries(by).map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`).join(', ') || 'none'}) · ${W.dead.length} dead · ${W.reef.length} reef crystals`;
  const B = state.follow != null && W.bodies.find((b) => b.id === state.follow);
  const lines = [`<b>world</b>  seed ${state.seed}, founders: ${state.with === 'all' ? 'three of each' : 'six ' + state.with + 's'}`];
  if (B) {
    const counts = {}; for (const o of B.organs) counts[o.type] = (counts[o.type] || 0) + 1;
    lines.push(`<b>this one</b>  a ${nameOf(B.genome)}, #${B.id}${B.parent != null ? ', child of #' + B.parent : ''}`,
      `<b>organs</b>  ${B.grown} of ${B.plan.length} grown: ${Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ')}`,
      `<b>energy</b>  ${B.E.toFixed(1)} of ${B.capacity().toFixed(1)}   <b>age</b> ${B.age}   <b>children</b> ${B.children}   <b>armour</b> ${B.crystals.length}`);
  } else lines.push('Tap "follow one" to ride along with a body and read it.');
  $('info').innerHTML = lines.join('\n');
}

// ---- controls ------------------------------------------------------------------------------------
function buttons() {
  $('founders').innerHTML = ''; $('speeds').innerHTML = '';
  for (const k of FOUNDERS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = k === 'all' ? 'all three' : k + 's'; b.className = k === state.with ? 'on' : ''; b.onclick = () => { state.with = k; start(); }; $('founders').append(b); }
  for (const [v, label] of SPEEDS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = v === state.speed ? 'on' : ''; b.onclick = () => { state.speed = v; buttons(); }; $('speeds').append(b); }
  $('world').classList.toggle('on', state.follow == null);
  $('follow').classList.toggle('on', state.follow != null);
}
$('follow').addEventListener('click', () => {
  // the next body, oldest first
  const order = W.bodies.slice().sort((a, b) => b.age - a.age), i = order.findIndex((b) => b.id === state.follow);
  const B = order[(i + 1) % order.length]; state.follow = B ? B.id : null; buttons(); info();
});
$('world').addEventListener('click', () => { state.follow = null; buttons(); info(); });
$('haze').addEventListener('click', (e) => { state.haze = !state.haze; e.target.classList.toggle('on', state.haze); });
$('turn').addEventListener('click', (e) => { cam.turn = !cam.turn; e.target.classList.toggle('on', cam.turn); });
$('lucky').addEventListener('click', () => { state.seed = 1 + Math.floor(Math.random() * 1e6); start(); });
$('restart').addEventListener('click', () => start());
window.addEventListener('hashchange', () => { readHash(); start(); });
{
  const pts = new Map(); let pinch = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic */ } pts.set(e.pointerId, [e.clientX, e.clientY]); lastTouch = performance.now() / 1000; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const d = [e.clientX - p[0], e.clientY - p[1]]; pts.set(e.pointerId, [e.clientX, e.clientY]); lastTouch = performance.now() / 1000;
    if (pts.size === 1) { cam.yaw -= d[0] * 0.007; cam.pitch = Math.max(-1.2, Math.min(1.45, cam.pitch + d[1] * 0.006)); }
    else if (pts.size === 2) { const [a, b] = [...pts.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.dist = Math.max(0.2, Math.min(3, cam.dist * pinch / dd)); pinch = dd; }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(0.2, Math.min(3, cam.dist * Math.exp(e.deltaY * 0.0012))); lastTouch = performance.now() / 1000; }, { passive: false });
}

readHash(); start();
window.__grown = { get W() { return W; }, state, cam, R };
