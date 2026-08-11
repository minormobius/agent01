// state.js — THE FARM KERNEL. Pure, DOM-free, deterministic: the whole save shape and every rule that
// mutates it. The UI calls these; the PDS just stores the result. Node-tested (test/state.selftest.mjs).
//
// TIME. hoop's garden counts abstract "days" advanced by resting; a Bluesky farm has no rest verb, so
// growth runs on the WALL CLOCK: one ark growthDay = DAY_MS of real time, measured from the plant's
// `at` timestamp. Readiness is a pure function of (plant, crop, now, tendCount) — no server tick, no
// stored countdown, and any visitor can recompute your bed's state from your public plot record alone.
//
// FRIENDS SPEED GROWTH. Each distinct friend who tends a plant (a com.minomobi.farm.tend record in the
// FRIEND's own repo, subject = your DID) shaves 10% off its total growth time, capped at 5 friends /
// 50%. The tend records are public, so the boost is verifiable by anyone — nothing here is trusted
// client state beyond your own plot record.
//
// All mutators return a NEW farm object (callers persist it); invalid moves return { ok:false, reason }.

import { bedKeepouts, plantable, plantNear, MIN_SPACING } from '../vendor/garden.js';
import { pull as gachaPull, pullRng, biomeForKey, PULL_COST, progress } from '../vendor/gacha.js';
import { gradeOf } from '../vendor/alchemy.js';

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
    v: 1, seed,
    biomeId: biome ? biome.id : null,
    coins: START_COINS,
    bed: { seed, plants: [], nextId: 0 },
    seeds,                       // cropId → count (plantable)
    pantry: {},                  // cropId → count (harvested produce)
    metals: {},                  // metal → count (from the mine: gold silver quicksilver copper iron tin lead)
    shards: 0,                   // quintessence shards (mine) — one steadies a wobbly brew
    preparations: [],            // brewed items [{ id, vessel, grade, label, use, glyphs, reagents, at }]
    owned: [],                   // crop ids ever held (the gacha collection)
    pulls: 0,                    // gacha pulls taken (the per-pull RNG index — determinism is load-bearing)
    mine: { depth: 0, runDepth: 0, picks: 0, picksBonus: 0, bombs: 0, dug: {}, lastEntered: 0 },
    effects: { yieldBoost: 0, wardUntil: 0 },   // rousing brews bank +1-yield harvests; sedate brews ward the market
    achievements: {},            // id → ISO earned-at
    claimedGifts: [],            // at:// uris of friend gifts already folded into this save
    stats: { planted: 0, harvests: 0, produce: 0, sold: 0, tendsGiven: 0, giftsSent: 0, brews: 0, bestGrade: null, oresMined: 0, gemsFound: 0 },
    createdAt: now, updatedAt: now,
  };
}

const clone = (f) => JSON.parse(JSON.stringify(f));

