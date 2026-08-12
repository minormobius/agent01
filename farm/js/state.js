// state.js — THE FARM KERNEL. Pure, DOM-free, deterministic: the whole save shape and every rule that
// mutates it. The UI calls these; the PDS just stores the result. Node-tested (test/state.selftest.mjs).
//
// TIME. hoop's garden counts abstract "days" advanced by resting; a Bluesky farm has no rest verb, so
// growth runs on the WALL CLOCK: one ark growthDay = DAY_MS of real time. Since v4, growth is the
// SETTLE MODEL: each plant banks effective ms (`grownMs` as of `calcAt`) and the live tail accrues at
// a piecewise rate — full while watered (wateredAt + WATER_MS, or irrigated), DRY_RATE after.
// Readiness is a pure function of (farm, plant, crop, now, tendCount) — no server tick, no stored
// countdown, and any visitor can recompute your bed's state from your public plot record alone.
//
// FRIENDS SPEED GROWTH. Each distinct friend who tends a plant (a com.minomobi.farm.tend record in the
// FRIEND's own repo, subject = your DID) shaves 10% off its total growth time, capped at 5 friends /
// 50%. The tend records are public, so the boost is verifiable by anyone — nothing here is trusted
// client state beyond your own plot record.
//
// All mutators return a NEW farm object (callers persist it); invalid moves return { ok:false, reason }.

import { bedKeepouts, inKeepout, plantNear, MIN_SPACING } from '../vendor/garden.js';
import { pull as gachaPull, pullRng, biomeForKey, biomeById, PULL_COST, progress } from '../vendor/gacha.js';
import { gradeOf } from '../vendor/alchemy.js';

// ── THE WORLD GRID — PARCELS (the cities-skylines model) ─────────────────────────────────────────
// The world is a 5×5 grid of PARCELS, each FIELD_T×FIELD_T tiles; you start owning the middle one
// (your seeded field) and BUY neighbours outward. Every other parcel rolls a terrain archetype from
// (seed, px, py) — hills to flatten, a lake to live with or drain, an old road cutting through,
// boulder fields, or a lucky fertile flat — so expansion is buying PROBLEMS worth solving, not just
// blank meadow. Plant coordinates stay bed-normalized (world tile / FIELD_T); a plant on bought
// land simply has x or y outside [0,1].
export const FIELD_T = 12;
export const PARCEL_R = 2;                                     // parcel ring radius → px,py ∈ [-2, 2]
export const WORLD_MIN = -PARCEL_R * FIELD_T;                  // -24
export const WORLD_MAX = (PARCEL_R + 1) * FIELD_T - 1;         // 35 (inclusive) — 60×60 tiles
export const inWorld = (tx, ty) => tx >= WORLD_MIN && tx <= WORLD_MAX && ty >= WORLD_MIN && ty <= WORLD_MAX;
export const parcelOf = (tx, ty) => [Math.floor(tx / FIELD_T), Math.floor(ty / FIELD_T)];
export const parcelKey = (px, py) => px + ',' + py;
export const inGrid = (px, py) => Math.abs(px) <= PARCEL_R && Math.abs(py) <= PARCEL_R;
export const ownsParcel = (farm, px, py) => (farm.parcels || ['0,0']).includes(parcelKey(px, py));
export const ownsTile = (farm, tx, ty) => inWorld(tx, ty) && ownsParcel(farm, ...parcelOf(tx, ty));

// the price of the n-th purchase, scaled by how far the parcel sits from home (chebyshev ring):
// first neighbour 200◈, and it climbs with every deed of sale — land is the long game's coin sink.
export const parcelPrice = (farm, px, py) => {
  const n = (farm.parcels || ['0,0']).length;                  // purchases so far, home included
  const ring = Math.max(1, Math.max(Math.abs(px), Math.abs(py)));
  return 200 * n * ring;
};
// buyable = unowned, in the grid, orthogonally adjacent to owned land (the CS rule)
export function buyableParcels(farm) {
  const owned = new Set(farm.parcels || ['0,0']);
  const out = [];
  for (let px = -PARCEL_R; px <= PARCEL_R; px++) for (let py = -PARCEL_R; py <= PARCEL_R; py++) {
    if (owned.has(parcelKey(px, py))) continue;
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => owned.has(parcelKey(px + dx, py + dy)));
    if (adj) out.push({ px, py, price: parcelPrice(farm, px, py) });
  }
  return out;
}

export const DAY_MS = 30 * 60 * 1000;      // one ark growthDay = 30 real minutes (fast crops ≈ 2h, epics a day+)
export const START_COINS = 30;
export const TEND_CUT = 0.10;              // each distinct tending friend cuts total growth time by this…
export const TEND_CAP = 5;                 // …up to five friends (50% — a well-loved plant grows twice as fast)
export const FRESH_SPD = 4;                // freshly-broken ground: a brand-new farm's first plantings grow 4×
export const FRESH_PLANTS = 3;             //   (this many), so the first harvest lands inside the first session
export const SELL_FLOOR = 2;

// the vessel tax: the fancier preparations each consume one planetary metal from the mine (the
// herb→planet→metal bridge, walked backwards — you dig the vessel your brew deserves).
export const PREP_METAL = { tonic: 'silver', elixir: 'gold', balm: 'copper', smoke: 'tin', oil: 'quicksilver' };

// terraforming price list (coins). Tools apply to one tile; guards in terraform().
export const TERRA_COST = { till: 15, pond: 30, path: 5, clear: 40, meadow: 5, flatten: 60 };

// ── IRRIGATION ────────────────────────────────────────────────────────────────────────────────────
// Watering is a TASK: a watered plant grows at full rate for WATER_MS, then dries out and grows at
// DRY_RATE until watered again. Water is free — the cost is your attention, which is exactly what
// stops scaling as the estate grows. Easing that is what the waterworks tech tree is FOR.
export const WATER_MS = 6 * 3600 * 1000;   // one watering holds for 6h
export const DRY_RATE = 0.5;               // a dry plant grows at half speed (never stops — no punishment spiral)
export const SPRINKLER_COST = { coins: 40, tin: 1 };

// ── SUPPLIES, PESTS & THE ORGANIC PREMIUM ─────────────────────────────────────────────────────────
// Synthetic inputs are cheap, instant — and PERMANENT: one squirt of either marks the plant (and all
// its produce) conventional. Organic produce sells at ORGANIC_PREMIUM and is the ONLY produce the
// alchemy bench accepts (a synthetic-fed herb loses its Galenic correspondence). That is the major
// bump: organic is slower and needier, and worth it twice over.
export const SUPPLY_COST = { fert: 12, pest: 8 };
export const FERT_BUMP = 0.25;             // fertilizer instantly banks 25% of base growth (max 2 doses/plant)
export const FERT_MAX = 2;
export const ORGANIC_PREMIUM = 1.75;       // organic produce sells at ×1.75
export const PEST_WINDOW_MS = 4 * 3600 * 1000;   // infestation rolls in 4h windows (window 0 is always safe)
export const PEST_RATE = 0.22;             // chance a window is infested (halved by ladybugs, organic plants)
export const PEST_BITE = 2;                // harvesting through an infestation costs this much yield (min 1 stays)
export const SPRAY_IMMUNE_W = 6;           // synthetic spray clears this window + the next 5
export const REMEDY_IMMUNE_W = 3;          // a caustic brew clears this window + the next 2, and stays organic

