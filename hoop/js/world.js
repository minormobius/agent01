// hoop — the canvas world. (Phase 2: infinite. Phase 3: continuous + gravity.)
//
// The fixed 48×28 room is gone. The map is an ENDLESS ship, stitched from ship.js
// chunks generated on demand around the camera (see ChunkField). You can walk
// forever; the frontier generates ahead of you, its character bent by the ship
// genome. Coordinates are unbounded world tiles — a place at (x,y) means the same
// tile on every machine for a given voyage seed.
//
// Two big substrates replaced the grid here (the "voronoi ship" rewrite):
//
//   • THE DECK IS AN ADAPTIVE VORONOI MESH, not a tile grid. Each chunk scatters
//     sites whose DENSITY follows the detail: a fine ring of sites along every
//     floor│void boundary (so plates hug the hull), tight clusters around fixtures
//     and lights, and a coarse Poisson fill in open bays. Polygon cells (half-plane
//     clipping against the 3×3-neighbour sites, so plates cross chunk seams cleanly)
//     are the unit of plating AND of the light probe — light is sampled once per
//     cell, previewing the radiance-cascade probe density the WebGPU pass will use.
//
//   • MOVEMENT IS CONTINUOUS AND GRAVITY-AWARE, not grid-stepped. The player is a
//     point with velocity; the gravity regime of the cell under their feet sets the
//     handling — normal (snappy), mag (crisp, planted), spin (a tilt-drift you walk
//     against), none (zero-g: shove off and glide until a wall). The forum layer
//     stays tile-addressed: player.x/y is always the integer tile you occupy
//     (round of the continuous px/py), so places, drops, presence and click-to-walk
//     are unchanged. app.js sees the same World API it always did.
//
// ship.js is a global script (loaded before this module), so we read it off the
// global rather than importing it.

import { drawStalk, stalkModel } from './ink.js';
import { route as navRoute, wayfan } from './nav.js';

const Ship = globalThis.HoopShip;
const C = Ship.CHUNK;
const FLOOR = Ship.TILE.FLOOR, DOOR = Ship.TILE.DOOR;
// gravity regime → a faint floor hue, so sectors read at a glance.
const GRAV_HUE = { normal: [70, 90, 80], spin: [96, 78, 120], none: [70, 120, 128], mag: [120, 96, 60] };
const SPAWN = { x: 24, y: 14 }; // the flagship landing — keeps the Hub thread reachable
const CLIP_R = 3;               // max half-extent of a plate (clip-box radius, tiles)

// ── pure mesh kernel (exported for the headless selftest) ─────────────────────
// clipCell: Voronoi cell of site A as a polygon, by clipping a box against the
// perpendicular bisectors with A's nearest neighbours. `others` = [{x,y,hull},…].
export function clipCell(A, others, R = CLIP_R) {
  let poly = [[A.x - R, A.y - R], [A.x + R, A.y - R], [A.x + R, A.y + R], [A.x - R, A.y + R]];
  const near = others
    .map((s) => [s, (s.x - A.x) ** 2 + (s.y - A.y) ** 2])
    .filter((p) => p[1] > 1e-9)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 20)
    .map((p) => p[0]);
  for (const B of near) {
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, nx = A.x - B.x, ny = A.y - B.y; // keep side toward A
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const tt = da / (da - db); out.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]); }
    }
    poly = out;
    if (poly.length < 3) break;
  }
  return poly;
}

// ── the infinite map ─────────────────────────────────────────────────────────
export class ChunkField {
  constructor(seed, genome) {
    this.seed = Ship.voyageSeed(seed);
    this.genome = genome || null;
    this.cache = new Map();
    this.sites_ = new Map();         // per-chunk adaptive site list (cached)
    this.mesh_ = new Map();          // per-chunk voronoi cells + fixtures (cached)
    this.overlay = new Set();        // "x,y" forced-floor tiles
    this._carveSpawn();
  }
  _key(cx, cy) { return cx + ',' + cy; }
  chunk(cx, cy) {
    const k = this._key(cx, cy);
    let c = this.cache.get(k);
    if (!c) {
      c = Ship.generateChunk(this.seed, cx, cy, this.genome);
      this.cache.set(k, c);
      if (this.cache.size > 256) this._evict(cx, cy);
    }
    return c;
  }
  _evict(cx, cy) {
    for (const map of [this.cache, this.sites_, this.mesh_])
      for (const k of map.keys()) { const [x, y] = k.split(',').map(Number); if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > 6) map.delete(k); }
  }
  _local(wx, wy) {
    const cx = Math.floor(wx / C), cy = Math.floor(wy / C);
    return { cx, cy, lx: wx - cx * C, ly: wy - cy * C };
  }
  tile(wx, wy) {
    if (this.overlay.has(wx + ',' + wy)) return FLOOR;
    const { cx, cy, lx, ly } = this._local(wx, wy);
    return this.chunk(cx, cy).tiles[ly * C + lx];
  }
  regime(wx, wy) {
    if (this.overlay.has(wx + ',' + wy)) return 'normal';
    const { cx, cy, lx, ly } = this._local(wx, wy);
    const g = this.chunk(cx, cy).grav[ly * C + lx];
    return Ship.GRAV_LIST[g - 1] || 'normal';
  }
  isFloor(wx, wy) { const t = this.tile(wx, wy); return t === FLOOR || t === DOOR; }
  addPlaceTile(wx, wy) { this.overlay.add(wx + ',' + wy); this.sites_.clear(); this.mesh_.clear(); } // remesh: a place adds floor

  // ── adaptive sites (deterministic per chunk) ──────────────────────────────
  // ONE plate site per floor tile — full coverage, so no hall ever reads as void
  // (the old sparse fill starved 1-tile corridors of plates) — plus a deduped hull
  // site at every void tile that touches floor, which clips the tile plates crisply
  // at the wall face and densifies plates along the hull. A site's identity depends
  // only on its home chunk, so neighbours agree on shared sites → seamless borders.
  // Bump SUBDIV>1 to subdivide each tile into a finer plate lattice.
  sites(cx, cy) {
    const k = this._key(cx, cy);
    let s = this.sites_.get(k);
    if (s) return s;
    const ch = this.chunk(cx, cy), bx = cx * C, by = cy * C, out = [];
    const jr = Ship.rngFor(this.seed, 77, cx, cy);
    const voidSeen = new Set();
    for (let ly = 0; ly < C; ly++) for (let lx = 0; lx < C; lx++) {
      const wx = bx + lx, wy = by + ly;
      if (!this.isFloor(wx, wy)) continue;
      let nearWall = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const vx = wx + dx, vy = wy + dy;
        if (!this.isFloor(vx, vy)) { nearWall = true; const vk = vx + ',' + vy; if (!voidSeen.has(vk)) { voidSeen.add(vk); out.push({ x: vx + 0.5, y: vy + 0.5, hull: true }); } }
      }
      const regime = this.regime(wx, wy);
      const SUBDIV = nearWall ? 2 : 1;       // half-size plates hug the walls; coarse in open interiors
      for (let sy = 0; sy < SUBDIV; sy++) for (let sx = 0; sx < SUBDIV; sx++) {
        const h = Ship.hashInts(this.seed, wx * SUBDIV + sx, wy * SUBDIV + sy, 3);
        const cell = 1 / SUBDIV, jit = cell * 0.42;
        out.push({
          x: wx + (sx + 0.5) * cell + (jr() - 0.5) * jit,
          y: wy + (sy + 0.5) * cell + (jr() - 0.5) * jit,
          hull: false, regime,
          albedo: [148 + ((h & 31) - 16), 158 + (((h >> 5) & 31) - 16), 166 + (((h >> 10) & 31) - 16)],
        });
      }
    }
    // garden milfoil fixtures (rendered separately; not plate sites)
    const fixtures = [];
    for (const room of ch.rooms) if (room.type === 'garden') {
      const frng = Ship.rngFor(this.seed, 55, cx * 131 + room.x, cy * 131 + room.y);
      const n = 2 + Math.floor(frng() * Math.min(5, (room.w * room.h) / 6));
      for (let i = 0; i < n; i++) {
        const lx = room.x + 1 + Math.floor(frng() * Math.max(1, room.w - 2));
        const ly = room.y + 1 + Math.floor(frng() * Math.max(1, room.h - 2));
        fixtures.push({ kind: 'stalk', wx: bx + lx + 0.5, wy: by + ly + 0.9, ang: (frng() - 0.5) * 0.5, model: stalkModel(frng) });
      }
    }
    s = { all: out, fixtures };
    this.sites_.set(k, s);
    return s;
  }

  // ── voronoi plates for a chunk (cells whose SITE lives in this chunk) ──────
  // Clipped against the 3×3 neighbourhood so plates are seamless across borders.
  // A coarse bucket grid keeps the k-nearest search local. Guarded: on any failure
  // the chunk renders via the flat-fill fallback rather than throwing.
  mesh(cx, cy) {
    const k = this._key(cx, cy);
    let m = this.mesh_.get(k);
    if (m) return m;
    try {
      const here = this.sites(cx, cy);
      // gather neighbourhood sites + bucket them (bucket = 1 tile; plates are tile-sized)
      const buckets = new Map(), bkey = (x, y) => Math.floor(x) + ',' + Math.floor(y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        for (const s of this.sites(cx + dx, cy + dy).all) { const bk = bkey(s.x, s.y); (buckets.get(bk) || buckets.set(bk, []).get(bk)).push(s); }
      const candidatesNear = (A) => {
        const res = [], bx = Math.floor(A.x), by = Math.floor(A.y);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const b = buckets.get((bx + dx) + ',' + (by + dy)); if (b) for (const s of b) res.push(s); }
        return res;
      };
      // jittered ink polyline for one seam edge, baked in world coords (deterministic).
      const inkSeg = (a, b, wWorld, sd) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, pxn = -dy / L, pyn = dx / L;
        const segs = Math.max(2, Math.round(L * 3.6)), rng = Ship.rngFor(this.seed, 88, sd & 0xffff, (sd >>> 16) & 0xffff), pts = [];
        for (let i = 0; i <= segs; i++) { const t = i / segs, j = (i === 0 || i === segs) ? 0 : (rng() - 0.5) * wWorld * 1.6; pts.push(a[0] + dx * t + pxn * j, a[1] + dy * t + pyn * j); }
        return pts;
      };
      const cells = [], hullSeg = [], panelSeg = [];
      for (const A of here.all) {
        if (A.hull) continue;
        const cand = candidatesNear(A);
        const poly = clipCell(A, cand);
        if (poly.length < 3) continue;
        const edges = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          let nbHull = false, bd = 1e9;
          for (const s of cand) { if (s === A) continue; const d = (s.x - mx) ** 2 + (s.y - my) ** 2; if (d < bd) { bd = d; nbHull = s.hull; } }
          edges.push({ a, b, hull: nbHull });
          const sd = (Math.round(a[0] * 64 + b[0]) ^ Math.round((a[1] * 64 + b[1]) * 131)) >>> 0;
          (nbHull ? hullSeg : panelSeg).push(inkSeg(a, b, nbHull ? 0.09 : 0.045, sd));
        }
        cells.push({ A, poly, edges, albedo: A.albedo, regime: A.regime });
      }
      m = { cells, fixtures: here.fixtures, hullSeg, panelSeg, ok: true };
    } catch (e) {
      m = { cells: [], fixtures: [], hullSeg: [], panelSeg: [], ok: false }; // flat-fill fallback keeps the deck visible
    }
    this.mesh_.set(k, m);
    if (this.mesh_.size > 256) for (const kk of this.mesh_.keys()) { const [x, y] = kk.split(',').map(Number); if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) > 6) this.mesh_.delete(kk); }
    return m;
  }

  // A guaranteed spawn room + a corridor punched to the containing chunk's hub,
  // so the player always lands on ground with a way out into the generated ship.
  _carveSpawn() {
    for (let y = SPAWN.y - 2; y <= SPAWN.y + 2; y++)
      for (let x = SPAWN.x - 3; x <= SPAWN.x + 3; x++) this.overlay.add(x + ',' + y);
    const hubX = Math.floor(SPAWN.x / C) * C + (C >> 1), hubY = Math.floor(SPAWN.y / C) * C + (C >> 1);
    const sx = Math.sign(hubX - SPAWN.x) || 1, sy = Math.sign(hubY - SPAWN.y) || 1;
    for (let x = SPAWN.x; x !== hubX; x += sx) this.overlay.add(x + ',' + SPAWN.y);
    for (let y = SPAWN.y; y !== hubY; y += sy) this.overlay.add(hubX + ',' + y);
  }
}

