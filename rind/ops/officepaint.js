// officepaint.js — the v101 PAINT layer for the office floor: skin.js's retile-and-bake, re-founded
// on the officeweave world and CHUNKED BY SIGHT. The engine's chamber tiles are BONES; this module
// reads only the membranes (the kernel's trimmed walls — which already carry the door gaps, plaza
// openness and level-locality) and injects a fresh PLAYER-SCALED Voronoi mesh per paint-chunk:
//
//   • WALL nuclei — tight (½·playerW) along the real wall pieces → thin stone walls with real body;
//   • FLOOR nuclei — a seed at each room centre, graded darts (fine at walls → coarse mid-room)
//     from a GLOBAL position-hashed lattice, so abutting chunks lay identical nuclei (seamless);
//   • DOOR bridges — two nuclei across each doorway so the threshold reads as a warm gap.
//
// Then the v101 bake: wall lamps + components + bollards splat an OCCLUDED light field through the
// same wall tiling (v5/lights.occlusionGrid/visible), each tile is painted albedo × light (albedo =
// the owning THREAD's hue — solid threads; the role enters through the light), walls rim-light, and
// the voronoi-grown WALL FIXTURES (consoles.growWallFixtures) erupt from each room's own tiles.
//
// A paint-chunk is a PC×PC world square per stratum, baked ONCE into an offscreen canvas on first
// sight and cached — the LOS fog is the chunking economy: you only ever pay for what you can see.
// planChunk() is PURE (node-tested: determinism, seam agreement, coverage); bakeChunk() needs a
// canvas and lives browser-side only.

import { bucketGrid, clipCell } from './v101/v5/voronoi.js';
import { occlusionGrid, visible, hslToRgb } from './v101/v5/lights.js';
import { growWallFixtures, drawWallFixture, ROLE_CONSOLE } from './v101/consoles.js';
import { mulberry32 } from './v100/voronoi.js';
import { HALL, plazaRf } from './officeweave.js';

export const PAINT_DEFAULTS = { chunk: 384, scale: 2.5 };   // 2.5 px/world — crisp at the half-zoom view, ~40% less canvas memory
const WALL_RGB = [27, 32, 41], DOOR_RGB = [120, 92, 50], ROAD_RGB = [44, 70, 60], DARK = [8, 11, 16];
const OBSIDIAN = [12, 13, 21];   // tier 2: the polished obsidian ledger — concourse floors reflect the light, not the hue
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hexHue = (h) => { const c = hex2rgb(h), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0; if (mx !== mn) { const d = mx - mn; hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; } return hh; };

// skin.js's seamless helpers: a position hash → a GLOBAL jittered lattice, so a floor candidate at
// world cell (gi,gj) lands at the same world point whichever chunk asks.
const hsh = (a, b) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + 0x9e3779b1) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function* globalDarts(wx0, wy0, W, H, spacing, jit) {
  const gi0 = Math.floor(wx0 / spacing) - 1, gi1 = Math.ceil((wx0 + W) / spacing) + 1, gj0 = Math.floor(wy0 / spacing) - 1, gj1 = Math.ceil((wy0 + H) / spacing) + 1;
  for (let gj = gj0; gj <= gj1; gj++) for (let gi = gi0; gi <= gi1; gi++) {
    const x = (gi + 0.5) * spacing + (hsh(gi, gj) - 0.5) * jit * spacing, y = (gj + 0.5) * spacing + (hsh(gi * 131 + 7, gj * 131 + 9) - 0.5) * jit * spacing;
    yield { x, y };   // WORLD coords
  }
}

