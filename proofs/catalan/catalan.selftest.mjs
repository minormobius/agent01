// proofs/catalan/catalan.selftest.mjs — replay both finite certificates in the
// Catalan irrationality paper, and hold catalan.js to every number the page shows.
//   node proofs/catalan/catalan.selftest.mjs
import * as K from './catalan.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('FAIL', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${a}, want ${b}`);
const t0 = Date.now();
const { Q } = K;

// ------------------------------------------ certificate 1: the fixed matrices --
const B = K.buildB();
eq(B.length, 49, 'ℬ has 49 rows');
ok(B.every((r) => r.length === 48), 'ℬ has 48 columns');
// "Every rational array entry has denominator prime factors at most 65"
const smallPrimes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n, 53n, 59n, 61n];
ok(B.flat().every((x) => { let d = x[1]; for (const p of smallPrimes) while (d % p === 0n) d /= p; return d === 1n; }), 'every denominator of ℬ has prime factors ≤ 61 (paper: ≤ 65), so all are units mod 101');
for (const s of [0, 1, -1]) {
  const r = K.pivots101(B, s);
  ok(!r.singular, `σ=${s}: elimination mod 101 never stalls`);
  eq(r.pivots.join(','), K.PIVOT_TABLE[s].join(','), `σ=${s}: all 48 pivots equal the paper's table`);
  eq(JSON.stringify(r.swaps), JSON.stringify(K.SWAP_TABLE[s]), `σ=${s}: row swaps equal the paper's`);
  ok(r.pivots.every((p) => p !== 0), `σ=${s}: every pivot nonzero`);
  // independent: the exact rational determinant reduces mod 101 to ±Π pivots
  const d = K.detQ(B, s);
  ok(!Q.isZero(d), `σ=${s}: det(ℬ₀ + σℬ₁) ≠ 0 over ℚ, exactly`);
  const prodPiv = r.pivots.reduce((a, p) => (a * BigInt(p)) % 101n, 1n);
  const sign = r.swaps.length % 2 ? 100n : 1n;
  eq(K.toF101(d), (prodPiv * sign) % 101n, `σ=${s}: exact det mod 101 = ±(product of the paper's pivots)`);
}

// ------------------------------------------- certificate 2: the two barriers --
const N = { 2: K.numerators(2), 1: K.numerators(1) };     // asserts the imaginary parts vanish
for (const row of K.DESCARTES) {
  const A = N[row.kappa][row.fn], key = row.kappa + row.fn;
  eq(A.length - 1, row.deg, `${key}: numerator degree`);
  const pts = row.points.map(Q.dec), brackets = K.BRACKETS[key];
  for (let i = 0; i + 1 < pts.length; i++) {
    const v = K.variations(A, pts[i], pts[i + 1]);
    eq(v, row.counts[i], `${key} on (${row.points[i]}, ${row.points[i + 1]}): Descartes sign variations`);
    // brackets inside this interval: one per variation, each a genuine sign change
    const lo = Q.mul(pts[i], Q.of(10n ** 10n)), hi = Q.mul(pts[i + 1], Q.of(10n ** 10n));
    const inside = brackets.filter((m) => Q.cmp(Q.of(m), lo) > 0 && Q.cmp(Q.of(m + 2), hi) < 0);
    eq(inside.length, row.counts[i], `${key} on (${row.points[i]}, ${row.points[i + 1]}): brackets = variations`);
  }
  eq(brackets.length, row.counts.reduce((a, b) => a + b, 0), `${key}: every bracket lies in an interval`);
  for (const m of brackets) ok(K.signAt(A, m) * K.signAt(A, m + 2) < 0, `${key}: bracket (${m}, ${m + 2})/10¹⁰ has a sign change`);
  ok(brackets.every((m, i) => i === 0 || m > brackets[i - 1] + 2), `${key}: brackets disjoint and ordered`);
}
// the fifty certified values: our 60-digit value must sit at or below the paper's
// 12-decimal upper bound, and within one unit of its last place
const GAP = 10n ** 48n + 10n ** 45n;
for (const [k, fn, s, type, bound] of K.VALUE_TABLE) {
  const v = K.barrier(k, fn, Q.of(s, 10000000000));
  const m = K.marginTo(bound, v);
  ok(m >= 0n && m <= GAP, `κ=${k} ${fn}(${s}/10¹⁰) [${type}]: ≤ ${bound}, within 10⁻¹² (got ${K.fixedToString(v, 14)})`);
}
eq(K.VALUE_TABLE.length, 50, 'fifty certified values');
for (const k of [2, 1]) {
  const n = K.normCombo(k), m = K.marginTo(K.NORM_TABLE[k], n);
  ok(m >= 0n && m <= GAP, `κ=${k}: κ‖p‖² + ½‖v‖² ≤ ${K.NORM_TABLE[k]} within 10⁻¹²`);
  // the coarse cutoffs used in the final sum dominate every certified value
  const c = K.CUTOFFS[k];
  ok(Q.cmp(Q.add(Q.dec(K.NORM_TABLE[k]), Q.dec('.00000001')), Q.dec(c.norm)) < 0, `κ=${k}: norm + 10⁻⁸ < cutoff ${c.norm}`);
  for (const fn of ['X', 'Y']) {
    const worst = K.VALUE_TABLE.filter((r) => r[0] === k && r[1] === fn).map((r) => Q.dec(r[4])).reduce((a, b) => (Q.cmp(a, b) > 0 ? a : b));
    ok(Q.cmp(Q.add(worst, Q.dec('.00000001')), Q.dec(c[fn])) < 0, `κ=${k}: max ${fn} + 10⁻⁸ < cutoff ${c[fn]}`);
  }
}
// constants and the final sum
eq(Q.add(Q.of(-1), Q.add(K.ALPHA, K.GAMMA)).join('/'), '-11/16', '−1 + α + γ = −11/16');
{
  const l2 = K.flog(10n ** 60n * 2n);
  ok(K.marginTo('.693149', l2) > 0n && K.marginTo('.693146', l2) < 0n, '.693146 < log 2 < .693149');
}
eq(Q.cmp(K.finalBound(2), Q.dec('-2.290939875')), 0, 'κ=2 final bound is exactly −2.290939875');
eq(Q.cmp(K.finalBound(1), Q.dec('-2.296789875')), 0, 'κ=1 final bound is exactly −2.296789875');
ok(Q.cmp(Q.dec(K.UPPER), Q.dec('-2.2909')) < 0, 'upper barrier < −2.2909');
ok(Q.cmp(Q.dec(K.UPPER), Q.dec(K.LOWER)) < 0, 'upper barrier −2.290939875 < lower barrier −2.29084: incompatible');
eq(Q.sub(Q.dec(K.LOWER), Q.dec(K.UPPER)).map(String).join('/'), '799/8000000', 'the gap between the barriers is 799/8000000 ≈ 0.0000999');

// --------------------------------------------------------------- G itself ----
{
  const g = K.catalanDigits(50);
  eq(g.ramanujan, g.cvz, 'G to 50 digits: Ramanujan formula = accelerated defining series');
  // and the defining series, summed naively, approaches it within its alternating bound
  let s = 0;
  for (let j = 0; j < 2000; j++) s += (j % 2 ? -1 : 1) / (2 * j + 1) ** 2;
  ok(Math.abs(s - Number(g.ramanujan)) < 1 / 4001 ** 2, 'naive partial sum within its alternating-series bound');
}

console.log(`catalan: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
