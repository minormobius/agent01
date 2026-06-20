#!/usr/bin/env node
/* build-ark.mjs — bake the GARDEN ARK: the growable organisms the trade desk sells, the garden grows,
   and (later) the kitchen cooks. Pulled from biome's iNaturalist roster (biome/gacha/catalog.json,
   the same ark the food/cafe pipeline uses) — every crop carries a real species + iNat photo.

   Offline-only (the food/ pattern): we never import biome's sim at runtime; we bake a small static
   garden/ark.json the game fetches. Deterministic — re-running yields the same ark.

   Each harvestable producer becomes a CROP with game-derived fields:
     • growthDays  — how many slept days to mature (slower for low harvest-index / big-footprint plants)
     • yield       — units harvested per plot (from harvestIndex)
     • nourish/kcal— what one unit restores when eaten (raw now; the kitchen will upgrade it to recipes)
     • seedCost    — coins at the trade desk (pricier for slow, high-yield crops)
     • yumName     — best match in the /cards/yum FOOD_POOL, so the kitchen can flavor-score dishes later

   Usage: node hoop/v097/garden/build-ark.mjs   (writes hoop/v097/garden/ark.json)
*/
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { FOOD_POOL } from '../../../cards/js/pools/yum-pool.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(HERE, '../../../biome/gacha/catalog.json'), 'utf8'));
const producers = Object.values(catalog.organisms).filter((o) => o.kind === 'producer' && o.harvestable);

// yum ingredient names (lowercased) → category, for matching crops to the flavor pool.
const yum = FOOD_POOL.map((f) => ({ name: String(f[0]), low: String(f[0]).toLowerCase(), cat: f[1] }));
function matchYum(common) {
  const c = common.toLowerCase();
  let best = yum.find((y) => y.low === c);                                   // exact
  if (!best) best = yum.find((y) => c.includes(y.low) || y.low.includes(c)); // substring
  if (!best) { const w = c.split(/\s+/).pop(); best = yum.find((y) => y.low === w || y.low.includes(w)); }   // last word ("Sweet potato"→"potato")
  return best || null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fnv = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const crops = producers.map((o) => {
  const hi = o.harvestIndex || 0.3;
  // growth spread 2..7: small-footprint leafy/aquatic crops mature fast, big staples slow; +stable jitter.
  const area = o.area_m2 || 1200;
  const sizeDays = clamp(Math.round(Math.log2(area / 250)), 0, 4);   // ~0 (cress/duckweed) … ~4 (maize/cassava)
  const jitter = (fnv(o.id) % 3) - 1;                                 // -1 / 0 / +1, deterministic
  const growthDays = clamp(2 + sizeDays + jitter, 2, 7);
  const yld = clamp(Math.round(2 + hi * 7), 2, 9);
  const nourish = clamp(Math.round(6 + hi * 14), 5, 22);                          // raw-eat value per unit
  const ym = matchYum(o.common);
  return {
    id: o.id, common: o.common, sciName: o.sciName,
    thumb: (o.inat || {}).thumb || '', photo: (o.inat || {}).photo || '', attribution: (o.inat || {}).attribution || '',
    growthDays, yield: yld, nourish, kcal: Math.round(nourish * 11),
    seedCost: clamp(Math.round(growthDays * 2 + yld), 5, 24),
    yumName: ym ? ym.name : null, category: ym ? ym.cat : 'VEGETABLE',
  };
}).sort((a, b) => a.growthDays - b.growthDays || a.common.localeCompare(b.common));

const out = {
  generatedBy: 'hoop/v097/garden/build-ark.mjs',
  source: 'biome/gacha/catalog.json (iNaturalist) + cards/js/pools/yum-pool.js',
  count: crops.length,
  crops,
};
writeFileSync(join(HERE, 'ark.json'), JSON.stringify(out, null, 1));
const matched = crops.filter((c) => c.yumName).length;
console.log(`garden ark: ${crops.length} crops baked → garden/ark.json  (${matched} matched a yum ingredient)`);
console.log('  ' + crops.map((c) => `${c.common}(${c.growthDays}d×${c.yield})`).join(', '));
