// v091fixtures.selftest.mjs — item #4: voronoi-GROWN wall fixtures. The "second flavour" of fixture
// (from /sprite/fixture): instead of a medallion seated on the floor, a fixture CLAIMS a cluster of a
// room's own voronoi tiles at a wall and erupts them. Pins that paintChunk grows them, that they are
// made of REAL claimed cells of the right room, carry a base (wall) + eruption + a coherent tile graph,
// sit in world coordinates, and are deterministic.
// Run: node hoop/test/v091fixtures.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec, buildWalk, pathFind, nearestNode } from '../v8/manager.js';
import { paintChunk } from '../v091/skin.js';
import { TRAFFIC_FOOTPRINT, GRAND_ROLES, GRAND_MIN, MIN_ROOM, MAX_FIXTURE_AREA } from '../v091/rooms.js';

const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };

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

// 3b. AREA CAP — the eruption never exceeds ~MAX_FIXTURE_AREA of its room's floor area (+ one boundary
// cell of slack, since growth stops just after crossing the budget). No more greedy consoles.
ok(P.fixtures.every((F) => F.cells.filter((c) => !c.base).length >= 1), 'every fixture keeps at least one erupted tile');
ok(P.fixtures.every((F) => F.roomArea > 0 && F.claimArea / F.roomArea <= MAX_FIXTURE_AREA + 0.15), `fixtures stay within ~${(MAX_FIXTURE_AREA * 100) | 0}% of room area (worst ${Math.max(...P.fixtures.map((F) => F.claimArea / F.roomArea)).toFixed(2)})`);
// the claimed eruption also matches the claimed cells' actual polygon area (sanity on the report)
ok(P.fixtures.every((F) => { const a = F.cells.filter((c) => !c.base).reduce((s, c) => s + polyArea(P.paintCells[c.idx].poly), 0); return Math.abs(a - F.claimArea) < a * 0.05 + 1; }), 'reported claimArea matches the claimed tiles');

// 4. determinism
const Q = paintChunk(rec);
ok(Q.fixtures.length === P.fixtures.length && Q.fixtures.every((F, i) => F.room === P.fixtures[i].room && F.cells.length === P.fixtures[i].cells.length), 'fixtures are deterministic from the seed');

// 5. a streamed neighbour grows them too
const world = createWorld(); rec.painted = P; addChunk(world, rec);
const spec = neighbourSpec(world, 0, 0);
const nb = solveChunk({ seed: 31, poly: spec.poly, inherit: spec.inherit, roomSize: 16, footprint: TRAFFIC_FOOTPRINT, grand: GRAND_ROLES, grandMin: GRAND_MIN, minRoom: MIN_ROOM }); nb.seed = 31;
nb.painted = paintChunk(nb); addChunk(world, nb);
ok(nb.painted.fixtures.length > 0, 'a streamed neighbour grows voronoi fixtures too');

// 6. the central component BIASES AWAY from the floor fixture — they don't crowd. For each room with
// both, the component centre is well clear of the fixture's claimed tiles.
let bothRooms = 0, clear = 0;
for (const cp of P.comps) {
  const F = P.fixtures.find((f) => f.room === cp.room); if (!F) continue; bothRooms++;
  let md = Infinity; for (const cl of F.cells) { if (cl.base) continue; const c = P.paintCells[cl.idx]; if (c) md = Math.min(md, Math.hypot(c.x - cp.cx, c.y - cp.cy)); }
  if (md > P.roomSpacing * 0.6) clear++;
}
ok(bothRooms > 5, `sampled ${bothRooms} rooms with both a component + a fixture`);
ok(clear >= bothRooms * 0.85, `the component sits clear of the floor fixture in ${clear}/${bothRooms} rooms`);

// 7. IMPASSABLE — the bones cells under fixtures + components are blocked for MOVEMENT, but edges stay
// intact (so sight/fog still reveal them), and never block a door or the concourse.
const blockedOf = (chunkId, local) => {
  const ch = world.chunks[chunkId], Pn = ch.painted, bones = ch.cells; if (!Pn) return false;
  const set = (ch._blk = ch._blk || (() => {
    const s = new Set(), doorSet = new Set(); for (const r of ch.rooms) { if (r.door >= 0) doorSet.add(r.door); if (r.doorRoad >= 0) doorSet.add(r.doorRoad); }
    const pts = []; for (const F of (Pn.fixtures || [])) for (const cl of F.cells) { if (cl.base) continue; const c = Pn.paintCells[cl.idx]; if (c) pts.push(c); } for (const cp of (Pn.comps || [])) pts.push({ x: cp.cx, y: cp.cy });
    const thr2 = ((ch.cellSize || 16) * 0.55) ** 2;
    for (let i = 0; i < bones.length; i++) { if (doorSet.has(i) || ch.road[i]) continue; const bx = bones[i].x, by = bones[i].y; for (const p of pts) if ((p.x - bx) ** 2 + (p.y - by) ** 2 < thr2) { s.add(i); break; } }
    return s;
  })());
  return set.has(local);
};
const walk = buildWalk(world, blockedOf);
ok(walk.blocked && walk.blocked.size > 0, `there are impassable fixture tiles (${walk.blocked.size})`);
ok([...walk.blocked].every((g) => { const ch = world.chunks[walk.nodeChunk[g]], li = walk.nodeLocal[g]; return !ch.road[li]; }), 'no concourse cell is ever blocked');
ok([...walk.blocked].every((g) => walk.adj[g].length > 0), 'blocked tiles keep their graph edges (sight/fog still reveal them)');
// pathFind routes AROUND blocked tiles
const freeNodes = []; for (let i = 0; i < walk.N && freeNodes.length < 2; i++) if (!walk.blocked.has(i) && walk.adj[i].length) freeNodes.push(i);
const pth = pathFind(walk, freeNodes[0], freeNodes[1]);
ok(!pth || pth.every((g) => !walk.blocked.has(g)), 'a path never traverses an impassable tile');
// nearestNode(avoidBlocked) never returns a blocked tile, even when asked at a fixture tip
const someF = P.fixtures[0];
ok(!walk.blocked.has(nearestNode(walk, someF.tip.x, someF.tip.y, true)), 'targeting a fixture routes to the nearest navigable tile, not onto it');

console.log(`\nv091 fixtures: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
