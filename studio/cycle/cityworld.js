// cityworld.js — a city to fly through: packages/morph's city on its ground, made a world the flight
// (fly.js) can draw. Pure: node and browser.
//
// The city is morph's (vendor/morph: lanes and hamlets, districts laid in their eras, blocks, plots, and
// seven centuries of buildings rebuilt in waves) standing on morph's ground (hills, a river in its
// valley). Here it becomes the flight's world: a heightmap with a palette index per cell, but at 2 m
// cells over 3 km, not 4 m over 4 km, because a plot is six metres wide.
//
// What a heightmap cannot hold is a WALL: a building's face is the one step in height between the
// street and its roof. So, as fly.js draws the fall and the cliff's strata per row from height, it draws
// a facade per row: each building cell knows its building and which way its nearest wall faces, and
// the row's height says which storey it is, the position along the wall which bay, and the building's
// period (tjs/brut/period.js's grammar, cut down to what 2 m cells and a row of pixels can show) says
// whether that is a window, a pier, a timber post, a balcony or a cornice. A window is a palette entry
// of its own, one of sixteen households, dark glass by day; at night each household lights when it
// gets dark enough for it, and the sixteen are a slow colour cycle, so lights come on and go off.
// Roofs are lit by which way they face, as rock is; streets carry their lamps; the river is the lake's
// mirror, so the city stands in it.
//
// buildCityWorld(seed) → the world contract of world.js (N, CELL, SIZE, height, kind, index, entries,
//   cycles, trees, path, …) plus `facade` (per-cell building and wall bearing, per-building numbers).
import { mulberry32, hash2, fbm2, smooth, BIOMES } from './scene.js';
import { KIND, NORMALS, heightAt, loopThrough } from './world.js';
import { generate, standing, PRESENT } from './vendor/morph/morph.js';
import { Ground } from './vendor/morph/ground.js';

const N = 1536, CELL = 2, SIZE = N * CELL, C = SIZE / 2;
const FRAME = 1800;                           // the city's side; the ground (3 km) is countryside beyond it
const STYLE_IDS = ['village', 'medieval', 'georgian', 'haussmann', 'villa', 'modern', 'glass', 'bridge'];

/**
 * How each period's face reads in rows and bays (bay width m; window width as a share of the bay; sill
 * and head as shares of the storey). `attached`: a terrace, its side walls are party walls and blank.
 */
export const FACES = {
  village:   { bay: 3.4, ww: 0.30, sill: 0.34, head: 0.70, wall: 'plaster', attached: false },
  medieval:  { bay: 2.6, ww: 0.42, sill: 0.30, head: 0.74, wall: 'plaster', attached: true, timber: true, shop: [0.12, 0.72, 0.7] },
  georgian:  { bay: 2.0, ww: 0.48, sill: 0.24, head: 0.82, wall: 'brick', attached: true, nobile: 0.9, cornice: 0.45 },
  haussmann: { bay: 2.6, ww: 0.44, sill: 0.10, head: 0.84, wall: 'stone', attached: true, shop: [0.06, 0.86, 0.8], balcony: true, cornice: 0.5 },
  villa:     { bay: 3.6, ww: 0.34, sill: 0.32, head: 0.76, wall: 'render', attached: false },
  modern:    { bay: 3.6, ww: 0.88, sill: 0.32, head: 0.78, wall: 'concrete', attached: false },
  glass:     { bay: 1.6, ww: 0.92, sill: 0.04, head: 0.90, wall: 'curtain', attached: false },
  bridge:    { bay: 18, wall: 'stone', attached: false },
};

