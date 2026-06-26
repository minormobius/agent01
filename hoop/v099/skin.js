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
import { occlusionGrid, visible, tintLights, lightGenome, hslToRgb } from './v5/lights.js';
import { deviceGenome } from './v5/deco.js';
import { growWallFixtures, ROLE_CONSOLE } from './consoles.js';

// Everything is keyed to the player. ws = ½·playerW (tight walls), rs = 2·playerW (big room centres).
export const SKIN_DEFAULTS = { playerW: 6, perRoom: 2, reach: 3.4, ambient: 0.5, lgain: 1.05, wallAmb: 0.3, wallGain: 0.62, fixture: 1, fixtureArea: 0.2 };
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
// is a local point inside the chunk polygon? RAY-CAST crossing test — works for ANY simple polygon,
// convex OR non-convex (so a deformed tessellation tile, not just a hexagon). (cx,cy unused; kept for the
// old call shape.)
function inConvex(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// clip a CONVEX cell `sub` to the chunk polygon `poly` = their intersection, so a cell never bleeds across
// a seam. Sutherland–Hodgman only needs the clip WINDOW to be convex — the CELL is, the polygon may NOT be
// (tessellation tiles wiggle) — so we clip the POLYGON (subject) against the CELL (window). Same region as
// the old cell-vs-convex-poly clip when the chunk is convex; correct for non-convex chunks too.
function clipToConvex(sub, poly) {
  if (!sub || sub.length < 3) return [];
  let scx = 0, scy = 0; for (const p of sub) { scx += p[0]; scy += p[1]; } scx /= sub.length; scy /= sub.length;
  let out = poly;
  for (let i = 0; i < sub.length && out.length >= 3; i++) {
    const a = sub[i], b = sub[(i + 1) % sub.length], ex = b[0] - a[0], ey = b[1] - a[1], sref = ex * (scy - a[1]) - ey * (scx - a[0]);
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
  // PERIMETER (v091 — the seam wobble): seed wall nuclei along the chunk POLYGON edges, walking from the
  // canonically-ordered endpoint with gaps at ports. The CORNERS stay pinned to the shared polygon
  // vertices (so the hull tessellates and neighbours meet at the same corners), but the in-between nuclei
  // get a deterministic perpendicular-INWARD + along-edge jitter keyed to global position — a voronoi-
  // flavoured wobble that breaks the ruler-straight wall band so the lit inner edge of the seam meanders
  // instead of reading as a drawn line. Every cell is still clipped to the straight polygon, so coverage
  // and no-overlap are untouched; the jitter is inward-only and ≤ the floor-exclusion band, so the hull
  // stays sealed (a floor nucleus can't leak to the edge). Abutting chunks offset toward their own
  // interiors — the seam reads naturally different from each side rather than mirror-symmetric.
  let pcx = 0, pcy = 0; for (const p of rec.poly) { pcx += p.x; pcy += p.y; } pcx /= rec.poly.length; pcy /= rec.poly.length;
  const wob = ws * 0.7, alongJit = ws * 0.45;
  for (let e = 0; e < rec.poly.length; e++) {
    const P = rec.poly[e], Q = rec.poly[(e + 1) % rec.poly.length];
    let S = P, E = Q; if (P.x > Q.x || (P.x === Q.x && P.y > Q.y)) { S = Q; E = P; }
    const evx = E.x - S.x, evy = E.y - S.y, L = Math.hypot(evx, evy) || 1, dx = evx / L, dy = evy / L, n = Math.max(1, Math.round(L / ws));
    let nxp = -dy, nyp = dx; const mx = (S.x + E.x) / 2, my = (S.y + E.y) / 2; if (nxp * (pcx - mx) + nyp * (pcy - my) < 0) { nxp = -nxp; nyp = -nyp; }   // inward normal
    for (let k = 0; k <= n; k++) {
      let wx = S.x + evx * k / n, wy = S.y + evy * k / n;
      if (k > 0 && k < n) {   // pin the corners; wobble the in-between
        const al = (hsh(Math.round(wx * 3.1 + 11), Math.round(wy * 3.1 + 7)) - 0.5) * alongJit;   // along-edge
        const pp = hsh(Math.round(wx), Math.round(wy)) * wob;                                       // perpendicular, inward
        wx += dx * al + nxp * pp; wy += dy * al + nyp * pp;
      }
      addWall(wx - ox, wy - oy, true);
    }
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
  // each cell carries its ROOM (a room id ≥ 0, or −1 for concourse/void/wall) so the voronoi-grown
  // wall fixtures (step 8) can claim a cluster of a room's OWN cells and march to its membrane.
  const cells = nuclei.map((nu) => ({ wall: nu.wall, region: nu.wall ? -3 : nu.region, room: nu.wall ? -1 : (nu.region >= 0 ? nu.region : -1), door: !!nu.door, x: nu.x, y: nu.y, poly: clipToConvex(clipCell(nu, paintGrid.near(nu.x, nu.y), rs * 3), lpoly, lcx, lcy) })).filter((c) => c.poly.length >= 3);
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

  // ── 4b. CONCOURSE light fixtures (v091) — the walkway was DANK. Scatter warm, free-standing bollard
  // lamps along the concourse (region −1 floor cells), spaced ≈ 2.4·roomSpacing, so light pools down the
  // corridor and spills into doorways instead of leaving it black. Warm gold (hue 40), independent of the
  // room hues. Per-chunk + deterministic: cells ordered by a position hash, greedily thinned, ports skipped
  // (lamp positions near a seam would differ per chunk). ──
  const concSpacing = rs * 2.4, cs2 = concSpacing * concSpacing, concChosen = [];
  const concCells = cells.filter((c) => !c.wall && c.region === -1);
  concCells.sort((a, b) => (hsh(Math.round(a.x), Math.round(a.y)) - hsh(Math.round(b.x), Math.round(b.y))) || (a.x - b.x) || (a.y - b.y));
  for (const c of concCells) {
    if (atPort(c.x, c.y)) continue;
    let okc = true; for (const q of concChosen) if ((q.x - c.x) ** 2 + (q.y - c.y) ** 2 < cs2) { okc = false; break; }
    if (okc) concChosen.push(c);
  }
  const concLights = concChosen.map((c) => { const g = lightGenome(rng); const len = pw * (1.0 + g.len * 0.5) * o.fixture; return { x: c.x, y: c.y, nx: 0, ny: -1, len, model: g, room: -1, concourse: true, hue: 40, rgb: hslToRgb(40, 0.5, 0.6), tip: { x: c.x, y: c.y } }; });

  // ── 4c. VORONOI-GROWN WALL FIXTURES (grown BEFORE the component now, so the component can sit away
  // from them and BOTH can feed the light bake). The fixture CLAIMS a cluster of a room's own cells at a
  // corner/wall (off the door, away from the lamps, biased off the concourse) and erupts them into a
  // gold-seamed structure. Grown in LOCAL coords; tip/anchor lifted to world in step 7. The claimed
  // indices are into `cells`, 1:1 with `paintCells`, so the page repaints those exact tiles. ──
  const fxAvoid = {};
  rec.rooms.forEach((r, ri) => { if (r.door >= 0) fxAvoid[ri] = []; });
  for (const L of lights) if (L.room >= 0 && fxAvoid[L.room]) fxAvoid[L.room].push({ x: L.tip.x, y: L.tip.y });
  const roomSeeds = [], roomCells = [], doors = {};
  rec.rooms.forEach((r, ri) => {
    if (r.door < 0) return;
    roomSeeds[ri] = { x: r.x - ox, y: r.y - oy }; roomCells.push({ id: ri });
    // the door cells (room side + concourse side, incl. the widened pair) — kept clear; doors are
    // non-navigable, so a fixture must never cover one.
    const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []);
    const pts = []; for (const pair of dp) for (const ci of pair) if (ci >= 0 && rec.cells[ci]) pts.push({ x: rec.cells[ci].x - ox, y: rec.cells[ci].y - oy });
    doors[ri] = pts;
  });
  const fxScene = { W, H, wallSpacing: ws, roomSpacing: rs, roomSize: rs * 8, nuclei: cells, paintCells: cells, roomCells, roomSeeds };
  const fixtures = growWallFixtures(fxScene, mulberry32((Math.imul(seed, 40503) + 7) >>> 0), { avoid: fxAvoid, doors, maxAreaFrac: o.fixtureArea, kindOf: (room) => ROLE_CONSOLE[rec.rooms[room] && rec.rooms[room].role] || 'storage' });
  // a per-room map of the fixture's claimed-tile centres (LOCAL) — the central component biases away
  // from these so the two fixtures never crowd; also the centroid for the fixture's own emitter.
  const fxPts = {}, fxLights = [];
  for (const F of fixtures) {
    const r = rec.rooms[F.room]; F.accent = (r && r.color) || '#9b6b3a'; F.hue = hexHue(r && r.color);
    const pts = []; for (const cl of F.cells) if (!cl.base) { const c = cells[cl.idx]; if (c) pts.push({ x: c.x, y: c.y }); }
    (fxPts[F.room] = fxPts[F.room] || []).push(...pts);
    // FLOOR FIXTURE IS LUMINOUS: a room-hued emitter at the eruption tip, so it lights its corner and
    // joins the ray-traced field (on top of the gold seams + the emissive crown drawn in the page).
    const len = rs * 0.95 * o.fixture;
    fxLights.push({ x: F.tip.x, y: F.tip.y, nx: F.nx, ny: F.ny, len, model: null, room: F.room, fx: true, hue: F.hue, rgb: hslToRgb(F.hue, 0.72, 0.56), tip: { x: F.tip.x, y: F.tip.y } });
  }

  // ── 4d. the CENTRAL component per room, computed BEFORE the light bake so it can EMIT (v091). The
  // deco medallion is a real luminous source, its emission DERIVED FROM ITS CONSTRUCTION: a higher-
  // symmetry, rosetted, sun-burst superformula reads as more "energised", so it glows brighter. It
  // anchors clear of walls, near centre, AND biased away from the room's floor fixture so the two don't
  // crowd; then a room-hued emitter at its core lights the room FROM it. ──
  const compAnchors = [];
  rec.rooms.forEach((r, ri) => {
    if (r.door < 0) return;
    const rx = r.x - ox, ry = r.y - oy, fp = fxPts[ri] || []; let bp = null, best = -Infinity;
    for (const c of cells) {
      if (c.wall || c.region !== ri) continue;
      let fxNear = 0; if (fp.length) { let md = Infinity; for (const p of fp) md = Math.min(md, (p.x - c.x) ** 2 + (p.y - c.y) ** 2); fxNear = Math.min(Math.sqrt(md), rs * 2.5); }
      const score = wallDist(c.x, c.y) - 0.18 * Math.hypot(c.x - rx, c.y - ry) + 0.5 * fxNear;   // away from the floor fixture
      if (score > best) { best = score; bp = c; }
    }
    if (!bp) return;
    const rr = clamp(wallDist(bp.x, bp.y) * 0.62, pw * 0.6, pw * 1.35) * o.fixture;
    const g = deviceGenome(mulberry32((Math.imul(ri * 733 + 13, 1 + seed)) >>> 0), { sharp: true });
    const emit = clamp(0.35 + (g.sym / 12) * 0.5 + (g.rosette ? 0.18 : 0) + (g.sun ? 0.12 : 0), 0.3, 1);   // luminescence from the construct
    const hue = hexHue(r.color);
    compAnchors.push({ ri, x: bp.x, y: bp.y, rr, g, emit, hue, accent: r.color || '#9b6b3a', glyph: r.glyph || '', role: r.role });
  });
  const compLights = compAnchors.map((a) => { const len = a.rr * (0.9 + a.emit * 0.6); return { x: a.x, y: a.y, nx: 0, ny: -1, len, model: null, room: a.ri, comp: true, hue: a.hue, rgb: hslToRgb(a.hue, 0.7, 0.5 + a.emit * 0.18), tip: { x: a.x, y: a.y } }; });

  // the bake sees every emitter (lamps + concourse + component + floor fixture); only room + concourse
  // lamps are returned for DRAWING (component + fixture draw themselves).
  const lightsAll = lights.concat(concLights, compLights, fxLights), drawLights = lights.concat(concLights);

  // ── 5. ray-trace EVERY tile (walls too, so they rim-light) → role/stone albedo × occluded light ──
  // v4's method: bake an OCCLUDED light field on a grid ONCE (splat each lamp through the walls), then
  // SAMPLE it per tile — O(1) per cell, not a ray per cell. A wall texel is occluded (dark), so a wall
  // cell takes the brightest of its neighbour texels → it rim-lights off the lit floor beside it.
  const occ = occlusionGrid(scene, ws);
  const reach = o.reach, LS = ws, bw = Math.ceil(W / LS) + 1, bh = Math.ceil(H / LS) + 1, field = new Float32Array(bw * bh * 3);
  for (const L of lightsAll) {
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

  // ── 6. build the central components from the precomputed anchors, now lit by the field they feed ──
  const comps = compAnchors.map((a) => ({
    room: a.ri, cx: a.x + ox, cy: a.y + oy, r: a.rr, accent: a.accent, glyph: a.glyph, role: a.role,
    hue: a.hue, emit: a.emit, lit: clamp(floorLum(a.x, a.y) * 1.2 + 0.35 + a.emit * 0.25, 0.55, 1.4), g: a.g,
  }));

  // ── 7. pre-light each DRAWN lamp + lift everything to world coordinates ──
  for (const L of drawLights) { L.lit = clamp(floorLum(L.tip.x, L.tip.y) + 0.55, 0.7, 1.15); L.x += ox; L.y += oy; L.tip.x += ox; L.tip.y += oy; }
  for (const F of fixtures) { F.anchor.x += ox; F.anchor.y += oy; F.anchor.mx += ox; F.anchor.my += oy; F.tip.x += ox; F.tip.y += oy; }   // lift fixture geometry (claimed indices unchanged)

  return { paintCells, comps, lights: drawLights, fixtures, poly: rec.poly, ports: rec.ports, wallSpacing: ws, roomSpacing: rs, playerW: pw, cellCount: paintCells.length };
}
