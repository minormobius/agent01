// proofs/hadamard/hadamard.selftest.mjs — hold hadamard.js to every claim the page makes.
//   node proofs/hadamard/hadamard.selftest.mjs
// Imports the exact module the browser runs.

import * as H from './hadamard.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${a}, want ${b}`);
const t0 = Date.now();
let s = 7;
const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const randRow = (n) => Array.from({ length: n }, () => (rnd() < 0.5 ? 1 : -1));

// ------------------------------------------- the Lean definition = the paper's --
// H·Hᵀ computed as a matrix product (Comparator's IsSignHadamard) has P_h(t)
// in row i, column i+t: so "H·Hᵀ = nI" and "every P(t), t ≥ 1, is 0" agree.
for (let r = 0; r < 200; r++) {
  const n = 1 + (r % 13), h = randRow(n), G = H.gram(H.circulant(h)), P = H.periodic(h);
  let same = true;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (G[i][j] !== P[(((j - i) % n) + n) % n]) same = false;
  ok(same, `random row #${r} (n=${n}): (H·Hᵀ)_ij = P((j−i) mod n)`);
}
// the circulant matches the Lean definition H i j = h (j − i)
{
  const h = H.parse('+-++-'), C = H.circulant(h);
  ok(C.every((row, i) => row.every((x, j) => x === h[(((j - i) % 5) + 5) % 5])), 'circulant(h)[i][j] = h[(j−i) mod n]');
}

// --------------------------------------------------------------- identities --
for (let r = 0; r < 300; r++) {
  const n = 1 + (r % 24), h = randRow(n), P = H.periodic(h);
  eq(H.rowSum(h) ** 2, P.reduce((a, b) => a + b, 0), `(Σh)² = Σ P(t), random #${r}`);
  // P(t) ≡ n (mod 4): the product of the n summands is (Πh)² = 1
  ok(P.every((p) => (((p - n) % 4) + 4) % 4 === 0), `P(t) ≡ n mod 4, random #${r}`);
  // the difference-set identity P(t) = n − 4k + 4·N_D(t)
  const { k, N } = H.differenceSet(h);
  ok(P.every((p, t) => p === n - 4 * k + 4 * N[t]), `P(t) = n − 4k + 4N_D(t), random #${r}`);
  // periodic = aperiodic(t) + aperiodic(n−t), the bridge used for even Barker
  const C = H.aperiodic(h);
  ok(P.every((p, t) => t === 0 || p === C[t] + C[n - t]), `P(t) = C(t) + C(n−t), random #${r}`);
}

// ---------------------------------------------- order 4 exists, and how many --
{
  const ex = H.parse('+++-');
  ok(H.isCirculantHadamard(ex), 'the paper\'s example (1,1,1,−1) is circulant Hadamard');
  const G = H.gram(H.circulant(ex));
  ok(G.every((row, i) => row.every((x, j) => x === (i === j ? 4 : 0))), 'H·Hᵀ = 4I for (1,1,1,−1)');
  const { D, k, N } = H.differenceSet(ex);
  ok(k === 1 && N.slice(1).every((x) => x === 0) && D[0] === 3, 'order 4: D = {3}, the (4,1,0) difference set');
}

// ---------------------------- brute force, no theory: only orders 1 and 4 to 20 --
for (let n = 1; n <= 20; n++) {
  const rows = H.bruteCirculant(n);
  const want = n === 1 ? 2 : n === 4 ? 8 : 0;
  eq(rows.length, want, `order ${n}: circulant Hadamard first rows by exhaustive search`);
}
// …and every row found really is one, by the matrix product
ok(H.bruteCirculant(4).every((h) => H.gram(H.circulant(h)).every((row, i) => row.every((x, j) => x === (i === j ? 4 : 0)))), 'all 8 order-4 rows satisfy H·Hᵀ = 4I');

// ----------------------------------------------------------- Barker lengths --
for (const [n, str] of Object.entries(H.BARKER_TABLE)) {
  const a = H.parse(str);
  eq(a.length, +n, `table length ${n}`);
  ok(H.isBarker(a), `the paper's table: ${str} is Barker`);
}
// exhaustive two-ended search: Barker sequences exist exactly at 2,3,4,5,7,11,13 up to 40
{
  const lengths = [];
  for (let n = 2; n <= 40; n++) {
    const { seqs } = H.barkerSearch(n);
    ok(seqs.every(H.isBarker), `length ${n}: every hit is Barker`);
    if (seqs.length) lengths.push(n);
    if (seqs.length) eq(new Set(seqs.map(H.barkerClass)).size, 1, `length ${n}: one class under negate/reverse/alternate`);
  }
  eq(lengths.join(','), H.BARKER_LENGTHS.join(','), 'Barker lengths up to 40');
  // the search is complete for small n: compare with brute force over all 2^n
  for (let n = 2; n <= 16; n++) {
    let brute = 0;
    for (let m = 0; m < 2 ** n; m++) if (H.isBarker(Array.from({ length: n }, (_, j) => ((m >> j) & 1 ? -1 : 1)))) brute++;
    eq(H.barkerSearch(n).seqs.length, brute, `length ${n}: backtracking finds every Barker sequence brute force finds`);
  }
}
// the corollary's mechanism: an even-length Barker sequence (n = 4) is a circulant Hadamard row
ok(H.isCirculantHadamard(H.parse('+++-')) && H.isBarker(H.parse('+++-')), 'length-4 Barker sequence is a circulant Hadamard row');
ok(!H.isCirculantHadamard(H.parse('++')), 'length 2 is Barker but not circulant Hadamard (2 is no square)');

// ------------------------------------------------------------ order funnel --
{
  const f = H.funnel(10000);
  eq(f.sq.length, 100, 'squares ≤ 10⁴');
  eq(f.had.length, 51, 'squares that are 1 or ≡ 0 mod 4');
  eq(f.odd.length, 26, '… with u odd (Turyn)');
  eq(f.turyn.join(','), '1,4,900,1764,4356,4900,6084,8100', '… with u not a prime power (Turyn)');
  ok(H.isPrimePower(9) && H.isPrimePower(13) && !H.isPrimePower(15) && !H.isPrimePower(1), 'prime powers');
}
// local search never reaches zero energy away from n = 4
eq(H.anneal(4, { restarts: 40 }).best, 0, 'anneal finds order 4');
for (const n of [9, 16, 25, 36]) ok(H.anneal(n, { restarts: 10, seed: n }).best > 0, `anneal at n=${n} stays above 0`);

console.log(`hadamard: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
