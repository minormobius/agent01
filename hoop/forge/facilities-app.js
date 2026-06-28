// facilities-app.js — roll a forge chunk: 1–3 production facilities laid into the ship's voronoi foam.
// Top-down view (chunkroller's cousin for the upper rind): chambers tinted by facility, shaded by process
// step, with the engine's activity graph routed chamber→chamber. Click a chamber for its step. No build.

import { ENGINES, ENGINE_IDS, stepOf } from './engines.js';
import { solveForgeChunk, pickChunkEngines } from './facility.js';
import { SAMPLE_SHAPE, shapePoly, shapeSideOf } from '../chunkroller/shapes.js';

const W = 900, H = 600;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const poly = shapePoly(SAMPLE_SHAPE, W / 2, H / 2, 270), sideOf = shapeSideOf(SAMPLE_SHAPE);

// permalink: ?seed=&e=foundry,reclaim — read on load, written on every roll/pick (like the rest of forge).
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
let picked = (Q.get('e') || '').split(',').map((s) => s.trim()).filter((s) => ENGINES[s]).slice(0, 3);
if (!picked.length) picked = ['foundry'];
let rec = null, sel = -1, view = { s: 1, ox: 0, oy: 0 };
function syncURL() { const u = new URL(location); u.searchParams.set('seed', seed); u.searchParams.set('e', picked.join(',')); history.replaceState(null, '', u); }
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;

// hex/rgb helpers — shade a facility colour by step (lighter = later in the flow)
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (245 - c) * f * 0.55);
  const dk = (c) => Math.round(c * (0.5 + 0.5 * (1 - f)));
  return `rgb(${dk(r)},${dk(g)},${dk(b)})`;
}
function tint(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

// ── build the engine picker ──
function buildPicker() {
  $('engines').innerHTML = ENGINE_IDS.map((id) => {
    const e = ENGINES[id], on = picked.includes(id);
    return `<label class="${on ? 'on' : ''}" data-eng="${id}"><input type="checkbox" ${on ? 'checked' : ''}><span class="sw" style="background:${e.color}"></span>${e.glyph} ${esc(e.label)}<span class="fam">${e.family}</span></label>`;
  }).join('');
}
$('engines').addEventListener('change', (e) => {
  const lab = e.target.closest('[data-eng]'); if (!lab) return;
  const id = lab.getAttribute('data-eng');
  if (e.target.checked) { if (!picked.includes(id)) { if (picked.length >= 3) { e.target.checked = false; return; } picked.push(id); } }
  else picked = picked.filter((x) => x !== id);
  if (!picked.length) picked = [id], e.target.checked = true;
  buildPicker(); generate();
});

$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; generate(); });
$('reseed').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; generate(); });
$('auto').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; picked = pickChunkEngines(seed); buildPicker(); generate(); });
$('t-flow').addEventListener('change', render);
$('t-steps').addEventListener('change', render);
$('zin').addEventListener('click', () => zoomAt(CW / 2, CH / 2, 1.25));
$('zout').addEventListener('click', () => zoomAt(CW / 2, CH / 2, 0.8));
$('zfit').addEventListener('click', () => { fitView(); render(); });

// ── generate ──
function generate() {
  rec = solveForgeChunk({ poly, sideOf, engines: picked, seed, foamSeed: 0x4f0a, W, H });
  sel = -1; $('info').classList.remove('on'); syncURL();
  fitView(); render(); readout();
}

// ── view transform ──
function fitView() {
  if (!rec) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of rec.poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = 30, s = Math.min((CW - 2 * pad) / (x1 - x0 || 1), (CH - 2 * pad) / (y1 - y0 || 1));
  view = { s, ox: (CW - (x1 - x0) * s) / 2 - x0 * s, oy: (CH - (y1 - y0) * s) / 2 - y0 * s };
}
const SX = (x) => x * view.s + view.ox, SY = (y) => y * view.s + view.oy;

