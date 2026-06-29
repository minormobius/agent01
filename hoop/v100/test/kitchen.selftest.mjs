// kitchen.selftest — the COOK kernel: flavor table integrity, coherence scoring, grade bands, dish
// nutrition (a coherent dish must out-nourish its raw crops), determinism.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { DISH_MIN, DISH_MAX, kCrop, pairCoherence, gradeOf, cookScore, cookDish } from '../garden/kitchen.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const kitchen = JSON.parse(readFileSync(join(HERE, '../garden/kitchen.json'), 'utf8'));
const ark = JSON.parse(readFileSync(join(HERE, '../garden/ark.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };

// 1. table integrity
ok(kitchen.crops.length === ark.crops.length, 'kitchen covers every ark crop');
ok(kitchen.pairCount === Object.keys(kitchen.pairs).length && kitchen.pairCount > 10, `pairs baked (${kitchen.pairCount})`);
ok(kitchen.crops.filter((c) => c.flavored).length >= 10, 'most crops are flavored');
for (const [k, v] of Object.entries(kitchen.pairs)) { ok(v.coh >= -1 && v.coh <= 1.0001, `pair ${k} coherence in range`); break; }
ok(Array.isArray(kitchen.grades) && kitchen.grades.length === 6, 'six grade bands');

// 2. coherence lookup is symmetric + bounded
const flav = kitchen.crops.filter((c) => c.flavored).map((c) => c.id);
ok(pairCoherence(kitchen, flav[0], flav[1]) === pairCoherence(kitchen, flav[1], flav[0]), 'coherence is symmetric');
ok(pairCoherence(kitchen, flav[0], flav[0]) === 1, 'a crop with itself is perfectly coherent');
ok(pairCoherence(kitchen, 'nope1', 'nope2') === kitchen.NEUTRAL, 'unknown pair falls back to neutral');

// 3. the starchy-staples cluster should out-score a disparate pair (real flavor signal)
const good = cookScore(kitchen, ['bamboo', 'cassava', 'lotus']);
const bad = cookScore(kitchen, ['maize', 'sunflower', 'cress']);
ok(good.coherence > bad.coherence, `coherent dish scores higher (${good.coherence.toFixed(2)} > ${bad.coherence.toFixed(2)})`);
ok(good.grade !== '—' && good.label, 'a real dish gets a grade + label');
ok(cookScore(kitchen, ['bamboo']).grade === '—', 'a single crop is not a dish');

// 4. grade bands monotonic
ok(gradeOf(kitchen, 0.99).grade === 'S', '0.99 → S');
ok(gradeOf(kitchen, 0.0).grade === 'F', '0.0 → F');
ok(['S', 'A', 'B', 'C', 'D', 'F'].includes(gradeOf(kitchen, good.coherence).grade), 'score maps to a letter');

// 5. cookDish: nutrition beats the raw sum, and is deterministic
const ids = ['bamboo', 'cassava', 'lotus'];
const raw = ids.reduce((s, id) => s + (kCrop(kitchen, id) ? 0 : 0) + (ark.crops.find((c) => c.id === id).nourish | 0), 0);
const dish = cookDish(kitchen, ark.crops, ids);
ok(dish && dish.kind === 'dish', 'cookDish returns a dish item');
ok(dish.food.nourish > raw, `coherent dish out-nourishes raw crops (${dish.food.nourish} > ${raw})`);
ok(dish.food.restoreStamina > 0, 'dish restores stamina');
ok(dish.grade === 'S' || dish.grade === 'A' ? dish.food.heal > 0 : dish.food.heal === 0, 'high grades heal, low grades do not');
ok(dish.name && dish.ingredients.length === 3, 'dish has a name + its ingredients');
ok(JSON.stringify(cookDish(kitchen, ark.crops, ids)) === JSON.stringify(dish), 'cooking is deterministic');
ok(cookDish(kitchen, ark.crops, ['bamboo']) === null, 'cannot cook fewer than DISH_MIN');
ok(cookDish(kitchen, ark.crops, ['a', 'b', 'c', 'd', 'e', 'f']).ingredients.length <= DISH_MAX, 'dish caps at DISH_MAX ingredients');
// a coherent dish out-nourishes a chaotic one of the same size
const chaotic = cookDish(kitchen, ark.crops, ['maize', 'sunflower', 'cress']);
ok(dish.food.nourish > chaotic.food.nourish, 'pairing well pays off in nourishment');

console.log(`kitchen.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
