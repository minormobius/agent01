// roomsfirst.selftest.mjs — the v2 chunk solver against the buildWalk record contract.
//   node hoop/v099/test/roomsfirst.selftest.mjs
import { solveChunk } from '../v8/chunkgen.js';
import { ROLES } from '../econ/econ.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const FOOT = { dwell: 0.7, govern: 1.8, worship: 1.6, serve: 1.5, learn: 1.5, play: 1.6, make: 1.25, trade: 1.4, mend: 1, grow: 1.1, heal: 1.3, store: 0.7, move: 0.8 };
const FLOORS = Object.fromEntries(Object.keys(ROLES).map((r) => [r, 1]));   // at least one of each building type

// rebuild the walk graph EXACTLY as manager.buildWalk does (the contract the game runs on).
function walkAdj(ch) {
  const N = ch.cells.length, adj = Array.from({ length: N }, () => []);
  const mem = (i) => ch.road[i] ? 'R' : 'r' + ch.roomOf[i];
  for (let i = 0; i < N; i++) for (const j of ch.adj[i]) { if (j <= i) continue; const a = mem(i), b = mem(j); if ((a === 'R' && b === 'R') || a === b) { adj[i].push(j); adj[j].push(i); } }
  for (const r of ch.rooms) { const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []); for (const [a, b] of dp) { adj[a].push(b); adj[b].push(a); } }
  return adj;
}
function reachFrom(adj, src, N) { const seen = new Uint8Array(N); const q = [src]; seen[src] = 1; for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (!seen[v]) { seen[v] = 1; q.push(v); } return seen; }

const ch = solveChunk({ v2: true, seed: 4, W: 1125, H: 750, roomSize: 14, footprint: FOOT, grand: ['serve', 'learn', 'play'], roleFloors: FLOORS, tension: 0.5 });

ok(ch.rooms.length > 10 && ch.cells.length > 0, 'v2 chunk produced rooms + cells');
ok(ch.rooms.every((r) => r.role && r.glyph && r.cells.length > 0), 'every v2 room has a role + glyph + cells (castCharacter ran)');

// 1) every room is ONE connected component over same-room adjacency
let connected = true;
for (const r of ch.rooms) {
  const inR = new Set(r.cells), seen = new Set([r.cells[0]]), q = [r.cells[0]];
  for (let h = 0; h < q.length; h++) for (const v of ch.adj[q[h]]) if (inR.has(v) && !seen.has(v)) { seen.add(v); q.push(v); }
  if (seen.size !== r.cells.length) { connected = false; break; }
}
ok(connected, 'every room is a single connected component');

// 2) every room has a door pair linking a room cell to a ROAD cell
ok(ch.rooms.every((r) => { const dp = r.doorPairs && r.doorPairs.length ? r.doorPairs : (r.door >= 0 && r.doorRoad >= 0 ? [[r.door, r.doorRoad]] : []); return dp.length && dp.every(([a, b]) => ch.roomOf[a] >= 0 && ch.road[b]); }), 'every room has a door pair (room cell ↔ road cell)');

// 3) the road is one connected component
const roadCells = []; for (let i = 0; i < ch.road.length; i++) if (ch.road[i]) roadCells.push(i);
ok(roadCells.length > 0, 'the chunk has a concourse');
const rseen = new Set([roadCells[0]]), rq = [roadCells[0]];
for (let h = 0; h < rq.length; h++) for (const v of ch.adj[rq[h]]) if (ch.road[v] && !rseen.has(v)) { rseen.add(v); rq.push(v); }
ok(rseen.size === roadCells.length, 'the concourse is a single connected component');

// 4) ports are on the road
ok(ch.ports.every((p) => p.cell == null || p.cell < 0 || ch.road[p.cell]), 'every port cell is on the concourse');

// 5) THE contract: from a port, the walk graph reaches EVERY room and EVERY road cell (oxygen to rooms)
const adj = walkAdj(ch), startPort = ch.ports.find((p) => p.cell >= 0 && ch.road[p.cell]);
const start = startPort ? startPort.cell : roadCells[0];
const seen = reachFrom(adj, start, ch.cells.length);
const unreachedRooms = ch.rooms.filter((r) => !r.cells.some((c) => seen[c])).length;
ok(unreachedRooms === 0, `every room is reachable from a port through its door (${unreachedRooms} unreached)`);
ok(roadCells.every((c) => seen[c]), 'every road cell is reachable from the port');

// 6) RIM BOUNDARY: the perimeter is rooms, not concourse — except at the ports.
const portSet = new Set(ch.ports.map((p) => p.cell).filter((c) => c >= 0));
let perim = 0, perimRoom = 0, perimRoadNonPort = 0;
for (let i = 0; i < ch.cells.length; i++) { if (!ch.cells[i].poly.some((v) => v[2] === -1)) continue; perim++; if (ch.road[i]) { if (!portSet.has(i)) perimRoadNonPort++; } else if (ch.roomOf[i] >= 0) perimRoom++; }
ok(perim > 0 && perimRoom / perim > 0.8, `the perimeter is mostly rooms (${perimRoom}/${perim})`);
ok(perimRoadNonPort <= Math.max(6, portSet.size), `the concourse only reaches the edge at ports (${perimRoadNonPort} stray edge-road cells)`);

// 6b) CONCOURSE WIDTH: the 2-wide minimum reads as a ribbon, not a hairline.
const degOf = (c) => { let road = 0, deg = 0; for (let i = 0; i < c.road.length; i++) if (c.road[i]) { road++; deg += c.adj[i].filter((j) => c.road[j]).length; } return road ? deg / road : 0; };
const wide2 = solveChunk({ v2: true, seed: 4, W: 1125, H: 750, roomSize: 14, footprint: FOOT, grand: ['serve', 'learn', 'play'], roleFloors: FLOORS, concourseWidth: 2 });
const wide1 = solveChunk({ v2: true, seed: 4, W: 1125, H: 750, roomSize: 14, footprint: FOOT, grand: ['serve', 'learn', 'play'], roleFloors: FLOORS, concourseWidth: 1 });
ok(degOf(wide2) > degOf(wide1) + 0.8, `concourseWidth 2 is wider than 1 (${degOf(wide2).toFixed(1)} > ${degOf(wide1).toFixed(1)} road-neighbours)`);

// 7) ROLE FLOORS: at least one of each building type
const present = new Set(ch.rooms.map((r) => r.role));
const missing = Object.keys(ROLES).filter((r) => !present.has(r));
ok(missing.length === 0, `at least one of each building type (missing: ${missing.join(',') || 'none'})`);

// 7) determinism + v1 untouched
const ch2 = solveChunk({ v2: true, seed: 4, W: 1125, H: 750, roomSize: 14, footprint: FOOT, grand: ['serve', 'learn', 'play'], roleFloors: FLOORS, tension: 0.5 });
ok(JSON.stringify(ch.rooms.map((r) => [r.role, r.cells.length])) === JSON.stringify(ch2.rooms.map((r) => [r.role, r.cells.length])), 'v2 is deterministic');
const v1 = solveChunk({ seed: 4 }), v1b = solveChunk({ seed: 4 });
ok(JSON.stringify(v1.rooms.map((r) => r.cells.length)) === JSON.stringify(v1b.rooms.map((r) => r.cells.length)), 'v1 (no v2 flag) still works + deterministic');

console.log(`roomsfirst.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
