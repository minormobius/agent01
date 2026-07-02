// tessweave-app.js — the tessellating weave, SOLVED. Renders the real single-hex Voronoi weave
// (curveseed.js, 14 threads), honeycombs it, and draws the thread-to-thread interfaces solved by
// tessweave.js: the 6 whites resolve into 3 global warp families (continuity), and production
// forms cross-kind K-doors across every seam. Top-down 2D, pan/zoom.

import { buildCurveModel } from './curveseed.js';
import { solveTessellation, neighbourOffset, edgeNormalAng } from './tessweave.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
let seed = Q.has('seed') ? (Q.get('seed') | 0) >>> 0 : 7;
const OPTS = { rings: 1, layers: 8, flatR: 0.35, pitch: 28, width: 6, NW: 6, NF: 8, turnScale: 0.35 };

let showTiles = true, showWarp = true, showIface = true, traceFam = -1, color14 = true;
let panX = 0, panY = 0, zoom = 1;

const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
let m = null, sol = null;

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const INK = [232, 236, 244];
// 3 warp-family colours (ring + 2 helices) — echo helix.html: green ring, blue + rose helices
const FAM = [[110, 200, 130], [96, 156, 232], [226, 128, 168]];
const whiteCol = (w) => mix(hex(m.warps[w].color), INK, 0.35 + (w % 2) * 0.12);   // brighten whites
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
  draw();
}

// world → screen. Central hex fits ~62% of the min dimension; +pan/zoom.
function tf() {
  const s = Math.min(CW, CH) / (m.R * 2 * 1.7) * zoom;
  return { s, ox: CW / 2 + panX, oy: CH / 2 + panY };
}
const W2S = (x, y, T) => ({ X: T.ox + x * T.s, Y: T.oy - y * T.s });

// tile offsets: centre + 6 neighbours (honeycomb)
function tileOffsets() {
  const offs = [[0, 0, -1]];
  if (showTiles) for (let k = 0; k < 6; k++) { const o = neighbourOffset(k, m.R); offs.push([o[0], o[1], k]); }
  return offs;
}

function drawHex(cx, cy, T, col, lw, fill) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = 60 * k * Math.PI / 180; const p = W2S(cx + m.R * Math.cos(a), cy + m.R * Math.sin(a), T); k ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y); }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
}

function drawCells(cx, cy, T, alpha) {
  const r = Math.max(1.4, m.pitch * 0.42 * T.s);
  for (const c of m.cells) {
    const col = cellColor(c);
    const p = W2S(cx + c.x, cy + c.y, T);
    ctx.beginPath(); ctx.arc(p.X, p.Y, c.owner ? r : r * 0.7, 0, 7);
    ctx.fillStyle = rgba(col, (c.owner ? 0.92 : 0.30) * alpha); ctx.fill();
  }
}

