// craft/world.mjs — blocks, items, and the seeded world generator.
//
// A world is a tiling (tiling.mjs) plus a column-major block array:
// blocks[c * H + y] is the block at column c, layer y. Generation is pure and
// deterministic in (seed, shape, radius): the viewer regenerates the world
// from the stream header rather than shipping 100k voxels, so this module is
// part of the replay contract. Changing what a seed generates is a
// CRAFT_VERSION bump, and the selftest pins a signature per shape.
//
// Everything lateral here walks the tile graph, never a square lattice: leaf
// crowns are graph balls, ore veins are graph random walks. On a Penrose world
// they come out Penrose-shaped.

import { buildTiling } from './tiling.mjs';

export const CRAFT_VERSION = 1;
export const H = 40;          // layers per column
export const SEA = 14;        // water fills air at y <= SEA

// ------------------------------------------------------------- blocks -------
// id → { name, solid (stands/blocks movement), hard (ticks by hand; Infinity =
// unbreakable), tool (pick tier required to get a drop), drop, color }
export const B = {
  air: 0, bedrock: 1, stone: 2, dirt: 3, grass: 4, sand: 5, water: 6, log: 7, leaves: 8,
  coal_ore: 9, iron_ore: 10, planks: 11, cobblestone: 12, crafting_table: 13, furnace: 14, torch: 15,
  door: 16, glass: 17, lava: 18,
};
export const BLOCKS = [];
const def = (name, o) => { BLOCKS[B[name]] = { id: B[name], name, solid: true, hard: 3, tool: 0, drop: name, color: '#888', ...o }; };
def('air',            { solid: false, hard: Infinity, drop: null, color: null });
def('bedrock',        { hard: Infinity, drop: null, color: '#3a3a3a' });
def('stone',          { hard: 15, tool: 1, drop: 'cobblestone', color: '#8a8a8a' });
def('dirt',           { hard: 3, color: '#86603e' });
def('grass',          { hard: 3, drop: 'dirt', color: '#5fa53a', side: '#86603e' });
def('sand',           { hard: 3, color: '#dccf8f' });
def('water',          { solid: false, hard: Infinity, drop: null, color: '#3f76e4' });
def('log',            { hard: 6, color: '#6b4f2a', top: '#a1824c' });
def('leaves',         { hard: 1, drop: null, color: '#3c8a2e' });
def('coal_ore',       { hard: 15, tool: 1, drop: 'coal', color: '#595959', fleck: '#1b1b1b' });
def('iron_ore',       { hard: 18, tool: 2, drop: 'iron_ore', color: '#8a8a8a', fleck: '#d8af93' });
def('planks',         { hard: 6, color: '#b8945a' });
def('cobblestone',    { hard: 15, tool: 1, color: '#7a7a7a' });
def('crafting_table', { hard: 6, color: '#8f6a3a', top: '#b8945a' });
def('furnace',        { hard: 15, tool: 1, color: '#6f6f6f', top: '#8a8a8a' });
def('torch',          { solid: false, hard: 1, color: '#ffd35a' });
// a door is open to the player and shut to every mob: the one block that
// makes a house a shelter rather than a box you cannot leave
def('door',           { solid: false, mobSolid: true, hard: 4, color: '#7a5530', top: '#8f6a3a' });
def('glass',          { hard: 1, drop: null, color: '#cfe8ef', clear: true });
// lava: nobody walks into it on purpose (planners treat it as a wall, mobs
// too), and whatever ends up inside it burns. It pools at the bottom of caves.
def('lava',           { solid: false, hazard: true, mobSolid: true, hard: Infinity, drop: null, color: '#ff6a1a', top: '#ffb13d' });

export const blockName = (id) => BLOCKS[id]?.name ?? '?';

// Items that place as a block. Everything else is inventory-only.
export const PLACEABLE = new Set(['dirt', 'sand', 'log', 'planks', 'cobblestone', 'crafting_table', 'furnace', 'torch', 'door', 'glass']);
// what a wall, a floor or a roof can be made of, best first
export const BUILDING = ['cobblestone', 'planks', 'dirt', 'sand', 'log'];

