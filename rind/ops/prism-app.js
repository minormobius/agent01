// prism-app.js — LAY THE WEAVE on the prism + its VORONOI CHAMBERS. Each prism node becomes a Voronoi cell
// coloured by the thread that claims it. Per-thread visibility (all 14) + group toggles (whites / ops / matrix).
// Wayfinding picks two chambers and routes the path that MINIMISES DOORS CROSSED. Three+ honest levers below.

import { buildWeave3D } from './weave3d.js';
import { buildCells, routeMinDoors, ownerKey } from './cells3d.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let width = 3, spacing = 30, flatR = 0.16, rings = 1, spin = true, showThreads = false, showCells = true, routeMode = false;
let yaw = 0.4, pitch = 0.95, zoom = 1;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let m = buildWeave3D(seed, { rings, spacing, width, flatR });
let cellsModel = null, geomKey = '';
let routeA = -1, routeB = -1, theRoute = null, routeSet = null, pickCells = [];

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], BG = [6, 7, 12], MATRIX = [44, 52, 70], GOLD = [255, 224, 122];
const warpCol = (w) => mix(hex(m.warps[w].color), INK, (w % 2) * 0.28);
const prodCol = (f) => hex(m.wefts[f].color);
const ownerColor = (o) => o ? (o.kind === 'white' ? warpCol(o.idx) : prodCol(o.idx)) : MATRIX;

// the 14 threads + the matrix as toggleable keys
const whiteKeys = m.warps.map((w) => 'w' + w.w), prodKeys = m.wefts.map((f) => 'p' + f.f);
const allThreads = [...whiteKeys, ...prodKeys];
const labelOf = (k) => k === 'matrix' ? 'matrix' : k[0] === 'w' ? m.warps[+k.slice(1)].id : m.wefts[+k.slice(1)].label;
const colorKey = (k) => k === 'matrix' ? MATRIX : k[0] === 'w' ? warpCol(+k.slice(1)) : prodCol(+k.slice(1));
const visible = new Set(allThreads);   // start: 14 threads on, matrix hidden

function proj(x, y, z, s) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw); const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch); const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
  return { X: CW / 2 + x1 * s, Y: CH / 2 - z2 * s, depth: y2 };
}

function ensureCells() {
  const key = `${seed}|${rings}|${spacing}`;
  if (key !== geomKey || !cellsModel) { cellsModel = buildCells(m); geomKey = key; routeA = routeB = -1; theRoute = routeSet = null; }
  else { for (const c of cellsModel.cells) { c.owner = m.nodes[c.nodeIndex].nearest; c.ownerKey = ownerKey(c.owner); } if (routeA >= 0 && routeB >= 0) recomputeRoute(); }
}
function recomputeRoute() { theRoute = (routeA >= 0 && routeB >= 0) ? routeMinDoors(cellsModel, routeA, routeB) : null; routeSet = theRoute ? new Set(theRoute.path) : null; }