// ── the PURE plan: the retiled mesh of one paint-chunk (ix,iy) on one stratum ────────────────
export function planChunk(world, ix, iy, stratum, opts = {}) {
  const m = world.m, PC = opts.chunk ?? PAINT_DEFAULTS.chunk;
  const pw = opts.playerW ?? m.pitch / 4.5, ws = pw * 0.5, rs = pw * 2, band = ws * 0.8, refDepth = rs * 1.6;
  const M = Math.max(2 * rs, m.pitch);                     // margin: nuclei + occlusion beyond the rect
  const ox = ix * PC - M, oy = iy * PC - M, SZ = PC + 2 * M;   // LOCAL frame [0, SZ); tiles live in [M, M+PC)
  const zMid = m.thickness / 2, zb = 0.9 * m.vpitch;
  const inStrat = (z) => stratum === 'U' ? z >= zMid - zb : z <= zMid + zb;
  // convex point-in-hexagon (the footprint is centred on the origin)
  const fp = m.footprint;
  const inHex = (wx, wy) => { for (let i = 0; i < fp.length; i++) { const a = fp[i], b = fp[(i + 1) % fp.length], ex = b[0] - a[0], ey = b[1] - a[1]; const s = ex * (0 - a[1]) - ey * (0 - a[0]); if ((ex * (wy - a[1]) - ey * (wx - a[0])) * s < -1e-9) return false; } return true; };

  // 1) WALL nuclei along the kernel's trimmed wall pieces (this stratum + the sealed rim)
  const nuclei = [], seenW = new Set(), snap = ws * 0.5;
  const addWall = (wx, wy) => {
    const lx = wx - ox, ly = wy - oy; if (lx < 0 || ly < 0 || lx >= SZ || ly >= SZ) return;
    const k = Math.round(lx / snap) + ',' + Math.round(ly / snap); if (seenW.has(k)) return; seenW.add(k);
    nuclei.push({ x: lx, y: ly, wall: true });
  };
  for (const s of world.walls) {
    if (!(s.b < 0 || inStrat(s.z))) continue;
    const x0 = Math.min(s.x1, s.x2), x1 = Math.max(s.x1, s.x2), y0 = Math.min(s.y1, s.y2), y1 = Math.max(s.y1, s.y2);
    if (x1 < ox || x0 > ox + SZ || y1 < oy || y0 > oy + SZ) continue;
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), n = Math.max(1, Math.round(len / ws));
    for (let i = 0; i <= n; i++) addWall(s.x1 + (s.x2 - s.x1) * i / n, s.y1 + (s.y2 - s.y1) * i / n);
  }
  const wallGrid = bucketGrid(nuclei.length ? nuclei : [{ x: -1e9, y: -1e9 }], Math.max(rs, ws * 4));
  const wallDist = (lx, ly) => { let bd = Infinity; for (const q of wallGrid.near(lx, ly)) { const d = (q.x - lx) ** 2 + (q.y - ly) ** 2; if (d < bd) bd = d; } return Math.sqrt(bd); };

  // 2) REGION lookup — nearest stratum chamber decides which thread/room a paint tile belongs to.
  // Inside the PLAZA the stratum is the KIND (U = the white concourse, L = the engines' — the same
  // rule sight uses), so the plaza paint is one kind's floor, not a strata confetti.
  const cells = world.cells, strat = [];
  const pR = plazaRf(m) * m.R, pR2 = pR * pR;
  for (const c of cells) {
    if (!c.owner) continue;
    const plaza = c.x * c.x + c.y * c.y < pR2;
    if (plaza ? (c.owner.kind === 'white') !== (stratum === 'U') : !inStrat(c.z)) continue;
    const lx = c.x - ox, ly = c.y - oy; if (lx < -rs || ly < -rs || lx > SZ + rs || ly > SZ + rs) continue;
    strat.push({ x: lx, y: ly, gi: c.gi });
  }
  const regGrid = bucketGrid(strat.length ? strat : [{ x: -1e9, y: -1e9, gi: -1 }], m.pitch * 1.6);
  const keyOf = world.walk.keyOf;
  const regionAt = (lx, ly) => { let best = null, bd = Infinity; for (const q of regGrid.near(lx, ly)) { const d = (q.x - lx) ** 2 + (q.y - ly) ** 2; if (d < bd) { bd = d; best = q; } } if (!best || best.gi < 0) return null; const key = keyOf(best.gi); return key ? { key, room: world.office(key).roomOf.get(best.gi), gi: best.gi } : null; };

  // 3) FLOOR nuclei: room-centre seeds, door bridges, then the graded global darts
  const hashCell = rs, acc = new Map(), akey = (x, y) => Math.floor(x / hashCell) + ',' + Math.floor(y / hashCell);
  const floorN = [];
  const place = (lx, ly, door = false) => { const nu = { x: lx, y: ly, wall: false, door }; floorN.push(nu); const k = akey(lx, ly); let b = acc.get(k); if (!b) acc.set(k, b = []); b.push(nu); return nu; };
  const clearOf = (lx, ly, r) => { const cx = Math.floor(lx / hashCell), cy = Math.floor(ly / hashCell), r2 = r * r; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const b = acc.get((cx + dx) + ',' + (cy + dy)); if (!b) continue; for (const q of b) if ((q.x - lx) ** 2 + (q.y - ly) ** 2 < r2) return false; } return true; };
  for (const key of world.threads.keys()) {
    const off = world.office(key);
    for (const r of off.rooms) { const c = cells[r.compGi]; if (!inStrat(c.z)) continue; const lx = r.cx - ox, ly = r.cy - oy; if (lx < 0 || ly < 0 || lx >= SZ || ly >= SZ) continue; if (wallDist(lx, ly) > band) place(lx, ly); }
  }
  for (const p of world.doorPts) {
    const a = cells[p.a], b = cells[p.b]; if (!inStrat(a.z) && !inStrat(b.z)) continue;
    for (const t of [0.3, 0.7]) { const lx = (a.x + (b.x - a.x) * t) - ox, ly = (a.y + (b.y - a.y) * t) - oy; if (lx < 0 || ly < 0 || lx >= SZ || ly >= SZ) continue; if (clearOf(lx, ly, ws * 0.8)) place(lx, ly, true); }
  }
  const localSpacing = (e) => ws + (rs - ws) * smooth((e - band) / (refDepth - band));
  for (const p of globalDarts(ox, oy, SZ, SZ, ws, 0.6)) {
    const lx = p.x - ox, ly = p.y - oy; if (lx < 0 || ly < 0 || lx >= SZ || ly >= SZ) continue;
    if (!inHex(p.x, p.y)) continue;
    const e = wallDist(lx, ly); if (e <= band) continue;
    if (clearOf(lx, ly, localSpacing(e))) place(lx, ly);
  }
  const all = nuclei.concat(floorN);

  // 4) TILES — the Voronoi of {wall ∪ floor}, clipped to the chunk rect (in [M, M+PC)) + the hexagon
  const paintGrid = bucketGrid(all, Math.max(rs, ws) * 1.8);
  const clipRect = (poly) => {
    let out = poly;
    const edges = [[M, 0, 1, 0], [M + PC, 0, -1, 0], [0, M, 0, 1], [0, M + PC, 0, -1]];   // x≥M, x≤M+PC, y≥M, y≤M+PC
    for (const [c0, c1, nx, ny] of edges) {
      const np = [];
      for (let i = 0; i < out.length; i++) {
        const A = out[i], B = out[(i + 1) % out.length];
        const da = nx !== 0 ? (A[0] - c0) * nx : (A[1] - c1) * ny, db = nx !== 0 ? (B[0] - c0) * nx : (B[1] - c1) * ny;
        if (da >= 0) np.push(A);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); np.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
      }
      out = np; if (out.length < 3) return [];
    }
    return out;
  };
  const tiles = [];
  for (const nu of all) {
    if (nu.x < M - rs || nu.y < M - rs || nu.x >= M + PC + rs || nu.y >= M + PC + rs) continue;
    if (!inHex(nu.x + ox, nu.y + oy)) continue;
    const poly = clipRect(clipCell(nu, paintGrid.near(nu.x, nu.y), rs * 3));
    if (poly.length < 3) continue;
    const reg = nu.wall ? null : regionAt(nu.x, nu.y);
    tiles.push({ x: nu.x, y: nu.y, wall: !!nu.wall, door: !!nu.door, region: reg, room: reg && reg.room !== HALL ? reg.room : -1, key: reg ? reg.key : null, poly });
  }
  return { ix, iy, stratum, ox, oy, PC, M, SZ, ws, rs, pw, nuclei: all, tiles, inStrat };
}

