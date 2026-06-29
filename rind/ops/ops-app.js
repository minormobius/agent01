// ops-app.js — the OPS WEAVE: a SPACE-FILLING woven fabric over a 19-CHUNK region, on TWO floors, no gaps.
// The 6 white-collar warps and 8 production wefts fill the whole region: the UPPER floor is a woven
// checkerboard of white-collar and production chambers, the LOWER floor its exact complement. Every surface
// rides both floors; pick one and follow it weaving through all 8 production lines. Material runs the lines.

import { buildWeaveFloor } from './weavefloor.js';
import { K } from './weave.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let sel = Q.has('w') ? (Q.get('w') | 0) % 6 : 0;
let GAP = 165, flowOn = true, weaveOn = true;

const cv = $('cv'), ctx = cv.getContext('2d');
const buf = document.createElement('canvas'), bctx = buf.getContext('2d');
let DPR = 1, CW = 0, CH = 0, panx = 0, pany = 0, Z = 1, dirty = true;
let m = buildWeaveFloor(seed, { GAP });

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const GOLD = [217, 178, 74], INK = [232, 236, 244], BG = [6, 7, 12];
const WARPCOLS = ['#8fd0e6', '#9aa6e0', '#79c6b4', '#b79ad8', '#7fb6cf', '#a7c1e0'].map(hex);
const warpCol = (w) => (w === sel ? GOLD : WARPCOLS[w % WARPCOLS.length]);
const HUBW = [210, 226, 240], HUBP = [236, 210, 150];   // white hub (top centre) · production hub (bottom centre)
const ownerColor = (o) => o.kind === 'warp' ? warpCol(o.idx) : o.kind === 'weft' ? hex(m.wefts[o.idx].color) : o.kind === 'whub' ? HUBW : HUBP;

const TILT = 0.58, SKEW = 0.16;
function camS() { return Math.min(CW / m.W, CH / m.H) * 0.82 * Z; }
function P(x, y, z, s) { const lx = x - m.W / 2, ly = y - m.H / 2; return { X: CW / 2 + (lx + ly * SKEW) * s, Y: CH / 2 + 28 + (ly * TILT - z) * s }; }
const local = (gx, gy) => [gx - m.minx, gy - m.miny];

// chambers sorted back→front by depth (cy), computed once per model
let byDepth = m.cells.map((c, i) => i).sort((a, b) => m.cells[a].cy - m.cells[b].cy);

const SELC = [255, 224, 122];   // bright highlight — distinct from assembly's muted gold (white-outlined too)
function plate(g, s, z, ownerOf, alpha, dim) {
  for (const idx of byDepth) {
    const cell = m.cells[idx], o = ownerOf(cell); let col = ownerColor(o);
    const isSel = o.kind === 'warp' && o.idx === sel;
    col = dim ? mix(col, BG, 0.36) : mix(col, INK, 0.08);
    g.beginPath();
    for (let k = 0; k < cell.poly.length; k++) { const p = P(cell.poly[k][0], cell.poly[k][1], z, s); k ? g.lineTo(p.X, p.Y) : g.moveTo(p.X, p.Y); }
    g.closePath();
    g.fillStyle = rgba(isSel ? SELC : col, alpha); g.fill();
    g.strokeStyle = isSel ? rgba([245, 248, 255], 0.95) : rgba(mix(col, BG, 0.5), alpha * 0.85); g.lineWidth = isSel ? 2 : 0.7; g.stroke();
  }
}

