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
  // ANNEALED (sim round 5): n^1.4 instead of n — first deeds stay day-2 cheap (250, 660…) while the
  // outer ring becomes the long game instead of week-two pocket change.
  return Math.round(250 * Math.pow(n, 1.4) * ring / 10) * 10;
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

// ── WATER STAKES (2026-08-13, oracle-gated): the can alone is not a farm. A plant wants a water
// SOURCE — pond, sprinkler, or the deep well — within WATER_RANGE tiles. Beyond that it lives on
// LIFE SUPPORT: hand-watering keeps it going, but let PARCH_MS pass without the can and it dies
// (unrecoverable — clearPlant, no seed back). Planting far is allowed with a warning; the stakes
// are for infrastructure you tore out and fields you stopped visiting. Wetland crops (THIRSTY)
// are stricter and non-negotiable: they only take root within their own tighter radius — the
// idiosyncratic rules that make the roster spatial instead of a spreadsheet.
export const WATER_RANGE = 4;   // annealed: 3 starved week-one throughput before the first pond
export const PARCH_MS = 48 * 3600 * 1000;
export const THIRSTY = { papyrus: 1, rice: 1, lotus: 1, cress: 1, herb_cress: 1 };

export function waterSourceWithin(farm, tx, ty, r) {
  if (hasTech(farm, 'deepwell')) return true;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (inWorld(tx + dx, ty + dy) && tileAt(farm, tx + dx, ty + dy) === 'pond') return true;
  }
  for (const f of farm.fixtures || []) {
    if (Math.max(Math.abs(f.tx - tx), Math.abs(f.ty - ty)) <= r) return true;
  }
  return false;
}
export const thirstOf = (crop) => (crop && THIRSTY[crop.id] != null ? THIRSTY[crop.id] : WATER_RANGE);
export const plantNearWater = (farm, plant) =>
  waterSourceWithin(farm, Math.floor(plant.x * FIELD_T), Math.floor(plant.y * FIELD_T), plant.wr != null ? plant.wr : WATER_RANGE);
export const plantDead = (farm, plant, now) => !plantNearWater(farm, plant) && now > (plant.wateredAt || plant.at || 0) + PARCH_MS;

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

// ── LIVESTOCK ─────────────────────────────────────────────────────────────────────────────────────
// Animals are the farm's heartbeat: they wander the map, want feeding (a PANTRY SINK — produce
// finally has somewhere to go besides the market), drop goods on timers (a reason to come back),
// and can be petted once a day (a free action that doubles the next collect — petting matters).
// Goods inherit the FEED's grade: an organically-fed hen lays organic eggs (premium + honest).
// ANNEALED (sim rounds 4-5): at egg/4h·8◈ a hen repaid in a day and the oracle's player ran 28
// animals and 14 parcels by day 21 — the flood after the famine. These rates aim a hen's repay at
// ~4 days, a herd at "pleasant income", not a printer.
// ANNEALED (diversity, 2026-08-13): coins alone couldn't pace the roster — a novelty-seeking
// player bought all five kinds inside week 1. needsGoods gates the bigger animals on goods
// COLLECTED, which accrues in real time whatever your wallet does: the barn earns its reputation.
export const ANIMALS = {
  hen:   { emoji: '🐔', name: 'hen',      cost: 80,  good: 'egg',   goodEmoji: '🥚', everyMs: 6 * 3600 * 1000,  feedUnits: 1, price: 5 },
  duck:  { emoji: '🦆', name: 'duck',     cost: 120, good: 'egg',   goodEmoji: '🥚', everyMs: 5 * 3600 * 1000,  feedUnits: 1, price: 5,  needsPond: true },
  goat:  { emoji: '🐐', name: 'goat',     cost: 200, good: 'milk',  goodEmoji: '🥛', everyMs: 10 * 3600 * 1000, feedUnits: 2, price: 14, needsGoods: 20 },
  sheep: { emoji: '🐑', name: 'sheep',    cost: 300, good: 'wool',  goodEmoji: '🧶', everyMs: 16 * 3600 * 1000, feedUnits: 2, price: 28, needsGoods: 60 },
  bees:  { emoji: '🐝', name: 'bee hive', cost: 400, good: 'honey', goodEmoji: '🍯', everyMs: 22 * 3600 * 1000, feedUnits: 0, price: 45, needsPlants: 6, needsGoods: 140 },
};
export const FED_MS = 24 * 3600 * 1000;           // one feeding holds a day
export const animalCap = (farm) => 2 * (farm.parcels || ['0,0']).length;   // land carries the herd

export function buyAnimal(farm, kind, now) {
  const def = ANIMALS[kind];
  if (!def) return { ok: false, reason: 'no such animal' };
  if ((farm.animals || []).length >= animalCap(farm)) return { ok: false, reason: 'the land carries ' + animalCap(farm) + ' animals — buy a parcel for more' };
  if (farm.coins < def.cost) return { ok: false, reason: 'costs ' + def.cost + '◈' };
  if (def.needsGoods && (farm.stats.goodsCollected | 0) < def.needsGoods) {
    return { ok: false, reason: 'a ' + def.name + ' joins a barn that has collected ' + def.needsGoods + ' goods (you: ' + (farm.stats.goodsCollected | 0) + ')' };
  }
  if (def.needsPond) {
    let has = false;
    for (const key of farm.parcels) {
      const [px, py] = key.split(',').map(Number);
      for (let ty = 0; ty < FIELD_T && !has; ty++) for (let tx = 0; tx < FIELD_T && !has; tx++) {
        if (tileAt(farm, px * FIELD_T + tx, py * FIELD_T + ty) === 'pond') has = true;
      }
      if (has) break;
    }
    if (!has) return { ok: false, reason: 'a duck needs water on your land — dig a pond' };
  }
  const next = clone(farm);
  next.coins -= def.cost;
  next.animals = next.animals || [];
  next.animals.push({ id: 'a' + now.toString(36) + '-' + next.animals.length, kind, at: now, fedUntil: now + FED_MS, lastCollect: now, lastPet: 0 });
  next.stats.animalsBought = (next.stats.animalsBought | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next, def };
}