export function buildCityWorld(seed = 1) {
  const rnd = mulberry32(seed * 9973 + 17);
  const biome = Object.keys(BIOMES)[Math.floor(rnd() * 4)];   // the painting's first draw: the same biome
  const B = BIOMES[biome];
  const S = (seed * 131 + 7) % 100000;

  // ---- the ground and the city on it (morph's frame is centred on 0; the world's on C)
  const g0 = Ground(seed, { size: 3000, coast: false });
  // the world (3072 m) is a little wider than the ground (3000 m): read the ground's edge beyond it
  const cl = (v) => Math.max(-1499, Math.min(1499, v));
  const g = { ...g0, heightAt: (x, y) => g0.heightAt(cl(x), cl(y)), water: (x, y) => g0.water(cl(x), cl(y)), riverDistAt: (x, y) => g0.riverDistAt(cl(x), cl(y)) };
  const city = generate({ seed, size: FRAME, ground: g });
  const now = standing(city, PRESENT);
  const sAtValley = (x, y) => {      // how far down the valley (m): the river's phase
    const n = g.n, i = Math.max(0, Math.min(n - 1, Math.round((x + 1500) / g.cell))), j = Math.max(0, Math.min(n - 1, Math.round((y + 1500) / g.cell)));
    return g.valleyS ? g.valleyS[j * n + i] : 0;
  };
  const zOff = g.river ? g.river.surface(sAtValley(0, 0)) : 0;   // the river's surface at the city is the world's 0

  const height = new Float32Array(N * N), kind = new Uint8Array(N * N), index = new Uint8Array(N * N);
  const cls = new Uint8Array(N * N);                 // 0 country, 1 street, 2 yard, 3 paving, 4 green, 5 built, 6 water
  const bid = new Uint16Array(N * N), ang = new Uint8Array(N * N);
  const along = new Float32Array(N * N);
  const wx = (i) => (i + 0.5) * CELL - C, wy = (j) => (j + 0.5) * CELL - C;    // cell centre in morph's frame
  const H2 = FRAME / 2;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = wx(i), y = wy(j), k = j * N + i;
    if (g.water(x, y) === 'river') { cls[k] = 6; height[k] = 0; kind[k] = KIND.lake; along[k] = sAtValley(x, y); continue; }
    height[k] = Math.max(0.6, g.heightAt(x, y) - zOff);
    cls[k] = Math.abs(x) < H2 && Math.abs(y) < H2 ? 1 : 0;
  }
  // a convex polygon (morph's frame) → each cell whose centre is inside, with its distance in from each edge
  const fillPoly = (P, cb) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    let A = 0; for (let e = 0; e < P.length; e++) { const a = P[e], b = P[(e + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; }
    const s = A < 0 ? -1 : 1, E = P.map((a, e) => { const b = P[(e + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / L * s, (b[0] - a[0]) / L * s, a[0], a[1]]; });
    const i0 = Math.max(0, Math.floor((x0 + C) / CELL)), i1 = Math.min(N - 1, Math.ceil((x1 + C) / CELL)), j0 = Math.max(0, Math.floor((y0 + C) / CELL)), j1 = Math.min(N - 1, Math.ceil((y1 + C) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = wx(i), y = wy(j);
      let d = Infinity, e0 = -1;
      for (let e = 0; e < E.length; e++) { const q = (x - E[e][2]) * E[e][0] + (y - E[e][3]) * E[e][1]; if (q < d) { d = q; e0 = e; } }
      if (d >= 0) cb(j * N + i, d, E[e0], x, y);
    }
  };

  // ---- the blocks: yards and squares (what is not a block is street)
  const GRASSY = new Set(['village', 'suburb', 'grid']);
  const trees = [];
  const R = mulberry32(seed * 31 + 5);
  for (const b of city.blocks) {
    if (!b.lot || b.lot.length < 3 || b.island) continue;
    const dk = city.districts[b.district].kind, c = b.square === 'green' ? 4 : b.square ? 3 : GRASSY.has(dk) ? 4 : 3;
    fillPoly(b.lot, (k, d, _e, x, y) => {
      if (cls[k] === 6) return;
      cls[k] = c === 4 && !b.square ? 2 : c;
      if (b.square === 'green' && d > 3 && R() < 0.012) trees.push(x + C, y + C, height[k] - 0.5, 9 + R() * 8);
      else if (cls[k] === 2 && d > 4 && R() < 0.003) trees.push(x + C, y + C, height[k] - 0.5, 7 + R() * 6);
    });
  }

  // ---- the buildings: walls up from the ground they were levelled on, then their roofs
  const facts = [];                                   // per building: base, eave, storey height, style
  const blds = now.buildings.slice().sort((a, b) => a.height - b.height);
  for (const b of blds) {
    const st = STYLE_IDS.indexOf(b.style);
    if (st < 0 || facts.length / 4 >= 65000) continue;
    const id = facts.length / 4 + 1, base = b.base - zOff, eave = base + b.height, sh = b.height / b.storeys;
    const F = FACES[b.style], fr = city.frontages[b.frontage];
    let fnx = 0, fny = 0;
    if (fr) { const dx = fr.q[0] - fr.a[0], dy = fr.q[1] - fr.a[1], L = Math.hypot(dx, dy) || 1; fnx = -dy / L; fny = dx / L; }
    const parapet = b.roof === 'flat' || b.style === 'georgian';
    facts.push(base, eave + (parapet ? 1 : 0), sh, st);
    const R2 = mulberry32((b.id + 1) * 7919 + seed);
    const plant = b.roof === 'flat' && R2() < 0.6;
    fillPoly(b.footprint, (k, d, e, x, y) => {
      if (cls[k] === 6) return;
      cls[k] = 5; kind[k] = KIND.building; bid[k] = id;
      // the wall this cell is nearest: its outward bearing (from north, x east) in 128 steps, and whether
      // it is a party wall (a terrace's side), which is blank
      const az = Math.atan2(-e[0], -e[1]), a7 = (Math.round(az / (2 * Math.PI) * 128) % 128 + 128) % 128;
      const blank = F.attached && Math.abs(-e[0] * fnx - e[1] * fny) < 0.55;
      ang[k] = a7 | (blank ? 128 : 0);
      let roof = 0;
      if (b.roof === 'hip') roof = d * STYLES_PITCH[b.style];
      else if (b.roof === 'mansard') roof = Math.min(sh * 1.1 / 2.2, d) * 2.2;
      if (parapet && d < 0.9) roof = Math.max(roof, 1);
      if (plant && d > 4 && hash2(Math.floor(x / 7), Math.floor(y / 7), S + b.id) < 0.12) roof = 2.6;
      height[k] = eave + roof;
    });
  }

  // ---- bridges: where an old road crosses the river, a deck on arches
  for (const L of city.lanes) {
    const ox = L.o[0], oy = L.o[1], ux = L.u[0], uy = L.u[1];
    let s0 = null;
    for (let s = 0; s < FRAME; s += 1) {
      const x = ox + ux * s, y = oy + uy * s, wet = g.water(x, y) === 'river';
      if (wet && s0 == null) s0 = s;
      if (!wet && s0 != null) {
        const s1 = s, hb = (q) => Math.max(0.6, g.heightAt(ox + ux * q, oy + uy * q) - zOff);
        const deck = Math.max(3.5, hb(s0 - 4), hb(s1 + 4)) + 0.6;
        const id = facts.length / 4 + 1;
        facts.push(-2, deck, 1, STYLE_IDS.indexOf('bridge'));
        const nb = Math.atan2(-uy, ux), a7 = (Math.round(nb / (2 * Math.PI) * 128) % 128 + 128) % 128;   // its sides face across the lane
        const P = [[ox + ux * (s0 - 3) - uy * 7, oy + uy * (s0 - 3) + ux * 7], [ox + ux * (s1 + 3) - uy * 7, oy + uy * (s1 + 3) + ux * 7],
          [ox + ux * (s1 + 3) + uy * 7, oy + uy * (s1 + 3) - ux * 7], [ox + ux * (s0 - 3) + uy * 7, oy + uy * (s0 - 3) - ux * 7]];
        fillPoly(P, (k, d) => { if (cls[k] === 5) return; cls[k] = 7; kind[k] = KIND.building; bid[k] = id; ang[k] = a7; height[k] = deck + (d < 1 ? 1 : 0); });
        s0 = null;
      }
    }
  }

  // ---- the palette
  const entries = [], cycles = [];
  const alloc = (n, make) => { const lo = entries.length; for (let i = 0; i < n; i++) entries.push(make(i)); return lo; };
  const ground = (alb, name) => alloc(17, (i) => ({ k: 'land3', alb, n: NORMALS[i], name }));
  const roofs = (alb, name, n = 9) => alloc(n, (i) => ({ k: 'land3', alb, n: NORMALS[i], name }));
  const walls = (alb, name) => alloc(8, (i) => ({ k: 'land3', alb, n: [Math.sin(i * Math.PI / 4), Math.cos(i * Math.PI / 4), 0.05], name }));
  const M = {
    grass: ground(B.ground, 'grass'), grass2: ground(B.ground.map((v, i) => v * 0.82 + [0.03, 0.02, 0][i]), 'grass'),
    tile: roofs([0.52, 0.24, 0.16], 'roof'), slate: roofs([0.26, 0.28, 0.32], 'roof'), thatch: roofs([0.50, 0.42, 0.26], 'roof'),
    zinc: roofs([0.44, 0.48, 0.52], 'roof', 17), flat: roofs([0.40, 0.39, 0.37], 'roof', 1), lead: roofs([0.30, 0.32, 0.34], 'roof', 1),
  };
  const W = {
    plaster: walls([0.78, 0.74, 0.64], 'wall'), brick: walls([0.55, 0.30, 0.22], 'wall'), stone: walls([0.76, 0.70, 0.58], 'wall'),
    render: walls([0.82, 0.78, 0.70], 'wall'), concrete: walls([0.58, 0.57, 0.54], 'wall'), curtain: walls([0.22, 0.30, 0.36], 'wall'),
    timber: walls([0.20, 0.14, 0.10], 'wall'),
  };
  // the households: sixteen windows, dark glass by day; each lights at its own darkness, warm or cold
  const HUES = [[1.0, 0.70, 0.36], [1.0, 0.78, 0.48], [0.95, 0.62, 0.30], [0.80, 0.88, 1.0], [1.0, 0.86, 0.6], [0.62, 0.72, 1.0]];
  const win = alloc(16, (i) => ({ k: 'cwin', th: 0.45 + 1.6 * hash2(i, 3, S + 40), col: HUES[Math.floor(hash2(i, 5, S + 41) * HUES.length)], tv: hash2(i, 7, S + 42) < 0.12 }));
  const LAKE = 12, lake = alloc(LAKE, (i) => ({ k: 'lake3', hl: [1, 0.2, 0, 0.4, 0, 0, 0.7, 0.1, 0, 0.3, 0, 0][i] }));
  const street = alloc(1, () => ({ k: 'land3', alb: [0.24, 0.24, 0.25], n: [0, 0, 1], name: 'street' }));
  const cobble = alloc(1, () => ({ k: 'land3', alb: [0.40, 0.37, 0.33], n: [0, 0, 1], name: 'street' }));
  const paving = alloc(1, () => ({ k: 'land3', alb: [0.58, 0.55, 0.50], n: [0, 0, 1], name: 'paving' }));
  const pool = alloc(1, () => ({ k: 'cpool', alb: [0.26, 0.26, 0.27] }));
  const lamp = alloc(1, () => ({ k: 'clamp' }));
  const arch = alloc(1, () => ({ k: 'land3', alb: [0.05, 0.05, 0.06], n: [0, 0, 1], name: 'shadow' }));
  const leaf = alloc(8, (i) => ({ k: 'land3', alb: B.pine.map((v, c) => v * 1.25 + [0.03, 0.06, 0.01][c]), n: [0.85 * Math.sin(i * Math.PI / 4), 0.85 * Math.cos(i * Math.PI / 4), 0.5], name: 'pine' }));
  const trunk = alloc(1, () => ({ k: 'land3', alb: [0.18, 0.12, 0.08], n: [0, 0, 1], name: 'trunk' }));
  cycles.push({ lo: lake, len: LAKE, perBeat: 1, name: 'river' }, { lo: win, len: 16, perBeat: 0.025, name: 'windows' });
  const ROOF = { village: M.thatch, medieval: M.tile, georgian: M.slate, haussmann: M.zinc, villa: M.tile, modern: M.flat, glass: M.lead };
  const styleWall = STYLE_IDS.map((s) => W[FACES[s].wall]);

  // ---- streets: lamps along the kerb every 30 m, a pool of light round each, and trees down the avenues
  const core = city.districts.find((d) => d.isCore);
  const inCore = (x, y) => core && core.parts.some((P) => { let s = 0; for (let e = 0; e < P.length; e++) { const a = P[e], b = P[(e + 1) % P.length]; const c2 = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (c2 !== 0) { if (s === 0) s = Math.sign(c2); else if (Math.sign(c2) !== s) return false; } } return true; });
  const lampAt = new Set();
  for (const st of city.streets) {
    if (st.width <= 0) continue;
    const blk = city.blocks[st.block], cen = blk.lot && blk.lot.length ? blk.lot.reduce((a, p) => [a[0] + p[0] / blk.lot.length, a[1] + p[1] / blk.lot.length], [0, 0]) : null;
    if (!cen) continue;
    const dx = st.b[0] - st.a[0], dy = st.b[1] - st.a[1], L = Math.hypot(dx, dy);
    if (L < 6) continue;
    let nx = -dy / L, ny = dx / L;
    const mx = (st.a[0] + st.b[0]) / 2, my = (st.a[1] + st.b[1]) / 2;
    if ((cen[0] - mx) * nx + (cen[1] - my) * ny < 0) { nx = -nx; ny = -ny; }
    const off = st.width / 2 - 1.2, trees_ = st.rank === 'avenue' || st.rank === 'ring';
    for (let s = 12 + hash2(st.block, 1, S) * 10; s < L - 6; s += 30) {
      const x = st.a[0] + dx / L * s + nx * off, y = st.a[1] + dy / L * s + ny * off;
      const i = Math.floor((x + C) / CELL), j = Math.floor((y + C) / CELL);
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1 || cls[j * N + i] !== 1) continue;
      lampAt.add(j * N + i);
    }
    if (trees_) for (let s = 6; s < L - 4; s += 9) {
      const x = st.a[0] + dx / L * s + nx * (st.width / 2 - 2.6), y = st.a[1] + dy / L * s + ny * (st.width / 2 - 2.6);
      const i = Math.floor((x + C) / CELL), j = Math.floor((y + C) / CELL), k = j * N + i;
      if (i >= 0 && j >= 0 && i < N && j < N && cls[k] === 1) trees.push(x + C, y + C, height[k] - 0.3, 8 + hash2(i, j, S + 3) * 5);
    }
  }
  // the countryside's trees: hedgerows and woods where the noise says, none on the river
  for (let n = 0; n < 60000 && trees.length < 4 * 9000; n++) {
    const x = R() * SIZE, y = R() * SIZE, i = Math.floor(x / CELL), j = Math.floor(y / CELL), k = j * N + i;
    if (cls[k] !== 0) continue;
    const hedge = Math.abs(((x * 0.6 + y * 0.8) % 130 + 130) % 130 - 65) < 2 || Math.abs(((x * 0.8 - y * 0.6) % 170 + 170) % 170 - 85) < 2;
    if (!(fbm2(x / 260, y / 260, S + 30, 4) > 0.58 || (hedge && hash2(i, j, S + 31) < 0.5))) continue;
    trees.push(x, y, height[k] - 0.5, 8 + R() * 9);
  }

  // ---- each cell's index
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = i * CELL, y = j * CELL, c = cls[k];
    if (c === 6) {                                   // the river: ripples that run downstream
      const wob = Math.sin(x * 0.021 + y * 0.008) * 5 + Math.sin(y * 0.03 - x * 0.012) * 3;
      index[k] = lake + ((Math.floor((-along[k] + wob) / 3.5) % LAKE) + LAKE) % LAKE; continue;
    }
    if (c === 5) {                                   // a roof, by which way it faces
      const b = facts[(bid[k] - 1) * 4 + 3], name = STYLE_IDS[b], lo = ROOF[name], i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
      const gx = (height[j * N + i1] - height[j * N + i0]) / ((i1 - i0) * CELL), gy = (height[j1 * N + i] - height[j0 * N + i]) / ((j1 - j0) * CELL);
      const same = bid[j * N + i1] === bid[k] && bid[j * N + i0] === bid[k] && bid[j1 * N + i] === bid[k] && bid[j0 * N + i] === bid[k];
      const tilt = same ? Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI : 0;
      const az = Math.atan2(-gx, -gy), b8 = ((Math.round(az / (Math.PI / 4)) % 8) + 8) % 8;
      const n = lo === M.zinc ? 17 : lo === M.flat || lo === M.lead ? 1 : 9;
      index[k] = lo + (tilt < 10 || n === 1 ? 0 : n === 17 && tilt > 45 ? 9 + b8 : 1 + b8);
      continue;
    }
    if (c === 7) { index[k] = paving; continue; }
    if (c === 1) { index[k] = lampAt.has(k) ? lamp : inCore(x - C, y - C) ? cobble : street; continue; }
    if (c === 3) { index[k] = paving; continue; }
    // ground, by which way it faces: fields in the country, lawns and gardens in town
    const i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    const gx = (height[j * N + i1] - height[j * N + i0]) / ((i1 - i0) * CELL), gy = (height[j1 * N + i] - height[j0 * N + i]) / ((j1 - j0) * CELL);
    const tilt = Math.atan(Math.hypot(gx, gy)) * 180 / Math.PI + (hash2(i, j, S + 21) - 0.5) * 4, az = Math.atan2(-gx, -gy) + (hash2(i, j, S + 20) - 0.5) * 0.35;
    const bucket = tilt < 6 ? 0 : (tilt < 30 ? 1 : 9) + ((Math.round(az / (Math.PI / 4)) % 8) + 8) % 8;
    const field = hash2(Math.floor((x * 0.8 + y * 0.6) / 110), Math.floor((y * 0.8 - x * 0.6) / 150), S + 22) < 0.5;
    index[k] = (c === 0 ? (field ? M.grass2 : M.grass) : (hash2(i >> 2, j >> 2, S + 23) < 0.3 ? M.grass2 : M.grass)) + bucket;
  }
  // lamps light the street round them
  for (const k of lampAt) {
    const i = k % N, j = (k - i) / N;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const q = (j + dj) * N + i + di;
      if (di * di + dj * dj <= 9 && q !== k && cls[q] === 1) index[q] = pool;
    }
  }
  // cells whose height must not be blended with a neighbour's: walls stand straight, quays too
  const sharp = new Uint8Array(N * N);
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const k = j * N + i, a = cls[k] >= 5, b = cls[k + 1] >= 5, c = cls[k + N] >= 5, d = cls[k + N + 1] >= 5;
    if (a || b || c || d) sharp[k] = 1;
  }

  const world = {
    kind: 'city', seed, biome, N, CELL, SIZE, height, kind, index, entries, cycles, trees: new Float32Array(trees), sharp,
    facade: { bid, ang, facts: new Float32Array(facts), styles: STYLE_IDS.map((s, i) => ({ ...FACES[s], wall: styleWall[i], name: s })), win, timber: W.timber, stone: W.stone, arch },
    slots: { lake, pine: leaf, trunk, window: win }, round: true, nightTip: 0.1, far: 4600,
    skyTurn: B.skyTurn, water: B.water, bpm: 48 + Math.floor(rnd() * 18), city: { stats: city.stats, zOff, buildings: facts.length / 4 },
  };
  let maxH = 0; for (let k = 0; k < N * N; k++) if (height[k] > maxH) maxH = height[k];
  world.maxH = maxH + 1;
  world.path = cityPath(world, city, g, zOff, now);
  if (entries.length > 256) throw new Error(`palette overflow ${entries.length}`);
  world.used = entries.length;
  while (entries.length < 256) entries.push({ k: 'unused' });
  return world;
}
const STYLES_PITCH = { village: 0.9, medieval: 0.85, georgian: 0.5, villa: 0.65 };

