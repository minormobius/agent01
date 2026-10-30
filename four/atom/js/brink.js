/* Helium-4 clusters, microscopic, in d dimensions, no DOM: Brink's model. Each helium-4 is four nucleons (spin up and
   down, proton and neutron) in one Gaussian orbital φ_R(r) = (2ν/π)^(d/4) e^(−ν(r − R)²), and a nucleus of N of them is
   the Slater determinant of all 4N: fully antisymmetrized, so the Pauli principle is exact (no forbidden states to
   remove, no folding factor). Superposing many placements of the N centres (Hill–Wheeler's generator coordinates), with
   the rotations averaged out, gives the nucleus's states. Every integral is a Gaussian one, closed in any d.

   The force is Minnesota's (Thompson, LeMere and Tang 1977), the one built for this: [V_R + ½(1 + P^σ) V_t + ½(1 − P^σ)
   V_s] · ½[u + (2 − u) P^r], its attractive V_t and V_s scaled by s as everywhere in the book. u weighs the force in odd
   partial waves, which helium-4 alone never feels; it's set on our beryllium-8. With every orbital holding all four
   spin–isospin states, the force's operators reduce to two weights per Gaussian term: a direct one D on ⟨ij|v|kl⟩ and an
   exchange one X on ⟨ij|v|lk⟩ (V_R: 10u − 4 and 10u − 16; V_t: 9u − 6 and 9u − 12; V_s: u + 2 and u − 4; Coulomb between
   protons 4 and 2). Between two determinants with orbital overlaps B (N × N) and C = B⁻¹, the norm is det(B)⁴ and the
   energy 4 Σ t_ik C_ki + ½ Σ C_ki C_lj (D ⟨ij|v|kl⟩ − X ⟨ij|v|lk⟩), less the centre of mass's d ħ²ν/2m.

   Coulomb is the pinned 1/r in both worlds, so between Gaussian clouds it's erf(√ν S)/S ours and, in 4D,
   (√(πν)/2) e^(−x)(I₀(x) + I₁(x)) with x = νS²/2 (from 1/r = (2/√π)∫e^(−t²r²)dt). */
import { HB2M, E2, coulombAvg } from "./nuclear.js";
export { coulombAvg };

const T1 = HB2M / 2; // ħ²/2m
export const MNB = { VR: 200, kR: 1.487, Vt: -178, kt: 0.639, Vs: -91.85, ks: 0.465 };
export function weights(s, u) {
  return [{ k: MNB.kR, D: MNB.VR * (10 * u - 4), X: MNB.VR * (10 * u - 16) }, { k: MNB.kt, D: s * MNB.Vt * (9 * u - 6), X: s * MNB.Vt * (9 * u - 12) }, { k: MNB.ks, D: s * MNB.Vs * (u + 2), X: s * MNB.Vs * (u - 4) }];
}
const dist2 = (a, b) => { let t = 0; for (let k = 0; k < a.length; k++) t += (a[k] - b[k]) ** 2; return t; };
/* the norm and energy kernels between two placements a and b (arrays of N centres, each a d-vector) */
export function kernel(a, b, { d, nu, s, u, coulomb = true, three = null }) {
  const N = a.length, W = weights(s, u), B = [], t = [];
  for (let i = 0; i < N; i++) { B.push([]); t.push([]); for (let k = 0; k < N; k++) { const r2 = dist2(a[i], b[k]), o = Math.exp((-nu * r2) / 2); B[i].push(o); t[i].push(T1 * nu * (d - nu * r2) * o); } }
  const { inv: C, det } = invert(B); if (!(Math.abs(det) > 1e-300)) return { n: 0, h: 0 };
  let T = 0; for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) T += t[i][k] * C[k][i]; T *= 4;
  // the pair centres M_ik = (a_i + b_k)/2, once
  const M = a.map((ai) => b.map((bk) => ai.map((x, q) => (x + bk[q]) / 2)));
  const v = (i, j, k, l) => { // D ⟨ij|v|kl⟩ − X ⟨ij|v|lk⟩, each over the overlaps
    const ovd = B[i][k] * B[j][l], ovx = B[i][l] * B[j][k], Sd = dist2(M[i][k], M[j][l]), Sx = dist2(M[i][l], M[j][k]); let e = 0;
    for (const w of W) { const f = (nu / (nu + w.k)) ** (d / 2), g = (nu * w.k) / (nu + w.k); e += f * (w.D * ovd * Math.exp(-g * Sd) - w.X * ovx * Math.exp(-g * Sx)); }
    if (coulomb) e += E2 * (4 * ovd * coulombAvg(d, nu, Math.sqrt(Sd)) - 2 * ovx * coulombAvg(d, nu, Math.sqrt(Sx)));
    return e;
  };
  let V = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) { const cki = C[k][i]; if (cki === 0) continue; for (let l = 0; l < N; l++) V += cki * C[l][j] * v(i, j, k, l); }
  const n = det ** 4;
  return { n, h: n * (T + V / 2 + (three ? threeBody(N, B, C, M, d, nu, three) : 0) - d * T1 * nu) };
}
/* the three-nucleon force W Σ_cyclic e^(−(r_ij² + r_ik²)/b²) (nuclear.js's threeForce: one function of distance in both
   worlds), between the same two determinants. It doesn't act on spin or isospin, so with all four states in each orbital
   the six orderings of the ket's three orbitals weigh 64 (as they are), −16 (two swapped) and +4 (all three moved):
   E₃ = ½ Σ C_li C_mj C_nk Σ_σ w_σ ⟨ijk|w|σ(lmn)⟩, w(1; 2, 3) = W e^(−(r₁₂² + r₁₃²)/b²). Each ⟨…⟩ is closed: with the
   pair densities φ_iφ_l = B_il (2ν/π)^(d/2) e^(−2ν(r − M_il)²), integrating out particles 2 and 3 leaves Gaussians of
   exponent γ = 2νβ/(2ν + β) (β = 1/b²) about their centres, and the last integral is three Gaussians' */
