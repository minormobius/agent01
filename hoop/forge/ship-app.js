// ship-app.js — fly the rind, an O'Neill cylinder shell, looking DOWN THE BORE. The camera sits near the
// axis and stares along it, so the ship reads as an infinite tunnel: concentric shells recede to a
// vanishing point, the naves stud the inner ring (the inner skin — "up" is inward, toward the bioengine),
// production stratifies OUTWARD shell by shell (assembly → refine → foundry → reclaim), and the lower rind
// is the dim outermost band (deferred). Two interpenetrating vessel systems (material arteries · pedestrian
// veins) thread the shell as longitudinal lines converging to the vanishing point — never touching.
// Bounded in radius + circumference (the ring closes around you), INFINITE along the axis: fly W/S and the
// tunnel streams forever, new ship resolving out of the fog ahead.

import { shipWindow, DEFAULTS, SHELL } from './infinitefoam.js';
import { ENGINES } from './engines.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
const OPT = { ...DEFAULTS, seed, Nth: 22 }, SPAN = 460;
const R0 = OPT.R0, ROUT = OPT.R0 + OPT.Nr * OPT.Tr;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let a0 = 0, win = null;            // a0 = axial position; the player flies along the infinite axis
let yaw = 0.0, pitch = 0.13, Z = 1.0, clock = 0, drift = false;
const keys = new Set();
const FOC = 560, CAMBACK = 250, NEAR = 26;     // perspective: focal length, camera set-back, near clip
const MAT = [244, 191, 98], PED = [95, 208, 224], NAVE = [255, 214, 150];
const roleCol = { nave: NAVE, assembly: [244, 191, 98], refine: [95, 208, 224], foundry: [224, 119, 47], reclaim: [207, 107, 74], lower: [98, 108, 128] };

function rewindow() { win = shipWindow(a0 + SPAN * 0.45, SPAN, OPT); readout(); }   // window biased ahead → a long tunnel
function readout() {
  $('read').innerHTML = `axial <b>${a0 | 0}</b> · ahead of you: <b style="color:#ffd696">${win.naves.length} naves</b> on the inner skin · ${win.material.hubs.length} artery hubs<br>` +
    `<span style="color:#566173">radius bounded (${OPT.Nr} shells) · the ring closes around you · the axis runs to ∞ — fly W/S</span>`;
}

// PERSPECTIVE down the bore. Camera on the axis at a0, looking along +axis. yaw rolls the tube; pitch tilts
// the look a touch off-axis so the far rim of each ring shows. Points behind the near plane are culled.
function proj(p) {
  const cr = Math.cos(yaw), sr = Math.sin(yaw);
  const rx = p.x * cr - p.y * sr, ry0 = p.x * sr + p.y * cr;   // roll the cross-section about the bore
  const fwd = (p.z - a0) + CAMBACK;                            // distance ahead of the camera
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const ry = ry0 * cp - fwd * sp, depth = ry0 * sp + fwd * cp; // gentle tilt mixes vertical with depth
  if (depth <= NEAR) return { cull: true, d: -1e9 };
  const s = (FOC * Z) / depth;
  return { x: CW / 2 + rx * s, y: CH / 2 - ry * s, d: depth, s, cull: false };
}
const fog = (depth) => Math.max(0.04, Math.min(1, 1.15 - (depth - CAMBACK) / (2.1 * SPAN)));  // recede into ∞
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function ring(rho, z, alpha) {   // a guide circle of the cylinder at radius rho, axial station z
  ctx.beginPath(); let started = false;
  for (let k = 0; k <= 56; k++) { const a = k / 56 * Math.PI * 2, p = proj({ x: rho * Math.cos(a), y: rho * Math.sin(a), z }); if (p.cull) { started = false; continue; } if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y); }
  ctx.strokeStyle = `rgba(150,170,200,${alpha})`; ctx.lineWidth = 1; ctx.stroke();
}

