// stack-app.js — THE FACTORY AS TWO STACKED DECKS, isometric. Material floor below (carved concourse +
// machines + spiderbots riding the trunks), pedestrian mezzanine above (offices + catwalks + technicians),
// corkscrew ramps joining them at each facility. The exploded-axonometric view of the two-track answer.

import { twoDeckFactory, rampPoint } from './deck2.js';
import { ENGINES } from './engines.js';
import { ambientOf, materialOf, fixtureOf } from './fixtures.js';
import { drawCore, drawMachine, drawCarrier, ambientGlow } from './sprites.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
const COUNT = Q.has('n') ? Math.max(3, Math.min(19, Q.get('n') | 0)) : 7;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let D = null, cx = 0, cy = 0, Z = 1, H = 130, pan = { x: 0, y: 0 }, clock = 0;
let routeCum = [], catCum = [];

const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
function shadeMix(baseHex, accentHex, a) { const b = parseInt(baseHex.slice(1), 16), c = parseInt(accentHex.slice(1), 16), m = (s, t) => Math.round(s + (t - s) * a); return `rgb(${m((b >> 16) & 255, (c >> 16) & 255)},${m((b >> 8) & 255, (c >> 8) & 255)},${m(b & 255, c & 255)})`; }

// isometric projection: world (wx,wy) at deck height zFrac (0 floor, 1 mezzanine, >1 nave) → screen.
function P(wx, wy, zFrac) {
  const dx = wx - cx, dy = wy - cy, isoX = (dx - dy) * 0.866, isoY = (dx + dy) * 0.5;
  return { x: CW / 2 + isoX * Z + pan.x, y: CH / 2 + isoY * Z * 0.62 - zFrac * H + pan.y };
}
const cumOf = (poly) => { const c = [0]; for (let i = 1; i < poly.length; i++) c.push(c[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y)); return c; };
function ptAt(poly, cum, t) { const L = cum[cum.length - 1] || 1, target = t * L; let i = 1; while (i < cum.length && cum[i] < target) i++; if (i >= poly.length) return poly[poly.length - 1]; const seg = cum[i] - cum[i - 1] || 1, f = (target - cum[i - 1]) / seg; return { x: poly[i - 1].x + (poly[i].x - poly[i - 1].x) * f, y: poly[i - 1].y + (poly[i].y - poly[i - 1].y) * f }; }

function build() {
  D = twoDeckFactory(seed, { count: COUNT });
  const b = D.bbox; cx = (b.x0 + b.x1) / 2; cy = (b.y0 + b.y1) / 2;
  routeCum = D.routes.map((r) => cumOf(r.poly));
  catCum = D.catwalks.map((c) => cumOf(c.poly));
  pan = { x: 0, y: 0 };
  const u = new URL(location); u.searchParams.set('seed', seed); history.replaceState(null, '', u);
}

