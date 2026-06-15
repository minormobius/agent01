// halls.selftest.mjs — the halls-first layout + two-tier nav contract (the hoop v5 prototype).
// Run: node hoop/test/halls.selftest.mjs
import { genLayout, roomAt, genChunk, genRegion, edgePorts } from '../halls/gen.js';
import { route, buildNavGraph } from '../halls/nav.js';
import { buildSceneCustom } from '../paint/voronoi.js';
import { mulberry32 } from '../halls/gen.js';
import { assignOwners, roomGroups, placeRoomLights, growRoomConsole, roomComponent } from '../halls/fixtures.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓' : '✗') + ' ' + m); };

const OPT = { W: 2200, H: 1300, seed: 7 };
const L = genLayout(OPT);

// 1. determinism
const L2 = genLayout(OPT);
ok(JSON.stringify(L.rooms) === JSON.stringify(L2.rooms) && JSON.stringify(L.edges) === JSON.stringify(L2.edges), `deterministic (${L.rooms.length} rooms, ${L.nodes.length} hall nodes)`);

// 2. enough rooms, reasonable spread
ok(L.rooms.length >= 9, `generates a chunk's worth of rooms (${L.rooms.length})`);

// 3. the hall graph is CONNECTED (every corridor node reachable from node 0)
(() => {
  const adj = L.nodes.map(() => []); for (const [u, v] of L.edges) { adj[u].push(v); adj[v].push(u); }
  const seen = new Uint8Array(L.nodes.length), q = [0]; seen[0] = 1; let n = 1;
  for (let h = 0; h < q.length; h++) for (const w of adj[q[h]]) if (!seen[w]) { seen[w] = 1; n++; q.push(w); }
  ok(n === L.nodes.length, `hall network is fully connected (${n}/${L.nodes.length})`);
})();

// 4. every room has a door node that is a real hall node
(() => {
  let good = 0;
  for (const r of L.rooms) if (r.doorHall >= 0 && r.doorHall < L.nodes.length && r.doorPt) good++;
  ok(good === L.rooms.length, `every room has a door onto the halls (${good}/${L.rooms.length})`);
})();

// 5. room discs don't overlap each other
(() => {
  let bad = 0;
  for (let i = 0; i < L.rooms.length; i++) for (let j = i + 1; j < L.rooms.length; j++) {
    const a = L.rooms[i], b = L.rooms[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius) bad++;
  }
  ok(bad === 0, `no room-room overlaps (${bad} found)`);
})();

// 6. corridors don't run THROUGH rooms (a hall segment's midpoint never sits inside a room)
(() => {
  let bad = 0;
  for (const [u, v] of L.edges) {
    const mx = (L.nodes[u].x + L.nodes[v].x) / 2, my = (L.nodes[u].y + L.nodes[v].y) / 2;
    if (roomAt(L, mx, my)) bad++;
  }
  ok(bad === 0, `halls don't pass through rooms (${bad} segments inside a room)`);
})();

// 7. NAV: route between many room pairs — exists, is short (few hops), and never cuts through a THIRD room
(() => {
  buildNavGraph(L);
  let tested = 0, maxHops = 0, cutThrough = 0, noPath = 0;
  const rs = L.rooms;
  const sample = (i) => ({ x: rs[i].x + rs[i].radius * 0.3, y: rs[i].y - rs[i].radius * 0.3 });   // an off-centre point in the room
  for (let i = 0; i < rs.length; i += 3) for (let j = i + 1; j < rs.length; j += 5) {
    const a = sample(i), b = sample(j), r = route(L, a, b);
    tested++;
    if (!r) { noPath++; continue; }
    maxHops = Math.max(maxHops, r.hops);
    // sample the polyline; no sample may lie inside a room that isn't i or j
    for (let s = 1; s < r.pts.length; s++) {
      const A = r.pts[s - 1], B = r.pts[s], steps = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 40));
      for (let k = 0; k <= steps; k++) {
        const x = A[0] + (B[0] - A[0]) * k / steps, y = A[1] + (B[1] - A[1]) * k / steps, hit = roomAt(L, x, y);
        if (hit && hit.id !== i && hit.id !== j) { cutThrough++; s = r.pts.length; break; }
      }
    }
  }
  ok(noPath === 0, `every room pair is routable (${tested} pairs, ${noPath} unreachable)`);
  ok(cutThrough === 0, `routes never cut through an unrelated room (${cutThrough} violations)`);
  ok(maxHops <= 26, `routes are short — max ${maxHops} hall waypoints across the whole network`);
})();