// ── render ──
function render() {
  if (!rec) return;
  ctx.clearRect(0, 0, CW, CH);
  const showSteps = $('t-steps').checked;
  const facColor = rec.facilities.map((f) => f.color);
  // index: room → {facility,color,stepFrac,isCore}
  const eng = (f) => ENGINES[rec.facilities[f] ? rec.facilities[f].engine : null];
  const stepFracOf = (room) => { const f = room.facility; if (f < 0) return 0; const e = ENGINES[rec.facilities[f].engine]; const i = e.steps.findIndex((s) => s.id === room.step); return e.steps.length > 1 ? i / (e.steps.length - 1) : 0; };

  // cells
  const cells = rec.cells, roomOf = rec.roomOf, road = rec.road, rooms = rec.rooms;
  for (let i = 0; i < cells.length; i++) {
    const poly = cells[i].poly; if (poly.length < 3) continue;
    const rid = roomOf[i]; let fill;
    if (road[i]) fill = '#0c1018';
    else if (rid >= 0 && rooms[rid] && rooms[rid].facility >= 0) {
      const room = rooms[rid], col = facColor[room.facility] || '#444';
      fill = showSteps ? shade(col, stepFracOf(room)) : tint(col, 0.42);
    } else if (rid >= 0) fill = '#11151d';
    else fill = '#07080c';
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.moveTo(SX(poly[0][0]), SY(poly[0][1])); for (let k = 1; k < poly.length; k++) ctx.lineTo(SX(poly[k][0]), SY(poly[k][1])); ctx.closePath(); ctx.fill();
    if (!road[i] && rid >= 0) { ctx.strokeStyle = 'rgba(4,7,11,.5)'; ctx.lineWidth = 0.5; ctx.stroke(); }
    if (sel >= 0 && rid === sel) { ctx.strokeStyle = 'rgba(244,191,98,.9)'; ctx.lineWidth = 1.3; ctx.stroke(); }
  }

  // facility hulls (a faint coloured outline grouping each facility's rooms)
  for (const f of rec.facilities) {
    if (!f.rooms.length) continue;
    ctx.strokeStyle = tint(f.color, 0.5); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    // convex-ish hull via room centroids — light hint, not exact
    const pts = f.rooms.map((r) => rooms[r]).map((r) => ({ x: r.x, y: r.y }));
    const hull = convexHull(pts);
    if (hull.length >= 3) { ctx.beginPath(); ctx.moveTo(SX(hull[0].x), SY(hull[0].y)); for (let k = 1; k < hull.length; k++) ctx.lineTo(SX(hull[k].x), SY(hull[k].y)); ctx.closePath(); ctx.stroke(); }
    ctx.setLineDash([]);
  }

  // activity flow (routed chamber→chamber)
  if ($('t-flow').checked) {
    for (const e of rec.flow) {
      const a = rooms[e.from], b = rooms[e.to]; if (!a || !b) continue;
      drawArrow(SX(a.x), SY(a.y), SX(b.x), SY(b.y), tint(e.color, 0.85));
    }
  }

  // step glyphs + core ring
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of rooms) {
    if (r.facility < 0) continue;
    const e = ENGINES[rec.facilities[r.facility].engine], st = stepOf(e ? rec.facilities[r.facility].engine : null, r.step);
    if (r.isCore) { ctx.strokeStyle = tint(rec.facilities[r.facility].color, 0.95); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(SX(r.x), SY(r.y), Math.max(8, r.cells.length ** 0.5 * view.s * 0.6), 0, 7); ctx.stroke(); }
    const fs = Math.max(8, Math.min(20, 7 + Math.sqrt(r.cells.length) * view.s * 0.7));
    ctx.font = `${fs}px ui-monospace,monospace`;
    ctx.fillStyle = 'rgba(6,8,12,.6)'; ctx.fillText(st ? st.glyph : '·', SX(r.x) + 0.6, SY(r.y) + 0.6);
    ctx.fillStyle = r.isCore ? '#fff' : 'rgba(244,240,228,.92)'; ctx.fillText(st ? st.glyph : '·', SX(r.x), SY(r.y));
  }

  // ports (chunk seams)
  for (const p of rec.ports) { ctx.fillStyle = p.inherited ? '#5fd0c0' : '#d8b25a'; ctx.beginPath(); ctx.arc(SX(p.x), SY(p.y), 3, 0, 7); ctx.fill(); }
}

function drawArrow(x0, y0, x1, y1, col) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const tx = x1 - ux * 7, ty = y1 - uy * 7;   // stop short for the head
  ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(tx - uy * 3.2, ty + ux * 3.2); ctx.lineTo(tx + uy * 3.2, ty - ux * 3.2); ctx.closePath(); ctx.fill();
}