function render() {
  if (!D) return;
  ctx.clearRect(0, 0, CW, CH);

  // ── DECK 0 — the material floor (cells: ambient floor + carved road dark) ──
  for (const ch of D.mat.recs) {
    const facEng = ch.facilities.map((f) => f.engine), facCol = ch.facilities.map((f) => f.color);
    for (let i = 0; i < ch.cells.length; i++) {
      const poly = ch.cells[i].poly; if (poly.length < 3) continue;
      const rid = ch.roomOf[i]; let fill;
      if (ch.road[i]) fill = '#0c111b';
      else if (rid >= 0 && ch.rooms[rid] && ch.rooms[rid].facility >= 0) fill = shadeMix(ambientOf(facEng[ch.rooms[rid].facility]).floor, facCol[ch.rooms[rid].facility] || '#444', 0.16);
      else if (rid >= 0) fill = '#0e1219';
      else fill = '#08090d';
      ctx.fillStyle = fill; ctx.beginPath(); const s0 = P(poly[0][0], poly[0][1], 0); ctx.moveTo(s0.x, s0.y);
      for (let k = 1; k < poly.length; k++) { const s = P(poly[k][0], poly[k][1], 0); ctx.lineTo(s.x, s.y); } ctx.closePath(); ctx.fill();
      if (!ch.road[i] && rid >= 0) { ctx.strokeStyle = 'rgba(4,7,11,.5)'; ctx.lineWidth = 0.5; ctx.stroke(); }
    }
  }
  // deck-0 ambient glow + core fixtures (billboarded) + a few machine boxes
  for (const ch of D.mat.recs) {
    for (const f of ch.facilities) { if (!f.rooms.length || f.core < 0) continue; const c = ch.rooms[f.core], p = P(c.x, c.y, 0); ambientGlow(ctx, p.x, p.y, Math.max(34, f.rooms.length ** 0.5 * Z * 3.4), ambientOf(f.engine).light); }
    for (const r of ch.rooms) { if (r.facility < 0) continue; const eng = ch.facilities[r.facility].engine, p = P(r.x, r.y, 0), rr = Math.max(6, Math.sqrt(r.cells.length) * Z * 0.7); if (r.isCore) drawCore(ctx, fixtureOf(eng, r.step), p.x, p.y, rr * 1.25, ambientOf(eng).light, clock); else drawMachine(ctx, '', p.x, p.y, rr * 0.7, ambientOf(eng).light); }
  }
  // deck-0 spiderbots: packets riding the material trunks
  for (let ri = 0; ri < D.routes.length; ri++) { const rt = D.routes[ri], mat = materialOf(rt.engine), col = ambientOf(rt.engine).light; const K = 2; for (let k = 0; k < K; k++) { const ph = ((clock / Math.max(2.5, routeCum[ri][routeCum[ri].length - 1] / 70)) + k / K + ri * 0.07) % 1; const w = ptAt(rt.poly, routeCum[ri], ph), p = P(w.x, w.y, 0); drawCarrier(ctx, mat.shape, p.x, p.y, Math.max(2.2, Z * 1.6), col, mat.hot); } }

  // ── DECK 1 footprint — the 7 mezzanine tiles, as faint glass plates over the floor (so the stack reads) ──
  for (const poly of D.mat.polys) {
    ctx.fillStyle = 'rgba(159,180,216,.05)'; ctx.strokeStyle = 'rgba(159,180,216,.32)'; ctx.lineWidth = 1;
    ctx.beginPath(); const s0 = P(poly[0].x, poly[0].y, 1); ctx.moveTo(s0.x, s0.y); for (let k = 1; k < poly.length; k++) { const s = P(poly[k].x, poly[k].y, 1); ctx.lineTo(s.x, s.y); } ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // ── RAMPS — corkscrews climbing deck 0 → deck 1 at each facility ──
  for (const ramp of D.ramps) {
    const col = ramp.navePort ? '#cbd3e0' : tint(ambientOf(ramp.engine).light, 0.95);
    ctx.strokeStyle = ramp.navePort ? 'rgba(203,211,224,.85)' : tint(ambientOf(ramp.engine).light, 0.7); ctx.lineWidth = 2.2; ctx.beginPath();
    const N = 36; for (let s = 0; s <= N; s++) { const rp = rampPoint(ramp, s / N), p = P(rp.x, rp.y, rp.z); if (s === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } ctx.stroke();
    // step ticks (the "stairs") + a climbing car
    ctx.strokeStyle = tint(col, 0.4); ctx.lineWidth = 1; for (let s = 0; s <= N; s += 3) { const rp = rampPoint(ramp, s / N), pa = P(rp.x, rp.y, rp.z), pb = P(ramp.x, ramp.y, rp.z); ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo((pa.x + pb.x) / 2, (pa.y + pb.y) / 2); ctx.stroke(); }
    const ct = (clock * 0.18 + ramp.facility * 0.2) % 1, cp = rampPoint(ramp, ct), sp = P(cp.x, cp.y, cp.z);
    drawCarrier(ctx, ramp.navePort ? 'crate' : 'part', sp.x, sp.y, Math.max(2.4, Z * 1.7), col, false);
  }

  // ── DECK 1 — the pedestrian mezzanine: catwalks over the trunks + offices + technicians ──
  for (let ci = 0; ci < D.catwalks.length; ci++) {
    const cw = D.catwalks[ci]; ctx.strokeStyle = cw.cross ? 'rgba(159,180,216,.7)' : 'rgba(159,180,216,.5)'; ctx.lineWidth = cw.cross ? 2 : 1.4; ctx.beginPath();
    for (let i = 0; i < cw.poly.length; i++) { const p = P(cw.poly[i].x, cw.poly[i].y, 1); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } ctx.stroke();
    // railing shadow (faint second line) to read as a raised catwalk
    ctx.strokeStyle = 'rgba(159,180,216,.16)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < cw.poly.length; i++) { const p = P(cw.poly[i].x, cw.poly[i].y, 1); if (i === 0) ctx.moveTo(p.x, p.y + 3); else ctx.lineTo(p.x, p.y + 3); } ctx.stroke();
  }
  // technicians walking the catwalks (the white-collar layer)
  for (let ci = 0; ci < D.catwalks.length; ci++) { const cw = D.catwalks[ci]; const ph = ((clock / Math.max(3, catCum[ci][catCum[ci].length - 1] / 50)) + ci * 0.13) % 1; const w = ptAt(cw.poly, catCum[ci], ph), p = P(w.x, w.y, 1); ctx.fillStyle = '#cdd6e6'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.8, Z * 1.4), 0, 7); ctx.fill(); }
  // offices over each facility core
  for (const o of D.offices) {
    const p = P(o.x, o.y, 1), rr = Math.max(7, 9 * Math.min(1.6, Z));
    ctx.fillStyle = tint(o.color, 0.22); ctx.strokeStyle = tint(o.color, 0.9); ctx.lineWidth = 1.4;
    // a small diamond platform (iso footprint)
    ctx.beginPath(); ctx.moveTo(p.x, p.y - rr * 0.7); ctx.lineTo(p.x + rr, p.y); ctx.lineTo(p.x, p.y + rr * 0.7); ctx.lineTo(p.x - rr, p.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.navePort ? '#fff' : tint(o.color, 0.95); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(9, 11 * Math.min(1.5, Z))}px ui-monospace,monospace`; ctx.fillText(ENGINES[o.engine].glyph, p.x, p.y);
  }

  // ── the nave lift — from the fulfillment office up to the nave node (above deck 1) ──
  const fo = D.offices.find((o) => o.navePort); const nv = D.nave;
  if (fo) { const a = P(fo.x, fo.y, 1), bnav = P(nv.x, nv.y, 2.2); ctx.strokeStyle = 'rgba(203,211,224,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bnav.x, bnav.y); ctx.stroke(); const ph = (clock * 0.3) % 1; const lp = { x: fo.x + (nv.x - fo.x) * ph, y: fo.y + (nv.y - fo.y) * ph }, sp = P(lp.x, lp.y, 1 + 1.2 * ph); drawCarrier(ctx, 'crate', sp.x, sp.y, Math.max(2.4, Z * 1.8), '#cbd3e0', false); }
  const np = P(nv.x, nv.y, 2.2);
  ctx.fillStyle = 'rgba(203,211,224,.14)'; ctx.strokeStyle = 'rgba(203,211,224,.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(np.x, np.y, 15, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#cbd3e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '13px ui-monospace,monospace'; ctx.fillText('⌂', np.x, np.y);
  ctx.font = '10px ui-monospace,monospace'; ctx.fillText(`the nave ↑ (~${nv.pop} crew)`, np.x, np.y - 22);

  // deck labels
  ctx.textAlign = 'left'; ctx.font = '10px ui-monospace,monospace';
  const lp0 = P(D.bbox.x1, D.bbox.y1, 0), lp1 = P(D.bbox.x1, D.bbox.y1, 1);
  ctx.fillStyle = 'rgba(224,119,47,.8)'; ctx.fillText('▦ material floor', lp0.x + 8, lp0.y);
  ctx.fillStyle = 'rgba(159,180,216,.9)'; ctx.fillText('⊟ pedestrian mezzanine', lp1.x + 8, lp1.y);
}

// ── controls ──
$('gap').addEventListener('input', (e) => { H = +e.target.value; $('gapv').textContent = H; });
$('zoom').addEventListener('input', (e) => { Z = +e.target.value; $('zoomv').textContent = Z.toFixed(1); });
$('roll').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; build(); });
$('reset').addEventListener('click', () => { pan = { x: 0, y: 0 }; Z = 1; $('zoom').value = 1; $('zoomv').textContent = '1.0'; });
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; pan.x += e.clientX - lx; pan.y += e.clientY - ly; lx = e.clientX; ly = e.clientY; });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.4, Math.min(2.4, Z * (e.deltaY < 0 ? 1.1 : 0.9))); $('zoom').value = Z; $('zoomv').textContent = Z.toFixed(1); }, { passive: false });

let _last = 0;
function frame(ts) { const dt = _last ? Math.min(0.05, (ts - _last) / 1000) : 0; _last = ts; clock += dt; render(); requestAnimationFrame(frame); }
function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize);
resize(); build(); requestAnimationFrame(frame);
