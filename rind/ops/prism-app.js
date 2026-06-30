// prism-app.js — LAY THE WEAVE on the prism, with the three levers (width / nuclei density / chunks) and an
// HONEST live readout. Nodes are coloured by the thread that claims them; un-claimed nodes are the dim
// interstitial matrix; contested nodes (claimed by >1 thread) get a red ring. The breaks block is raw.

import { buildWeave3D } from './weave3d.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 1;
let width = 3, spacing = 30, flatR = 0.16, rings = 1, spin = true, showThreads = true;
let yaw = 0.4, pitch = 0.95, zoom = 1;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let m = buildWeave3D(seed, { rings, spacing, width, flatR });

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244], BG = [6, 7, 12], MATRIX = [40, 48, 64], CONTEST = [255, 70, 70];
const warpCol = (w) => mix(hex(m.warps[w].color), INK, (w % 2) * 0.28);
const prodCol = (f) => hex(m.wefts[f].color);
const ownerColor = (o) => o.kind === 'white' ? warpCol(o.idx) : prodCol(o.idx);

function proj(x, y, z, s) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw); const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch); const y2 = y1 * cp - z * sp, z2 = y1 * sp + z * cp;
  return { X: CW / 2 + x1 * s, Y: CH / 2 - z2 * s, depth: y2 };
}

function draw() {
  const s = Math.min(CW, CH) / (m.R * 2.5) * zoom, zc = m.thickness / 2;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);

  // prism faces: the hexagonal footprint at floor (z=0) and ceiling (z=T), faint
  const faceHex = (z, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); m.footprint.forEach((v, i) => { const p = proj(v[0], v[1], z - zc, s); i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }); ctx.closePath(); ctx.stroke(); };
  faceHex(0, rgba([90, 106, 140], 0.55), 1.4); faceHex(m.thickness, rgba([120, 138, 178], 0.7), 1.4);
  // vertical edges
  ctx.strokeStyle = rgba([70, 84, 112], 0.4); ctx.lineWidth = 1; for (const v of m.footprint) { const a = proj(v[0], v[1], -zc, s), b = proj(v[0], v[1], zc, s); ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke(); }
  // the FLAT CORE radius (inside it: radial sectors, no weave) — a dashed ring at mid-height
  if (m.flatR > 0) { ctx.strokeStyle = rgba([217, 178, 74], 0.6); ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]); ctx.beginPath(); const rr = m.flatR * m.R; for (let k = 0; k <= 48; k++) { const an = k / 48 * Math.PI * 2, p = proj(rr * Math.cos(an), rr * Math.sin(an), 0, s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); } ctx.stroke(); ctx.setLineDash([]); }

  // thread centrelines (the spiral tubes' spines), white above / production below, interlacing
  if (showThreads) {
    const spine = (angFn, zFn, idx, col, a) => { ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); const N = 120; for (let k = 0; k <= N; k++) { const rf = k / N, ang = angFn(idx, rf), rad = rf * m.R, p = proj(rad * Math.cos(ang), rad * Math.sin(ang), zFn(idx, rf) - zc, s); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); } ctx.stroke(); };
    for (let f = 0; f < m.NF; f++) spine(m.aP, m.zP, f, prodCol(f), 0.5);
    for (let w = 0; w < m.NW; w++) spine(m.aW, m.zW, w, warpCol(w), 0.6);
  }

  // the nodes, depth-sorted
  const pts = m.nodes.map((n) => ({ n, p: proj(n.x, n.y, n.z - zc, s) })).sort((a, b) => a.p.depth - b.p.depth);
  for (const { n, p } of pts) {
    const claimed = n.nearest;
    const col = claimed ? mix(ownerColor(claimed), BG, claimed.kind === 'prod' ? 0.18 : 0.05) : MATRIX;
    const sh = 0.55 + 0.45 * (p.depth / m.R + 1) / 2;
    ctx.fillStyle = rgba(col, (claimed ? 0.95 : 0.5) * sh);
    ctx.beginPath(); ctx.arc(p.X, p.Y, (claimed ? 2.8 : 1.6) * Math.max(0.6, sh), 0, 7); ctx.fill();
    if (n.contested) { ctx.strokeStyle = rgba(CONTEST, 0.95); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(p.X, p.Y, 4 * Math.max(0.6, sh), 0, 7); ctx.stroke(); }
  }
}