// a point on edge k at along-edge parameter t∈[-1,1], relative to a hex centred at (cx,cy)
function edgePoint(cx, cy, k, t) {
  const a = edgeNormalAng(k), Ri = m.R * Math.sqrt(3) / 2;
  const nx = Math.cos(a), ny = Math.sin(a), tx = -Math.sin(a), ty = Math.cos(a);
  const bx = Ri * nx, by = Ri * ny;               // edge midpoint
  return [cx + bx + tx * t * (m.R / 2), cy + by + ty * t * (m.R / 2)];
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  const T = tf();
  const offs = tileOffsets();

  // neighbour tiles first (dim), then centre. When any overlay is on, dim the cells so it reads.
  const overlayOn = showWarp || showIface;
  for (const [ox, oy, k] of offs) {
    const isCentre = (k === -1);
    drawHex(ox, oy, T, rgba([90, 106, 140], isCentre ? 0.55 : 0.28), isCentre ? 1.6 : 1.1, rgba([10, 12, 18], isCentre ? 0.0 : 0.35));
    drawCells(ox, oy, T, (isCentre ? 1 : 0.42) * (overlayOn ? 0.62 : 1));
  }
  if (overlayOn) { ctx.fillStyle = 'rgba(6,7,12,0.30)'; ctx.fillRect(0, 0, CW, CH); }

  // ── warp families: the 3 global strands, drawn as chords through the tiling ──
  if (showWarp) {
    for (let fam = 0; fam < 3; fam++) {
      if (traceFam >= 0 && traceFam !== fam) continue;
      const ax = sol.warp.axes[fam];              // { edges:[k,k+3], whites:[wa,wb] }
      const col = FAM[fam], lw = (traceFam === fam ? 4 : 2.4);
      // the family runs in direction of edge ax.edges[0]; draw a strand centre→edge in each tile it touches
      for (const [ox, oy, tk] of offs) {
        for (const k of ax.edges) {
          const w = sol.interfaces.warp.perEdge[k]; if (!w) continue;
          const ep = edgePoint(ox, oy, k, w.t);
          const a = W2S(ox, oy, T), b = W2S(ep[0], ep[1], T);
          // dark backing then colour, so the strand reads over the dense weave
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y);
          ctx.strokeStyle = rgba([4, 6, 10], tk === -1 ? 0.85 : 0.5); ctx.lineWidth = lw + 3; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y);
          ctx.strokeStyle = rgba(col, tk === -1 ? 0.95 : 0.5); ctx.lineWidth = lw; ctx.stroke();
          // node dot at the rim exit
          ctx.beginPath(); ctx.arc(b.X, b.Y, lw * 1.4, 0, 7); ctx.fillStyle = rgba(col, tk === -1 ? 1 : 0.6); ctx.strokeStyle = rgba([4, 6, 10], 0.8); ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  // ── interfaces at the centre tile's 6 seams: doors (cross-kind) + continuity ticks (same) ──
  if (showIface) {
    for (const e of sol.interfaces.perEdge) {
      for (const p of e.pairs) {
        const ep = edgePoint(0, 0, e.k, p.a.t);
        const P = W2S(ep[0], ep[1], T);
        if (p.kind === 'door') {
          // K-door glyph: gold diamond on a dark disc
          ctx.beginPath(); ctx.arc(P.X, P.Y, 7.5, 0, 7); ctx.fillStyle = 'rgba(4,6,10,0.85)'; ctx.fill();
          ctx.beginPath();
          const r = 5.4; ctx.moveTo(P.X, P.Y - r); ctx.lineTo(P.X + r, P.Y); ctx.lineTo(P.X, P.Y + r); ctx.lineTo(P.X - r, P.Y); ctx.closePath();
          ctx.fillStyle = rgba([235, 198, 92], 0.98); ctx.fill();
          ctx.strokeStyle = rgba([90, 70, 20], 0.95); ctx.lineWidth = 1.2; ctx.stroke();
        } else {
          // continuity tick: green bar along the edge, dark backed
          const a = edgeNormalAng(e.k), tx = -Math.sin(a), ty = Math.cos(a), L = 7 / T.s;
          const q1 = W2S(ep[0] - tx * L, ep[1] - ty * L, T), q2 = W2S(ep[0] + tx * L, ep[1] + ty * L, T);
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(q1.X, q1.Y); ctx.lineTo(q2.X, q2.Y); ctx.strokeStyle = 'rgba(4,6,10,0.8)'; ctx.lineWidth = 6.5; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(q1.X, q1.Y); ctx.lineTo(q2.X, q2.Y); ctx.strokeStyle = rgba([120, 216, 146], 0.98); ctx.lineWidth = 3.5; ctx.stroke();
        }
      }
    }
  }

  readout();
}

function readout() {
  const c = sol.interfaces.census;
  const fam = sol.warp.axes.map((a, i) => `<span style="color:rgb(${FAM[i].join(',')})">●</span>W${a.whites[0]}·W${a.whites[1]}`).join('  ');
  $('read').innerHTML =
    `seed <b>${seed}</b> · <b>${m.cells.length}</b> chambers · <b>14</b> threads &nbsp;|&nbsp; ` +
    `warp: <b>${fam}</b> &nbsp;|&nbsp; ` +
    `<span class="ok">${c.sameKind} continuity</span> · <span class="door">${c.crossKind} K-doors</span> across 6 seams`;
  // certificate panel
  const bij = sol.interfaces.warp.perEdge.filter(Boolean).length;
  const row = (label, val, good) => `<div class="row"><span>${label}</span><span class="v ${good == null ? '' : good ? 'pass' : 'warn'}">${val}</span></div>`;
  $('cert').innerHTML =
    row('white bijection', `${bij}/6 edges`, bij === 6) +
    row('warp families', `${sol.warp.families} (ring + 2 helices)`, sol.warp.families === 3) +
    row('all 6 whites', sol.warp.allCovered ? 'covered' : 'gap', sol.warp.allCovered) +
    row('every edge = interface', c.everyEdgeIsInterface ? 'yes' : 'no', c.everyEdgeIsInterface) +
    row('same-kind continuity', `${c.sameKind}`, c.sameKind > 0) +
    row('cross-kind K-doors', `${c.crossKind}`, c.hasKDoors) +
    row('production doors', `${c.prodDoors}`, null);
}

// ── interaction ──
function resize() { DPR = Math.min(2, devicePixelRatio || 1); const r = cv.getBoundingClientRect(); CW = r.width; CH = r.height; cv.width = CW * DPR; cv.height = CH * DPR; if (m) draw(); }
addEventListener('resize', resize);
let drag = false, lx = 0, ly = 0;
cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); });
cv.addEventListener('pointermove', (e) => { if (!drag) return; panX += e.clientX - lx; panY += e.clientY - ly; lx = e.clientX; ly = e.clientY; draw(); });
cv.addEventListener('pointerup', (e) => { drag = false; cv.classList.remove('drag'); });
cv.addEventListener('wheel', (e) => { e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0011); zoom = Math.max(0.3, Math.min(6, zoom * f)); draw(); }, { passive: false });

const toggle = (id, get, set) => $(id).addEventListener('click', () => { set(!get()); $(id).classList.toggle('on', get()); draw(); });
toggle('tiles', () => showTiles, (v) => showTiles = v);
toggle('warp', () => showWarp, (v) => showWarp = v);
toggle('iface', () => showIface, (v) => showIface = v);
toggle('color', () => color14, (v) => color14 = v);
$('trace').addEventListener('click', () => { traceFam = (traceFam + 2) % 4 - 1; $('trace').classList.toggle('on', traceFam >= 0); $('trace').textContent = traceFam < 0 ? 'trace a family' : `family ${traceFam + 1}/3`; draw(); });
$('seedUp').addEventListener('click', () => { seed = (seed + 1) >>> 0; rebuild(); });
$('seedDn').addEventListener('click', () => { seed = (seed - 1) >>> 0; rebuild(); });

resize();
rebuild();
