// proofs/crossing/crossing.selftest.mjs — hold crossing.js to every claim the page makes.
//   node proofs/crossing/crossing.selftest.mjs
// Imports the exact module the browser runs.

import * as C from './crossing.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${a}, want ${b}`);
const t0 = Date.now();

// ---------------------------------------------------------------- formulas --
// Hill's numbers, as published (OEIS A000241 lists the conjectured values)
const HILL = [0, 0, 1, 3, 9, 18, 36, 60, 100, 150, 225, 315, 441, 588];   // n = 3..16
HILL.forEach((v, k) => eq(C.hill(k + 3), v, `hill(${k + 3})`));
// the Lean definition divides by 4 in ℕ: the product is always divisible by 4,
// so floor division loses nothing
for (let n = 3; n <= 200; n++) {
  const f = (k) => Math.floor(k / 2), p = f(n) * f(n - 1) * f(n - 2) * f(n - 3);
  ok(p % 4 === 0, `hill(${n}): product divisible by 4`);
}
// the paper's two forms of d_r agree: ⌊r/2⌋⌊(r−1)/2⌋ = C(⌊r/2⌋,2) + C(⌈r/2⌉,2)
const c2 = (k) => (k * (k - 1)) / 2;
for (let r = 1; r <= 200; r++) eq(C.axisPairs(r), c2(Math.floor(r / 2)) + c2(Math.ceil(r / 2)), `d_${r} two forms`);
eq(C.zarankiewicz(3, 3), 1, 'K3,3 (utilities puzzle) needs 1 crossing');
eq(C.zarankiewicz(5, 5), 16, 'Z(5,5)');
eq(C.zarankiewicz(7, 7), 81, 'Z(7,7), Woodall 1993');

// ------------------------------------------- K_n: the paper's two-page drawing --
for (let n = 3; n <= 60; n++)
  eq(C.twoPageCrossings(n, C.endpointSumPages(n)).count, C.hill(n), `endpoint-sum drawing of K_${n} has hill(${n}) crossings`);
{
  // the paper's Figure for K_7: 2 crossings above, 7 below; highlighted 02 × 16
  const p = C.endpointSumPages(7), E = C.completeEdges(7);
  const { pairs } = C.twoPageCrossings(7, p, { list: true });
  eq(pairs.filter(([x]) => p[x] === 0).length, 2, 'K7 first page: 2 crossings');
  eq(pairs.filter(([x]) => p[x] === 1).length, 7, 'K7 second page: 7 crossings');
  const idx = (i, j) => E.findIndex(([a, b]) => a === i && b === j);
  ok(pairs.some(([x, y]) => (x === idx(0, 2) && y === idx(1, 6)) || (x === idx(1, 6) && y === idx(0, 2))), 'K7: edges 02 and 16 cross');
  // the paper's page rule for n = 7: first page iff i+j mod 7 ∈ {0,1,2}
  E.forEach(([i, j], k) => eq(p[k], [0, 1, 2].includes((i + j) % 7) ? 0 : 1, `K7 edge ${i}${j} page`));
}
// the combinatorial count is the geometric one: intersect the real semicircles
for (let n = 3; n <= 16; n++)
  for (const seed of [1, 7, 42]) {
    const xs = C.genericPositions(n, seed + n), pages = C.endpointSumPages(n);
    const pts = C.semicirclePoints(n, pages, xs);
    eq(pts.length, C.hill(n), `K_${n} seed ${seed}: semicircle intersections = alternation count`);
    // admissible: no two crossings at the same point (no triple points)
    const key = new Set(pts.map((q) => q.x.toFixed(9) + ',' + q.y.toFixed(9)));
    eq(key.size, pts.length, `K_${n} seed ${seed}: no triple crossings`);
  }
// …and for arbitrary page assignments, not just the optimal one
{
  let s = 99; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let t = 0; t < 40; t++) {
    const n = 4 + (t % 9), m = n * (n - 1) / 2;
    const pages = Array.from({ length: m }, () => (r() < 0.5 ? 0 : 1));
    eq(C.semicirclePoints(n, pages, C.genericPositions(n, t)).length, C.twoPageCrossings(n, pages).count, `random pages K_${n} #${t}: geometry = combinatorics`);
  }
}

// ------------------------------------------- K_n: no two-page drawing does better --
// Exhaustive over all page assignments (branch and bound). This is the 2013
// two-page theorem of Ábrego et al. checked for small n — NOT the 2026 claim,
// which is about every drawing whatsoever.
for (let n = 3; n <= 11; n++) {
  const r = C.twoPageMinimum(n, { target: C.hill(n) });
  ok(r.witness === null, `K_${n}: no two-page drawing has fewer than ${C.hill(n)} crossings (${r.nodes} nodes)`);
}
for (let n = 3; n <= 8; n++) eq(C.twoPageMinimum(n).min, C.hill(n), `K_${n}: two-page minimum is attained and equals hill`);
// greedy descent from random pages never goes below hill (it cannot: the minimum is hill)
{
  let s = 5; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let t = 0; t < 30; t++) {
    const n = 5 + (t % 8), m = n * (n - 1) / 2;
    const P = C.descend(n, Array.from({ length: m }, () => (r() < 0.5 ? 0 : 1)));
    ok(C.twoPageCrossings(n, P).count >= C.hill(n), `descent K_${n} #${t} stays ≥ hill`);
  }
}

// -------------------------------------------------- K_{m,n}: the brickyard --
for (let m = 1; m <= 14; m++)
  for (let n = 1; n <= 14; n++) {
    const d = C.zarankiewiczDrawing(m, n);
    eq(C.bipartiteCrossings(d.kilns, d.yards).count, C.zarankiewicz(m, n), `Zarankiewicz drawing of K_${m},${n}`);
  }
{
  // the drawing is admissible: crossing points are distinct and avoid vertices
  const d = C.zarankiewiczDrawing(9, 11), { points } = C.bipartiteCrossings(d.kilns, d.yards, { list: true });
  eq(new Set(points.map((p) => p.map((v) => v.toFixed(9)).join())).size, points.length, 'K9,11: no triple crossings');
  const verts = new Set([...d.kilns, ...d.yards].map((p) => p.join()));
  ok(points.every((p) => !verts.has(p.join())), 'K9,11: no crossing at a vertex');
}
{
  // random straight-line drawings of small K_{m,n} never beat the formula
  let s = 3; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let t = 0; t < 400; t++) {
    const m = 3 + (t % 4), n = 3 + ((t >> 2) % 4);
    const kilns = Array.from({ length: m }, () => [r() * 10, r() * 10]);
    const yards = Array.from({ length: n }, () => [r() * 10, r() * 10]);
    ok(C.bipartiteCrossings(kilns, yards).count >= C.zarankiewicz(m, n), `random drawing K_${m},${n} #${t} ≥ Z`);
  }
}

console.log(`crossing: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
