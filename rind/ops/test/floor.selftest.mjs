// floor.selftest.mjs — prove the demo floor: the vendored v100 foam engine grows valid room-and-
// concourse districts, a 7-chunk honeycomb assembles, the cross-chunk walk graph is CONNECTED (you
// can walk from any district to any other through the seam doors), and the 7-flower has 6 nexus
// corners. Mirrors floor-app.js's genWorld/bake so the page's contract is pinned offline.
import { solveChunk } from '../v100/chunkgen.js';
import { createWorld, addChunk, neighbourSpec, edgeFree, buildWalk } from '../v100/manager.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const W = 900, H = 600, CELL = 16, ROOM = 16, seed = 7;
const centroidOf = (poly) => { let x = 0, y = 0; for (const v of poly) { x += v.x; y += v.y; } return [x / poly.length, y / poly.length]; };
const ckey = (c) => `${Math.round(c[0] / 8)},${Math.round(c[1] / 8)}`;

// ── a single district ──
const c0 = solveChunk({ seed, foamSeed: seed, v2: true, shape: 'hex', W, H, cellSize: CELL, roomSize: ROOM, concourseWidth: 2 });
ok(c0.cells.length > 200, `centre district has cells (${c0.cells.length})`);
ok(c0.rooms.length > 10, `centre district has rooms (${c0.rooms.length})`);
ok(c0.poly.length === 6, `district is a hexagon (${c0.poly.length} sides)`);
ok(c0.ports.length === 6, `hexagon has one port per edge (${c0.ports.length})`);
ok(c0.served === 1, 'every room is served by the concourse');
ok(c0.rooms.every((r) => r.role && r.glyph), 'every room has a role + glyph');
{ let road = 0; for (let i = 0; i < c0.road.length; i++) if (c0.road[i]) road++; ok(road > 0, `concourse exists (${road} road cells)`); }
// every room has a door onto the concourse
ok(c0.rooms.every((r) => r.door >= 0 && r.doorRoad >= 0), 'every room has a door onto the concourse');

// ── the 7-flower ──
function genWorld() {
  const w = createWorld();
  const a0 = solveChunk({ seed, foamSeed: seed, v2: true, shape: 'hex', W, H, cellSize: CELL, roomSize: ROOM, concourseWidth: 2 });
  addChunk(w, a0);
  const seen = new Set([ckey(centroidOf(a0.poly))]);
  for (let e = 0; e < a0.poly.length; e++) {
    if (!edgeFree(w, a0, e)) continue;
    const spec = neighbourSpec(w, 0, e), k = ckey(centroidOf(spec.poly));
    if (seen.has(k)) continue; seen.add(k);
    const rec = solveChunk({ seed: (seed * 131 + w.chunks.length * 17) >>> 0, foamSeed: seed, v2: true, poly: spec.poly, inherit: spec.inherit, W, H, cellSize: CELL, roomSize: ROOM, concourseWidth: 2 });
    addChunk(w, rec);
  }
  return w;
}
const world = genWorld();
ok(world.chunks.length === 7, `7-flower assembles (${world.chunks.length} chunks)`);

const walk = buildWalk(world);
ok(walk.N > 3000, `walk graph has nodes (${walk.N})`);

// CONNECTED: BFS from a centre road cell reaches every chunk (crossing seam doors)
let start = 0; for (let i = 0; i < world.chunks[0].cells.length; i++) if (world.chunks[0].road[i]) { start = walk.base[0] + i; break; }
const seenN = new Uint8Array(walk.N); const q = [start]; seenN[start] = 1; let h = 0, reached = 0;
while (h < q.length) { const u = q[h++]; reached++; for (const v of walk.adj[u]) if (!seenN[v]) { seenN[v] = 1; q.push(v); } }
const chunksReached = new Set(); for (let i = 0; i < walk.N; i++) if (seenN[i]) chunksReached.add(walk.nodeChunk[i]);
ok(chunksReached.size === 7, `walk graph reaches all 7 districts from one start (${chunksReached.size})`);
ok(reached > walk.N * 0.9, `walk graph is one connected floor (${(reached / walk.N * 100).toFixed(0)}% reachable)`);

// cross-chunk seam links exist (districts abut at ports)
let cross = 0; for (let i = 0; i < walk.N; i++) for (const j of walk.adj[i]) if (walk.nodeChunk[i] !== walk.nodeChunk[j]) cross++;
ok(cross >= 12, `seam doors link districts (${cross / 2} crossings)`);

// nexus corners: hexagon vertices shared by ≥3 chunks — the 7-flower has 6
const bucket = new Map();
for (const ch of world.chunks) for (const v of ch.poly) { const key = `${Math.round(v.x / 5)},${Math.round(v.y / 5)}`; const b = bucket.get(key) || 0; bucket.set(key, b + 1); }
const nexus = [...bucket.values()].filter((n) => n >= 3).length;
ok(nexus === 6, `7-flower has 6 nexus corners (three-chunk meets) (${nexus})`);

// determinism
const d1 = solveChunk({ seed: 3, foamSeed: 3, v2: true, shape: 'hex', W, H, cellSize: CELL, roomSize: ROOM });
const d2 = solveChunk({ seed: 3, foamSeed: 3, v2: true, shape: 'hex', W, H, cellSize: CELL, roomSize: ROOM });
ok(d1.cells.length === d2.cells.length && d1.rooms.length === d2.rooms.length, 'solveChunk is deterministic');

console.log(`\n  floor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
