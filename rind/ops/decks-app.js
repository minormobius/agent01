// ops-app.js — the live production weave, two voronoi decks in oblique 2.5D.
//   DECK 0 (lower): the production floor — 8 engines as voronoi regions, process steps on chambers, material
//                   flowing along each engine's activity graph AND the inter-engine supply chain (the closed
//                   loop reclaim→refiners→mill→assembly→fulfillment→reclaim).
//   DECK 1 (upper): the ops mezzanine — 6 white-collar surfaces as voronoi regions.
//   THE WEAVE: every office is linked to every engine (K(6,8)); pick a surface and watch its thread tour all 8.

import { buildDecks, flowEdges } from './layout.js';
import { K } from './weave.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let sel = Q.has('w') ? (Q.get('w') | 0) % 6 : 0;
let explode = 175, flowOn = true, weaveOn = true;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, panx = 0, pany = 0, Z = 1;
let d = buildDecks(seed), fe = flowEdges(d);

// ── colour helpers ──
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const GOLD = [217, 178, 74], INK = [232, 236, 244], BG = [6, 7, 12];

// ── oblique 2.5D projection: deck plane (x,y) at height z → screen ──
const TILT = 0.52, SKEW = 0.12, OS = 0.78;   // OS = mezzanine plane shrink (a smaller control level above the floor)
function cam() { const s = Math.min(CW / d.W, CH / d.H) * 0.82 * Z; return { s, ox: CW / 2 + panx, oy: CH / 2 + 40 + pany }; }
function P(x, y, z, c) { const lx = x - d.W / 2, ly = y - d.H / 2; return { X: c.ox + (lx + ly * SKEW) * c.s, Y: c.oy + (ly * TILT - z) * c.s }; }
// office-deck point: shrink toward centre then project at the explode height
function PO(x, y, c) { return P(d.W / 2 + (x - d.W / 2) * OS, d.H / 2 + (y - d.H / 2) * OS, explode, c); }

// ── polyline param (deck coords, camera-independent) ──
function makePL(pts) { const cum = [0]; let t = 0; for (let i = 1; i < pts.length; i++) { t += Math.hypot(pts[i].cx - pts[i - 1].cx, pts[i].cy - pts[i - 1].cy); cum.push(t); } return { pts, cum, total: t || 1 }; }
function at(pl, f) { const target = f * pl.total; let i = 1; while (i < pl.cum.length && pl.cum[i] < target) i++; if (i >= pl.pts.length) i = pl.pts.length - 1; const a = pl.pts[i - 1], b = pl.pts[i]; const seg = pl.cum[i] - pl.cum[i - 1] || 1; const u = (target - pl.cum[i - 1]) / seg; return { x: a.cx + (b.cx - a.cx) * u, y: a.cy + (b.cy - a.cy) * u }; }
function precompute() { for (const e of d.engines) for (const fl of e.flow) fl._pl = makePL(fl.path); for (const s of d.supply) s._pl = makePL(s.path); }
precompute();

// ── draw a deck's voronoi cells. proj maps a cell vertex → screen (P for the floor, PO for the mezzanine) ──
function drawCells(foam, owner, colorOf, c, alpha, proj) {
  for (const cell of foam.cells) {
    const col = colorOf(owner[cell.i], cell);
    ctx.beginPath();
    for (let k = 0; k < cell.poly.length; k++) { const p = proj(cell.poly[k][0], cell.poly[k][1], c); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }
    ctx.closePath();
    ctx.fillStyle = rgba(col, alpha); ctx.fill();
    ctx.strokeStyle = rgba(mix(col, BG, 0.55), alpha * 0.9); ctx.lineWidth = 1; ctx.stroke();
  }
}

