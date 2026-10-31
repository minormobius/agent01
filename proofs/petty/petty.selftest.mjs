// node proofs/petty/petty.selftest.mjs — holds petty.js to the papers, the Lean statements
// and independent recomputation. Exit 1 on any failure.
import * as P from './petty.js';
const { Q } = P;

let pass = 0, fail = 0;
const t0 = Date.now();
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL', msg); } }

// ------------------------------------------------- the paper's numbers ---
ok(P.binom(20, 10) === 184756n, 'C(20,10) = 184756');
ok(121n * 184756n - 21n * 1048576n === 335380n, 'certificate 121·184756 − 21·1048576 = 335380');
const want = Q.of(121n * P.binom(20, 10), 21n * 2n ** 20n);
ok(Q.eq(want, Q.of(22355476n, 22020096n)), '121·C(20,10)/(21·2²⁰) = 22355476/22020096 (the Lean statement\'s two forms)');
ok(Q.cmp(want, Q.of(1)) > 0, '… which exceeds 1');
ok(Q.eq(P.productTest(10, 10), want), 'two-factor product test at (10,10)');
ok(Q.eq(P.partitionRatio([10, 10]), want), 'c₁₀²/c₂₀');
// c_d = (d+1)d^d/d! (Lean simplexConstant) and the facet zonotope agree with |ΠT_d| = (d+1)/((d−1)!)^d
for (let d = 2; d <= 12; d++) {
  const z = P.zonotopeVolume(P.simplexAreaNormals(d)).volume;
  ok(Q.eq(z, Q.of(BigInt(d + 1), P.fact(d - 1) ** BigInt(d))), `|ΠT_${d}| = (d+1)/((d−1)!)^d from the facet zonotope`);
  ok(Q.eq(Q.div(z, Q.pow(P.simplexVolume(d), d - 1)), P.simplexConstant(d)), `R_${d}(T_${d}) = c_${d}`);
}
ok(Q.eq(P.simplexConstant(3), Q.of(18)), 'c₃ = 18 (Chen–Feng–Li–Xi–Xu: tetrahedra maximise in ℝ³)');
ok(Q.eq(P.simplexConstant(2), Q.of(6)), 'c₂ = 6');
// the product test equals c_r c_s / c_{r+s} everywhere
for (let r = 2; r <= 25; r++) for (let s = 2; s <= 25; s++) ok(Q.eq(P.productTest(r, s), P.partitionRatio([r, s])), `product test (${r},${s})`);

// ------------------------- the theorem by brute force, no product formula ---
{
  const b = P.bruteRatio([10, 10]);
  ok(b.subsets === 231, '231 = C(22,20) determinants of 20 × 20');
  ok(Q.eq(b.overSimplex, want), `zonotope of the 22 facet vectors gives R₂₀(T₁₀×T₁₀)/c₂₀ = ${Q.str(b.overSimplex)}`);
  ok(Q.cmp(b.R, P.simplexConstant(20)) > 0, '|ΠK| > c₂₀ |K|¹⁹ (the Lean statement\'s last conjunct)');
}
// the product proposition, checked by brute force on small products (two and three factors)
for (const parts of [[2, 2], [2, 3], [3, 3], [2, 4], [4, 3], [5, 2], [2, 2, 2], [3, 2, 2], [6, 6], [4, 4, 2]]) {
  const b = P.bruteRatio(parts);
  ok(Q.eq(b.overSimplex, P.partitionRatio(parts)), `brute R(T_${parts.join('×T_')}) = Π c / c_n`);
}
// a few more twenty-dimensional pairs, by brute force
for (const [r, s] of [[8, 12], [9, 11], [7, 13]]) {
  const b = P.bruteRatio([r, s]);
  ok(Q.eq(b.overSimplex, P.productTest(r, s)), `brute (${r},${s}) = formula`);
}
ok(Q.cmp(P.productTest(8, 12), Q.of(1)) > 0 && Q.cmp(P.productTest(9, 11), Q.of(1)) > 0 && Q.cmp(P.productTest(7, 13), Q.of(1)) < 0, 'in ℝ²⁰: 8+12 and 9+11 also beat the simplex, 7+13 does not');

