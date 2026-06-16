// v091fixtures.selftest.mjs — item #4: voronoi-GROWN wall fixtures. The "second flavour" of fixture
// (from /sprite/fixture): instead of a medallion seated on the floor, a fixture CLAIMS a cluster of a
// room's own voronoi tiles at a wall and erupts them. Pins that paintChunk grows them, that they are
// made of REAL claimed cells of the right room, carry a base (wall) + eruption + a coherent tile graph,
// sit in world coordinates, and are deterministic.
// Run: node hoop/test/v091fixtures.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec } from '../v8/manager.js';
import { paintChunk } from '../v091/skin.js';
import { TRAFFIC_FOOTPRINT, GRAND_ROLES, GRAND_MIN, MIN_ROOM } from '../v091/rooms.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

const rec = solveChunk({ seed: 7, shape: 'hex', roomSize: 16, footprint: TRAFFIC_FOOTPRINT, grand: GRAND_ROLES, grandMin: GRAND_MIN, minRoom: MIN_ROOM }); rec.seed = 7;
const P = paintChunk(rec);

// 1. fixtures grow, one-ish per furnished room, each grabbing real cells of its room
ok(Array.isArray(P.fixtures) && P.fixtures.length > 0, `paintChunk grows voronoi wall fixtures (${P.fixtures && P.fixtures.length})`);
ok(P.fixtures.length <= rec.rooms.length, `at most one per room (${P.fixtures.length} ≤ ${rec.rooms.length} rooms)`);
ok(P.fixtures.every((F) => F.cells.length >= 2 && Number.isInteger(F.room) && F.room >= 0), 'each fixture binds a real room and claims ≥2 tiles');
ok(P.fixtures.every((F) => F.cells.every((cl) => cl.idx >= 0 && cl.idx < P.paintCells.length)), 'every claimed tile indexes a real paint cell');

// 2. it is GROWN FROM THE TILING: a base continuous with the wall + a room-side eruption + a tile graph
ok(P.fixtures.every((F) => F.cells.some((cl) => cl.base)), 'each fixture has wall-base tiles (continuous with the membrane)');
ok(P.fixtures.every((F) => F.cells.some((cl) => !cl.base)), 'each fixture has a room-side eruption (the asset half)');
ok(P.fixtures.every((F) => Array.isArray(F.dist) && Array.isArray(F.parent) && F.maxDist >= 1), 'each fixture carries the coherent tile spanning-tree (dist/parent/maxDist)');
ok(P.fixtures.every((F) => typeof F.hue === 'number' && typeof F.accent === 'string' && F.tip), 'each fixture carries a hue/accent + an emissive tip');

// 3. world coordinates (so the page draws the tip where the tiles are) + sane geometry
const inRegion = (x, y) => x > rec.region.x0 - 60 && x < rec.region.x1 + 60 && y > rec.region.y0 - 60 && y < rec.region.y1 + 60;
ok(P.fixtures.every((F) => inRegion(F.tip.x, F.tip.y) && inRegion(F.anchor.x, F.anchor.y)), 'fixture tip + anchor are in world coordinates');

// 4. determinism
const Q = paintChunk(rec);
ok(Q.fixtures.length === P.fixtures.length && Q.fixtures.every((F, i) => F.room === P.fixtures[i].room && F.cells.length === P.fixtures[i].cells.length), 'fixtures are deterministic from the seed');

// 5. a streamed neighbour grows them too
const world = createWorld(); addChunk(world, rec);
const spec = neighbourSpec(world, 0, 0);
const nb = solveChunk({ seed: 31, poly: spec.poly, inherit: spec.inherit, roomSize: 16, footprint: TRAFFIC_FOOTPRINT, grand: GRAND_ROLES, grandMin: GRAND_MIN, minRoom: MIN_ROOM }); nb.seed = 31;
ok(paintChunk(nb).fixtures.length > 0, 'a streamed neighbour grows voronoi fixtures too');

console.log(`\nv091 fixtures: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