export const animalById = (farm, id) => (farm.animals || []).find((a) => a.id === id) || null;
export const animalFed = (a, now) => now < (a.fedUntil || 0);
export const animalHungry = (farm, id, now) => { const a = animalById(farm, id); return !!a && !animalFed(a, now) && ANIMALS[a.kind].feedUnits > 0; };
// bees feed themselves when the farm blooms
export function animalProducing(farm, a, now) {
  const def = ANIMALS[a.kind];
  if (def.needsPlants != null) return farm.bed.plants.length >= def.needsPlants;
  return animalFed(a, now);
}

// feed from either pantry; the animal REMEMBERS the grade — goods inherit it at collect time.
export function feedAnimal(farm, id, cropId, now) {
  const a = animalById(farm, id);
  if (!a) return { ok: false, reason: 'no such animal' };
  const def = ANIMALS[a.kind];
  if (def.feedUnits === 0) return { ok: false, reason: 'the hive feeds itself — keep things blooming' };
  if (animalFed(a, now)) return { ok: false, reason: 'already fed today' };
  const org = (farm.pantry[cropId] | 0), conv = ((farm.pantryC || {})[cropId] | 0);
  const useOrg = org >= def.feedUnits;
  if (!useOrg && conv < def.feedUnits) return { ok: false, reason: 'needs ' + def.feedUnits + ' produce of one crop' };
  const next = clone(farm);
  const na = animalById(next, id);
  const pool = useOrg ? next.pantry : next.pantryC;
  pool[cropId] -= def.feedUnits; if (!pool[cropId]) delete pool[cropId];
  na.fedUntil = now + FED_MS;
  na.feedGrade = useOrg ? 'organic' : 'conv';
  next.updatedAt = now;
  return { ok: true, farm: next, organic: useOrg };
}

// pet once a day: pure delight with teeth — the NEXT collect from this animal yields double.
export function petAnimal(farm, id, now) {
  const a = animalById(farm, id);
  if (!a) return { ok: false, reason: 'no such animal' };
  const day = Math.floor(now / 86400000);
  if (Math.floor((a.lastPet || 0) / 86400000) === day) return { ok: false, reason: 'already had its scratches today' };
  const next = clone(farm);
  animalById(next, id).lastPet = now;
  next.stats.pets = (next.stats.pets | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next, def: ANIMALS[a.kind] };
}

export function collectAnimal(farm, id, now) {
  const a = animalById(farm, id);
  if (!a) return { ok: false, reason: 'no such animal' };
  const def = ANIMALS[a.kind];
  if (!animalProducing(farm, a, now)) return { ok: false, reason: def.feedUnits ? 'hungry — nothing to give' : 'the hive wants ' + def.needsPlants + ' growing plants' };
  if (now - (a.lastCollect || a.at) < def.everyMs) return { ok: false, reason: 'not ready yet' };
  const next = clone(farm);
  const na = animalById(next, id);
  const petted = (na.lastPet || 0) > (na.lastCollect || na.at);
  const qty = petted ? 2 : 1;
  const grade = def.feedUnits === 0 ? 'organic' : (na.feedGrade || 'organic');   // bees are always organic
  const pool = grade === 'organic' ? (next.goods = next.goods || {}) : (next.goodsC = next.goodsC || {});
  pool[def.good] = (pool[def.good] || 0) + qty;
  na.lastCollect = now;
  next.stats.goodsCollected = (next.stats.goodsCollected | 0) + qty;
  next.updatedAt = now;
  return { ok: true, farm: next, good: def.good, qty, organic: grade === 'organic', petted };
}

export const GOOD_EMOJI = { egg: '🥚', milk: '🥛', wool: '🧶', honey: '🍯' };
export function sellGood(farm, good, qty, now, grade = 'organic') {
  const def = Object.values(ANIMALS).find((d) => d.good === good);
  if (!def) return { ok: false, reason: 'no such good' };
  const poolKey = grade === 'conv' ? 'goodsC' : 'goods';
  const have = ((farm[poolKey] || {})[good] | 0);
  qty = Math.max(0, Math.min(have, qty | 0));
  if (!qty) return { ok: false, reason: 'nothing to sell' };
  const ward = now < (farm.effects.wardUntil || 0) ? 1.25 : 1;
  const unit = grade === 'conv' ? def.price : Math.round(def.price * ORGANIC_PREMIUM);
  const coins = Math.round(unit * qty * ward);
  const next = clone(farm);
  next[poolKey][good] -= qty; if (!next[poolKey][good]) delete next[poolKey][good];
  next.coins += coins;
  next.updatedAt = now;
  return { ok: true, farm: next, coins, organic: grade !== 'conv' };
}

