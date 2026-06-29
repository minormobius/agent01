// ops-app.js — the OPS WEAVE as ONE woven fabric across TWO floors. The 6 white-collar surfaces (warp) and 8
// production lines (weft) are ribbons of voronoi chambers that WEAVE between an upper and a lower floor: each
// climbs to the upper floor where it passes OVER, dips to the lower where it passes UNDER. Every surface
// therefore occupies BOTH floors, and every crossing is a facility where a white surface meets a production
// line, one on each floor. No stacked decks, no star of links through a gap — the contact IS the weaving.

import { buildWeaveFloor } from './weavefloor.js';
import { K } from './weave.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let sel = Q.has('w') ? (Q.get('w') | 0) % 6 : 0;
let GAP = 150, flowOn = true, weaveOn = true;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, panx = 0, pany = 0, Z = 1;
let m = buildWeaveFloor(seed, { GAP });

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const GOLD = [217, 178, 74], WHITEC = [176, 206, 224], INK = [232, 236, 244], BG = [6, 7, 12];
// the 6 white-collar warps get distinct COOL tints so the plaid reads as warp × weft (selected → gold)
const WARPCOLS = ['#8fd0e6', '#9aa6e0', '#79c6b4', '#b79ad8', '#7fb6cf', '#a7c1e0'].map(hex);
const warpCol = (w) => (w === sel ? GOLD : WARPCOLS[w % WARPCOLS.length]);

const TILT = 0.5, SKEW = 0.16;
function cam() { const s = Math.min(CW / m.W, CH / m.H) * 0.74 * Z; return { s, ox: CW / 2 + panx, oy: CH / 2 + 30 + pany }; }
function P(x, y, z, c) { const lx = x - m.W / 2, ly = y - m.H / 2; return { X: c.ox + (lx + ly * SKEW) * c.s, Y: c.oy + (ly * TILT - z) * c.s }; }
const colorOfCell = (cell) => {
  if (cell.kind === 'bg') return mix(BG, [22, 26, 36], 0.5);
  if (cell.kind === 'warp') return warpCol(cell.w);
  if (cell.kind === 'weft') return hex(m.wefts[cell.f].color);
  // crossing: tint by whoever is over (on top) — a white surface (warp) or a production line (weft)
  return cell.upper === 'warp' ? warpCol(cell.w) : hex(m.wefts[cell.f].color);
};

// material flowing along a weft ribbon: param position over the ordered cells (camera-independent)
function makePL(pts) { const cum = [0]; let t = 0; for (let i = 1; i < pts.length; i++) { t += Math.hypot(pts[i].cx - pts[i - 1].cx, pts[i].cy - pts[i - 1].cy); cum.push(t); } return { pts, cum, total: t || 1 }; }
function at(pl, fr) { const target = fr * pl.total; let i = 1; while (i < pl.cum.length && pl.cum[i] < target) i++; if (i >= pl.pts.length) i = pl.pts.length - 1; const a = pl.pts[i - 1], b = pl.pts[i]; const seg = pl.cum[i] - pl.cum[i - 1] || 1; const u = (target - pl.cum[i - 1]) / seg; return { x: a.cx + (b.cx - a.cx) * u, y: a.cy + (b.cy - a.cy) * u, z: a.z + ((b.z || 0) - (a.z || 0)) * u }; }
function precompute() { for (const wf of m.weftFlow) wf._pl = makePL(wf.pts); }
precompute();