// ── FOAM map ───────────────────────────────────────────────────────────────────
// Rooms are Voronoi cells (our foam), not ship.js rectangles. Each chunk scatters
// seeds, assigns every tile to its nearest seed, and walls the boundaries between
// cells that aren't door-connected (a spanning tree keeps every room reachable). Four
// deterministic edge ports + corridors stitch chunks together, so the map stays an
// infinite, walkable, gravity-tinted foam. Same {tiles,grav,rooms} shape as ship.js,
// so World renders/moves/places on it unchanged.
const ROOM_TYPES = [
  { id: 'commons', glyph: '⌂', accent: '#cfd8d0', reg: 0, rgb: [210, 215, 205], intensity: 0.55, flicker: 0 },
  { id: 'garden', glyph: '❀', accent: '#6fcf8e', reg: 0, rgb: [120, 210, 140], intensity: 0.70, flicker: 0.05 },
  { id: 'forge', glyph: '⚒', accent: '#e0884a', reg: 3, rgb: [240, 140, 70], intensity: 1.0, flicker: 0.4 },
  { id: 'archive', glyph: '❍', accent: '#8fb0d8', reg: 0, rgb: [150, 180, 220], intensity: 0.5, flicker: 0 },
  { id: 'observatory', glyph: '✷', accent: '#9a8fe0', reg: 2, rgb: [150, 160, 230], intensity: 0.35, flicker: 0 },
  { id: 'shaft', glyph: '↕', accent: '#7fd8d0', reg: 2, rgb: [90, 200, 200], intensity: 0.40, flicker: 0 },
  { id: 'reactor', glyph: '☢', accent: '#e0d24a', reg: 3, rgb: [230, 230, 90], intensity: 1.1, flicker: 0.6 },
  { id: 'shrine', glyph: '☥', accent: '#d8b85a', reg: 1, rgb: [230, 200, 120], intensity: 0.6, flicker: 0.1 },
];
const VOID = Ship.TILE.VOID;
// dense SPD-ish solve (partial-pivot Gaussian) for the small per-chunk truss.
function gaussSolve(A, b, n) {
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) { const v = Math.abs(A[r * n + col]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-9) return null;
    if (piv !== col) { for (let k = 0; k < n; k++) { const t = A[col * n + k]; A[col * n + k] = A[piv * n + k]; A[piv * n + k] = t; } const t = b[col]; b[col] = b[piv]; b[piv] = t; }
    const d = A[col * n + col];
    for (let r = col + 1; r < n; r++) { const f = A[r * n + col] / d; if (f) { for (let k = col; k < n; k++) A[r * n + k] -= f * A[col * n + k]; b[r] -= f * b[col]; } }
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let k = i + 1; k < n; k++) s -= A[i * n + k] * x[k]; x[i] = s / A[i * n + i]; }
  return x;
}
// pin-jointed 2D truss: nodes [{x,y}], members [{i,j,ea}], loads [[fx,fy]], fixed[bool].
// Returns per-member axial force (+tension), or null if singular (a mechanism).
function solveTruss(nodes, members, loads, fixed) {
  const n = nodes.length, ndof = 2 * n, K = new Float64Array(ndof * ndof);
  for (const m of members) {
    const a = nodes[m.i], b = nodes[m.j], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, c = dx / L, s = dy / L, k = m.ea / L;
    m._c = c; m._s = s; m._L = L;
    const T = [c * c, c * s, c * s, s * s], dof = [2 * m.i, 2 * m.i + 1, 2 * m.j, 2 * m.j + 1];
    for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) { const sg = (p < 2) === (q < 2) ? 1 : -1; K[dof[p] * ndof + dof[q]] += k * sg * T[(p % 2) * 2 + (q % 2)]; }
  }
  const free = []; for (let i = 0; i < n; i++) if (!fixed[i]) { free.push(2 * i); free.push(2 * i + 1); }
  const nf = free.length; if (!nf) return members.map(() => 0);
  const Kr = new Float64Array(nf * nf), fr = new Float64Array(nf);
  for (let a = 0; a < nf; a++) { fr[a] = loads[free[a] >> 1][free[a] & 1]; for (let b = 0; b < nf; b++) Kr[a * nf + b] = K[free[a] * ndof + free[b]]; }
  const u = gaussSolve(Kr, fr, nf); if (!u) return null;
  const full = new Float64Array(ndof); for (let a = 0; a < nf; a++) full[free[a]] = u[a];
  return members.map((m) => m.ea / m._L * (m._c * (full[2 * m.j] - full[2 * m.i]) + m._s * (full[2 * m.j + 1] - full[2 * m.i + 1])));
}
export function regimeField(seed, wx, wy) {
  const S = 9, gx = Math.floor(wx / S), gy = Math.floor(wy / S), fx = wx / S - gx, fy = wy / S - gy;
  const h = (i, j) => ((Ship.hashInts(seed, 99, i, j) >>> 0) % 1024) / 1024;
  const a = h(gx, gy), b = h(gx + 1, gy), c = h(gx, gy + 1), d = h(gx + 1, gy + 1);
  const v = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  return v < 0.52 ? 0 : v < 0.84 ? 1 : 3;          // 0 normal · 1 spin(slide) · 3 mag
}
// a chunk's seeds in WORLD coords — deterministic, so a block and its neighbours agree on
// the shared seeds and the Voronoi (hence the walls) is continuous across every seam.
export function chunkSeeds(seed, cx, cy) {
  const rng = Ship.rngFor(seed, 41, cx, cy), bx = cx * C, by = cy * C, G = 4, out = [];
  for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
    const x = bx + (gx + 0.18 + 0.64 * rng()) * C / G, y = by + (gy + 0.18 + 0.64 * rng()) * C / G;
    out.push({ x, y, t: ROOM_TYPES[Math.floor(rng() * ROOM_TYPES.length)], reg: regimeField(seed, x, y) });
  }
  return out;
}
// The foam's seam ports — its own scheme (rng streams 71/72), distinct from ship.js edgePorts
// (1/2), but seamless the same way: E(cx,cy)=W(cx+1,cy), S(cx,cy)=N(cx,cy+1). Exported as the
// single source of truth so foamChunk AND nav.js agree on where the doors are (nav takes this as
// its `ports` fn when routing the foam deck). Pure, deterministic, node + browser.
export function foamPorts(seed, cx, cy) {
  return {
    E: 3 + Math.floor(Ship.rngFor(seed, 71, cx, cy)() * (C - 6)),
    W: 3 + Math.floor(Ship.rngFor(seed, 71, cx - 1, cy)() * (C - 6)),
    S: 3 + Math.floor(Ship.rngFor(seed, 72, cx, cy)() * (C - 6)),
    N: 3 + Math.floor(Ship.rngFor(seed, 72, cx, cy - 1)() * (C - 6)),
  };
}
function foamChunk(seed, cx, cy) {
  const bx = cx * C, by = cy * C, G = 4, NS = G * G;
  // GHOST SEEDS: gather this block's seeds AND its 8 neighbours', then assign every tile to
  // the nearest over ALL of them. Cells (and the walls between them) are now computed from
  // the same global Voronoi on both sides of every seam → continuous across blocks, no
  // awkward fits. `gcell` is the global cell; `lcell` is the own-cell index (−1 = a
  // neighbour's chamber spilling across the seam, which we render but the neighbour owns).
  const all = []; let ownBase = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (dx === 0 && dy === 0) ownBase = all.length; const ss = chunkSeeds(seed, cx + dx, cy + dy); for (let idx = 0; idx < ss.length; idx++) { ss[idx].gid = (cx + dx) + ',' + (cy + dy) + ',' + idx; all.push(ss[idx]); } }   // gid = stable global cell id
  const NA = all.length, ownSeeds = all.slice(ownBase, ownBase + NS);
  const gcell = new Int16Array(C * C), lcell = new Int16Array(C * C);
  const sumx = new Float64Array(NS), sumy = new Float64Array(NS), cnt = new Int32Array(NS);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const wx = bx + x + 0.5, wy = by + y + 0.5; let bi = 0, bd = 1e18;
    for (let s = 0; s < NA; s++) { const d = (all[s].x - wx) ** 2 + (all[s].y - wy) ** 2; if (d < bd) { bd = d; bi = s; } }
    gcell[y * C + x] = bi; const lc = bi >= ownBase && bi < ownBase + NS ? bi - ownBase : -1; lcell[y * C + x] = lc;
    if (lc >= 0) { sumx[lc] += x; sumy[lc] += y; cnt[lc]++; }
  }
  const cen = []; for (let s = 0; s < NS; s++) cen.push(cnt[s] ? { x: Math.min(C - 1, Math.max(0, Math.round(sumx[s] / cnt[s]))), y: Math.min(C - 1, Math.max(0, Math.round(sumy[s] / cnt[s]))) } : { x: 0, y: 0 });
  // MEMBRANES: wall both sides of every GLOBAL cell boundary. The boundary check reaches
  // ACROSS the chunk edge (computing the neighbour tile's global cell id from the same
  // seeds), so a seam tile and its mirror in the next block agree — walls are continuous.
  const gidAt = (wx, wy) => { let bi = 0, bd = 1e18; for (let s = 0; s < NA; s++) { const d = (all[s].x - wx) ** 2 + (all[s].y - wy) ** 2; if (d < bd) { bd = d; bi = s; } } return all[bi].gid; };
  const tiles = new Uint8Array(C * C), grav = new Uint8Array(C * C);
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const a = gcell[y * C + x], myGid = all[a].gid; let interior = true;
    for (let d = 0; d < 4; d++) {
      const nx = x + [1, -1, 0, 0][d], ny = y + [0, 0, 1, -1][d];
      const nbGid = nx >= 0 && ny >= 0 && nx < C && ny < C ? all[gcell[ny * C + nx]].gid : gidAt(bx + nx + 0.5, by + ny + 0.5);
      if (nbGid !== myGid) { interior = false; break; }
    }
    const i = y * C + x;
    if (interior) { tiles[i] = FLOOR; grav[i] = 1 + all[a].reg; } else { tiles[i] = VOID; grav[i] = 0; }
  }
  const hazard = new Set();
  const setF = (x, y) => { if (x < 0 || y < 0 || x >= C || y >= C) return; const i = y * C + x; if (tiles[i] === VOID) tiles[i] = FLOOR; if (!grav[i]) grav[i] = 1 + all[gcell[i]].reg; };
  const carve = (x0, y0, x1, y1, haz) => {
    let x = x0, y = y0; const put = (a, b) => { setF(a, b); if (haz) hazard.add(b * C + a); };
    const sx = Math.sign(x1 - x0) || 1; while (x !== x1) { put(x, y); put(x, y + 1); x += sx; }   // 2-wide so auto-walk threads it
    const sy = Math.sign(y1 - y0) || 1; while (y !== y1) { put(x, y); put(x + 1, y); y += sy; }
    put(x, y); put(x + 1, y); put(x, y + 1);
  };
  for (let s = 0; s < NS; s++) setF(cen[s].x, cen[s].y);   // every chamber keeps a walkable centre
  // membrane graph + a spanning tree (always passable → the chambers stay reachable)
  const akey = (a, b) => a < b ? a + ',' + b : b + ',' + a, adj = new Map();
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const a = lcell[y * C + x]; if (a < 0) continue; if (x + 1 < C) { const b = lcell[y * C + x + 1]; if (b >= 0 && a !== b) adj.set(akey(a, b), 1); } if (y + 1 < C) { const b = lcell[(y + 1) * C + x]; if (b >= 0 && a !== b) adj.set(akey(a, b), 1); } }
  const mem = [...adj.keys()].map((k) => k.split(',').map(Number)), memLen = mem.map(([a, b]) => Math.hypot(cen[a].x - cen[b].x, cen[a].y - cen[b].y) || 1);
  const par = []; for (let i = 0; i < NS; i++) par[i] = i; const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const passable = new Set(), breach = new Set();
  for (const [a, b] of mem.slice().sort((p, q) => Ship.hashInts(seed, p[0], p[1], 5) - Ship.hashInts(seed, q[0], q[1], 5))) if (find(a) !== find(b)) { par[find(a)] = find(b); passable.add(akey(a, b)); }
  // STRUCTURAL SOLVE: a pin-jointed truss over the membrane graph (chamber centres = nodes,
  // membranes = members), loaded toward the hull, with the chunk-boundary chambers pinned
  // (held by the neighbours — the sector-wise, boundary-pinned solve). Member stress sets the
  // membrane's state: low load → a doorway (hatch), high load → a solid bulkhead, and the
  // most overloaded fail → a breach (open to vacuum).
  let stress = null;
  try {
    const nodes = cen.map((c) => ({ x: c.x, y: c.y })), loads = [], fixed = [];
    for (let s = 0; s < NS; s++) { loads.push([0, 0.002 * (cnt[s] || 1)]); const c = cen[s]; fixed.push(c.x <= 2 || c.y <= 2 || c.x >= C - 3 || c.y >= C - 3); }
    const forces = solveTruss(nodes, mem.map(([i, j], k) => ({ i, j, ea: memLen[k] })), loads, fixed);
    if (forces) stress = forces.map((f, k) => Math.abs(f) / memLen[k]);
  } catch (e) { stress = null; }
  let maxS = 0; if (stress) for (const v of stress) if (v > maxS) maxS = v;
  if (stress && maxS > 0) {
    mem.forEach(([a, b], k) => {
      const r = stress[k] / maxS, key = akey(a, b);
      if (r < 0.38) passable.add(key);                                                       // low load → hatch
      if (r > 0.85 && ((Ship.hashInts(seed, a, b, 9) >>> 0) % 100) < 40) { breach.add(key); passable.add(key); } // overloaded → breach
    });
  } else { for (const [a, b] of mem) if ((Ship.hashInts(seed, a, b, 6) & 7) === 0) passable.add(akey(a, b)); } // fallback
  for (const key of passable) { const [a, b] = key.split(',').map(Number); carve(cen[a].x, cen[a].y, cen[b].x, cen[b].y, breach.has(key)); }
  // edge ports → corridor to the local cell's centre, shared with neighbours so chunks connect
  const fp = foamPorts(seed, cx, cy), pE = fp.E, pW = fp.W, pS = fp.S, pN = fp.N;
  const nearOwn = (px, py) => { let bi = 0, bd = 1e18; for (let s = 0; s < NS; s++) { if (!cnt[s]) continue; const d = (cen[s].x - px) ** 2 + (cen[s].y - py) ** 2; if (d < bd) { bd = d; bi = s; } } return cen[bi]; };
  carve(C - 1, pE, nearOwn(C - 1, pE).x, nearOwn(C - 1, pE).y);
  carve(0, pW, nearOwn(0, pW).x, nearOwn(0, pW).y);
  carve(pS, C - 1, nearOwn(pS, C - 1).x, nearOwn(pS, C - 1).y);
  carve(pN, 0, nearOwn(pN, 0).x, nearOwn(pN, 0).y);
  tiles[pE * C + (C - 1)] = DOOR; tiles[pW * C + 0] = DOOR; tiles[(C - 1) * C + pS] = DOOR; tiles[0 * C + pN] = DOOR;
  for (const i of [pE * C + (C - 1), pW * C + 0, (C - 1) * C + pS, 0 * C + pN]) if (!grav[i]) grav[i] = 1;
  // rooms (one per non-empty cell) — bbox, centre, type for glyph/light, field regime
  const rooms = [];
  for (let s = 0; s < NS; s++) {
    let mnx = C, mny = C, mxx = 0, mxy = 0, sx = 0, sy = 0, n = 0;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (lcell[y * C + x] === s && tiles[y * C + x] !== VOID) { if (x < mnx) mnx = x; if (y < mny) mny = y; if (x > mxx) mxx = x; if (y > mxy) mxy = y; sx += x; sy += y; n++; }
    if (n === 0) continue;
    const t = ownSeeds[s].t, ccx = Math.round(sx / n), ccy = Math.round(sy / n);
    rooms.push({ x: mnx, y: mny, w: mxx - mnx + 1, h: mxy - mny + 1, cx: ccx, cy: ccy, type: t.id, glyph: t.glyph, accent: t.accent, regime: Ship.GRAV_LIST[ownSeeds[s].reg], lights: [{ x: ccx, y: ccy, intensity: t.intensity, flicker: t.flicker, rgb: t.rgb, radius: 5 + ((mxx - mnx + mxy - mny) / 3 | 0) }] });
  }
  // radial connectors: a deterministic subset of chambers hosts a chute (down, toward the
  // hull) or a ladder (up, toward the core) — the way between best-fit planes.
  const connectors = [];
  for (const r of rooms) { const hv = Ship.hashInts(seed, cx * 131 + r.cx, cy * 131 + r.cy, 23) >>> 0; if (hv % 100 < 22) connectors.push({ x: r.cx, y: r.cy, dir: (hv & 1) ? 1 : -1 }); }
  return { tiles, grav, rooms, hazard, connectors };
}
export class FoamField extends ChunkField {
  chunk(cx, cy) {
    const k = this._key(cx, cy); let c = this.cache.get(k);
    if (!c) {
      try { c = foamChunk(this.seed, cx, cy); } catch (e) { c = Ship.generateChunk(this.seed, cx, cy, this.genome); } // safety: fall back to the ship layout
      this.cache.set(k, c); if (this.cache.size > 256) this._evict(cx, cy);
    }
    return c;
  }
  // a breached membrane — open, but to vacuum
  isHazard(wx, wy) { const { cx, cy, lx, ly } = this._local(wx, wy); const c = this.chunk(cx, cy); return !!(c.hazard && c.hazard.has(ly * C + lx)); }
  // a radial connector at this tile: +1 chute (down/hull), -1 ladder (up/core), 0 none
  connectorAt(wx, wy) { const { cx, cy, lx, ly } = this._local(wx, wy); const c = this.chunk(cx, cy); if (!c.connectors) return 0; for (const k of c.connectors) if (k.x === lx && k.y === ly) return k.dir; return 0; }
  // ── foam index: the chamber containing a tile. The chamber id (gid = "bx,by,i" = the
  //    seed's home block + local index) is deterministic and identical on every machine. ──
  chamberAt(wx, wy) {
    const cx = Math.floor(wx / C), cy = Math.floor(wy / C), px = wx + 0.5, py = wy + 0.5;
    let best = null, bd = 1e18;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ss = chunkSeeds(this.seed, cx + dx, cy + dy); for (let i = 0; i < ss.length; i++) { const d = (ss[i].x - px) ** 2 + (ss[i].y - py) ** 2; if (d < bd) { bd = d; best = { gid: (cx + dx) + ',' + (cy + dy) + ',' + i, reg: ss[i].reg, type: ss[i].t.id, x: Math.round(ss[i].x), y: Math.round(ss[i].y) }; } } }
    return best;
  }
  // inverse: a chamber id → a representative tile (its seed), for spawning / targeting NPCs
  chamberLocation(gid) { const [cx, cy, i] = String(gid).split(',').map(Number); const s = chunkSeeds(this.seed, cx, cy)[i]; return s ? { x: Math.round(s.x), y: Math.round(s.y) } : null; }
}

