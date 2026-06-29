// floor.selftest.mjs — the bounded floor + chunk biome + edge tile model.
//   node hoop/chunkroller/test/floor.selftest.mjs
import { growFloor, chunkBiomeAt, BIOME_KEYS } from '../floor.js';
import { scoreChunk } from '../civic.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// ── chunk biome assignment is deterministic ──
ok(chunkBiomeAt(42, 450, 300) === chunkBiomeAt(42, 450, 300), 'chunkBiomeAt is deterministic for a coord+seed');
ok(BIOME_KEYS.includes(chunkBiomeAt(42, 450, 300)), 'chunkBiomeAt returns a known biome');
const distinctSeeds = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => chunkBiomeAt(s, 450, 300)));
ok(distinctSeeds.size > 1, 'different floor seeds vary the biome at a fixed coord');

// ── a bounded floor of ~9 chunks ──
const floor = growFloor(7, { count: 9, depth: 1 });
ok(floor.count >= 7 && floor.count <= 9, `bounded floor grew ${floor.count} chunks (target 9)`);
ok(floor.world.chunks.length === floor.count && floor.biomeOf.length === floor.count, 'every chunk has a biome');
ok(floor.world.chunks.every((c) => c.rooms.length > 0), 'every floor chunk grew rooms');

// determinism: same seed → same floor (chunk count + biome sequence + room roles)
const floorB = growFloor(7, { count: 9, depth: 1 });
ok(JSON.stringify(floor.biomeOf) === JSON.stringify(floorB.biomeOf), 'floor is deterministic (same biome sequence)');
ok(JSON.stringify(floor.world.chunks.map((c) => c.rooms.map((r) => r.role))) === JSON.stringify(floorB.world.chunks.map((c) => c.rooms.map((r) => r.role))), 'floor is deterministic (same room roles)');

// ── edge tiles: the leftover frontier edges seal the floor ──
ok(floor.edgeTiles.length > 0, 'the bounded floor has edge tiles (a sealed boundary)');
ok(floor.edgeTiles.every((t) => t.chunkId >= 0 && Number.isFinite(t.mx) && Number.isFinite(t.my)), 'each edge tile names its chunk + midpoint');
// a single chunk (count 1) is ALL edge tiles — every edge of its polygon is a frontier
const solo = growFloor(7, { count: 1, depth: 2 });
ok(solo.edgeTiles.length === solo.world.chunks[0].poly.length, 'a lone chunk seals all its edges');
ok(floor.edgeTiles.length < solo.edgeTiles.length * floor.count, 'interior seams are NOT edge tiles (growth consumed frontiers)');

// ── floor flags ──
ok(floor.noBaddies === true && floor.depth === 1, 'floor 1 carries the no-baddies gate');
ok(growFloor(7, { count: 4, depth: 2 }).noBaddies === false, 'deeper floors do not get the no-baddies gate');

// ── ward variety: a floor usually carries more than one biome ──
ok(Object.keys(floor.histogram).length >= 1, 'floor has a biome histogram');
let variedSeeds = 0; for (const s of [1, 2, 3, 4, 5, 6]) if (Object.keys(growFloor(s, { count: 9 }).histogram).length >= 2) variedSeeds++;
ok(variedSeeds >= 3, 'most floors grow more than one ward (biome variety)');

// ── each floor chunk is civically scorable (the readout works per ward) ──
const c0 = floor.world.chunks[0];
const sc = scoreChunk(c0.rooms, 900, 600, 7);
ok(Number.isInteger(sc.vital.vitality) && sc.vital.vitality >= 0 && sc.vital.vitality <= 100, 'a floor chunk scores a vitality');

console.log(`floor.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