// ------------------------------------------------- products in every dimension ---
{
  const B = P.bestPartitions(200);
  const first = B.find((x) => x.logExcess > 1e-12);
  ok(first && first.n === 20, `no product of simplices beats the simplex below ℝ²⁰ (first: ${first && first.n})`);
  ok(B.find((x) => x.n === 20).parts.join('+') === '10+10', 'the best in ℝ²⁰ is 10+10');
  // exact recheck of the float search near the threshold
  for (const x of B.filter((y) => y.n >= 4 && y.n <= 30)) {
    const r = P.partitionRatio(x.parts);
    ok((Q.cmp(r, Q.of(1)) > 0) === (x.n >= 20) || (x.parts.length === 1 && Q.eq(r, Q.of(1))), `exact: dimension ${x.n} best ${x.parts.join('+')}`);
  }
  // every two-factor split below 20 loses, exactly
  for (let n = 4; n < 20; n++) for (let r = 2; r <= n - 2; r++) ok(Q.cmp(P.productTest(r, n - r), Q.of(1)) < 0, `(${r},${n - r}) loses`);
  // the paper's corollary: exponential excess. Our DP: per-dimension rate tends to e^{max_a log c_a / a − 1}.
  const rate = (n) => Math.exp(B.find((x) => x.n === n).logExcess / n);
  ok(rate(200) > 1.02 && rate(100) > 1.015, `excess grows exponentially (rate ${rate(100).toFixed(4)} at 100, ${rate(200).toFixed(4)} at 200)`);
  let bestA = 2; for (let a = 2; a <= 60; a++) if (P.logC(a) / a > P.logC(bestA) / bestA) bestA = a;
  ok(bestA === 12 || bestA === 13, `log c_a / a peaks at a = ${bestA}`);
}

// --------------------------------------------------------- Petty's constant ---
ok(Math.abs(Math.exp(P.logKappa(2)) - Math.PI) < 1e-12 && Math.abs(Math.exp(P.logKappa(3)) - (4 * Math.PI) / 3) < 1e-12 && Math.abs(Math.exp(P.logKappa(1)) - 2) < 1e-12, 'κ₁ = 2, κ₂ = π, κ₃ = 4π/3');
ok(Math.abs(Math.exp(P.logKappa(4)) - (Math.PI ** 2) / 2) < 1e-12 && Math.abs(Math.exp(P.logKappa(5)) - (8 * Math.PI ** 2) / 15) < 1e-12, 'κ₄, κ₅');
ok(Math.abs(Math.exp(P.logPetty(3)) - (3 * Math.PI ** 2) / 4) < 1e-12, 'Petty constant in ℝ³ = 3π²/4');
ok(Math.abs(Math.exp(P.logPetty(2)) - 4) < 1e-12, 'Petty constant in ℝ² = 4');
for (let n = 2; n <= 60; n++) ok(P.logPetty(n) < P.logC(n), `ellipsoid value below simplex value in ℝ^${n}`);
// the unit cube: ΠQ = [−1,1]ⁿ, R = 2ⁿ, from its facet zonotope
for (let n = 2; n <= 7; n++) {
  const gens = []; for (let i = 0; i < n; i++) for (const s of [1, -1]) gens.push(Array.from({ length: n }, (_, j) => Q.of(i === j ? s : 0)));
  ok(Q.eq(P.zonotopeVolume(gens).volume, Q.of(2n ** BigInt(n))), `|Π[0,1]^${n}| = 2^${n}`);
}

// ----------------------------------------------------------------- the plane ---
{
  const rnd = P.rng(4);
  let lo = Infinity, hi = -Infinity;
  for (let t = 0; t < 400; t++) {
    const pts = Array.from({ length: 3 + Math.floor(rnd() * 8) }, () => [rnd() * 10, rnd() * 10]);
    const K = P.hull2(pts); if (K.length < 3) continue;
    const pb = P.projectionBody2(K), R = pb.volume / P.area2(K);
    lo = Math.min(lo, R); hi = Math.max(hi, R);
    // the facet lemma against the definition: h_ΠK(u) = shadow length of K on u⊥
    for (let k = 0; k < 4; k++) {
      const a = rnd() * 2 * Math.PI, u = [Math.cos(a), Math.sin(a)];
      const h = Math.max(...pb.body.map((p) => p[0] * u[0] + p[1] * u[1]));
      ok(Math.abs(h - P.shadow2(K, u)) < 1e-9, 'planar facet lemma: support of ΠK = shadow length');
    }
    ok(Math.abs(P.area2(pb.body) - pb.volume) < 1e-8, 'drawn zonogon has the zonotope-formula area');
  }
  ok(lo >= 4 - 1e-9 && hi <= 6 + 1e-9, `random polygons: 4 ≤ R₂ ≤ 6 (saw ${lo.toFixed(3)}–${hi.toFixed(3)})`);
  const tri = [[0, 0], [3, 0], [1, 2]], sq = [[0, 0], [2, 0], [2, 1], [0, 1]], hex = [[2, 0], [1, 1.7], [-1, 1.7], [-2, 0], [-1, -1.7], [1, -1.7]];
  ok(Math.abs(P.projectionBody2(tri).volume / P.area2(tri) - 6) < 1e-12, 'triangle: R₂ = 6');
  ok(Math.abs(P.projectionBody2(sq).volume / P.area2(sq) - 4) < 1e-12, 'rectangle: R₂ = 4');
  ok(Math.abs(P.projectionBody2(hex).volume / P.area2(hex) - 4) < 1e-12, 'centrally symmetric hexagon: R₂ = 4');
}