// ── planting ──────────────────────────────────────────────────────────────────────────────────────
export function plantSeed(farm, x, y, cropId, ark, now) {
  if (!farm.seeds[cropId]) return { ok: false, reason: 'no seed of that crop in the bag' };
  const crop = cropById(ark, cropId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  const keepouts = bedKeepouts(farm.bed.seed);
  if (!plantable(farm.bed, x, y, keepouts)) return { ok: false, reason: 'not plantable there (path, pond, stone, edge, or crowding)' };
  const next = clone(farm);
  const spd = next.stats.harvests === 0 && next.bed.plants.length < FRESH_PLANTS ? FRESH_SPD : 1;
  next.bed.plants.push({ id: 'p' + next.bed.nextId, x: +x.toFixed(4), y: +y.toFixed(4), seedId: cropId, at: now, spd, boost: 0 });
  next.bed.nextId++;
  next.seeds[cropId]--; if (!next.seeds[cropId]) delete next.seeds[cropId];
  if (!next.owned.includes(cropId)) next.owned.push(cropId);
  next.stats.planted++;
  next.updatedAt = now;
  return { ok: true, farm: next, spd };
}

// ── growth: pure (plant, crop, now, tendCount) → stage ────────────────────────────────────────────
// `plant.boost` is banked growth-time (ms) from cooling draughts; `spd` the fresh-soil multiplier.
export function growthOf(plant, crop, now, tendCount = 0) {
  if (!plant || !crop) return { stage: 0, ready: false, msLeft: 0, needMs: 1 };
  const cut = Math.min(TEND_CAP, tendCount | 0) * TEND_CUT;
  const needMs = Math.max(1, (crop.growthDays | 0)) * DAY_MS * (1 - cut);
  const grown = Math.max(0, now - plant.at) * (plant.spd || 1) + (plant.boost || 0);
  const stage = Math.max(0, Math.min(1, grown / needMs));
  return { stage, ready: stage >= 1, msLeft: Math.max(0, Math.round((needMs - grown) / (plant.spd || 1))), needMs };
}

// tendCounts: { plantId → distinct-friend count } assembled by social.js from public tend records.
export function harvestPlant(farm, plantId, ark, now, tendCounts = {}) {
  const idx = farm.bed.plants.findIndex((p) => p.id === plantId);
  if (idx < 0) return { ok: false, reason: 'no such plant' };
  const plant = farm.bed.plants[idx], crop = cropById(ark, plant.seedId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  if (!growthOf(plant, crop, now, tendCounts[plantId] || 0).ready) return { ok: false, reason: 'not ripe yet' };
  const next = clone(farm);
  next.bed.plants.splice(idx, 1);
  let yld = Math.max(1, crop.yield | 0);
  if (next.effects.yieldBoost > 0) { yld += 1; next.effects.yieldBoost--; }
  next.pantry[crop.id] = (next.pantry[crop.id] || 0) + yld;
  const seedsBack = Math.max(1, Math.min(3, crop.yield | 0));
  next.seeds[crop.id] = (next.seeds[crop.id] || 0) + seedsBack;
  next.stats.harvests++; next.stats.produce += yld;
  next.updatedAt = now;
  return { ok: true, farm: next, cropId: crop.id, yield: yld, seeds: seedsBack };
}

// ── market ────────────────────────────────────────────────────────────────────────────────────────
export const sellPrice = (crop) => Math.max(SELL_FLOOR, Math.round((crop.seedCost || 10) * 0.5));

export function sellProduce(farm, cropId, qty, ark, now) {
  const have = farm.pantry[cropId] | 0;
  qty = Math.max(0, Math.min(have, qty | 0));
  if (!qty) return { ok: false, reason: 'nothing to sell' };
  const crop = cropById(ark, cropId);
  if (!crop) return { ok: false, reason: 'unknown crop' };
  const ward = now < (farm.effects.wardUntil || 0) ? 1.25 : 1;   // a sedate brew binds the market in your favour
  const coins = Math.round(sellPrice(crop) * qty * ward);
  const next = clone(farm);
  next.pantry[cropId] -= qty; if (!next.pantry[cropId]) delete next.pantry[cropId];
  next.coins += coins; next.stats.sold += qty;
  next.updatedAt = now;
  return { ok: true, farm: next, coins, warded: ward > 1 };
}

// ── the trade desk (gacha) — deterministic: (seed, biomeId, pullIndex) re-rolls identically ───────
export function pullSeeds(farm, ark, now) {
  const biome = ((ark && ark.biomes) || []).find((b) => b.id === farm.biomeId) || biomeForKey(ark, String(farm.seed));
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
    for (const p of next.bed.plants) p.boost = (p.boost || 0) + ms;
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

// ── record shape: the whole farm IS one com.minomobi.farm.plot record (rkey `self`). ──
export function toPlotRecord(farm, now) {
  return { $type: 'com.minomobi.farm.plot', v: 1, farm, updatedAt: new Date(now).toISOString() };
}
export function fromPlotRecord(value) {
  return value && value.farm && value.farm.v === 1 ? value.farm : null;
}

export { bedKeepouts, plantable, plantNear, MIN_SPACING, PULL_COST };