// ── THE WATERWORKS TECH TREE ──────────────────────────────────────────────────────────────────────
// Researched at the windmill; each rung eases irrigation at scale or deepens the organic game.
// Costs spend coins AND planetary metals (the mine feeds the tree); `req` gates order; `needs` are
// non-spent prerequisites shown live like the pack ladder.
export const TECHS = [
  { id: 'sprinklers', emoji: '🌀', name: 'Sprinklers',          cost: { coins: 150, copper: 2 },              desc: 'craft-place sprinklers — every plant on the 8 neighbouring tiles stays watered' },
  { id: 'channels',   emoji: '〰️', name: 'Irrigation channels', cost: { coins: 400, iron: 3 },  req: 'sprinklers', desc: 'water reaches 2 tiles from any pond or lake shore' },
  { id: 'windpump',   emoji: '🌬️', name: 'Wind pump',           cost: { coins: 900, tin: 2, silver: 2 }, req: 'channels', desc: 'sprinklers reach 2 tiles' },
  { id: 'deepwell',   emoji: '⛲', name: 'Deep well',           cost: { coins: 2000, gold: 1, quicksilver: 1 }, req: 'windpump', desc: 'every plant on owned land is always watered' },
  { id: 'compost',    emoji: '🍂', name: 'Compost lore',        cost: { coins: 250 }, needs: { organicHarvests: 10 }, desc: 'organic harvests return +1 seed' },
  { id: 'ladybugs',   emoji: '🐞', name: 'Ladybug husbandry',   cost: { coins: 500 }, req: 'compost', needs: { brews: 3 }, desc: 'pest windows halve on organic plants' },
];
export const techById = (id) => TECHS.find((t) => t.id === id) || null;
export const hasTech = (farm, id) => !!(farm.tech && farm.tech[id]);

// the five station buildings — the game's rooms, standing on the map. Default spots ring the field.
export const BUILDING_KINDS = {
  desk:  { emoji: '🎪', name: 'trade desk',  panel: 'desk' },
  mine:  { emoji: '⛏️', name: 'mine head',   panel: 'mine' },
  bench: { emoji: '⚗️', name: 'alchemy hut', panel: 'bench' },
  gate:  { emoji: '📮', name: 'friend gate', panel: 'friends' },
  sign:  { emoji: '🪧', name: 'deeds sign',  panel: 'deeds' },
  mill:  { emoji: '🌬️', name: 'waterworks',  panel: 'mill' },
};
// default stations live INSIDE the home parcel (the only land a fresh farm owns). Wanted spots ring
// the field edge; each slides along a deterministic probe order until it clears the seeded keep-outs.
export function defaultBuildings(seed) {
  const wanted = [
    { id: 'desk',  kind: 'desk',  tx: 10, ty: 1 },
    { id: 'mine',  kind: 'mine',  tx: 10, ty: 10 },
    { id: 'bench', kind: 'bench', tx: 1,  ty: 10 },
    { id: 'gate',  kind: 'gate',  tx: 1,  ty: 1 },
    { id: 'sign',  kind: 'sign',  tx: 6,  ty: 11 },
    { id: 'mill',  kind: 'mill',  tx: 11, ty: 6 },
  ];
  const used = new Set();
  return wanted.map((w) => {
    let { tx, ty } = w;
    for (let step = 0; step < FIELD_T * FIELD_T; step++) {
      const t = baseTile(seed >>> 0, tx, ty);
      if (t !== 'pond' && t !== 'stone' && !used.has(tx + ',' + ty)) break;
      tx = (tx + 1) % FIELD_T;                      // deterministic slide, row-major
      if (tx === 0) ty = (ty + 1) % FIELD_T;
    }
    used.add(tx + ',' + ty);
    return { id: w.id, kind: w.kind, tx, ty };
  });
}

// ecosystem-pack ladder: unlocking the (i+2)-th biome (home is free) needs ALL of the row. Explicit
// and checkable — the desk renders exactly this table with live ✓/✗ so "how do I unlock" is never
// a mystery.
export const PACK_REQS = [
  { coins: 100,  harvests: 10 },
  { coins: 250,  harvests: 25,  depth: 3 },
  { coins: 500,  harvests: 50,  depth: 8,  brews: 5 },
  { coins: 900,  harvests: 90,  depth: 12, biomesClosed: 1 },
  { coins: 1500, harvests: 150, depth: 16, biomesClosed: 2 },
];

