// skin.js — v090: reseed a v8 chunk's WALLS with Voronoi nuclei, then paint it à la mega/sprite/fixture.
//
// v8 ships a streaming, seamless, walkable world (chunkgen + manager) but renders it FLAT: solid room
// fills + 1.4px wall strokes, with the per-cell generation tiling deliberately hidden (bake.js). v090
// keeps every bit of v8's topology and gameplay (the same cells, rooms, doors, concourse, walk graph,
// fog) and replaces ONLY the look: it takes the chunk's floor plan and re-seeds the membranes between
// rooms with fine Voronoi nuclei — so walls get organic THICKNESS (paint/voronoi's one idea) — then
// lights the result the way mega/sprite/fixture does: physical wall-grown emitters whose light is
// RAY-TRACED through the wall tiling, so it pools in a room and spills through doorways, an art-deco
// component medallion per room, and the chamber-hued floor that falls out of the trace.
//
// The bridge is buildSceneCustom (paint/voronoi.js): the caller brings the floor plan as room SEEDS
// plus an edgeKind(a,b) verdict per shared membrane — 'wall' (solid), 'door' (a two-nuclei gap) or
// 'open' (no wall: continuous floor). We feed it v8's cell centres as seeds and derive edgeKind from
// v8's OWN wall/door logic (mem + doorPairs), so the painted walls land exactly where v8 has walls and
// the doors exactly where v8 has doors — the picture tracks the walk graph cell-for-cell.
//
// paintChunk(rec, opts) is PURE (no canvas): it returns world-space paint cells (each a polygon + a
// pre-traced floor colour), deco components, and wall lights with pre-computed lit values. The page
// just draws them (crisp vectors, so 5× zoom stays sharp). Node-tested by test/v090.selftest.mjs.

import { buildSceneCustom } from '../v5/voronoi.js';
import { occlusionGrid, lightAtRGB, tintLights, lightGenome, mulberry32 } from '../v5/lights.js';
import { deviceGenome } from '../v5/deco.js';

// Tuned for the moody dark-ship look at this (small-room) scale: light pools in a room and falls off
// fast into a dark concourse, lit only where it spills through a doorway. reach + tone keep the floor
// from blowing out (rooms here are a few cells wide, so a lamp sits right on the floor).
export const SKIN_DEFAULTS = { wallSpacing: 6, roomSpacing: 17, perRoom: 2, reach: 1.4, ambient: 0.05, sat: 0.86, tone: 0.9 };

// hue (0..360) of a hex colour — the chamber tint the light and floor take on.
export function hexHue(hex) {
  const c = (hex || '#888888').replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255, g = parseInt(c.slice(2, 4), 16) / 255, b = parseInt(c.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0;
  if (mx !== mn) { const d = mx - mn; h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return h;
}

// distance-to-wall field over the occlusion grid (multi-source BFS) — used to size + seat the deco
// component so it can never cross a wall into the next room (the same trick mega/sprite/fixture uses).
function wallDistField(occ) {
  const { nx, ny, wall, step } = occ, dist = new Float32Array(nx * ny).fill(Infinity), q = [];
  for (let i = 0; i < wall.length; i++) if (wall[i]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], gx = i % nx, gy = (i / nx) | 0, d = dist[i] + step; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = gx + dx, y = gy + dy; if (x < 0 || y < 0 || x >= nx || y >= ny) continue; const j = y * nx + x; if (dist[j] > d) { dist[j] = d; q.push(j); } } }
  return { nx, ny, step, dist };
}
const wallDistAt = (wd, x, y) => { const gx = Math.round(x / wd.step), gy = Math.round(y / wd.step); if (gx < 0 || gy < 0 || gx >= wd.nx || gy >= wd.ny) return 0; const d = wd.dist[gy * wd.nx + gx]; return isFinite(d) ? d : wd.step * 60; };

const tone = (v, e) => 1 - Math.exp(-v * e);

