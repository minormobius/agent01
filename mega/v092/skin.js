// skin.js — v090: RETILE a v8 chunk into a fresh, player-relative Voronoi mesh, independent of the
// bones. The v8 cell tiling is BONES only — a coarse cartoon of regions (rooms + concourse) and the
// walls between them. We read just that — region membership + where the real walls are — and inject
// an entirely NEW set of nuclei whose scale is set by the PLAYER, not by the bones:
//
//   • WALL nuclei — tight, spaced ≈ ½ the player width — injected along the real membranes
//     (room↔room / room↔concourse, minus doors, + the sealed perimeter). Thin, clean walls.
//   • ROOM-CENTRE nuclei — a big seed at each room centre that grows to ≈ 2× the player width.
//   • A SMOOTH GRADIENT between: a floor nucleus's target spacing ramps (smoothstep) from ½·playerW
//     hugging a wall to 2·playerW deep in a room — fine where it meets the wall, coarse in the middle.
//
// Nothing here samples the bones' cell pitch, so the bones disappear; the mesh is its own thing. Then
// it's painted v4/mega: each tile a role albedo brightened by light RAY-TRACED through the NEW walls
// (walls catch the glow as rim-lit stone so they READ against the dark concourse; light pools in a
// room and spills through doorways), with a small art-deco component + small wall lamps per room.
//
// The walls still land on v8's real membranes and the doors stay open, so the picture matches the walk
// graph the engine drives. paintChunk(rec) is PURE; node-tested by test/v090.selftest.mjs.

import { clipCell, bucketGrid, mulberry32 } from './v5/voronoi.js';
import { occlusionGrid, visible, tintLights, lightGenome } from './v5/lights.js';
import { deviceGenome } from './v5/deco.js';

// Everything is keyed to the player. ws = ½·playerW (tight walls), rs = 2·playerW (big room centres).
export const SKIN_DEFAULTS = { playerW: 6, perRoom: 2, reach: 3.4, ambient: 0.5, lgain: 1.05, wallAmb: 0.3, wallGain: 0.62, fixture: 1 };
const ROAD_RGB = [44, 70, 60], DOOR_RGB = [120, 92, 50], VOID_RGB = [10, 13, 18], WALL_RGB = [27, 32, 41];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const hexRGB = (h) => { const c = (h || '#3a4248').replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; };

// ── seamless-across-chunks helpers ─────────────────────────────────────────────────────────────
// A position hash → a GLOBAL jittered lattice: a floor candidate at world cell (gi,gj) lands at the
// same world point whichever chunk asks, so two abutting chunks lay IDENTICAL nuclei in the overlap.
const hsh = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + 0x9e3779b1) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function* globalDarts(ox, oy, W, H, spacing, jit) {
  const gi0 = Math.floor(ox / spacing) - 1, gi1 = Math.ceil((ox + W) / spacing) + 1, gj0 = Math.floor(oy / spacing) - 1, gj1 = Math.ceil((oy + H) / spacing) + 1;
  for (let gj = gj0; gj <= gj1; gj++) for (let gi = gi0; gi <= gi1; gi++) {
    const wx = (gi + 0.5) * spacing + (hsh(gi, gj) - 0.5) * jit * spacing, wy = (gj + 0.5) * spacing + (hsh(gi * 131 + 7, gj * 131 + 9) - 0.5) * jit * spacing;
    yield { x: wx - ox, y: wy - oy };   // local
  }
}
// is a local point inside the convex chunk polygon (centroid cx,cy gives the inside half-plane sign)?
function inConvex(px, py, poly, cx, cy) {
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1]; const sref = ex * (cy - a[1]) - ey * (cx - a[0]); if ((ex * (py - a[1]) - ey * (px - a[0])) * sref < -1e-6) return false; }
  return true;
}
// Sutherland–Hodgman clip of a poly to the convex chunk polygon → a cell never bleeds across a seam.
function clipToConvex(sub, poly, cx, cy) {
  let out = sub;
  for (let i = 0; i < poly.length && out.length >= 3; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], sref = ex * (cy - a[1]) - ey * (cx - a[0]);
    const f = (p) => (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) * sref, np = [];
    for (let k = 0; k < out.length; k++) { const P = out[k], Q = out[(k + 1) % out.length], dp = f(P), dq = f(Q); if (dp >= -1e-9) np.push(P); if ((dp >= -1e-9) !== (dq >= -1e-9)) { const t = dp / (dp - dq); np.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); } }
    out = np;
  }
  return out;
}

