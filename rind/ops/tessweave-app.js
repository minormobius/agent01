// tessweave-app.js — the tessellating weave over a MANY-CHUNK patch. Renders the real single-hex
// Voronoi weave (curveseed.js, 14 threads), honeycombs it across an N-ring patch, and lets you test
// the 3-colouring / phase-rotation idea: the hex centres form a triangular lattice, 3-colourable
// (colour = (i−j) mod 3); rotating one phase by a fixed 60° uses rotations (not reflections) which
// compose consistently around a vertex. Corners where three chunks meet are the new NEXUS points.
// Threads drawn along their TRUE Voronoi corridors; bridges join like-with-like across seams.

import { buildCurveModel } from './curveseed.js';
import { solveTessellation, truePath, threadCurve, hexSym, hexPatch, patchSeams, patchMismatch, neighbourOffset } from './tessweave.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
const OPTS = { rings: 1, layers: 8, flatR: 0.35, pitch: 28, width: 6, NW: 6, NF: 8, turnScale: 0.35 };

// phase-rotation schemes (per-colour rotation, units of 60°). CW 60° = 5.
const SCHEMES = [
  { rot: [0, 0, 0], label: 'phase: off' },
  { rot: [5, 0, 0], label: 'phase: CW60 dispersed (yours)' },
  { rot: [0, 2, 1], label: 'phase: pinwheel (min)' },
];
let schemeIdx = 0, rings = 2, pathTrue = true, bridges = true, showCells = false, showColor = true, showNexus = true, traceFam = -1, color14 = true;
let panX = 0, panY = 0, zoom = 0.62;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let m = null, sol = null, whiteFam = null, patch = null, ownedCells = null, metrics = null;

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244];
const FAM = [[120, 210, 140], [96, 160, 236], [230, 132, 172]];        // 3 warp families
const PHASE = [[210, 150, 70], [70, 150, 210], [150, 110, 210]];        // 3 lattice colours (tint)
const whiteCol = (w) => mix(hex(m.warps[w].color), INK, 0.35 + (w % 2) * 0.12);
const prodCol = (f) => hex(m.wefts[f].color);
function cellColor(c) {
  const a = c.owner;
  if (!a) return [58, 66, 86];
  if (!color14) return a.kind === 'white' ? [222, 228, 242] : [80, 150, 210];
  return a.kind === 'white' ? whiteCol(a.idx) : prodCol(a.idx);
}
const scheme = () => SCHEMES[schemeIdx];

function rebuild() {
  m = buildCurveModel(seed, OPTS);
  sol = solveTessellation(m);
  whiteFam = new Array(m.NW).fill(0);
  sol.warp.axes.forEach((ax, i) => ax.whites.forEach((w) => { if (w != null) whiteFam[w] = i; }));
  ownedCells = m.cells.filter((c) => c.owner);
  patch = hexPatch(m.R, rings);
  metrics = {
    cur: patchMismatch(m, patch, scheme().rot),
    id: patchMismatch(m, patch, [0, 0, 0]),
    white: patchMismatch(m, patch, scheme().rot, { kind: 'white' }),
  };
  draw();
}

function tf() { const s = Math.min(CW, CH) / (m.R * 2 * 1.7) * zoom; return { s, ox: CW / 2 + panX, oy: CH / 2 + panY }; }
const W2S = (x, y, T) => ({ X: T.ox + x * T.s, Y: T.oy - y * T.s });

