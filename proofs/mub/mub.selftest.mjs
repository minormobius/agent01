// node proofs/mub/mub.selftest.mjs — holds mub.js to the papers' statements and to
// independent recomputation. Exit 1 on any failure.
import * as M from './mub.js';
const { cx, Z } = M;

let pass = 0, fail = 0;
const t0 = Date.now();
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('FAIL', msg); } }

// ---------------------------------------------------------------- ℤ[ζ₁₂] ---
for (let a = -14; a <= 14; a++) for (let b = -14; b <= 14; b++) {
  ok(Z.eq(Z.mul(Z.pow(a), Z.pow(b)), Z.pow(a + b)), `ζ^${a}·ζ^${b}`);
}
for (let k = 0; k < 12; k++) {
  const c = Z.toC(Z.pow(k));
  ok(Math.abs(c[0] - Math.cos((k * Math.PI) / 6)) < 1e-12 && Math.abs(c[1] - Math.sin((k * Math.PI) / 6)) < 1e-12, `ζ^${k} numeric`);
  ok(Z.eq(Z.conj(Z.pow(k)), Z.pow(-k)), `conj ζ^${k}`);
  ok(Z.eq(Z.norm(Z.pow(k)), Z.int(1)), `|ζ^${k}| = 1`);
}
ok(Z.eq(Z.add(Z.add(Z.int(1), Z.pow(4)), Z.pow(8)), Z.zero()), '1 + ω + ω² = 0');
const sqrt3 = Z.add(Z.pow(1), Z.pow(-1));
ok(Z.eq(Z.mul(sqrt3, sqrt3), Z.int(3)), '(ζ + ζ⁻¹)² = 3');
// the paper's two sums: 1 + 2ω and 2 + ω² each have squared modulus 3
ok(Z.eq(Z.norm(Z.add(Z.int(1), Z.mul(Z.int(2), Z.pow(4)))), Z.int(3)), '|1 + 2ω|² = 3');
ok(Z.eq(Z.norm(Z.add(Z.int(2), Z.pow(8))), Z.int(3)), '|2 + ω²|² = 3');

// ------------------------------------------------------------ three bases ---
const bases = M.tensorBases();
ok(bases.length === 3 && bases.every((b) => b.exps.length === 6 && b.exps.every((r) => r.length === 6)), 'three 6×6 bases');
ok(bases[0].exps.every((r, i) => r.every((e, j) => (i === j ? e === 0 : e === null))), 'U₀ = I₆');
const rows = M.exactCheck(bases);
ok(rows.length === 6, 'six pairs (r ≤ s)');
for (const r of rows) ok(r.ok === 36 && r.total === 36, `exact: bases ${r.r},${r.s} all 36 inner products (${r.ok})`);
// numeric agreement with the exact verdict
const vecs = bases.map(M.basisVectors);
for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
  const x = cx.abs2(M.inner(vecs[r][i], vecs[s][j])), want = r === s ? (i === j ? 1 : 0) : 1 / 6;
  ok(Math.abs(x - want) < 1e-14, `numeric |⟨u${r}${i},u${s}${j}⟩|²`);
}
// a broken basis must fail the exact check (the check is not vacuous)
{
  const bad = M.tensorBases(); bad[2].exps[0][0] = (bad[2].exps[0][0] + 1) % 12;
  const r = M.exactCheck(bad);
  ok(r.some((x) => x.ok < 36), 'exact check rejects a perturbed basis');
}
// the cross product the paper singles out: A₁*A₂ = ½[[1+i, 1−i], [1−i, 1+i]]
{
  const A1 = [[[0, 0], [0, 6]]][0], A2 = [[0, 0], [3, 9]];
  const el = (e) => Z.pow(e), m = [[0, 0], [0, 0]].map((row, i) => row.map((_, j) => {
    let s = Z.zero(); for (let t = 0; t < 2; t++) s = Z.add(s, Z.mul(Z.conj(el(A1[t][i])), el(A2[t][j]))); return s;
  }));
  const onePlusI = Z.add(Z.int(1), Z.pow(3)), oneMinusI = Z.sub(Z.int(1), Z.pow(3));
  ok(Z.eq(m[0][0], onePlusI) && Z.eq(m[0][1], oneMinusI) && Z.eq(m[1][0], oneMinusI) && Z.eq(m[1][1], onePlusI), '2·A₁*A₂ = [[1+i,1−i],[1−i,1+i]]');
}

