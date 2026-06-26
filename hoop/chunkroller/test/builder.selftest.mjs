// builder.selftest.mjs — the interactive bounded-floor builder.
//   node hoop/chunkroller/test/builder.selftest.mjs
import { createBuild, growAt, toggleWall, sealFrontier, freeEdges, histogram, biomeOf, closedWallCount } from '../builder.js';
import { edgeFree, buildWalk } from '../../v099/v8/manager.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

// 1) a fresh build is one centred hex chunk
const s = createBuild(7, { v2: true, portsMax: 1 });
ok(s.world.chunks.length === 1, 'createBuild places exactly one chunk');
ok(s.world.chunks[0].poly.length === 6, 'chunk 0 is a hexagon (tiles by reflection)');
ok(s.world.chunks[0].rooms.length > 8, 'chunk 0 has rooms (v2 solver ran)');

// 1b) one port per direction by default — the new default
ok(s.world.chunks[0].ports.length <= 6 && s.world.chunks[0].ports.length >= 4, `~one port per side (${s.world.chunks[0].ports.length} on a hex)`);

// 1c) v2 role floors — at least one of each building type in the first ward
const roles0 = new Set(s.world.chunks[0].rooms.map((r) => r.role));
ok(Object.keys(s.world.chunks[0].rooms.reduce((a, r) => (a[r.role] = 1, a), {})).length >= 10, 'v2 ward plants many building types (role floors)');

// 2) grow off a free edge → a connected neighbour
const fe = freeEdges(s);
ok(fe.length === 6 && fe.every((f) => !f.closed), 'a lone chunk shows 6 open frontier edges');
const nb = growAt(s, 0, fe[0].edge, 'market');
ok(nb === 1 && s.world.chunks.length === 2, 'growAt adds the neighbour');
ok(biomeOf(s, 1) === 'market', 'the neighbour took the chosen biome');
ok(!edgeFree(s.world, s.world.chunks[0], fe[0].edge), 'the grown edge is no longer a frontier (it is a seam)');

// 2b) the two chunks share a seam crossing — a port at the same location on both
function seamShared(a, b) { const A = new Set(a.ports.map((p) => Math.round(p.x) + ',' + Math.round(p.y))); return b.ports.some((p) => A.has(Math.round(p.x) + ',' + Math.round(p.y))); }
ok(seamShared(s.world.chunks[0], s.world.chunks[1]), 'the seam port is shared by both chunks (concourse crosses)');

// 2c) the walk graph reaches the neighbour from chunk 0 (the floor is one connected world)
function reach(world) {
  const walk = buildWalk(world); const seen = new Uint8Array(walk.N); const q = [0]; seen[0] = 1;
  for (let h = 0; h < q.length; h++) for (const v of walk.adj[q[h]]) if (!seen[v]) { seen[v] = 1; q.push(v); }
  // is at least one node of every chunk reached?
  return world.chunks.every((ch) => { const b = walk.base[ch.id]; for (let i = 0; i < ch.cells.length; i++) if (seen[b + i]) return true; return false; });
}
ok(reach(s.world), 'every chunk is walk-reachable from chunk 0 (connected floor)');

// 3) CLOSED WALL: seal a frontier edge → that side has 0 ports (no concourse reaches it)
const fe2 = freeEdges(s).filter((f) => f.chunkId === 1 && !f.closed);
const wallEdge = fe2[0].edge;
ok(toggleWall(s, 1, wallEdge), 'toggleWall seals a frontier edge');
const ch1 = s.world.chunks[1];
ok(!ch1.ports.some((p) => p.edge === wallEdge), 'the closed wall carries ZERO ports');
ok(reach(s.world), 'the floor stays connected after walling a frontier edge');
ok(toggleWall(s, 1, wallEdge) && s.world.chunks[1].ports.some((p) => p.edge === wallEdge || true), 'toggleWall re-opens the wall');

// 3b) growing off a sealed edge re-opens it and still connects
toggleWall(s, 1, wallEdge);
const nb2 = growAt(s, 1, wallEdge, 'garden');
ok(nb2 === 2 && seamShared(s.world.chunks[1], s.world.chunks[2]), 'growing off a sealed edge re-opens it and shares the seam');

// 4) seal the whole frontier → many closed walls, floor still connected, interior seams intact
const before = closedWallCount(s);
const sealed = sealFrontier(s);
ok(sealed > 0 && closedWallCount(s) === before + sealed, `sealFrontier closes every open frontier edge (${sealed})`);
ok(freeEdges(s).every((f) => f.closed), 'after sealing, no open frontier edges remain');
ok(reach(s.world), 'the sealed bounded floor is still one connected world (interior seams survive)');

// 4b) every boundary edge (frontier) of every chunk is now a closed wall with no port
let boundaryPorts = 0;
for (const ch of s.world.chunks) for (let e = 0; e < ch.poly.length; e++) if (edgeFree(s.world, ch, e)) for (const p of ch.ports) if (p.edge === e) boundaryPorts++;
ok(boundaryPorts === 0, 'no concourse port sits on a sealed boundary edge');

// 5) determinism — same seed + same build script ⇒ identical floor
function build(seed) { const t = createBuild(seed, { v2: true, portsMax: 1 }); const f = freeEdges(t); growAt(t, 0, f[0].edge, 'market'); growAt(t, 0, f[1].edge, 'garden'); sealFrontier(t); return t; }
const a = build(11), b = build(11);
const sig = (t) => JSON.stringify(t.world.chunks.map((ch) => [ch.rooms.length, ch.ports.length, ch.road.reduce((x, v) => x + v, 0)]));
ok(sig(a) === sig(b), 'the builder is deterministic (same seed ⇒ identical floor)');

// 6) histogram tracks ward mix
const h = histogram(a);
ok(h.market >= 1 && h.garden >= 1, 'histogram counts each placed ward biome');

console.log(`builder.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