// ── the BAKE (browser-side): occluded light field → tiles painted albedo × light → fixtures ──
export function bakeChunk(world, plan, { hueOf, scale = PAINT_DEFAULTS.scale, seed = 1 } = {}) {
  const m = world.m, cells = world.cells, { PC, M, SZ, ws, rs, ox, oy } = plan;
  const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(PC * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale); ctx.translate(-M, -M);

  const scene = { W: SZ, H: SZ, wallSpacing: ws, roomSpacing: rs, nuclei: plan.nuclei };
  const occ = occlusionGrid(scene, ws);

  // emitters in reach, on this stratum, in LOCAL coords, hued by their room (the role enters
  // through the LIGHT — the floor albedo stays the thread's). Pool sizes are v101's: small
  // emitters, big reach — many overlapping city-block pools blow the field out.
  const lights = [];
  const reach = 3.2, pad = m.pitch * 4;
  for (const key of world.threads.keys()) {
    const off = world.office(key);
    const inBox = (x, y) => x > ox - pad && y > oy - pad && x < ox + SZ + pad && y < oy + SZ + pad;
    for (const e of off.emitters) {
      const c = cells[e.gi]; if (!plan.inStrat(c.z) || !inBox(e.x, e.y)) continue;
      let rgb, len;
      if (e.kind === 'comp') { const r = off.rooms.find((rr) => rr.id === e.room); rgb = hslToRgb(hexHue(e.color), 0.7, 0.52 + (r ? r.emit : 0.5) * 0.16); len = m.pitch * 0.5 * (0.7 + (r ? r.emit : 0.5) * 0.5); }
      else if (e.kind === 'lamp') { rgb = hslToRgb(hexHue(e.color), 0.72, 0.6); len = e.len * 0.7; }
      else { rgb = [0.9, 0.72, 0.42]; len = m.pitch * 0.42; }
      const tip = e.tip || { x: e.x, y: e.y };
      lights.push({ x: tip.x - ox, y: tip.y - oy, len, rgb });
    }
  }
  // the field (skin.js step 5): splat each light through the walls onto a ws grid
  const LS = ws, bw = Math.ceil(SZ / LS) + 1, bh = bw, field = new Float32Array(bw * bh * 3);
  for (const L of lights) {
    const R = L.len * reach, R2 = R * R, foot = R * 3.2;
    const bx0 = Math.max(0, Math.floor((L.x - foot) / LS)), bx1 = Math.min(bw - 1, Math.ceil((L.x + foot) / LS));
    const by0 = Math.max(0, Math.floor((L.y - foot) / LS)), by1 = Math.min(bh - 1, Math.ceil((L.y + foot) / LS));
    for (let by = by0; by <= by1; by++) { const sy = by * LS; for (let bx = bx0; bx <= bx1; bx++) { const sx = bx * LS, dx = sx - L.x, dy = sy - L.y, fall = 1 / (1 + (dx * dx + dy * dy) / R2); if (fall < 0.03 || !visible(occ, L.x, L.y, sx, sy)) continue; const bi = (by * bw + bx) * 3; field[bi] += L.rgb[0] * fall; field[bi + 1] += L.rgb[1] * fall; field[bi + 2] += L.rgb[2] * fall; } }
  }
  const lumG = (gx, gy) => { const bi = (clamp(gy, 0, bh - 1) * bw + clamp(gx, 0, bw - 1)) * 3; return 0.3 * field[bi] + 0.6 * field[bi + 1] + 0.1 * field[bi + 2]; };
  const floorLum = (x, y) => lumG(Math.round(x / LS), Math.round(y / LS));
  const wallLum = (x, y) => { const x0 = Math.floor(x / LS), y0 = Math.floor(y / LS); let mx = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const l = lumG(x0 + dx, y0 + dy); if (l > mx) mx = l; } return mx; };

  // paint every tile: albedo (thread hue / stone / threshold) × occluded light
  for (const t of plan.tiles) {
    let base, g;
    if (t.wall) { base = WALL_RGB; g = clamp(0.3 + wallLum(t.x, t.y) * 0.62, 0, 1.35); }
    else if (t.door) { base = DOOR_RGB; g = clamp(0.55 + floorLum(t.x, t.y) * 0.9, 0, 1.5); }
    else if (!t.key) { base = DARK; g = 0.6; }
    else if (t.room < 0) {   // the concourse: obsidian underfoot, polished — a wider specular range so pooled light reads as reflection
      base = OBSIDIAN; g = clamp(0.35 + floorLum(t.x, t.y) * 1.5, 0, 2.2);
    } else {
      base = mix(DARK, hueOf(t.key), 0.58);
      g = clamp(0.46 + floorLum(t.x, t.y) * 0.95, 0, 1.55);
    }
    ctx.fillStyle = `rgb(${clamp(base[0] * g, 0, 255) | 0},${clamp(base[1] * g, 0, 255) | 0},${clamp(base[2] * g, 0, 255) | 0})`;
    ctx.beginPath(); t.poly.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
  }

  // WALL FIXTURES — one per room whose anchor lands in this chunk's rect, grown from its own tiles
  const roomLocal = new Map(); let nextId = 0;   // (threadKey/roomId) → local numeric id
  const roomSeeds = [], roomCells = [], fxAvoid = {}, fxDoors = {}, accentOf = [], roleOf = [];
  for (const key of world.threads.keys()) {
    const off = world.office(key);
    for (const r of off.rooms) {
      const c = cells[r.compGi]; if (!plan.inStrat(c.z)) continue;
      const lx = r.cx - ox, ly = r.cy - oy; if (lx < M || ly < M || lx >= M + PC || ly >= M + PC) continue;
      const id = nextId++;
      roomLocal.set(key + '/' + r.id, id);
      roomSeeds[id] = { x: lx, y: ly }; roomCells.push({ id });
      accentOf[id] = r.color; roleOf[id] = r.role;
      fxAvoid[id] = (r.lamps || []).map((L) => ({ x: L.tip.x - ox, y: L.tip.y - oy }));
      fxAvoid[id].push({ x: cells[r.compGi].x - ox, y: cells[r.compGi].y - oy });   // keep off the medallion
      fxDoors[id] = off.doors.filter((d) => d.rooms.includes(r.id)).flatMap((d) => [{ x: cells[d.a].x - ox, y: cells[d.a].y - oy }, { x: cells[d.b].x - ox, y: cells[d.b].y - oy }]);
    }
  }
  const fxTiles = plan.tiles.map((t) => ({ ...t, room: t.key != null && t.room >= 0 && roomLocal.has(t.key + '/' + t.room) ? roomLocal.get(t.key + '/' + t.room) : -1 }));
  const fxScene = { W: SZ, H: SZ, wallSpacing: ws, roomSpacing: rs, roomSize: rs * 8, nuclei: fxTiles, paintCells: fxTiles, roomCells, roomSeeds };
  const rng = mulberry32(((seed ^ Math.imul(plan.ix * 73856093 ^ plan.iy * 19349663 ^ (plan.stratum === 'U' ? 7 : 13), 2654435761)) >>> 0) || 1);
  const fixtures = growWallFixtures(fxScene, rng, { avoid: fxAvoid, doors: fxDoors, maxAreaFrac: 0.2, kindOf: (rid) => ROLE_CONSOLE[roleOf[rid]] || 'storage' });
  for (const F of fixtures) drawWallFixture(ctx, fxScene, F, { accent: accentOf[F.room] || '#9b6b3a', hue: hexHue(accentOf[F.room] || '#9b6b3a'), litAt: (x, y) => clamp(0.35 + floorLum(x, y), 0.3, 1.2) });

  return cv;
}

if (typeof globalThis !== 'undefined') globalThis.RindOfficePaint = { planChunk, bakeChunk, PAINT_DEFAULTS };
