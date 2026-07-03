// helix-app.js — THE HELIX EMERGES FROM THE HEX TILING. Each hexagon is a local K(6,8) ops-district (cohesion kept).
// A white arm hands off at an edge to the neighbour there; CHAIN those handoffs across the wrapped honeycomb and the
// six directions resolve into three global thread families: the E–W chains close into azimuthal RINGS, and the two
// diagonal chains (NE–SW, NW–SE) spiral into two COUNTER-ROTATING HELICES. So the cylinder weave is emergent — local
// hexes, global helices — and "expansion" is just more rows of hexes. Schematic centrelines, deterministic.

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
const TAU = Math.PI * 2, SQRT3 = Math.sqrt(3);
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const RING = [111, 207, 138], HXA = [95, 172, 224], HXB = [220, 140, 150], PROD = [236, 210, 150], GOLD = [255, 224, 122], DIM = [90, 106, 140];

let COLS = 8, ROWS = 12, size = 34, wrap = false, showRing = true, showA = true, showB = true, showProd = true, traceOne = false, spin = true;
let yaw = 0, panX = 0, panY = 0, zoom = 1;

// pointy-top, odd-r offset. Azimuth (col) wraps; axis (row) is the cylinder length. Unwrapped col = cumulative azimuth.
const cellXY = (col, row) => [SQRT3 * size * (col + 0.5 * (row & 1)), 1.5 * size * row];
const NB = {
  E:  (c, r) => [c + 1, r], W: (c, r) => [c - 1, r],
  NE: (c, r) => (r & 1) ? [c + 1, r - 1] : [c, r - 1], NW: (c, r) => (r & 1) ? [c, r - 1] : [c - 1, r - 1],
  SE: (c, r) => (r & 1) ? [c + 1, r + 1] : [c, r + 1], SW: (c, r) => (r & 1) ? [c, r + 1] : [c - 1, r + 1],
};
const wrapCol = (c) => ((c % COLS) + COLS) % COLS;

// follow a handoff chain from (c0,r0) in `dir` (unwrapped col accumulates) until it leaves the axis, or (for a ring)
// returns to its own azimuth — one global thread as a list of [col,row].
function chain(c0, r0, dir) {
  const pts = []; let c = c0, r = r0, g = 0; const ring = dir === 'E' || dir === 'W';
  while (g++ < COLS * ROWS + 6) {
    pts.push([c, r]); const [nc, nr] = NB[dir](c, r);
    if (nr < 0 || nr >= ROWS) break;
    if (ring && wrapCol(nc) === wrapCol(c0) && nr === r0) { pts.push([nc, nr]); break; }
    c = nc; r = nr;
  }
  return pts;
}

function strands() {
  const out = [];
  if (showRing) for (let r = 0; r < ROWS; r++) out.push({ fam: 'ring', col: RING, pts: chain(0, r, 'E') });
  if (showA) for (let c = 0; c < COLS; c++) out.push({ fam: 'A', col: HXA, pts: chain(c, ROWS - 1, 'NE') });
  if (showB) for (let c = 0; c < COLS; c++) out.push({ fam: 'B', col: HXB, pts: chain(c, ROWS - 1, 'NW') });
  return out;
}

// project an (unwrapped-col, row) hex to screen — flat unrolled (with horizontal tiling) or wrapped on the cylinder
const midY = () => 1.5 * size * (ROWS - 1) / 2;
function projFlat(col, row, off) { const [ax, ay] = cellXY(col, row); return [CW / 2 + panX + (ax - SQRT3 * size * COLS / 2 + off) * zoom, CH / 2 + panY + (ay - midY()) * zoom]; }
function projCyl(col, row) {
  const th = TAU * (col + 0.5 * (row & 1)) / COLS + yaw, R = SQRT3 * size * COLS / TAU;
  const [, ay] = cellXY(col, row), depth = Math.cos(th);
  return { X: CW / 2 + panX + R * Math.sin(th) * zoom, Y: CH / 2 + panY + (ay - midY()) * zoom * 0.92, depth };
}

function hexPath(cxy, s) { ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + Math.PI / 3 * k, x = cxy[0] + s * Math.cos(a), y = cxy[1] + s * Math.sin(a); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); }

