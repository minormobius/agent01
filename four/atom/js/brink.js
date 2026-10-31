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

/* ———— a nucleon on a helium-4, microscopically ————
   Once one nucleon sits outside the helium-4s the orbitals no longer hold all four spin–isospin states, so the kernel has
   to follow each nucleon's own: species 0 p↑, 1 p↓, 2 n↑, 3 n↓ (spin = bit 0, isospin = bit 1). The overlap is
   ⟨φ_i|φ_k⟩ δ(species), C = B⁻¹, and the force's operators act on the species directly: Minnesota's per Gaussian term is
   W + B P^σ − H P^τ − M P^σP^τ (V_R: W = uV_R/2, M = (1 − u/2)V_R; V_t: W = B = uV_t/4, H = M = (1 − u/2)V_t/2; V_s: W = uV_s/4,
   B = −uV_s/4, H = −(1 − u/2)V_s/2, M = (1 − u/2)V_s/2), Coulomb acts between protons, and the three-nucleon force on
   none of it (each ordering of the ket weighs its sign when the species follow). For all-saturated orbitals it is
   kernel() above, which the self-test holds it to. */
function mixtures(s, u) {
  return [{ k: MNB.kR, W: (u * MNB.VR) / 2, B: 0, H: 0, M: (1 - u / 2) * MNB.VR }, { k: MNB.kt, W: (u * s * MNB.Vt) / 4, B: (u * s * MNB.Vt) / 4, H: ((1 - u / 2) * s * MNB.Vt) / 2, M: ((1 - u / 2) * s * MNB.Vt) / 2 },
    { k: MNB.ks, W: (u * s * MNB.Vs) / 4, B: (-u * s * MNB.Vs) / 4, H: (-(1 - u / 2) * s * MNB.Vs) / 2, M: ((1 - u / 2) * s * MNB.Vs) / 2 }];
}
const sg = (x) => x & 1, ti = (x) => x >> 1;
/* ⟨a b| O |c d⟩ for O = W + B P^σ − H P^τ − M P^σP^τ, on species */
function spinIso(m, a, b, c, d) {
  let o = 0; if (a === c && b === d) o += m.W; if (sg(a) === sg(d) && sg(b) === sg(c) && ti(a) === ti(c) && ti(b) === ti(d)) o += m.B;
  if (sg(a) === sg(c) && sg(b) === sg(d) && ti(a) === ti(d) && ti(b) === ti(c)) o -= m.H; if (a === d && b === c) o -= m.M; return o;
}
const PERMS = [[[0, 1, 2], 1], [[1, 0, 2], -1], [[2, 1, 0], -1], [[0, 2, 1], -1], [[1, 2, 0], 1], [[2, 0, 1], 1]];
/* norm and energy kernels between two lists of orbitals [{R: d-vector, sp: species}] */
export function kernelSpecies(a, b, { d, nu, s, u, coulomb = true, three = null }) {
  const N = a.length, B = [], t = [];
  for (let i = 0; i < N; i++) { B.push([]); t.push([]); for (let k = 0; k < N; k++) { const r2 = dist2(a[i].R, b[k].R), o = a[i].sp === b[k].sp ? Math.exp((-nu * r2) / 2) : 0; B[i].push(o); t[i].push(T1 * nu * (d - nu * r2) * o); } }
  const { inv: C, det } = invert(B); if (!C || !(Math.abs(det) > 1e-300)) return { n: 0, h: 0 };
  let T = 0; for (let i = 0; i < N; i++) for (let k = 0; k < N; k++) T += t[i][k] * C[k][i];
  const ov = (i, k) => Math.exp((-nu * dist2(a[i].R, b[k].R)) / 2), M = a.map((ai) => b.map((bk) => ai.R.map((x, q) => (x + bk.R[q]) / 2))), mix = mixtures(s, u);
  const spatial = (i, j, k, l) => { const o = ov(i, k) * ov(j, l), S = dist2(M[i][k], M[j][l]); return { o, S }; };
  let V = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) { const cki = C[k][i]; if (!cki) continue; for (let l = 0; l < N; l++) { const clj = C[l][j]; if (!clj) continue;
    const dr = spatial(i, j, k, l), ex = spatial(i, j, l, k), A = a[i].sp, Bs = a[j].sp, Cs = b[k].sp, Ds = b[l].sp; let e = 0;
    for (const m of mix) { const f = (nu / (nu + m.k)) ** (d / 2), g = (nu * m.k) / (nu + m.k); e += f * (spinIso(m, A, Bs, Cs, Ds) * dr.o * Math.exp(-g * dr.S) - spinIso(m, A, Bs, Ds, Cs) * ex.o * Math.exp(-g * ex.S)); }
    if (coulomb && ti(A) === 0 && ti(Bs) === 0) e += E2 * ((A === Cs && Bs === Ds ? dr.o * coulombAvg(d, nu, Math.sqrt(dr.S)) : 0) - (A === Ds && Bs === Cs ? ex.o * coulombAvg(d, nu, Math.sqrt(ex.S)) : 0));
    V += cki * clj * e; } }
  let E3 = 0;
  if (three) {
    const beta = 1 / (three.b * three.b), g = (2 * nu * beta) / (2 * nu + beta), F = three.W * (2 * nu / (2 * nu + beta)) ** d * (2 * nu / (2 * nu + 2 * g)) ** (d / 2), a1 = (2 * nu * g) / (2 * nu + 2 * g), a2 = (g * g) / (2 * nu + 2 * g);
    const w = (p, q, r) => ov(p[0], p[1]) * ov(q[0], q[1]) * ov(r[0], r[1]) * Math.exp(-a1 * (dist2(M[p[0]][p[1]], M[q[0]][q[1]]) + dist2(M[p[0]][p[1]], M[r[0]][r[1]])) - a2 * dist2(M[q[0]][q[1]], M[r[0]][r[1]]));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) for (let l = 0; l < N; l++) { const cl = C[l][i]; if (!cl) continue;
      for (let m = 0; m < N; m++) { const cm = cl * C[m][j]; if (!cm) continue; for (let n = 0; n < N; n++) { const c3 = cm * C[n][k]; if (!c3) continue; const ket = [l, m, n], bra = [i, j, k];
        for (const [p, sgn] of PERMS) { const kk = [ket[p[0]], ket[p[1]], ket[p[2]]]; if (a[i].sp !== b[kk[0]].sp || a[j].sp !== b[kk[1]].sp || a[k].sp !== b[kk[2]].sp) continue; E3 += sgn * c3 * w([bra[0], kk[0]], [bra[1], kk[1]], [bra[2], kk[2]]); } } } }
    E3 *= 0.5 * F;
  }
  const n = det;
  return { n, h: n * (T + V / 2 + E3 - d * T1 * nu) };
}
/* the helium-4 at a point as four orbitals, one per species */
export const alphaOrbitals = (R) => [0, 1, 2, 3].map((sp) => ({ R, sp }));
/* a proton (Z = 1) or neutron (Z = 0) on a helium-4 a distance D apart (centre of mass fixed), projected onto relative
   angular momentum l by the angle average, weighted by C_l^((d−2)/2)(cos θ) sin^(d−2)θ, then Hill–Wheeler over D: the
   states of mass 5 against a free nucleon and helium-4 in the same model. No spin–orbit force: the l > 0 states are the
   centres of their doublets */
