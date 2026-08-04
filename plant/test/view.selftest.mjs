#!/usr/bin/env node
// Tests the summon inspector's maths (plant/view.js). The rendering is not
// tested — an SVG string is not worth asserting on — but the two things the
// page CLAIMS are, because a page that shows a picture and states a fact beside
// it can drift from the code, and then it is a confident lie rather than a bug.
//
// What is asserted:
//
//   1. the wireframe is the right polyhedron, checked against Euler rather than
//      against a table copied from the same place the code was;
//   2. the "naive placement is off by ~22°" claim, which is the whole reason
//      solids.mjs is shaped the way it is — and the cube exception, which is
//      the reason the bug is dangerous rather than merely present.

import { dualEdges, naiveNeighbours } from '../view.js';
import { SOLIDS, SOLID_NAMES, constellation, verify } from '../solids.mjs';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\nthe wireframe is the dual polyhedron');
{
  // V − E + F = 2. The dual's vertices are the original's faces, and the dual's
  // faces are the original's vertices, so E follows from Euler without any
  // table of edge counts to get wrong. Derived, not looked up.
  const VERTS = { tetrahedron: 4, cube: 8, octahedron: 6, dodecahedron: 20, icosahedron: 12 };
  for (const name of SOLID_NAMES) {
    const V = SOLIDS[name].normals.length;   // dual's vertices = this solid's faces
    const F = VERTS[name];                   // dual's faces     = this solid's vertices
    ok(`${name.padEnd(13)} E = V + F − 2 = ${V + F - 2}`, dualEdges(name).length === V + F - 2,
      `got ${dualEdges(name).length}`);
  }
  // Every edge must join two DISTINCT vertices, and no pair twice — a
  // threshold-based edge finder that drifted would show up here first.
  for (const name of SOLID_NAMES) {
    const e = dualEdges(name);
    const keys = new Set(e.map(([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`));
    ok(`${name.padEnd(13)} edges are distinct and non-degenerate`,
      keys.size === e.length && e.every(([i, j]) => i !== j));
  }
}

console.log('\nthe naive placement really is the trap the page says it is');
{
  const ANISO = 2.2, R = 1.5;
  // Recomputed here the long way — from the naive seeds, through the metric —
  // rather than by calling the page's own helper, so this is a check and not an
  // echo. A bisector normal under M = diag(1, aniso, 1) is M·n.
  const worst = (name) => {
    let w = 0;
    const seeds = naiveNeighbours(name, { r: R, rotate: 0 });
    for (const [k, d] of SOLIDS[name].normals.entries()) {
      const L = Math.hypot(...d), u = [d[0] / L, d[1] / L, d[2] / L];
      const n = seeds[k];
      const m = [n[0], n[1] * ANISO, n[2]];
      const ml = Math.hypot(...m), g = [m[0] / ml, m[1] / ml, m[2] / ml];
      const cross = [u[1] * g[2] - u[2] * g[1], u[2] * g[0] - u[0] * g[2], u[0] * g[1] - u[1] * g[0]];
      const dot = u[0] * g[0] + u[1] * g[1] + u[2] * g[2];
      // atan2, not acos: acos is ill-conditioned near 0 and this number is
      // supposed to be ~0 for the solid that survives.
      w = Math.max(w, Math.atan2(Math.hypot(...cross), dot) * 180 / Math.PI);
    }
    return w;
  };

  for (const name of ['tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron']) {
    const w = worst(name);
    ok(`${name.padEnd(13)} naive is off by ~22° (got ${w.toFixed(1)}°)`, w > 15 && w < 30, `${w}°`);
  }
  // THE DANGEROUS ONE. The cube's normals are axis-aligned, M cannot rotate
  // those, and so the first solid anyone tries looks perfect. If this ever
  // starts failing, the page's whole "then switch to a cube" paragraph is
  // wrong and must change with it.
  ok('cube          naive is EXACT — which is why the bug is dangerous',
    worst('cube') < 1e-9, `${worst('cube')}°`);

  // CONTROL: the real placement is exact for every solid, so the comparison the
  // page draws is between a broken thing and a correct one, not two broken ones.
  for (const name of SOLID_NAMES) {
    ok(`CONTROL: ${name.padEnd(13)} constellation() is exact`,
      verify(constellation(name, { r: R, aniso: ANISO })).ok);
  }
}

console.log('');
if (failed) { console.log(`✗ view selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ view selftest passed\n');