function drawFlatTile(off) {
  // hex cell outlines + local production hub
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const p = projFlat(c, r, off);
    hexPath(p, size * zoom); ctx.strokeStyle = rgba(DIM, 0.32); ctx.lineWidth = 1; ctx.stroke();
    if (showProd) { ctx.fillStyle = rgba(PROD, 0.5); ctx.beginPath(); ctx.arc(p[0], p[1], 2.4 * zoom, 0, 7); ctx.fill(); }
  }
}
function drawFlat() {
  const Wp = SQRT3 * size * COLS * zoom;
  for (let off = -COLS; off <= COLS * 2; off += COLS) drawFlatTile(off * SQRT3 * size);   // tile horizontally so wrap reads
  const st = strands(); const liveA = st.filter((s) => s.fam === 'A');
  const live = traceOne && liveA.length ? liveA[Math.floor((Date.now() / 1400) % liveA.length)] : null;   // one highlighted helix
  for (const s of st) {
    const on = !traceOne || s === live, col = s === live ? GOLD : s.col;
    for (let k = -1; k <= 2; k++) { const off = k * SQRT3 * size;
      ctx.beginPath(); s.pts.forEach(([c, r], i) => { const p = projFlat(c, r, off); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.strokeStyle = rgba(col, on ? (s === live ? 0.95 : 0.6) : 0.12); ctx.lineWidth = (s === live ? 3 : 1.6) * zoom; ctx.lineCap = 'round'; ctx.stroke();
    }
  }
  // seam markers (the azimuthal period boundary)
  for (let off = 0; off <= COLS; off += COLS) { const x = CW / 2 + panX + (off * SQRT3 * size - SQRT3 * size * COLS / 2) * zoom; ctx.strokeStyle = rgba(GOLD, 0.18); ctx.setLineDash([4, 6]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CH); ctx.stroke(); ctx.setLineDash([]); }
}
function drawCyl() {
  // production hubs on the tube (front brighter)
  if (showProd) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const p = projCyl(c, r); ctx.fillStyle = rgba(PROD, 0.15 + 0.4 * Math.max(0, p.depth)); ctx.beginPath(); ctx.arc(p.X, p.Y, 2.2 * zoom, 0, 7); ctx.fill(); }
  const st = strands(), liveA = st.filter((s) => s.fam === 'A');
  const live = traceOne && liveA.length ? liveA[Math.floor((Date.now() / 1400) % liveA.length)] : null;
  for (const s of st) {
    const on = !traceOne || s === live, col = s === live ? GOLD : s.col;
    for (let i = 1; i < s.pts.length; i++) {
      const a = projCyl(...s.pts[i - 1]), b = projCyl(...s.pts[i]); const dep = (a.depth + b.depth) / 2;
      ctx.strokeStyle = rgba(col, (on ? (s === live ? 1 : 0.7) : 0.1) * (0.2 + 0.8 * Math.max(0, dep + 0.15)));
      ctx.lineWidth = (s === live ? 3.2 : 1.7) * zoom * (0.5 + 0.5 * Math.max(0, dep)); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.X, a.Y); ctx.lineTo(b.X, b.Y); ctx.stroke();
    }
  }
}

function frame() {
  if (spin) { if (wrap) yaw += 0.004; else panX += 0.35; if (panX > SQRT3 * size * COLS * zoom) panX -= SQRT3 * size * COLS * zoom; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#06070c'; ctx.fillRect(0, 0, CW, CH);
  wrap ? drawCyl() : drawFlat();
  $('read').innerHTML = `<b>${COLS} hexes around × ${ROWS} along</b> — each a local <b>K(6,8)</b> district (cohesion kept). ` +
    `The white edge-handoffs chain across the wrapped honeycomb into <span class="ok">three global families</span>: ` +
    `<span class="swatch" style="background:${rgba(RING, 1)}"></span>rings (E–W, azimuthal), ` +
    `<span class="swatch" style="background:${rgba(HXA, 1)}"></span>helix ↗ and <span class="swatch" style="background:${rgba(HXB, 1)}"></span>helix ↖ (counter-rotating). ` +
    `The two helix families cross ⇒ the cylinder <b>weave is emergent</b>; 8 engines stay local per hex. ` +
    (wrap ? 'Wrapped on the cylinder — the diagonals are literal helices.' : 'Unrolled — a helix reads as a diagonal that repeats across the gold seam (one azimuthal turn).');
  requestAnimationFrame(frame);
}

$('cols').addEventListener('input', (e) => { COLS = +e.target.value; $('colsV').textContent = COLS; });
$('rows').addEventListener('input', (e) => { ROWS = +e.target.value; $('rowsV').textContent = ROWS; });
$('wrap').addEventListener('click', () => { wrap = !wrap; $('wrap').textContent = wrap ? '⊗ cylinder' : '◱ unrolled'; $('wrap').classList.toggle('on', wrap); panX = 0; });
for (const [id, set] of [['rings', (v) => showRing = v], ['helixA', (v) => showA = v], ['helixB', (v) => showB = v], ['prod', (v) => showProd = v]])
  $(id).addEventListener('click', () => { const on = !$(id).classList.contains('on'); $(id).classList.toggle('on', on); set(on); });
$('trace').addEventListener('click', () => { traceOne = !traceOne; $('trace').classList.toggle('on', traceOne); });
$('spin').addEventListener('click', () => { spin = !spin; $('spin').classList.toggle('on', spin); });

let drag = false, lx = 0, ly = 0; const ptrs = new Map(); let pinchD = 0;
cv.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); drag = true; lx = e.clientX; ly = e.clientY; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); if (ptrs.size === 2) { const v = [...ptrs.values()]; pinchD = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); } });
cv.addEventListener('pointermove', (e) => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); if (pinchD) zoom = Math.max(0.4, Math.min(3, zoom * d / pinchD)); pinchD = d; return; }
  if (!drag) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; if (wrap) { yaw += dx * 0.006; panY += dy; } else { panX += dx; panY += dy; }
});
cv.addEventListener('pointerup', (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinchD = 0; drag = ptrs.size > 0; cv.classList.remove('drag'); try { cv.releasePointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(0.4, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); }, { passive: false });

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; }
addEventListener('resize', resize);
resize(); requestAnimationFrame(frame);
