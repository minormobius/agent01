// bake.js — v8 milestone 1: render a solved chunk ONCE to an offscreen tile.
//
// The perf foundation: the static world (rooms, concourse, walls, doors, glyphs) is drawn one time
// per chunk into a canvas in world units; the live loop just blits those tiles under the camera —
// O(chunks) per frame instead of O(cells). Fog is a second tile, redrawn only when the player moves.
// Browser-only (needs a 2D canvas); the data it consumes is the pure record from chunkgen.

const ROLE_DIM = '#39433d';   // concourse floor
function newCanvas(w, h) { const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); c.width = w; c.height = h; return c; }
const mem = (rec, i) => rec.road[i] ? 'R' : ('r' + rec.roomOf[i]);

// the static map tile. Origin = region top-left; size = region extent (+1px guard).
export function bakeStatic(rec, glyphs) {
  const ox = rec.region.x0, oy = rec.region.y0, W = Math.ceil(rec.region.x1 - ox) + 1, H = Math.ceil(rec.region.y1 - oy) + 1;
  const cv = newCanvas(W, H), ctx = cv.getContext('2d');
  const path = (p) => { ctx.beginPath(); ctx.moveTo(p[0][0] - ox, p[0][1] - oy); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] - ox, p[i][1] - oy); ctx.closePath(); };
  // fills
  for (let i = 0; i < rec.cells.length; i++) { const c = rec.cells[i]; if (c.poly.length < 3) continue; ctx.fillStyle = rec.road[i] ? ROLE_DIM : (rec.roomOf[i] >= 0 ? (rec.rooms[rec.roomOf[i]].color || '#2a2f35') : '#0e1216'); path(c.poly); ctx.fill(); }
  // faint cell texture
  ctx.lineWidth = 0.35; ctx.strokeStyle = 'rgba(10,12,16,0.5)';
  for (const c of rec.cells) { if (c.poly.length < 3) continue; path(c.poly); ctx.stroke(); }
  // walls: a cell-edge between different owners (room↔room, room↔concourse, or the chunk boundary)
  ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(16,22,28,0.95)'; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i < rec.cells.length; i++) { const v = rec.cells[i].poly, mi = mem(rec, i); for (let k = 0; k < v.length; k++) { const j = v[k][2], a = v[k], b = v[(k + 1) % v.length]; let wall; if (j < 0) wall = true; else { const mj = mem(rec, j); wall = mi !== mj && !(mi === 'R' && mj === 'R'); } if (wall) { ctx.moveTo(a[0] - ox, a[1] - oy); ctx.lineTo(b[0] - ox, b[1] - oy); } } }
  ctx.stroke();
  // doors + glyphs
  ctx.fillStyle = '#d9b24a'; for (const r of rec.rooms) { if (r.door < 0 || r.doorRoad < 0) continue; const a = rec.cells[r.door], b = rec.cells[r.doorRoad]; ctx.beginPath(); ctx.arc((a.x + b.x) / 2 - ox, (a.y + b.y) / 2 - oy, 2.3, 0, 7); ctx.fill(); }
  if (glyphs) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (const r of rec.rooms) { const sz = Math.min(20, Math.max(8, Math.sqrt(r.cells.length) * rec.cellSize * 0.34)); if (sz < 9) continue; ctx.font = Math.floor(sz) + 'px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(10,12,16,0.85)'; ctx.fillText(r.glyph || '', r.x - ox, r.y - oy); } }
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
