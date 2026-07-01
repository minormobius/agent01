// prism-app.js — LAY THE WEAVE on the prism + its VORONOI CHAMBERS. Each prism node becomes a Voronoi cell
// coloured by the thread that claims it. Per-thread visibility (all 14) + group toggles (whites / ops / matrix).
// Wayfinding picks two chambers and routes the path that MINIMISES DOORS CROSSED. Three+ honest levers below.

import { buildGeometry, weaveLines, layWeave } from './weave3d.js';
import { buildCells, routeMinDoors, ownerKey } from './cells3d.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let width = 6, spacing = 30, flatR = 0.16, rings = 1, spin = true, showThreads = false, showCells = true, routeMode = false, peel = 0;
let yaw = 0.4, pitch = 0.95, zoom = 1;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
// three cached stages: geometry+Voronoi (heavy, by geomKey) → lay-weave (cheap, on width/flatR)
let geo = null, cellsModel = null, geomKey = '', m = null;
let routeA = -1, routeB = -1, theRoute = null, routeSet = null, pickCells = [];

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], BG = [6, 7, 12], MATRIX = [44, 52, 70], GOLD = [255, 224, 122];
geo = buildGeometry(seed, { rings, spacing });   // initial geometry — warps/wefts are stable across every lever
const warpCol = (w) => mix(hex(geo.warps[w].color), INK, (w % 2) * 0.28);
const prodCol = (f) => hex(geo.wefts[f].color);
const ownerColor = (o) => o ? (o.kind === 'white' ? warpCol(o.idx) : prodCol(o.idx)) : MATRIX;

// 2D convex hull (monotone chain) — a 3D cell's SILHOUETTE is the hull of its projected vertices
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}

// the 14 threads + the matrix as toggleable keys (stable — from geo)
const whiteKeys = geo.warps.map((w) => 'w' + w.w), prodKeys = geo.wefts.map((f) => 'p' + f.f);
const allThreads = [...whiteKeys, ...prodKeys];
const labelOf = (k) => k === 'matrix' ? 'matrix' : k[0] === 'w' ? geo.warps[+k.slice(1)].id : geo.wefts[+k.slice(1)].label;
const colorKey = (k) => k === 'matrix' ? MATRIX : k[0] === 'w' ? warpCol(+k.slice(1)) : prodCol(+k.slice(1));
const visible = new Set(allThreads);   // start: 14 threads on, matrix hidden

function proj(x, y, z, s) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw); const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch); const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
  return { X: CW / 2 + x1 * s, Y: CH / 2 - z2 * s, depth: y2 };
}

function recomputeRoute() { theRoute = (routeA >= 0 && routeB >= 0) ? routeMinDoors(cellsModel, routeA, routeB) : null; routeSet = theRoute ? new Set(theRoute.path) : null; }
void ownerKey;