function threeBody(N, B, C, M, d, nu, { W, b }) {
  const beta = 1 / (b * b), g = (2 * nu * beta) / (2 * nu + beta), F = W * (2 * nu / (2 * nu + beta)) ** d * (2 * nu / (2 * nu + 2 * g)) ** (d / 2), a1 = (2 * nu * g) / (2 * nu + 2 * g), a2 = (g * g) / (2 * nu + 2 * g);
  const P = N * N, ov = new Float64Array(P), E1 = new Float64Array(P * P), E2m = new Float64Array(P * P);
  for (let i = 0; i < N; i++) for (let l = 0; l < N; l++) ov[i * N + l] = B[i][l];
  for (let p = 0; p < P; p++) for (let q = 0; q < P; q++) { const r2 = dist2(M[Math.floor(p / N)][p % N], M[Math.floor(q / N)][q % N]); E1[p * P + q] = Math.exp(-a1 * r2); E2m[p * P + q] = Math.exp(-a2 * r2); }
  const w = (p, q, r) => ov[p] * ov[q] * ov[r] * E1[p * P + q] * E1[p * P + r] * E2m[q * P + r];
  let e = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) for (let l = 0; l < N; l++) { const cl = C[l][i]; if (!cl) continue;
    for (let m = 0; m < N; m++) { const clm = cl * C[m][j]; if (!clm) continue;
      for (let n = 0; n < N; n++) { const c3 = clm * C[n][k]; if (!c3) continue; const I = i * N, J = j * N, K = k * N;
        e += c3 * (64 * w(I + l, J + m, K + n) - 16 * (w(I + m, J + l, K + n) + w(I + n, J + m, K + l) + w(I + l, J + n, K + m)) + 4 * (w(I + m, J + n, K + l) + w(I + n, J + l, K + m))); } } }
  return 0.5 * F * e;
}
function invert(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]); let det = 1;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return { inv: null, det: 0 };
    if (p !== c) { [M[p], M[c]] = [M[c], M[p]]; det = -det; }
    const piv = M[c][c]; det *= piv; for (let j = 0; j < 2 * n; j++) M[c][j] /= piv;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return { inv: M.map((r) => r.slice(n)), det };
}
/* one helium-4 (all four in one orbital): its energy at width ν, and the width that minimizes it */
export function alphaEnergy(d, nu, s, u = 1, three = null) { return kernel([Array(d).fill(0)], [Array(d).fill(0)], { d, nu, s, u, three }).h; }
export function bestNu(d, s, three = null) { let lo = 0.05, hi = 1.5; for (let it = 0; it < 80; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (alphaEnergy(d, m1, s, 1, three) < alphaEnergy(d, m2, s, 1, three)) hi = m2; else lo = m1; } return (lo + hi) / 2; }

