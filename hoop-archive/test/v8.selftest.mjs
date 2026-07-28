// v8.selftest.mjs — milestone 1: the generation boundary + the cross-chunk walk graph.
// Run: node hoop/test/v8.selftest.mjs
import { buildFoam, reflectPolyAcrossEdge } from '../v7/foam.js';
import { solveChunk } from '../v8/chunkgen.js';
import { createWorld, addChunk, neighbourSpec, buildWalk, pathFind, globalOf, sightBall } from '../v8/manager.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

// 1. solveChunk → a clean serializable record (hex default), deterministic
const A = solveChunk({ seed: 7, shape: 'hex' });
ok(A.shape === 'hex' && A.poly.length === 6, 'chunk #0 is a hex');
ok(A.cells.length > 500 && A.cells.every((c) => c.poly.length >= 3 && typeof c.gid === 'string'), `record has cells with polys + gids (${A.cells.length})`);
ok(A.road.length === A.cells.length && A.roomOf.length === A.cells.length, 'road/roomOf are per-cell typed arrays');
ok(A.rooms.length > 6 && A.rooms.every((r) => r.door >= 0 && r.doorRoad >= 0), `${A.rooms.length} rooms, all doored`);
ok(A.rooms.every((r) => Array.isArray(r.doorPairs) && r.doorPairs.length >= 1) && A.rooms.filter((r) => r.doorPairs.length === 2).length > A.rooms.length * 0.4, 'doorways are 1–2 cells wide (most are 2)');
ok(A.served > 0.95, `well perfused (${(A.served * 100) | 0}%)`);
ok(A.ports.every((p) => p.cell >= 0 && p.cell < A.cells.length), 'every port binds a real local cell');
const A2 = solveChunk({ seed: 7, shape: 'hex' });
ok(A2.cells.length === A.cells.length && A2.road.reduce((s, v) => s + v, 0) === A.road.reduce((s, v) => s + v, 0) && A2.cells[10].gid === A.cells[10].gid, 'solveChunk is deterministic');

// adjacency in the record is symmetric and intra-chunk road is one component
let sym = true; for (let i = 0; i < A.cells.length; i++) for (const j of A.adj[i]) if (!A.adj[j].includes(i)) sym = false;
ok(sym, 'record adjacency is symmetric');

// 2. SEAMLESS LATTICE: a reflected neighbour's foam shares boundary nuclei bit-identical with A's,
//    even though each chunk is generated independently over only its own region.
const Bpoly = reflectPolyAcrossEdge(A.poly, 0);
const fa = buildFoam({ regions: [bboxOf(A.poly)], cellSize: 16, depth: 2.4, seed: 7, W: 900, H: 600 });
const fb = buildFoam({ regions: [bboxOf(Bpoly)], cellSize: 16, depth: 2.4, seed: 7, W: 900, H: 600 });
let shared = 0, identical = 0; const fbByGid = new Map(fb.cells.map((c) => [c.gid, c]));
for (const c of fa.cells) { const d = fbByGid.get(c.gid); if (!d) continue; shared++; if (Math.abs(c.x - d.x) < 1e-9 && Math.abs(c.y - d.y) < 1e-9) identical++; }
ok(shared > 20 && identical === shared, `the global lattice is seamless: ${identical}/${shared} shared boundary nuclei are bit-identical across independent generations`);

// 3. THE WORLD: place A, seed B across edge 0, both solved independently, joined at the inherited ports
function bboxOf(poly) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const v of poly) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); } return { x0, y0, x1, y1 }; }
const world = createWorld();
addChunk(world, solveChunk({ seed: 7, shape: 'hex' }));
const spec = neighbourSpec(world, 0, 0);
ok(spec.inherit.length > 0, `neighbour inherits the shared edge's ${spec.inherit.length} ports`);
addChunk(world, solveChunk({ seed: 31, poly: spec.poly, inherit: spec.inherit }));
ok(world.chunks.length === 2 && world.chunks[1].ports.some((p) => p.inherited), 'two chunks, the second has inherited ports');

// 4. CROSS-CHUNK PATHFINDING over the stitched walk graph (room in A → room in B, via a port)
const walk = buildWalk(world);
ok(walk.N === world.chunks[0].cells.length + world.chunks[1].cells.length, 'walk graph spans both chunks');
const src = globalOf(walk, 0, world.chunks[0].rooms[0].cells[0]);
const dst = globalOf(walk, 1, world.chunks[1].rooms[world.chunks[1].rooms.length - 1].cells[0]);
const path = pathFind(walk, src, dst);
ok(path && path.length > 2, `a path exists from a room in chunk 0 to a room in chunk 1 (${path ? path.length : 0} nodes)`);
ok(path && path.some((n) => walk.nodeChunk[n] === 0) && path.some((n) => walk.nodeChunk[n] === 1), 'the path actually crosses the seam (uses both chunks)');

// 5. FOG sight ball grows with range and is bounded (walls/doors gate it)
const concourse = (() => { for (let i = 0; i < walk.N; i++) { const ch = world.chunks[walk.nodeChunk[i]]; if (ch.road[walk.nodeLocal[i]]) return i; } return 0; })();
const b3 = sightBall(walk, concourse, 3).size, b9 = sightBall(walk, concourse, 9).size;
ok(b9 > b3 && b3 > 0, `sight window grows with range (3→${b3}, 9→${b9}) and is finite`);

console.log(`\nv8 milestone 1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