function floorPlane(z, c, label, labCol) {
  const corners = [[0, 0], [m.W, 0], [m.W, m.H], [0, m.H]].map((p) => P(p[0], p[1], z, c));
  ctx.strokeStyle = rgba([60, 72, 96], 0.5); ctx.lineWidth = 1.2; ctx.beginPath();
  corners.forEach((p, i) => { i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = rgba([30, 36, 50], 0.18); ctx.fill();
  ctx.fillStyle = rgba(labCol, 0.8); ctx.textAlign = 'left'; ctx.font = `${11 * c.s}px ui-monospace,monospace`; ctx.fillText(label, corners[0].X + 4 * c.s, corners[0].Y - 5 * c.s);
}

function drawScene() {
  const c = cam();
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);

  // two reference floors: lower (under) and upper (over)
  floorPlane(0, c, '▽ lower floor (under)', [120, 134, 158]);
  floorPlane(GAP, c, '△ upper floor (over)', [150, 170, 200]);

  // all chambers, painter-sorted back→front (far/top of screen first), lifted to their floor height → the
  // ribbons visibly climb to the upper floor and dip to the lower one: the weave.
  const order = m.cells.map((cell) => { const p = P(cell.cx, cell.cy, cell.z, c); return { cell, key: p.Y }; }).sort((a, b) => a.key - b.key);
  for (const { cell } of order) {
    if (cell.kind === 'bg') continue; // keep the weave clean; bg chambers stay implied by the floor planes
    const col = colorOfCell(cell), selRibbon = (cell.kind !== 'weft' && cell.w === sel);
    ctx.beginPath();
    for (let k = 0; k < cell.poly.length; k++) { const p = P(cell.poly[k][0], cell.poly[k][1], cell.z, c); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }
    ctx.closePath();
    // upper floor = full colour (brightened); lower floor = the same hue, modestly dimmed (still legible, so a
    // ribbon stays visible as it dips UNDER) — the brightness step is the floor cue.
    const fill = cell.floor === 2 ? mix(col, INK, 0.12) : mix(col, BG, 0.28);
    ctx.fillStyle = rgba(fill, selRibbon ? 0.97 : 0.9); ctx.fill();
    ctx.strokeStyle = rgba(selRibbon ? GOLD : mix(col, BG, 0.45), 0.85); ctx.lineWidth = selRibbon ? 1.7 : 1; ctx.stroke();
  }

  // crossing stitches: a short post from the lower floor up to the crossing, so you see the two strands meet
  if (weaveOn) for (const cr of m.crossings) {
    const a = P(cr.cx, cr.cy, 0, c), b = P(cr.cx, cr.cy, GAP, c); const isSel = cr.w === sel;
    ctx.strokeStyle = rgba(isSel ? GOLD : [110, 124, 150], isSel ? 0.7 : 0.28); ctx.lineWidth = isSel ? 2 : 1; ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke();
  }

  // ribbon labels: white surfaces at the top edge, production lines at the left edge
  ctx.textAlign = 'center'; ctx.font = `${10.5 * c.s}px ui-sans-serif`;
  for (const wc of m.warps) { const p = P(m.xOf(wc.w), -14, GAP, c); ctx.fillStyle = rgba(wc.w === sel ? GOLD : WHITEC, 0.95); ctx.fillText(wc.label, p.X, p.Y); }
  ctx.textAlign = 'right';
  for (const wf of m.wefts) { const p = P(-10, m.yOf(wf.f), m.hWeft(wf.f, 0), c); ctx.fillStyle = rgba(hex(wf.color), 0.95); ctx.font = `${10.5 * c.s}px ui-monospace,monospace`; ctx.fillText(wf.glyph + ' ' + wf.label, p.X, p.Y); }

  // ── material flowing along the production lines (rides the undulating ribbon) ──
  if (flowOn) { const tt = now * 0.00016;
    for (let i = 0; i < m.weftFlow.length; i++) { const wf = m.weftFlow[i]; const col = hex(wf.color); for (let q = 0; q < 3; q++) {
      const fr = ((tt) + i * 0.13 + q / 3) % 1; const pos = at(wf._pl, fr); const p = P(pos.x, pos.y, pos.z, c);
      ctx.fillStyle = rgba(mix(col, INK, 0.3), 0.95); ctx.beginPath(); ctx.arc(p.X, p.Y, 3.4 * c.s, 0, 7); ctx.fill();
    } } }

  // ── the selected white surface's tour: it weaves down through all 8 production lines, alternating floors ──
  if (weaveOn) {
    const t = m.tours[sel];
    t.stops.forEach((st) => { const cr = m.crossings.find((x) => x.w === sel && x.f === st.f); if (!cr) return; const p = P(cr.cx, cr.cy, st.floor === 2 ? GAP : 0, c);
      ctx.fillStyle = rgba(GOLD, 0.96); ctx.beginPath(); ctx.arc(p.X, p.Y, 8 * c.s, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a1406'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${9 * c.s}px ui-monospace`; ctx.fillText(String(st.f + 1), p.X, p.Y); ctx.textBaseline = 'alphabetic';
    });
    // a tech walking the weave: rides the warp ribbon down, climbing to the upper floor / dipping to the lower
    if (flowOn) {
      const cyc = (now * 0.00012) % 1, k = Math.floor(cyc * 8), fr = cyc * 8 - k;
      const a = m.tours[sel].stops[k], b = m.tours[sel].stops[(k + 1) % 8];
      const ya = m.yOf(a.f), yb = m.yOf(b.f), y = ya + (yb - ya) * fr, za = a.floor === 2 ? GAP : 0, zb = b.floor === 2 ? GAP : 0;
      const z = za + (zb - za) * (fr * fr * (3 - 2 * fr)), p = P(m.xOf(sel), y, z, c);
      ctx.fillStyle = rgba(GOLD, 1); ctx.beginPath(); ctx.arc(p.X, p.Y, 5 * c.s, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(BG, 0.6); ctx.lineWidth = 1.4; ctx.stroke();
    }
  }
}

function panels() {
  const con = m.contact;
  $('read').innerHTML =
    `<b>K(${K.warps},${K.wefts})</b> · <span class="ok">${m.crossings.length}/48 contacts</span> woven · ` +
    `<b>6</b> white-collar warps × <b>8</b> production wefts over <b>two floors</b> · every surface rides BOTH floors (4 over / 4 under)<br>` +
    `<span>a plain weave, not two stacked decks: a white surface climbs to the upper floor where it passes OVER a line, dips to the lower where it passes UNDER — the crossing is the facility. Pick a surface (1–6) to follow its weave.</span>`;
  $('wsel').innerHTML = m.warps.map((w) => `<div class="w ${w.w === sel ? 'sel' : ''}" data-w="${w.w}"><div class="k">${w.w + 1}</div><div class="lab">${w.label}</div></div>`).join('');
  for (const el of $('wsel').querySelectorAll('.w')) el.addEventListener('click', () => { sel = +el.dataset.w; sync(); });
  const t = m.tours[sel];
  $('itin').innerHTML = t.stops.map((st) => `<div class="stop"><span class="n">${st.f + 1}.</span><span class="g">${st.glyph}</span><span>${st.label}</span><span class="ou">${st.over ? '△ over' : '▽ under'}</span></div>`).join('');
  $('elist').innerHTML = m.wefts.map((e) => `<div class="e"><span class="sw" style="background:${e.color}"></span><span><span class="nm">${e.glyph} ${e.label}</span> — <span class="nt">${e.note}</span></span></div>`).join('');
  $('note').innerHTML = `Following <b>${m.warps[sel].label}</b>: it enters and weaves down through all ${K.wefts} production lines — <b>over</b> (riding the upper floor), then <b>under</b> (dipping to the lower), meeting each line once. That alternation is why one surface occupies both floors and touches every engine. The six warps interleave into the tangle but never merge.`;
}

let now = 0;
function frame(ts) { now = ts; drawScene(); requestAnimationFrame(frame); }
function sync() {
  $('flow').classList.toggle('on', flowOn); $('weaveBtn').classList.toggle('on', weaveOn);
  const u = new URLSearchParams(); if (seed !== 1) u.set('seed', seed); u.set('w', sel); history.replaceState(null, '', '?' + u.toString());
  panels();
}

$('flow').addEventListener('click', () => { flowOn = !flowOn; sync(); });
$('weaveBtn').addEventListener('click', () => { weaveOn = !weaveOn; sync(); });
$('explode').addEventListener('input', (e) => { GAP = +e.target.value; m = buildWeaveFloor(seed, { GAP }); precompute(); });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; m = buildWeaveFloor(seed, { GAP }); precompute(); sync(); });
$('reset').addEventListener('click', () => { panx = pany = 0; Z = 1; });
addEventListener('keydown', (e) => { const k = '123456'.indexOf(e.key); if (k >= 0) { sel = k; sync(); } });
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; panx += e.clientX - lx; pany += e.clientY - ly; lx = e.clientX; ly = e.clientY; });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.5, Math.min(4, Z * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize);
resize(); sync(); requestAnimationFrame(frame);