/* symmetric eigenproblem by cyclic Jacobi: values ascending, vectors as columns */
export function eigSym(A0) {
  const n = A0.length, A = A0.map((r) => Float64Array.from(r)), V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2; if (off < 1e-26) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - sn * akq; A[k][q] = sn * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - sn * aqk; A[q][k] = sn * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - sn * vkq; V[k][q] = sn * vkp + c * vkq; }
    }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((x, y) => A[x][x] - A[y][y]);
  return { values: idx.map((i) => A[i][i]), vectors: idx.map((i) => V.map((r) => r[i])) };
}
/* Hill–Wheeler: the lowest energies of H c = E N c, dropping directions the basis barely spans (norm below tol × largest) */
export function hillWheeler(Nm, Hm, tol = 1e-9) {
  const n = Nm.length, sc = Nm.map((r, i) => 1 / Math.sqrt(r[i])), N = Nm.map((r, i) => r.map((x, j) => x * sc[i] * sc[j])), H = Hm.map((r, i) => r.map((x, j) => x * sc[i] * sc[j]));
  const { values: lam, vectors: U } = eigSym(N), top = lam[n - 1], keep = lam.map((l, i) => i).filter((i) => lam[i] > tol * top);
  const X = keep.map((i) => U[i].map((x) => x / Math.sqrt(lam[i]))), m = X.length;
  const Hp = Array.from({ length: m }, (_, a) => Array.from({ length: m }, (_, b) => { let t = 0; for (let i = 0; i < n; i++) { const xi = X[a][i]; if (!xi) continue; let r = 0; for (let j = 0; j < n; j++) r += H[i][j] * X[b][j]; t += xi * r; } return t; }));
  for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) { const s = (Hp[a][b] + Hp[b][a]) / 2; Hp[a][b] = Hp[b][a] = s; }
  return eigSym(Hp).values;
}

/* two helium-4s a distance D apart along an axis, projected onto spin J (0 or 2) by averaging the kernel over the angle
   θ between the two axes, weighted by sin^(d−2)θ and the zonal harmonic C_J^((d−2)/2)(cos θ) */
export function twoAlpha({ d, nu, s, u, J = 0, Ds = null, M = 48, three = null }) {
  const D = Ds ?? Array.from({ length: 22 }, (_, i) => 0.6 + i * 0.55), lam = (d - 2) / 2, Cj = (x) => (J === 0 ? 1 : 2 * lam * (lam + 1) * x * x - lam);
  const pos = (Dv, th) => { const a = Array(d).fill(0), b = Array(d).fill(0); a[0] = (Dv / 2) * Math.cos(th); a[1] = (Dv / 2) * Math.sin(th); b[0] = -a[0]; b[1] = -a[1]; return [a, b]; };
  const n = D.length, Nm = Array.from({ length: n }, () => new Array(n).fill(0)), Hm = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    let sn = 0, sh = 0; for (let q = 0; q < M; q++) { const th = (Math.PI * (q + 0.5)) / M, w = Math.sin(th) ** (d - 2) * Cj(Math.cos(th)), K = kernel(pos(D[i], 0), pos(D[j], th), { d, nu, s, u, three }); sn += w * K.n; sh += w * K.h; }
    Nm[i][j] = Nm[j][i] = sn; Hm[i][j] = Hm[j][i] = sh;
  }
  return hillWheeler(Nm, Hm);
}
/* N helium-4s: a basis of K random placements (centre of mass at the origin, any orientation; the rotations are averaged
   out by the basis itself), seeded, then Hill–Wheeler. spread sets how far apart the placements range */
export function clusterGCM({ d, N, nu, s, u, K = 120, seed = 1, spread = [0.5, 1.6], minD = 0.9, three = null }) {
  let st = (seed * 2654435761) >>> 0; const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let z = st; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
  const gau = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd()), basis = [];
  while (basis.length < K) {
    const sp = spread[0] + (spread[1] - spread[0]) * rnd(), c = Array.from({ length: N }, () => Array.from({ length: d }, () => sp * gau())), m = Array(d).fill(0);
    for (const p of c) for (let q = 0; q < d; q++) m[q] += p[q] / N; for (const p of c) for (let q = 0; q < d; q++) p[q] -= m[q];
    let ok = true; for (let i = 0; i < N && ok; i++) for (let j = i + 1; j < N; j++) if (dist2(c[i], c[j]) < minD * minD) { ok = false; break; }
    if (ok) basis.push(c);
  }
  const Nm = Array.from({ length: K }, () => new Array(K).fill(0)), Hm = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) for (let j = i; j < K; j++) { const k = kernel(basis[i], basis[j], { d, nu, s, u, three }); Nm[i][j] = Nm[j][i] = k.n; Hm[i][j] = Hm[j][i] = k.h; }
  return hillWheeler(Nm, Hm);
}