// ── continuous gravity-aware movement (exported pure kernel for the selftest) ──
// Integrates one frame: input + the cell's gravity regime → velocity; axis-
// separated collision against the floor field (round() = occupied tile) so the
// player slides along walls (and, in zero-g, glides along them). Returns the new
// {px,py,vx,vy}; the caller maps round(px),round(py) back to the forum tile.
export function stepMotion(P, input, regime, isFloor, dt = 1) {
  let { px, py, vx, vy } = P;
  let { ix, iy, arriving } = input;
  const L = Math.hypot(ix, iy) || 1; ix /= L; iy /= L;
  if (regime === 'none') { vx += ix * 0.016 * dt; vy += iy * 0.016 * dt; vx *= 0.99; vy *= 0.99; }          // glide
  else if (regime === 'spin') { vx += ix * 0.05 * dt; vy += iy * 0.05 * dt; vx += 0.010 * dt; vy += 0.005 * dt; vx *= 0.85; vy *= 0.85; } // tilt-drift
  else if (regime === 'mag') { vx += ix * 0.075 * dt; vy += iy * 0.075 * dt; vx *= 0.64; vy *= 0.64; }       // grounded, crisp
  else { vx += ix * 0.06 * dt; vy += iy * 0.06 * dt; vx *= 0.78; vy *= 0.78; }                               // normal
  if (arriving) { vx *= 0.6; vy *= 0.6; }                                                                    // damp final approach (taps don't overshoot)
  const sp = Math.hypot(vx, vy), CAP = 0.2; if (sp > CAP) { vx *= CAP / sp; vy *= CAP / sp; }
  const nx = px + vx * dt;
  if (isFloor(Math.round(nx), Math.round(py))) px = nx; else vx = regime === 'none' ? -vx * 0.25 : 0;        // bounce in zero-g, else stop
  const ny = py + vy * dt;
  if (isFloor(Math.round(px), Math.round(ny))) py = ny; else vy = regime === 'none' ? -vy * 0.25 : 0;
  return { px, py, vx, vy };
}