function drawScene() {
  const c = cam(), zO = explode;
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);

  // ── DECK 0: production floor ──
  drawCells(d.foamP, d.ownerP, (f, cell) => {
    const e = d.engines[f]; const base = hex(e.color);
    const isStep = e.steps.some((s) => s.cell === cell.i);
    return isStep ? mix(base, INK, 0.22) : mix(base, BG, 0.62);
  }, c, 0.94, (x, y, cc) => P(x, y, 0, cc));

  // intra-engine activity flow (faint static ribbons)
  for (const e of d.engines) { const col = hex(e.color); for (const fl of e.flow) {
    ctx.strokeStyle = rgba(mix(col, INK, 0.25), 0.5); ctx.lineWidth = 2; ctx.beginPath();
    fl.path.forEach((cl, i) => { const p = P(cl.cx, cl.cy, 0, c); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.stroke();
  } }
  // inter-engine supply chain (bolder static lines — the long-haul material)
  for (const s of d.supply) { const col = hex(s.color); ctx.strokeStyle = rgba(col, 0.34); ctx.lineWidth = 3.5; ctx.setLineDash([1, 6]); ctx.lineCap = 'round'; ctx.beginPath();
    s.path.forEach((cl, i) => { const p = P(cl.cx, cl.cy, 0, c); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.stroke(); ctx.setLineDash([]); }

  // engine cores + labels
  for (const e of d.engines) { const col = hex(e.color);
    for (const s of e.steps) { const p = P(s.cx, s.cy, 0, c); const r = (s.isCore ? 8 : 5) * c.s;
      ctx.fillStyle = rgba(mix(col, INK, s.isCore ? 0.1 : 0.35), 0.95); ctx.beginPath(); ctx.arc(p.X, p.Y, r, 0, 7); ctx.fill();
      if (s.isCore) { ctx.fillStyle = '#0a0c12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${10 * c.s}px ui-monospace,monospace`; ctx.fillText(e.glyph, p.X, p.Y + 0.5); ctx.textBaseline = 'alphabetic'; }
    }
    const lp = P(e.cx, e.cy, 0, c); ctx.fillStyle = rgba(mix(col, INK, 0.5), 0.95); ctx.textAlign = 'center'; ctx.font = `bold ${11 * c.s}px ui-sans-serif`; ctx.fillText(e.label, lp.X, lp.Y - 13 * c.s);
  }
  // fulfillment lift at centre (the single entry up)
  const lp = P(d.lift.cx, d.lift.cy, 0, c);
  ctx.fillStyle = rgba(hex(d.lift.color), 0.95); ctx.beginPath(); ctx.arc(lp.X, lp.Y, 9 * c.s, 0, 7); ctx.fill();
  ctx.fillStyle = '#0a0c12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${11 * c.s}px ui-monospace,monospace`; ctx.fillText('⇅', lp.X, lp.Y); ctx.textBaseline = 'alphabetic';

  // ── the WEAVE: links from each office (deck 1) to each engine (deck 0). faint backdrop + selected bright ──
  if (weaveOn) {
    for (const off of d.offices) { const op = PO(off.cx, off.cy, c); const isSel = off.w === sel;
      for (const e of d.engines) { if (isSel) continue; const ep = P(e.cx, e.cy, 0, c);
        ctx.strokeStyle = rgba([96, 110, 134], 0.13); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(op.X, op.Y); ctx.lineTo(ep.X, ep.Y); ctx.stroke();
      }
    }
  }

  // ── DECK 1: ops mezzanine (a smaller, translucent control level floating above the floor) ──
  drawCells(d.foamO, d.ownerO, (w) => { const base = w === sel ? GOLD : [150, 200, 220]; return mix(base, BG, w === sel ? 0.2 : 0.5); }, c, 0.62, PO);
  for (const off of d.offices) { const op = PO(off.cx, off.cy, c); const isSel = off.w === sel;
    ctx.fillStyle = rgba(isSel ? GOLD : [190, 220, 235], 0.95); ctx.beginPath(); ctx.arc(op.X, op.Y, (isSel ? 6 : 4) * c.s, 0, 7); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = `${10.5 * c.s}px ui-sans-serif`; ctx.fillText(off.label, op.X, op.Y - 9 * c.s);
  }

  // selected office's 8 weave links, in tour order, bright over everything
  if (weaveOn) {
    const off = d.offices[sel], op = PO(off.cx, off.cy, c), t = d.tours[sel];
    t.stops.forEach((st) => { const e = d.engines[st.f]; const ep = P(e.cx, e.cy, 0, c); const ec = hex(e.color);
      ctx.strokeStyle = rgba(mix(ec, GOLD, 0.3), 0.85); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(op.X, op.Y); ctx.lineTo(ep.X, ep.Y); ctx.stroke();
      ctx.fillStyle = rgba(GOLD, 0.95); const mx = op.X + (ep.X - op.X) * 0.5, my = op.Y + (ep.Y - op.Y) * 0.5;
      ctx.beginPath(); ctx.arc(mx, my, 7 * c.s, 0, 7); ctx.fill(); ctx.fillStyle = '#1a1406'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${8.5 * c.s}px ui-monospace`; ctx.fillText(String(st.k + 1), mx, my); ctx.textBaseline = 'alphabetic';
    });
  }

  // ── DYNAMIC: material packets ──
  if (flowOn) {
    const tt = now * 0.00018;
    // intra-engine activity (small)
    for (const e of d.engines) { const col = hex(e.color); for (let pi = 0; pi < e.flow.length; pi++) { const fl = e.flow[pi]; for (let q = 0; q < 2; q++) {
      const f = ((tt * 1.4) + (pi * 0.37) + q * 0.5) % 1; const pos = at(fl._pl, f); const p = P(pos.x, pos.y, 0, c);
      ctx.fillStyle = rgba(mix(col, INK, 0.4), 0.95); ctx.beginPath(); ctx.arc(p.X, p.Y, 2.6 * c.s, 0, 7); ctx.fill();
    } } }
    // inter-engine supply (bold carriers of the long-haul material)
    for (let si = 0; si < d.supply.length; si++) { const s = d.supply[si]; const col = hex(s.color); for (let q = 0; q < 2; q++) {
      const f = ((tt * 0.85) + (si * 0.21) + q * 0.5) % 1; const pos = at(s._pl, f); const p = P(pos.x, pos.y, 0, c);
      ctx.fillStyle = rgba(col, 0.95); ctx.beginPath(); ctx.arc(p.X, p.Y, 4 * c.s, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(INK, 0.4); ctx.lineWidth = 1; ctx.stroke();
    } }
    // a tech walking the selected office's tour: office → engine k → office → engine k+1 …
    const off = d.offices[sel], t = d.tours[sel], P0 = PO(off.cx, off.cy, c);
    const cyc = (now * 0.00022) % 1, total = t.stops.length, fp = cyc * total, k = Math.floor(fp), fr = fp - k;
    const e = d.engines[t.stops[k].f], ep = P(e.cx, e.cy, 0, c);
    const down = fr < 0.5, u = down ? fr / 0.5 : (fr - 0.5) / 0.5; const aX = down ? P0.X : ep.X, aY = down ? P0.Y : ep.Y, bX = down ? ep.X : P0.X, bY = down ? ep.Y : P0.Y;
    const tx = aX + (bX - aX) * u, ty = aY + (bY - aY) * u;
    ctx.fillStyle = rgba(GOLD, 1); ctx.beginPath(); ctx.arc(tx, ty, 5 * c.s, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(BG, 0.6); ctx.lineWidth = 1.4; ctx.stroke();
  }
}

// ── panels ──
function panels() {
  const c = d.contact, total = fe.total;
  $('read').innerHTML =
    `<b>K(${K.warps},${K.wefts})</b> · <span class="ok">${c.crossings}/${c.expected} office×engine contacts</span> · ` +
    `<b>${d.engines.length}</b> engines on the production deck, <b>${d.offices.length}</b> ops surfaces above · ` +
    `<b>${total}</b> live material-flow edges (${fe.intra.length} activity + ${fe.inter.length} supply)<br>` +
    `<span>two voronoi decks · the supply chain closes (reclaim → refiners → mill → assembly → fulfillment → reclaim) · pick a surface (1–6) to follow its tour of all 8</span>`;
  $('wsel').innerHTML = d.offices.map((w) => `<div class="w ${w.w === sel ? 'sel' : ''}" data-w="${w.w}"><div class="k">${w.w + 1}</div><div class="lab">${w.label}</div></div>`).join('');
  for (const el of $('wsel').querySelectorAll('.w')) el.addEventListener('click', () => { sel = +el.dataset.w; sync(); });
  const t = d.tours[sel];
  $('itin').innerHTML = t.stops.map((st) => { const e = d.engines[st.f]; return `<div class="stop"><span class="n">${st.k + 1}.</span><span class="g">${e.glyph}</span><span>${e.label}</span></div>`; }).join('');
  $('elist').innerHTML = d.engines.map((e) => `<div class="e"><span class="sw" style="background:${e.color}"></span><span><span class="nm">${e.glyph} ${e.label}</span> — <span class="nt">${e.note}</span></span></div>`).join('');
  $('note').innerHTML = `Following <b>${d.offices[sel].label}</b>: enter at the lift, then this one ops surface is woven through all ${K.wefts} engines, meeting each once — the gold thread. The six surfaces share the lift and interleave but never collide (at every step they sit on six different engines).`;
}

let now = 0;
function frame(ts) { now = ts; drawScene(); requestAnimationFrame(frame); }

function sync() {
  $('flow').classList.toggle('on', flowOn); $('weaveBtn').classList.toggle('on', weaveOn);
  const u = new URLSearchParams(); if (seed !== 1) u.set('seed', seed); u.set('w', sel); history.replaceState(null, '', '?' + u.toString());
  panels();
}

// ── interaction ──
$('flow').addEventListener('click', () => { flowOn = !flowOn; sync(); });
$('weaveBtn').addEventListener('click', () => { weaveOn = !weaveOn; sync(); });
$('explode').addEventListener('input', (e) => { explode = +e.target.value; });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; d = buildDecks(seed); fe = flowEdges(d); precompute(); sync(); });
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