function draw() {
  const s = Math.min(CW, CH) / (m.R * 2.5) * zoom, zc = m.thickness / 2;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);

  // prism faces + vertical edges
  const faceHex = (z, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); m.footprint.forEach((v, i) => { const p = proj(v[0], v[1], z - zc, s); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.closePath(); ctx.stroke(); };
  faceHex(0, rgba([90, 106, 140], 0.4), 1.2); faceHex(m.thickness, rgba([120, 138, 178], 0.5), 1.2);
  ctx.strokeStyle = rgba([70, 84, 112], 0.3); ctx.lineWidth = 1; for (const v of m.footprint) { const a = proj(v[0], v[1], -zc, s), b = proj(v[0], v[1], zc, s); ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke(); }
  if (m.flatR > 0) { ctx.strokeStyle = rgba(GOLD, 0.4); ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]); ctx.beginPath(); const rr = m.flatR * m.R; for (let k = 0; k <= 48; k++) { const an = k / 48 * Math.PI * 2, p = proj(rr * Math.cos(an), rr * Math.sin(an), 0, s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); } ctx.stroke(); ctx.setLineDash([]); }

  pickCells = [];
  if (showCells && cellsModel) {
    // depth-sort the VISIBLE chambers (far → near) and fill their Voronoi polygons at their deck height
    const drawn = [];
    for (const c of cellsModel.cells) { if (!visible.has(c.ownerKey)) continue; const pc = proj(c.x, c.y, c.z - zc, s); drawn.push({ c, depth: pc.depth, X: pc.X, Y: pc.Y }); }
    drawn.sort((a, b) => a.depth - b.depth);
    for (const d of drawn) {
      const c = d.c, col = ownerColor(c.owner), sh = 0.5 + 0.5 * (d.depth / m.R + 1) / 2, inRoute = routeSet && routeSet.has(c.gi);
      ctx.beginPath(); c.poly.forEach((v, i) => { const p = proj(v[0], v[1], c.z - zc, s); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.closePath();
      ctx.fillStyle = rgba(mix(col, BG, c.owner ? 0.12 : 0.5), (inRoute ? 0.96 : 0.66) * sh); ctx.fill();
      ctx.strokeStyle = rgba(mix(col, BG, 0.55), 0.5 * sh); ctx.lineWidth = 0.6; ctx.stroke();
      if (inRoute) { ctx.strokeStyle = rgba(GOLD, 0.95); ctx.lineWidth = 1.6; ctx.stroke(); }
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
  $('chunks').textContent = `⬡ ${m.chunkCount} chunks`;
  $('levers').innerHTML = `
    <span class="k">path width</span><span class="v">${width} nodes (r=${M.radius.toFixed(0)})</span>
    <span class="k">areal density</span><span class="v">${M.nodes} chambers · a=${spacing}</span>
    <span class="k">flat core radius</span><span class="v">${flatR.toFixed(2)}·R (no weave inside)</span>
    <span class="k">chunks / footprint</span><span class="v">${m.chunkCount} · hexR ${m.hexR | 0}</span>
    <span class="k">prism thickness</span><span class="v">${m.thickness.toFixed(0)} · ${m.layers} layers (pinned)</span>`;
  const pc = (x) => `${(x * 100).toFixed(0)}%`, cls = (bad) => bad ? 'v bad' : 'v ok';
  $('metrics').innerHTML = `
    <span class="k">chambers</span><span class="v">${M.nodes}</span>
    <span class="k">on a thread (coverage)</span><span class="v">${pc(M.coverage)}</span>
    <span class="k">interstitial matrix</span><span class="v">${pc(M.orphanPct)}</span>
    <span class="k">contested (≥2 threads)</span><span class="${M.contestedPct > 0.5 ? 'v bad' : 'v'}">${pc(M.contestedPct)}</span>
    <span class="k">dead threads</span><span class="${cls(M.deadThreads > 0)}">${M.deadThreads}/14</span>
    <span class="k">K(6,8) crossings</span><span class="${cls(!M.k68)}">${M.k68Pairs}</span>
    <span class="k">tube ⌀ vs thickness</span><span class="${cls(M.tubeVsThickness > 1)}">${M.tubeVsThickness.toFixed(2)}×</span>`;
  $('breaks').innerHTML = M.clean
    ? `<div class="verdict ok">✓ weave intact — every white crosses every production, no thread lost, tubes inside the thickness</div>`
    : `<div class="verdict bad">✗ broken (${M.breaks.length})</div><ul>${M.breaks.map((b) => `<li>${b}</li>`).join('')}</ul>`;
  routePanel();
  $('note').innerHTML = `Each prism node is a <b>Voronoi chamber</b> coloured by the thread that claims it (un-claimed = matrix). Toggle any of the 14, or the groups. <b>⇆ route</b>: click a <b style="color:#6ecf8a">start</b> chamber then an <b style="color:#e678c8">end</b> — the gold path crosses the <b>fewest doors</b> (BFS in the chamber graph: in-deck shared walls + deck-to-deck adjacency). seed ${seed}.`;
}
function routePanel() {
  if (!routeMode && routeA < 0) { $('routeRead').innerHTML = `<span class="hint">click <b>⇆ route</b>, then two chambers.</span>`; return; }
  if (routeA >= 0 && routeB < 0) { $('routeRead').innerHTML = `<span class="hint">start set — click the <b style="color:#e678c8">end</b> chamber.</span>`; return; }
  if (theRoute) { $('routeRead').innerHTML = `<span class="big">${theRoute.doors}</span> doors crossed<br><span class="sub">${theRoute.path.length} chambers · ${theRoute.threadChanges} thread changes · the door-minimal path</span>`; return; }
  $('routeRead').innerHTML = routeA >= 0 && routeB >= 0 ? `<span class="hint">no route — those chambers are disconnected.</span>` : `<span class="hint">click <b>⇆ route</b>, then two chambers.</span>`;
}

function rebuild() { m = buildWeave3D(seed, { rings, spacing, width, flatR }); ensureCells(); panels(); }

function frame() { if (spin) yaw += 0.0035; draw(); requestAnimationFrame(frame); }

$('width').addEventListener('input', (e) => { width = +e.target.value; rebuild(); });
$('dens').addEventListener('input', (e) => { spacing = 104 - +e.target.value; rebuild(); });   // right = denser
$('flat').addEventListener('input', (e) => { flatR = (+e.target.value) / 100; rebuild(); });
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
ensureCells(); buildChips(); resize(); panels(); frame();