// ---------------------------------------------------- the Fourier pair ---
const G = M.grasslVectors({ starts: 2000, seed: 7 });
ok(G.vectors.length === 48, `48 vectors unbiased to I and F₆ (got ${G.vectors.length})`);
ok(G.firstFull !== null && G.firstFull < 1000, `all 48 found within 1000 starts (at ${G.firstFull})`);
ok(G.maxResidual < 1e-13, 'every residual below 1e−13');
for (const seed of [1, 2, 3]) ok(M.grasslVectors({ starts: 2000, seed }).vectors.length === 48, `seed ${seed}: 48 again`);
const F6 = M.fourierMatrix(6), cols = F6[0].map((_, j) => F6.map((r) => r[j]));
let worstI = 0, worstF = 0;
for (const v of G.vectors) {
  for (const z of v) worstI = Math.max(worstI, Math.abs(cx.abs2(z) - 1));
  for (const c of cols) worstF = Math.max(worstF, Math.abs(cx.abs2(M.inner(c, v)) / 36 - 1 / 6));
}
ok(worstI < 1e-14, 'unbiased to the standard basis');
ok(worstF < 1e-13, `unbiased to F₆/√6 (worst ${worstF.toExponential(1)})`);
// the phases: multiples of 15°, or offsets by θ with sin θ = (√3 − 1)/2
{
  const s = (Math.sqrt(3) - 1) / 2, th = Math.asin(s);
  let explained = 0, total = 0;
  for (const ph of G.phases) for (const t of ph) {
    total++;
    const ok15 = (u) => { const q = u / (Math.PI / 12); return Math.abs(q - Math.round(q)) < 1e-9; };
    if (ok15(t) || ok15(t - th) || ok15(t + th) || ok15(t - 2 * th) || ok15(t + 2 * th)) explained++;
  }
  ok(explained === total, `every phase is k·15° or k·15° ± θ, ± 2θ with sin θ = (√3−1)/2 (${explained}/${total})`);
}
const C = M.stageC(G.vectors);
ok(C.maxErr < 1e-13, `edges decided to within ${C.maxErr.toExponential(1)}`);
ok(C.margin > 0.01, `every other overlap is at least ${C.margin.toFixed(4)} from 0 and from 1/6`);
ok(C.cliques.length === 16, `16 orthonormal bases among the 48 (got ${C.cliques.length})`);
ok(C.cliques.every((c) => c.length === 6), 'each a 6-clique');
ok(C.full === 0, 'no two of them are mutually unbiased (Grassl 2004, Thm 2)');
ok(Math.max(...C.pairs.map((p) => p.cross)) < 36, `best pair has ${Math.max(...C.pairs.map((p) => p.cross))}/36 unbiased cross edges`);
// independent: each clique is an orthonormal basis numerically
for (const c of C.cliques) {
  let e = 0; for (const a of c) for (const b of c) e = Math.max(e, Math.abs(cx.abs2(M.inner(G.vectors[a], G.vectors[b])) / 36 - (a === b ? 1 : 0)));
  ok(e < 1e-13, 'clique is orthonormal');
}
// the 48 vectors split evenly over the 16 bases?
{
  const used = new Map(); for (const c of C.cliques) for (const v of c) used.set(v, (used.get(v) || 0) + 1);
  ok(used.size === 48, `every vector lies in some basis (${used.size}/48)`);
}

// ------------------------------------------------- searching for k bases ---
for (const [d, k, want] of [[2, 3, 'zero'], [3, 4, 'zero'], [5, 4, 'zero'], [6, 3, 'zero']]) {
  let best = Infinity; for (const seed of [1, 2, 3, 4]) best = Math.min(best, M.mubSearch(d, k, { steps: 8000, seed }).f);
  ok(best < 1e-12, `search reaches f = 0 for ${k} bases in d = ${d} (${best.toExponential(1)})`);
}
{
  const fs = [1, 2, 3, 4].map((seed) => M.mubSearch(6, 4, { steps: 8000, seed }).f);
  ok(Math.min(...fs) > 0.04, `four bases in d = 6: every run stalls (best f = ${Math.min(...fs).toFixed(4)})`);
}
// the gradient is the gradient
{
  const d = 4, k = 3, n = (k - 1) * d * d * 2, rnd = M.rng(5), x = Float64Array.from({ length: n }, () => rnd() * 2 - 1), g = new Float64Array(n);
  M.mubObjective(d, k, x, g);
  let worst = 0;
  for (let p = 0; p < n; p += 3) { const h = 1e-6, xp = Float64Array.from(x), xm = Float64Array.from(x); xp[p] += h; xm[p] -= h; worst = Math.max(worst, Math.abs((M.mubObjective(d, k, xp) - M.mubObjective(d, k, xm)) / (2 * h) - g[p])); }
  ok(worst < 1e-6, `analytic gradient matches finite differences (${worst.toExponential(1)})`);
}

