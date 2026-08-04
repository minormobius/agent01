#!/usr/bin/env node
// Known-answer tests for the summon primitive (foam/solids.mjs).
//
// The load-bearing assertion is the CONTROL. The naive way to place a
// constellation — unit directions times a common radius — produces a perfect
// cube and a 22°-wrong everything-else, because foam's metric is anisotropic
// and a cube's normals are the only ones an axis-aligned M cannot rotate.
//
// So a cube passing proves nothing. Every solid is checked, and the naive
// placement is checked too and REQUIRED TO FAIL — if a future change made the
// naive version correct, either the metric stopped being anisotropic or this
// test stopped testing anything.
//
// Run: node foam/test/solids.selftest.mjs

import { SOLIDS, SOLID_NAMES, constellation, bisectors, verify, clearanceNeeded, seedGap, selfCompatible, pairGap } from '../solids.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const ANISO = 2.2;   // foamworld.js default — keep in step with it
const norm3 = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };

console.log('\nthe five solids, under foam\'s real metric');
for (const name of SOLID_NAMES) {
  const con = constellation(name, { r: 1.6, aniso: ANISO });
  const v = verify(con);
  ok(`${name.padEnd(13)} ${String(SOLIDS[name].faces).padStart(2)} faces, exact`,
    v.ok, `normals off by ${v.maxNormalErrorDeg.toExponential(2)}°, spread ${v.distanceSpread.toExponential(2)}`);
  ok(`${name.padEnd(13)} neighbour count = face count`,
    con.neighbours.length === SOLIDS[name].faces);
  ok(`${name.padEnd(13)} inradius is the r asked for`,
    Math.abs(v.inradius - 1.6) < 1e-9, `got ${v.inradius}`);
}

console.log('\nTHE CONTROL — naive placement must FAIL, or this file proves nothing');
{
  const naive = (name, aniso) => {
    const centre = [0, 0, 0];
    const neighbours = SOLIDS[name].normals.map((d) => norm3(d).map((v) => v * 3.2));
    return { solid: name, centre, neighbours, aniso, rotate: 0 };
  };
  const errs = {};
  for (const name of SOLID_NAMES) {
    const got = bisectors(naive(name, ANISO), ANISO);
    const want = SOLIDS[name].normals.map(norm3);
    errs[name] = Math.max(...got.map((g, i) =>
      Math.acos(Math.min(1, Math.abs(g.normal.reduce((s, v, k) => s + v * want[i][k], 0)))) * 180 / Math.PI));
  }
  ok('naive cube is CORRECT — and that is the trap', errs.cube < 1e-9, `${errs.cube}°`);
  for (const name of ['tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron']) {
    ok(`naive ${name.padEnd(13)} is wrong by >15°`, errs[name] > 15, `${errs[name].toFixed(2)}°`);
  }
  ok('the worst naive error is ~22° at aniso 2.2',
    Math.max(...Object.values(errs)) > 21 && Math.max(...Object.values(errs)) < 23,
    `${Math.max(...Object.values(errs)).toFixed(2)}°`);
}

console.log('\nthe isotropic case still works (aniso = 1 ⇒ M = I ⇒ naive == solved)');
for (const name of SOLID_NAMES) {
  const v = verify(constellation(name, { r: 2, aniso: 1 }));
  ok(`${name.padEnd(13)} exact at aniso 1`, v.ok, `${v.maxNormalErrorDeg}°`);
}

console.log('\nit holds across the metric, not just at 2.2');
for (const aniso of [1.2, 2.2, 3.5, 8]) {
  const v = verify(constellation('dodecahedron', { r: 1.4, aniso }));
  ok(`dodecahedron exact at aniso ${String(aniso).padEnd(4)}`, v.ok,
    `${v.maxNormalErrorDeg.toExponential(2)}°`);
}