function draw() {
  const s = Math.min(CW, CH) / (m.R * 2.5) * zoom, zc = m.thickness / 2;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);

  // prism faces + vertical edges
  const faceHex = (z, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); m.footprint.forEach((v, i) => { const p = proj(v[0], v[1], z - zc, s); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.closePath(); ctx.stroke(); };
  const cutoff = (1 - peel) * m.thickness + m.thickness * 1e-3;   // peel top: hide chambers whose node z is above this
  faceHex(0, rgba([90, 106, 140], 0.4), 1.2); faceHex(peel > 0 ? cutoff : m.thickness, rgba([120, 138, 178], 0.5), 1.2);
  ctx.strokeStyle = rgba([70, 84, 112], 0.3); ctx.lineWidth = 1; for (const v of m.footprint) { const a = proj(v[0], v[1], -zc, s), b = proj(v[0], v[1], (peel > 0 ? cutoff : m.thickness) - zc, s); ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke(); }
  if (peel > 0) faceHex(cutoff, rgba(GOLD, 0.45), 1.3);           // the cut plane
  if (m.flatR > 0) { ctx.strokeStyle = rgba(GOLD, 0.4); ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]); ctx.beginPath(); const rr = m.flatR * m.R; for (let k = 0; k <= 48; k++) { const an = k / 48 * Math.PI * 2, p = proj(rr * Math.cos(an), rr * Math.sin(an), 0, s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); } ctx.stroke(); ctx.setLineDash([]); }

  pickCells = [];
  if (showCells && cellsModel) {
    // depth-sort the VISIBLE chambers (far → near) and fill their Voronoi polygons at their deck height
    const drawn = [];
    for (const c of cellsModel.cells) { if (!visible.has(c.ownerKey) || c.z > cutoff) continue; const pc = proj(c.x, c.y, c.z - zc, s); drawn.push({ c, depth: pc.depth, X: pc.X, Y: pc.Y }); }
    drawn.sort((a, b) => a.depth - b.depth);
    for (const d of drawn) {
      const c = d.c, col = ownerColor(c.owner), sh = 0.5 + 0.5 * (d.depth / m.R + 1) / 2, inRoute = routeSet && routeSet.has(c.gi);
      const hull = convexHull(c.verts.map((v) => { const p = proj(v[0], v[1], v[2] - zc, s); return [p.X, p.Y]; }));   // the polyhedron's silhouette
      if (hull.length >= 3) {
        ctx.beginPath(); hull.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
        ctx.fillStyle = rgba(mix(col, BG, c.owner ? 0.12 : 0.5), (inRoute ? 0.96 : 0.7) * sh); ctx.fill();
        ctx.strokeStyle = rgba(mix(col, BG, 0.55), 0.45 * sh); ctx.lineWidth = 0.6; ctx.stroke();
        if (inRoute) { ctx.strokeStyle = rgba(GOLD, 0.95); ctx.lineWidth = 1.7; ctx.stroke(); }
      }
      pickCells.push({ gi: c.gi, X: d.X, Y: d.Y });
    }
  }

  // thread centrelines (optional)
  if (showThreads) {
    const spine = (angFn, zFn, idx, col, a) => { ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); const N = 120; for (let k = 0; k <= N; k++) { const rf = k / N, ang = angFn(idx, rf), rad = rf * m.R, p = proj(rad * Math.cos(ang), rad * Math.sin(ang), zFn(idx, rf) - zc, s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); } ctx.stroke(); };
    for (let f = 0; f < m.NF; f++) if (visible.has('p' + f)) spine(m.aP, m.zP, f, prodCol(f), 0.55);
    for (let w = 0; w < m.NW; w++) if (visible.has('w' + w)) spine(m.aW, m.zW, w, warpCol(w), 0.7);
  }

  // the route: a gold path through the chamber centroids + the two endpoints
  if (theRoute && cellsModel) {
    ctx.strokeStyle = rgba(GOLD, 0.95); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath();
    theRoute.path.forEach((gi, i) => { const c = cellsModel.cells[gi], p = proj(c.x, c.y, c.z - zc, s); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.stroke();
  }
  [[routeA, [110, 220, 140]], [routeB, [230, 120, 200]]].forEach(([gi, col]) => { if (gi < 0 || !cellsModel) return; const c = cellsModel.cells[gi], p = proj(c.x, c.y, c.z - zc, s); ctx.fillStyle = rgba(col, 0.98); ctx.beginPath(); ctx.arc(p.X, p.Y, 6, 0, 7); ctx.fill(); ctx.strokeStyle = rgba(INK, 0.8); ctx.lineWidth = 1.4; ctx.stroke(); });
}

function buildChips() {
  $('chips').innerHTML = [...allThreads, 'matrix'].map((k) => { const c = colorKey(k); return `<div class="chip" data-k="${k}"><span class="sw" style="background:${rgba(c, 1)}"></span><span class="nm">${labelOf(k)}</span></div>`; }).join('');
  for (const el of $('chips').querySelectorAll('.chip')) el.addEventListener('click', () => { const k = el.dataset.k; visible.has(k) ? visible.delete(k) : visible.add(k); updateChips(); });
  updateChips();
}
function updateChips() { for (const el of $('chips').querySelectorAll('.chip')) el.classList.toggle('off', !visible.has(el.dataset.k)); }

function panels() {
  const M = m.metrics;
  $('widthV').textContent = width; $('densV').textContent = `${M.nodes} nodes`; $('flatV').textContent = flatR.toFixed(2);
  $('chunks').textContent = `⬡ ${geo.chunkCount} chunks`;
  $('levers').innerHTML = `
    <span class="k">path width</span><span class="v">${width} nodes (r=${M.tubeR.toFixed(0)})</span>
    <span class="k">areal density</span><span class="v">${M.nodes} chambers · a=${spacing}</span>
    <span class="k">flat core radius</span><span class="v">${flatR.toFixed(2)}·R (no weave inside)</span>
    <span class="k">chunks / footprint</span><span class="v">${geo.chunkCount} · hexR ${geo.hexR | 0}</span>
    <span class="k">prism thickness</span><span class="v">${geo.thickness.toFixed(0)} · ${geo.layers} decks (pinned)</span>`;
  const pc = (x) => `${(x * 100).toFixed(0)}%`, cls = (bad) => bad ? 'v bad' : 'v ok';
  $('metrics').innerHTML = `
    <span class="k">chambers</span><span class="v">${M.nodes}</span>
    <span class="k">★ CONTINUITY (each thread 1 corridor)</span><span class="${cls(!M.continuous)}">${M.continuous ? '✓ solid' : '✗ ' + M.discontinuous + ' broke'}</span>
    <span class="k">solid fill (Σvol/prism)</span><span class="${cls(cellsModel && Math.abs(cellsModel.fillRatio - 1) > 1e-3)}">${cellsModel ? (cellsModel.fillRatio * 100).toFixed(1) : '—'}%</span>
    <span class="k">on a thread (coverage)</span><span class="v">${pc(M.coverage)}</span>
    <span class="k">interstitial matrix</span><span class="v">${pc(M.matrixPct)}</span>
    <span class="k">dead threads</span><span class="${cls(M.deadThreads > 0)}">${M.deadThreads}/14</span>
    <span class="k">K(6,8) crossings</span><span class="${cls(!M.k68)}">${M.k68Pairs}</span>
    <span class="k">anywhere→anywhere doors</span><span class="v">${M.avgDoors.toFixed(2)} avg · ${M.maxDoors} max</span>`;
  $('breaks').innerHTML = M.clean
    ? `<div class="verdict ok">✓ every thread is one continuous corridor, every white touches every production (K(6,8)), foam solid</div>`
    : `<div class="verdict bad">✗ ${M.breaks.length} issue${M.breaks.length === 1 ? '' : 's'}</div><ul>${M.breaks.map((b) => `<li>${b}</li>`).join('')}</ul>`;
  routePanel();
  $('note').innerHTML = `A TRUE over/under weave: outside the flat core every thread undulates ceiling↔floor with a zero-grade flat at each crossing (a peak where it goes over, a trough where under) — <b>top threads become bottom threads</b>, grade-capped so it stays walkable. Each thread is grown as ONE connected corridor (fair watershed over the 3D Voronoi foam) so it never fragments — <b>continuity guaranteed</b>; the cells pack the prism <b>solid</b> (${cellsModel ? (cellsModel.fillRatio * 100).toFixed(1) : '—'}%). <b>⇆ route</b>: click a <b style="color:#6ecf8a">start</b> then an <b style="color:#e678c8">end</b> — fewest thread-doors (your own corridor is free); anywhere→anywhere ≈ one door. seed ${seed}.`;
}
function routePanel() {
  if (!routeMode && routeA < 0) { $('routeRead').innerHTML = `<span class="hint">click <b>⇆ route</b>, then two chambers.</span>`; return; }
  if (routeA >= 0 && routeB < 0) { $('routeRead').innerHTML = `<span class="hint">start set — click the <b style="color:#e678c8">end</b> chamber.</span>`; return; }
  if (theRoute) { $('routeRead').innerHTML = `<span class="big">${theRoute.doors}</span> door${theRoute.doors === 1 ? '' : 's'} crossed<br><span class="sub">${theRoute.cells} chambers walked · a <b>door</b> = crossing into another thread (your own corridor is free)</span>`; return; }
  $('routeRead').innerHTML = routeA >= 0 && routeB >= 0 ? `<span class="hint">no route — those chambers are disconnected.</span>` : `<span class="hint">click <b>⇆ route</b>, then two chambers.</span>`;
}

function rebuild() {
  const key = `${seed}|${rings}|${spacing}`;
  if (key !== geomKey || !cellsModel) { geo = buildGeometry(seed, { rings, spacing }); cellsModel = buildCells(geo); geomKey = key; routeA = routeB = -1; theRoute = routeSet = null; }
  const lines = weaveLines(geo, { flatR }), lay = layWeave(geo, cellsModel, lines, { width });   // cheap: re-runs on width/flatR only
  m = { ...geo, ...lines, flatR: lines.flatR, width, cells: cellsModel.cells, cellsModel, metrics: lay.metrics };
  if (routeA >= 0 && routeB >= 0) recomputeRoute();
  panels();
}

function frame() { if (spin) yaw += 0.0035; draw(); requestAnimationFrame(frame); }

$('width').addEventListener('change', (e) => { width = +e.target.value; rebuild(); });   // on release (flood + K-repair)
$('dens').addEventListener('change', (e) => { spacing = 104 - +e.target.value; rebuild(); });   // right = denser; rebuilds the 3D Voronoi
$('flat').addEventListener('change', (e) => { flatR = (+e.target.value) / 100; rebuild(); });
$('peel').addEventListener('input', (e) => { peel = (+e.target.value) / 100; $('peelV').textContent = `${((1 - peel) * geo.layers).toFixed(1)} decks`; });   // pure view — no rebuild
$('chunks').addEventListener('click', () => { rings = (rings + 1) % 3; rebuild(); });
$('cells').addEventListener('click', () => { showCells = !showCells; $('cells').classList.toggle('on', showCells); });
$('route').addEventListener('click', () => { routeMode = !routeMode; $('route').classList.toggle('on', routeMode); if (!routeMode) { routeA = routeB = -1; theRoute = routeSet = null; } routePanel(); });
$('spin').addEventListener('click', () => { spin = !spin; $('spin').classList.toggle('on', spin); });
$('threads').addEventListener('click', () => { showThreads = !showThreads; $('threads').classList.toggle('on', showThreads); });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; rebuild(); });
$('reset').addEventListener('click', () => { yaw = 0.4; pitch = 0.95; zoom = 1; });
for (const b of $('grpbtns').querySelectorAll('button')) b.addEventListener('click', () => {
  const g = b.dataset.grp; visible.clear();
  if (g === 'all') allThreads.forEach((k) => visible.add(k));
  else if (g === 'whites') whiteKeys.forEach((k) => visible.add(k));
  else if (g === 'ops') prodKeys.forEach((k) => visible.add(k));
  else if (g === 'matrix') { allThreads.forEach((k) => visible.add(k)); visible.add('matrix'); }
  updateChips();
});

let drag = false, lx = 0, ly = 0, moved = 0; const ptrs = new Map(); let pinchD = 0;
cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag = true; lx = e.clientX; ly = e.clientY; moved = 0; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const v = [...ptrs.values()]; pinchD = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); } });
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); if (pinchD) zoom = Math.max(0.5, Math.min(3, zoom * d / pinchD)); pinchD = d; moved += 99; return; }
  if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy); yaw += dx * 0.008; pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.006));
});
cv.addEventListener('pointerup', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; drag = ptrs.size > 0; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
  if (moved > 6 || !routeMode) return;                            // a drag, not a click — or not routing
  const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  let best = -1, bd = 18 * 18; for (const p of pickCells) { const d = (p.X - px) ** 2 + (p.Y - py) ** 2; if (d < bd) { bd = d; best = p.gi; } }
  if (best < 0) return;
  if (routeA < 0 || routeB >= 0) { routeA = best; routeB = -1; theRoute = routeSet = null; } else { routeB = best; recomputeRoute(); }
  routePanel();
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; }
addEventListener('resize', resize);
$('width').value = width; rebuild(); buildChips(); resize(); frame();
