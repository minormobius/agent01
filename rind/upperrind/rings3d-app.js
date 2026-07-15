// rings3d-app.js — the 3D analytic solve of the ring weave (ringweave.js buildRingWeave3D). Pure canvas,
// hand-rolled orbit projection (the repo's 3d idiom, no three.js). Threads + rings weave OVER/UNDER; the
// proposed antechambers sit as flat squares on the z=0 mid-plane, one per crossing. Drag to spin.
import { buildRingWeave3D, ABOVE, BELOW } from './ringweave.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const W = buildRingWeave3D();
const state = { yaw: 0.6, pitch: 0.95, zoom: 1, spin: true, ante: true, rings: true, threads: true, plane: true, labels: false, drag: null };

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const c = typeof h === 'string' ? hex(h) : h; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; }
addEventListener('resize', resize);

// ── orbit projection: yaw about z, pitch tilt → screen (depth for painter's sort) ──
function proj(x, y, z, s) {
  const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw); const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch); const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
  return { X: CW / 2 + x1 * s, Y: CH / 2 - z2 * s, depth: y2 };
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, CW, CH);
  const s = Math.min(CW, CH) * 0.40 * state.zoom;
  const P = (p) => proj(p[0], p[1], p[2], s);
  const items = [];   // {depth, draw()}

  // the z=0 mid-plane — where the antechambers live; faint rim + the two ring circles
  if (state.plane) {
    const ring = (rad, col, a) => { const pts = []; for (let i = 0; i <= 96; i++) { const t = i / 96 * Math.PI * 2; pts.push(P([Math.cos(t) * rad, Math.sin(t) * rad, 0])); } items.push({ depth: -9e9, draw() { ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)); ctx.stroke(); } }); };
    ring(1, [127, 216, 208], 0.12); ring(W.rings.outer.r, hex('#cf6b4a'), 0.16); ring(W.rings.inner.r, hex('#d9b24a'), 0.16);
  }

  // threads (below under above) — each an over/under polyline
  if (state.threads) for (const th of W.threads3d) {
    const pts = th.line3.map(P), depth = pts.reduce((a, p) => a + p.depth, 0) / pts.length;
    const wdt = th.layer === 'above' ? 2.4 : 1.8;
    items.push({ depth, draw() { ctx.strokeStyle = rgba(th.color, 0.95); ctx.lineWidth = wdt; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)); ctx.stroke(); } });
    if (state.labels) { const e = pts[pts.length - 1]; items.push({ depth: e.depth + 0.01, draw() { ctx.fillStyle = rgba(th.color, 0.9); ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText(th.label, e.X, e.Y - 5); } }); }
  }

  // the two rings — over/under loops
  if (state.rings) for (const rk of ['outer', 'inner']) {
    const r = W.rings3d[rk], pts = r.line3.map(P), depth = pts.reduce((a, p) => a + p.depth, 0) / pts.length;
    items.push({ depth, draw() { ctx.strokeStyle = rgba(r.color, 0.95); ctx.lineWidth = rk === 'outer' ? 3.4 : 3; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)); ctx.stroke(); ctx.strokeStyle = rgba(r.color, 0.2); ctx.lineWidth = 7; ctx.stroke(); } });
  }

  // the antechambers — flat squares on the z=0 mid-plane, one per crossing; a faint stem to the crossing
  if (state.ante) for (const an of W.antechambers) {
    const c = P([an.x, an.y, 0]);
    const col = an.kind === 'K' ? [200, 184, 132] : an.ringKey === 'inner' ? hex('#d9b24a') : hex('#cf6b4a');
    const sz = an.kind === 'K' ? 4 : 5;
    items.push({ depth: c.depth, draw() {
      // a small screen-facing square marker at the crossing (the neutral flat)
      ctx.fillStyle = rgba(col, 0.28); ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.rect(c.X - sz, c.Y - sz, sz * 2, sz * 2); ctx.fill(); ctx.stroke();
    } });
  }

  // the fulfillment nexus at the core
  { const c = P([0, 0, 0]); items.push({ depth: c.depth + 0.02, draw() { ctx.fillStyle = rgba('#cbd3e0', 0.9); ctx.beginPath(); ctx.arc(c.X, c.Y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#04050a'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⇅', c.X, c.Y); } }); }

  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) it.draw();

  if (state.spin && !state.drag) state.yaw += 0.004;
  requestAnimationFrame(render);
}

// ── input ──
cv.addEventListener('pointerdown', (e) => { state.drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!state.drag) return; state.yaw += (e.clientX - state.drag.x) * 0.008; state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch + (e.clientY - state.drag.y) * 0.006)); state.drag = { x: e.clientX, y: e.clientY }; });
cv.addEventListener('pointerup', () => { state.drag = null; });
cv.addEventListener('pointerleave', () => { state.drag = null; });
cv.addEventListener('wheel', (e) => { e.preventDefault(); state.zoom = Math.max(0.5, Math.min(3.5, state.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

const tog = (id, key) => $(id).addEventListener('click', () => { state[key] = !state[key]; $(id).classList.toggle('on', state[key]); });
tog('bspin', 'spin'); tog('bante', 'ante'); tog('brings', 'rings'); tog('bthreads', 'threads'); tog('bplane', 'plane'); tog('blabels', 'labels');

// legend
const legend = (el, list) => { el.innerHTML = list.map((t) => `<div class="leg"><span class="sw" style="background:${t.color}"></span>${t.label}</div>`).join(''); };
legend($('legAbove'), ABOVE); legend($('legBelow'), BELOW);
$('anteCount').textContent = W.antechambers.length;

resize();
render();
globalThis.__rings3d = { W, state };
