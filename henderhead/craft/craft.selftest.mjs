#!/usr/bin/env node
// craft.selftest.mjs — the wasm engine and the art, checked from node.
//
// The Rust side has its own known-answer tests against the game's recipes
// (engine/src/tests.rs). This one guards the seam the browser uses: the ABI,
// the committed .wasm, and the one thing neither side can check alone — that
// the item list in the rule and the item art in items.js are the same set.
//
//   node henderhead/craft/craft.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromBytes } from './engine.js';
import { ART, label } from './items.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`  ✓ ${name}`);
};

const eng = fromBytes(readFileSync(join(here, 'craftca.wasm')));
const desc = eng.init(64, 48, 20260911, 0.12);

console.log('the rule describes itself');
ok('items came back', desc.items.length > 20, `${desc.items.length}`);
ok('the seed stock is logs, planks and cobblestone',
   JSON.stringify(desc.seeds) === JSON.stringify(['oak_log', 'oak_planks', 'cobblestone']));
ok('the button is banned out of the box',
   JSON.stringify(desc.bannedByDefault) === JSON.stringify(['oak_button']), JSON.stringify(desc.bannedByDefault));
ok('recipes came back', desc.recipes.length >= desc.items.length - 3, `${desc.recipes.length}`);
ok('every recipe fits a crafting grid', desc.recipes.every((r) => r.w >= 1 && r.w <= 3 && r.h >= 1 && r.h <= 3));
ok('every recipe cell list is w×h', desc.recipes.every((r) => r.cells.length === r.w * r.h));
ok('every recipe output is a real item', desc.recipes.every((r) => desc.items[r.out - 1]));

console.log('\nthe art covers the rule, exactly');
{
  const inRule = new Set(desc.items);
  const inArt = new Set(Object.keys(ART));
  const missing = [...inRule].filter((i) => !inArt.has(i));
  const extra = [...inArt].filter((i) => !inRule.has(i));
  ok('every item in the rule has art', missing.length === 0, missing.join(', '));
  ok('no art for items the rule does not have', extra.length === 0, extra.join(', '));
  // a label may legitimately equal its id — a stick is called a stick — but it
  // must never be the raw snake_case one
  ok('every item has a readable label',
     desc.items.every((i) => label(i) && !label(i).includes('_')),
     desc.items.filter((i) => !label(i) || label(i).includes('_')).join(', '));
  const shapes = new Set(desc.items.map((i) => ART[i].shape));
  ok('the art uses a handful of shapes, not one per item', shapes.size >= 8 && shapes.size <= 20, `${shapes.size}`);
}

console.log('\nthe rule is the game’s');
{
  const byOut = (name) => desc.recipes.filter((r) => desc.items[r.out - 1] === name && !r.mirrored)[0];
  const id = (name) => desc.items.indexOf(name) + 1;
  const planks = byOut('oak_planks');
  ok('one log → four planks', planks.yield === 4 && planks.cells.length === 1 && planks.cells[0] === id('oak_log'));
  const boat = byOut('oak_boat');
  ok('a boat is five planks in a U', boat.w === 3 && boat.h === 2 && boat.cells[1] === 0 && boat.yield === 1);
  const chest = byOut('chest');
  ok('a chest is eight round a hole', chest.w === 3 && chest.h === 3 && chest.cells[4] === 0);
  const lever = byOut('lever');
  ok('a lever is a stick on a cobblestone',
     lever.w === 1 && lever.h === 2 && lever.cells[0] === id('stick') && lever.cells[1] === id('cobblestone'));
  const axes = desc.recipes.filter((r) => desc.items[r.out - 1] === 'wooden_axe');
  ok('an axe faces either way', axes.length === 2 && axes.some((r) => r.mirrored));
  ok('a boat is not mirrored, being symmetric already',
     desc.recipes.filter((r) => desc.items[r.out - 1] === 'oak_boat').length === 1);
}

console.log('\nit runs');
{
  const before = eng.occupied();
  eng.setMotion(0.2);
  eng.setCraftRate(2);
  eng.setRestock(0);
  for (let i = 0; i < 200; i++) eng.step();
  ok('the tick advanced', eng.tick() === 200, String(eng.tick()));
  ok('it crafted', eng.totalCrafts() > 50, String(eng.totalCrafts()));
  ok('the grid grew', eng.occupied() > before, `${before} → ${eng.occupied()}`);
  const counts = eng.counts();
  const n = (name) => counts[desc.items.indexOf(name) + 1];
  ok('sticks turned up', n('stick') > 0, String(n('stick')));
  ok('no buttons, because they are banned', n('oak_button') === 0);
  const kinds = [...counts].filter((c) => c > 0).length;
  ok('the tree got past the seed stock', kinds >= 8, `${kinds} kinds`);
  const sum = [...counts].slice(1).reduce((a, b) => a + b, 0);
  ok('the counts add up to the grid', sum === eng.occupied(), `${sum} vs ${eng.occupied()}`);
  const d = eng.discovered();
  ok('the seed stock was discovered at tick 0', d[desc.items.indexOf('oak_log') + 1] === 0);
  ok('sticks were discovered after tick 0', d[desc.items.indexOf('stick') + 1] > 0);
}

console.log('\nthe controls do something');
{
  const buttonId = desc.items.indexOf('oak_button') + 1;
  ok('the ban reads back', eng.isBanned(buttonId));
  eng.setBanned(buttonId, false);
  ok('and unsets', !eng.isBanned(buttonId));
  eng.setBanned(buttonId, true);

  eng.reseed(5, 0.1);
  ok('reseed resets the clock', eng.tick() === 0);
  const seeded = eng.occupied();
  eng.setMotion(0);
  eng.setCraftRate(0.0001);
  eng.step(20);
  ok('a stopped world barely moves', Math.abs(eng.occupied() - seeded) < seeded * 0.25);

  eng.reseed(6, 0.05);
  eng.setRestock(50);
  eng.setCraftRate(0);
  const start = eng.occupied();
  eng.step(60);
  ok('restocking fills the grid', eng.occupied() > start, `${start} → ${eng.occupied()}`);
}

console.log('\ncraft events carry what the page needs to draw them');
{
  eng.reseed(20260911, 0.14);
  eng.setMotion(0.2);
  eng.setCraftRate(20);
  eng.setRestock(0);
  let seen = null;
  for (let i = 0; i < 60 && !seen; i++) {
    const n = eng.step();
    if (n > 0) seen = eng.crafts(n)[0];
  }
  ok('a craft was reported', !!seen);
  if (seen) {
    ok('with a box to highlight', seen.w >= 1 && seen.w <= 3 && seen.h >= 1 && seen.h <= 3,
       JSON.stringify(seen));
    ok('inside the grid', seen.x < 64 && seen.y < 48 && seen.outX < 64 && seen.outY < 48);
    ok('naming a real recipe', seen.recipe < desc.recipes.length);
    ok('and a real output', !!desc.items[seen.out - 1]);
  }
}

console.log(failed ? `\nFAILED — ${failed} check(s)` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