export function nucleonAlpha({ d, nu, s, u, l = 1, Z = 0, Ds = null, M = 40, three = null }) {
  const D = Ds ?? Array.from({ length: 20 }, (_, i) => 0.4 + i * 0.5), lam = (d - 2) / 2, Cl = (x) => (l === 0 ? 1 : l === 1 ? 2 * lam * x : 2 * lam * (lam + 1) * x * x - lam), sp = Z ? 0 : 2;
  const conf = (Dv, th) => { const e = Array(d).fill(0); e[0] = Math.cos(th); e[1] = Math.sin(th); return [...alphaOrbitals(e.map((x) => (-x * Dv) / 5)), { R: e.map((x) => (4 * x * Dv) / 5), sp }]; };
  const n = D.length, Nm = Array.from({ length: n }, () => new Array(n).fill(0)), Hm = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { let sn = 0, sh = 0; for (let q = 0; q < M; q++) { const th = (Math.PI * (q + 0.5)) / M, wt = Math.sin(th) ** (d - 2) * Cl(Math.cos(th)), K = kernelSpecies(conf(D[i], 0), conf(D[j], th), { d, nu, s, u, three }); sn += wt * K.n; sh += wt * K.h; } Nm[i][j] = Nm[j][i] = sn; Hm[i][j] = Hm[j][i] = sh; }
  return hillWheeler(Nm, Hm).map((e) => e - alphaEnergy(d, nu, s, u, three));
}

/* ———— a nucleon on a core of helium-4s ————
   The species-following kernel, factored by species: orbitals overlap only within a species, so B is block diagonal, the
   norm is the product of the blocks' determinants, and the force's operators need only one direct and one exchange
   weight per pair of species, ⟨st|O|st⟩ and ⟨st|O|ts⟩. The same numbers as kernelSpecies (the self-test holds them
   equal), with (Σ n_s²)² terms in place of N⁴. Two-body only: Minnesota and Coulomb. */
