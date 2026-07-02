// tessweave-app.js — the tessellating weave, drawn along the threads' TRUE paths. Renders the real
// single-hex Voronoi weave (curveseed.js, 14 threads), honeycombs it by translation, and traces each
// white's actual owned-cell corridor (tessweave.truePath) hub → rim — jagged where the analytic
// "desire" spiral (threadCurve) is smooth. Same-family exits sit adjacent across each seam, so a
// BRIDGE joins them, threading every family continuously through the web. Top-down 2D, pan/zoom.

import { buildCurveModel } from './curveseed.js';
import { solveTessellation, truePath, threadCurve, neighbourOffset, edgeNormalAng } from './tessweave.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
const OPTS = { rings: 1, layers: 8, flatR: 0.35, pitch: 28, width: 6, NW: 6, NF: 8, turnScale: 0.35 };

let showTiles = true, pathTrue = true, bridges = true, showIface = false, traceFam = -1, color14 = true;
let panX = 0, panY = 0, zoom = 1;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let m = null, sol = null, whiteFam = null;

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244];
const FAM = [[120, 210, 140], [96, 160, 236], [230, 132, 172]];   // 3 warp families
const whiteCol = (w) => mix(hex(m.warps[w].color), INK, 0.35 + (w % 2) * 0.12);
const prodCol = (f) => hex(m.wefts[f].color);
function cellColor(c) {
  const a = c.owner;
  if (!a) return [58, 66, 86];
  if (!color14) return a.kind === 'white' ? [222, 228, 242] : [80, 150, 210];
  return a.kind === 'white' ? whiteCol(a.idx) : prodCol(a.idx);
}

function rebuild() {
  m = buildCurveModel(seed, OPTS);
  sol = solveTessellation(m);
  whiteFam = new Array(m.NW).fill(0);
  sol.warp.axes.forEach((ax, i) => ax.whites.forEach((w) => { if (w != null) whiteFam[w] = i; }));
  draw();
}

function tf() { const s = Math.min(CW, CH) / (m.R * 2 * 1.7) * zoom; return { s, ox: CW / 2 + panX, oy: CH / 2 + panY }; }
const W2S = (x, y, T) => ({ X: T.ox + x * T.s, Y: T.oy - y * T.s });

// centre + 6 neighbours, placed by pure translation (no reorientation — you preferred no flip)
function tiles() {
  const list = [{ cx: 0, cy: 0, k: -1 }];
  if (showTiles) for (let k = 0; k < 6; k++) { const o = neighbourOffset(k, m.R); list.push({ cx: o[0], cy: o[1], k }); }
  return list;
}
const tileWorld = (tile, px, py) => [px + tile.cx, py + tile.cy];

function drawHex(tile, T, col, lw, fill) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = 60 * k * Math.PI / 180; const w = tileWorld(tile, m.R * Math.cos(a), m.R * Math.sin(a)); const p = W2S(w[0], w[1], T); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
}

function drawCells(tile, T, alpha) {
  const r = Math.max(1.3, m.pitch * 0.42 * T.s);
  for (const c of m.cells) {
    const w = tileWorld(tile, c.x, c.y), p = W2S(w[0], w[1], T);
    ctx.beginPath(); ctx.arc(p.X, p.Y, c.owner ? r : r * 0.7, 0, 7);
    ctx.fillStyle = rgba(cellColor(c), (c.owner ? 0.9 : 0.28) * alpha); ctx.fill();
  }
}

// draw a white thread's path (true corridor or desire spiral, base pts) reoriented onto a tile
function drawPath(basePts, tile, T, col, lw, alpha) {
  const pts = basePts.map(([x, y]) => { const q = tileWorld(tile, x, y); return W2S(q[0], q[1], T); });
  if (pts.length < 2) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y));
  ctx.strokeStyle = rgba([4, 6, 10], 0.7 * alpha); ctx.lineWidth = lw + 3; ctx.stroke();
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y));
  ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = lw; ctx.stroke();
  const e = pts[pts.length - 1], h = pts[0];
  ctx.beginPath(); ctx.arc(e.X, e.Y, lw * 1.25, 0, 7); ctx.fillStyle = rgba(col, alpha); ctx.strokeStyle = rgba([4, 6, 10], 0.8 * alpha); ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(h.X, h.Y, lw * 0.9, 0, 7); ctx.fillStyle = rgba(mix(col, INK, 0.4), alpha * 0.9); ctx.fill();
}

