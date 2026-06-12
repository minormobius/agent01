// paint.selftest.mjs — pins the membrane-seeded Voronoi painter (hoop/paint/voronoi.js).
// Run: node hoop/test/paint.selftest.mjs
import { clipCell, buildScene, roomOf, bucketGrid, jitterGrid, mulberry32 } from '../paint/voronoi.js';

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

// ── buildScene: a full membrane-seeded scene ──
{
  const sc = buildScene({ W: 600, H: 400, spacing: 14, roomSize: 70, seed: 7 });
  ok(sc.roomSeeds.length > 10, 'the floor plan has rooms');
  ok(sc.roomCells.every((c) => c.poly.length >= 3), 'every room is a valid polygon');
  ok(sc.wallNuclei.length > 0 && sc.floorNuclei.length > 0, 'both wall and floor nuclei are seeded');
  ok(sc.paintCells.length === sc.nuclei.length, 'one paint cell per nucleus');
  ok(sc.paintCells.every((c) => c.poly.length >= 3), 'every paint cell is a valid polygon');

  // wall nuclei sit ON the membranes (their distance to a room boundary is ~0)
  const rg = bucketGrid(sc.roomSeeds, sc.roomSize * 1.4);
  const wallEdge = sc.wallNuclei.slice(0, 200).map((n) => roomOf(n, rg).edgeDist);
  const medWall = wallEdge.sort((a, b) => a - b)[wallEdge.length >> 1];
  ok(medWall < 2.0, 'wall nuclei lie on the membranes (median edge-distance ≈ 0, got ' + medWall.toFixed(2) + ')');
  // floor nuclei are held off the membranes by the band (= spacing/2)
  ok(sc.floorNuclei.every((n) => roomOf(n, rg).edgeDist > sc.band - 1e-6), 'floor nuclei are kept out of the wall band');
  ok(Math.abs(sc.band - sc.spacing * 0.5) < 1e-9, 'the wall band scales with the spacing knob');
}

// ── the knob: nucleus spacing controls the wall (thickness + density) ──
{
  const fine = buildScene({ W: 600, H: 400, spacing: 9, roomSize: 70, seed: 3 });
  const coarse = buildScene({ W: 600, H: 400, spacing: 22, roomSize: 70, seed: 3 });
  ok(fine.band < coarse.band, 'smaller spacing → thinner wall band (the thickness knob)');
  ok(fine.wallNuclei.length > coarse.wallNuclei.length, 'smaller spacing → denser wall seeding');
  ok(fine.paintCells.length > coarse.paintCells.length, 'smaller spacing → more, smaller cells');
  // same plan either way (room layer is independent of the paint spacing)
  ok(fine.roomSeeds.length === coarse.roomSeeds.length, 'the floor plan is the same regardless of paint spacing');
}

// ── determinism ──
{
  const a = buildScene({ W: 400, H: 300, spacing: 12, roomSize: 60, seed: 42 });
  const b = buildScene({ W: 400, H: 300, spacing: 12, roomSize: 60, seed: 42 });
  ok(a.nuclei.length === b.nuclei.length && a.paintCells.length === b.paintCells.length, 'buildScene is deterministic for a given seed');
  const c = buildScene({ W: 400, H: 300, spacing: 12, roomSize: 60, seed: 43 });
  ok(c.nuclei.length !== a.nuclei.length || JSON.stringify(c.roomSeeds[0]) !== JSON.stringify(a.roomSeeds[0]), 'a different seed gives a different scene');
}

console.log(`paint.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
