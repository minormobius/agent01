// needs.selftest.mjs — the nave social fabric → needs bridge.
//   node hoop/forge/test/needs.selftest.mjs

import { ROLE_LOOPS, LOOP_WEAR, LOOP_STOCK, LIFE_SUPPORT_LOOPS, populationDemand, roleEmphasis } from '../needs.js';
import { LOOP, LOOPS } from '../catalogue.js';
import { ROLES } from '../../v099/econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// every nave verb (econ role) maps to ≥1 valid forge loop
ok(Object.keys(ROLES).every((r) => ROLE_LOOPS[r] && ROLE_LOOPS[r].length), 'every nave role drives ≥1 loop');
ok(Object.values(ROLE_LOOPS).flat().every((l) => LOOP[l]), 'every mapped loop is a real catalogue loop');
// every loop has wear + stock
ok(LOOPS.every((l) => LOOP_WEAR[l.id] != null && LOOP_STOCK[l.id] != null), 'every loop has a wear + per-capita stock');

// populationDemand: separates life-support (biome's) from manufactured demand, scales with people
const d1 = populationDemand(1000), d2 = populationDemand(2000);
ok(Object.keys(d1.demand).length > 30, 'population demand covers the manufactured catalogue');
ok(LIFE_SUPPORT_LOOPS.length === 3 && Object.keys(d1.lifeSupport).length >= 3, 'air/water/food are split out as life-support (biome supplies them)');
ok(d1.lifeSupport.crop != null && d1.demand.crop == null, 'a food product (crop) is life-support, not manufactured demand');
ok(d1.demand.droid != null && d1.lifeSupport.droid == null, 'a manufactured product (droid) is in the demand, not life-support');
const someId = Object.keys(d1.demand)[0];
ok(Math.abs(d2.demand[someId] / d1.demand[someId] - 2) < 1e-9, 'manufactured demand scales linearly with population');
ok(Object.values(d1.demand).every((v) => v >= 0 && isFinite(v)), 'all demands are finite + non-negative');

// roleEmphasis: a make-heavy nave pushes labor/structure above a grow-heavy one
const makeHeavy = roleEmphasis({ make: 40, dwell: 10 });
const growHeavy = roleEmphasis({ grow: 40, dwell: 10 });
ok(makeHeavy.labor > growHeavy.labor, 'a make-heavy nave emphasises the labor loop more than a grow-heavy one');
ok(growHeavy.food > makeHeavy.food, 'a grow-heavy nave emphasises food (the biome interface) more');
ok(JSON.stringify(roleEmphasis({ make: 5 })) === JSON.stringify(roleEmphasis({ make: 5 })), 'roleEmphasis is deterministic');

console.log(`\nneeds.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