// a bridge across a seam: join the centre exit to the nearest neighbour exit (same family), bowed
function drawBridge(Pc, Pn, col, T, active) {
  const A = W2S(Pc[0], Pc[1], T), B = W2S(Pn[0], Pn[1], T);
  const dx = B.X - A.X, dy = B.Y - A.Y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, bow = Math.min(16, L * 0.28);
  const cx = (A.X + B.X) / 2 + nx * bow, cy = (A.Y + B.Y) / 2 + ny * bow;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(A.X, A.Y); ctx.quadraticCurveTo(cx, cy, B.X, B.Y);
  ctx.strokeStyle = rgba([4, 6, 10], active ? 0.7 : 0.3); ctx.lineWidth = active ? 5.5 : 3.5; ctx.stroke();
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(A.X, A.Y); ctx.quadraticCurveTo(cx, cy, B.X, B.Y);
  ctx.strokeStyle = rgba(col, active ? 0.98 : 0.4); ctx.lineWidth = active ? 3 : 2; ctx.stroke();
  ctx.setLineDash([]);
}

function edgePoint(k, t) {
  const a = edgeNormalAng(k), Ri = m.R * Math.sqrt(3) / 2, nx = Math.cos(a), ny = Math.sin(a), tx = -Math.sin(a), ty = Math.cos(a);
  return [Ri * nx + tx * t * (m.R / 2), Ri * ny + ty * t * (m.R / 2)];
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const T = tf(), TS = tiles();

  for (const tile of TS) {
    const isC = tile.k === -1;
    drawHex(tile, T, rgba([90, 106, 140], isC ? 0.55 : 0.28), isC ? 1.6 : 1.1, rgba([10, 12, 18], isC ? 0.0 : 0.35));
    drawCells(tile, T, (isC ? 1 : 0.42) * 0.6);
  }
  ctx.fillStyle = 'rgba(6,7,12,0.32)'; ctx.fillRect(0, 0, CW, CH);

  // base white paths (once), then draw on every tile
  const base = []; for (let w = 0; w < m.NW; w++) base[w] = pathTrue ? truePath(m, 'white', w) : threadCurve(m, 'white', w);
  const exitOf = (tile, w) => { const p = base[w][base[w].length - 1]; return tileWorld(tile, p[0], p[1]); };

  for (const tile of TS) {
    const isC = tile.k === -1;
    for (let w = 0; w < m.NW; w++) {
      const fam = whiteFam[w], traced = traceFam < 0 || traceFam === fam, col = FAM[fam];
      drawPath(base[w], tile, T, col, traced ? (isC ? 3.2 : 2.6) : 1.3, traced ? (isC ? 1 : 0.82) : 0.15);
    }
  }

  // ── bridges: join each centre seam-exit to the nearest neighbour exit (like with like) ──
  if (bridges && showTiles) {
    const centre = TS[0];
    for (const tile of TS) {
      if (tile.k < 0) continue;
      const owner = sol.interfaces.warp.perEdge[tile.k]; if (!owner) continue;
      const fam = whiteFam[owner.idx], Pc = exitOf(centre, owner.idx);
      let bw = -1, bd = Infinity; for (let w = 0; w < m.NW; w++) { const Pn = exitOf(tile, w); const d = Math.hypot(Pc[0] - Pn[0], Pc[1] - Pn[1]); if (d < bd) { bd = d; bw = w; } }
      drawBridge(Pc, exitOf(tile, bw), FAM[fam], T, traceFam < 0 || traceFam === fam);
    }
  }

  if (showIface) {
    for (const e of sol.interfaces.perEdge) for (const p of e.pairs) {
      const ep = edgePoint(e.k, p.a.t), P = W2S(ep[0], ep[1], T);
      if (p.kind === 'door') {
        ctx.beginPath(); ctx.arc(P.X, P.Y, 7, 0, 7); ctx.fillStyle = 'rgba(4,6,10,0.85)'; ctx.fill();
        ctx.beginPath(); const r = 5; ctx.moveTo(P.X, P.Y - r); ctx.lineTo(P.X + r, P.Y); ctx.lineTo(P.X, P.Y + r); ctx.lineTo(P.X - r, P.Y); ctx.closePath();
        ctx.fillStyle = rgba([235, 198, 92], 0.98); ctx.fill(); ctx.strokeStyle = rgba([90, 70, 20], 0.95); ctx.lineWidth = 1.1; ctx.stroke();
      } else {
        const a = edgeNormalAng(e.k), tx = -Math.sin(a), ty = Math.cos(a), L = 7 / T.s;
        const q1 = W2S(ep[0] - tx * L, ep[1] - ty * L, T), q2 = W2S(ep[0] + tx * L, ep[1] + ty * L, T);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(q1.X, q1.Y); ctx.lineTo(q2.X, q2.Y); ctx.strokeStyle = 'rgba(4,6,10,0.8)'; ctx.lineWidth = 6; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(q1.X, q1.Y); ctx.lineTo(q2.X, q2.Y); ctx.strokeStyle = rgba([120, 216, 146], 0.98); ctx.lineWidth = 3.4; ctx.stroke();
      }
    }
  }

  readout();
}