// ── seed hash (fnv-1a — house family) ──
export function hashDid(did) {
  let h = 2166136261;
  for (const ch of String(did || 'wanderer')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export const cropById = (ark, id) => {
  for (const b of (ark && ark.biomes) || []) for (const c of b.crops || []) if (c.id === id) return c;
  return null;
};
export const allCrops = (ark) => ((ark && ark.biomes) || []).flatMap((b) => b.crops || []);

// ── a fresh farm — everything derived from the DID, so two devices agree before the first sync ──
// Your HOME BIOME is biomeForKey(did): different players draw from different crop pools, which is what
// makes friend-to-friend seed gifts an economy instead of a greeting card.
export function newFarm(did, ark, now = 0) {
  const seed = hashDid(did);
  const biome = biomeForKey(ark, did || 'wanderer');
  // starter bag: 3 of each of the two fastest crops in the HOME biome (deterministic by seed order)
  const seeds = {};
  const fast = ((biome && biome.crops) || []).slice().sort((a, b) => a.growthDays - b.growthDays || a.id.localeCompare(b.id)).slice(0, 2);
  for (const c of fast) seeds[c.id] = 3;
  return {
    v: 4, seed,
    biomeId: biome ? biome.id : null,
    activeBiome: biome ? biome.id : null,   // which unlocked pack the desk pulls from
    packs: biome ? [biome.id] : [],         // unlocked ecosystem packs (home is free)
    parcels: ['0,0'],                       // owned land (parcel keys); neighbours bought outward
    terra: {},                              // "tx,ty" → tile-kind overrides on the seeded baseline
    buildings: defaultBuildings(seed),      // the five stations, movable in craft mode
    coins: START_COINS,
    bed: { seed, plants: [], nextId: 0 },
    seeds,                       // cropId → count (plantable)
    pantry: {},                  // cropId → count — ORGANIC produce (bench-worthy, premium at market)
    pantryC: {},                 // cropId → count — conventional produce (synthetic-touched; sells plain, never brews)
    supplies: { fert: 0, pest: 0 },   // synthetic inputs, bought at the desk
    tech: {},                    // techId → researched-at ISO (the waterworks tree)
    fixtures: [],                // placed irrigation kit [{ id, kind:'sprinkler', tx, ty }]
    metals: {},                  // metal → count (from the mine: gold silver quicksilver copper iron tin lead)
    shards: 0,                   // quintessence shards (mine) — one steadies a wobbly brew
    preparations: [],            // brewed items [{ id, vessel, grade, label, use, glyphs, reagents, at }]
    owned: [],                   // crop ids ever held (the gacha collection)
    pulls: 0,                    // gacha pulls taken (the per-pull RNG index — determinism is load-bearing)
    mine: { depth: 0, runDepth: 0, picks: 0, picksBonus: 0, bombs: 0, dug: {}, lastEntered: 0 },
    effects: { yieldBoost: 0, wardUntil: 0 },   // rousing brews bank +1-yield harvests; sedate brews ward the market
    achievements: {},            // id → ISO earned-at
    claimedGifts: [],            // at:// uris of friend gifts already folded into this save
    stats: { planted: 0, harvests: 0, produce: 0, sold: 0, tendsGiven: 0, giftsSent: 0, brews: 0, bestGrade: null, oresMined: 0, gemsFound: 0, terraforms: 0, movedBuildings: 0, organicHarvests: 0, pestsTreated: 0 },
    createdAt: now, updatedAt: now,
  };
}

const clone = (f) => JSON.parse(JSON.stringify(f));

// ── PARCEL TERRAIN — the seeded archetype roll ────────────────────────────────────────────────────
// Each non-home parcel gets terrain from (seed, px, py): hills / lake / road / boulders / fertile.
// Deterministic and memoized (a 12×12 kind-map per parcel), so every viewer sees the same land and
// the estate re-rolls identically forever. Guaranteed workable: features are budgeted so most of a
// parcel is always meadow.
const _terrainCache = new Map();
function parcelRng(seed, px, py) {
  let h = (seed >>> 0) ^ 0x51ed2701;
  for (const ch of 'parcel:' + px + ',' + py) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 7), 1 | t); t ^= t + Math.imul(t ^ (t >>> 13), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function parcelTerrain(seed, px, py) {
  const key = seed + ':' + px + ',' + py;
  if (_terrainCache.has(key)) return _terrainCache.get(key);
  const rng = parcelRng(seed, px, py);
  const map = new Array(FIELD_T * FIELD_T).fill('meadow');
  const put = (x, y, k) => { if (x >= 0 && y >= 0 && x < FIELD_T && y < FIELD_T) map[y * FIELD_T + x] = k; };
  const roll = rng();
  const archetype = roll < 0.25 ? 'hills' : roll < 0.5 ? 'lake' : roll < 0.7 ? 'road' : roll < 0.85 ? 'boulders' : 'fertile';
  if (archetype === 'hills') {
    // 2–3 ridges: drunken walks that pile HILL tiles (unplantable until flattened, 60◈ each)
    const ridges = 2 + (rng() < 0.5 ? 1 : 0);
    for (let r = 0; r < ridges; r++) {
      let x = 1 + Math.floor(rng() * (FIELD_T - 2)), y = 1 + Math.floor(rng() * (FIELD_T - 2));
      const len = 5 + Math.floor(rng() * 5);
      for (let i = 0; i < len; i++) {
        put(x, y, 'hill');
        if (rng() < 0.5) put(x + 1, y, 'hill');
        x += rng() < 0.5 ? 1 : 0; y += rng() < 0.6 ? 1 : -0;
        if (rng() < 0.3) y -= 1;
        x = Math.max(0, Math.min(FIELD_T - 1, x)); y = Math.max(0, Math.min(FIELD_T - 1, y));
      }
    }
  } else if (archetype === 'lake') {
    // one honest lake: an ellipse of water (shoreline rows are prime pond-boost real estate)
    const cx = 3 + rng() * 6, cy = 3 + rng() * 6, rx = 1.6 + rng() * 1.8, ry = 1.4 + rng() * 1.6;
    for (let y = 0; y < FIELD_T; y++) for (let x = 0; x < FIELD_T; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, 'pond');
    }
  } else if (archetype === 'road') {
    // an old road cutting straight through (till it over at 15◈ a tile, or keep it as a lane)
    const vertical = rng() < 0.5, at = 2 + Math.floor(rng() * (FIELD_T - 4));
    for (let i = 0; i < FIELD_T; i++) vertical ? put(at, i, 'road') : put(i, at, 'road');
    if (rng() < 0.4) { const branch = 2 + Math.floor(rng() * (FIELD_T - 4)); for (let i = 0; i < FIELD_T / 2; i++) vertical ? put(at + i, branch, 'road') : put(branch, at + i, 'road'); }
  } else if (archetype === 'boulders') {
    const n = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) put(Math.floor(rng() * FIELD_T), Math.floor(rng() * FIELD_T), 'stone');
  } // fertile: nothing but the stray stones below
  // every parcel gets a couple of stray stones for texture
  const strays = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < strays; i++) {
    const x = Math.floor(rng() * FIELD_T), y = Math.floor(rng() * FIELD_T);
    if (map[y * FIELD_T + x] === 'meadow') put(x, y, 'stone');
  }
  const out = { archetype, map };
  _terrainCache.set(key, out);
  return out;
}

// ── TILES: seeded baseline + terraform overrides ──────────────────────────────────────────────────
// baseline: the home parcel is the seeded field (soil + the pond/stones/path keep-outs, exactly the
// old geometry, sampled at tile centres); every other parcel shows its terrain roll.
export function baseTile(seed, tx, ty) {
  const [px, py] = parcelOf(tx, ty);
  if (px !== 0 || py !== 0) {
    if (!inGrid(px, py)) return 'meadow';
    const t = parcelTerrain(seed, px, py);
    return t.map[(ty - py * FIELD_T) * FIELD_T + (tx - px * FIELD_T)];
  }
  const keepouts = bedKeepouts(seed);
  const nx = (tx + 0.5) / FIELD_T, ny = (ty + 0.5) / FIELD_T;
  if (!inKeepout(keepouts, nx, ny)) return 'soil';
  for (const bl of keepouts.blobs || []) {
    if ((nx - bl.x) ** 2 + (ny - bl.y) ** 2 < bl.r * bl.r) return bl.kind === 'pond' ? 'pond' : 'stone';
  }
  return 'path';
}
// the tile the world actually shows: terraform override first, baseline otherwise.
export const tileAt = (farm, tx, ty) => (farm.terra && farm.terra[tx + ',' + ty]) || baseTile(farm.bed.seed, tx, ty);

export const buildingAt = (farm, tx, ty) => (farm.buildings || []).find((b) => b.tx === tx && b.ty === ty) || null;
const plantOnTile = (farm, tx, ty) => farm.bed.plants.some((p) => Math.floor(p.x * FIELD_T) === tx && Math.floor(p.y * FIELD_T) === ty);

// can a seed go in at bed-normalized (x,y)? soil tile (terraform-aware), inside the world, no
// building squatting on it, and the old footprint rule against every other plant.
export function plantableTile(farm, x, y) {
  const tx = Math.floor(x * FIELD_T), ty = Math.floor(y * FIELD_T);
  if (!inWorld(tx, ty)) return false;
  if (!ownsTile(farm, tx, ty)) return false;
  if (tileAt(farm, tx, ty) !== 'soil') return false;
  if (buildingAt(farm, tx, ty)) return false;
  for (const p of farm.bed.plants) if ((p.x - x) ** 2 + (p.y - y) ** 2 < MIN_SPACING * MIN_SPACING) return false;
  return true;
}

