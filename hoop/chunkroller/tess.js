// tess.js — the tessellation editor UI. Drag a hexagon's three editable edges into weird shapes; the
// opposite edges follow (reverse + translate), so it ALWAYS tessellates. Faint translated copies preview
// the tiling. Export writes the deformed shape as JSON. Pure-static, imports the tessgen kernel.

import { hexVerts, defaultEdges, buildShape, neighbourOffsets, exportShape, NPTS_DEFAULT } from './tessgen.js';

const R = 180;
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, view = { s: 1, ox: 0, oy: 0 };
let nPts = NPTS_DEFAULT, edges = defaultEdges(nPts), shape = buildShape(R, edges), showNbr = true;
let drag = null;   // { k, j }

const SX = (p) => p[0] * view.s + view.ox, SY = (p) => p[1] * view.s + view.oy;
const WX = (x) => (x - view.ox) / view.s, WY = (y) => (y - view.oy) / view.s;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// the draggable handles: the interior control points of the three editable edges (0,1,2).
function handles() {
  const V = shape.V, out = [];
  for (let k = 0; k < 3; k++) { const a = V[k], b = V[(k + 1) % 6], n = edges[k].controls.length; for (let j = 0; j < n; j++) { const base = lerp(a, b, (j + 1) / (n + 1)); out.push({ k, j, base, pos: [base[0] + edges[k].controls[j][0], base[1] + edges[k].controls[j][1]] }); } }
  return out;
}

function rebuild() { shape = buildShape(R, edges); render(); }

function fit() {
  // fit the tile + its 6 neighbours so the tiling is visible
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const offs = [[0, 0], ...neighbourOffsets(shape)];
  for (const o of offs) for (const p of shape.boundary) { x0 = Math.min(x0, p[0] + o[0]); y0 = Math.min(y0, p[1] + o[1]); x1 = Math.max(x1, p[0] + o[0]); y1 = Math.max(y1, p[1] + o[1]); }
  const pad = 30, s = Math.min((CW - 2 * pad) / (x1 - x0 || 1), (CH - 2 * pad) / (y1 - y0 || 1));
  view = { s, ox: (CW - (x1 - x0) * s) / 2 - x0 * s, oy: (CH - (y1 - y0) * s) / 2 - y0 * s };
}

function path(boundary, off = [0, 0]) { ctx.beginPath(); ctx.moveTo(SX([boundary[0][0] + off[0], boundary[0][1] + off[1]]), SY([boundary[0][0] + off[0], boundary[0][1] + off[1]])); for (let i = 1; i < boundary.length; i++) ctx.lineTo(SX([boundary[i][0] + off[0], boundary[i][1] + off[1]]), SY([boundary[i][0] + off[0], boundary[i][1] + off[1]])); ctx.closePath(); }

function render() {
  ctx.clearRect(0, 0, CW, CH);
  // faint tiling preview
  if (showNbr) {
    for (const o of neighbourOffsets(shape)) {
      path(shape.boundary, o); ctx.fillStyle = 'rgba(127,176,216,.06)'; ctx.fill(); ctx.strokeStyle = 'rgba(127,176,216,.22)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  // the tile
  path(shape.boundary); ctx.fillStyle = 'rgba(244,191,98,.10)'; ctx.fill();
  ctx.strokeStyle = '#f4bf62'; ctx.lineWidth = 2; ctx.stroke();
  // the three editable edges, lit brighter; the three mirrored ones dimmer
  for (let k = 0; k < 6; k++) {
    const e = shape.edges[k]; ctx.beginPath(); ctx.moveTo(SX(e[0]), SY(e[0])); for (let i = 1; i < e.length; i++) ctx.lineTo(SX(e[i]), SY(e[i]));
    ctx.strokeStyle = k < 3 ? '#ffd98a' : 'rgba(127,176,216,.55)'; ctx.lineWidth = k < 3 ? 3 : 2; ctx.stroke();
  }
  // hex vertices (fixed)
  for (const v of shape.V) { ctx.fillStyle = '#5570d8'; ctx.beginPath(); ctx.arc(SX(v), SY(v), 4, 0, 7); ctx.fill(); }
  // draggable handles
  for (const h of handles()) { ctx.fillStyle = '#f4bf62'; ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(SX(h.pos), SY(h.pos), 6, 0, 7); ctx.fill(); ctx.stroke(); }
}

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); fit(); render(); }

// ── interaction ──
cv.addEventListener('pointerdown', (e) => {
  const r = cv.getBoundingClientRect(), wx = WX(e.clientX - r.left), wy = WY(e.clientY - r.top);
  let best = null, bd = (14 / view.s) ** 2;
  for (const h of handles()) { const d = (h.pos[0] - wx) ** 2 + (h.pos[1] - wy) ** 2; if (d < bd) { bd = d; best = h; } }
  if (best) { drag = { k: best.k, j: best.j, base: best.base }; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); }
});
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const r = cv.getBoundingClientRect(), wx = WX(e.clientX - r.left), wy = WY(e.clientY - r.top);
  edges[drag.k].controls[drag.j] = [wx - drag.base[0], wy - drag.base[1]];
  rebuild();
});
const endDrag = () => { drag = null; cv.classList.remove('drag'); };
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);

$('npts').addEventListener('input', (e) => { nPts = +e.target.value; $('nptsv').textContent = nPts; edges = defaultEdges(nPts); rebuild(); });
$('reset').addEventListener('click', () => { edges = defaultEdges(nPts); fit(); rebuild(); });
$('rand').addEventListener('click', () => {
  const amp = R * 0.22;
  edges = defaultEdges(nPts).map((ed) => ({ controls: ed.controls.map(() => [(Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * 2 * amp]) }));
  fit(); rebuild();
});
$('nbr').addEventListener('change', (e) => { showNbr = e.target.checked; render(); });
$('export').addEventListener('click', () => {
  const stamp = Date.now();
  const data = exportShape(R, edges, stamp);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chunkshape-${stamp}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

addEventListener('resize', resize);
resize();
