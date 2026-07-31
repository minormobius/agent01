// ledger.selftest.mjs — the UNIFIED ELEMENT LEDGER: vendored biome (life-support) ⊕ forge (industry).
//   node hoop/forge/test/ledger.selftest.mjs
//
// Pins: (1) the vendored biome engine runs in hoop and yields a sane C/H/O/N ledger that scales with the
// population; (2) the element set partitions into biotic (biome) / industrial (forge); (3) the forge splits
// its draw into biome-carbon (living products) vs industrial elements; (4) THE CARBON PUMP is a real dial —
// carbon closes only when biome over-grows enough to feed industry on top of the crew (the carbon-pump
// thesis, mechanical); (5) the per-element classification + the Sankey index; (6) determinism.

import {
  ATOMIC, BIOTIC, INDUSTRIAL, biomeState, forgeElementFlow, carbonPump, unifiedLedger, elementFlows,
} from '../ledger.js';
import { ELEMENTS } from '../catalogue.js';
import { populationDemand } from '../needs.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── 1. the vendored biome engine runs inside hoop ──
const b100 = biomeState({ days: 150, people: 100 });
ok(BIOTIC.every((e) => b100.elKg[e] > 0 && isFinite(b100.elKg[e])), 'vendored biome yields a finite, positive C/H/O/N ledger (kg)');
ok(b100.snap && isFinite(b100.snap.calorieRatio), 'biome reports its life-support figures (calorie ratio)');
const b1000 = biomeState({ days: 150, people: 1000 });
ok(b1000.crewFoodKgDay > b100.crewFoodKgDay * 5, 'biome scales to the population (crew food demand grows with people)');

// ── 2. the element set partitions: biotic (biome's) vs industrial (forge's) ──
ok(BIOTIC.join() === 'C,H,O,N', 'the biotic elements are C,H,O,N (biome conserves these)');
ok(INDUSTRIAL.length === ELEMENTS.length - 4 && !INDUSTRIAL.some((s) => BIOTIC.includes(s)), 'industrial = the rest, disjoint from biotic');
ok(ELEMENTS.every((e) => ATOMIC[e.sym] > 0), 'every tracked element has an atomic mass');

// ── 3. the forge splits its draw: biome-carbon (living products) vs industrial elements ──
const { demand } = populationDemand(1000);
const f = forgeElementFlow(demand);
ok(f.bioCarbonKg > 0, 'living products draw carbon from biomass (the bio-carbon seam)');
ok(f.industrialKg > 0, 'non-living products draw industrial elements');
ok(f.flow.Fe > 0 && f.flow.C > 0 && f.flow.Si > 0, 'the element flow covers metals, carbon, minerals');

// ── 4. THE CARBON PUMP is a dial — the carbon-pump thesis, mechanical ──
const pump = carbonPump(demand);
ok(pump.lockedKgC > 0 && pump.lockedKgC < pump.totalDrawKgC, 'some carbon is LOCKED into structure (the pump), the rest cycles fast');
const lowGrow = unifiedLedger({ people: 1000, biomeDays: 150, growFactor: 1 });
const highGrow = unifiedLedger({ people: 1000, biomeDays: 150, growFactor: 3 });
ok(!lowGrow.carbonClosed, 'at growFactor 1 (food-only biome) carbon does NOT close — no surplus for industry');
ok(highGrow.carbonClosed, 'over-growing the biome (growFactor 3) CLOSES carbon — the ship must fix ~3× to feed industry + pump');
ok(highGrow.biome.nppSurplusKgC > lowGrow.biome.nppSurplusKgC, 'over-growing raises the NPP surplus the forge draws on');
ok(highGrow.perElement.C.pumpLockedKgC > 0, 'when carbon closes, the pump locks carbon into structure each day');

// ── 5. per-element classification + the Sankey index ──
const u = unifiedLedger({ people: 1000, biomeDays: 150, growFactor: 3 });
ok(u.perElement.C.metabolism === 'shared' && u.perElement.Fe.metabolism === 'industrial', 'carbon is SHARED (biome+forge); iron is industrial-only');
ok(u.perElement.C.biomeStockKg > 0 && u.perElement.Fe.biomeStockKg == null, 'shared elements carry a biome stock; industrial ones do not');
const cF = elementFlows('C'), feF = elementFlows('Fe');
ok(cF.inProducts.length > 25 && cF.biotic, 'carbon flows through most products and is biotic (the grand loop)');
ok(feF.inProducts.length > 0 && !feF.biotic && feF.inProducts.every((x) => x.frac > 0), 'iron flows through its products, industrial-only (the Sankey index)');

// ── 6. determinism ──
ok(JSON.stringify(unifiedLedger({ people: 500, biomeDays: 120, growFactor: 2 })) === JSON.stringify(unifiedLedger({ people: 500, biomeDays: 120, growFactor: 2 })), 'the unified ledger is deterministic');

console.log(`\nledger.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