function render() {
  if (!win) return;
  ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, CW, CH);

  // guide rings: the inner skin (R0, where the naves live) + the outer rind boundary (ROUT), at a ladder of
  // axial stations marching into the bore → the tube. Far rings dimmer (fog) → it recedes to a vanishing pt.
  for (let dz = -CAMBACK + 60; dz <= SPAN * 1.6; dz += OPT.Tz * 1.5) { const f = fog(dz + CAMBACK); ring(R0, a0 + dz, 0.26 * f); ring(ROUT, a0 + dz, 0.13 * f); }

  // drawables: vessels + hubs + naves, painter-sorted far→near
  const items = [];
  for (const [h, n] of win.material.edges) { const a = proj(h), b = proj(n); if (!a.cull && !b.cull) items.push({ t: 'e', col: MAT, a, b, depth: (a.d + b.d) / 2 }); }
  for (const [h, n] of win.pedestrian.edges) { const a = proj(h), b = proj(n); if (!a.cull && !b.cull) items.push({ t: 'e', col: PED, a, b, depth: (a.d + b.d) / 2 }); }
  for (const h of win.material.hubs) { const p = proj(h); if (!p.cull) items.push({ t: h.nave ? 'nave' : 'h', col: roleCol[h.role] || MAT, p, hub: h, depth: p.d }); }
  for (const h of win.pedestrian.hubs) { const p = proj(h); if (!p.cull) items.push({ t: 'p', col: PED, p, depth: p.d }); }
  items.sort((x, y) => y.depth - x.depth);

  for (const it of items) {
    const f = fog(it.depth);
    if (it.t === 'e') { ctx.strokeStyle = rgba(it.col, 0.4 * f); ctx.lineWidth = 1.05 * (0.4 + f); ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke(); }
    else if (it.t === 'nave') { const p = it.p, pulse = 0.7 + 0.3 * Math.sin(clock * 2 + it.hub.ith), r = (7 + 2.5 * pulse) * p.s * 1.1;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6); g.addColorStop(0, rgba(NAVE, 0.5 * f)); g.addColorStop(1, rgba(NAVE, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = rgba(NAVE, 0.92 * f); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(NAVE, f); ctx.lineWidth = 1.3; ctx.stroke();
      if (r > 6) { ctx.fillStyle = rgba([20, 15, 8], f); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(8, r * 0.95)}px ui-monospace,monospace`; ctx.fillText('☖', p.x, p.y); } }
    else { const p = it.p, isGland = it.t === 'h' && it.hub.gland, col = isGland ? hex(ENGINES[it.hub.gland].color) : it.col;
      ctx.fillStyle = rgba(col, (it.t === 'p' ? 0.5 : 0.82) * f); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.1, (isGland ? 3.0 : 2.0) * p.s), 0, 7); ctx.fill(); }
  }

  // directionality compass: the bore centre is INWARD (naves / bioengine, "up"); the rim is OUTWARD (lower
  // rind, "down"); straight into the screen is the infinite axis.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '10px ui-monospace,monospace';
  ctx.fillStyle = 'rgba(255,214,150,.8)'; ctx.fillText('inner skin · naves → bioengine (up)', CW / 2, CH / 2 - 8);
  ctx.fillStyle = 'rgba(98,108,128,.7)'; ctx.fillText('↓ lower rind (deferred)', CW / 2, CH - 56);
  ctx.fillStyle = 'rgba(135,148,166,.62)'; ctx.font = '11px ui-monospace,monospace'; ctx.fillText('· axis → ∞ ·', CW / 2, CH / 2 + 10);

  // vignette → the foam dissolves into fog (no edge to the ship)
  const vg = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.30, CW / 2, CH / 2, Math.max(CW, CH) * 0.62);
  vg.addColorStop(0, 'rgba(3,4,10,0)'); vg.addColorStop(1, 'rgba(3,4,10,.92)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
}
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// ── fly: W/S along the axis (the infinite dimension); A/D roll the tube; the window streams ──
function step(dt) {
  let along = 0; if (keys.has('w')) along += 1; if (keys.has('s')) along -= 1;
  if (keys.has('a')) yaw -= dt * 0.7; if (keys.has('d')) yaw += dt * 0.7;
  const auto = drift ? 0.4 : 0;
  if (along || auto) { a0 += (along + auto) * 170 * dt; rewindow(); }
}

addEventListener('keydown', (e) => { const k = e.key.toLowerCase(); if ('wasd'.includes(k)) { keys.add(k); e.preventDefault(); } });
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; yaw += (e.clientX - lx) * 0.007; pitch = Math.max(-0.5, Math.min(0.7, pitch + (e.clientY - ly) * 0.004)); lx = e.clientX; ly = e.clientY; });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.5, Math.min(2.6, Z * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });
$('drift').addEventListener('click', () => { drift = !drift; $('drift').textContent = drift ? '⏸ drift' : '▶ drift'; });
$('reset').addEventListener('click', () => { yaw = 0; pitch = 0.13; Z = 1.0; });

let _last = 0;
function frame(ts) { const dt = _last ? Math.min(0.05, (ts - _last) / 1000) : 0; _last = ts; clock += dt; step(dt); render(); requestAnimationFrame(frame); }
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize);
resize(); rewindow(); requestAnimationFrame(frame);
$('drift').textContent = drift ? '⏸ drift' : '▶ drift';