// 8. ORGANIC ROOMS (the seeding-order proposal): fine cells assigned to rooms BEFORE the voronoi, then
//    each room furnished as a GROUP — proper walls, multi-cell rooms, lights + console + component.
(() => {
  const roomSize = 1, cellsPerRoom = 14;
  const Lo = genLayout({ W: 2600, H: 1500, seed: 7, roomSize });
  // unit derived from room size & cells/room (a room disc of area πr² holds ~cells cells)
  const avgR = Lo.rooms.reduce((s, r) => s + r.radius, 0) / Lo.rooms.length;
  const unit = Math.max(26, avgR * Math.sqrt(Math.PI / cellsPerRoom));
  const { seeds, owner, edgeKind } = assignOwners(Lo, { unit, hallWidth: 30 });
  const scene = buildSceneCustom({ W: Lo.W, H: Lo.H, wallSpacing: Math.max(9, unit * 0.34), roomSpacing: unit * 2.6, seeds, edgeKind, seed: Lo.seed >>> 0 });
  const groups = roomGroups(scene, owner);
  ok(groups.size >= Lo.rooms.length - 1, `most rooms claim cells (${groups.size}/${Lo.rooms.length} groups)`);
  let multi = 0, lit = 0, cons = 0, comp = 0;
  for (const g of groups.values()) {
    if (g.cells.length >= 3) multi++;
    const lights = placeRoomLights(scene, g, mulberry32(g.id * 131 + 1), 4); if (lights.length >= 2) lit++;
    const C = growRoomConsole(scene, owner, g, mulberry32(g.id * 977 + 3), { kind: 'shelf' }); if (C) cons++;
    const cp = roomComponent(scene, g, [], mulberry32(g.id * 733 + 5), unit * 1.6); if (cp) comp++;
  }
  ok(multi >= groups.size * 0.7, `rooms are MULTI-CELL / organic (${multi}/${groups.size} have ≥3 cells)`);
  ok(lit >= groups.size * 0.8, `rooms get wall lights (${lit}/${groups.size})`);
  ok(cons >= groups.size * 0.5, `rooms grow a tile-console (${cons}/${groups.size})`);
  ok(comp >= groups.size * 0.8, `rooms get a central component (${comp}/${groups.size})`);
})();

// 9. CHUNKING / TILING — the seam contract: a chunk's east-edge ports equal the east-neighbour's
//    west-edge ports (shared by construction); rooms never straddle a seam; the stitched hall graph is
//    connected across chunks and routable end-to-end.
(() => {
  const CW = 1900, CH = 1350, seed = 7;
  // ports on the shared vertical edge between (0,0) and (1,0): chunk A east == chunk B west
  const aEast = edgePorts(seed, 'V', 1, 0, CW, CH), bWest = edgePorts(seed, 'V', 1, 0, CW, CH);
  ok(JSON.stringify(aEast) === JSON.stringify(bWest), `shared seam ports are identical from both sides (${aEast.length} ports)`);
  const A = genChunk({ seed, cx: 0, cy: 0, CW, CH }), B = genChunk({ seed, cx: 1, cy: 0, CW, CH });
  const aE = A.portNodes.E.map((i) => A.nodes[i]), bW = B.portNodes.W.map((i) => B.nodes[i]);
  const match = aE.every((p) => bW.some((q) => Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1));
  ok(aE.length === bW.length && match, `chunk A east ports meet chunk B west ports (${aE.length})`);

  // rooms strictly inside their chunk rect (no straddle)
  let straddle = 0;
  for (const ch of [A, B]) for (const r of ch.rooms) if (r.x - r.radius < ch.ox || r.y - r.radius < ch.oy || r.x + r.radius > ch.ox + CW || r.y + r.radius > ch.oy + CH) straddle++;
  ok(straddle === 0, `rooms never straddle a chunk seam (${straddle} violations)`);

  // a stitched 3×1 strip: hall graph connected across all 3 chunks, and a room in chunk 0 routes to a room in chunk 2
  const R = genRegion({ seed, cols: 3, rows: 1, CW, CH });
  const adj = R.nodes.map(() => []); for (const [u, v] of R.edges) { adj[u].push(v); adj[v].push(u); }
  const seen = new Uint8Array(R.nodes.length), q = [0]; seen[0] = 1; let n = 1;
  for (let h = 0; h < q.length; h++) for (const w of adj[q[h]]) if (!seen[w]) { seen[w] = 1; n++; q.push(w); }
  ok(n === R.nodes.length, `stitched 3-chunk hall graph is fully connected (${n}/${R.nodes.length})`);
  buildNavGraph(R);
  const left = R.rooms.find((r) => r.x < CW), right = R.rooms.find((r) => r.x > 2 * CW);
  const rt = (left && right) ? route(R, { x: left.x, y: left.y }, { x: right.x, y: right.y }) : null;
  ok(rt && rt.pts.length > 2, `routes ACROSS chunks (chunk 0 → chunk 2: ${rt ? rt.pts.length + ' waypoints' : 'NO PATH'})`);
})();

console.log(`\nhalls.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
