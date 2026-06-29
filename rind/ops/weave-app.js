// weave-app.js — render the OPS weave two ways and let you walk one white surface's tour.
//   LOOM CHART — the flat plaid: 6 warp columns × 8 weft rows, 48 crossings = the 48 contacts of K(6,8),
//                woven over/under. The proof at a glance: every warp meets every weft.
//   WOVEN TUBE — the same plaid wrapped onto the rind cylinder: 8 weft RINGS, 6 warp HELICES entering from
//                ONE point at phase offsets — the tangle. Pick a surface and watch its thread tour all 8.

import { buildWeave, contact, tour, braidStats, K } from './weave.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let mode = Q.get('view') === 'tube' ? 'tube' : 'loom';
let sel = Q.has('w') ? (Q.get('w') | 0) % 6 : 0;       // selected white surface (the warp you follow)

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, panx = 0, pany = 0, Z = 1;
let m = buildWeave(seed);

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const WHITE_RGB = [150, 200, 220], GOLD = [217, 178, 74], DIMC = [90, 102, 124];

// ── layout fit ──
function fit() { const m0 = 30; const s = Math.min((CW - 2 * m0) / m.W, (CH - 2 * m0) / m.H) * Z; return { s, px: (CW - m.W * s) / 2 + panx, py: (CH - m.H * s) / 2 + pany }; }