export function kernelBlocks(a, b, { d, nu, s, u, coulomb = true }) {
  const sp = [0, 1, 2, 3].map((q) => ({ I: a.map((o, i) => (o.sp === q ? i : -1)).filter((i) => i >= 0), K: b.map((o, k) => (o.sp === q ? k : -1)).filter((k) => k >= 0) }));
  let det = 1; const C = [];
  for (const g of sp) { if (g.I.length !== g.K.length) return { n: 0, h: 0 }; if (!g.I.length) { C.push(null); continue; }
    const Bm = g.I.map((i) => g.K.map((k) => Math.exp((-nu * dist2(a[i].R, b[k].R)) / 2))), r = invert(Bm); if (!r.inv) return { n: 0, h: 0 }; det *= r.det; C.push(r.inv); }
  if (!(Math.abs(det) > 1e-300)) return { n: 0, h: 0 };
  let T = 0;
  for (let q = 0; q < 4; q++) { const g = sp[q]; if (!C[q]) continue; g.I.forEach((i, x) => g.K.forEach((k, y) => { const r2 = dist2(a[i].R, b[k].R); T += T1 * nu * (d - nu * r2) * Math.exp((-nu * r2) / 2) * C[q][y][x]; })); }
  const mix = mixtures(s, u), terms = mix.map((m) => ({ f: (nu / (nu + m.k)) ** (d / 2), g: (nu * m.k) / (nu + m.k), m }));
  // per species, the pair densities ρ_ik = C_ki ⟨φ_i|φ_k⟩ at centres M_ik
  const dens = sp.map((g, q) => (C[q] ? g.I.flatMap((i, x) => g.K.map((k, y) => ({ i, k, w: C[q][y][x], o: Math.exp((-nu * dist2(a[i].R, b[k].R)) / 2), M: a[i].R.map((v, c) => (v + b[k].R[c]) / 2) }))) : []));
  let V = 0;
  for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) { if (!dens[p].length || !dens[q].length) continue;
    const wd = terms.map((t) => spinIso(t.m, p, q, p, q)), wx = terms.map((t) => spinIso(t.m, p, q, q, p)), cd = coulomb && ti(p) === 0 && ti(q) === 0;
    // direct: densities ρ_ik (species p) and ρ_jl (species q); exchange: bra i (p) with ket l (q) and j (q) with k (p), which the
    // pair densities can't carry, so it's summed over the four orbitals directly
    for (const A of dens[p]) for (const Bd of dens[q]) { const S = dist2(A.M, Bd.M), w = A.w * Bd.w * A.o * Bd.o; let e = 0; terms.forEach((t, z) => { e += wd[z] * t.f * Math.exp(-t.g * S); }); if (cd) e += E2 * coulombAvg(d, nu, Math.sqrt(S)); V += w * e; }
    if (wx.some((x) => x !== 0) || (cd && p === q)) {
      const gp = sp[p], gq = sp[q];
      for (const [x, i] of gp.I.entries()) for (const [y2, j] of gq.I.entries()) for (const [yk, k] of gp.K.entries()) { const cki = C[p][yk][x]; if (!cki) continue; for (const [yl, l] of gq.K.entries()) { const clj = C[q][yl][y2]; if (!clj) continue;
        const o = Math.exp((-nu * dist2(a[i].R, b[l].R)) / 2) * Math.exp((-nu * dist2(a[j].R, b[k].R)) / 2), M1 = a[i].R.map((v, c) => (v + b[l].R[c]) / 2), M2 = a[j].R.map((v, c) => (v + b[k].R[c]) / 2), S = dist2(M1, M2);
        let e = 0; terms.forEach((t, z) => { e += wx[z] * t.f * Math.exp(-t.g * S); }); if (cd && p === q) e += E2 * coulombAvg(d, nu, Math.sqrt(S)); V -= cki * clj * o * e; } } }
  }
  return { n: det, h: det * (T + V / 2 - d * T1 * nu) };
}
/* a nucleon (Z = 1 proton, 0 neutron) on a core of k helium-4s: Hill–Wheeler over K random placements of the core
   (as clusterGCM) each with the nucleon put round it, against the core alone over the same core placements. Returns the
   nucleon's separation energy (positive: bound) and both energies. Centre of mass at the origin, weighted by nucleons */