// monotone-chain convex hull
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  lo.pop(); hi.pop(); return lo.concat(hi);
}

// ── readout ──
function readout() {
  const n = rec.facilities.filter((f) => f.rooms.length).length;
  $('metrics').innerHTML = `chambers <b>${rec.cells.length}</b> · rooms <b>${rec.rooms.length}</b> · facilities <b>${n}</b> · flow edges <b>${rec.flow.length}</b><br><span style="color:#566173">${n} production ${n === 1 ? 'facility' : 'facilities'} in one foam chunk — bigger than nave chambers, 1–3 per chunk</span>`;
  $('faclegend').innerHTML = rec.facilities.filter((f) => f.rooms.length).map((f) => {
    const e = ENGINES[f.engine];
    return `<div class="row"><span class="sw" style="background:${f.color}"></span><b style="color:#e6e8ee">${e.glyph} ${esc(e.label)}</b> <span style="color:#566173">· ${e.family} · ${f.rooms.length} chambers</span></div>`;
  }).join('');
}

// ── click → chamber dossier ──
cv.addEventListener('click', (e) => {
  if (dragMoved) return;
  const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left - view.ox) / view.s, my = (e.clientY - r.top - view.oy) / view.s;
  let best = -1, bd = Infinity;
  rec.rooms.forEach((room, id) => { if (room.facility < 0) return; const d = (room.x - mx) ** 2 + (room.y - my) ** 2; if (d < bd) { bd = d; best = id; } });
  if (best < 0) return;
  sel = best; showInfo(best); render();
});
function showInfo(id) {
  const room = rec.rooms[id]; if (!room || room.facility < 0) return;
  const fac = rec.facilities[room.facility], e = ENGINES[fac.engine], st = stepOf(fac.engine, room.step);
  const ins = rec.flow.filter((f) => f.to === id).map((f) => rec.rooms[f.from].step);
  const outs = rec.flow.filter((f) => f.from === id).map((f) => rec.rooms[f.to].step);
  const d = $('info');
  d.innerHTML = `<span class="x" data-x>✕</span>` +
    `<h3 style="color:${fac.color}">${st ? st.glyph : '·'} ${esc(st ? st.name : room.step)}${room.isCore ? ' <span style="font-size:11px;color:#f4bf62">★ core</span>' : ''}</h3>` +
    `<div class="note" style="color:#b9c0cf">${e.glyph} ${esc(e.label)} <span style="color:#566173">· ${e.family} engine</span></div>` +
    `<div class="note">${esc(e.note)}</div>` +
    `<div class="note" style="font-size:11px">flow: ${ins.length ? '←' + ins.map((s) => esc(stepName(fac.engine, s))).join(', ') : '<span style="color:#566173">source</span>'} &nbsp;·&nbsp; ${outs.length ? '→' + outs.map((s) => esc(stepName(fac.engine, s))).join(', ') : '<span style="color:#566173">sink</span>'}</div>` +
    `<div class="steps">${e.steps.map((s) => `<span class="${s.id === room.step ? 'cur' : ''}">${s.glyph}${s.id === room.step ? ' ' + esc(s.name) : ''}</span>`).join('')}</div>`;
  d.classList.add('on');
  d.querySelector('[data-x]').addEventListener('click', () => { d.classList.remove('on'); sel = -1; render(); });
}
const stepName = (eng, sid) => { const s = stepOf(eng, sid); return s ? s.name : sid; };

// ── pan / zoom ──
let dragging = false, dragMoved = false, lastX = 0, lastY = 0;
function zoomAt(px, py, k) { const wx = (px - view.ox) / view.s, wy = (py - view.oy) / view.s; view.s *= k; view.ox = px - wx * view.s; view.oy = py - wy * view.s; render(); }
cv.addEventListener('pointerdown', (e) => { dragging = true; dragMoved = false; lastX = e.clientX; lastY = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!dragging) return; const dx = e.clientX - lastX, dy = e.clientY - lastY; if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true; view.ox += dx; view.oy += dy; lastX = e.clientX; lastY = e.clientY; render(); });
cv.addEventListener('pointerup', (e) => { dragging = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); fitView(); render(); }
addEventListener('resize', resize);
buildPicker(); resize(); generate();
