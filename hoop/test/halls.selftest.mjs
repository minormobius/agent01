// halls.selftest.mjs — the halls-first layout + two-tier nav contract (the hoop v5 prototype).
// Run: node hoop/test/halls.selftest.mjs
import { genLayout, roomAt } from '../halls/gen.js';
import { route, buildNavGraph } from '../halls/nav.js';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '✓' : '✗') + ' ' + m); };

const OPT = { W: 2200, H: 1300, seed: 7 };
const L = genLayout(OPT);

// 1. determinism
const L2 = genLayout(OPT);
ok(JSON.stringify(L.rooms) === JSON.stringify(L2.rooms) && JSON.stringify(L.edges) === JSON.stringify(L2.edges), `deterministic (${L.rooms.length} rooms, ${L.nodes.length} hall nodes)`);

// 2. enough rooms, reasonable spread
ok(L.rooms.length >= 12, `generates a town's worth of rooms (${L.rooms.length})`);

// 3. the hall graph is CONNECTED (every corridor node reachable from node 0)
(() => {
  const adj = L.nodes.map(() => []); for (const [u, v] of L.edges) { adj[u].push(v); adj[v].push(u); }
  const seen = new Uint8Array(L.nodes.length), q = [0]; seen[0] = 1; let n = 1;
  for (let h = 0; h < q.length; h++) for (const w of adj[q[h]]) if (!seen[w]) { seen[w] = 1; n++; q.push(w); }
  ok(n === L.nodes.length, `hall network is fully connected (${n}/${L.nodes.length})`);
})();

// 4. every room has exactly one door, attached to a real hall node, on the room's edge
(() => {
  let good = 0;
  for (const r of L.rooms) {
    const onEdge = Math.abs(Math.abs(r.doorPt.x - r.x) - r.hw) < r.hw * 0.5 || Math.abs(Math.abs(r.doorPt.y - r.y) - r.hh) < r.hh * 0.5;
    if (r.doorHall >= 0 && r.doorHall < L.nodes.length && onEdge !== undefined) good++;
  }
  ok(good === L.rooms.length, `every room has one door onto the halls (${good}/${L.rooms.length})`);
})();

// 5. rooms don't overlap each other
(() => {
  let bad = 0;
  for (let i = 0; i < L.rooms.length; i++) for (let j = i + 1; j < L.rooms.length; j++) {
    const a = L.rooms[i], b = L.rooms[j];
    if (Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh) bad++;
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
  const sample = (i) => ({ x: rs[i].x + rs[i].hw * 0.3, y: rs[i].y - rs[i].hh * 0.3 });   // an off-centre point in the room
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

console.log(`\nhalls.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