export function nucleonOnCore({ d, k, Z = 0, nu, s, u, K = 160, seed = 1, spread = [0.5, 1.6], minD = 0.9, rN = [1.5, 4.5] }) {
  let st = (seed * 2654435761) >>> 0; const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let z = st; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
  const gau = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd()), cores = [], full = [];
  while (cores.length < K) {
    const spv = spread[0] + (spread[1] - spread[0]) * rnd(), c = Array.from({ length: k }, () => Array.from({ length: d }, () => spv * gau()));
    let ok = true; for (let i = 0; i < k && ok; i++) for (let j = i + 1; j < k; j++) if (dist2(c[i], c[j]) < minD * minD) { ok = false; break; } if (!ok) continue;
    const m0 = Array(d).fill(0); for (const p of c) for (let q = 0; q < d; q++) m0[q] += p[q] / k; for (const p of c) for (let q = 0; q < d; q++) p[q] -= m0[q];
    const dir = Array.from({ length: d }, gau), nd = Math.hypot(...dir), r = rN[0] + (rN[1] - rN[0]) * rnd(), n = dir.map((x) => (x / nd) * r);
    const cm = n.map((x, q) => (x + 4 * c.reduce((t, p) => t + p[q], 0)) / (4 * k + 1)), cf = c.map((p) => p.map((x, q) => x - cm[q])), nf = n.map((x, q) => x - cm[q]);
    cores.push(c); full.push([...cf.flatMap((p) => alphaOrbitals(p)), { R: nf, sp: Z ? 0 : 2 }]);
  }
  const Ec = clusterGCM({ d, N: k, nu, s, u, K, seed, spread, minD })[0];
  const Nm = Array.from({ length: K }, () => new Array(K).fill(0)), Hm = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) for (let j = i; j < K; j++) { const x = kernelBlocks(full[i], full[j], { d, nu, s, u }); Nm[i][j] = Nm[j][i] = x.n; Hm[i][j] = Hm[j][i] = x.h; }
  const EA = hillWheeler(Nm, Hm)[0];
  return { S: Ec - EA, Ec, EA };
}
/* the same with a basis built for the nucleon: M core placements (the most compact of a random draw), each with the
   nucleon on a grid of radii × directions round the core's middle, so its motion can be superposed rather than pinned;
   the core alone over the same M placements, so both sides have the same core freedom and the difference is the
   nucleon's */
export function nucleonOnCoreGrid({ d, k, Z = 0, nu, s, u, M = 6, radii = [0.6, 1.3, 2.0, 2.8, 3.7, 4.8], ndir = 12, seed = 1, spread = [0.5, 1.4], minD = 0.9 }) {
  let st = (seed * 2654435761) >>> 0; const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let z = st; z = Math.imul(z ^ (z >>> 15), z | 1); z ^= z + Math.imul(z ^ (z >>> 7), z | 61); return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
  const gau = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd()), cores = [];
  while (cores.length < M) { const spv = spread[0] + (spread[1] - spread[0]) * rnd(), c = Array.from({ length: k }, () => Array.from({ length: d }, () => spv * gau()));
    let ok = true; for (let i = 0; i < k && ok; i++) for (let j = i + 1; j < k; j++) if (dist2(c[i], c[j]) < minD * minD) { ok = false; break; } if (!ok) continue;
    const m0 = Array(d).fill(0); for (const p of c) for (let q = 0; q < d; q++) m0[q] += p[q] / k; cores.push(c.map((p) => p.map((x, q) => x - m0[q]))); }
  const dirs = Array.from({ length: ndir }, () => { const v = Array.from({ length: d }, gau), n = Math.hypot(...v); return v.map((x) => x / n); });
  const place = (c, n) => { const cm = n.map((x, q) => (x + 4 * c.reduce((t, p) => t + p[q], 0)) / (4 * k + 1)); return [...c.flatMap((p) => alphaOrbitals(p.map((x, q) => x - cm[q]))), { R: n.map((x, q) => x - cm[q]), sp: Z ? 0 : 2 }]; };
  const full = []; for (const c of cores) for (const r of radii) for (const e of dirs) full.push(place(c, e.map((x) => x * r)));
  const solve = (basis, kern) => { const n = basis.length, Nm = Array.from({ length: n }, () => new Array(n).fill(0)), Hm = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const x = kern(basis[i], basis[j]); Nm[i][j] = Nm[j][i] = x.n; Hm[i][j] = Hm[j][i] = x.h; } return hillWheeler(Nm, Hm)[0]; };
  const Ec = solve(cores, (x, y) => kernel(x, y, { d, nu, s, u })), EA = solve(full, (x, y) => kernelBlocks(x, y, { d, nu, s, u }));
  return { S: Ec - EA, Ec, EA, n: full.length };
}
