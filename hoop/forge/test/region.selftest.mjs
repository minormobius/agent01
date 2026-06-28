// region.selftest.mjs — A COHERENT FORGE REGION: many chunks, the concourse GROWN by physarum (no imposed
// hypoxia solver), a fulfillment-center conduit to the nave. node hoop/forge/test/region.selftest.mjs
//
// Invariants: the region composes `count` chunks on one shared foam with seamless seams; the concourse is
// CARVED by physarum (road cells exist, not an imposed grid); the inter-engine supply graph closes the loop
// across chunks; a fulfillment center bridges to a NAVE node (product up / waste down); the grown conduit
// network is tiered with TRUNK arterials spanning seams + a nave conduit. All deterministic.

import { buildForgeRegion } from '../floor.js';
import { ENGINES } from '../engines.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

const reg = buildForgeRegion(7, { count: 7 });

// ── composition ──
ok(reg.recs.length === 7 && reg.recs.every(Boolean), `7 chunks solved (${reg.recs.length})`);
ok(reg.facilities.length >= 7, `region carries facilities (${reg.facilities.length})`);
ok(reg.rooms.length >= 60, `region has a substantial chamber graph (${reg.rooms.length} rooms)`);
ok(reg.crossLinks >= 6, `chunks are stitched across seams (${reg.crossLinks} cross-seam cell links)`);

// ── the concourse is GROWN (carved), not imposed: every chunk has road cells, and rooms still tile ──
const roadCells = reg.recs.reduce((s, r) => s + r.road.reduce((a, b) => a + b, 0), 0);
ok(roadCells >= 30, `physarum carved a concourse (${roadCells} road cells across the region)`);
ok(reg.recs.every((r) => r.rooms.length >= 1), 'every chunk still tiles into rooms');
// rooms exclude road cells (the carve expropriated them)
ok(reg.recs.every((r) => r.rooms.every((rm) => rm.cells.every((c) => !r.road[c]))), 'carved road cells are expropriated from rooms');

// ── inter-engine supply graph closes the loop across chunks ──
ok(reg.supply.length >= 1, `inter-engine supply edges exist (${reg.supply.length})`);
ok(reg.supply.every((s) => (ENGINES[reg.facilities[s.from].engine].output || []).includes(s.tag) && (ENGINES[reg.facilities[s.to].engine].intake || []).includes(s.tag)), 'every supply edge matches emitter output → consumer intake');
const crossSupply = reg.supply.filter((s) => s.cross).length;
ok(crossSupply >= 1, `supply spans chunk seams (${crossSupply}/${reg.supply.length} cross-chunk)`);

// ── the FULFILLMENT CENTER + NAVE: product up, waste down ──
const fulfil = reg.facilities.filter((f) => f.navePort);
ok(fulfil.length >= 1, `a fulfillment center bridges to the nave (${fulfil.length})`);
ok(fulfil.every((f) => f.engine === 'fulfillment'), 'the bridge is a fulfillment center');
ok(reg.nave && reg.nave.links >= 1, `the nave node is linked to the fulfillment lift (${reg.nave.links} links)`);
ok(reg.nave.pop > 0, `the region supplies a nave of crew (${reg.nave.pop} from ${reg.facilities.filter((f) => f.engine === 'assembly').length} assembly lines)`);
// the closed inter-deck loop is representable: fulfillment intakes product, outputs waste; reclaim eats waste
ok(ENGINES.fulfillment.intake.includes('product') && ENGINES.fulfillment.output.includes('waste') && ENGINES.reclaim.intake.includes('waste'), 'the loop closes: product → fulfillment → nave; nave waste → fulfillment → reclaim');

// ── grown conduits: tiered, trunks span seams, a nave conduit exists ──
ok(reg.conduits.length >= 10, `physarum grew a conduit network (${reg.conduits.length} edges)`);
const tiers = new Set(reg.conduits.map((c) => c.tier));
ok(tiers.has(3) && tiers.has(1), `the conduit network is tiered: tiers ${[...tiers].sort().join(',')}`);
const seamConduits = reg.conduits.filter((c) => c.chunkA !== c.chunkB && c.chunkA >= 0 && c.chunkB >= 0).length;
ok(seamConduits >= 1, `conduits cross chunk seams (${seamConduits} trans-rind edges)`);
ok(reg.conduits.some((c) => c.nave), 'a conduit rides up to the nave (the lift trunk)');

// ── variety + determinism + scale ──
let variety = 0; for (let s = 0; s < 8; s++) { const r = buildForgeRegion(s * 13 + 1, { count: 7 }); variety = Math.max(variety, new Set(r.facilities.map((f) => f.engine)).size); }
ok(variety >= 3, `regions exercise a variety of engines (max ${variety} distinct across seeds)`);
const a = buildForgeRegion(42, { count: 7 }), b = buildForgeRegion(42, { count: 7 });
ok(JSON.stringify(a.facilities) === JSON.stringify(b.facilities) && JSON.stringify(a.conduits) === JSON.stringify(b.conduits), 'buildForgeRegion is deterministic');
const big = buildForgeRegion(3, { count: 19 });
ok(big.recs.length === 19 && big.recs.every(Boolean), `a larger region composes (${big.recs.length} chunks) — it tiles`);
ok(big.facilities.filter((f) => f.navePort).length >= 2, `the bigger region grows more fulfillment conduits (${big.facilities.filter((f) => f.navePort).length})`);
ok(big.conduits.filter((c) => c.chunkA !== c.chunkB && c.chunkA >= 0 && c.chunkB >= 0).length >= 3, 'the larger region grows trans-chunk conduits');

// ── single-chunk mode (the facilities page route): forced engines, no fulfillment ──
const one = buildForgeRegion(5, { count: 1, engines: ['foundry'] });
ok(one.recs.length === 1 && one.facilities.length >= 1 && one.facilities.every((f) => f.engine === 'foundry'), 'count=1 with forced engines drives the facilities view');

console.log(`\nregion.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