export function hexHue(hex) {
  const c = (hex || '#888888').replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255, g = parseInt(c.slice(2, 4), 16) / 255, b = parseInt(c.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0;
  if (mx !== mn) { const d = mx - mn; h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return h;
}

export function paintChunk(rec, opts = {}) {
  const o = { ...SKIN_DEFAULTS, ...opts };
  const seed = (rec.seed ?? 1) >>> 0;
  const ox = rec.region.x0, oy = rec.region.y0;
  const W = Math.max(2, Math.ceil(rec.region.x1 - ox)), H = Math.max(2, Math.ceil(rec.region.y1 - oy));
  const pw = o.playerW, ws = pw * 0.5, rs = pw * 2, band = ws * 0.8, refDepth = rs * 1.6;   // the player sets the scale

  // ── the bones we read: region membership (room id, concourse −1, void −2) + the door gaps ──
  const regionOf = (i) => (rec.road[i] ? -1 : (rec.roomOf[i] >= 0 ? rec.roomOf[i] : -2));
  const doorSkip = new Set();
  for (const r of rec.rooms) { const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []); for (const [a, b] of dp) doorSkip.add(Math.min(a, b) + ',' + Math.max(a, b)); }
  const isWallEdge = (i, j) => j < 0 ? true : (regionOf(i) !== regionOf(j) && !doorSkip.has(Math.min(i, j) + ',' + Math.max(i, j)));
  const cellPts = rec.cells.map((c, i) => ({ x: c.x - ox, y: c.y - oy, i }));
  const cellGrid = bucketGrid(cellPts, (rec.cellSize || 16) * 1.6);
  const regionAt = (x, y) => { let best = null, bd = Infinity; for (const q of cellGrid.near(x, y)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } } return best ? regionOf(best.i) : -2; };
  const portPts = rec.ports.map((p) => ({ x: p.x - ox, y: p.y - oy }));
  const portGrid = bucketGrid(portPts.length ? portPts : [{ x: -1e9, y: -1e9 }], Math.max(rs, ws * 6));
  const portGap = pw * 3, atPort = (x, y) => { for (const q of portGrid.near(x, y)) if ((q.x - x) ** 2 + (q.y - y) ** 2 < portGap * portGap) return true; return false; };

  // ── 1. inject WALL nuclei along the real membranes, tight at ws = ½·playerW ──
  const wallNuclei = [], seenW = new Set(), snap = ws * 0.5;
  const addWall = (x, y, perim) => { if (x < -1 || y < -1 || x > W + 1 || y > H + 1) return; if (perim && atPort(x, y)) return; const k = Math.round(x / snap) + ',' + Math.round(y / snap); if (seenW.has(k)) return; seenW.add(k); wallNuclei.push({ x, y, wall: true }); };
  for (let i = 0; i < rec.cells.length; i++) {                 // INTERIOR membranes (per-chunk is fine)
    const v = rec.cells[i].poly;
    for (let k = 0; k < v.length; k++) {
      const j = v[k][2]; if (j < 0 || j < i) continue;          // perimeter handled canonically below
      if (!isWallEdge(i, j)) continue;
      const a = v[k], b = v[(k + 1) % v.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / ws));
      for (let t = 0; t <= n; t++) addWall(a[0] + (b[0] - a[0]) * t / n - ox, a[1] + (b[1] - a[1]) * t / n - oy, false);
    }
  }
  // PERIMETER: seed wall nuclei along the chunk POLYGON edges at GLOBAL canonical positions (walk from
  // the canonically-ordered endpoint), with gaps at ports. Two abutting chunks share that edge, so they
  // lay BIT-IDENTICAL seam-wall nuclei — the seam looks the same from either side and never shifts.
  for (let e = 0; e < rec.poly.length; e++) {
    const P = rec.poly[e], Q = rec.poly[(e + 1) % rec.poly.length];
    let S = P, E = Q; if (P.x > Q.x || (P.x === Q.x && P.y > Q.y)) { S = Q; E = P; }
    const L = Math.hypot(E.x - S.x, E.y - S.y), n = Math.max(1, Math.round(L / ws));
    for (let k = 0; k <= n; k++) addWall(S.x + (E.x - S.x) * k / n - ox, S.y + (E.y - S.y) * k / n - oy, true);
  }
  const wallGrid = bucketGrid(wallNuclei.length ? wallNuclei : [{ x: -1e9, y: -1e9 }], Math.max(rs, ws * 4));
  const wallDist = (x, y) => { let bd = Infinity; for (const q of wallGrid.near(x, y)) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };

  // the chunk polygon in LOCAL coords (+ its centroid) — the clip boundary everything is held inside
  const lpoly = rec.poly.map((p) => [p.x - ox, p.y - oy]); let lcx = 0, lcy = 0; for (const p of lpoly) { lcx += p[0]; lcy += p[1]; } lcx /= lpoly.length; lcy /= lpoly.length;

  // ── 2. inject FLOOR nuclei: a big seed at each room centre, graded down to ws toward the walls ──
  const localSpacing = (edge) => ws + (rs - ws) * smooth((edge - band) / (refDepth - band));
  const hashCell = rs, acc = new Map(), akey = (x, y) => Math.floor(x / hashCell) + ',' + Math.floor(y / hashCell);
  const floorNuclei = [];
  const place = (x, y, region, door = false) => { const nu = { x, y, wall: false, region, door }; floorNuclei.push(nu); const k = akey(x, y); let b = acc.get(k); if (!b) acc.set(k, b = []); b.push(nu); return nu; };
  const clearOf = (x, y, r) => { const cx = Math.floor(x / hashCell), cy = Math.floor(y / hashCell), r2 = r * r; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const b = acc.get((cx + dx) + ',' + (cy + dy)); if (!b) continue; for (const q of b) if ((q.x - x) ** 2 + (q.y - y) ** 2 < r2) return false; } return true; };
  // the room-centre seed — grows to ~rs (twice the player width)
  for (let ri = 0; ri < rec.rooms.length; ri++) { const r = rec.rooms[ri]; if (r.door < 0) continue; const x = r.x - ox, y = r.y - oy; if (wallDist(x, y) > band) place(x, y, ri); }
  // door bridges so the threshold reads as a gap, not a doormat
  for (const r of rec.rooms) { const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []); for (const [a, b] of dp) { const ca = rec.cells[a], cb = rec.cells[b]; for (const t of [0.3, 0.7]) { const x = (ca.x + (cb.x - ca.x) * t) - ox, y = (ca.y + (cb.y - ca.y) * t) - oy; if (clearOf(x, y, ws * 0.8)) place(x, y, regionAt(x, y), true); } } }
  // graded dart-throwing over a GLOBAL jittered lattice (not per-chunk), so the floor nuclei in the
  // overlap of two chunks are identical → the concourse tiles meet across a port without a jump.
  for (const p of globalDarts(ox, oy, W, H, ws, 0.6)) {
    if (!inConvex(p.x, p.y, lpoly, lcx, lcy)) continue;
    const e = wallDist(p.x, p.y); if (e <= band && !atPort(p.x, p.y)) continue;
    if (clearOf(p.x, p.y, localSpacing(e))) place(p.x, p.y, regionAt(p.x, p.y));
  }

  // ── 3. paint the Voronoi of {wall ∪ floor} nuclei ──
  const nuclei = wallNuclei.concat(floorNuclei);
  const paintGrid = bucketGrid(nuclei, Math.max(rs, ws) * 1.8);
  // clip every cell to the chunk polygon so NOTHING bleeds across the seam (no big strips, no overlap
  // that shifts when the neighbour streams in) — abutting chunks meet exactly on the shared edge line.
  const cells = nuclei.map((nu) => ({ wall: nu.wall, region: nu.wall ? -3 : nu.region, door: !!nu.door, x: nu.x, y: nu.y, poly: clipToConvex(clipCell(nu, paintGrid.near(nu.x, nu.y), rs * 3), lpoly, lcx, lcy) })).filter((c) => c.poly.length >= 3);
  const scene = { W, H, wallSpacing: ws, roomSpacing: rs, nuclei };

  // ── 4. small wall-grown lamps per ROOM — a small glyph (len), big REACH (len·reach) ──
  const rng = mulberry32((Math.imul(seed, 2654435761)) >>> 0);
  const lights = [];
  rec.rooms.forEach((r, ri) => {
    if (r.door < 0 || !r.cells || !r.cells.length) return;
    const rx = r.x - ox, ry = r.y - oy, cand = [];
    for (const ci of r.cells) { const v = rec.cells[ci].poly; for (let k = 0; k < v.length; k++) { if (!isWallEdge(ci, v[k][2])) continue; const a = v[k], b = v[(k + 1) % v.length]; cand.push({ x: (a[0] + b[0]) / 2 - ox, y: (a[1] + b[1]) / 2 - oy }); } }
    if (!cand.length) return;
    const chosen = [cand[(rng() * cand.length) | 0]];
    while (chosen.length < Math.min(o.perRoom, cand.length)) { let best = null, bd = -1; for (const p of cand) { let m = Infinity; for (const q of chosen) m = Math.min(m, (p.x - q.x) ** 2 + (p.y - q.y) ** 2); if (m > bd) { bd = m; best = p; } } chosen.push(best); }
    for (const p of chosen) { const g = lightGenome(rng); let nx = rx - p.x, ny = ry - p.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl; const len = pw * (0.9 + g.len * 0.4) * o.fixture; lights.push({ x: p.x, y: p.y, nx, ny, len, model: g, room: ri, tip: { x: p.x + nx * len * 0.95, y: p.y + ny * len * 0.95 } }); }
  });
  tintLights(lights, (room) => hexHue(rec.rooms[room] && rec.rooms[room].color));

  // ── 5. ray-trace EVERY tile (walls too, so they rim-light) → role/stone albedo × occluded light ──
  // v4's method: bake an OCCLUDED light field on a grid ONCE (splat each lamp through the walls), then
  // SAMPLE it per tile — O(1) per cell, not a ray per cell. A wall texel is occluded (dark), so a wall
  // cell takes the brightest of its neighbour texels → it rim-lights off the lit floor beside it.
  const occ = occlusionGrid(scene, ws);
  const reach = o.reach, LS = ws, bw = Math.ceil(W / LS) + 1, bh = Math.ceil(H / LS) + 1, field = new Float32Array(bw * bh * 3);
  for (const L of lights) {
    const R = L.len * reach, ex = L.tip.x, ey = L.tip.y, R2 = R * R, foot = R * 3.2;
    const bx0 = Math.max(0, Math.floor((ex - foot) / LS)), bx1 = Math.min(bw - 1, Math.ceil((ex + foot) / LS));
    const by0 = Math.max(0, Math.floor((ey - foot) / LS)), by1 = Math.min(bh - 1, Math.ceil((ey + foot) / LS));
    for (let by = by0; by <= by1; by++) { const sy = by * LS; for (let bx = bx0; bx <= bx1; bx++) { const sx = bx * LS, dx = sx - ex, dy = sy - ey, fall = 1 / (1 + (dx * dx + dy * dy) / R2); if (fall < 0.03 || !visible(occ, ex, ey, sx, sy)) continue; const bi = (by * bw + bx) * 3; field[bi] += L.rgb[0] * fall; field[bi + 1] += L.rgb[1] * fall; field[bi + 2] += L.rgb[2] * fall; } }
  }
  const lumG = (gx, gy) => { const bi = (gy * bw + gx) * 3; return 0.3 * field[bi] + 0.6 * field[bi + 1] + 0.1 * field[bi + 2]; };
  const floorLum = (x, y) => lumG(clamp(Math.round(x / LS), 0, bw - 1), clamp(Math.round(y / LS), 0, bh - 1));
  const wallLum = (x, y) => { const x0 = clamp(Math.floor(x / LS), 0, bw - 1), y0 = clamp(Math.floor(y / LS), 0, bh - 1); let mx = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const l = lumG(clamp(x0 + dx, 0, bw - 1), clamp(y0 + dy, 0, bh - 1)); if (l > mx) mx = l; } return mx; };
  const baseOf = (region, door) => region === -1 ? ROAD_RGB : region === -2 ? VOID_RGB : (door ? DOOR_RGB : hexRGB(rec.rooms[region] && rec.rooms[region].color));
  const paintCells = cells.map((c) => {
    const lum = c.wall ? wallLum(c.x, c.y) : floorLum(c.x, c.y);
    const base = c.wall ? WALL_RGB : baseOf(c.region, c.door);
    const g = c.wall ? (o.wallAmb + lum * o.wallGain) : (o.ambient + lum * o.lgain);
    return { wall: c.wall, color: `rgb(${clamp(base[0] * g, 0, 255) | 0},${clamp(base[1] * g, 0, 255) | 0},${clamp(base[2] * g, 0, 255) | 0})`, x: c.x + ox, y: c.y + oy, poly: c.poly.map((p) => [p[0] + ox, p[1] + oy]) };
  });

  // ── 6. a SMALL art-deco component per room (player-relative), seated clear of walls, lit by the field ──
  const comps = [];
  rec.rooms.forEach((r, ri) => {
    if (r.door < 0) return;
    const rx = r.x - ox, ry = r.y - oy;
    let bp = null, best = -Infinity;
    for (const c of cells) { if (c.wall || c.region !== ri) continue; const score = wallDist(c.x, c.y) - 0.18 * Math.hypot(c.x - rx, c.y - ry); if (score > best) { best = score; bp = c; } }
    if (!bp) return;
    const rr = clamp(wallDist(bp.x, bp.y) * 0.62, pw * 0.6, pw * 1.35) * o.fixture;
    comps.push({ cx: bp.x + ox, cy: bp.y + oy, r: rr, accent: r.color || '#9b6b3a', glyph: r.glyph || '', role: r.role,
      lit: clamp(floorLum(bp.x, bp.y) * 1.25 + 0.2, 0.4, 1.2), g: deviceGenome(mulberry32((Math.imul(ri * 733 + 13, 1 + seed)) >>> 0), { sharp: true }) });
  });

  // ── 7. pre-light each lamp + lift everything to world coordinates ──
  for (const L of lights) { L.lit = clamp(floorLum(L.tip.x, L.tip.y) + 0.55, 0.7, 1.15); L.x += ox; L.y += oy; L.tip.x += ox; L.tip.y += oy; }

  return { paintCells, comps, lights, poly: rec.poly, ports: rec.ports, wallSpacing: ws, roomSpacing: rs, playerW: pw, cellCount: paintCells.length };
}
