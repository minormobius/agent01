// food/build-biomes.mjs — load a few biome/gacha ecosystems and bake their food.
//
//   node hoop/v096/food/build-biomes.mjs            # writes food/biomes.json
//   node hoop/v096/food/build-biomes.mjs --dry      # print, don't write
//
// The "get a few loaded in here to see what nutrition we're working with" step.
// Rolls a fixed set of gacha seeds (deterministic — the same biomes for ever),
// runs biome's real viability oracle on each, pulls out the HARVESTABLE organisms
// and derives a food item per the nutrition gloss, and writes a small catalogue
// the cafe serves. hoop stays static: only the JSON ships, never biome's sim.
//
// This is an OFFLINE build (it imports the whole cycles engine). Re-run it to add
// or change which biomes the cafe draws from; commit the regenerated biomes.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rollDesign } from '../../../biome/gacha/sim/assemble.mjs';
import { evaluateRoll } from '../../../biome/gacha/sim/score.mjs';
import { foodsFromRoll } from './nutrition.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '../../../biome/gacha/catalog.json'), 'utf8')).organisms;
const catalogArr = Object.values(catalog);                 // assemble wants the array
const catalogById = catalog;                               // nutrition wants the by-id map

// the seeds the cafe draws from — VIABLE, food-rich rolls found by sweeping the
// seed space (closing or near-closing webs, ≥5 harvestable species, varied
// themes). Deterministic: the same biomes for ever. Change the list (and re-run)
// to restock the cafe. n9 = the Bountiful Basin (17 foods); n40/33/3 Rare; n2 the
// aquatic larder (carp/tilapia/rice/watercress).
const SEEDS = [9, 40, 33, 3, 2];

const biomes = [];
for (const n of SEEDS) {
  const roll = rollDesign(n, catalogArr);
  if (!roll) { console.warn(`seed ${n}: never assembled`); continue; }
  const scored = evaluateRoll(roll, { days: 400 });
  const last = (scored.report && scored.report.last) || {};
  const foods = foodsFromRoll(roll.meta.members, catalogById, last);
  if (!foods.length) { console.warn(`seed ${n}: no harvestable foods`); continue; }
  biomes.push({
    n,
    name: roll.design.name,
    theme: roll.meta.theme,
    tier: scored.tier,
    interest: scored.interest,
    crew: roll.design.crew,
    calorieRatio: scored.report && scored.report.closure ? +(scored.report.closure.calorieRatio || 0).toFixed(2) : null,
    nSpecies: roll.meta.nSpecies,
    foods,
  });
  console.log(`seed ${n}: ${roll.design.name} [${scored.tier} ${scored.interest}] — ${foods.length} foods (${foods.map((f) => f.name).join(', ')})`);
}

const out = {
  generatedBy: 'hoop/v096/food/build-biomes.mjs',
  source: 'biome/gacha',
  seeds: SEEDS,
  count: biomes.length,
  foodCount: biomes.reduce((a, b) => a + b.foods.length, 0),
  biomes,
};

if (process.argv.includes('--dry')) {
  console.log(JSON.stringify(out, null, 1).slice(0, 2400));
} else {
  writeFileSync(join(here, 'biomes.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`\nwrote food/biomes.json — ${out.count} biomes, ${out.foodCount} foods`);
}
