// food.selftest.mjs — the cafe's food layer: nutrition derivation + the baked
// biome catalogue (hoop/v096/food/).
//
//   node hoop/v096/test/food.selftest.mjs
//
// Pins: (1) deriveFood is deterministic + sane (kcal>0, macros ~sum 1, costs and
// effects in range); (2) plant/meat/fish are classified right; (3) the committed
// biomes.json is well-formed and every food carries the fields the cafe + sim need.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deriveFood, foodKind, macrosOf, foodsFromRoll } from '../food/nutrition.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, e = 0.001) => Math.abs(a - b) < e;

// 1. classification
const wheat = { id: 'wheat', common: 'Wheat', kind: 'producer', harvestIndex: 0.4, fix: 1.6, harvestable: true };
const cow = { id: 'cow', common: 'Cattle', kind: 'animal', guild: 'herbivore', mass_g: 400000, habitats: ['land'], harvestable: true };
const carp = { id: 'carp', common: 'Common carp', kind: 'animal', guild: 'omnivore', mass_g: 3000, habitats: ['lake'], harvestable: true };
ok(foodKind(wheat) === 'plant', 'producer → plant');
ok(foodKind(cow) === 'meat', 'land animal → meat');
ok(foodKind(carp) === 'fish', 'lake animal → fish');

// 2. nutrition sanity + determinism
for (const org of [wheat, cow, carp]) {
  const f = deriveFood(org, { yieldKg: 1200 });
  const g = deriveFood(org, { yieldKg: 1200 });
  ok(JSON.stringify(f) === JSON.stringify(g), `${org.common}: deriveFood is deterministic`);
  ok(f.kcal > 0, `${org.common}: kcal positive`);
  ok(near(f.macros.carb + f.macros.protein + f.macros.fat, 1, 0.02), `${org.common}: macros ~sum to 1`);
  ok(f.cost >= 3 && f.cost <= 30, `${org.common}: cost in range (${f.cost})`);
  ok(f.restoreStamina >= 6 && f.restoreStamina <= 42, `${org.common}: stamina restore in range`);
  ok(f.nourish >= 8 && f.nourish <= 60, `${org.common}: nourish in range`);
}
ok(macrosOf(cow).macros.protein > macrosOf(wheat).macros.protein, 'meat is more protein-dense than grain');
ok(macrosOf(wheat).macros.carb > macrosOf(cow).macros.carb, 'grain is more carb-dense than meat');

// 3. foodsFromRoll filters to harvestable + joins biomass
const catById = { wheat, cow, carp, weed: { id: 'weed', common: 'Pondweed', kind: 'producer', harvestable: false } };
const foods = foodsFromRoll(['wheat', 'cow', 'carp', 'weed', 'ghost'], catById, { wheat: 900 });
ok(foods.length === 3, 'only harvestable members become food (non-harvestable + missing dropped)');
ok(foods.every((f) => f.id && f.name && typeof f.cost === 'number'), 'each food is well-formed');

// 4. the committed biomes.json is well-formed
const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, '../food/biomes.json'), 'utf8'));
ok(data.count >= 3 && Array.isArray(data.biomes), `biomes.json has ≥3 biomes (${data.count})`);
ok(data.foodCount === data.biomes.reduce((a, b) => a + b.foods.length, 0), 'foodCount matches the sum');
let allFoodsOK = true, kinds = new Set();
for (const b of data.biomes) {
  if (!(b.name && b.theme && b.tier && Array.isArray(b.foods) && b.foods.length)) allFoodsOK = false;
  for (const f of b.foods) {
    kinds.add(f.kind);
    if (!(f.name && f.kcal > 0 && typeof f.cost === 'number' && typeof f.restoreStamina === 'number' && typeof f.nourish === 'number' && f.macros)) allFoodsOK = false;
  }
}
ok(allFoodsOK, 'every biome + food in biomes.json carries the fields the cafe/sim need');
ok(kinds.has('plant') && kinds.has('meat') && kinds.has('fish'), `the menu spans plant/meat/fish (${[...kinds].join(', ')})`);

console.log(`\nfood.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
