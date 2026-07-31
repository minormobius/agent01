// region.selftest.mjs — A COHERENT FORGE REGION: many chunks, the concourse GROWN by physarum (no imposed
// hypoxia solver), a fulfillment-center conduit to the nave. node hoop/forge/test/region.selftest.mjs
//
// Invariants: the region composes `count` chunks on one shared foam with seamless seams; the concourse is
// CARVED by physarum (road cells exist, not an imposed grid); the inter-engine supply graph closes the loop
// across chunks; a fulfillment center bridges to a NAVE node (product up / waste down); the grown conduit
// network is tiered with TRUNK arterials spanning seams + a nave conduit. All deterministic.

import { buildForgeRegion, supplyRoutes, regionWalk } from '../floor.js';
import { ENGINES } from '../engines.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// THE FACTORY: a 19-chunk region with ONE fulfillment center, optimised global layout.
const reg = buildForgeRegion(7, { count: 19, optimize: true });

// ── composition ──
ok(reg.recs.length === 19 && reg.recs.every(Boolean), `19 chunks solved (${reg.recs.length})`);
ok(reg.facilities.length >= 18, `factory carries facilities (${reg.facilities.length})`);
ok(reg.rooms.length >= 150, `factory has a substantial chamber graph (${reg.rooms.length} rooms)`);
ok(reg.crossLinks >= 18, `chunks are stitched across seams (${reg.crossLinks} cross-seam cell links)`);

// ── ONE fulfillment per ~19-chunk factory ──
ok(reg.nave.fulfillment === 1, `one fulfillment center per 19-chunk factory (${reg.nave.fulfillment})`);

// ── the GLOBAL LAYOUT is OPTIMISED: lower transport than the same mix placed at random ──
ok(reg.layout.optimized && reg.layout.reduction > 0.1, `optimised layout cuts transport vs random (${(reg.layout.reduction * 100).toFixed(0)}% lower)`);
// the emergent structure: assembly + reclaim RING the hub; the refiners sit outside (radial supply gradient)
const hub = reg.facilities.find((f) => f.navePort);
const dHub = (f) => Math.hypot(f.x - hub.x, f.y - hub.y);
const inner = reg.facilities.filter((f) => f.engine === 'assembly' || f.engine === 'reclaim');
const outer = reg.facilities.filter((f) => ['foundry', 'mill', 'chemworks', 'fab', 'weave'].includes(f.engine));
const meanInner = inner.reduce((s, f) => s + dHub(f), 0) / inner.length, meanOuter = outer.reduce((s, f) => s + dHub(f), 0) / outer.length;
ok(meanInner < meanOuter, `assembly+reclaim ring the hub, refiners outside (inner ${meanInner.toFixed(0)} < outer ${meanOuter.toFixed(0)})`);
// the balanced mix guarantees every engine type → the commodity loop closes
const engineSet = new Set(reg.facilities.map((f) => f.engine));
ok(['assembly', 'reclaim', 'foundry', 'mill', 'chemworks', 'fab', 'weave', 'fluid'].every((e) => engineSet.has(e)), 'the optimised mix includes every engine (loop closes)');

// ── the packets ride the CARVED ROADS: every supply edge routes along the concourse, not a straight line ──
const walk = regionWalk(reg);
const rts = supplyRoutes(reg, walk);
ok(rts.length === reg.supply.length, `a route per supply edge (${rts.length})`);
const onRoad = rts.filter((r) => r.onRoad).length;
ok(onRoad >= rts.length * 0.9, `≥90% of supply routes ride the carved roads (${onRoad}/${rts.length})`);
// an on-road route weaves through many road cells (a real path, not a 2-point straight line)
const woven = rts.filter((r) => r.onRoad && r.poly.length >= 4).length;
ok(woven >= onRoad * 0.8, `on-road routes weave the concourse (${woven} with ≥4 waypoints)`);
// every route's waypoints are real walkable positions; routes are deterministic
ok(rts.every((r) => r.poly.every((p) => isFinite(p.x) && isFinite(p.y))), 'route waypoints are finite');
ok(JSON.stringify(supplyRoutes(buildForgeRegion(7, { count: 19, optimize: true }))) === JSON.stringify(supplyRoutes(buildForgeRegion(7, { count: 19, optimize: true }))), 'supplyRoutes is deterministic');

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

// ── a smaller random (non-optimised) region still builds + reports a transport cost ──
const rnd = buildForgeRegion(9, { count: 7 });
ok(rnd.recs.length === 7 && rnd.recs.every(Boolean), `a 7-chunk region composes (${rnd.recs.length})`);
ok(rnd.nave.fulfillment === 1, `a 7-chunk region also gets one fulfillment (${rnd.nave.fulfillment})`);
ok(!rnd.layout.optimized && typeof rnd.layout.cost === 'number', 'a random layout still reports its transport cost (to compare against)');

// ── determinism ──
const a = buildForgeRegion(42, { count: 19, optimize: true }), b = buildForgeRegion(42, { count: 19, optimize: true });
ok(JSON.stringify(a.facilities) === JSON.stringify(b.facilities) && JSON.stringify(a.conduits) === JSON.stringify(b.conduits) && a.layout.cost === b.layout.cost, 'buildForgeRegion is deterministic (incl. the optimised layout)');

// ── it tiles past one factory: a 37-chunk region gets two fulfillment hubs ──
const two = buildForgeRegion(3, { count: 37, optimize: true });
ok(two.recs.length === 37 && two.nave.fulfillment === 2, `two factories tile (${two.recs.length} chunks, ${two.nave.fulfillment} fulfillment hubs)`);

// ── single-chunk mode (the facilities page route): forced engines, no fulfillment ──
const one = buildForgeRegion(5, { count: 1, engines: ['foundry'] });
ok(one.recs.length === 1 && one.facilities.length >= 1 && one.facilities.every((f) => f.engine === 'foundry'), 'count=1 with forced engines drives the facilities view');

console.log(`\nregion.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