// Recipes are bags, not shapes: a grid-shaped recipe means nothing on a
// Penrose floor, and the agent should be deciding WHAT to make, not where.
// `at` names the station block that must be within reach.
export const RECIPES = {
  planks:          { n: 4, need: { log: 1 } },
  stick:           { n: 4, need: { planks: 2 } },
  crafting_table:  { n: 1, need: { planks: 4 } },
  wooden_pickaxe:  { n: 1, need: { planks: 3, stick: 2 }, at: 'crafting_table' },
  wooden_sword:    { n: 1, need: { planks: 2, stick: 1 }, at: 'crafting_table' },
  stone_pickaxe:   { n: 1, need: { cobblestone: 3, stick: 2 }, at: 'crafting_table' },
  stone_sword:     { n: 1, need: { cobblestone: 2, stick: 1 }, at: 'crafting_table' },
  furnace:         { n: 1, need: { cobblestone: 8 }, at: 'crafting_table' },
  // `alt` lists other bags that make the same thing: a torch from charcoal
  // means light without ever going underground
  torch:           { n: 4, need: { coal: 1, stick: 1 }, alt: [{ charcoal: 1, stick: 1 }] },
  charcoal:        { n: 1, need: { log: 1, planks: 1 }, at: 'furnace' },
  door:            { n: 3, need: { planks: 6 }, at: 'crafting_table' },
  glass:           { n: 4, need: { sand: 4, coal: 1 }, alt: [{ sand: 4, charcoal: 1 }], at: 'furnace' },
  iron_ingot:      { n: 1, need: { iron_ore: 1, coal: 1 }, alt: [{ iron_ore: 1, charcoal: 1 }], at: 'furnace' },
  cooked_porkchop: { n: 1, need: { porkchop: 1, coal: 1 }, alt: [{ porkchop: 1, charcoal: 1 }, { porkchop: 1, planks: 1 }], at: 'furnace' },
  iron_pickaxe:    { n: 1, need: { iron_ingot: 3, stick: 2 }, at: 'crafting_table' },
  iron_sword:      { n: 1, need: { iron_ingot: 2, stick: 1 }, at: 'crafting_table' },
};

export const recipeBags = (r) => [r.need, ...(r.alt || [])];

export const PICK_TIER = { wooden_pickaxe: 1, stone_pickaxe: 2, iron_pickaxe: 3 };
export const PICK_SPEED = { 0: 1, 1: 2, 2: 4, 3: 6 };
export const SWORD_DMG = { none: 1, wooden_sword: 4, stone_sword: 5, iron_sword: 6 };
export const FOOD = { apple: 4, porkchop: 3, cooked_porkchop: 8 };