export class World {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.depth = 0;                          // radial layer (0 = the flagship deck; + toward hull, − toward core)
    this._fields = {};
    this.field = this._fieldAt(0);
    this.places = [];
    this.placeAt = new Map();
    // x/y = integer tile occupied (the forum address); px/py/vx/vy = continuous physics.
    this.player = { x: SPAWN.x, y: SPAWN.y, px: SPAWN.x, py: SPAWN.y, vx: 0, vy: 0 };
    this.peers = new Map();
    this.selectedId = null;
    this.tile = 26;
    this.keys = {};            // held movement keys
    this.path = [];            // tap/click route waypoints (steered through continuously)
    this._t0 = performance.now();
    this._last = this._t0;
    this._raf = null;
    this._hover = null;
    this._lbuf = null; this._lbw = 0; this._lbh = 0; // light buffer + dims
    this._bind();
    this.resize();
  }

  // ── public API (unchanged for app.js) ────────────────────────────────────
  setPlaces(places) {
    this.places = places;
    this.placeAt = new Map(places.map((p) => [`${p.x}-${p.y}`, p]));
    for (const p of places) this.field.addPlaceTile(p.x, p.y); // places are always walkable
  }
  select(id) {
    this.selectedId = id;
    const p = this.places.find((q) => q.id === id);
    if (p) this._pathTo(p.x, p.y, true);
  }
  setPeer(did, handle, x, y) {
    let p = this.peers.get(did);
    if (!p) {
      let h = 0; for (const ch of did) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      p = { handle, x, y, px: x, py: y, hue: h % 360 };
      this.peers.set(did, p);
    } else { p.handle = handle; p.x = x; p.y = y; }
  }
  removePeer(did) { this.peers.delete(did); }
  clearPeers() { this.peers.clear(); }
  start() { if (!this._raf) { this._last = performance.now(); this._loop(); } }
  destroy() { cancelAnimationFrame(this._raf); this._raf = null; window.removeEventListener('resize', this._onResize); }
  isFloor(x, y) { return this.field.isFloor(x, y); }
  placeKey(x, y) { return this.placeAt.get(`${x}-${y}`); }

  // ── input ─────────────────────────────────────────────────────────────────
  _bind() {
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.canvas.tabIndex = 0;
    const MV = new Set(['arrowup', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd']);
    this.canvas.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (MV.has(k)) { e.preventDefault(); this.keys[k] = true; this.path = []; }      // manual input cancels auto-walk
      else if (k === 'n') { e.preventDefault(); this.h.onDropHere && this.h.onDropHere(this.player.x, this.player.y); }
      else if (k === 'f') { e.preventDefault(); this._useConnector(); }                  // chute / ladder
    });
    this.canvas.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    this.canvas.addEventListener('blur', () => { this.keys = {}; });
    this.canvas.addEventListener('mousemove', (e) => { this._hover = this._tileFromEvent(e); });
    this.canvas.addEventListener('mouseleave', () => { this._hover = null; });
    this.canvas.addEventListener('click', (e) => this._onClick(e));
  }
  _tileFromEvent(e) {
    const r = this.canvas.getBoundingClientRect();
    const cx = (e.clientX - r.left), cy = (e.clientY - r.top);
    const { ox, oy } = this._camera();
    return { x: Math.round((cx - ox) / this.tile - 0.5), y: Math.round((cy - oy) / this.tile - 0.5) };
  }
  _onClick(e) {
    this.canvas.focus();
    let t = this._tileFromEvent(e);
    // tap yourself while on a chute/ladder to use it (mobile-friendly)
    if (t.x === this.player.x && t.y === this.player.y && this.field.connectorAt && this.field.connectorAt(t.x, t.y)) { this._useConnector(); return; }
    const pl = this.placeKey(t.x, t.y);
    if (pl) { this._pathTo(t.x, t.y, true); this._announce(pl); return; }
    if (!this.isFloor(t.x, t.y)) {                          // snap to the nearest floor — the foam is mostly walls
      let best = null, bd = 1e9;
      for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.isFloor(t.x + dx, t.y + dy)) { const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [t.x + dx, t.y + dy]; } }
      }
      if (best) t = { x: best[0], y: best[1] };
    }
    if (this.isFloor(t.x, t.y)) this._pathTo(t.x, t.y, false);
  }

  // ── radial layers (chutes & ladders) ─────────────────────────────────────
  // Each depth is an independently-generated, independently-solved foam (a different
  // best-fit plane through the shell). Stepping on a connector swaps the layer; the 2D
  // forum addressing (x,y) is unchanged, so places/presence still work.
  _fieldAt(d) { if (!this._fields[d]) this._fields[d] = new FoamField((Ship.FLAGSHIP_SEED ^ (d * 0x9e3779b1)) >>> 0, null); return this._fields[d]; }
  _nearestFloor(x, y) { for (let r = 0; r <= 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (this.field.isFloor(x + dx, y + dy)) return { x: x + dx, y: y + dy }; } return { x, y }; }
  _useConnector() {
    const dir = this.field.connectorAt ? this.field.connectorAt(this.player.x, this.player.y) : 0;
    if (!dir) return;
    this.depth += dir;
    this.field = this._fieldAt(this.depth);
    for (const p of this.places) this.field.addPlaceTile(p.x, p.y);     // keep threads reachable on the new layer
    const f = this._nearestFloor(this.player.x, this.player.y);
    Object.assign(this.player, { x: f.x, y: f.y, px: f.x, py: f.y, vx: 0, vy: 0 });
    this.path = [];
    if (this.h.onMove) this.h.onMove(f.x, f.y);
    if (this.h.onStatus) this.h.onStatus(`depth ${this.depth >= 0 ? '+' + this.depth : this.depth} · ${dir > 0 ? 'descended toward the hull ↓' : 'climbed toward the core ↑'}`);
  }

  // ── foam address (for the NPC layer) ─────────────────────────────────────
  // The full address is "d<depth>:<chamber-gid>" — depth-aware (the foam differs per radial
  // layer) and stable on every machine for a voyage seed. Pair with field.chamberLocation()
  // to go the other way (spawn/target an NPC by chamber). Example: { address: "d+0:1,0,7",
  // depth: 0, chamber: "1,0,7", room: "garden", regime: "spin", breach: false, tile: [42,17] }.
  where() {
    const c = this.field.chamberAt ? this.field.chamberAt(this.player.x, this.player.y) : null;
    const dl = this.depth >= 0 ? '+' + this.depth : '' + this.depth;
    return { address: c ? `d${dl}:${c.gid}` : null, depth: this.depth, chamber: c ? c.gid : null, room: c ? c.type : null, regime: this.field.regime(this.player.x, this.player.y), breach: !!(this.field.isHazard && this.field.isHazard(this.player.x, this.player.y)), tile: [this.player.x, this.player.y] };
  }

  // ── movement ────────────────────────────────────────────────────────────
  _announce(place) {
    if (this.selectedId !== place.id && this.h.onSelectPlace) this.h.onSelectPlace(place);
    this.selectedId = place.id;
  }
  // input vector this frame: held keys take priority; else steer toward the path.
  _inputVector() {
    let ix = 0, iy = 0;
    if (this.keys.w || this.keys.arrowup) iy -= 1;
    if (this.keys.s || this.keys.arrowdown) iy += 1;
    if (this.keys.a || this.keys.arrowleft) ix -= 1;
    if (this.keys.d || this.keys.arrowright) ix += 1;
    let arriving = false;
    if (!ix && !iy && this.path.length) {
      const [wx, wy] = this.path[0];
      const dx = wx - this.player.px, dy = wy - this.player.py, d = Math.hypot(dx, dy);
      if (d < 0.5) this.path.shift();
      else { ix = dx; iy = dy; if (this.path.length === 1 && d < 1.3) arriving = true; }
    }
    return { ix, iy, arriving };
  }
  // Auto-walk path = the unified two-tier wayfinder (nav.route) over the live foam deck. No more
  // ±48 window: coarse portal-graph A* crosses chunks (via foamPorts), fine A* threads each chunk;
  // stepMotion still does the per-tile walk along the returned tile list. (See hoop/NAV.md.)
  _pathTo(tx, ty, adjacentOk) {
    if (!this.isFloor(tx, ty) && !adjacentOk) return;
    if (Math.abs(tx - this.player.x) + Math.abs(ty - this.player.y) > 400) return; // sanity cap on a very far click
    const r = navRoute(this.field.seed, { x: this.player.x, y: this.player.y }, { x: tx, y: ty },
      (x, y) => this.field.isFloor(x, y), { ports: foamPorts });
    if (!r || r.tiles.length < 2) { if (r && r.tiles.length === 1) this.path = []; return; }
    this.path = r.tiles.slice(1).map((t) => [t.x, t.y]); // drop the current tile; steer toward the rest
  }

  // ── render loop ───────────────────────────────────────────────────────────
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._vw = r.width; this._vh = r.height;
    this.tile = Math.max(18, Math.min(30, Math.floor(Math.min(r.width, r.height) / 18)));
  }
  _camera() {
    const ox = this._vw / 2 - (this.player.px + 0.5) * this.tile;
    const oy = this._vh / 2 - (this.player.py + 0.5) * this.tile;
    return { ox, oy };
  }
  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(2.2, Math.max(0.4, (now - this._last) / 16)); this._last = now;
    // continuous physics, gravity-aware
    const P = this.player;
    const reg = this.field.regime(P.x, P.y);
    const next = stepMotion(P, this._inputVector(), reg, (x, y) => this.field.isFloor(x, y), dt);
    P.px = next.px; P.py = next.py; P.vx = next.vx; P.vy = next.vy;
    // map the continuous position back to the forum tile; fire handlers on change
    const tx = Math.round(P.px), ty = Math.round(P.py);
    if (tx !== P.x || ty !== P.y) {
      P.x = tx; P.y = ty;
      if (this.h.onMove) this.h.onMove(tx, ty);
      const pl = this.placeKey(tx, ty);
      if (pl) this._announce(pl);
      else if (this.h.onStatus) {
        const dir = this.field.connectorAt ? this.field.connectorAt(tx, ty) : 0;
        if (dir) this.h.onStatus(`${dir > 0 ? '⤓ chute' : '⤒ ladder'} — press F (or tap) to ${dir > 0 ? 'descend toward the hull' : 'climb toward the core'}`);
        else if (this.field.isHazard && this.field.isHazard(tx, ty)) this.h.onStatus(`⚠ BREACH (${tx}, ${ty}) — open to vacuum`);
        else { const c = this.field.chamberAt && this.field.chamberAt(tx, ty); this.h.onStatus(`▦ ${c ? c.gid + ' · ' + c.type : ''} · ${this.field.regime(tx, ty)} · depth ${this.depth >= 0 ? '+' + this.depth : this.depth}`); }
      }
    }
    for (const p of this.peers.values()) { p.px += (p.x - p.px) * 0.22; p.py += (p.y - p.py) * 0.22; }
    this._draw(now);
  }

  // Splat every visible emitter into an additive RGB light buffer covering the
  // view. No shadows yet — that's the WebGPU radiance-cascade pass (Phase 6);
  // this CPU fallback is the same shape (consume emitters → light buffer).
  _buildLight(x0, y0, x1, y1, now) {
    const W = x1 - x0, H = y1 - y0;
    if (!this._lbuf || this._lbw !== W || this._lbh !== H) { this._lbuf = new Float32Array(W * H * 3); this._lbw = W; this._lbh = H; }
    const buf = this._lbuf; buf.fill(0.04); // faint ambient — the ship is dark
    const cx0 = Math.floor(x0 / C), cy0 = Math.floor(y0 / C), cx1 = Math.floor((x1 - 1) / C), cy1 = Math.floor((y1 - 1) / C);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = this.field.chunk(cx, cy), bx = cx * C, by = cy * C;
      for (const room of ch.rooms) for (const L of room.lights) {
        const ex = bx + L.x, ey = by + L.y;
        const flick = L.flicker ? (1 - L.flicker * 0.5 + L.flicker * 0.5 * Math.sin(now / 130 + ex * 1.7 + ey)) : 1;
        const I = L.intensity * flick, R = L.radius;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const wx = ex + dx, wy = ey + dy;
          if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) continue;
          const d = Math.hypot(dx, dy); if (d > R) continue;
          const f = I * (1 - d / R) * (1 - d / R);
          const bi = ((wy - y0) * W + (wx - x0)) * 3;
          buf[bi] += L.rgb[0] / 255 * f; buf[bi + 1] += L.rgb[1] / 255 * f; buf[bi + 2] += L.rgb[2] / 255 * f;
        }
      }
    }
    return buf;
  }
  _lightAt(buf, x0, y0, x1, y1, W, wx, wy) {
    const cx = Math.min(x1 - 1, Math.max(x0, wx)), cy = Math.min(y1 - 1, Math.max(y0, wy));
    const bi = ((cy - y0) * W + (cx - x0)) * 3;
    return [buf[bi], buf[bi + 1], buf[bi + 2]];
  }

  // ── the wayfinding fan (hoop/NAV.md Part 3): the visible map is the geodesic tree from the
  //    player out to its perimeter, not a fixed planar slice. Recomputed only when the player
  //    changes tile / depth (cheap), so it's effectively free per frame. Planar (uniform cost)
  //    for now — the cost rule is where non-planar wayfinding (the corkscrew) plugs in later. ──
  // Recompute the player's fan only when the player changes tile/depth, and bake it into two flat
  // arrays in world coords (tree segments, perimeter tips) so the per-FRAME draw is one stroke +
  // one fill — no Map walk, no per-cell work, no string churn. A modest radius keeps the node
  // count (and so the cost) small; the recompute is ~1 ms and occasional.
  _ensureFan() {
    const key = this.player.x + ',' + this.player.y + ':' + this.depth;
    if (this._fanKey === key) return;
    this._fanKey = key;
    const px = this.player.x, py = this.player.y, R = 26;
    const inBox = (x, y) => Math.abs(x - px) <= R && Math.abs(y - py) <= R;
    try {
      const fan = wayfan((x, y) => inBox(x, y) && this.field.isFloor(x, y), { x: px, y: py }, { radius: R, maxCells: 2400 });
      const seg = [], tip = [];
      for (const n of fan.reached.values()) { if (n.parent == null) continue; const p = fan.reached.get(n.parent); if (p) { seg.push(n.x + 0.5, n.y + 0.5, p.x + 0.5, p.y + 0.5); } }
      for (const tp of fan.tips) tip.push(tp.x + 0.5, tp.y + 0.5);
      this._fanSeg = seg; this._fanTip = tip;
    } catch (e) { this._fanSeg = null; this._fanTip = null; }
  }
  _drawFan(ctx, SX, SY, t) {
    const seg = this._fanSeg; if (!seg || !seg.length) return;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(SX(seg[i]), SY(seg[i + 1])); ctx.lineTo(SX(seg[i + 2]), SY(seg[i + 3])); }
    ctx.strokeStyle = 'rgba(121,200,160,0.16)'; ctx.lineWidth = Math.max(1, t * 0.05); ctx.stroke();
    const tip = this._fanTip;
    if (tip && tip.length) {
      const r = Math.max(1.1, t * 0.075); ctx.beginPath();
      for (let i = 0; i < tip.length; i += 2) { const sx = SX(tip[i]), sy = SY(tip[i + 1]); ctx.moveTo(sx + r, sy); ctx.arc(sx, sy, r, 0, Math.PI * 2); }
      ctx.fillStyle = 'rgba(121,200,160,0.4)'; ctx.fill();
    }
  }

  _draw(now) {
    const ctx = this.ctx, t = this.tile;
    const pulse = 0.5 + 0.5 * Math.sin((now - this._t0) / 600);
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, this._vw, this._vh);
    const { ox, oy } = this._camera();
    const x0 = Math.floor(-ox / t) - 1, y0 = Math.floor(-oy / t) - 1;
    const x1 = Math.ceil((this._vw - ox) / t) + 1, y1 = Math.ceil((this._vh - oy) / t) + 1;
    const W = x1 - x0;
    const buf = this._buildLight(x0, y0, x1, y1, now);
    const SX = (wx) => ox + wx * t, SY = (wy) => oy + wy * t;
    const cx0 = Math.floor(x0 / C), cy0 = Math.floor(y0 / C), cx1 = Math.floor((x1 - 1) / C), cy1 = Math.floor((y1 - 1) / C);

    this._ensureFan();

    // ── deck: adaptive voronoi plates, gravity-tinted, lit (light per cell = probe) ──
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      const m = this.field.mesh(cx, cy);
      if (!m.ok || !m.cells.length) { this._flatFill(ctx, cx, cy, x0, y0, x1, y1, W, buf, ox, oy, t); continue; }
      for (const cell of m.cells) {
        const A = cell.A;
        if (A.x < x0 - CLIP_R || A.x > x1 + CLIP_R || A.y < y0 - CLIP_R || A.y > y1 + CLIP_R) continue;
        const lit = this._lightAt(buf, x0, y0, x1, y1, W, Math.round(A.x), Math.round(A.y));
        const g = GRAV_HUE[cell.regime] || GRAV_HUE.normal, amb = 0.22, a = cell.albedo;
        ctx.fillStyle = `rgb(${Math.min(255, a[0] * amb * 0.5 + g[0] * 0.16 + lit[0] * 205) | 0},${Math.min(255, a[1] * amb * 0.5 + g[1] * 0.16 + lit[1] * 205) | 0},${Math.min(255, a[2] * amb * 0.5 + g[2] * 0.16 + lit[2] * 205) | 0})`;
        ctx.beginPath(); ctx.moveTo(SX(cell.poly[0][0]), SY(cell.poly[0][1]));
        for (let i = 1; i < cell.poly.length; i++) ctx.lineTo(SX(cell.poly[i][0]), SY(cell.poly[i][1]));
        ctx.closePath(); ctx.fill();
      }
    }
    // ── seams: panel (plate│plate, faint) then hull (plate│void, slim ink) ──
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const strokeSegs = (segs, width, style) => {
      if (!segs.length) return;
      ctx.beginPath();
      for (const pl of segs) { ctx.moveTo(SX(pl[0]), SY(pl[1])); for (let i = 2; i < pl.length; i += 2) ctx.lineTo(SX(pl[i]), SY(pl[i + 1])); }
      ctx.lineWidth = width; ctx.strokeStyle = style; ctx.stroke();
    };
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      const m = this.field.mesh(cx, cy); if (!m.ok) continue;
      strokeSegs(m.panelSeg, Math.max(0.5, t * 0.035), 'rgba(120,134,138,0.30)');
      strokeSegs(m.hullSeg, Math.max(1.0, t * 0.06), 'rgba(14,19,23,0.94)');
    }
    // ── fixtures: garden milfoil (reuses the /yarrow drawStalk) ──
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      for (const f of this.field.mesh(cx, cy).fixtures) {
        if (f.kind !== 'stalk' || f.wx < x0 - 1 || f.wx >= x1 + 1 || f.wy < y0 - 1 || f.wy >= y1 + 1) continue;
        const lit = this._lightAt(buf, x0, y0, x1, y1, W, Math.floor(f.wx), Math.floor(f.wy));
        const lL = Math.min(1.15, 0.28 + (lit[0] + lit[1] + lit[2]) / 1.2), m = f.model;
        drawStalk(ctx, {
          lenPx: m.lenTiles * t, diaPx: m.diaFrac * t,
          col: { h: m.col.h, s: m.col.s, l: m.col.l * lL },
          warp: m.warp, warpDir: m.warpDir, nodes: m.nodes, check: 0, grainSeed: m.grainSeed, taper: m.taper,
        }, { x: SX(f.wx), y: SY(f.wy), ang: f.ang, detail: Math.min(1, t / 26), fuzz: false, ends: false });
      }
    }

    // ── the wayfinding fan: routes radiating from the player to its perimeter ──
    this._drawFan(ctx, SX, SY, t);

    // breaches — failed membranes, open to vacuum (cold glow + an X)
    ctx.lineCap = 'round';
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = this.field.chunk(cx, cy); if (!ch.hazard) continue; const bx = cx * C, by = cy * C;
      for (const idx of ch.hazard) {
        const wx = bx + (idx % C), wy = by + ((idx / C) | 0);
        if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) continue;
        const sx = SX(wx), sy = SY(wy);
        ctx.fillStyle = 'rgba(120,220,235,0.10)'; ctx.fillRect(sx, sy, t, t);
        ctx.strokeStyle = 'rgba(150,235,245,0.5)'; ctx.lineWidth = Math.max(1, t * 0.06);
        ctx.beginPath(); ctx.moveTo(sx + t * 0.2, sy + t * 0.2); ctx.lineTo(sx + t * 0.8, sy + t * 0.8); ctx.moveTo(sx + t * 0.8, sy + t * 0.2); ctx.lineTo(sx + t * 0.2, sy + t * 0.8); ctx.stroke();
      }
    }

    // ambient room-type glyphs at each visible room centre (faint, generated)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(t * 0.6)}px "JetBrains Mono", ui-monospace, monospace`;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = this.field.chunk(cx, cy), bx = cx * C, by = cy * C;
      for (const room of ch.rooms) {
        const wx = bx + room.cx, wy = by + room.cy;
        if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) continue;
        const lit = this._lightAt(buf, x0, y0, x1, y1, W, wx, wy);
        const a = Math.min(0.5, 0.12 + (lit[0] + lit[1] + lit[2]) / 4);
        ctx.fillStyle = room.accent + Math.round(a * 255).toString(16).padStart(2, '0');
        ctx.fillText(room.glyph, SX(wx) + t / 2, SY(wy) + t / 2);
      }
    }

    // radial connectors — chutes (down/hull) and ladders (up/core) between best-fit planes
    ctx.font = `bold ${Math.floor(t * 0.74)}px "JetBrains Mono", ui-monospace, monospace`;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const ch = this.field.chunk(cx, cy); if (!ch.connectors) continue; const bx = cx * C, by = cy * C;
      for (const k of ch.connectors) {
        const wx = bx + k.x, wy = by + k.y; if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1) continue;
        const sx = SX(wx) + t / 2, sy = SY(wy) + t / 2, col = k.dir > 0 ? 'rgba(255,176,110,' : 'rgba(140,210,255,';
        ctx.strokeStyle = col + '0.85)'; ctx.lineWidth = Math.max(1.4, t * 0.07); ctx.beginPath(); ctx.arc(sx, sy, t * 0.42, 0, Math.PI * 2); ctx.stroke();
        ctx.save(); ctx.shadowColor = col + '1)'; ctx.shadowBlur = 8; ctx.fillStyle = col + '0.96)'; ctx.fillText(k.dir > 0 ? '⤓' : '⤒', sx, sy); ctx.restore();
      }
    }

    // places (forum threads)
    ctx.font = `${Math.floor(t * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
    for (const p of this.places) {
      if (p.x < x0 || p.x >= x1 || p.y < y0 || p.y >= y1) continue;
      const sx = SX(p.x) + t / 2, sy = SY(p.y) + t / 2;
      const dist = Math.hypot(p.x - this.player.px, p.y - this.player.py);
      const sel = p.id === this.selectedId;
      if (sel) {
        ctx.strokeStyle = `rgba(244,191,98,${0.5 + 0.4 * pulse})`; ctx.lineWidth = 2;
        ctx.strokeRect(sx - t / 2 + 2, sy - t / 2 + 2, t - 4, t - 4);
      }
      ctx.save();
      ctx.shadowColor = 'rgba(244,191,98,0.8)'; ctx.shadowBlur = sel ? 18 : 10;
      ctx.fillStyle = 'rgba(245,200,110,0.95)';
      ctx.fillText(p.glyph || '◆', sx, sy);
      ctx.restore();
      if (dist < 7 || sel) {
        ctx.font = `${Math.max(10, Math.floor(t * 0.42))}px ui-sans-serif, system-ui`;
        ctx.fillStyle = 'rgba(224,232,228,0.92)';
        ctx.fillText(p.title, sx, sy - t * 0.72);
        ctx.font = `${Math.floor(t * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
      }
    }

    if (this._hover && this.isFloor(this._hover.x, this._hover.y)) {
      const sx = SX(this._hover.x), sy = SY(this._hover.y);
      ctx.strokeStyle = 'rgba(120,200,160,0.35)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1, sy + 1, t - 2, t - 2);
    }

    for (const p of this.peers.values()) {
      const sx = SX(p.px) + t / 2, sy = SY(p.py) + t / 2;
      ctx.save();
      ctx.shadowColor = `hsl(${p.hue} 80% 60%)`; ctx.shadowBlur = 10;
      ctx.fillStyle = `hsl(${p.hue} 85% 66%)`;
      ctx.fillText('@', sx, sy);
      ctx.restore();
      ctx.font = `${Math.max(9, Math.floor(t * 0.4))}px ui-sans-serif, system-ui`;
      ctx.fillStyle = `hsl(${p.hue} 60% 78%)`;
      ctx.fillText('@' + p.handle, sx, sy - t * 0.66);
      ctx.font = `${Math.floor(t * 0.82)}px "JetBrains Mono", ui-monospace, monospace`;
    }

    const px = SX(this.player.px) + t / 2, py = SY(this.player.py) + t / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(255,206,120,0.9)'; ctx.shadowBlur = 12 + 8 * pulse;
    ctx.fillStyle = '#ffce78';
    ctx.fillText('@', px, py);
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < this._vh; y += 3) ctx.fillRect(0, y, this._vw, 1);
    try { this._drawMinimap(); } catch (e) { /* a HUD glitch must never kill the world */ }
  }

  // HUD minimap: a top-down read of the foam plane around you — floor tinted by gravity
  // regime so the sectors parse, walls left dark, with places/peers/player + the current
  // viewport box. Helps make sense of the foam without flattening its organic walls.
  _drawMinimap() {
    const ctx = this.ctx, M = Math.max(120, Math.min(184, this._vw * 0.26)), pad = 12;
    const ox = this._vw - M - pad, oy = pad, RAD = 38, mpp = M / (2 * RAD);
    const cxp = this.player.px, cyp = this.player.py;
    const x0 = Math.round(cxp - RAD), x1 = Math.round(cxp + RAD), y0 = Math.round(cyp - RAD), y1 = Math.round(cyp + RAD);
    const mx = (wx) => ox + (wx - cxp + RAD) * mpp, my = (wy) => oy + (wy - cyp + RAD) * mpp;
    ctx.save();
    ctx.fillStyle = 'rgba(5,6,10,0.66)'; ctx.fillRect(ox - 4, oy - 4, M + 8, M + 8);
    ctx.strokeStyle = 'rgba(127,216,208,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(ox - 4, oy - 4, M + 8, M + 8);
    ctx.beginPath(); ctx.rect(ox, oy, M, M); ctx.clip();
    ctx.fillStyle = '#070a0e'; ctx.fillRect(ox, oy, M, M);
    const sz = Math.ceil(mpp);
    for (let wy = y0; wy <= y1; wy++) for (let wx = x0; wx <= x1; wx++) {
      if (!this.field.isFloor(wx, wy)) continue;
      if (this.field.isHazard && this.field.isHazard(wx, wy)) { ctx.fillStyle = 'rgba(255,90,90,0.95)'; ctx.fillRect(mx(wx), my(wy), sz, sz); continue; }
      const g = GRAV_HUE[this.field.regime(wx, wy)] || GRAV_HUE.normal;
      ctx.fillStyle = `rgb(${(g[0] * 0.7 + 26) | 0},${(g[1] * 0.7 + 30) | 0},${(g[2] * 0.7 + 36) | 0})`;
      ctx.fillRect(mx(wx), my(wy), sz, sz);
    }
    for (const p of this.places) { if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue; ctx.fillStyle = p.id === this.selectedId ? '#fff' : 'rgba(245,200,110,0.95)'; ctx.fillRect(mx(p.x) - 1.5, my(p.y) - 1.5, 3, 3); }
    for (const p of this.peers.values()) { if (p.px < x0 || p.px > x1 || p.py < y0 || p.py > y1) continue; ctx.fillStyle = `hsl(${p.hue} 85% 66%)`; ctx.fillRect(mx(p.px) - 1, my(p.py) - 1, 2, 2); }
    const vw = this._vw / this.tile, vh = this._vh / this.tile;
    ctx.strokeStyle = 'rgba(207,238,238,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(mx(cxp - vw / 2), my(cyp - vh / 2), vw * mpp, vh * mpp);
    ctx.fillStyle = '#ffce78'; ctx.shadowColor = '#ffce78'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(ox + M / 2, oy + M / 2, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(127,216,208,0.75)'; ctx.font = '10px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('▦ deck d' + (this.depth >= 0 ? '+' + this.depth : this.depth) + ' (' + Math.round(cxp) + ', ' + Math.round(cyp) + ')', ox + 2, oy + 2);
    ctx.restore();
  }

  // Fallback deck for a chunk whose mesh failed to build: flat-lit floor tiles, so
  // the world is never a black hole even if the voronoi pass throws.
  _flatFill(ctx, cx, cy, x0, y0, x1, y1, W, buf, ox, oy, t) {
    const bx = cx * C, by = cy * C;
    for (let ly = 0; ly < C; ly++) for (let lx = 0; lx < C; lx++) {
      const wx = bx + lx, wy = by + ly;
      if (wx < x0 || wx >= x1 || wy < y0 || wy >= y1 || !this.field.isFloor(wx, wy)) continue;
      const g = GRAV_HUE[this.field.regime(wx, wy)] || GRAV_HUE.normal;
      const lit = this._lightAt(buf, x0, y0, x1, y1, W, wx, wy);
      ctx.fillStyle = `rgb(${Math.min(255, 70 + g[0] * 0.16 + lit[0] * 205) | 0},${Math.min(255, 78 + g[1] * 0.16 + lit[1] * 205) | 0},${Math.min(255, 84 + g[2] * 0.16 + lit[2] * 205) | 0})`;
      ctx.fillRect(ox + wx * t, oy + wy * t, t + 1, t + 1);
    }
  }
}