function readout() {
  const c = sol.interfaces.census;
  const fam = sol.warp.axes.map((a, i) => `<span style="color:rgb(${FAM[i].join(',')})">●</span>W${a.whites[0]}·W${a.whites[1]}`).join('  ');
  $('read').innerHTML =
    `seed <b>${seed}</b> · <b>14</b> threads · warp: ${fam} &nbsp;|&nbsp; ` +
    `<b>${pathTrue ? 'true paths' : 'desire spirals'}</b> — ${pathTrue ? 'actual Voronoi corridors, hub→rim' : 'the analytic seeding curves'}` +
    (bridges ? ` · <span class="ok">bridges on</span> (families joined across seams)` : '');
  const bij = sol.interfaces.warp.perEdge.filter(Boolean).length;
  const row = (label, val, good) => `<div class="row"><span>${label}</span><span class="v ${good == null ? '' : good ? 'pass' : 'warn'}">${val}</span></div>`;
  $('cert').innerHTML =
    row('white bijection', `${bij}/6 edges`, bij === 6) +
    row('warp families', `${sol.warp.families} (ring + 2 helices)`, sol.warp.families === 3) +
    row('all 6 whites', sol.warp.allCovered ? 'covered' : 'gap', sol.warp.allCovered) +
    row('path shown', pathTrue ? 'true (Voronoi corridor)' : 'desire (analytic spiral)', null) +
    row('bridges', bridges ? 'families joined' : 'off', null) +
    row('same-kind continuity', `${c.sameKind}`, c.sameKind > 0) +
    row('cross-kind K-doors', `${c.crossKind}`, c.hasKDoors);
}

// ── interaction ──
function resize() { DPR = Math.min(2, devicePixelRatio || 1); const r = cv.getBoundingClientRect(); CW = r.width; CH = r.height; cv.width = CW * DPR; cv.height = CH * DPR; if (m) draw(); }
addEventListener('resize', resize);
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; panX += e.clientX - lx; panY += e.clientY - ly; lx = e.clientX; ly = e.clientY; draw(); });
cv.addEventListener('pointerup', () => { drag = false; cv.classList.remove('drag'); });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0011); zoom = Math.max(0.3, Math.min(6, zoom * f)); draw(); }, { passive: false });

const toggle = (id, get, set) => $(id).addEventListener('click', () => { set(!get()); $(id).classList.toggle('on', get()); draw(); });
toggle('tiles', () => showTiles, (v) => showTiles = v);
toggle('bridges', () => bridges, (v) => bridges = v);
toggle('iface', () => showIface, (v) => showIface = v);
toggle('color', () => color14, (v) => color14 = v);
$('pathmode').addEventListener('click', () => { pathTrue = !pathTrue; $('pathmode').classList.toggle('on', pathTrue); $('pathmode').textContent = pathTrue ? 'true paths' : 'desire spirals'; draw(); });
$('trace').addEventListener('click', () => { traceFam = (traceFam + 2) % 4 - 1; $('trace').classList.toggle('on', traceFam >= 0); $('trace').textContent = traceFam < 0 ? 'trace a family' : `family ${traceFam + 1}/3`; draw(); });
$('seedUp').addEventListener('click', () => { seed = (seed + 1) >>> 0; rebuild(); });
$('seedDn').addEventListener('click', () => { seed = (seed - 1) >>> 0; rebuild(); });

resize();
rebuild();
