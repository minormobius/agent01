// ship-app.js — fly through the infinite production layer: the ship's circulation. Two interpenetrating
// vessel lattices (material arteries · pedestrian veins, never touching), naves as organs hanging off the
// arteries, the eight verticals glanded along the vessels. It STREAMS around you (deterministic windowed
// field) — fly and it never ends. Rotatable, with depth fog so the vessels recede into the foam.

import { shipWindow, DEFAULTS } from './infinitefoam.js';
import { ENGINES } from './engines.js';
import { ambientOf } from './fixtures.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
const OPT = { ...DEFAULTS, seed }, R = 460;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let focus = { x: 0, y: 0, z: 0 }, win = null;
let yaw = 0.7, pitch = -0.35, Z = 1.0, clock = 0, drift = true;
const keys = new Set();
const MAT = [244, 191, 98], PED = [95, 208, 224], NAVE = [255, 217, 160];

function rewindow() { win = shipWindow(focus, R, OPT); readout(); }
function readout() {
  $('read').innerHTML = `at <b>(${focus.x | 0}, ${focus.y | 0}, ${focus.z | 0})</b> · in view: <b style="color:#ffd9a0">${win.naves.length} naves</b> · ${win.material.hubs.length} artery hubs · ${win.pedestrian.hubs.length} vein hubs<br><span style="color:#566173">the ship continues past the fog in every direction — fly</span>`;
}

// rotate (turntable around focus) + orthographic project; returns screen + a depth in [0..1] for fog (0=near)
function proj(p) {
  const dx = (p.x - focus.x), dy = (p.y - focus.y), dz = (p.z - focus.z);
  const cy = Math.cos(yaw), sy = Math.sin(yaw), xa = dx * cy - dy * sy, ya = dx * sy + dy * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), yb = ya * cp - dz * sp, zb = ya * sp + dz * cp;
  return { x: CW / 2 + xa * Z, y: CH / 2 - zb * Z * 0.95, d: yb };
}
const fog = (d) => Math.max(0.05, Math.min(1, 1 - (d + R) / (2 * R)));   // far (large d) → faint
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function render() {
  if (!win) return;
  // depth-cued black background
  ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, CW, CH);

  // collect drawables (vessel segments + hubs + naves), painter-sort far→near
  const items = [];
  for (const [h, n] of win.material.edges) items.push({ t: 'e', col: MAT, a: proj(h), b: proj(n) });
  for (const [h, n] of win.pedestrian.edges) items.push({ t: 'e', col: PED, a: proj(h), b: proj(n) });
  for (const h of win.material.hubs) items.push({ t: h.nave ? 'nave' : (h.gland ? 'gland' : 'h'), col: MAT, p: proj(h), hub: h });
  for (const h of win.pedestrian.hubs) items.push({ t: 'h', col: PED, p: proj(h), hub: h });
  for (const it of items) it.d = it.p ? it.p.d : (it.a.d + it.b.d) / 2;
  items.sort((x, y) => y.d - x.d);

  for (const it of items) {
    if (it.t === 'e') { const f = fog((it.a.d + it.b.d) / 2); ctx.strokeStyle = rgba(it.col, 0.5 * f); ctx.lineWidth = 1.1 * (0.4 + f); ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke(); }
    else if (it.t === 'nave') { const f = fog(it.d), p = it.p, pulse = 0.7 + 0.3 * Math.sin(clock * 2 + it.hub.ix); const r = (10 + 4 * pulse) * (0.5 + f) * Z;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4); g.addColorStop(0, rgba(NAVE, 0.5 * f)); g.addColorStop(1, rgba(NAVE, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, 7); ctx.fill();
      ctx.fillStyle = rgba(NAVE, 0.9 * f); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(NAVE, f); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = rgba([20, 16, 10], f); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(8, r * 0.9)}px ui-monospace,monospace`; ctx.fillText('☖', p.x, p.y); }
    else if (it.t === 'gland') { const f = fog(it.d), p = it.p, e = ENGINES[it.hub.gland], col = e.color; const r = Math.max(2.5, 5 * (0.5 + f) * Z); const c = parseInt(col.slice(1), 16); ctx.fillStyle = `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${0.85 * f})`; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); }
    else { const f = fog(it.d), p = it.p; ctx.fillStyle = rgba(it.col, 0.55 * f); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.4, 2.4 * (0.5 + f) * Z), 0, 7); ctx.fill(); }
  }

  // the "you are here" — a corpuscle at the focus + a soft reticle
  ctx.strokeStyle = 'rgba(230,235,242,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 7, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(230,235,242,.9)'; ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 2.2, 0, 7); ctx.fill();
  // edge vignette so the foam dissolves into fog (no hard border = no edge to the ship)
  const vg = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.3, CW / 2, CH / 2, Math.max(CW, CH) * 0.62);
  vg.addColorStop(0, 'rgba(3,4,10,0)'); vg.addColorStop(1, 'rgba(3,4,10,.92)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
}

// ── fly: WASD pan in the view plane, Q/E change deck (z); the window re-streams ──
function step(dt) {
  let mx = 0, my = 0, mz = 0;
  if (keys.has('w')) my -= 1; if (keys.has('s')) my += 1; if (keys.has('a')) mx -= 1; if (keys.has('d')) mx += 1;
  if (keys.has('q')) mz += 1; if (keys.has('e')) mz -= 1;
  const auto = drift ? 0.5 : 0;
  if (mx || my || mz || auto) {
    const spd = 120 * dt, cy = Math.cos(yaw), sy = Math.sin(yaw);
    // move in world along the view's forward (my) / right (mx); forward also auto-drifts
    const fwd = my - auto, rgt = mx;
    focus.x += (rgt * cy - fwd * sy) * spd; focus.y += (rgt * sy + fwd * cy) * spd; focus.z += mz * spd;
    rewindow();
  }
}

addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if ('wasdqe'.includes(k)) { keys.add(k); e.preventDefault(); } });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; yaw += (e.clientX - lx) * 0.008; pitch = Math.max(-1.4, Math.min(1.0, pitch + (e.clientY - ly) * 0.006)); lx = e.clientX; ly = e.clientY; });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.45, Math.min(2.6, Z * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
$('drift').addEventListener('click', () => { drift = !drift; $('drift').textContent = drift ? '⏸ drift' : '▶ drift'; });
$('reset').addEventListener('click', () => { yaw = 0.7; pitch = -0.35; Z = 1; });

let _last = 0;
function frame(ts) { const dt = _last ? Math.min(0.05, (ts - _last) / 1000) : 0; _last = ts; clock += dt; step(dt); render(); requestAnimationFrame(frame); }
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize);
resize(); rewindow(); requestAnimationFrame(frame);
$('drift').textContent = '⏸ drift';