// ---------------------------------------------------------------------------- the flight --
// Down the river between its quays and under the bridges' height, up over the old core, down into an
// old road at the height of its eaves and out along it, then a climb round the tallest towers and a
// wide turn over the countryside back to the river.
function cityPath(world, city, g, zOff, now) {
  const P = (x, y, z, look = 0) => ({ x: x + C, y: y + C, z, look });
  const gh = (x, y) => heightAt(world, x + C, y + C);
  const pts = [], PLACES = [], add = (p, place) => { pts.push(p); PLACES.push(place); };
  const H2 = FRAME / 2 - 40;
  // the river through the city, if it passes through
  const ch = g.river ? g.river.path.filter(([x, y]) => Math.abs(x) < H2 && Math.abs(y) < H2) : [];
  let river = [];
  if (ch.length > 1) {
    const cum = [0]; for (let s = 1; s < ch.length; s++) cum.push(cum[s - 1] + Math.hypot(ch[s][0] - ch[s - 1][0], ch[s][1] - ch[s - 1][1]));
    const total = cum[cum.length - 1];
    if (total > 500) for (let s = 60, q = 0; s < total - 60; s += 70) { while (cum[q + 1] < s) q++; const f = (s - cum[q]) / (cum[q + 1] - cum[q]); river.push([ch[q][0] + (ch[q + 1][0] - ch[q][0]) * f, ch[q][1] + (ch[q + 1][1] - ch[q][1]) * f]); }
  }
  const core = city.lanes.length ? city.lanes[0].o : [0, 0];
  // the old road to fly: the one heading farthest from where the river leaves the city
  const end = river.length ? river[river.length - 1] : [0, -H2];
  let lane = city.lanes[0], best = -Infinity;
  for (const L of city.lanes) { const s = -(L.u[0] * (end[0] - core[0]) + L.u[1] * (end[1] - core[1])); if (s > best) { best = s; lane = L; } }
  const on = (s) => [core[0] + lane.u[0] * s, core[1] + lane.u[1] * s];
  const laneEnd = Math.min(700, H2 / Math.max(Math.abs(lane.u[0]), Math.abs(lane.u[1])) - 80);
  // the tallest building
  let top = now.buildings[0];
  for (const b of now.buildings) if (b.height > (top ? top.height : 0)) top = b;
  const tc = top ? top.footprint.reduce((a, p) => [a[0] + p[0] / top.footprint.length, a[1] + p[1] / top.footprint.length], [0, 0]) : [0, 0];
  const tall = top ? top.base - zOff + top.height : 40;

  if (river.length) {
    const a = river[0];
    add(P(a[0] * 1.6, a[1] * 1.6, 90, -0.1), 'lake');                     // in from the country, down to the water
    for (let q = 0; q < river.length; q++) add(P(river[q][0], river[q][1], 9, 0.12), 'river');
  }
  const [cx, cy] = core;
  add(P(cx - lane.u[0] * 260, cy - lane.u[1] * 260, 90, -0.2), 'mountains');   // over the old core
  add(P(cx - lane.u[0] * 60, cy - lane.u[1] * 60, 60, -0.15), 'mountains');
  for (const s of [90, 200, 330, 460, 590].filter((s) => s < laneEnd)) { const [x, y] = on(s); add(P(x, y, gh(x, y) + 16, 0.14), 'falls'); }
  { const [x, y] = on(laneEnd + 120); add(P(x, y, gh(x, y) + 70, 0), 'falls'); }
  // up and round the towers, then out over the fields
  const r = 260, a0 = Math.atan2(on(laneEnd)[1] - tc[1], on(laneEnd)[0] - tc[0]);
  for (let q = 0; q < 4; q++) { const a = a0 + q * 1.1; add(P(tc[0] + Math.cos(a) * r, tc[1] + Math.sin(a) * r, Math.max(140, tall + 50), -0.18), q < 2 ? 'mountains' : 'stars'); }
  const back = river.length ? river[0] : [-H2, -H2];
  const mid = [(tc[0] + back[0]) / 2, (tc[1] + back[1]) / 2], far = Math.hypot(mid[0], mid[1]) || 1;
  add(P(mid[0] / far * 1250, mid[1] / far * 1250, 160, -0.05), 'stars');
  add(P(back[0] * 1.9, back[1] * 1.9, 130, -0.05), 'lake');

  const w2 = g.river ? g.river.width / 2 : 0;
  const nearRiver = (x, y) => g.river && g.riverDistAt(x - C, y - C) < w2 - 2;
  const nearLane = (x, y) => {
    const dx = x - C - core[0], dy = y - C - core[1], s = dx * lane.u[0] + dy * lane.u[1], d = Math.abs(-dx * lane.u[1] + dy * lane.u[0]);
    return s > 70 && s < laneEnd + 40 && d < 5;
  };
  if (globalThis.DEBUG_CITY) console.log(JSON.stringify(pts.map((p, i) => [i, PLACES[i], Math.round(p.x), Math.round(p.y), p.z])));
  return loopThrough(world, pts, PLACES, (x, y) => nearRiver(x, y) || nearLane(x, y));
}