// placements: every chunk in the patch, rotated by its phase
function placements() { const r = scheme().rot; return patch.map((p) => ({ ...p, rot: r[p.color] | 0 })); }
const tileWorld = (tile, px, py) => { const q = hexSym([px, py], tile.rot || 0, 0); return [q[0] + tile.cx, q[1] + tile.cy]; };
// hex outline is rotation-invariant (60° maps it to itself) — draw at the chunk centre, no rotation
function drawHex(tile, T, col, lw, fill) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = 60 * k * Math.PI / 180; const p = W2S(tile.cx + m.R * Math.cos(a), tile.cy + m.R * Math.sin(a), T); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
}
function drawCells(tile, T, alpha) {
  const r = Math.max(1.1, m.pitch * 0.42 * T.s);
  for (const c of ownedCells) { const w = tileWorld(tile, c.x, c.y), p = W2S(w[0], w[1], T); ctx.beginPath(); ctx.arc(p.X, p.Y, r, 0, 7); ctx.fillStyle = rgba(cellColor(c), 0.85 * alpha); ctx.fill(); }
}
function drawPath(basePts, tile, T, col, lw, alpha) {
  const pts = basePts.map(([x, y]) => { const q = tileWorld(tile, x, y); return W2S(q[0], q[1], T); });
  if (pts.length < 2) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y));
  ctx.strokeStyle = rgba([4, 6, 10], 0.65 * alpha); ctx.lineWidth = lw + 2.5; ctx.stroke();
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y));
  ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = lw; ctx.stroke();
  const e = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(e.X, e.Y, lw * 1.1, 0, 7); ctx.fillStyle = rgba(col, alpha); ctx.fill();
}
function drawBridge(Pc, Pn, col, T, active) {
  const A = W2S(Pc[0], Pc[1], T), B = W2S(Pn[0], Pn[1], T);
  const dx = B.X - A.X, dy = B.Y - A.Y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, bow = Math.min(14, L * 0.3);
  const cx = (A.X + B.X) / 2 + nx * bow, cy = (A.Y + B.Y) / 2 + ny * bow;
  ctx.setLineDash([2, 4]); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(A.X, A.Y); ctx.quadraticCurveTo(cx, cy, B.X, B.Y);
  ctx.strokeStyle = rgba(col, active ? 0.95 : 0.4); ctx.lineWidth = active ? 2.6 : 1.6; ctx.stroke(); ctx.setLineDash([]);
}

// interior vertices (corners shared by 3 chunks) = the new nexus points
function nexusPoints() {
  const bucket = new Map();
  for (const p of patch) for (let k = 0; k < 6; k++) { const a = 60 * k * Math.PI / 180; const x = p.cx + m.R * Math.cos(a), y = p.cy + m.R * Math.sin(a); const key = `${Math.round(x / 4)},${Math.round(y / 4)}`; const b = bucket.get(key) || { x, y, n: 0 }; b.n++; bucket.set(key, b); }
  return [...bucket.values()].filter((b) => b.n >= 3);
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const T = tf(), PL = placements();

  // chunk fills (phase-tinted) + outlines
  for (const tile of PL) {
    const fill = showColor ? rgba(PHASE[tile.color], tile.rot ? 0.16 : 0.07) : rgba([10, 12, 18], 0.3);
    drawHex(tile, T, rgba([90, 106, 140], tile.dist === 0 ? 0.6 : 0.3), tile.dist === 0 ? 1.5 : 1, fill);
  }
  if (showCells) for (const tile of PL) drawCells(tile, T, tile.dist === 0 ? 1 : 0.5);

  // base white paths (once) → drawn on every chunk under its rotation
  const base = []; for (let w = 0; w < m.NW; w++) base[w] = pathTrue ? truePath(m, 'white', w) : threadCurve(m, 'white', w);
  const exitOf = (tile, w) => { const p = base[w][base[w].length - 1]; return tileWorld(tile, p[0], p[1]); };

  for (const tile of PL) for (let w = 0; w < m.NW; w++) {
    const fam = whiteFam[w], traced = traceFam < 0 || traceFam === fam;
    drawPath(base[w], tile, T, FAM[fam], traced ? (tile.dist === 0 ? 2.8 : 2.2) : 1.1, traced ? (tile.dist === 0 ? 1 : 0.78) : 0.12);
  }

  // bridges across EVERY internal seam: each white exit on the seam → nearest neighbour white exit
  if (bridges) {
    const at = new Map(PL.map((p) => [`${p.i},${p.j}`, p]));
    for (const [A0, B0] of patchSeams(PL)) {
      const A = at.get(`${A0.i},${A0.j}`), B = at.get(`${B0.i},${B0.j}`);
      const M = [(A.cx + B.cx) / 2, (A.cy + B.cy) / 2];
      const near = (tile) => { let best = null, bd = Infinity; for (let w = 0; w < m.NW; w++) { const e = exitOf(tile, w); const d = Math.hypot(e[0] - M[0], e[1] - M[1]); if (d < bd) { bd = d; best = { w, e }; } } return best; };
      const a = near(A), b = near(B);
      const fam = whiteFam[a.w];
      drawBridge(a.e, b.e, FAM[fam], T, traceFam < 0 || traceFam === fam);
    }
  }

  // nexus corners
  if (showNexus) for (const v of nexusPoints()) { const p = W2S(v.x, v.y, T); ctx.beginPath(); ctx.arc(p.X, p.Y, 4.5, 0, 7); ctx.fillStyle = 'rgba(6,7,12,0.85)'; ctx.fill(); ctx.beginPath(); ctx.arc(p.X, p.Y, 4.5, 0, 7); ctx.strokeStyle = rgba([230, 200, 110], 0.9); ctx.lineWidth = 1.6; ctx.stroke(); }

  readout();
}

