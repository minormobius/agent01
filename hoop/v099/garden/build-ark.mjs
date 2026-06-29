#!/usr/bin/env node
/* build-ark.mjs — bake the GARDEN ARK, grouped BY BIOME, for the trade-desk gacha.
   A biome is a viability-scored, finite food web (the same five the café serves, in food/biomes.json).
   Each biome's PRODUCER members are its seed pool; collecting every one CLOSES the biome. So the ark is
   not a flat crop list — it's five closeable collections, each with a rarity tier + foil, and per-crop
   gacha rarity/weights derived from how slow + nourishing a crop is (the chase crops are the prize ones).

   Offline-only (the food/ pattern): reads food/biomes.json (already solved) + biome/gacha/catalog.json
   (for the growth model) + cards/yum FOOD_POOL (flavor match for the kitchen). Deterministic.

   Usage: node hoop/v097/garden/build-ark.mjs   (writes hoop/v097/garden/ark.json) */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FOOD_POOL } from '../../../cards/js/pools/yum-pool.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const biomesDoc = JSON.parse(readFileSync(join(HERE, '../food/biomes.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(HERE, '../../../biome/gacha/catalog.json'), 'utf8'));
const byId = catalog.organisms;   // { id → organism }

// yum ingredient names → category, for matching crops to the flavor pool (the kitchen will use this).
// hand aliases where the crop's name doesn't literally appear in the pool; STOP kills generic words
// ("white" would otherwise grab "Egg white") so a word-match means a real ingredient overlap.
const ALIAS = { 'Maize': 'Corn' };
const STOP = new Set(['white', 'oil', 'root', 'shoot', 'wild', 'sweet', 'common', 'sacred', 'meadow', 'stinging', 'green', 'red', 'sea', 'water']);
const yum = FOOD_POOL.map((f) => ({ name: String(f[0]), low: String(f[0]).toLowerCase(), words: String(f[0]).toLowerCase().split(/\s+/), cat: f[1] }));
function matchYum(common) {
  const target = (ALIAS[common] || common).toLowerCase(), tw = target.split(/\s+/);
  let best = yum.find((y) => y.low === target);                            // exact full name (or alias)
  if (!best) best = yum.find((y) => y.words.some((w) => tw.includes(w) && w.length >= 4 && !STOP.has(w)));   // shared meaningful whole word
  return best || null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fnv = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// tier → foil colour (matches the biome/gacha card UI), and rarity → gacha pull weight (rarer = scarcer).
const TIER_FOIL = { Legendary: '#f0c860', Epic: '#b07be0', Rare: '#5aa9d8', Uncommon: '#62b87a', Common: '#8a9b92' };
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const RARITY_WEIGHT = { Common: 40, Uncommon: 26, Rare: 16, Epic: 11, Legendary: 7 };
// percentile cutoffs (by prestige rank within the biome) → rarity. Small pools skew common, by design.
function rarityForRank(rankPct) {
  if (rankPct >= 0.93) return 'Legendary';
  if (rankPct >= 0.80) return 'Epic';
  if (rankPct >= 0.60) return 'Rare';
  if (rankPct >= 0.33) return 'Uncommon';
  return 'Common';
}

function cropFromFood(food) {
  const o = byId[food.id] || {};
  const hi = o.harvestIndex || 0.3;
  const area = o.area_m2 || 1200;
  const sizeDays = clamp(Math.round(Math.log2(area / 250)), 0, 4);
  const jitter = (fnv(food.id) % 3) - 1;
  const growthDays = clamp(2 + sizeDays + jitter, 2, 7);
  const yld = clamp(Math.round(2 + hi * 7), 2, 9);
  const ym = matchYum(food.name);
  return {
    id: food.id, common: food.name, sciName: food.sci || (o.sciName || ''),
    thumb: food.thumb || (o.inat || {}).thumb || '',
    growthDays, yield: yld,
    nourish: food.nourish || clamp(Math.round(6 + hi * 14), 5, 22),
    kcal: food.kcal || 0,
    yumName: ym ? ym.name : null, category: ym ? ym.cat : 'VEGETABLE',
  };
}

const allCrops = new Map();   // id → crop (flat, deduped — same producer is identical across biomes)
const biomes = biomesDoc.biomes.map((b) => {
  const producers = (b.foods || []).filter((f) => f.guild === 'producer');
  const crops = producers.map(cropFromFood);
  // rarity by prestige rank (slow + nourishing = rarer / chase), then pull weight + per-crop seed price.
  const ranked = crops.map((c) => ({ c, prestige: c.growthDays * c.nourish + (fnv(c.id) % 5) })).sort((a, b) => a.prestige - b.prestige);
  ranked.forEach((e, i) => {
    const rar = ranked.length > 1 ? rarityForRank(i / (ranked.length - 1)) : 'Common';
    e.c.rarity = rar; e.c.weight = RARITY_WEIGHT[rar];
    e.c.seedCost = clamp(Math.round(e.c.growthDays * 2 + e.c.yield + RARITY_ORDER.indexOf(rar) * 3), 5, 30);
  });
  for (const c of crops) if (!allCrops.has(c.id)) allCrops.set(c.id, { id: c.id, common: c.common, sciName: c.sciName, thumb: c.thumb, growthDays: c.growthDays, yield: c.yield, nourish: c.nourish, kcal: c.kcal, yumName: c.yumName, category: c.category });
  return {
    id: 'b' + b.n, name: b.name, seed: b.n, theme: b.theme, tier: b.tier, interest: b.interest,
    foil: TIER_FOIL[b.tier] || TIER_FOIL.Common, crew: b.crew,
    blurb: `${b.theme} world · feeds ${b.crew} · ${producers.length} crops to gather`,
    crops: crops.sort((a, b2) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b2.rarity) || a.common.localeCompare(b2.common)),
  };
}).filter((b) => b.crops.length >= 2);   // a biome needs a real seed pool to be a collectable

const crops = [...allCrops.values()].sort((a, b) => a.common.localeCompare(b.common));
const cropIndex = {}; for (const c of crops) cropIndex[c.id] = c;
const out = {
  generatedBy: 'hoop/v097/garden/build-ark.mjs',
  source: 'food/biomes.json (viability-scored webs) + biome/gacha/catalog.json + cards yum FOOD_POOL',
  biomeCount: biomes.length, count: crops.length,
  biomes, crops, cropIndex,
};
writeFileSync(join(HERE, 'ark.json'), JSON.stringify(out, null, 1));
console.log(`garden ark: ${biomes.length} biomes, ${crops.length} distinct crops → garden/ark.json`);
for (const b of biomes) console.log(`  ${b.tier.padEnd(9)} ${b.name} — ${b.crops.length} crops: ` + b.crops.map((c) => `${c.common}[${c.rarity[0]}]`).join(', '));