function panels() {
  const M = m.metrics;
  $('widthV').textContent = width; $('densV').textContent = `${M.nodes} nodes`; $('flatV').textContent = flatR.toFixed(2);
  $('chunks').textContent = `⬡ ${m.chunkCount} chunks`;
  $('levers').innerHTML = `
    <span class="k">path width</span><span class="v">${width} nodes (r=${M.radius.toFixed(0)})</span>
    <span class="k">areal density</span><span class="v">${M.nodes} nodes · a=${spacing}</span>
    <span class="k">flat core radius</span><span class="v">${flatR.toFixed(2)}·R (no weave inside)</span>
    <span class="k">chunks / footprint</span><span class="v">${m.chunkCount} · hexR ${m.hexR | 0}</span>
    <span class="k">prism thickness</span><span class="v">${m.thickness.toFixed(0)} · ${m.layers} layers (pinned)</span>`;
  const pc = (x) => `${(x * 100).toFixed(0)}%`;
  const cls = (bad) => bad ? 'v bad' : 'v ok';
  $('metrics').innerHTML = `
    <span class="k">nodes total</span><span class="v">${M.nodes}</span>
    <span class="k">on a thread (coverage)</span><span class="v">${pc(M.coverage)}</span>
    <span class="k">interstitial matrix</span><span class="v">${pc(M.orphanPct)}</span>
    <span class="k">contested (≥2 threads)</span><span class="${M.contestedPct > 0.5 ? 'v bad' : 'v'}">${pc(M.contestedPct)}</span>
    <span class="k">dead threads</span><span class="${cls(M.deadThreads > 0)}">${M.deadThreads}/14</span>
    <span class="k">K(6,8) crossings</span><span class="${cls(!M.k68)}">${M.k68Pairs}</span>
    <span class="k">tube ⌀ vs thickness</span><span class="${cls(M.tubeVsThickness > 1)}">${M.tubeVsThickness.toFixed(2)}×</span>`;
  $('breaks').innerHTML = M.clean
    ? `<div class="verdict ok">✓ weave intact — every white crosses every production, no thread lost, tubes inside the thickness</div>`
    : `<div class="verdict bad">✗ broken (${M.breaks.length})</div><ul>${M.breaks.map((b) => `<li>${b}</li>`).join('')}</ul>`;
  $('note').innerHTML = `14 threads, each a tube ${width} nodes wide. Inside the <b style="color:#d9b24a">flat core</b> the offices are radial sectors (no weave); all undulation is in the annulus. Thickness is <b>pinned</b> — areal density only changes node count. <b>Un-claimed nodes are interstitial matrix</b> (future walls/corridors), not a failure. Not softened: thin width → crossings miss (K&lt;48); a width wider than the pinned thickness → white &amp; production merge; too few chunks → the cell is too cramped and threads dissolve. seed ${seed}.`;
}

function rebuild() { m = buildWeave3D(seed, { rings, spacing, width, flatR }); panels(); }

let raf = 0; function frame() { if (spin) yaw += 0.0035; draw(); raf = requestAnimationFrame(frame); }

$('width').addEventListener('input', (e) => { width = +e.target.value; rebuild(); });
// the slider reads as DENSITY: right = denser ⇒ smaller spacing. Thickness stays pinned (areal-only lever).
$('dens').addEventListener('input', (e) => { spacing = 104 - +e.target.value; rebuild(); });
$('flat').addEventListener('input', (e) => { flatR = (+e.target.value) / 100; rebuild(); });
$('chunks').addEventListener('click', () => { rings = (rings + 1) % 3; rebuild(); });
$('spin').addEventListener('click', () => { spin = !spin; $('spin').classList.toggle('on', spin); });
$('threads').addEventListener('click', () => { showThreads = !showThreads; $('threads').classList.toggle('on', showThreads); });
$('reseed').addEventListener('click', () => { seed = (seed + 1) >>> 0; rebuild(); });
$('reset').addEventListener('click', () => { yaw = 0.4; pitch = 0.95; zoom = 1; });

let drag = false, lx = 0, ly = 0; const ptrs = new Map(); let pinchD = 0;
cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const v = [...ptrs.values()]; pinchD = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); } });
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); if (pinchD) zoom = Math.max(0.5, Math.min(3, zoom * d / pinchD)); pinchD = d; return; }
  if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; yaw += dx * 0.008; pitch = Math.max(-1.4, Math.min(1.4, pitch + dy * 0.006));
});
cv.addEventListener('pointerup', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; drag = ptrs.size > 0; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.5, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; }
addEventListener('resize', resize);
resize(); panels(); frame();