console.log('\ndeterminism and orientation');
{
  const a = constellation('icosahedron', { centre: [3, 4, 5], r: 1.1, aniso: ANISO });
  const b = constellation('icosahedron', { centre: [3, 4, 5], r: 1.1, aniso: ANISO });
  ok('same inputs give byte-identical seeds', JSON.stringify(a.seeds) === JSON.stringify(b.seeds));
  ok('the centre is the first seed', JSON.stringify(a.seeds[0]) === JSON.stringify([3, 4, 5]));
  ok('seed count is faces + 1', a.seeds.length === SOLIDS.icosahedron.faces + 1);

  const r0 = constellation('cube', { r: 1.5, aniso: ANISO, rotate: 0 });
  const r1 = constellation('cube', { r: 1.5, aniso: ANISO, rotate: Math.PI / 5 });
  ok('a yaw actually moves the seeds', JSON.stringify(r0.seeds) !== JSON.stringify(r1.seeds));
  ok('a yawed solid is still exact', verify(r1).ok, `${verify(r1).maxNormalErrorDeg}°`);
  ok('yaw preserves the inradius', Math.abs(verify(r1).inradius - 1.5) < 1e-9);
}

console.log('\nclearance — "can I build here?" must be decidable before trying');
{
  const small = constellation('tetrahedron', { r: 1.0, aniso: ANISO });
  const big = constellation('icosahedron', { r: 2.4, aniso: ANISO });
  ok('extent grows with r', big.extent > small.extent);
  ok('clearance exceeds extent by the seed gap',
    Math.abs(clearanceNeeded(small, 1.5) - (small.extent + 1.5)) < 1e-12);
  // reformPocket refuses seeds within 1.5 (anisotropic) of an existing one, so
  // a summon whose own neighbours (and centre) violate that gap can never be
  // legal anywhere. seedGap replicates reformPocket's own formula exactly —
  // checked directly, not just through selfCompatible/pairGap below.
  ok('seedGap matches reformPocket\'s formula byte-for-byte',
    Math.abs(seedGap([0, 0, 0], [3, 4, 0], ANISO) - Math.hypot(3, 4 * Math.sqrt(ANISO), 0)) < 1e-12);

  ok('a tetrahedron at r=1.0 is self-compatible with the 1.5 seed gap',
    selfCompatible(small, 1.5));

  // …and the useful negative: squeeze it and the constellation self-collides.
  const tiny = constellation('icosahedron', { r: 0.35, aniso: ANISO });
  ok('CONTROL: a too-small icosahedron self-collides and could never be summoned',
    !selfCompatible(tiny, 1.5));

  // cube and octahedron bracket the same true/false the tetrahedron/icosahedron
  // pair does above — one comfortably clear (r=1.0, min own-seed gap = 2·r
  // exactly, along the two axes aniso never touches), one deliberately
  // squeezed (r=0.3, min own-seed gap ≈ 1.90·r, well under 1.5).
  const cubeOk = constellation('cube', { r: 1.0, aniso: ANISO });
  ok('a cube at r=1.0 is self-compatible with the 1.5 seed gap',
    selfCompatible(cubeOk, 1.5));

  const octaTight = constellation('octahedron', { r: 0.3, aniso: ANISO });
  ok('CONTROL: a too-small octahedron self-collides and could never be summoned',
    !selfCompatible(octaTight, 1.5));

  // pairGap: two adjacent summons must not collide with EACH OTHER — the case
  // constellation()'s own clearanceNeeded never covers (one solid against
  // pre-existing point seeds, never two five-plus-seed constellations).
  const farA = constellation('tetrahedron', { centre: [0, 0, 0], r: 1.0, aniso: ANISO });
  const farB = constellation('tetrahedron', { centre: [0, 0, 20], r: 1.0, aniso: ANISO });
  ok('two tetrahedra 20 apart clear the 1.5 seed gap', pairGap(farA, farB) >= 1.5,
    `min pair gap ${pairGap(farA, farB).toFixed(3)}`);

  const closeA = constellation('tetrahedron', { centre: [0, 0, 0], r: 1.0, aniso: ANISO });
  const closeB = constellation('tetrahedron', { centre: [0, 0, 0.5], r: 1.0, aniso: ANISO });
  ok('CONTROL: two tetrahedra 0.5 apart collide', pairGap(closeA, closeB) < 1.5,
    `min pair gap ${pairGap(closeA, closeB).toFixed(3)}`);
}

console.log('\nrefusals');
{
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };
  ok('an unknown solid throws', throws(() => constellation('trapezohedron')));
  ok('a non-positive r throws', throws(() => constellation('cube', { r: 0 })));
  ok('a non-positive aniso throws', throws(() => constellation('cube', { aniso: 0 })));
}

console.log('');
if (failed) { console.log(`✗ solids selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ solids selftest passed\n');