// ------------------------------------------------- Hadamard / Fourier ---
const Q = M.charges();
ok(Q.length === 20, '20 charges π·α');
ok(Q.every((q) => q.a.reduce((s, x) => s + x, 0) === 0 && q.a.filter((x) => x === 1).length === 3), 'each charge is a permutation of (1,1,1,−1,−1,−1)');
const T = M.tao();
ok(M.hadamardError(T) < 1e-13, 'Tao T is Hadamard');
ok(M.hadamardError(M.square(T)) < 1e-13, 'T∘T is Hadamard (the paper: "its entrywise square is Hadamard")');
ok(M.isCubic(T), 'T has cube-root entries');
// the paper's rule for t_ij: 0 on row 0, column 0, diagonal; 1 when i − j ≡ ±1 (mod 5); −1 otherwise
{
  let agree = true;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    const want = i === 0 || j === 0 || i === j ? 0 : (((i - j) % 5) + 5) % 5 === 1 || (((i - j) % 5) + 5) % 5 === 4 ? 1 : 2;
    if (M.TAO_EXPONENT[i][j] !== want) agree = false;
  }
  ok(agree, 'Lean taoExponent = the paper\'s t_ij');
}
for (const q of Q) {
  ok(Z.eq(M.gExact(M.TAO_ZETA, q.a), Z.int(9)), `Tao: |6·g(π·α)|² = 9 exactly, so |g| = 1/2 (plus ${q.plus})`);
  ok(Z.isZero(M.gExact(M.F6_ZETA, q.a)) || false, `F₆: g(π·α) = 0 exactly (plus ${q.plus})`);
  ok(Math.abs(Math.hypot(...M.gValue(T, q.a)) - 0.5) < 1e-13, 'Tao numeric |g| = 1/2');
}
ok(M.hadamardError(M.fourierMatrix(6)) < 1e-13, 'F₆ is Hadamard');
ok(M.hadamardError(M.square(M.fourierMatrix(6))) > 1, 'F₆∘F₆ is not Hadamard');
// the affine family F₆⁽²⁾(a,b): Hadamard everywhere, and g vanishes
{
  const rnd = M.rng(11); let worstH = 0, worstG = 0;
  for (let t = 0; t < 200; t++) {
    const H = M.fourierFamily(rnd() * 6.3, rnd() * 6.3);
    worstH = Math.max(worstH, M.hadamardError(H));
    for (const q of Q) worstG = Math.max(worstG, Math.hypot(...M.gValue(H, q.a)));
  }
  ok(worstH < 1e-12, 'F₆⁽²⁾(a,b) is Hadamard for 200 random (a,b)');
  ok(worstG < 1e-12, `and every g(π·α) vanishes (worst ${worstG.toExponential(1)})`);
}
// random Hadamard matrices: g vanishes unless the matrix is in the cubic class
{
  const rnd = M.rng(3); let n = 0, cubic = 0, worstZero = 0, bad = 0, worstH = 0;
  for (let t = 0; t < 300; t++) {
    const H = M.randomHadamard(rnd); if (!H) continue; n++;
    worstH = Math.max(worstH, M.hadamardError(H));
    const gmax = Math.max(...Q.map((q) => Math.hypot(...M.gValue(H, q.a))));
    if (M.isCubic(H)) { cubic++; if (Math.abs(gmax - 0.5) > 1e-9) bad++; } else { worstZero = Math.max(worstZero, gmax); }
  }
  ok(n >= 290, `random Hadamard found (${n}/300)`);
  ok(worstH < 1e-12, 'each is Hadamard');
  ok(worstZero < 1e-11, `non-cubic: every g(π·α) vanishes (worst ${worstZero.toExponential(1)}, ${n - cubic} matrices)`);
  ok(cubic > 0 && bad === 0, `cubic: |g| = 1/2 (${cubic} matrices)`);
}
// the Lean `Equivalent`: K i j = u i * H (r i) (c j) * v j. The values |g(π·α)| over all π
// are a class invariant, and so is isCubic.
{
  const rnd = M.rng(9);
  const equiv = (H) => M.randomEquivalent(H, rnd);
  const profile = (H) => Q.map((q) => Math.hypot(...M.gValue(H, q.a))).sort((a, b) => a - b);
  for (let t = 0; t < 20; t++) {
    const K = equiv(T);
    ok(M.hadamardError(K) < 1e-12 && M.isCubic(K), 'an equivalent of T is Hadamard and cubic');
    ok(profile(K).every((x) => Math.abs(x - 0.5) < 1e-12), 'and keeps |g| = 1/2 at all 20 charges');
    const H = M.randomHadamard(rnd);
    if (H && !M.isCubic(H)) { const K2 = equiv(H); ok(!M.isCubic(K2) && profile(K2).every((x) => x < 1e-11), 'an equivalent of a non-cubic matrix keeps g = 0'); }
  }
}

console.log(`mub: ${pass} passed, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