// ---------------------------------------------------------------- noise -----
export function hash32(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) { h ^= x >>> 0; h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
export const hash01 = (...xs) => hash32(...xs) / 4294967296;

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D value noise on an integer lattice, smoothstepped — continuous in (x, z),
// so it is indifferent to which tiling samples it.
function vnoise(seed, x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const v = (i, j) => hash01(seed, i + 100000, j + 100000);
  const a = v(xi, zi), b = v(xi + 1, zi), c = v(xi, zi + 1), d = v(xi + 1, zi + 1);
  const u = s(fx), w = s(fz);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
function fbm(seed, x, z, oct = 4) {
  let s = 0, amp = 1, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { s += amp * vnoise(seed + o * 7919, x * f, z * f); norm += amp; amp *= 0.5; f *= 2; }
  return s / norm;
}

// ------------------------------------------------------------- generator ----
export const DEFAULTS = { seed: 1, shape: 'penrose', radius: 28, kind: 'island' };

// World kinds. `island` is the original and is byte-identical to it (its
// signatures are pinned). The others exist so the harness meets situations it
// was not written against: wood you have to walk for, cliffs you have to cut
// stairs up, caves with lava and zombies in the dark at noon, water between
// you and everything else. `mixed` blends biomes by region, for big worlds.
export const KINDS = ['island', 'archipelago', 'highlands', 'caverns', 'desert', 'forest', 'mixed'];
export const SIZES = { s: 28, m: 44, l: 64 };
const smooth = (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

export function generateWorld(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { seed, shape, kind } = o;
  const radius = o.size && SIZES[o.size] ? SIZES[o.size] : o.radius;
  if (!KINDS.includes(kind)) throw new Error(`unknown world kind '${kind}' — one of ${KINDS.join(', ')}`);
  const tiling = buildTiling(shape, radius);
  const cols = tiling.cols, N = cols.length;
  const blocks = new Uint8Array(N * H);
  const height = new Int16Array(N);
  const biome = new Uint8Array(N);          // 0 plains, 1 desert, 2 forest, 3 highlands
  const rng = mulberry(hash32(seed, 0xC0FFEE));

  // terrain. Every kind is still an island at heart — pulled under the sea
  // toward the rim so the world's edge is ocean rather than a cliff into nothing.
  for (let c = 0; c < N; c++) {
    const { x, z } = cols[c];
    const r = Math.hypot(x, z) / radius;
    const hills = fbm(seed, x / 18, z / 18);
    const ridge = fbm(seed + 31, x / 7, z / 7);
    const fall = Math.max(0, (r - 0.55) / 0.45);
    let h = 11 + hills * 16 + ridge * 4 - fall * fall * 16;
    let bio = 0;
    if (kind === 'archipelago') {
      // low ground: most of it under the sea, islets where the noise peaks
      const isl = fbm(seed + 77, x / 9, z / 9);
      h = 2 + isl * 22 + ridge * 3 - fall * fall * 10;
    } else if (kind === 'highlands') {
      // tall, and TERRACED: steps of 3 are cliffs a walker cannot climb
      const m = Math.pow(fbm(seed + 5, x / 20, z / 20), 1.4);
      h = 12 + m * 30 + ridge * 5 - fall * fall * 22;
      if (h > SEA + 2) h = SEA + 2 + Math.round((h - SEA - 2) / 3) * 3;
      bio = 3;
    } else if (kind === 'desert') bio = 1;
    else if (kind === 'forest') bio = 2;
    else if (kind === 'mixed') {
      const b = fbm(seed + 911, x / 34, z / 34);
      const high = Math.pow(fbm(seed + 5, x / 20, z / 20), 1.4) * 30 + 12 + ridge * 5 - fall * fall * 22;
      h = h + (high - h) * smooth(0.58, 0.7, b);
      bio = b < 0.4 ? 1 : b < 0.5 ? 0 : b < 0.62 ? 2 : 3;
    }
    h = Math.max(3, Math.min(H - (bio === 3 ? 8 : 12), Math.round(h)));
    height[c] = h;
    biome[c] = bio;
    const beach = h <= SEA + 1;
    const sandy = beach || bio === 1;
    for (let y = 0; y <= h; y++) {
      let b;
      if (y === 0) b = B.bedrock;
      else if (y < h - 3) b = B.stone;
      else if (y < h) b = sandy ? B.sand : B.dirt;
      else b = sandy ? B.sand : (h < SEA ? B.dirt : bio === 3 && h > SEA + 14 ? B.stone : B.grass);
      blocks[c * H + y] = b;
    }
    for (let y = h + 1; y <= SEA; y++) blocks[c * H + y] = B.water;
  }

  // caves (caverns, highlands and mixed): tunnels where two noise fields both
  // sit near their middle — worm-like, and they open to the surface here and
  // there. Lava pools in whatever cave space lies at the bottom.
  if (kind === 'caverns' || kind === 'highlands' || kind === 'mixed') {
    const wide = kind === 'caverns' ? 0.075 : 0.05;
    for (let c = 0; c < N; c++) {
      const { x, z } = cols[c];
      const h = height[c];
      for (let y = 2; y <= h - (kind === 'caverns' ? 1 : 3); y++) {
        const a = fbm(seed + 401, x / 7 + y * 0.31, z / 7 - y * 0.17, 3);
        const b2 = fbm(seed + 733, x / 7 - y * 0.23, z / 7 + y * 0.29, 3);
        if (Math.abs(a - 0.5) < wide && Math.abs(b2 - 0.5) < wide * 1.4) {
          const i = c * H + y;
          if (blocks[i] === B.water || blocks[i + 1] === B.water) continue;
          blocks[i] = y <= 4 ? B.lava : B.air;
        }
      }
    }
  }

  // ore veins: a graph random walk from a seed voxel, replacing stone only.
  const vein = (c, y, kind, len) => {
    for (let k = 0; k < len; k++) {
      if (blocks[c * H + y] === B.stone) blocks[c * H + y] = kind;
      const roll = rng();
      if (roll < 0.25 && y > 1) y--;
      else if (roll < 0.4 && y < H - 1) y++;
      else if (cols[c].adj.length) c = cols[c].adj[Math.floor(rng() * cols[c].adj.length)];
    }
  };
  const veins = Math.round(N / 30);
  for (let v = 0; v < veins; v++) {
    const c = Math.floor(rng() * N);
    const top = height[c] - 4;
    if (top < 2) continue;
    const y = 1 + Math.floor(rng() * top);
    vein(c, y, B.coal_ore, 5 + Math.floor(rng() * 5));
  }
  for (let v = 0; v < Math.round(veins * 0.6); v++) {
    const c = Math.floor(rng() * N);
    const top = Math.min(height[c] - 5, 12);
    if (top < 2) continue;
    const y = 1 + Math.floor(rng() * top);
    vein(c, y, B.iron_ore, 3 + Math.floor(rng() * 4));
  }

  // trees: a trunk on grass, a crown that is a BALL IN THE TILE GRAPH —
  // radius 2 at the top two trunk layers, radius 1 above. Kept ≥ 3 hops apart.
  const ball = (c, r) => {
    const seen = new Map([[c, 0]]), q = [c];
    while (q.length) {
      const u = q.shift(), d = seen.get(u);
      if (d === r) continue;
      for (const w of cols[u].adj) if (!seen.has(w)) { seen.set(w, d + 1); q.push(w); }
    }
    return seen;
  };
  const treeless = new Uint8Array(N);
  const trees = [];
  // desert: one oasis of trees somewhere, and almost nothing else
  const oasis = kind === 'desert' ? cols[Math.floor(rng() * N)] : null;
  for (let c = 0; c < N; c++) {
    const h = height[c];
    const onSand = biome[c] === 1 && blocks[c * H + h] === B.sand && h > SEA;
    if ((blocks[c * H + h] !== B.grass && !onSand) || treeless[c]) continue;
    let p = 0.045;
    if (biome[c] === 2) p = 0.16;
    else if (biome[c] === 3) p = 0.02;
    else if (biome[c] === 1) p = oasis && Math.hypot(cols[c].x - oasis.x, cols[c].z - oasis.z) < 6 ? 0.2 : 0.002;
    if (hash01(seed, c, 0x7EE) > p) continue;
    const tall = 4 + (hash32(seed, c, 0x7AA) % 2);
    if (h + tall + 2 >= H) continue;
    for (const [u] of ball(c, 3)) treeless[u] = 1;
    for (let y = h + 1; y <= h + tall; y++) blocks[c * H + y] = B.log;
    for (const [u, d] of ball(c, 2)) {
      for (let y = h + tall - 1; y <= h + tall + 1; y++) {
        if (y === h + tall + 1 && d > 1) continue;
        if (blocks[u * H + y] === B.air) blocks[u * H + y] = B.leaves;
      }
    }
    blocks[c * H + h + tall + 1] = B.leaves;
    trees.push(c);
  }

  // spawn: the grass column nearest the centre (sand, in a desert)
  let spawn = -1, best = Infinity;
  const ground = kind === 'desert' ? [B.sand, B.grass] : [B.grass];
  for (let pass = 0; pass < 2 && spawn < 0; pass++) {
    for (let c = 0; c < N; c++) {
      const top = blocks[c * H + height[c]];
      if (!(pass ? [B.grass, B.sand, B.dirt, B.stone] : ground).includes(top) || height[c] <= SEA) continue;
      if (blocks[c * H + height[c] + 1] !== B.air) continue;
      const d = Math.hypot(cols[c].x, cols[c].z);
      if (d < best) { best = d; spawn = c; }
    }
  }
  return { version: CRAFT_VERSION, seed, shape, radius, kind, H, tiling, blocks, height, biome, spawn, trees };
}

// FNV over the block array — the world's fingerprint, pinned per shape.
export function worldSignature(world) {
  let h = 2166136261 >>> 0;
  const b = world.blocks;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
  return (h >>> 0).toString(16).padStart(8, '0');
}