// ── planting ──────────────────────────────────────────────────────────────────────────────────────
export function plantSeed(farm, x, y, cropId, ark, now) {
  if (!farm.seeds[cropId]) return { ok: false, reason: 'no seed of that crop in the bag' };
  const crop = cropById(ark, cropId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  if (!plantableTile(farm, x, y)) return { ok: false, reason: 'not plantable there — needs open tilled soil (craft mode tills the meadow)' };
  const next = clone(farm);
  const spd = next.stats.harvests === 0 && next.bed.plants.length < FRESH_PLANTS ? FRESH_SPD : 1;
  // grownMs/calcAt is the SETTLE MODEL: banked effective growth as of calcAt, extended live by the
  // piecewise watered/dry rate. wateredAt = now — a fresh planting is watered in.
  next.bed.plants.push({ id: 'p' + next.bed.nextId, x: +x.toFixed(4), y: +y.toFixed(4), seedId: cropId, at: now, spd, grownMs: 0, calcAt: now, wateredAt: now, fertN: 0, syn: false, pestOkW: 0 });
  next.bed.nextId++;
  next.seeds[cropId]--; if (!next.seeds[cropId]) delete next.seeds[cropId];
  if (!next.owned.includes(cropId)) next.owned.push(cropId);
  next.stats.planted++;
  next.updatedAt = now;
  return { ok: true, farm: next, spd };
}

// ── IRRIGATION: who is watered without lifting a can ─────────────────────────────────────────────
// A plant beside water (radius 1, or 2 with channels), in a sprinkler's reach (radius 1, or 2 with
// the wind pump), or anywhere at all once the deep well is sunk. All from public state — a viewer
// recomputes your irrigation map exactly.
export function irrigated(farm, plant) {
  if (hasTech(farm, 'deepwell')) return true;
  const tx = Math.floor(plant.x * FIELD_T), ty = Math.floor(plant.y * FIELD_T);
  const waterR = hasTech(farm, 'channels') ? 2 : 1;
  for (let dx = -waterR; dx <= waterR; dx++) for (let dy = -waterR; dy <= waterR; dy++) {
    if (!dx && !dy) continue;
    if (inWorld(tx + dx, ty + dy) && tileAt(farm, tx + dx, ty + dy) === 'pond') return true;
  }
  const sprR = hasTech(farm, 'windpump') ? 2 : 1;
  for (const f of farm.fixtures || []) {
    if (f.kind === 'sprinkler' && Math.abs(f.tx - tx) <= sprR && Math.abs(f.ty - ty) <= sprR) return true;
  }
  return false;
}
export const isWatered = (farm, plant, now) => irrigated(farm, plant) || now <= (plant.wateredAt || 0) + WATER_MS;

// effective growth ms accrued between a and b for this plant (piecewise: full rate while the last
// watering holds, DRY_RATE after) — the heart of the settle model. Irrigated plants never dry.
function effectiveMs(farm, plant, a, b) {
  if (b <= a) return 0;
  const spd = plant.spd || 1;
  if (irrigated(farm, plant)) return (b - a) * spd;
  const wetEnd = Math.min(b, Math.max(a, (plant.wateredAt || 0) + WATER_MS));
  const wet = Math.max(0, wetEnd - a);
  return (wet + (b - a - wet) * DRY_RATE) * spd;
}
// settle: bank growth up to `now` (call before any mutation that changes the rate, e.g. watering)
function settle(plant, farm, now) {
  plant.grownMs = (plant.grownMs || 0) + effectiveMs(farm, plant, plant.calcAt != null ? plant.calcAt : plant.at, now);
  plant.calcAt = now;
}

// ── PESTS: deterministic infestation windows ──────────────────────────────────────────────────────
// Window w of a plant's life (4h each; window 0 always safe) is infested when the seeded hash says
// so — the same verdict on every machine. Treated windows (pestOkW covers them) are clear. Ladybug
// husbandry halves the rate for organic plants.
export const pestWindow = (plant, now) => Math.floor(Math.max(0, now - plant.at) / PEST_WINDOW_MS);
export function isInfested(farm, plant, now) {
  const w = pestWindow(plant, now);
  if (w < 1) return false;
  if ((plant.pestOkW | 0) >= w) return false;
  let h = (farm.seed >>> 0) ^ 0x5ee71e57;
  for (const ch of plant.id + ':' + w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const roll = ((h >>> 0) % 10000) / 10000;
  const rate = hasTech(farm, 'ladybugs') && !plant.syn ? PEST_RATE / 2 : PEST_RATE;
  return roll < rate;
}

// ── growth: pure (farm, plant, crop, now, tendCount) → stage ──────────────────────────────────────
// grownMs banks effective time as of calcAt; the live tail runs the watered/dry piecewise rate.
// Tends still cut total need 10% per distinct friend (cap 5).
export function growthOf(farm, plant, crop, now, tendCount = 0) {
  if (!plant || !crop) return { stage: 0, ready: false, msLeft: 0, needMs: 1, watered: false };
  const cut = Math.min(TEND_CAP, tendCount | 0) * TEND_CUT;
  const needMs = Math.max(1, (crop.growthDays | 0)) * DAY_MS * (1 - cut);
  const grown = (plant.grownMs || 0) + effectiveMs(farm, plant, plant.calcAt != null ? plant.calcAt : plant.at, now);
  const stage = Math.max(0, Math.min(1, grown / needMs));
  const watered = isWatered(farm, plant, now);
  const rate = (plant.spd || 1) * (watered ? 1 : DRY_RATE);
  return { stage, ready: stage >= 1, msLeft: Math.max(0, Math.round((needMs - grown) / rate)), needMs, watered };
}

// the watering TASK: free, per-plant, holds WATER_MS. Settles first so the dry spell is banked.
export function waterPlant(farm, plantId, now) {
  const idx = farm.bed.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return { ok: false, reason: 'no such plant' };
  const next = clone(farm);
  const p = next.bed.plants[idx];
  if (irrigated(next, p)) return { ok: false, reason: 'already irrigated — the water finds it by itself' };
  if (now <= (p.wateredAt || 0) + WATER_MS) return { ok: false, reason: 'still damp — water holds 6h' };
  settle(p, next, now);
  p.wateredAt = now;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// tendCounts: { plantId → distinct-friend count } assembled by social.js from public tend records.
export function harvestPlant(farm, plantId, ark, now, tendCounts = {}) {
  const idx = farm.bed.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return { ok: false, reason: 'no such plant' };
  const plant = farm.bed.plants[idx], crop = cropById(ark, plant.seedId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  if (!growthOf(farm, plant, crop, now, tendCounts[plantId] || 0).ready) return { ok: false, reason: 'not ripe yet' };
  const infested = isInfested(farm, plant, now);
  const next = clone(farm);
  next.bed.plants.splice(idx, 1);
  let yld = Math.max(1, crop.yield | 0);
  if (infested) yld = Math.max(1, yld - PEST_BITE);   // harvesting through the beetles costs
  if (next.effects.yieldBoost > 0) { yld += 1; next.effects.yieldBoost--; }
  const organic = !plant.syn;
  const pool = organic ? next.pantry : next.pantryC;
  pool[crop.id] = (pool[crop.id] || 0) + yld;
  let seedsBack = Math.max(1, Math.min(3, crop.yield | 0));
  if (organic && hasTech(next, 'compost')) seedsBack += 1;   // compost lore: organic ground gives back
  next.seeds[crop.id] = (next.seeds[crop.id] || 0) + seedsBack;
  next.stats.harvests++; next.stats.produce += yld;
  if (organic) next.stats.organicHarvests = (next.stats.organicHarvests | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next, cropId: crop.id, yield: yld, seeds: seedsBack, organic, bitten: infested };
}

// ── market ────────────────────────────────────────────────────────────────────────────────────────
export const sellPrice = (crop) => Math.max(SELL_FLOOR, Math.round((crop.seedCost || 10) * 0.5));
export const sellPriceOrganic = (crop) => Math.round(sellPrice(crop) * ORGANIC_PREMIUM);

// grade: 'organic' (the premium pantry) or 'conv' (synthetic-touched — plain price, never brews)
export function sellProduce(farm, cropId, qty, ark, now, grade = 'organic') {
  const poolKey = grade === 'conv' ? 'pantryC' : 'pantry';
  const have = (farm[poolKey] || {})[cropId] | 0;
  qty = Math.max(0, Math.min(have, qty | 0));
  if (!qty) return { ok: false, reason: 'nothing to sell' };
  const crop = cropById(ark, cropId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  const ward = now < (farm.effects.wardUntil || 0) ? 1.25 : 1;   // a sedate brew binds the market in your favour
  const unit = grade === 'conv' ? sellPrice(crop) : sellPriceOrganic(crop);
  const coins = Math.round(unit * qty * ward);
  const next = clone(farm);
  next[poolKey][cropId] -= qty; if (!next[poolKey][cropId]) delete next[poolKey][cropId];
  next.coins += coins; next.stats.sold += qty;
  next.updatedAt = now;
  return { ok: true, farm: next, coins, warded: ward > 1, organic: grade !== 'conv' };
}

// ── SUPPLIES + THE SYNTHETIC/ORGANIC FORK ─────────────────────────────────────────────────────────
export function buySupply(farm, kind, qty, now) {
  const price = SUPPLY_COST[kind];
  if (!price) return { ok: false, reason: 'no such supply' };
  qty = Math.max(1, qty | 0);
  if (farm.coins < price * qty) return { ok: false, reason: 'needs ' + price * qty + '◈' };
  const next = clone(farm);
  next.coins -= price * qty;
  next.supplies[kind] = (next.supplies[kind] | 0) + qty;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// synthetic fertilizer: instantly banks FERT_BUMP of base growth — and marks the plant conventional
// for life. Cheap, fast, and it costs you the premium AND the bench.
export function fertilizePlant(farm, plantId, ark, now) {
  if (!(farm.supplies.fert | 0)) return { ok: false, reason: 'no fertilizer — the desk sells it' };
  const idx = farm.bed.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return { ok: false, reason: 'no such plant' };
  const crop = cropById(ark, farm.bed.plants[idx].seedId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  const next = clone(farm);
  const p = next.bed.plants[idx];
  if ((p.fertN | 0) >= FERT_MAX) return { ok: false, reason: 'the soil can take no more' };
  next.supplies.fert--;
  settle(p, next, now);
  p.grownMs += FERT_BUMP * Math.max(1, (crop.growthDays | 0)) * DAY_MS;   // a dose = 25% of BASE need
  p.fertN = (p.fertN | 0) + 1;
  p.syn = true;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// treat an infestation: synthetic spray (cheap, long immunity, marks the plant) or an organic
// remedy — spend a CAUSTIC preparation from the bench (shorter immunity, stays organic).
export function treatPest(farm, plantId, method, now) {
  const idx = farm.bed.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return { ok: false, reason: 'no such plant' };
  if (!isInfested(farm, farm.bed.plants[idx], now)) return { ok: false, reason: 'nothing is chewing on it' };
  const next = clone(farm);
  const p = next.bed.plants[idx];
  const w = pestWindow(p, now);
  if (method === 'spray') {
    if (!(next.supplies.pest | 0)) return { ok: false, reason: 'no pesticide — the desk sells it' };
    next.supplies.pest--;
    p.pestOkW = w + SPRAY_IMMUNE_W - 1;
    p.syn = true;
  } else {
    const bIdx = next.preparations.findIndex((prep) => prep.use && prep.use.combat && prep.use.combat.kind === 'attack');
    if (bIdx < 0) return { ok: false, reason: 'no caustic preparation — brew something hot & dry' };
    next.preparations.splice(bIdx, 1);
    p.pestOkW = w + REMEDY_IMMUNE_W - 1;
  }
  next.stats.pestsTreated = (next.stats.pestsTreated | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next, organic: method !== 'spray' };
}

// ── THE WATERWORKS: research + sprinkler fixtures ─────────────────────────────────────────────────
export function techChecks(farm, tech) {
  const checks = [{ label: tech.cost.coins + '◈', met: farm.coins >= tech.cost.coins }];
  for (const [m, n] of Object.entries(tech.cost)) {
    if (m === 'coins') continue;
    checks.push({ label: n + ' ' + m, met: (farm.metals[m] | 0) >= n });
  }
  if (tech.req) checks.push({ label: 'after ' + (techById(tech.req) || {}).name, met: hasTech(farm, tech.req) });
  for (const [k, n] of Object.entries(tech.needs || {})) {
    checks.push({ label: n + ' ' + (k === 'organicHarvests' ? 'organic harvests' : k), met: (farm.stats[k] | 0) >= n });
  }
  return checks;
}
export function research(farm, techId, now) {
  const tech = techById(techId);
  if (!tech) return { ok: false, reason: 'no such craft' };
  if (hasTech(farm, techId)) return { ok: false, reason: 'already known' };
  const checks = techChecks(farm, tech);
  if (!checks.every((c) => c.met)) return { ok: false, reason: 'not yet: ' + checks.filter((c) => !c.met).map((c) => c.label).join(', ') };
  const next = clone(farm);
  next.coins -= tech.cost.coins;
  for (const [m, n] of Object.entries(tech.cost)) {
    if (m === 'coins') continue;
    next.metals[m] -= n; if (!next.metals[m]) delete next.metals[m];
  }
  next.tech[techId] = new Date(now).toISOString();
  next.updatedAt = now;
  return { ok: true, farm: next, tech };
}

// place (or, on an existing one, remove) a sprinkler. Needs the tech; costs coins + tin per head.
export function placeSprinkler(farm, tx, ty, now) {
  if (!hasTech(farm, 'sprinklers')) return { ok: false, reason: 'research sprinklers at the waterworks first' };
  const existing = (farm.fixtures || []).findIndex((f) => f.tx === tx && f.ty === ty);
  const next = clone(farm);
  if (existing >= 0) {   // pull it up: half the coins come back
    next.fixtures.splice(existing, 1);
    next.coins += Math.floor(SPRINKLER_COST.coins / 2);
    next.updatedAt = now;
    return { ok: true, farm: next, removed: true };
  }
  if (!ownsTile(farm, tx, ty)) return { ok: false, reason: 'not your land' };
  const t = tileAt(farm, tx, ty);
  if (t === 'pond' || t === 'hill') return { ok: false, reason: 'no footing there' };
  if (buildingAt(farm, tx, ty)) return { ok: false, reason: 'a building stands there' };
  if (farm.coins < SPRINKLER_COST.coins) return { ok: false, reason: 'needs ' + SPRINKLER_COST.coins + '◈' };
  if ((farm.metals.tin | 0) < SPRINKLER_COST.tin) return { ok: false, reason: 'needs ' + SPRINKLER_COST.tin + ' tin from the mine' };
  next.coins -= SPRINKLER_COST.coins;
  next.metals.tin -= SPRINKLER_COST.tin; if (!next.metals.tin) delete next.metals.tin;
  next.fixtures.push({ id: 'f' + now.toString(36) + '-' + next.fixtures.length, kind: 'sprinkler', tx, ty });
  next.updatedAt = now;
  return { ok: true, farm: next, removed: false };
}

// ── the trade desk (gacha) — deterministic: (seed, biomeId, pullIndex) re-rolls identically.
// Pulls come from the ACTIVE unlocked pack; the per-pull rng keys on the biome id, so switching
// pools never disturbs another pool's determinism. ──
export function pullSeeds(farm, ark, now) {
  const activeId = farm.activeBiome || farm.biomeId;
  if (farm.packs && !farm.packs.includes(activeId)) return { ok: false, reason: 'that pack is not unlocked' };
  const biome = biomeById(ark, activeId) || biomeForKey(ark, String(farm.seed));
  if (!biome) return { ok: false, reason: 'no biome' };
  const cost = farm.pulls === 0 ? 0 : PULL_COST;
  if (farm.coins < cost) return { ok: false, reason: 'need ' + cost + ' coins for a pull' };
  const rng = pullRng(farm.seed, biome.id, farm.pulls);
  const res = gachaPull(biome, farm.owned, rng);
  if (!res) return { ok: false, reason: 'empty pool' };
  const next = clone(farm);
  next.coins -= cost; next.pulls++;
  next.seeds[res.crop.id] = (next.seeds[res.crop.id] || 0) + res.seeds;
  if (!next.owned.includes(res.crop.id)) next.owned.push(res.crop.id);
  next.updatedAt = now;
  const prog = progress(biome, next.owned);
  return { ok: true, farm: next, crop: res.crop, isNew: res.isNew, seeds: res.seeds, cost, progress: prog };
}

// ── gifts in ("claim") — fold a friend's gift record into the save, once. `uri` is the at:// uri of
// the gift record in the FRIEND's repo; claimedGifts is the dedupe ledger. ──
export function claimGift(farm, uri, item, now) {
  if (farm.claimedGifts.includes(uri)) return { ok: false, reason: 'already claimed' };
  const next = clone(farm);
  if (item.kind === 'seed' && item.id) next.seeds[item.id] = (next.seeds[item.id] || 0) + Math.max(1, item.qty | 0);
  else if (item.kind === 'coins') next.coins += Math.max(1, Math.min(50, item.qty | 0));
  else return { ok: false, reason: 'unknown gift kind' };
  if (item.kind === 'seed' && !next.owned.includes(item.id)) next.owned.push(item.id);
  next.claimedGifts.push(uri);
  if (next.claimedGifts.length > 500) next.claimedGifts = next.claimedGifts.slice(-500);
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// gifts out — the state half only (seed leaves the bag); the record write is store.js's job.
export function giveSeed(farm, cropId, qty, now) {
  qty = Math.max(1, qty | 0);
  if ((farm.seeds[cropId] | 0) < qty) return { ok: false, reason: 'not enough seed to give' };
  const next = clone(farm);
  next.seeds[cropId] -= qty; if (!next.seeds[cropId]) delete next.seeds[cropId];
  next.stats.giftsSent++;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// ── the bench: brew pantry crops into a preparation (vendor/alchemy.js does the correspondence
// math; this applies inventory, the vessel's metal tax, and the shard steady). ──
export function applyBrew(farm, prepared, cropIds, prepKey, useShard, now) {
  if (!prepared || !prepared.ok) return { ok: false, reason: (prepared && prepared.reason) || 'nothing brewed' };
  const metal = PREP_METAL[prepKey];
  if (metal && !(farm.metals[metal] | 0)) return { ok: false, reason: 'a ' + prepKey + ' needs 1 ' + metal + ' from the mine' };
  if (useShard && !(farm.shards | 0)) return { ok: false, reason: 'no quintessence shard' };
  const counts = {};
  for (const id of cropIds) counts[id] = (counts[id] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) if ((farm.pantry[id] | 0) < n) return { ok: false, reason: 'pantry is short of ' + id };
  const next = clone(farm);
  for (const [id, n] of Object.entries(counts)) { next.pantry[id] -= n; if (!next.pantry[id]) delete next.pantry[id]; }
  if (metal) { next.metals[metal]--; if (!next.metals[metal]) delete next.metals[metal]; }
  // a quintessence shard STEADIES the brew: +0.15 coherence, re-graded (a muddled mash becomes serviceable)
  let coh = prepared.coherence, grade = prepared.grade, label = prepared.label;
  if (useShard) {
    next.shards--;
    coh = Math.min(1, +(coh + 0.15).toFixed(4));
    const g = gradeOf(coh); grade = g.grade; label = g.label + ' (steadied)';
  }
  const item = {
    id: 'b' + now.toString(36) + '-' + next.stats.brews,
    vessel: prepared.vessel, grade, label,
    coherence: coh, potency: prepared.potency, glyphs: prepared.glyphs,
    reagents: prepared.reagents.map((r) => r.plant), use: prepared.mechanics.use, at: now,
  };
  next.preparations.push(item);
  if (next.preparations.length > 60) next.preparations = next.preparations.slice(-60);
  next.stats.brews++;
  const order = 'FDCBAS';
  if (!next.stats.bestGrade || order.indexOf(grade) > order.indexOf(next.stats.bestGrade)) next.stats.bestGrade = grade;
  next.updatedAt = now;
  return { ok: true, farm: next, item };
}

// drink/apply a preparation → a farm utility per dominant humour (the Galenic square, read as farming):
//   cooling  (Water, heal)   → dew: banks growth-time onto every growing plant
//   rousing  (Air, buff)     → vigor: the next N harvests yield +1
//   caustic  (Fire, attack)  → blasting draught: bombs for the mine (each = +4 picks next run)
//   sedate   (Earth, debuff) → market ward: sell prices +25% for `turns` hours
//   oil      (metal)         → tempered picks: +1 permanent mine pick (cap +3)
export function usePreparation(farm, itemId, now) {
  const idx = farm.preparations.findIndex((p) => p.id === itemId);
  if (idx < 0) return { ok: false, reason: 'no such preparation' };
  const item = farm.preparations[idx], use = item.use || {};
  const next = clone(farm);
  next.preparations.splice(idx, 1);
  let effect = 'nothing stirred';
  if (use.lubricant) {
    if ((next.mine.picksBonus | 0) >= 3) { effect = 'the picks are already tempered to their limit'; }
    else { next.mine.picksBonus = (next.mine.picksBonus | 0) + 1; effect = 'picks tempered: +1 pick every run'; }
  } else if (use.combat && use.combat.kind === 'heal') {
    const ms = Math.round((use.combat.amount || 1) * 0.15 * DAY_MS);
    for (const p of next.bed.plants) p.grownMs = (p.grownMs || 0) + ms;
    effect = 'dew settles: every plant gains ' + Math.round(ms / 60000) + ' minutes of growth';
  } else if (use.combat && use.combat.kind === 'buff') {
    const n = Math.max(1, use.combat.amount | 0);
    next.effects.yieldBoost = (next.effects.yieldBoost | 0) + n;
    effect = 'vigor: the next ' + n + ' harvest(s) yield +1';
  } else if (use.combat && use.combat.kind === 'attack') {
    const n = Math.max(1, Math.round((use.combat.damage || 1) / 3));
    next.mine.bombs = (next.mine.bombs | 0) + n;
    effect = 'blasting draught: +' + n + ' bomb(s) for the mine';
  } else if (use.combat && use.combat.kind === 'debuff') {
    const hrs = Math.max(1, use.combat.turns | 0);
    next.effects.wardUntil = Math.max(next.effects.wardUntil || 0, now) + hrs * 3600 * 1000;
    effect = 'market ward: sell prices +25% for ' + hrs + 'h';
  }
  next.updatedAt = now;
  return { ok: true, farm: next, effect };
}

// ── CRAFT MODE: terraforming + rearranging ────────────────────────────────────────────────────────
// terraform(farm, tx, ty, tool) — tool ∈ till|pond|path|clear|meadow. Rules:
//   till    meadow/path → soil        (this is how the farm GROWS beyond the starting field)
//   pond    soil/meadow/path → pond   (water: adjacent plants grow POND_CUT faster)
//   path    soil/meadow/pond → path   (rearrange the walkways; draining a pond costs its price)
//   clear   stone → soil              (roll the boulder away)
//   meadow  soil/path/pond → meadow   (give a tile back to the grass)
// Never under a plant or a building; always inside the world; each tile-write costs TERRA_COST.
const TERRA_OK = {
  till:    { from: ['meadow', 'path', 'road'], to: 'soil' },
  pond:    { from: ['soil', 'meadow', 'path', 'road'], to: 'pond' },
  path:    { from: ['soil', 'meadow', 'pond', 'road'], to: 'path' },
  clear:   { from: ['stone'], to: 'soil' },
  flatten: { from: ['hill'], to: 'meadow' },   // the expensive one — hills are why the parcel was cheap
  meadow:  { from: ['soil', 'path', 'pond', 'road'], to: 'meadow' },
};
export function terraform(farm, tx, ty, tool, now) {
  const rule = TERRA_OK[tool];
  if (!rule) return { ok: false, reason: 'unknown tool' };
  if (!inWorld(tx, ty)) return { ok: false, reason: 'beyond the world’s edge' };
  if (!ownsTile(farm, tx, ty)) return { ok: false, reason: 'not your land — buy the parcel first' };
  const cur = tileAt(farm, tx, ty);
  if (!rule.from.includes(cur)) return { ok: false, reason: 'cannot ' + tool + ' ' + cur };
  if (plantOnTile(farm, tx, ty)) return { ok: false, reason: 'a plant is rooted there — harvest it first' };
  if (buildingAt(farm, tx, ty)) return { ok: false, reason: 'a building stands there — move it first' };
  const cost = TERRA_COST[tool] | 0;
  if (farm.coins < cost) return { ok: false, reason: 'needs ' + cost + '◈' };
  const next = clone(farm);
  next.coins -= cost;
  const key = tx + ',' + ty;
  if (baseTile(next.bed.seed, tx, ty) === rule.to) delete next.terra[key];   // back to baseline → drop the override
  else next.terra[key] = rule.to;
  next.stats.terraforms = (next.stats.terraforms | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next, cost, to: rule.to };
}

// pick a station up and set it down somewhere sensible (not water, not on a plant/another building).
export function moveBuilding(farm, id, tx, ty, now) {
  const idx = (farm.buildings || []).findIndex((b) => b.id === id);
  if (idx < 0) return { ok: false, reason: 'no such building' };
  if (!inWorld(tx, ty)) return { ok: false, reason: 'beyond the world’s edge' };
  if (!ownsTile(farm, tx, ty)) return { ok: false, reason: 'not your land — buy the parcel first' };
  const t = tileAt(farm, tx, ty);
  if (t === 'pond') return { ok: false, reason: 'it would sink' };
  if (t === 'hill') return { ok: false, reason: 'flatten the hill first' };
  if (plantOnTile(farm, tx, ty)) return { ok: false, reason: 'a plant is rooted there' };
  const other = buildingAt(farm, tx, ty);
  if (other && other.id !== id) return { ok: false, reason: other.id + ' already stands there' };
  const next = clone(farm);
  next.buildings[idx].tx = tx; next.buildings[idx].ty = ty;
  next.stats.movedBuildings = (next.stats.movedBuildings | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// buy the neighbouring plot (the CS rule: adjacent to owned land, price scales with purchases + ring)
export function buyParcel(farm, px, py, now) {
  if (!inGrid(px, py)) return { ok: false, reason: 'beyond the survey maps' };
  if (ownsParcel(farm, px, py)) return { ok: false, reason: 'already yours' };
  const offer = buyableParcels(farm).find((b) => b.px === px && b.py === py);
  if (!offer) return { ok: false, reason: 'not adjacent to your land — the estate grows outward' };
  if (farm.coins < offer.price) return { ok: false, reason: 'the deed costs ' + offer.price + '◈' };
  const next = clone(farm);
  next.coins -= offer.price;
  next.parcels.push(parcelKey(px, py));
  next.updatedAt = now;
  return { ok: true, farm: next, price: offer.price, terrain: parcelTerrain(farm.seed, px, py).archetype };
}

// ── ECOSYSTEM PACKS ───────────────────────────────────────────────────────────────────────────────
// packList(farm, ark) → every biome in unlock order (home first, rest in ark order), each with its
// requirement row evaluated against the save — the desk renders this verbatim, so the path to the
// next pack is always visible.
export function biomesClosedCount(farm, ark) {
  return (farm.packs || []).filter((id) => { const b = biomeById(ark, id); return b && progress(b, farm.owned).complete; }).length;
}
export function packList(farm, ark) {
  const home = farm.biomeId;
  const rest = (ark.biomes || []).filter((b) => b.id !== home).map((b) => b.id);
  const order = [home, ...rest];
  const unlocked = new Set(farm.packs || [home]);
  let nextLockedSeen = false;
  return order.map((id, i) => {
    const biome = biomeById(ark, id);
    if (unlocked.has(id)) return { id, biome, unlocked: true, active: (farm.activeBiome || home) === id };
    const req = PACK_REQS[Math.min(unlocked.size - 1, PACK_REQS.length - 1)];
    const closed = biomesClosedCount(farm, ark);
    const checks = [
      { label: req.coins + '◈', met: farm.coins >= req.coins },
      { label: req.harvests + ' harvests', met: farm.stats.harvests >= req.harvests },
    ];
    if (req.depth) checks.push({ label: 'mine depth ' + req.depth, met: farm.mine.depth >= req.depth });
    if (req.brews) checks.push({ label: req.brews + ' brews', met: farm.stats.brews >= req.brews });
    if (req.biomesClosed) checks.push({ label: req.biomesClosed + ' biome(s) closed', met: closed >= req.biomesClosed });
    const isNext = !nextLockedSeen; nextLockedSeen = true;
    return { id, biome, unlocked: false, isNext, req, checks, canUnlock: isNext && checks.every((c) => c.met) };
  });
}
export function unlockPack(farm, biomeId, ark, now) {
  const list = packList(farm, ark);
  const entry = list.find((p) => p.id === biomeId);
  if (!entry) return { ok: false, reason: 'no such biome' };
  if (entry.unlocked) return { ok: false, reason: 'already unlocked' };
  if (!entry.isNext) return { ok: false, reason: 'packs unlock in order — the next one is ' + (list.find((p) => p.isNext) || {}).id };
  if (!entry.canUnlock) return { ok: false, reason: 'requirements not met: ' + entry.checks.filter((c) => !c.met).map((c) => c.label).join(', ') };
  const next = clone(farm);
  next.coins -= entry.req.coins;
  next.packs.push(biomeId);
  next.activeBiome = biomeId;   // switch the desk to the new lands — the moment should feel like arrival
  next.updatedAt = now;
  return { ok: true, farm: next, biome: entry.biome };
}
export function setActiveBiome(farm, biomeId, now) {
  if (!(farm.packs || []).includes(biomeId)) return { ok: false, reason: 'not unlocked' };
  const next = clone(farm);
  next.activeBiome = biomeId;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// ── the pacing loop: streaks + post-to-progress ───────────────────────────────────────────────────
// Social-media pacing without the dark half: both bonuses are small, deterministic, and recorded in
// the save so any viewer can audit them like everything else.

export const STREAK_DEW_MIN = 5;     // minutes of dew per streak day, per plant…
export const STREAK_CAP = 7;         // …capped at a week (35 min — a nudge, not an engine)
export const SHARE_COINS = 25;       // the town-crier bonus: first share of EACH deed pays once

const utcDay = (now) => new Date(now).toISOString().slice(0, 10);

// touchStreak — call once at boot. First visit of a UTC day extends (or restarts) the streak and
// settles dew on every growing plant, scaled by the run. Same-day repeats are no-ops.
export function touchStreak(farm, now) {
  const today = utcDay(now);
  const s = farm.streak || { day: null, run: 0 };
  if (s.day === today) return { ok: false, reason: 'already visited today', streak: s.run };
  const next = clone(farm);
  const yesterday = utcDay(now - 86400000);
  const run = s.day === yesterday ? (s.run | 0) + 1 : 1;
  next.streak = { day: today, run };
  const dewMs = Math.min(STREAK_CAP, run) * STREAK_DEW_MIN * 60000;
  for (const p of next.bed.plants) p.grownMs = (p.grownMs || 0) + dewMs;
  next.updatedAt = now;
  return { ok: true, farm: next, streak: run, dewMin: dewMs / 60000, plants: next.bed.plants.length };
}

// recordShare — the play-and-post-to-progress hook: posting a deed to Bluesky pays SHARE_COINS,
// once per deed ever (the ledger is the save's sharedDeeds list).
export function recordShare(farm, achId, now) {
  const done = farm.sharedDeeds || [];
  if (done.includes(achId)) return { ok: false, reason: 'already paid for this deed' };
  const next = clone(farm);
  next.sharedDeeds = [...done, achId];
  next.coins += SHARE_COINS;
  next.updatedAt = now;
  return { ok: true, farm: next, coins: SHARE_COINS };
}

// ── record shape: the whole farm IS one com.minomobi.farm.plot record (rkey `self`). ──
export function toPlotRecord(farm, now) {
  return { $type: 'com.minomobi.farm.plot', v: 1, farm, updatedAt: new Date(now).toISOString() };
}
export function fromPlotRecord(value) {
  const f = value && value.farm;
  if (!f || f.v < 1 || f.v > 4) return null;
  if (f.v === 1) {   // v1 → v2: the map-first fields, all additive, defaults deterministic
    f.v = 2;
    f.terra = f.terra || {};
    f.buildings = f.buildings || defaultBuildings(f.seed);
    f.packs = f.packs || (f.biomeId ? [f.biomeId] : []);
    f.activeBiome = f.activeBiome || f.biomeId;
    f.stats.terraforms = f.stats.terraforms | 0;
    f.stats.movedBuildings = f.stats.movedBuildings | 0;
  }
  if (f.v === 2) {   // v2 → v3: the parcel world. v2's free 24×24 apron becomes owned-land-only.
    f.v = 3;
    f.parcels = f.parcels || ['0,0'];
    // buildings used to default to the meadow ring OUTSIDE the home parcel — pull any stranded
    // station back onto owned land (same deterministic placement a fresh farm gets).
    const fresh = defaultBuildings(f.seed);
    f.buildings = (f.buildings || fresh).map((b) => ownsTile(f, b.tx, b.ty) ? b : (fresh.find((d) => d.id === b.id) || b));
    // terraform overrides on land the player no longer owns: refund and drop (v2 shipped for a day;
    // the till price comes back so nobody is out of pocket).
    for (const key of Object.keys(f.terra || {})) {
      const [tx, ty] = key.split(',').map(Number);
      if (!ownsTile(f, tx, ty)) { delete f.terra[key]; f.coins += TERRA_COST.till; }
    }
    // plants rooted beyond owned land go back into the seed bag, one seed each
    const keep = [];
    for (const p of f.bed.plants) {
      if (ownsTile(f, Math.floor(p.x * FIELD_T), Math.floor(p.y * FIELD_T))) keep.push(p);
      else f.seeds[p.seedId] = (f.seeds[p.seedId] || 0) + 1;
    }
    f.bed.plants = keep;
  }
  if (f.v === 3) {   // v3 → v4: irrigation + the organic economy
    f.v = 4;
    f.pantryC = f.pantryC || {};                       // pre-v4 produce is grandfathered organic
    f.supplies = f.supplies || { fert: 0, pest: 0 };
    f.tech = f.tech || {};
    f.fixtures = f.fixtures || [];
    f.stats.organicHarvests = f.stats.organicHarvests | 0;
    f.stats.pestsTreated = f.stats.pestsTreated | 0;
    // the sixth station (waterworks) — slot it in if this save predates it
    if (!(f.buildings || []).some((b) => b.id === 'mill')) {
      const mill = defaultBuildings(f.seed).find((b) => b.id === 'mill');
      if (mill && !buildingAt(f, mill.tx, mill.ty)) f.buildings.push(mill);
      else if (mill) { mill.tx = (mill.tx + 1) % FIELD_T; f.buildings.push(mill); }
    }
    // plants move to the settle model: old growth (fully-watered semantics) banks into grownMs as
    // of updatedAt; everyone starts freshly watered so nobody wakes up to a dried-out field.
    const ref = f.updatedAt || 0;
    for (const p of f.bed.plants) {
      p.grownMs = Math.max(0, ref - p.at) * (p.spd || 1) + (p.boost || 0);
      delete p.boost;
      p.calcAt = ref;
      p.wateredAt = ref;
      p.fertN = 0; p.syn = false; p.pestOkW = pestWindow(p, ref);   // no retroactive infestations either
    }
  }
  return f;
}

export { bedKeepouts, plantNear, MIN_SPACING, PULL_COST };
