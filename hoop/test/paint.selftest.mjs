// paint.selftest.mjs — pins the membrane-seeded Voronoi painter (hoop/paint/voronoi.js).
// Run: node hoop/test/paint.selftest.mjs
import { clipCell, buildScene, roomOf, bucketGrid, jitterGrid, mulberry32, adjacency, chooseDoors } from '../paint/voronoi.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// ── clipCell: a site among neighbours yields a bounded convex polygon ──
{
  const A = { x: 50, y: 50 };
  const nb = [{ x: 60, y: 50 }, { x: 40, y: 50 }, { x: 50, y: 60 }, { x: 50, y: 40 }];
  const poly = clipCell(A, nb, 40);
  ok(poly.length >= 4, 'clipCell returns a polygon');
  // it should be small (squeezed by the 4 close neighbours), centred near A
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  ok(Math.abs(cx - 50) < 3 && Math.abs(cy - 50) < 3, 'the cell is centred on its site');
  const w = Math.max(...poly.map((p) => p[0])) - Math.min(...poly.map((p) => p[0]));
  ok(w <= 12, 'four neighbours 10 away clip the cell to ~one spacing wide');
}

// ── buildScene: a full membrane-seeded, density-graded scene ──
{
  const sc = buildScene({ W: 600, H: 400, wallSpacing: 8, roomSpacing: 18, roomSize: 70, seed: 7 });
  ok(sc.roomSeeds.length > 10, 'the floor plan has rooms');
  ok(sc.roomCells.every((c) => c.poly.length >= 3), 'every room is a valid polygon');
  ok(sc.wallNuclei.length > 0 && sc.floorNuclei.length > 0, 'both wall and floor nuclei are seeded');
  ok(sc.paintCells.length === sc.nuclei.length, 'one paint cell per nucleus');
  ok(sc.paintCells.every((c) => c.poly.length >= 3), 'every paint cell is a valid polygon');

  const rg = bucketGrid(sc.roomSeeds, sc.roomSize * 1.4);
  // wall nuclei sit ON the membranes (distance to a room boundary ≈ 0)
  const wallEdge = sc.wallNuclei.slice(0, 200).map((n) => roomOf(n, rg).edgeDist);
  ok(wallEdge.sort((a, b) => a - b)[wallEdge.length >> 1] < 2.0, 'wall nuclei lie on the membranes');
  // non-door floor nuclei held out of the band (= wallSpacing/2); door bridges are the exception
  ok(sc.floorNuclei.every((n) => n.door || roomOf(n, rg).edgeDist > sc.band - 1e-6), 'non-door floor nuclei are kept out of the wall band');
  ok(Math.abs(sc.band - sc.wallSpacing * 0.5) < 1e-9, 'the wall band scales with the wall-spacing knob');
  // the room-centre seeds are forced in (the big middle cells)
  const anchored = sc.roomSeeds.filter((s) => sc.floorNuclei.some((n) => Math.abs(n.x - s.x) < 1e-6 && Math.abs(n.y - s.y) < 1e-6));
  ok(anchored.length > sc.roomSeeds.length * 0.6, 'most room centres get an anchoring big seed');
}

// ── the GRADING: cells fine at the walls, coarse toward the centre ──
{
  const sc = buildScene({ W: 700, H: 500, wallSpacing: 8, roomSpacing: 22, roomSize: 80, seed: 5 });
  const rg = bucketGrid(sc.roomSeeds, sc.roomSize * 1.4);
  const fg = bucketGrid(sc.floorNuclei, sc.roomSpacing * 1.6);
  // nearest-neighbour distance among floor nuclei, grouped by distance-from-wall
  const nn = (n) => { let d = Infinity; for (const q of fg.near(n.x, n.y)) { if (q === n) continue; const dd = (q.x - n.x) ** 2 + (q.y - n.y) ** 2; if (dd < d) d = dd; } return Math.sqrt(d); };
  let nearSum = 0, nearN = 0, farSum = 0, farN = 0;
  for (const n of sc.floorNuclei) { const e = roomOf(n, rg).edgeDist; const d = nn(n); if (!isFinite(d)) continue; if (e < 14) { nearSum += d; nearN++; } else if (e > 28) { farSum += d; farN++; } }
  const nearAvg = nearSum / Math.max(1, nearN), farAvg = farSum / Math.max(1, farN);
  ok(nearN > 0 && farN > 0, 'there are both wall-adjacent and deep-interior floor nuclei');
  ok(nearAvg < farAvg, `cells coarsen with distance from the wall (near ${nearAvg.toFixed(1)} < far ${farAvg.toFixed(1)})`);
  // grading is cheaper than a uniform fine fill: far fewer floor nuclei than W*H / wallSpacing²
  ok(sc.floorNuclei.length < (700 * 500) / (sc.wallSpacing * sc.wallSpacing) * 0.5, 'grading uses far fewer interior cells than a uniform fine grid');
}