function readout() {
  const fam = sol.warp.axes.map((a, i) => `<span style="color:rgb(${FAM[i].join(',')})">●</span>`).join('');
  $('read').innerHTML =
    `seed <b>${seed}</b> · <b>${patch.length}</b> chunks (${rings}-ring) · ${fam} 3 families &nbsp;|&nbsp; ` +
    `<b>${scheme().label}</b> &nbsp;|&nbsp; seam mismatch <b>${metrics.cur.mean.toFixed(0)}</b> ` +
    `(identity ${metrics.id.mean.toFixed(0)}) · white-only <b>${metrics.white.mean.toFixed(0)}</b>`;
  const row = (label, val, good) => `<div class="row"><span>${label}</span><span class="v ${good == null ? '' : good ? 'pass' : 'warn'}">${val}</span></div>`;
  const improved = metrics.cur.mean < metrics.id.mean - 0.5;
  $('cert').innerHTML =
    row('patch', `${patch.length} chunks · ${rings}-ring`, null) +
    row('3-colouring', `${[0, 1, 2].map((c) => patch.filter((p) => p.color === c).length).join(' / ')}`, null) +
    row('phase rotation', scheme().rot.map((r) => r * 60 + '°').join(' / '), null) +
    row('seam mismatch', `${metrics.cur.mean.toFixed(0)} vs ${metrics.id.mean.toFixed(0)} id`, improved) +
    row('white-only (C6)', `${metrics.white.mean.toFixed(0)} — rotation-invariant`, null) +
    row('clean seams', `${metrics.cur.clean}/${metrics.cur.seams}`, metrics.cur.clean > 0) +
    row('nexus corners', `${nexusPoints().length}`, null);
}

// ── interaction ──
function resize() { DPR = Math.min(2, devicePixelRatio || 1); const r = cv.getBoundingClientRect(); CW = r.width; CH = r.height; cv.width = CW * DPR; cv.height = CH * DPR; if (m) draw(); }
addEventListener('resize', resize);
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; panX += e.clientX - lx; panY += e.clientY - ly; lx = e.clientX; ly = e.clientY; draw(); });
cv.addEventListener('pointerup', () => { drag = false; cv.classList.remove('drag'); });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0011); zoom = Math.max(0.2, Math.min(6, zoom * f)); draw(); }, { passive: false });

const toggle = (id, get, set) => $(id).addEventListener('click', () => { set(!get()); $(id).classList.toggle('on', get()); draw(); });
toggle('bridges', () => bridges, (v) => bridges = v);
toggle('cells', () => showCells, (v) => showCells = v);
toggle('phasecol', () => showColor, (v) => showColor = v);
toggle('nexus', () => showNexus, (v) => showNexus = v);
$('pathmode').addEventListener('click', () => { pathTrue = !pathTrue; $('pathmode').classList.toggle('on', pathTrue); $('pathmode').textContent = pathTrue ? 'true paths' : 'desire spirals'; draw(); });
$('phase').addEventListener('click', () => { schemeIdx = (schemeIdx + 1) % SCHEMES.length; $('phase').classList.toggle('on', schemeIdx > 0); $('phase').textContent = scheme().label; rebuild(); });
$('rings').addEventListener('click', () => { rings = rings >= 3 ? 1 : rings + 1; showCells = rings <= 1; $('cells').classList.toggle('on', showCells); $('rings').textContent = `${rings}-ring`; rebuild(); });
$('trace').addEventListener('click', () => { traceFam = (traceFam + 2) % 4 - 1; $('trace').classList.toggle('on', traceFam >= 0); $('trace').textContent = traceFam < 0 ? 'trace a family' : `family ${traceFam + 1}/3`; draw(); });
$('seedUp').addEventListener('click', () => { seed = (seed + 1) >>> 0; rebuild(); });
$('seedDn').addEventListener('click', () => { seed = (seed - 1) >>> 0; rebuild(); });

resize();
rebuild();