// ── LOOM CHART ──────────────────────────────────────────────────────────────────────────────────────────
function drawLoom() {
  const { s, px, py } = fit();
  const X = (x) => px + x * s, Y = (y) => py + y * s;
  const colX = m.wc.map((_, w) => X(m.colX(w)));
  const rowY = m.prod.map((_, f) => Y(m.rowY(f)));
  const entry = { x: X(m.entry.x), y: Y(m.entry.y) };

  // weft rows (production lines) — each a horizontal thread across all 6 warps
  for (let f = 0; f < m.prod.length; f++) {
    const p = m.prod[f], c = hex(p.color), y = rowY[f];
    ctx.strokeStyle = rgba(c, 0.55); ctx.lineWidth = 8 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(colX[0] - 26 * s, y); ctx.lineTo(colX[colX.length - 1] + 26 * s, y); ctx.stroke();
    ctx.fillStyle = rgba(c, 0.95); ctx.textAlign = 'right'; ctx.font = `${12 * s}px ui-monospace,monospace`;
    ctx.fillText(p.glyph + ' ' + p.label, colX[0] - 34 * s, y + 4 * s);
  }
  // warp columns (white-collar tours) — entry fans to each warp head, then the column runs down through all 8
  for (let w = 0; w < m.wc.length; w++) {
    const isSel = w === sel, x = colX[w];
    const col = isSel ? GOLD : WHITE_RGB, a = isSel ? 1 : 0.34;
    ctx.strokeStyle = rgba(col, a * 0.9); ctx.lineWidth = (isSel ? 7 : 5) * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(entry.x, entry.y); ctx.lineTo(x, rowY[0] - 26 * s); ctx.lineTo(x, rowY[rowY.length - 1] + 26 * s); ctx.stroke();
    ctx.fillStyle = rgba(col, isSel ? 1 : 0.6); ctx.textAlign = 'center'; ctx.font = `${11 * s}px ui-sans-serif`;
    ctx.fillText(m.wc[w].label, x, rowY[0] - 32 * s);
  }
  // the 48 crossings, woven over/under (warp over weft on the checkerboard). highlight the selected warp's.
  for (const c of m.crossings) {
    const x = colX[c.w], y = rowY[c.f], isSel = c.w === sel;
    const pc = hex(m.prod[c.f].color), warpCol = isSel ? GOLD : WHITE_RGB;
    const a = isSel ? 1 : 0.5;
    // the OVER thread gets a dark halo so it reads as lifting above the UNDER one — a true plain weave
    if (c.over === 'warp') {
      ctx.strokeStyle = rgba(pc, a * 0.8); ctx.lineWidth = 8 * s; ctx.beginPath(); ctx.moveTo(x - 16 * s, y); ctx.lineTo(x + 16 * s, y); ctx.stroke();           // weft under
      ctx.strokeStyle = '#06070c'; ctx.lineWidth = (isSel ? 9 : 7) * s; ctx.beginPath(); ctx.moveTo(x, y - 16 * s); ctx.lineTo(x, y + 16 * s); ctx.stroke();
      ctx.strokeStyle = rgba(warpCol, a); ctx.lineWidth = (isSel ? 7 : 5) * s; ctx.beginPath(); ctx.moveTo(x, y - 16 * s); ctx.lineTo(x, y + 16 * s); ctx.stroke(); // warp over
    } else {
      ctx.strokeStyle = rgba(warpCol, a * 0.9); ctx.lineWidth = (isSel ? 7 : 5) * s; ctx.beginPath(); ctx.moveTo(x, y - 16 * s); ctx.lineTo(x, y + 16 * s); ctx.stroke(); // warp under
      ctx.strokeStyle = '#06070c'; ctx.lineWidth = 10 * s; ctx.beginPath(); ctx.moveTo(x - 16 * s, y); ctx.lineTo(x + 16 * s, y); ctx.stroke();
      ctx.strokeStyle = rgba(pc, a * 0.95); ctx.lineWidth = 8 * s; ctx.beginPath(); ctx.moveTo(x - 16 * s, y); ctx.lineTo(x + 16 * s, y); ctx.stroke(); // weft over
    }
    // facility node + (for the selected tour) the step number
    ctx.fillStyle = rgba(pc, isSel ? 1 : 0.85); ctx.beginPath(); ctx.arc(x, y, (isSel ? 6.5 : 4) * s, 0, 7); ctx.fill();
    if (isSel) { ctx.fillStyle = '#06070c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${8.5 * s}px ui-monospace,monospace`; ctx.fillText(String(c.k + 1), x, y + 0.5); ctx.textBaseline = 'alphabetic'; }
  }
  // entry vestibule
  ctx.fillStyle = rgba(GOLD, 0.95); ctx.beginPath(); ctx.arc(entry.x, entry.y, 7 * s, 0, 7); ctx.fill();
  ctx.fillStyle = rgba([220, 224, 235], 0.85); ctx.textAlign = 'center'; ctx.font = `${11 * s}px ui-sans-serif`; ctx.fillText('▽ single entry', entry.x, entry.y - 12 * s);
}

// ── WOVEN TUBE (the braid on the cylinder) ──────────────────────────────────────────────────────────────
function drawTube() {
  const { s, px, py } = fit();
  const cx = px + m.W * s / 2, top = py + 40 * s, bot = py + (m.H - 40) * s, H = bot - top;
  const R = m.R * s, ky = 0.26;                 // ellipse squash for perspective
  const zToY = (z) => top + z * H;
  const P = (az, z) => ({ x: cx + R * Math.cos(az), y: zToY(z) + R * ky * Math.sin(az), front: Math.sin(az) > 0 });

  // back halves of the rings first
  const ring = (f, half) => {
    const p = m.rings[f], c = hex(p.color), y = zToY(p.z);
    ctx.strokeStyle = rgba(c, half === 'back' ? 0.30 : 0.85); ctx.lineWidth = (half === 'back' ? 2 : 4) * s;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; const isFront = Math.sin(a) > 0; if ((half === 'front') !== isFront) { ctx.stroke(); ctx.beginPath(); continue; } const x = cx + R * Math.cos(a), yy = y + R * ky * Math.sin(a); i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
    ctx.stroke();
  };
  for (let f = 0; f < m.rings.length; f++) ring(f, 'back');

  // helices: draw each in back/front segments so it weaves through the rings
  function helix(h, layer) {
    const isSel = h.w === sel, col = isSel ? GOLD : WHITE_RGB, a = isSel ? 1 : 0.5;
    ctx.strokeStyle = rgba(col, a * (layer === 'back' ? 0.55 : 1)); ctx.lineWidth = (isSel ? 4.5 : 3) * s; ctx.lineCap = 'round';
    ctx.beginPath(); let drawing = false;
    for (const pt of h.pts) {
      const x = cx + R * pt.cos, y = zToY(pt.t) + R * ky * pt.sin, front = pt.sin > 0;
      if ((layer === 'front') === front) { if (!drawing) { ctx.moveTo(x, y); drawing = true; } else ctx.lineTo(x, y); }
      else { drawing = false; }
    }
    ctx.stroke();
  }
  // order: back helices, front rings, front helices → genuine over/under tube
  for (const h of m.helices) if (h.w !== sel) helix(h, 'back');
  helix(m.helices[sel], 'back');
  for (let f = 0; f < m.rings.length; f++) {
    ring(f, 'front');
    const p = m.rings[f], c = hex(p.color), y = zToY(p.z);
    ctx.fillStyle = rgba(c, 0.95); ctx.textAlign = 'left'; ctx.font = `${11 * s}px ui-monospace,monospace`;
    ctx.fillText(p.glyph + ' ' + p.label, cx + R + 10 * s, y + 4 * s);
  }
  for (const h of m.helices) if (h.w !== sel) helix(h, 'front');
  helix(m.helices[sel], 'front');

  // the selected helix's contact dots in tour order (where it meets each ring), numbered
  const h = m.helices[sel];
  for (const st of h.itinerary) {
    const p = m.rings[st.f], z = p.z;
    // find the helix sample nearest this ring's z, on the front
    let best = null, bd = 9;
    for (const pt of h.pts) { const d = Math.abs(pt.t - z); if (pt.sin > 0 && d < bd) { bd = d; best = pt; } }
    if (!best) continue;
    const x = cx + R * best.cos, y = zToY(best.t) + R * ky * best.sin, c = hex(p.color);
    ctx.fillStyle = rgba(c, 1); ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, 7); ctx.fill();
    ctx.fillStyle = '#06070c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${8.5 * s}px ui-monospace,monospace`; ctx.fillText(String(st.k + 1), x, y + 0.5); ctx.textBaseline = 'alphabetic';
  }

  // entry at top
  ctx.fillStyle = rgba(GOLD, 0.95); ctx.beginPath(); ctx.arc(cx, top - 16 * s, 7 * s, 0, 7); ctx.fill();
  ctx.fillStyle = rgba([220, 224, 235], 0.85); ctx.textAlign = 'center'; ctx.font = `${11 * s}px ui-sans-serif`; ctx.fillText('▽ single entry (nave side)', cx, top - 26 * s);
  ctx.fillStyle = rgba(DIMC, 1); ctx.fillText('↓ outward · lower rind', cx, bot + 24 * s);
}

