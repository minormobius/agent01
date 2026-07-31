// bake.js — v8 milestone 1: render a solved chunk ONCE to an offscreen tile.
//
// The perf foundation: the static world (rooms, concourse, walls, doors, glyphs) is drawn one time
// per chunk into a canvas in world units; the live loop just blits those tiles under the camera —
// O(chunks) per frame instead of O(cells). Fog is a second tile, redrawn only when the player moves.
// Browser-only (needs a 2D canvas); the data it consumes is the pure record from chunkgen.

const ROLE_DIM = '#39433d';   // concourse floor
function newCanvas(w, h) { const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); c.width = w; c.height = h; return c; }
const mem = (rec, i) => rec.road[i] ? 'R' : ('r' + rec.roomOf[i]);

// the static map tile. Origin = region top-left; size = region extent (+1px guard). The GENERATION
// tiling (per-cell Voronoi) is intentionally hidden — we draw solid rooms + concourse and only the
// WALLS between them, with doors rendered as MISSING wall (a one-cell gap) and chunk ports as gaps in
// the perimeter. (A separate render-tiling for the surface comes later.)
export function bakeStatic(rec, glyphs) {
  const ox = rec.region.x0, oy = rec.region.y0, W = Math.ceil(rec.region.x1 - ox) + 1, H = Math.ceil(rec.region.y1 - oy) + 1;
  const cv = newCanvas(W, H), ctx = cv.getContext('2d');
  const path = (p) => { ctx.beginPath(); ctx.moveTo(p[0][0] - ox, p[0][1] - oy); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] - ox, p[i][1] - oy); ctx.closePath(); };
  const portSet = new Set(rec.ports.map((p) => p.cell));
  const doorSkip = new Set(); for (const r of rec.rooms) { const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []); for (const [a, b] of dp) doorSkip.add(Math.min(a, b) + ',' + Math.max(a, b)); }
  // solid fills (no per-cell texture → the generation tiling vanishes). Each cell is also STROKED in
  // its own fill colour so adjacent same-colour cells leave no antialiased hairline (the residual
  // voronoi you could still see in the solid regions).
  for (let i = 0; i < rec.cells.length; i++) { const c = rec.cells[i]; if (c.poly.length < 3) continue; const col = rec.road[i] ? ROLE_DIM : (rec.roomOf[i] >= 0 ? (rec.rooms[rec.roomOf[i]].color || '#2a2f35') : '#0e1216'); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1; path(c.poly); ctx.fill(); ctx.stroke(); }
  // walls, with door + port gaps
  ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(14,19,25,0.98)'; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i < rec.cells.length; i++) { const v = rec.cells[i].poly, mi = mem(rec, i); for (let k = 0; k < v.length; k++) { const j = v[k][2], a = v[k], b = v[(k + 1) % v.length]; let wall; if (j < 0) wall = !portSet.has(i); else { const mj = mem(rec, j); wall = mi !== mj && !(mi === 'R' && mj === 'R') && !doorSkip.has(Math.min(i, j) + ',' + Math.max(i, j)); } if (wall) { ctx.moveTo(a[0] - ox, a[1] - oy); ctx.lineTo(b[0] - ox, b[1] - oy); } } }
  ctx.stroke();
  if (glyphs) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (const r of rec.rooms) { const sz = Math.min(20, Math.max(8, Math.sqrt(r.cells.length) * rec.cellSize * 0.34)); if (sz < 9) continue; ctx.font = Math.floor(sz) + 'px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(10,12,16,0.8)'; ctx.fillText(r.glyph || '', r.x - ox, r.y - oy); } }
  return { canvas: cv, ox, oy, w: W, h: H };
}

// the fog tile for a chunk: unseen = opaque, seen-out-of-view = dim, in-view = clear. Redrawn on move.
export function bakeFog(rec, isSeen, isInView) {
  const ox = rec.region.x0, oy = rec.region.y0, W = Math.ceil(rec.region.x1 - ox) + 1, H = Math.ceil(rec.region.y1 - oy) + 1;
  const cv = newCanvas(W, H), ctx = cv.getContext('2d');
  const path = (p) => { ctx.beginPath(); ctx.moveTo(p[0][0] - ox, p[0][1] - oy); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] - ox, p[i][1] - oy); ctx.closePath(); };
  for (let i = 0; i < rec.cells.length; i++) { const c = rec.cells[i]; if (c.poly.length < 3) continue; const s = isSeen(i), v = isInView(i), a = !s ? 0.93 : v ? 0 : 0.5; if (a <= 0) continue; ctx.fillStyle = `rgba(6,8,11,${a})`; path(c.poly); ctx.fill(); }
  return { canvas: cv, ox, oy, w: W, h: H };
}
