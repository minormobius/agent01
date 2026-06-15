// skin.js — v090: RETILE a v8 chunk from its walls. The v8 map is the BONES — a coarse cartoon of
// regions (rooms + concourse) and the walls between them. We throw that cell tiling away for render
// and lay a NEW one: seed the real walls with fine Voronoi nuclei (thin, clean walls) and fill each
// interior GAP with LARGER graded tiles (fine near a wall, big in the middle) — the /paint + v4 look,
// at v4's ~5:1 interior:wall proportion. Then colour each tile by its room's ROLE modulated by light
// (a warm albedo that the light brightens, v4), with the light RAY-TRACED through the new walls so it
// pools in a room and spills through doorways (mega/sprite/fixture), an art-deco component per room,
// and wall-grown lamps. The player is small against all of this.
//
// Crucially the new walls land on v8's ACTUAL membranes (room↔room / room↔concourse, minus doors) and
// the doors stay open, so the picture matches the walk graph the engine still drives. paintChunk(rec)
// is PURE (no canvas): it returns world-space tiles (polygon + pre-composited colour), deco
// components, and pre-lit wall lights. Node-tested by test/v090.selftest.mjs.

import { clipCell, bucketGrid, jitterGrid, mulberry32 } from '../v5/voronoi.js';
import { occlusionGrid, lightAtRGB, tintLights, lightGenome } from '../v5/lights.js';
import { deviceGenome } from '../v5/deco.js';

// v4 proportions + palette: thin walls (wallSpacing), interior tiles a few× larger (roomSpacing,
// graded fine→big), tiles a role albedo the light brightens. Light pools + deco are sized to the
// ROOM (not the tile pitch), so they fill the chamber and spill through doorways.
export const SKIN_DEFAULTS = { wallSpacing: 5, roomSpacing: 18, perRoom: 2, reach: 1.5, ambient: 0.5, lgain: 1.05 };
const ROAD_RGB = [44, 70, 60], DOOR_RGB = [120, 92, 50], VOID_RGB = [12, 16, 20];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hexRGB = (h) => { const c = (h || '#3a4248').replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };

export function hexHue(hex) {
  const c = (hex || '#888888').replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255, g = parseInt(c.slice(2, 4), 16) / 255, b = parseInt(c.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0;
  if (mx !== mn) { const d = mx - mn; h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return h;
}

// Paint one solved v8 chunk record. Returns world-space { paintCells, comps, lights, poly, ports }.
export function paintChunk(rec, opts = {}) {
  const o = { ...SKIN_DEFAULTS, ...opts };
  const seed = (rec.seed ?? 1) >>> 0;
  const ox = rec.region.x0, oy = rec.region.y0;
  const W = Math.max(2, Math.ceil(rec.region.x1 - ox)), H = Math.max(2, Math.ceil(rec.region.y1 - oy));
  const ws = o.wallSpacing, rs = o.roomSpacing, band = ws * 0.7;

  // ── regions (the bones): each v8 cell belongs to a room (id≥0), the concourse (-1), or void (-2) ──
  const regionOf = (i) => (rec.road[i] ? -1 : (rec.roomOf[i] >= 0 ? rec.roomOf[i] : -2));
  const doorSkip = new Set();
  for (const r of rec.rooms) { const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []); for (const [a, b] of dp) doorSkip.add(Math.min(a, b) + ',' + Math.max(a, b)); }
  const isWallEdge = (i, j) => j < 0 ? true : (regionOf(i) !== regionOf(j) && !doorSkip.has(Math.min(i, j) + ',' + Math.max(i, j)));

  // nearest-bone lookup → a point's region (membership of the new tiles), in LOCAL coords
  const cellPts = rec.cells.map((c, i) => ({ x: c.x - ox, y: c.y - oy, i }));
  const cellGrid = bucketGrid(cellPts, OPTS_CELL(rec));
  const regionAt = (x, y) => { let best = null, bd = Infinity; for (const q of cellGrid.near(x, y)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } } return best ? regionOf(best.i) : -2; };

  // port gaps on the perimeter (where the concourse crosses to a neighbour — leave the hull open there)
  const portPts = rec.ports.map((p) => ({ x: p.x - ox, y: p.y - oy }));
  const portGrid = bucketGrid(portPts.length ? portPts : [{ x: -1e9, y: -1e9 }], Math.max(rs, ws * 4));
  const portGap = 18, atPort = (x, y) => { for (const q of portGrid.near(x, y)) if ((q.x - x) ** 2 + (q.y - y) ** 2 < portGap * portGap) return true; return false; };

  // ── 1. WALL nuclei on v8's real membranes (room↔room, room↔concourse, perimeter), minus doors ──
  const wallNuclei = [], seenW = new Set(), snap = ws * 0.5;
  const addWall = (x, y, perim) => { if (x < -1 || y < -1 || x > W + 1 || y > H + 1) return; if (perim && atPort(x, y)) return; const k = Math.round(x / snap) + ',' + Math.round(y / snap); if (seenW.has(k)) return; seenW.add(k); wallNuclei.push({ x, y, wall: true }); };
  for (let i = 0; i < rec.cells.length; i++) {
    const v = rec.cells[i].poly;
    for (let k = 0; k < v.length; k++) {
      const j = v[k][2]; if (j >= 0 && j < i) continue;            // shared membrane: seed once
      if (!isWallEdge(i, j)) continue;
      const a = v[k], b = v[(k + 1) % v.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / ws));
      for (let t = 0; t <= n; t++) addWall(a[0] + (b[0] - a[0]) * t / n - ox, a[1] + (b[1] - a[1]) * t / n - oy, j < 0);
    }
  }
  const wallGrid = bucketGrid(wallNuclei.length ? wallNuclei : [{ x: -1e9, y: -1e9 }], Math.max(rs, ws * 3));
  const wallDist = (x, y) => { let bd = Infinity; for (const q of wallGrid.near(x, y)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };

  // ── 2. FLOOR nuclei: large graded tiles filling each gap — fine (ws) near a wall, big (rs) in the middle ──
  const refDepth = Math.max(band + 1, rs * 0.55);
  const localSpacing = (edge) => ws + (rs - ws) * clamp((edge - band) / (refDepth - band), 0, 1);
  const hashCell = Math.max(rs, ws), acc = new Map(), akey = (x, y) => Math.floor(x / hashCell) + ',' + Math.floor(y / hashCell);
  const floorNuclei = [];
  const place = (x, y, region, door = false) => { const nu = { x, y, wall: false, region, door }; floorNuclei.push(nu); const k = akey(x, y); let b = acc.get(k); if (!b) acc.set(k, b = []); b.push(nu); return nu; };
  const clearOf = (x, y, r) => { const cx = Math.floor(x / hashCell), cy = Math.floor(y / hashCell), r2 = r * r; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const b = acc.get((cx + dx) + ',' + (cy + dy)); if (!b) continue; for (const q of b) if ((q.x - x) ** 2 + (q.y - y) ** 2 < r2) return false; } return true; };
  // anchor a big central tile at each room centroid + each concourse cell that sits clear of walls
  for (let ri = 0; ri < rec.rooms.length; ri++) { const r = rec.rooms[ri]; if (r.door < 0) continue; const x = r.x - ox, y = r.y - oy; if (wallDist(x, y) > band) place(x, y, ri); }
  for (let i = 0; i < rec.cells.length; i++) { if (!rec.road[i]) continue; const x = rec.cells[i].x - ox, y = rec.cells[i].y - oy; if (wallDist(x, y) > band && clearOf(x, y, rs * 0.7)) place(x, y, -1); }
  // door bridges: a couple of floor nuclei straddling each door gap, so the gap reads as a threshold
  for (const r of rec.rooms) { const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []); for (const [a, b] of dp) { const ca = rec.cells[a], cb = rec.cells[b]; for (const t of [0.32, 0.68]) { const x = (ca.x + (cb.x - ca.x) * t) - ox, y = (ca.y + (cb.y - ca.y) * t) - oy; if (clearOf(x, y, ws * 0.7)) place(x, y, regionAt(x, y), true); } } }
  // graded fill from a fine candidate grid, accepted by the local (growing) radius
  for (const p of jitterGrid(W, H, ws, 0.6, mulberry32(seed))) {
    const e = wallDist(p.x, p.y); if (e <= band && !atPort(p.x, p.y)) continue;     // keep out of the wall band
    if (clearOf(p.x, p.y, localSpacing(e))) place(p.x, p.y, regionAt(p.x, p.y));
  }

  // ── 3. paint the Voronoi of {wall ∪ floor} nuclei ──
  const nuclei = wallNuclei.concat(floorNuclei);
  const paintGrid = bucketGrid(nuclei, Math.max(rs, ws) * 1.7);
  const cells = nuclei.map((nu) => ({ wall: nu.wall, region: nu.wall ? -2 : nu.region, door: !!nu.door, x: nu.x, y: nu.y, poly: clipCell(nu, paintGrid.near(nu.x, nu.y), rs * 3) }));
  const scene = { W, H, wallSpacing: ws, roomSpacing: rs, nuclei };

  // ── 4. one-or-two wall-grown lights per ROOM, tinted to the room hue ──
  const rng = mulberry32((Math.imul(seed, 2654435761)) >>> 0);
  const lights = [];
  rec.rooms.forEach((r, ri) => {
    if (r.door < 0 || !r.cells || !r.cells.length) return;
    const rx = r.x - ox, ry = r.y - oy, cand = [];
    for (const ci of r.cells) { const v = rec.cells[ci].poly; for (let k = 0; k < v.length; k++) { if (!isWallEdge(ci, v[k][2])) continue; const a = v[k], b = v[(k + 1) % v.length]; cand.push({ x: (a[0] + b[0]) / 2 - ox, y: (a[1] + b[1]) / 2 - oy }); } }
    if (!cand.length) return;
    const roomRad = Math.sqrt(r.cells.length) * (rec.cellSize || 16) * 0.5;   // a lamp fills the chamber, not a tile
    const chosen = [cand[(rng() * cand.length) | 0]];
    while (chosen.length < Math.min(o.perRoom, cand.length)) { let best = null, bd = -1; for (const p of cand) { let m = Infinity; for (const q of chosen) m = Math.min(m, (p.x - q.x) ** 2 + (p.y - q.y) ** 2); if (m > bd) { bd = m; best = p; } } chosen.push(best); }
    for (const p of chosen) { const g = lightGenome(rng); let nx = rx - p.x, ny = ry - p.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl; const len = Math.max(rs * 0.6, roomRad * (0.7 + g.len * 0.4)); lights.push({ x: p.x, y: p.y, nx, ny, len, model: g, room: ri, tip: { x: p.x + nx * len * 0.7, y: p.y + ny * len * 0.7 } }); }
  });
  tintLights(lights, (room) => hexHue(rec.rooms[room] && rec.rooms[room].color));

  // ── 5. ray-trace the new tiling → each tile = its role ALBEDO brightened by the occluded light ──
  const occ = occlusionGrid(scene);
  const lopt = { ambient: 0.04, strength: 1, reach: o.reach };
  const baseOf = (region, door) => region === -1 ? ROAD_RGB : region === -2 ? VOID_RGB : (door ? DOOR_RGB : hexRGB(rec.rooms[region] && rec.rooms[region].color));
  const paintCells = cells.map((c) => {
    let color = null;
    if (!c.wall) {
      const base = baseOf(c.region, c.door), rgb = lightAtRGB(lights, occ, c.x, c.y, lopt), lum = 0.3 * rgb[0] + 0.6 * rgb[1] + 0.1 * rgb[2];
      const g = o.ambient + lum * o.lgain;
      color = `rgb(${clamp(base[0] * g, 0, 255) | 0},${clamp(base[1] * g, 0, 255) | 0},${clamp(base[2] * g, 0, 255) | 0})`;
    }
    return { wall: c.wall, color, x: c.x + ox, y: c.y + oy, poly: c.poly.map((p) => [p[0] + ox, p[1] + oy]) };
  });

  // ── 6. an art-deco component per room, seated at max wall-clearance, sized to fit, lit by the field ──
  const comps = [];
  rec.rooms.forEach((r, ri) => {
    if (r.door < 0) return;
    const rx = r.x - ox, ry = r.y - oy;
    let bp = null, best = -Infinity;
    for (const c of cells) { if (c.wall || c.region !== ri) continue; const score = wallDist(c.x, c.y) - 0.18 * Math.hypot(c.x - rx, c.y - ry); if (score > best) { best = score; bp = c; } }
    if (!bp) return;
    const roomRad = Math.sqrt(r.cells.length) * (rec.cellSize || 16) * 0.5;
    const rr = clamp(wallDist(bp.x, bp.y) * 0.82, Math.max(ws, roomRad * 0.32), roomRad * 0.9);
    const rgb = lightAtRGB(lights, occ, bp.x, bp.y, lopt), lum = 0.3 * rgb[0] + 0.6 * rgb[1] + 0.1 * rgb[2];
    comps.push({ cx: bp.x + ox, cy: bp.y + oy, r: rr, accent: r.color || '#9b6b3a', glyph: r.glyph || '', role: r.role,
      lit: clamp(lum * 1.25 + 0.2, 0.4, 1.2), g: deviceGenome(mulberry32((Math.imul(ri * 733 + 13, 1 + seed)) >>> 0), { sharp: true }) });
  });

  // ── 7. pre-light each lamp + lift everything to world coordinates ──
  for (const L of lights) { const rgb = lightAtRGB(lights, occ, L.tip.x, L.tip.y, { ...lopt, ambient: 0.1 }); L.lit = clamp(0.3 * rgb[0] + 0.6 * rgb[1] + 0.1 * rgb[2] + 0.5, 0.7, 1.15); L.x += ox; L.y += oy; L.tip.x += ox; L.tip.y += oy; }

  return { paintCells, comps, lights, poly: rec.poly, ports: rec.ports, wallSpacing: ws, roomSpacing: rs, cellCount: paintCells.length };
}

// bucket cell-size for the nearest-bone lookup — a touch over the bone cell pitch
function OPTS_CELL(rec) { return (rec.cellSize || 16) * 1.6; }