// where an animal stands right now: a slow deterministic wander over the owned parcels (no stored
// position, no pathfinding — a lissajous stroll seeded by the animal id, avoiding nothing; they are
// scenery with a hitbox). Returns bed-normalized coords like plants.
export function animalPos(farm, a, now) {
  let h = 2166136261; for (const ch of a.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const ph = (h >>> 0) / 4294967296 * Math.PI * 2;
  const keys = farm.parcels || ['0,0'];
  const [px, py] = keys[(h >>> 0) % keys.length].split(',').map(Number);   // each animal haunts one parcel
  const t = now / 90000;   // one slow loop every few minutes
  const cx = px * FIELD_T + FIELD_T / 2 + Math.sin(t * 0.7 + ph) * (FIELD_T / 2 - 2);
  const cy = py * FIELD_T + FIELD_T / 2 + Math.sin(t * 0.53 + ph * 2.3) * (FIELD_T / 2 - 2);
  return { x: cx / FIELD_T, y: cy / FIELD_T };
}

// ── FORAGE — the arrival scavenger hunt ───────────────────────────────────────────────────────────
// Every FORAGE_WINDOW, sparkles respawn at seeded spots across OWNED land. Tap to gather a little
// something. It exists so that ARRIVING is always an act of looking at your farm — the sparkle
// leads the eye across the estate you built. Deterministic per (seed, window); the collected
// ledger keeps only the current window.
export const FORAGE_WINDOW_MS = 4 * 3600 * 1000;
export const forageWindow = (now) => Math.floor(now / FORAGE_WINDOW_MS);
export function forageSpots(farm, now) {
  const w = forageWindow(now);
  const keys = farm.parcels || ['0,0'];
  const nSpots = 2 + keys.length;                        // more land, more to find
  const taken = new Set(((farm.forage || {}).w === w ? farm.forage.got : []) || []);
  const out = [];
  for (let i = 0; i < nSpots; i++) {
    if (taken.has(i)) continue;
    let h = (farm.seed >>> 0) ^ 0xf04a9e5;
    for (const ch of 'forage:' + w + ':' + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    h >>>= 0;
    const key = keys[h % keys.length];
    const [px, py] = key.split(',').map(Number);
    let tx = px * FIELD_T + ((h >> 8) % FIELD_T), ty = py * FIELD_T + ((h >> 16) % FIELD_T);
    // roadside gleaning: half the sparkles wash up along this parcel's paths and roads, if it
    // has any — the walked edges of the farm are where things get dropped.
    if ((h >>> 2) & 1) {
      const edges = [];
      for (let yy = 0; yy < FIELD_T; yy++) for (let xx = 0; xx < FIELD_T; xx++) {
        const t = tileAt(farm, px * FIELD_T + xx, py * FIELD_T + yy);
        if (t === 'path' || t === 'road') edges.push([px * FIELD_T + xx, py * FIELD_T + yy]);
      }
      if (edges.length) { const e = edges[(h >>> 10) % edges.length]; tx = e[0]; ty = e[1]; }
    }
    if (tileAt(farm, tx, ty) === 'pond' || tileAt(farm, tx, ty) === 'hill') continue;   // sparkles keep their feet dry
    const roll = (h >> 4) % 100;
    const prize = roll < 55 ? { kind: 'coins', qty: 4 + (h % 9) } : roll < 90 ? { kind: 'seed' } : { kind: 'shard' };
    out.push({ i, tx, ty, prize });
  }
  return out;
}
export function forage(farm, i, now) {
  const spot = forageSpots(farm, now).find((s) => s.i === i);
  if (!spot) return { ok: false, reason: 'nothing there' };
  const next = clone(farm);
  const w = forageWindow(now);
  if (!next.forage || next.forage.w !== w) next.forage = { w, got: [] };
  next.forage.got.push(i);
  let prize = spot.prize;
  if (prize.kind === 'coins') next.coins += prize.qty;
  else if (prize.kind === 'shard') next.shards = (next.shards | 0) + 1;
  else {
    // a wildseed from any unlocked pack (seeded pick, deterministic)
    let h = (farm.seed >>> 0) ^ forageWindow(now) ^ (i * 2654435761);
    const pool = (farm.packs || [farm.biomeId]);
    prize = { kind: 'seed', biome: pool[(h >>> 0) % pool.length] };
    next._forageSeedBiome = prize.biome;   // resolved to a crop by the caller with the ark (kernel stays ark-free here)
  }
  next.stats.foraged = (next.stats.foraged | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next, prize };
}
// the ark-aware half: give the wildseed a species (call right after forage() when prize.kind==='seed')
export function grantWildseed(farm, ark, now) {
  const biomeId = farm._forageSeedBiome;
  const next = clone(farm);
  delete next._forageSeedBiome;
  const biome = biomeById(ark, biomeId) || biomeById(ark, farm.biomeId);
  if (!biome || !biome.crops.length) return { ok: true, farm: next, crop: null };
  let h = (farm.seed >>> 0) ^ (farm.stats.foraged | 0) * 40503;
  const crop = biome.crops[(h >>> 0) % biome.crops.length];
  next.seeds[crop.id] = (next.seeds[crop.id] || 0) + 1;
  if (!next.owned.includes(crop.id)) next.owned.push(crop.id);
  next.updatedAt = now;
  return { ok: true, farm: next, crop };
}

// ── THE WATERWORKS TECH TREE ──────────────────────────────────────────────────────────────────────
// Researched at the windmill; each rung eases irrigation at scale or deepens the organic game.
// Costs spend coins AND planetary metals (the mine feeds the tree); `req` gates order; `needs` are
// non-spent prerequisites shown live like the pack ladder.
// ── THE FORGE — the metals vertical ──────────────────────────────────────────────────────────────
// Until now the mine's seven metals were only ever an ingredient tax (vessels, techs, sprinklers).
// The forge is the thing to do with ONLY metals: the first station you BUILD rather than inherit
// (depth 5 + iron + copper — you've seen where metal sleeps), a timed crucible that turns ore pairs
// into alloys (check-in pacing: pour, come back), and — the depth layer — planetary CHARMS. Every
// ark crop already carries its Chaldean planet; a charm forged from a planet's own metal makes
// crops SOWN under it grow faster and their produce sell dearer while it is worn. One charm active
// at a time, swapped freely at the anvil: the optimal crop rotates with the charm, which is exactly
// the situational trade-off the flat roster lacked. None of this is required play — the surface
// game never mentions correspondences; the forge is where they become visible.
export const FORGE_REQ = { depth: 5, coins: 120, iron: 2, copper: 2 };
export const ALLOYS = {
  bronze:   { emoji: '🥉', name: 'bronze',   needs: { copper: 1, tin: 1 },         ms: 3 * 3600 * 1000,  sell: 26 },
  pewter:   { emoji: '🍶', name: 'pewter',   needs: { tin: 1, lead: 1 },           ms: 3 * 3600 * 1000,  sell: 22 },
  steel:    { emoji: '🗡️', name: 'steel',    needs: { iron: 2 },                   ms: 5 * 3600 * 1000,  sell: 34 },
  amalgam:  { emoji: '🌡️', name: 'amalgam',  needs: { quicksilver: 1, tin: 1 },    ms: 6 * 3600 * 1000,  sell: 48 },
  sterling: { emoji: '🥈', name: 'sterling', needs: { silver: 2, copper: 1 },      ms: 8 * 3600 * 1000,  sell: 60 },
  electrum: { emoji: '🥇', name: 'electrum', needs: { gold: 1, silver: 1 },        ms: 12 * 3600 * 1000, sell: 110 },
};
// the Chaldean week, walked at the anvil: each planet's charm wants its OWN metal plus an alloy.
export const CHARM_DEFS = {
  Sun:     { glyph: '☉', metal: 'gold',        alloy: 'electrum' },
  Moon:    { glyph: '☽', metal: 'silver',      alloy: 'sterling' },
  Mercury: { glyph: '☿', metal: 'quicksilver', alloy: 'amalgam' },
  Venus:   { glyph: '♀', metal: 'copper',      alloy: 'bronze' },
  Mars:    { glyph: '♂', metal: 'iron',        alloy: 'steel' },
  Jupiter: { glyph: '♃', metal: 'tin',         alloy: 'bronze' },
  Saturn:  { glyph: '♄', metal: 'lead',        alloy: 'pewter' },
};
export const CHARM_COST = { coins: 40, metal: 2, alloy: 1 };
export const CHARM_SPD = 1.25;    // a matching plant SOWN while the charm is worn grows this much faster
export const CHARM_SELL = 1.2;    // matching produce sells this much dearer while the charm is worn

// testing-table experiments gate their logic behind modOn: on by default, and a player can shelve
// one from the town hall board (the off-switch lives in the save's experiment pocket, so it roams).
export const modOn = (farm, id) => !(farm && farm.x && farm.x._mods && farm.x._mods[id] === false);
export function setMod(farm, id, on, now) {
  const next = clone(farm);
  next.x = next.x || {};
  next.x._mods = next.x._mods || {};
  if (on) delete next.x._mods[id]; else next.x._mods[id] = false;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

export const hasForge = (farm) => !!farm.forge;
export const activeCharm = (farm) => (farm.forge && farm.forge.active) || null;

// every crop has a sign: Culpeper's rulership where the ark carries one (the reagent herbs), and
// the anvil's own reckoning — a deterministic hash over the seven — for the rest. Total, stable,
// and recomputable by any viewer; without this a Saturn charm would bless nothing (the ark has no
// Saturn herbs) and a third of the roster would stand outside the heavens.
const PLANET_RING = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
export function cropPlanet(crop) {
  if (!crop) return null;
  if (crop.planet && CHARM_DEFS[crop.planet]) return crop.planet;
  let h = 0x811c9dc5;
  for (const ch of 'sign:' + crop.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return PLANET_RING[(h >>> 0) % PLANET_RING.length];
}

export function buildForge(farm, tx, ty, now) {
  if (farm.forge) return { ok: false, reason: 'the forge already stands' };
  if ((farm.mine.depth | 0) < FORGE_REQ.depth) return { ok: false, reason: 'reach depth ' + FORGE_REQ.depth + ' in the mine first — a smith should know where metal sleeps' };
  if (farm.coins < FORGE_REQ.coins) return { ok: false, reason: 'costs ' + FORGE_REQ.coins + '◈ + ' + FORGE_REQ.iron + ' iron + ' + FORGE_REQ.copper + ' copper' };
  if ((farm.metals.iron | 0) < FORGE_REQ.iron || (farm.metals.copper | 0) < FORGE_REQ.copper) {
    return { ok: false, reason: 'needs ' + FORGE_REQ.iron + ' iron + ' + FORGE_REQ.copper + ' copper from the mine' };
  }
  if (!inWorld(tx, ty)) return { ok: false, reason: 'beyond the world’s edge' };
  if (!ownsTile(farm, tx, ty)) return { ok: false, reason: 'not your land — buy the parcel first' };
  const t = tileAt(farm, tx, ty);
  if (t === 'pond') return { ok: false, reason: 'it would sink' };
  if (t === 'hill') return { ok: false, reason: 'flatten the hill first' };
  if (buildingAt(farm, tx, ty)) return { ok: false, reason: 'a building already stands there' };
  for (const p of farm.bed.plants) if (Math.floor(p.x * FIELD_T) === tx && Math.floor(p.y * FIELD_T) === ty) return { ok: false, reason: 'a plant is rooted there' };
  const next = clone(farm);
  next.coins -= FORGE_REQ.coins;
  next.metals.iron -= FORGE_REQ.iron;
  next.metals.copper -= FORGE_REQ.copper;
  next.buildings.push({ id: 'forge', kind: 'forge', tx, ty });
  next.forge = { queue: null, alloys: {}, charms: {}, active: null };
  next.updatedAt = now;
  return { ok: true, farm: next };
}

export const smeltReady = (farm, now) => {
  const q = farm.forge && farm.forge.queue;
  return !!(q && now >= q.at + (ALLOYS[q.alloy] ? ALLOYS[q.alloy].ms : 0));
};

export function collectSmelt(farm, now) {
  if (!farm.forge || !farm.forge.queue) return { ok: false, reason: 'the crucible is empty' };
  if (!smeltReady(farm, now)) return { ok: false, reason: 'still molten — come back later' };
  const next = clone(farm);
  const a = next.forge.queue.alloy;
  next.forge.alloys[a] = (next.forge.alloys[a] | 0) + 1;
  next.forge.queue = null;
  next.stats.alloysSmelted = (next.stats.alloysSmelted | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next, alloy: a };
}

export function smeltAlloy(farm, alloyId, now) {
  if (!farm.forge) return { ok: false, reason: 'build the forge first' };
  const def = ALLOYS[alloyId];
  if (!def) return { ok: false, reason: 'no such alloy' };
  let base = farm, collected = null;
  if (farm.forge.queue) {
    if (!smeltReady(farm, now)) return { ok: false, reason: 'the crucible is busy' };
    const c = collectSmelt(farm, now);          // a ready pour never blocks the next one
    base = c.farm; collected = c.alloy;
  }
  for (const [m, n] of Object.entries(def.needs)) {
    if ((base.metals[m] | 0) < n) return { ok: false, reason: def.name + ' wants ' + Object.entries(def.needs).map(([k, v]) => v + ' ' + k).join(' + ') };
  }
  const next = clone(base);
  for (const [m, n] of Object.entries(def.needs)) next.metals[m] -= n;
  next.forge.queue = { alloy: alloyId, at: now };
  next.updatedAt = now;
  return { ok: true, farm: next, collected };
}

export function sellAlloy(farm, alloyId, qty, now) {
  const def = ALLOYS[alloyId];
  if (!farm.forge || !def) return { ok: false, reason: 'no such alloy' };
  const have = farm.forge.alloys[alloyId] | 0;
  qty = Math.max(0, Math.min(have, qty | 0));
  if (!qty) return { ok: false, reason: 'none in the rack' };
  const next = clone(farm);
  next.forge.alloys[alloyId] -= qty; if (!next.forge.alloys[alloyId]) delete next.forge.alloys[alloyId];
  const coins = def.sell * qty;
  next.coins += coins;
  next.updatedAt = now;
  return { ok: true, farm: next, coins };
}

export function forgeCharm(farm, planet, now) {
  if (!farm.forge) return { ok: false, reason: 'build the forge first' };
  const def = CHARM_DEFS[planet];
  if (!def) return { ok: false, reason: 'no such sign in the sky' };
  if (farm.forge.charms[planet]) return { ok: false, reason: 'the ' + planet + ' charm already hangs by the anvil' };
  if (farm.coins < CHARM_COST.coins) return { ok: false, reason: 'costs ' + CHARM_COST.coins + '◈ + ' + CHARM_COST.metal + ' ' + def.metal + ' + ' + CHARM_COST.alloy + ' ' + def.alloy };
  if ((farm.metals[def.metal] | 0) < CHARM_COST.metal) return { ok: false, reason: 'wants ' + CHARM_COST.metal + ' ' + def.metal + ' — its own metal, no substitute' };
  if ((farm.forge.alloys[def.alloy] | 0) < CHARM_COST.alloy) return { ok: false, reason: 'wants ' + CHARM_COST.alloy + ' ' + def.alloy + ' from the crucible' };
  const next = clone(farm);
  next.coins -= CHARM_COST.coins;
  next.metals[def.metal] -= CHARM_COST.metal;
  next.forge.alloys[def.alloy] -= CHARM_COST.alloy; if (!next.forge.alloys[def.alloy]) delete next.forge.alloys[def.alloy];
  next.forge.charms[planet] = new Date(now).toISOString();
  if (!next.forge.active) next.forge.active = planet;   // the first charm goes straight on
  next.stats.charmsForged = (next.stats.charmsForged | 0) + 1;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

export function setCharm(farm, planet, now) {
  if (!farm.forge) return { ok: false, reason: 'build the forge first' };
  if (planet != null && !farm.forge.charms[planet]) return { ok: false, reason: 'no such charm by the anvil yet' };
  const next = clone(farm);
  next.forge.active = planet || null;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

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
  barn:  { emoji: '🐄', name: 'barn',        panel: 'barn' },
  forge: { emoji: '⚒️', name: 'forge',       panel: 'forge' },   // the only station you BUILD (buildForge)
  hall:  { emoji: '🏛️', name: 'town hall',   panel: 'hall' },    // petitions, the ledger, the testing-table board
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
    { id: 'barn',  kind: 'barn',  tx: 6,  ty: 0 },
    { id: 'hall',  kind: 'hall',  tx: 0,  ty: 6 },
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
    v: 7, seed,
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
    animals: [],                 // the herd [{ id, kind, at, fedUntil, feedGrade, lastCollect, lastPet }]
    goods: {}, goodsC: {},       // animal goods by grade (eggs/milk/wool/honey), like the pantries
    forage: null,                // { w, got: [i…] } — this window's gathered sparkles
    forge: null,                 // null until BUILT → { queue, alloys, charms, active } (the metals vertical)
    market: null,                // { day, sold: {cropId → n} } — today's per-crop saturation tally
    x: {},                       // THE EXPERIMENT POCKET (save covenant): testing-table features keep
                                 // ALL their state under x.<featureId>. Mainline preserves x verbatim
                                 // and never reads it — one save plays on both worlds.
    metals: {},                  // metal → count (from the mine: gold silver quicksilver copper iron tin lead)
    shards: 0,                   // quintessence shards (mine) — one steadies a wobbly brew
    preparations: [],            // brewed items [{ id, vessel, grade, label, use, glyphs, reagents, at }]
    owned: [],                   // crop ids ever held (the gacha collection)
    pulls: 0,                    // gacha pulls taken (the per-pull RNG index — determinism is load-bearing)
    mine: { depth: 0, runDepth: 0, picks: 0, picksBonus: 0, bombs: 0, dug: {}, lastEntered: 0 },
    effects: { yieldBoost: 0, wardUntil: 0 },   // rousing brews bank +1-yield harvests; sedate brews ward the market
    achievements: {},            // id → ISO earned-at
    claimedGifts: [],            // at:// uris of friend gifts already folded into this save
    stats: { planted: 0, harvests: 0, produce: 0, sold: 0, tendsGiven: 0, giftsSent: 0, brews: 0, bestGrade: null, oresMined: 0, gemsFound: 0, terraforms: 0, movedBuildings: 0, organicHarvests: 0, pestsTreated: 0, animalsBought: 0, pets: 0, goodsCollected: 0, foraged: 0, alloysSmelted: 0, charmsForged: 0 },
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
  // WATER STAKES: wetland crops refuse dry ground outright; everything else may plant far from
  // water, but lives on the can (see PARCH_MS) — the caller gets farWater to warn with.
  const wr = thirstOf(crop);
  const ptx = Math.floor(x * FIELD_T), pty = Math.floor(y * FIELD_T);
  const nearWater = waterSourceWithin(farm, ptx, pty, wr);
  if (!nearWater && THIRSTY[crop.id] != null) {
    return { ok: false, reason: (crop.common || cropId) + ' grows only beside water — within ' + wr + ' tile' + (wr === 1 ? '' : 's') + ' of a pond' };
  }
  const next = clone(farm);
  let spd = next.stats.harvests === 0 && next.bed.plants.length < FRESH_PLANTS ? FRESH_SPD : 1;
  // sown under a sign: a worn charm blesses plantings of its OWN planet, at sow time only — the
  // boost lives on the plant (public record), so any viewer recomputes it without knowing when
  // charms were swapped.
  const charmed = !!(activeCharm(next) && cropPlanet(crop) === activeCharm(next));
  if (charmed) spd *= CHARM_SPD;
  // grownMs/calcAt is the SETTLE MODEL: banked effective growth as of calcAt, extended live by the
  // piecewise watered/dry rate. wateredAt = now — a fresh planting is watered in.
  next.bed.plants.push({ id: 'p' + next.bed.nextId, x: +x.toFixed(4), y: +y.toFixed(4), seedId: cropId, at: now, spd, grownMs: 0, calcAt: now, wateredAt: now, fertN: 0, syn: false, pestOkW: 0, wr, ...(charmed ? { sign: cropPlanet(crop) } : {}) });
  next.bed.nextId++;
  next.seeds[cropId]--; if (!next.seeds[cropId]) delete next.seeds[cropId];
  if (!next.owned.includes(cropId)) next.owned.push(cropId);
  next.stats.planted++;
  next.updatedAt = now;
  return { ok: true, farm: next, spd, charmed, farWater: !nearWater };
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
  // beyond water range the dry ground gives NOTHING back — only the can moves the clock out
  // there. Within range, dry spells still crawl at DRY_RATE. This is what makes hydration
  // (grown/elapsed) an honest record of how well a plant was kept.
  const dryRate = plantNearWater(farm, plant) ? DRY_RATE : 0;
  const wetEnd = Math.min(b, Math.max(a, (plant.wateredAt || 0) + WATER_MS));
  const wet = Math.max(0, wetEnd - a);
  return (wet + (b - a - wet) * dryRate) * spd;
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
  let rate = hasTech(farm, 'ladybugs') && !plant.syn ? PEST_RATE / 2 : PEST_RATE;
  // KEPT MARGINS (paths matter, 2026-08-13): a walked edge is a weeded edge — a plant with a
  // path or road on a neighbouring tile sees half the infestations. Spatial, deterministic,
  // and it finally gives the 5◈ path a job beyond looking tidy.
  if (pathBeside(farm, plant)) rate /= 2;
  return roll < rate;
}
export function pathBeside(farm, plant) {
  const tx = Math.floor(plant.x * FIELD_T), ty = Math.floor(plant.y * FIELD_T);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const t = inWorld(tx + dx, ty + dy) ? tileAt(farm, tx + dx, ty + dy) : null;
    if (t === 'path' || t === 'road') return true;
  }
  return false;
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
  const near = plantNearWater(farm, plant);
  const rate = (plant.spd || 1) * (watered ? 1 : near ? DRY_RATE : 0);
  // death spares nothing, ripe included: a far crop left unwatered PARCH_MS is gone. Harvest
  // promptly or keep the water flowing — those are the stakes of planting past the ponds.
  const dead = plantDead(farm, plant, now);
  // hydration: what fraction of its life this plant spent effectively watered — pure arithmetic
  // over grown/elapsed, so any viewer recomputes it. 1.0 = kept like a garden; DRY_RATE-ish =
  // left to crawl; lower still = time beyond the ponds where dry ground gives nothing.
  const elapsed = Math.max(1, now - (plant.at || 0)) * (plant.spd || 1);
  const hydration = Math.max(0, Math.min(1, grown / elapsed));
  return { stage, ready: stage >= 1 && !dead, msLeft: rate > 0 ? Math.max(0, Math.round((needMs - grown) / rate)) : Infinity, needMs, watered, dead, farWater: !near, hydration };
}

// the watering TASK: free, per-plant, holds WATER_MS. Settles first so the dry spell is banked.
export function waterPlant(farm, plantId, now) {
  const idx = farm.bed.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return { ok: false, reason: 'no such plant' };
  const next = clone(farm);
  const p = next.bed.plants[idx];
  if (plantDead(next, p, now)) return { ok: false, reason: 'withered past saving — clear it and plant nearer water' };
  if (irrigated(next, p)) return { ok: false, reason: 'already irrigated — the water finds it by itself' };
  if (now <= (p.wateredAt || 0) + WATER_MS) return { ok: false, reason: 'still damp — water holds 6h' };
  settle(p, next, now);
  p.wateredAt = now;
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// a withered plant comes out of the ground with nothing to show — that is the sting that makes
// water infrastructure real. Only the dead clear this way; a living plant is harvested or left.
export function clearPlant(farm, plantId, now) {
  const idx = farm.bed.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return { ok: false, reason: 'no such plant' };
  if (!plantDead(farm, farm.bed.plants[idx], now)) return { ok: false, reason: 'still alive — harvest it or let it grow' };
  const next = clone(farm);
  next.bed.plants.splice(idx, 1);
  next.updatedAt = now;
  return { ok: true, farm: next };
}

// tendCounts: { plantId → distinct-friend count } assembled by social.js from public tend records.
export function harvestPlant(farm, plantId, ark, now, tendCounts = {}) {
  const idx = farm.bed.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return { ok: false, reason: 'no such plant' };
  const plant = farm.bed.plants[idx], crop = cropById(ark, plant.seedId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  const g = growthOf(farm, plant, crop, now, tendCounts[plantId] || 0);
  if (g.dead) return { ok: false, reason: 'withered — clear it and plant nearer water' };
  if (!g.ready) return { ok: false, reason: 'not ripe yet' };
  const infested = isInfested(farm, plant, now);
  const next = clone(farm);
  next.bed.plants.splice(idx, 1);
  let yld = Math.max(1, crop.yield | 0);
  // WATER PAYS AT THE SCALE (2026-08-13, oracle-gated): yield follows hydration — the wet
  // fraction of the plant's whole life. Kept watered (or near a pond/sprinkler): full basket.
  // Left to crawl through dry spells, or ripe and ignored on far ground: the basket lightens.
  // Three legible tiers, never below 1 — a live plant always gives something.
  const parchedTier = g.hydration < 0.6 ? 0.5 : g.hydration < 0.8 ? 0.75 : 1;
  yld = Math.max(1, Math.round(yld * parchedTier));
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
  return { ok: true, farm: next, cropId: crop.id, yield: yld, seeds: seedsBack, organic, bitten: infested, parched: parchedTier < 1 };
}

// ── market ────────────────────────────────────────────────────────────────────────────────────────
// ANNEALED (sim round 1): at ×0.5 the oracle's player made 615 harvests in 21 days and could not
// afford a second parcel or a single tech — an 11-day unlock gap. ×0.7 + goods + forage income
// puts the first land deed around day 2 and keeps something unlockable in reach every ~2 days.
// ANNEALED (diversity, 2026-08-13): raw seedCost pricing left one king crop at 3× the median
// coin-value-per-growth-day and a greedy planter at H=0.42 — most of the roster was wallpaper.
// The price now BLENDS the seed-cost line with a value-normalized line (VALUE_NORM ◈/growth-day),
// halving the spread (top ≈1.8× median, king ≈16% over its runner-up) while keeping mean income
// within ~10% of the annealed curve. Real trade-offs come from planet charms, pests and timing.
// VALUE_NORM 12 → 15 with the water stakes (2026-08-13): the stakes halved harvest COUNT by
// design (fewer, better-tended plants near real infrastructure); the per-unit price rises so a
// full hydrated basket pays what the old sloppy volume did and progression keeps its tempo.
export const VALUE_NORM = 15;
export const sellPrice = (crop) => {
  const base = Math.max(3, Math.round((crop.seedCost || 10) * 0.6));
  const flat = VALUE_NORM * Math.max(1, crop.growthDays | 0) / (ORGANIC_PREMIUM * Math.max(1, crop.yield | 0));
  return Math.max(3, Math.round(0.4 * base + 0.6 * flat));
};
export const sellPriceOrganic = (crop) => Math.round(sellPrice(crop) * ORGANIC_PREMIUM);

// MARKET SATURATION (diversity anneal, 2026-08-13): price compression alone couldn't move an
// argmax planter off one crop (H_greedy fell to 0.13 — whatever ranks first wins forever, since
// harvests return their own seeds). So the village only wants so much of ONE crop per day: the
// first SAT_K units sell at list, the rest at ×SAT_RATE until tomorrow. Rotation becomes the
// optimal play, which is what makes the roster REAL. Per-crop, per-real-day, deterministic; the
// tally lives in the save (farm.market) so any viewer prices your stall the same. Goods are
// exempt — there are only four of them and the herd's rates were annealed separately.
export const SAT_K = 10;
export const SAT_RATE = 0.5;

// MARKET ACCESS (roads matter, 2026-08-13): every owned parcel the old road runs through adds
// ROAD_CUT to produce prices, capped — the carts come to you. Turns the road archetype from a
// planting nuisance into the reason you bought that parcel. Memoized per parcel set.
export const ROAD_CUT = 0.02;
export const ROAD_CAP = 0.10;
const _roadCache = new Map();
export function roadBonus(farm) {
  // tileAt, not baseTile: meadow the road away and the carts stop coming — keeping it is the trade
  const key = farm.seed + '|' + (farm.parcels || []).join(';') + '|' + Object.keys(farm.terra || {}).length;
  if (!_roadCache.has(key)) {
    let n = 0;
    for (const pk of farm.parcels || []) {
      const [px, py] = pk.split(',').map(Number);
      let has = false;
      for (let ty = 0; ty < FIELD_T && !has; ty++) for (let tx = 0; tx < FIELD_T && !has; tx++) {
        if (tileAt(farm, px * FIELD_T + tx, py * FIELD_T + ty) === 'road') has = true;
      }
      if (has) n++;
    }
    if (_roadCache.size > 64) _roadCache.clear();
    _roadCache.set(key, Math.min(ROAD_CAP, ROAD_CUT * n));
  }
  return _roadCache.get(key);
}
export const marketDay = (now) => Math.floor(now / 86400000);
export const soldToday = (farm, cropId, now) =>
  (farm.market && farm.market.day === marketDay(now) ? farm.market.sold[cropId] : 0) | 0;

// grade: 'organic' (the premium pantry) or 'conv' (synthetic-touched — plain price, never brews)
export function sellProduce(farm, cropId, qty, ark, now, grade = 'organic') {
  const poolKey = grade === 'conv' ? 'pantryC' : 'pantry';
  const have = (farm[poolKey] || {})[cropId] | 0;
  qty = Math.max(0, Math.min(have, qty | 0));
  if (!qty) return { ok: false, reason: 'nothing to sell' };
  const crop = cropById(ark, cropId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  const ward = now < (farm.effects.wardUntil || 0) ? 1.25 : 1;   // a sedate brew binds the market in your favour
  const favoured = activeCharm(farm) && cropPlanet(crop) === activeCharm(farm) ? CHARM_SELL : 1;   // the worn charm's planet sells dear
  const road = 1 + roadBonus(farm);                              // market access: the old roads finally pay
  const unit = grade === 'conv' ? sellPrice(crop) : sellPriceOrganic(crop);
  const prior = soldToday(farm, cropId, now);
  const fullN = Math.max(0, Math.min(qty, SAT_K - prior));       // what the village still wants at list
  const coins = Math.round(unit * ward * favoured * road * (fullN + (qty - fullN) * SAT_RATE));
  const next = clone(farm);
  next[poolKey][cropId] -= qty; if (!next[poolKey][cropId]) delete next[poolKey][cropId];
  const day = marketDay(now);
  const sold = next.market && next.market.day === day ? next.market.sold : {};
  next.market = { day, sold: { ...sold, [cropId]: prior + qty } };
  next.coins += coins; next.stats.sold += qty;
  next.updatedAt = now;
  return { ok: true, farm: next, coins, warded: ward > 1, favoured: favoured > 1, saturated: qty > fullN, organic: grade !== 'conv' };
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
  if (!f || f.v < 1 || f.v > 7) return null;
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
  if (f.v === 4) {   // v4 → v5: livestock, forage, and the barn
    f.v = 5;
    f.animals = f.animals || [];
    f.goods = f.goods || {}; f.goodsC = f.goodsC || {};
    f.forage = f.forage || null;
    for (const k of ['animalsBought', 'pets', 'goodsCollected', 'foraged']) f.stats[k] = f.stats[k] | 0;
    if (!(f.buildings || []).some((b) => b.id === 'barn')) {
      const barn = defaultBuildings(f.seed).find((b) => b.id === 'barn');
      if (barn && !buildingAt(f, barn.tx, barn.ty)) f.buildings.push(barn);
      else if (barn) { barn.tx = (barn.tx + 2) % FIELD_T; f.buildings.push(barn); }
    }
  }
  if (f.v === 5) {   // v5 → v6: the forge + the market tally. Nothing to place — the forge is BUILT, not inherited.
    f.v = 6;
    f.forge = f.forge || null;
    f.market = f.market || null;
    f.stats.alloysSmelted = f.stats.alloysSmelted | 0;
    f.stats.charmsForged = f.stats.charmsForged | 0;
  }
  if (f.v === 6) {   // v6 → v7: the town hall + the water stakes
    f.v = 7;
    // the eighth station: petitions move from the deeds sign into a hall of their own
    if (!(f.buildings || []).some((b) => b.id === 'hall')) {
      const hall = defaultBuildings(f.seed).find((b) => b.id === 'hall');
      if (hall && !buildingAt(f, hall.tx, hall.ty)) f.buildings.push(hall);
      else if (hall) { hall.ty = (hall.ty + 2) % FIELD_T; f.buildings.push(hall); }
    }
    // water stakes grandfathering: every existing plant gets the lenient default range (even
    // wetland crops planted before the rule — no retroactive executions) and a fresh PARCH_MS
    // grace from the moment this save walks up, so nobody arrives to a field of corpses.
    const ref = f.updatedAt || 0;
    for (const p of f.bed.plants) {
      if (p.wr == null) p.wr = WATER_RANGE;
      p.wateredAt = Math.max(p.wateredAt || 0, ref);
    }
  }
  // THE SAVE COVENANT (not a version bump — both directions stay compatible): farm.x is the
  // experiment pocket. Testing-table builds (farm-next.mino.mobi) put ALL their state under
  // x.<featureId> and NEVER bump v or change existing fields' meaning; mainline carries x
  // untouched (every mutator deep-clones the whole farm) and never reads it. A feature that
  // graduates at the merge party moves its pocket into real fields via a proper v migration.
  f.x = f.x || {};
  return f;
}

export { bedKeepouts, plantNear, MIN_SPACING, PULL_COST };