// Paint one solved v8 chunk record. Returns world-space { paintCells, comps, lights, poly, ports }.
export function paintChunk(rec, opts = {}) {
  const o = { ...SKIN_DEFAULTS, ...opts };
  const seed = (rec.seed ?? 1) >>> 0;
  const ox = rec.region.x0, oy = rec.region.y0;
  const W = Math.max(2, Math.ceil(rec.region.x1 - ox)), H = Math.max(2, Math.ceil(rec.region.y1 - oy));

  // ── 1. v8's own wall/door verdict, cell-pair by cell-pair (mirrors bake.js's mem()/doorSkip) ──
  const mem = (i) => (rec.road[i] ? 'R' : 'r' + rec.roomOf[i]);
  const doorSkip = new Set();
  for (const r of rec.rooms) {
    const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []);
    for (const [a, b] of dp) doorSkip.add(Math.min(a, b) + ',' + Math.max(a, b));
  }
  const edgeKind = (a, b) => {
    if (mem(a) === mem(b)) return 'open';                                 // same room, or both concourse → continuous floor
    if (doorSkip.has(Math.min(a, b) + ',' + Math.max(a, b))) return 'door';
    return 'wall';
  };

  // ── 2. reseed the walls with Voronoi nuclei over v8's exact floor plan ──
  const seeds = rec.cells.map((c) => ({ x: c.x - ox, y: c.y - oy }));
  const scene = buildSceneCustom({ W, H, wallSpacing: o.wallSpacing, roomSpacing: o.roomSpacing, seeds, edgeKind, seed });

  // ── 3. one-or-two wall-grown lights per ROOM (NOT per cell), tinted to the room's hue ──
  const rng = mulberry32((Math.imul(seed, 2654435761)) >>> 0);
  const lights = [];
  rec.rooms.forEach((r, ri) => {
    if (r.door < 0 || !r.cells || !r.cells.length) return;
    const rx = r.x - ox, ry = r.y - oy;
    const cand = [];                                                      // wall-edge midpoints on this room's membrane
    for (const ci of r.cells) {
      const v = rec.cells[ci].poly;
      for (let k = 0; k < v.length; k++) {
        const j = v[k][2];
        const isWall = j < 0 ? true : (rec.roomOf[j] !== ri || rec.road[j]) && edgeKind(ci, j) === 'wall';
        if (!isWall) continue;
        const a = v[k], b = v[(k + 1) % v.length];
        cand.push({ x: (a[0] + b[0]) / 2 - ox, y: (a[1] + b[1]) / 2 - oy });
      }
    }
    if (!cand.length) return;
    const chosen = [cand[(rng() * cand.length) | 0]];                     // greedy farthest-point spread
    while (chosen.length < Math.min(o.perRoom, cand.length)) {
      let best = null, bd = -1;
      for (const p of cand) { let m = Infinity; for (const q of chosen) m = Math.min(m, (p.x - q.x) ** 2 + (p.y - q.y) ** 2); if (m > bd) { bd = m; best = p; } }
      chosen.push(best);
    }
    for (const p of chosen) {
      const g = lightGenome(rng);
      let nx = rx - p.x, ny = ry - p.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const len = o.roomSpacing * (0.45 + g.len * 0.2);          // ~0.7·roomSpacing — a lamp that pools, not floods
      lights.push({ x: p.x, y: p.y, nx, ny, len, model: g, room: ri, tip: { x: p.x + nx * len * 0.82, y: p.y + ny * len * 0.82 } });
    }
  });
  tintLights(lights, (room) => hexHue(rec.rooms[room] && rec.rooms[room].color));

  // ── 4. ray-trace the tiling: occlusion grid → a chamber-hued colour per FLOOR cell ──
  const occ = occlusionGrid(scene);
  const lopt = { ambient: o.ambient, strength: 1, reach: o.reach };
  const paintCells = scene.paintCells.map((c) => {
    let color = null;
    if (!c.wall && c.room != null) {
      const rgb = lightAtRGB(lights, occ, c.x, c.y, lopt);
      let r = tone(rgb[0], o.tone) * 255, g = tone(rgb[1], o.tone) * 255, b = tone(rgb[2], o.tone) * 255;
      const L = 0.3 * r + 0.6 * g + 0.1 * b;
      r = L + (r - L) * o.sat; g = L + (g - L) * o.sat; b = L + (b - L) * o.sat;
      color = `rgb(${r | 0},${g | 0},${b | 0})`;
    }
    return { wall: c.wall, color, x: c.x + ox, y: c.y + oy, poly: c.poly.map((p) => [p[0] + ox, p[1] + oy]) };
  });

  // ── 5. one art-deco component per room, seated at max wall-clearance, sized to fit, lit by the field ──
  const wd = wallDistField(occ);
  const comps = [];
  rec.rooms.forEach((r, ri) => {
    if (r.door < 0) return;
    const rx = r.x - ox, ry = r.y - oy;
    let bp = null, best = -Infinity;
    for (const c of scene.paintCells) {
      if (c.wall || c.room == null || rec.road[c.room] || rec.roomOf[c.room] !== ri || c.poly.length < 3) continue;
      const score = wallDistAt(wd, c.x, c.y) - 0.18 * Math.hypot(c.x - rx, c.y - ry);
      if (score > best) { best = score; bp = c; }
    }
    if (!bp) return;
    const clear = wallDistAt(wd, bp.x, bp.y);
    const rr = Math.max(o.roomSpacing * 0.5, Math.min(o.roomSpacing * 1.7, clear * 0.82));
    const rgb = lightAtRGB(lights, occ, bp.x, bp.y, { ...lopt, ambient: 0.04 });
    const lum = 0.3 * rgb[0] + 0.6 * rgb[1] + 0.1 * rgb[2];
    comps.push({ cx: bp.x + ox, cy: bp.y + oy, r: rr, accent: r.color || '#9b6b3a', glyph: r.glyph || '', role: r.role,
      lit: Math.max(0.38, Math.min(1.2, lum * 1.25 + 0.18)),
      g: deviceGenome(mulberry32((Math.imul(ri * 733 + 13, 1 + seed)) >>> 0), { sharp: true }) });
  });

  // ── 6. pre-compute each light's own lit value (so the page only draws) + lift everything to world ──
  for (const L of lights) {
    const rgb = lightAtRGB(lights, occ, L.tip.x, L.tip.y, { ...lopt, ambient: 0.1 });
    L.lit = Math.max(0.7, Math.min(1.15, 0.3 * rgb[0] + 0.6 * rgb[1] + 0.1 * rgb[2] + 0.5));
    L.x += ox; L.y += oy; L.tip.x += ox; L.tip.y += oy;
  }

  return { paintCells, comps, lights, poly: rec.poly, ports: rec.ports, wallSpacing: o.wallSpacing, cellCount: scene.paintCells.length };
}