// --------------------------------------------------------- three dimensions ---
{
  const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
  const S = P.SOLIDS, R = (k) => P.body3(S[k]);
  ok(near(R('tetrahedron').R, 18), 'tetrahedron: R₃ = 18 = c₃');
  ok(near(R('cube').R, 8), 'cube: R₃ = 8');
  ok(near(R('octahedron').R, 9), 'octahedron: R₃ = 9');
  ok(near(R('triangular prism').R, 12), 'triangular prism: R₃ = 12 = R₂(triangle)·2');
  ok(near(R('tetrahedron').volume, 1 / 6) && near(R('cube').volume, 1), 'volumes');
  ok(R('cube').faces.length === 6 && R('icosahedron').faces.length === 20, 'hull face counts');
  // random hulls lie between the ball and the tetrahedron, and approach the ball
  const rnd = P.rng(8); let worst = 0;
  for (let t = 0; t < 30; t++) { const B = P.body3(Array.from({ length: 6 + Math.floor(rnd() * 10) }, () => [rnd(), rnd(), rnd()])); ok(B.R >= (3 * Math.PI ** 2) / 4 && B.R <= 18 + 1e-9, `random hull R₃ = ${B.R.toFixed(3)} in [3π²/4, 18]`); worst = Math.max(worst, B.R); }
  const big = P.body3(P.spherePoints(120, P.rng(2)));
  ok(big.R < 8 && big.R > (3 * Math.PI ** 2) / 4, `120 points on the sphere: R₃ = ${big.R.toFixed(4)}, close to 3π²/4`);
  // the facet lemma in 3D: h_ΠK(u) = area of the shadow, computed from the projected hull
  const K = S['square pyramid'], B = P.body3(K);
  for (let k = 0; k < 20; k++) {
    const u = P.spherePoints(1, P.rng(100 + k))[0];
    const h = B.gens.reduce((s, g) => s + Math.abs(g[0] * u[0] + g[1] * u[1] + g[2] * u[2]), 0) / 2;
    const a = Math.abs(u[0]) > 0.5 ? [0, 1, 0] : [1, 0, 0];
    const e1 = (() => { const d = a[0] * u[0] + a[1] * u[1] + a[2] * u[2]; const v = a.map((x, i) => x - d * u[i]); const L = Math.hypot(...v); return v.map((x) => x / L); })();
    const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
    const shadow = P.area2(P.hull2(K.map((p) => [p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]])));
    ok(near(h, Math.abs(shadow), 1e-12), '3D facet lemma: ½Σ|⟨s_F ν_F, u⟩| = shadow area');
  }
  // drawn zonotope faces: every face lies on a supporting plane at distance h_ΠK(n)
  for (const k of Object.keys(S)) {
    const B2 = P.body3(S[k]), F = P.zonotopeFaces(B2.gens);
    let bad = 0;
    for (const f of F) {
      const h = B2.gens.reduce((s, g) => s + Math.abs(g[0] * f.normal[0] + g[1] * f.normal[1] + g[2] * f.normal[2]), 0) / 2;
      for (const p of f.poly) if (Math.abs(p[0] * f.normal[0] + p[1] * f.normal[1] + p[2] * f.normal[2] - h) > 1e-9) bad++;
    }
    ok(bad === 0 && F.length >= 6, `${k}: ${F.length} zonotope faces all on their supporting planes`);
  }
}

console.log(`petty: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
