// tess-app.js — HOW THE WEAVES TESSELLATE. A weave-cell is a hexagon; hexagons honeycomb the rind shell. The
// cortex has 6 white arms and a hexagon has 6 neighbours, so each white arm hands off to one neighbour — the
// white weave is the connective tissue, the 8 production engines stay local to each cell. Schematic, deterministic.

import { FACTIONS } from './foam3d.js';
import { ENGINE_RING, ENGINES } from './engines.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, now = 0;
let cellRings = 1, showCouple = true, showProd = true, showNest = false;
let yaw = 0, ox = 0, oy = 0, zoom = 1, drag = false, lx = 0, ly = 0;
const ptrs = new Map(); let pinchD = 0;

const SQRT3 = Math.sqrt(3), TAU = Math.PI * 2;
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const INK = [232, 236, 244];
// the 6 white arms, two per faction (the nave's lobes) — colour + name; the order places the two arms of a
// faction on adjacent hex edges so a faction owns a 120° wedge, like the rosette.
const WHITE6 = FACTIONS.flatMap((f) => f.roleIds.map((rid, i) => ({ color: hex(f.color), shade: i, faction: f.label })));
const ENG8 = ENGINE_RING.map((id) => ({ ...ENGINES[id], id }));

// axial hex cell centres for a flower of `rings` rings (1 → 7 cells, 2 → 19) — flat-top, size = cell circumradius
const cellCentres = (rings, size) => { const out = []; for (let q = -rings; q <= rings; q++) for (let r = -rings; r <= rings; r++) if (Math.abs(q + r) <= rings) out.push({ q, r, x: size * 1.5 * q, y: size * SQRT3 * (r + q / 2), ring: (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 }); return out; };

function world(x, y) { const c = Math.cos(yaw), s = Math.sin(yaw); return { X: CW / 2 + ox + (x * c - y * s) * zoom, Y: CH / 2 + oy + (x * s + y * c) * zoom }; }
function mv(x, y, first) { const p = world(x, y); first ? ctx.moveTo(p.X, p.Y) : ctx.lineTo(p.X, p.Y); }

// one white arm: a spiral from the cell centre OUT to an edge midpoint (so it can hand off to the neighbour there)
function whiteArm(cx, cy, R, edgeAng, col, shade, lead) {
  const inrad = R * SQRT3 / 2;                       // centre → edge midpoint
  const turns = 0.55, N = 48;
  ctx.beginPath();
  for (let k = 0; k <= N; k++) { const t = k / N, rad = inrad * t, a = edgeAng + (turns * TAU) * (1 - t) - turns * TAU; mv(cx + rad * Math.cos(a), cy + rad * Math.sin(a), k === 0); }
  ctx.strokeStyle = rgba(col, 0.42 + 0.4 * (1 - shade * 0.4)); ctx.lineWidth = (lead ? 2.6 : 1.8) * zoom; ctx.lineCap = 'round'; ctx.stroke();
  return { x: cx + inrad * Math.cos(edgeAng), y: cy + inrad * Math.sin(edgeAng) };   // the rim-exit (edge midpoint)
}

function productionRosette(cx, cy, R) {
  const inrad = R * SQRT3 / 2, turns = -0.5, N = 30;
  for (let f = 0; f < 8; f++) { const base = f / 8 * TAU + Math.PI / 8; ctx.beginPath();
    for (let k = 0; k <= N; k++) { const t = k / N, rad = inrad * 0.5 * t, a = base + (turns * TAU) * (1 - t); mv(cx + rad * Math.cos(a), cy + rad * Math.sin(a), k === 0); }
    ctx.strokeStyle = rgba(hex(ENG8[f].color), 0.5); ctx.lineWidth = 1.1 * zoom; ctx.lineCap = 'round'; ctx.stroke(); }
  const p = world(cx, cy); ctx.fillStyle = rgba([236, 210, 150], 0.9); ctx.beginPath(); ctx.arc(p.X, p.Y, 3.2 * zoom, 0, 7); ctx.fill();  // local production hub
}

function frame(t) {
  now = t * 0.001; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const size = 150, cells = cellCentres(cellRings, size);
  const edgeAngs = [0, 1, 2, 3, 4, 5].map((k) => Math.PI / 6 + k * Math.PI / 3);   // 6 edge-midpoint directions (30°+60k)

  // aperture-7 nest: the super-hex that encloses the 7-flower, rotated ~19.1° (the H3 nesting angle)
  if (showNest && cellRings >= 1) { const SR = size * SQRT3 + size;
    ctx.save(); ctx.beginPath(); const rot = 19.106 * Math.PI / 180; for (let k = 0; k < 6; k++) { const a = rot + Math.PI / 3 * k; const p = world(SR * Math.cos(a), SR * Math.sin(a)); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); } ctx.closePath(); ctx.strokeStyle = rgba([217, 178, 74], 0.55); ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }

  // 1) hex cell outlines
  for (const c of cells) { ctx.save(); ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k, p = world(c.x + size * Math.cos(a), c.y + size * Math.sin(a)); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); } ctx.closePath(); ctx.strokeStyle = rgba([90, 106, 140], c.ring === 0 ? 0.85 : 0.4); ctx.lineWidth = (c.ring === 0 ? 1.8 : 1.2); ctx.stroke(); ctx.restore(); }

  // 2) production rosette (local machinery) per cell
  if (showProd) for (const c of cells) productionRosette(c.x, c.y, size);

  // 3) the 6 white arms per cell, each aimed at one edge / one neighbour
  const exits = new Map();
  for (const c of cells) { const ex = []; for (let k = 0; k < 6; k++) { const lead = c.ring === 0; ex.push(whiteArm(c.x, c.y, size, edgeAngs[k], WHITE6[k].color, WHITE6[k].shade, lead)); } exits.set(c.q + ',' + c.r, { c, ex }); }

  // 4) the coupling: a white arm of A continues across the shared edge into neighbour B's hub — the cortex weaves
  //    the honeycomb together. Highlight the centre cell's six hand-offs (a travelling pulse along one).
  if (showCouple) {
    const nbr = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];   // the 6 neighbour steps, matched to edgeAngs order
    const live = Math.floor(now * 0.7) % 6;
    for (const { c, ex } of exits.values()) { for (let k = 0; k < 6; k++) { const nk = nbr[k], key = (c.q + nk[0]) + ',' + (c.r + nk[1]); const nb = exits.get(key); if (!nb) continue;
      const a = ex[k], b = nb.c; const mid = world((a.x + b.x) / 2, (a.y + b.y) / 2); const pa = world(a.x, a.y), pb = world(b.x, b.y);
      const isLive = c.ring === 0 && k === live;
      ctx.beginPath(); ctx.moveTo(pa.X, pa.Y); ctx.quadraticCurveTo(mid.X, mid.Y, pb.X, pb.Y); ctx.strokeStyle = rgba(WHITE6[k].color, isLive ? 0.95 : 0.3); ctx.lineWidth = (isLive ? 3 : 1.4) * zoom; ctx.setLineDash(isLive ? [] : [3, 4]); ctx.stroke(); ctx.setLineDash([]);
      // a dot at the shared edge midpoint (the hand-off point = a door between cells)
      ctx.fillStyle = rgba(WHITE6[k].color, 0.9); ctx.beginPath(); ctx.arc(pa.X, pa.Y, 2.6 * zoom, 0, 7); ctx.fill();
    } }
  }

  $('read').innerHTML = `<b>${cells.length} weave-cells</b> (${cellRings} cell-ring${cellRings > 1 ? 's' : ''}) honeycombed · each is one hexagonal K(6,8) ops-block · ` +
    `<span class="ok">6 white arms ⇄ 6 neighbours</span> (the cortex weaves the lattice) · 8 engines stay local. ` +
    (showNest ? 'The gold dashed super-hexagon is the <b>aperture-7</b> nesting (≈19.1° rotation) — 7 cells make one bigger cell, like H3.' : 'Toggle “aperture-7 nest” to see the cells nest into a super-cell.');
  requestAnimationFrame(frame);
}

$('couple').addEventListener('click', () => { showCouple = !showCouple; $('couple').classList.toggle('on', showCouple); });
$('prod').addEventListener('click', () => { showProd = !showProd; $('prod').classList.toggle('on', showProd); });
$('grow').addEventListener('click', () => { cellRings = cellRings % 3 + 1; });
$('aperture').addEventListener('click', () => { showNest = !showNest; $('aperture').classList.toggle('on', showNest); if (showNest && cellRings < 1) cellRings = 1; });

cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const v = [...ptrs.values()]; pinchD = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); } });
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); if (pinchD) zoom = Math.max(0.4, Math.min(3, zoom * d / pinchD)); pinchD = d; return; }
  if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; ox += dx; oy += dy;
});
cv.addEventListener('pointerup', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; drag = ptrs.size > 0; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.4, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; }
addEventListener('resize', resize);
resize(); requestAnimationFrame(frame);