function renderStatic() {
  const s = camS();
  bctx.setTransform(DPR, 0, 0, DPR, 0, 0); bctx.clearRect(0, 0, CW, CH);
  bctx.fillStyle = '#06070c'; bctx.fillRect(0, 0, CW, CH);

  // LOWER floor (the under-strands) — full, dimmed
  plate(bctx, s, 0, (c) => c.lower, 0.95, true);
  // chunk hex outlines on the lower floor, faint (the 19 chunks)
  for (const ch of m.chunks) { bctx.beginPath(); ch.verts.forEach((v, i) => { const [lx, ly] = local(v[0], v[1]); const p = P(lx, ly, 0, s); i ? bctx.lineTo(p.X, p.Y) : bctx.moveTo(p.X, p.Y); }); bctx.closePath(); bctx.strokeStyle = rgba([70, 84, 110], 0.35); bctx.lineWidth = 1; bctx.stroke(); }

  // UPPER floor (the over-strands) — the visible woven checkerboard. Slightly translucent so the LOWER weave
  // ghosts through (the two woven layers read at once) — translucency, not a spatial gap: coverage stays 100%.
  plate(bctx, s, GAP, (c) => c.upper, 0.86, false);
  // chunk hex outlines on the upper floor (the 19 chunks read)
  for (const ch of m.chunks) { bctx.beginPath(); ch.verts.forEach((v, i) => { const [lx, ly] = local(v[0], v[1]); const p = P(lx, ly, GAP, s); i ? bctx.lineTo(p.X, p.Y) : bctx.moveTo(p.X, p.Y); }); bctx.closePath(); bctx.strokeStyle = rgba([170, 188, 222], 0.6); bctx.lineWidth = 1.5; bctx.stroke(); }

  if (weaveOn) {
    // the selected white arm's tour: it meets each production arm once, centre→rim, alternating floors
    const t = m.tours[sel];
    t.stops.forEach((st, n) => {
      if (!st.cell) return; const p = P(st.cell.cx, st.cell.cy, st.floor === 2 ? GAP : 0, s);
      bctx.fillStyle = rgba(SELC, 1); bctx.beginPath(); bctx.arc(p.X, p.Y, 10.5 * s, 0, 7); bctx.fill();
      bctx.strokeStyle = rgba([245, 248, 255], 0.95); bctx.lineWidth = 2; bctx.stroke();
      bctx.fillStyle = '#1a1406'; bctx.textAlign = 'center'; bctx.textBaseline = 'middle'; bctx.font = `bold ${10.5 * s}px ui-monospace`; bctx.fillText((n + 1) + (st.over ? '▲' : '▼'), p.X, p.Y); bctx.textBaseline = 'alphabetic';
    });
    // the two hubs — explicitly DISCONNECTED (no shaft): white hub on the upper floor, production hub on the
    // lower floor. The only path between them is out along the weave and back.
    const top = P(m.entry.x, m.entry.y, GAP, s), bot = P(m.entry.x, m.entry.y, 0, s);
    bctx.fillStyle = rgba(HUBP, 0.95); bctx.beginPath(); bctx.arc(bot.X, bot.Y, 8 * s, 0, 7); bctx.fill();
    bctx.fillStyle = rgba([20, 16, 8], 0.9); bctx.textAlign = 'center'; bctx.font = `${10 * s}px ui-sans-serif`; bctx.fillText('▽ 8 production', bot.X, bot.Y + 18 * s);
    bctx.fillStyle = rgba(HUBW, 0.97); bctx.beginPath(); bctx.arc(top.X, top.Y, 9 * s, 0, 7); bctx.fill();
    bctx.strokeStyle = rgba([245, 248, 255], 0.9); bctx.lineWidth = 1.6; bctx.stroke();
    bctx.fillStyle = rgba(INK, 0.95); bctx.fillText('△ 6 white-collar hub (enter)', top.X, top.Y - 12 * s);
  }
  // floor labels
  bctx.textAlign = 'left'; bctx.font = `${12 * s}px ui-monospace,monospace`;
  const ul = P(0, m.H, GAP, s), ll = P(0, m.H, 0, s);
  bctx.fillStyle = rgba([150, 170, 200], 0.85); bctx.fillText('△ upper floor — over', ul.X - 6 * s, ul.Y + 16 * s);
  bctx.fillStyle = rgba([120, 134, 158], 0.85); bctx.fillText('▽ lower floor — under', ll.X - 6 * s, ll.Y + 16 * s);
  dirty = false;
}

function frame(ts) {
  now = ts;
  if (dirty) renderStatic();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, CW, CH);
  ctx.drawImage(buf, panx, pany, CW, CH);
  // dynamic: material flowing along the production lines (rides each line's floor), drawn with pan applied
  if (flowOn) { const s = camS(), tt = now * 0.00015;
    for (let i = 0; i < m.weftFlow.length; i++) { const wf = m.weftFlow[i]; const col = hex(wf.color); const pl = wf._pl; for (let q = 0; q < 4; q++) {
      const fr = (tt + i * 0.11 + q / 4) % 1; const pos = at(pl, fr); const p = P(pos.x, pos.y, pos.z, s);
      ctx.fillStyle = rgba(mix(col, INK, 0.35), 0.95); ctx.beginPath(); ctx.arc(p.X + panx, p.Y + pany, 3.2 * s, 0, 7); ctx.fill();
    } } }
  requestAnimationFrame(frame);
}