// ── frame ──
function render() {
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  (mode === 'loom' ? drawLoom : drawTube)();
}

// ── panels ──
function panels() {
  const c = contact(m), b = braidStats(m);
  $('read').innerHTML =
    `<b>K(${K.warps},${K.wefts})</b> — every white-collar surface touches every production engine: ` +
    `<span class="ok">${c.crossings}/${c.expected} contacts</span>, complete=${c.complete ? '✓' : '✗'}, tours-cover-all=${c.toursCoverAll ? '✓' : '✗'}, conflict-free=${c.conflictFree ? '✓' : '✗'}` +
    `<br><span>plain weave · over/under alternates (${c.weaveAlternates ? '✓' : '✗'}) · 2 interpenetrating layers · non-planar (genus ${K.genus}) — the tangle is the genus · ${b.frontBackFlips} front↔back passes</span>`;
  $('wsel').innerHTML = m.wc.map((w) => `
    <div class="w ${w.w === sel ? 'sel' : ''}" data-w="${w.w}">
      <div class="k">${w.w + 1}</div>
      <div><div class="lab">${w.label}</div><div class="bl">${w.blurb}</div></div>
    </div>`).join('');
  for (const el of $('wsel').querySelectorAll('.w')) el.addEventListener('click', () => { sel = +el.dataset.w; sync(); });
  const t = tour(m, sel);
  $('itin').innerHTML = t.stops.map((st) => {
    const p = m.prod[st.f];
    return `<div class="stop"><span class="n">${st.k + 1}.</span><span class="g">${p.glyph}</span><span>${p.label}</span><span class="ou">${st.over === 'warp' ? 'over' : 'under'}</span></div>`;
  }).join('');
  $('note').innerHTML = `Following <b>${t.label}</b>: enter once, then this one thread is woven through all ${K.wefts} engines — over, under, over — meeting each exactly once. The six threads share the entry and interleave (a 6-strand braid round an 8-station ring) but never merge: at every step the six sit on six different engines.`;
}

function sync() {
  $('m-loom').classList.toggle('on', mode === 'loom');
  $('m-tube').classList.toggle('on', mode === 'tube');
  const u = new URLSearchParams(); if (seed !== 1) u.set('seed', seed); u.set('view', mode); u.set('w', sel);
  history.replaceState(null, '', '?' + u.toString());
  panels(); render();
}

// ── interaction ──
$('m-loom').addEventListener('click', () => { mode = 'loom'; sync(); });
$('m-tube').addEventListener('click', () => { mode = 'tube'; sync(); });
$('reset').addEventListener('click', () => { panx = pany = 0; Z = 1; render(); });
addEventListener('keydown', (e) => { const d = '123456'.indexOf(e.key); if (d >= 0) { sel = d; sync(); } if (e.key === 'v') { mode = mode === 'loom' ? 'tube' : 'loom'; sync(); } });
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; panx += e.clientX - lx; pany += e.clientY - ly; lx = e.clientX; ly = e.clientY; render(); });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.5, Math.min(4, Z * (e.deltaY < 0 ? 1.1 : 0.9))); render(); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); render(); }
addEventListener('resize', resize);
sync(); resize();