// ── the two knobs ──
{
  const thinWall = buildScene({ W: 600, H: 400, wallSpacing: 8, roomSpacing: 18, roomSize: 70, seed: 3 });
  const thickWall = buildScene({ W: 600, H: 400, wallSpacing: 18, roomSpacing: 18, roomSize: 70, seed: 3 });
  ok(thinWall.band < thickWall.band, 'wall-spacing is the wall-thickness knob');
  ok(thinWall.wallNuclei.length > thickWall.wallNuclei.length, 'smaller wall-spacing → denser wall seeding');
  const fineRoom = buildScene({ W: 600, H: 400, wallSpacing: 8, roomSpacing: 12, roomSize: 70, seed: 3 });
  const coarseRoom = buildScene({ W: 600, H: 400, wallSpacing: 8, roomSpacing: 30, roomSize: 70, seed: 3 });
  ok(fineRoom.floorNuclei.length > coarseRoom.floorNuclei.length, 'room-spacing is the interior-coarseness knob');
  ok(fineRoom.wallNuclei.length === coarseRoom.wallNuclei.length, 'room-spacing leaves the walls untouched');
}

// ── DOORS: a spanning tree keeps every room connected ──
{
  const sc = buildScene({ W: 820, H: 600, wallSpacing: 8, roomSpacing: 24, roomSize: 90, loops: 0, seed: 9 });
  ok(sc.doors.length >= sc.roomSeeds.length - 1, 'a spanning tree has ≥ (rooms − 1) doors');
  // union-find over the doors → every room is one connected component
  const par = Array.from({ length: sc.roomSeeds.length }, (_, i) => i), find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (const d of sc.doors) par[find(d.a)] = find(d.b);
  ok(new Set(sc.roomSeeds.map((s) => find(s.id))).size === 1, 'every room is reachable through the doors (one component)');
  // each door is a real cut in the wall, bridged by floor
  ok(sc.floorNuclei.some((n) => n.door) && sc.paintCells.some((c) => c.door), 'doors are bridged with floor nuclei');
  const d0 = sc.doors[0];
  ok(sc.wallNuclei.filter((w) => Math.hypot(w.x - d0.m[0], w.y - d0.m[1]) < sc.wallSpacing * 0.9).length === 0, 'the wall is cut at the door (no wall nuclei in the gap)');
}

// ── loops add roads beyond the tree (still all connected) ──
{
  const tree = buildScene({ W: 820, H: 600, wallSpacing: 8, roomSpacing: 24, roomSize: 90, loops: 0, seed: 9 });
  const roads = buildScene({ W: 820, H: 600, wallSpacing: 8, roomSpacing: 24, roomSize: 90, loops: 0.6, seed: 9 });
  ok(roads.doors.length > tree.doors.length, 'loops add extra doors past the spanning tree (the road network)');
  ok(roads.doors.length <= tree.adjEdges.length, 'never more doors than there are adjacencies');
  // chooseDoors directly: tree is exactly rooms−components edges over a connected graph
  const tdoors = chooseDoors(tree.adjEdges, tree.roomSeeds.length, 9, 0);
  ok(tdoors.length === tree.roomSeeds.length - 1, 'the room-adjacency graph is connected (spanning tree = rooms − 1)');
}

// ── determinism ──
{
  const p = { W: 400, H: 300, wallSpacing: 8, roomSpacing: 16, roomSize: 60 };
  const a = buildScene({ ...p, seed: 42 }), b = buildScene({ ...p, seed: 42 });
  ok(a.nuclei.length === b.nuclei.length && a.paintCells.length === b.paintCells.length, 'buildScene is deterministic for a given seed');
  const c = buildScene({ ...p, seed: 43 });
  ok(c.nuclei.length !== a.nuclei.length || JSON.stringify(c.roomSeeds[0]) !== JSON.stringify(a.roomSeeds[0]), 'a different seed gives a different scene');
}

console.log(`paint.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