// polyline param for the flow
function makePL(pts) { const cum = [0]; let t = 0; for (let i = 1; i < pts.length; i++) { t += Math.hypot(pts[i].cx - pts[i - 1].cx, pts[i].cy - pts[i - 1].cy); cum.push(t); } return { pts, cum, total: t || 1 }; }
function at(pl, fr) { const target = fr * pl.total; let i = 1; while (i < pl.cum.length && pl.cum[i] < target) i++; if (i >= pl.pts.length) i = pl.pts.length - 1; const a = pl.pts[i - 1], b = pl.pts[i]; const seg = pl.cum[i] - pl.cum[i - 1] || 1; const u = (target - pl.cum[i - 1]) / seg; return { x: a.cx + (b.cx - a.cx) * u, y: a.cy + (b.cy - a.cy) * u, z: a.z + (b.z - a.z) * u }; }
function precompute() { for (const wf of m.weftFlow) wf._pl = makePL(wf.pts); byDepth = m.cells.map((c, i) => i).sort((a, b) => m.cells[a].cy - m.cells[b].cy); }
precompute();

function panels() {
  $('read').innerHTML =
    `<b>polar weave</b> · <b>19 chunks</b>, ${m.cells.length} chambers · <span class="ok">${m.contactPairs}/48 contacts (K(6,8))</span> · 100% of both floors · ` +
    `6 white arms converge at the <b>top-centre hub</b>, 8 production at the <b>bottom-centre hub</b> — joined only through the weave<br>` +
    `<span>two counter-rotating spiral families (seed ${seed}: ${m.family.turnsW.toFixed(2)}/${m.family.turnsP.toFixed(2)} turns): every white arm crosses every production arm as it spirals out. Reseed for another rosette in the family. Pick a surface (1–6) to follow it.</span>`;
  $('wsel').innerHTML = m.warps.map((w) => `<div class="w ${w.w === sel ? 'sel' : ''}" data-w="${w.w}"><div class="k">${w.w + 1}</div><div class="lab">${w.label}</div></div>`).join('');
  for (const el of $('wsel').querySelectorAll('.w')) el.addEventListener('click', () => { sel = +el.dataset.w; dirty = true; sync(); });
  const t = m.tours[sel];
  $('itin').innerHTML = t.stops.map((st, n) => `<div class="stop"><span class="n">${n + 1}.</span><span class="g">${st.glyph}</span><span>${st.label}</span><span class="ou">${st.over ? '△ over' : '▽ under'}</span></div>`).join('');
  $('elist').innerHTML = m.wefts.map((e) => `<div class="e"><span class="sw" style="background:${e.color}"></span><span><span class="nm">${e.glyph} ${e.label}</span> — <span class="nt">${e.note}</span></span></div>`).join('');
  $('note').innerHTML = `Following <b>${m.warps[sel].label}</b>: from the core it weaves through all ${K.wefts} production lines — <b>over</b> on the upper floor, <b>under</b> on the lower — meeting each once. The whole region (19 chunks) is filled: no chamber is idle on either floor.`;
}

let now = 0;
function sync() {
  $('flow').classList.toggle('on', flowOn); $('weaveBtn').classList.toggle('on', weaveOn);
  const u = new URLSearchParams(); if (seed !== 1) u.set('seed', seed); u.set('w', sel); history.replaceState(null, '', '?' + u.toString());
  panels();
}

$('flow').addEventListener('click', () => { flowOn = !flowOn; sync(); });
$('weaveBtn').addEventListener('click', () => { weaveOn = !weaveOn; dirty = true; sync(); });
$('explode').addEventListener('input', (e) => { GAP = +e.target.value; m = buildWeaveFloor(seed, { GAP }); precompute(); dirty = true; });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; m = buildWeaveFloor(seed, { GAP }); precompute(); dirty = true; sync(); });
$('reset').addEventListener('click', () => { panx = pany = 0; Z = 1; dirty = true; });
addEventListener('keydown', (e) => { const k = '123456'.indexOf(e.key); if (k >= 0) { sel = k; dirty = true; sync(); } });
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; panx += e.clientX - lx; pany += e.clientY - ly; lx = e.clientX; ly = e.clientY; });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); Z = Math.max(0.5, Math.min(4, Z * (e.deltaY < 0 ? 1.1 : 0.9))); dirty = true; }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; for (const cc of [cv, buf]) { cc.width = CW * DPR | 0; cc.height = CH * DPR | 0; } cv.style && (cv.style.width = ''); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); dirty = true; }
addEventListener('resize', resize);
resize(); sync(); requestAnimationFrame(frame);
