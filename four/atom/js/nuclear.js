/* Nuclei in any dimension, no DOM: the abundance question's nuclear physics. The book declared nuclei (stable to Z = 78);
   this asks what that takes. In 4D two nucleons meeting head-on still feel 3/4 · ħ²/2μr² (the s-wave's built-in barrier,
   as the stars chapter's tunnelling does), so a force that binds our deuteron needn't bind theirs.

   The force is Malfliet and Tjon's (1969): V(r) = (V_R e^(−μ_R r) − s V_A e^(−μ_A r))/r, a Yukawa repulsion and attraction
   fitted to our nucleon scattering, with the attraction scaled by s (s = 1 ours). Its triplet form (MT-III) is the deuteron's
   channel, its singlet (MT-I) the diproton's and dineutron's, and the spin-averaged MT-V the standard test for helium-4.
   Pinned as charge is, the force between two nucleons is the same function of distance in both worlds; only s is free.

   · levels: radial bound states on a uniform grid (u = r^((d−1)/2) R, L(L+1) = l(l + d − 2) + (d − 1)(d − 3)/4), every
     eigenvalue by Sturm bisection of the tridiagonal problem; pairState adds the ground state's ln R(r) by inverse iteration.
   · window: the strengths at which the deuteron binds, binds as ours does, and the diproton binds.
   · fixedNode: diffusion Monte Carlo for A nucleons as four species (p↑ p↓ n↑ n↓; the force is spin- and isospin-blind,
     so each species' count is kept), ψ = Π_species det[1, x¹ … x^d] × Π_pairs f(r): the s and p oscillator shells
     without their shared Gaussian, so each determinant is translation invariant and harmonic in each particle; f the
     pair's own ground state in V + ω r² (so two nucleons come out exact), ω scaled by 3/(A − 1): a shared Gaussian
     holding the nucleus together is a pair Gaussian ∝ 1/A. With at most one nucleon per species there are
     no nodes and the result is exact (helium-4); past that it is the fixed-node upper bound. Umrigar's guards on drift
     and branching; protons repel by e²/r, pinned 1/r in both worlds. Checked: our helium-4 −31.34 ± 0.14 MeV against
     the published −31.36 for MT-V, tritium −8.12 ± 0.16 against −8.25. Past helium-4 it is NOT yet trustworthy: on our
     own nuclei, MT-V in every wave overbinds (⁶He −48 to −67 MeV, ⁸Be −96 to −137, measured −29.3 and −56.5) and
     Serber's even-wave form, with the exchange read off these nodes, underbinds (⁶He −22.4 ± 2.5, ⁸Be −31 ± 3, ¹²C 0 ± 12,
     measured −92). So the book uses it for A ≤ 4 only; the light nuclei past helium need another method. With steps = 0 it returns the trial's local energy and ln ψ, for checking.
   · shells: the Woods–Saxon single-particle levels with a spin–orbit term. 4D's spin couples to the left half of a
     turning only (js/turning.js, js/magnet.js), so the 3D l·s (l/2 and −(l + 1)/2, 2l + 2 and 2l states) becomes
     2 s·J_L (l/2 and −(l + 2)/2, (l + 1)(l + 2) and l(l + 1) states), at our strength: a declaration.
   · coulombFactor: ½⟨1/r⟩ between two points of a uniform unit d-ball (3/5 in 3D), from js/kernel.js's shell kernel.
   · matter: nuclear matter (equal protons and neutrons, or neutrons alone) by Brueckner–Hartree–Fock, in any d: plane
     waves, the G-matrix in partial waves (the force's Fourier transform 4πV/(p² + μ²) in 3D and 4π²V/(p² + μ²)^(3/2) in
     4D, projected on d's Legendre polynomials, i.e. Gegenbauer's; kernel S_d²/(2π)^d q^(d−1)), the Pauli operator
     averaged over angle with d's weight sin^(d−2), the gap choice, and U(k) = A + Bk² made self-consistent. The force is
     Serber's form of Malfliet–Tjon: MT-III in the even waves of S = 1, T = 0, MT-I in the even waves of S = 0, T = 1,
     nothing in odd waves. Checked: its free form puts the deuteron where the grid does, in both worlds (freePole).
     Alone it doesn't saturate (our matter binds harder the denser it gets); a three-nucleon repulsion
     W Σ_cyclic e^(−(r_ij² + r_ik²)/b²), the same function of distance in both worlds, at Hartree level in matter
     ((ρ²/2) W (π^(d/2) b^d)² per nucleon), its strength fitted to our saturation (−16 MeV), gives that at 0.18 fm⁻³ and
     moves our helium-4 and tritium by about a MeV (fixedNode's three option). Its range b is the honest uncertainty:
     it sets how the fitted force carries into 4D.
   · light nuclei as clusters of helium-4s (alphaPair, alphaNucleon): helium-4 is so tightly bound that past it nuclei are
     its clusters. Two helium-4s meet through the force folded over both (Gaussian densities, of the size the Monte
     Carlo gives; Serber's even waves, spin and isospin saturated: 16 pairs × (3/32)(v_t + v_s)) and their Coulomb force,
     with the Pauli principle as Saito's orthogonality: their relative motion is kept out of the oscillator states that
     would put a fifth nucleon in the lowest shell (0s and 1s; the count is the same in any d), by Kukulin's
     pseudopotential (a large energy on those states, solved exactly as tridiagonal plus rank 2). A nucleon on a helium-4
     meets the singly folded force in a p-wave (its s-wave is the forbidden one). One factor λ on each folding is
     calibrated on ours, two helium-4s (⁸Be) or a neutron and one (⁵He) at threshold, and carried to 4D: for ⁸Be it comes
     out 1.9, near Serber's natural 2 (the exchange half doubling the direct); for ⁵He 4–5, standing in for the spin–orbit
     force this central model lacks, so the mass-5 result is the weaker.
   · the ladder (alphaLocal, alphaDMC): several helium-4s need a local pair potential, so the forbidden states are taken out
     of the deep folded potential by Baye's supersymmetric transformation (its two lowest s-states removed, leaving a
     shallow potential with a repulsive core and the same scattering), with its own factor λ calibrated on our ⁸Be; then
     N helium-4s, identical bosons, by diffusion Monte Carlo. On ours, two-body forces alone underbind carbon-12 and
     oxygen-16 by about 2.5 times but release energy at every capture, as ours do: a conservative test of whether a ladder
     goes downhill. A three-helium-4 attraction fitted to our carbon-12 overbinds oxygen-16 threefold, so none is used. */
import { k4 } from "./kernel.js";

export const HB2M = 41.47106, E2 = 1.43996; // ħ²/m_N (MeV fm²), e² (MeV fm)
export const MT = {
  triplet: { VR: 1438.4812, VA: 626.8932, muR: 3.11, muA: 1.55 }, // MT-III
  singlet: { VR: 1438.4812, VA: 513.9718, muR: 3.11, muA: 1.55 }, // MT-I
  v: { VR: 1458.047, VA: 578.089, muR: 3.11, muA: 1.55 }, // MT-V
};
/* a second, independent force for checking that nothing hangs on Malfliet–Tjon's shape: the Minnesota force (Thompson,
   LeMere and Tang 1977), soft-cored Gaussians V_R e^(−κ_R r²) − V e^(−κ r²), fitted to the same scattering (our deuteron
   −2.20 MeV, helium-4 about −30). Its even-wave channels; its spin average for the s-shell's nuclei */
const MNR = { kind: "gau", V: 200.0, m: 1.487 };
export const MN = {
  triplet: { terms: [MNR, { kind: "gau", V: -178.0, m: 0.639, att: true }] },
  singlet: { terms: [MNR, { kind: "gau", V: -91.85, m: 0.465, att: true }] },
  v: { terms: [MNR, { kind: "gau", V: -89.0, m: 0.639, att: true }, { kind: "gau", V: -45.925, m: 0.465, att: true }] },
};
/* a force's terms: Malfliet–Tjon's two Yukawas, or a list of Yukawas (V e^(−m r)/r) and Gaussians (V e^(−m r²)); the
   attractive ones are scaled by s */
const termsOf = (p) => p.terms ?? [{ kind: "yuk", V: p.VR, m: p.muR }, { kind: "yuk", V: -p.VA, m: p.muA, att: true }];
export const mtPot = (p, s = 1) => { const T = termsOf(p); return (r) => T.reduce((t, q) => t + (q.att ? s : 1) * q.V * (q.kind === "yuk" ? Math.exp(-q.m * r) / r : Math.exp(-q.m * r * r)), 0); };
export const pot = mtPot;

/* bound states of −c u'' + (c L(L+1)/r² + V) u = E u below emax, ascending (at most 40) */
export function levels(V, { d, l = 0, c = HB2M, rmax = 30, h = 0.02, emax = 0 }) {
  const n = Math.round(rmax / h) - 1, L2 = l * (l + d - 2) + ((d - 1) * (d - 3)) / 4, diag = new Float64Array(n);
  for (let i = 0; i < n; i++) { const x = (i + 1) * h; diag[i] = (2 * c) / (h * h) + (c * L2) / (x * x) + V(x); }
  const off = -c / (h * h), o2 = off * off;
  const count = (E) => { let k = 0, q = diag[0] - E; if (q < 0) k++; for (let i = 1; i < n; i++) { q = diag[i] - E - o2 / (q || 1e-300); if (q < 0) k++; } return k; };
  let lo = Infinity; for (let i = 0; i < n; i++) lo = Math.min(lo, diag[i]); lo -= 2 * Math.abs(off) + 1;
  const nb = Math.min(count(emax), 40), out = [];
  for (let k = 0; k < nb; k++) { let a = lo, b = emax; for (let it = 0; it < 80; it++) { const m = (a + b) / 2; if (count(m) > k) b = m; else a = m; } out.push((a + b) / 2); }
  return out;
}
/* the s-wave ground state of V + ω r²: its energy E, and ln R(r) with its slope, for the Monte Carlo's pair factor */
export function pairState(V, { d, c = HB2M, omega = 0, rmax = 30, h = 0.004 }) {
  const W = (r) => V(r) + omega * r * r, E = levels(W, { d, l: 0, c, rmax, h, emax: 1e3 })[0];
  const n = Math.round(rmax / h) - 1, r = Float64Array.from({ length: n }, (_, i) => (i + 1) * h), L2 = ((d - 1) * (d - 3)) / 4;
  const dg = Float64Array.from(r, (x) => (2 * c) / (h * h) + (c * L2) / (x * x) + W(x) - E - 1e-9), off = -c / (h * h);
  let v = new Float64Array(n).fill(1);
  for (let it = 0; it < 6; it++) { // solve (T − E)v' = v (Thomas)
    const cp = new Float64Array(n), dp = new Float64Array(n); cp[0] = off / dg[0]; dp[0] = v[0] / dg[0];
    for (let i = 1; i < n; i++) { const m = dg[i] - off * cp[i - 1]; cp[i] = off / m; dp[i] = (v[i] - off * dp[i - 1]) / m; }
    const x = new Float64Array(n); x[n - 1] = dp[n - 1]; for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
    const nm = Math.hypot(...x.slice(0, 1000)) || 1; v = x.map((y) => Math.abs(y / nm));
  }
  const lnR = Float64Array.from(v, (y, i) => Math.log(Math.max(y, 1e-300)) - ((d - 1) / 2) * Math.log(r[i]));
  const up = Float64Array.from(lnR, (_, i) => (i === 0 ? (lnR[1] - lnR[0]) / h : i === n - 1 ? (lnR[i] - lnR[i - 1]) / h : (lnR[i + 1] - lnR[i - 1]) / (2 * h)));
  // usable to where R is still resolved; beyond, the tail continues with the last slope
  let last = n - 1; while (last > 10 && v[last] < 1e-200) last--; last = Math.floor(last * 0.9);
  const at = (arr, x) => { const t = x / h - 1; if (t <= 0) return arr[0] + (arr[1] - arr[0]) * t; if (t >= last) return null; const i = Math.floor(t), f = t - i; return arr[i] * (1 - f) + arr[i + 1] * f; };
  const upf = (x) => { const y = at(up, x); return y === null ? up[last] : y; };
  const lnf = (x) => { const y = at(lnR, x); return y === null ? lnR[last] + up[last] * (x - (last + 1) * h) : y; };
  return { E, omega, upf, lnf };
}

/* the strengths s at which, in d dimensions, the deuteron binds, binds by our 2.2246 MeV, and the diproton binds */
export function window(d, force = MT) {
  const E = (p, s) => levels(mtPot(p, s), { d, rmax: 80, h: 0.01 })[0], MT_ = force;
  const bisect = (test) => { let a = 0.5, b = 3; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (test(m)) b = m; else a = m; } return b; };
  return { deuteron: bisect((s) => E(MT_.triplet, s) !== undefined), ours: bisect((s) => (E(MT_.triplet, s) ?? 0) < -2.2246), diproton: bisect((s) => E(MT_.singlet, s) !== undefined) };
}
/* ½⟨1/r⟩ for two points in a uniform unit d-ball: a uniform nucleus' Coulomb energy is this × Z² e²/R */
export function coulombFactor(d, M = 400) {
  let s = 0; const w = (r) => d * r ** (d - 1); // the radius's density in the unit ball
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) { const r = (i + 0.5) / M, q = (j + 0.5) / M, lo = Math.min(r, q), hi = Math.max(r, q); s += (w(r) * w(q) * (d === 3 ? 1 : k4(lo / hi))) / hi; }
  return (0.5 * s) / (M * M);
}
/* Woods–Saxon levels for A nucleons (one kind), depth V0, the radius at our nuclear density (R = r₀ A^(1/d), r₀ set so a
   nucleon has the same d-volume as ours), and the spin–orbit term as above. Rows sorted, each with the shell's count N */
const BALL = { 3: (4 * Math.PI) / 3, 4: (Math.PI * Math.PI) / 2 };
export function shells(d, A, { V0 = 51, lam = 0.44, a = 0.67, r03 = 1.27, lmax = 9, c = HB2M / 2 } = {}) {
  const r0 = (r03 * Math.cbrt(BALL[3])) / Math.pow(BALL[d], 1 / d), R = r0 * Math.pow(A, 1 / d), f = (r) => 1 / (1 + Math.exp((r - R) / a)), df = (r) => { const e = Math.exp((r - R) / a); return -e / (a * (1 + e) ** 2); };
  const out = [];
  for (let l = 0; l <= lmax; l++) {
    const parts = d === 3 ? [[l / 2, 2 * l + 2], [-(l + 1) / 2, 2 * l]] : [[l / 2, (l + 1) * (l + 2)], [-(l + 2) / 2, l * (l + 1)]];
    for (const [ls, g] of parts) { if (!g) continue; const V = (r) => -V0 * f(r) + lam * V0 * r0 * r0 * (df(r) / r) * ls; levels(V, { d, l, c, rmax: R + 15, h: 0.03 }).forEach((e, n) => out.push({ e, l, ls, g, n })); }
  }
  out.sort((x, y) => x.e - y.e); let N = 0;
  return out.map((s, i) => { N += s.g; return { ...s, N, gap: i + 1 < out.length ? out[i + 1].e - s.e : 0 }; });
}

const D = HB2M / 2; // ħ²/2m_N
function inv(M, n) { const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]); let det = 1;
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; det = -det; } const v = A[c][c]; det *= v; if (Math.abs(v) < 1e-300) return { det: 0 }; for (let k = 0; k < 2 * n; k++) A[c][k] /= v; for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k]; } }
  return { det, inv: A.map((r) => r.slice(n)) }; }
/* counts: [p↑, p↓, n↑, n↓], each ≤ d + 1 (the s orbital, then p along axes 1…); V a pair potential (V.v(r, s)); like:
   "serber" (the force acts in even waves only, Serber's: so nucleons of one species meet only through the Coulomb force,
   and unlike ones through V (1 + P)/2), "zero" (like ones as Serber's, unlike ones in every wave) or "same" (all in every wave) */
export function fixedNode({ d, counts, V, s = 1, like = "zero", coulomb = true, tau = 1e-4, walkers = 800, steps = 20000, equil = 4000, seed = 1, omega = 0.5, omegaLike = 0.3, trace = null, three = null }) {
  const S = new Uint32Array([seed * 2654435761 >>> 0, 0x9e3779b9, 0x243f6a88, 0xb7e15162 ^ seed]); const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  const n32 = () => { const r = Math.imul(rotl(Math.imul(S[1], 5), 7), 9) >>> 0, t = S[1] << 9; S[2] ^= S[0]; S[3] ^= S[1]; S[1] ^= S[2]; S[0] ^= S[3]; S[2] ^= t; S[3] = rotl(S[3], 11); return r; };
  for (let i = 0; i < 20; i++) n32(); const rnd = () => (n32() + 0.5) / 4294967296; let spare = null;
  const gauss = () => { if (spare !== null) { const g = spare; spare = null; return g; } const r = Math.sqrt(-2 * Math.log(rnd())), t = 2 * Math.PI * rnd(); spare = r * Math.sin(t); return r * Math.cos(t); };
  const sp = []; counts.forEach((c, k) => { for (let i = 0; i < c; i++) sp.push(k); }); const A = sp.length, n = A * d, prot = (k) => k < 2;
  // the pair potentials and their trial functions, by kind
  const Vn = (r) => V.v(r, s), kinds = {};
  const kindOf = (a, b) => { const same = sp[a] === sp[b], pp = prot(sp[a]) && prot(sp[b]); return `${same ? "like" : "unlike"}${pp ? "pp" : ""}`; };
  const pot = (kind) => { const nuc = kind.startsWith("like") ? (like === "same" ? Vn : () => 0) : Vn; return kind.endsWith("pp") && coulomb ? (r) => nuc(r) + E2 / r : nuc; };
  const pairs = []; for (let i = 0; i < A; i++) for (let j = i + 1; j < A; j++) { const k = kindOf(i, j); if (!kinds[k]) { const v = pot(k), om = ((k.startsWith("like") ? omegaLike : omega) * 3) / Math.max(3, A - 1); kinds[k] = { v, om, T: pairState(v, { d, omega: om }), unlike: k.startsWith("unlike"), pp: k.endsWith("pp") }; } pairs.push([i, j, kinds[k]]); }
  const groups = [0, 1, 2, 3].map((k) => sp.map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0)).filter((g) => g.length);
  const dets = (x) => { let sgn = 1, ld = 0; const gD = new Float64Array(n); for (const g of groups) { const m = g.length, M = g.map((i) => Array.from({ length: m }, (_, k) => (k ? x[i * d + k - 1] : 1))), r = inv(M, m); if (!r.det) return null; sgn *= Math.sign(r.det); ld += Math.log(Math.abs(r.det)); g.forEach((i, row) => { for (let a = 0; a < m - 1; a++) gD[i * d + a] = r.inv[a + 1][row]; at[i] = { Mi: r.inv, row, m }; }); } return { sgn, gD, ld }; };
  // the trial's change when nucleon i is moved to y (one row of its determinant replaced): Σ_k φ_k(y) (M⁻¹)_k,row
  const at = new Array(A), moved = (x, i, j) => { const { Mi, row, m } = at[i]; let t = Mi[0][row]; for (let k = 1; k < m; k++) t += x[j * d + k - 1] * Mi[k][row]; return t; };
  const lnJ = (x) => { let t = 0; for (const [i, j, K] of pairs) { let r2 = 0; for (let k = 0; k < d; k++) { const u = x[i * d + k] - x[j * d + k]; r2 += u * u; } t += K.T.lnf(Math.sqrt(r2)); } return t; };
  const lnDet = (x) => { let t = 0; for (const g of groups) { const m = g.length, M = g.map((i) => Array.from({ length: m }, (_, k) => (k ? x[i * d + k - 1] : 1))), r = inv(M, m); t += Math.log(Math.abs(r.det) || 1e-300); } return t; };
  const local = (x, F) => { // E_L and F = 2∇lnψ; null across a node
    const dd = dets(x); if (!dd) return null; const gJ = new Float64Array(n); let e = 0, lj = 0;
    for (const [i, j, K] of pairs) { let r2 = 0; for (let k = 0; k < d; k++) { const u = x[i * d + k] - x[j * d + k]; r2 += u * u; } const r = Math.sqrt(r2), g = K.T.upf(r); lj += K.T.lnf(r);
      // Serber's force (even waves only): V (1 + P)/2 with the exchange P read off the trial (the locality approximation),
      // held to P's own eigenvalues ±1 (near the trial's nodes the ratio runs away)
      const vact = like === "serber" && K.unlike ? (Vn(r) * (1 + Math.max(-1, Math.min(1, moved(x, i, j) * moved(x, j, i))))) / 2 + (K.pp && coulomb ? E2 / r : 0) : K.v(r);
      e += vact - (K.v(r) + K.om * r2 - K.T.E - 2 * D * g * g); for (let k = 0; k < d; k++) { const t = (g * (x[i * d + k] - x[j * d + k])) / r; gJ[i * d + k] += t; gJ[j * d + k] -= t; } }
    if (three) { // a three-nucleon repulsion W Σ_triples Σ_cyclic e^(−(r_ij² + r_ik²)/b²)
      const R2 = (i, j) => { let t = 0; for (let k = 0; k < d; k++) { const u = x[i * d + k] - x[j * d + k]; t += u * u; } return t / (three.b * three.b); };
      for (let i = 0; i < A; i++) for (let j = i + 1; j < A; j++) for (let k = j + 1; k < A; k++) { const a = R2(i, j), b = R2(i, k), c = R2(j, k); e += three.W * (Math.exp(-a - b) + Math.exp(-a - c) + Math.exp(-b - c)); }
    }
    let q = 0; for (let k = 0; k < n; k++) { q += gJ[k] * gJ[k] + 2 * dd.gD[k] * gJ[k]; F[k] = 2 * (gJ[k] + dd.gD[k]); } return { E: e - D * q, sgn: dd.sgn, lp: lj + dd.ld };
  };
  const lnpsi = (x) => lnJ(x) + lnDet(x);
  // start: s-shell near the centre, p nucleons pushed out along their axes, at about a nucleus' size
  const spread = 0.5 + 0.4 * Math.pow(A, 1 / d);
  let W = []; while (W.length < walkers) { const x = new Float64Array(n); sp.forEach((k, i) => { const slot = groups.find((g) => g.includes(i)).indexOf(i); for (let a = 0; a < d; a++) x[i * d + a] = spread * gauss() + (slot && a === slot - 1 ? 1.5 * spread : 0); }); const F = new Float64Array(n), L = local(x, F); if (L) W.push({ x, F, E: L.E, sgn: L.sgn, lp: L.lp }); }
  if (steps === 0) return { local: (x) => local(x, new Float64Array(n)), lnpsi: (x) => { const L = local(x, new Float64Array(n)); return L && L.lp; }, n, pairs, Vn, groups, sp };
  // Umrigar's guards: each particle's drift shortened where it diverges (near a node), and the energy in the branching
  // held within a few spreads of the running mean
  const drift = (F) => { const out = new Float64Array(n); for (let i = 0; i < A; i++) { let v2 = 0; for (let a = 0; a < d; a++) v2 += (F[i * d + a] / 2) ** 2; const f = v2 > 0 ? (-1 + Math.sqrt(1 + 2 * D * tau * v2)) / (D * tau * v2) : 1; for (let a = 0; a < d; a++) out[i * d + a] = f * D * tau * F[i * d + a]; } return out; };
  const e0 = W.map((w) => w.E).sort((a, b) => a - b), med = e0[e0.length >> 1], iqr = e0[Math.floor(e0.length * 0.75)] - e0[Math.floor(e0.length * 0.25)], ecut = Math.max(30, 5 * iqr);
  let ET = med, Erun = ET; const Rs = []; const Es = []; const xn = new Float64Array(n), Fn = new Float64Array(n); let acc = 0, tot = 0;
  for (let st = 0; st < steps; st++) {
    const next = []; let sE = 0, sW = 0, sR = 0;
    for (const w of W) {
      const dr = drift(w.F); for (let k = 0; k < n; k++) xn[k] = w.x[k] + dr[k] + Math.sqrt(2 * D * tau) * gauss();
      const L = local(xn, Fn); tot++; let x = w.x, F = w.F, E1 = w.E, lp = w.lp;
      if (L && L.sgn === w.sgn) { const dn = drift(Fn); let lg = 0; for (let k = 0; k < n; k++) { const f = w.x[k] - xn[k] - dn[k], b = xn[k] - w.x[k] - dr[k]; lg += (b * b - f * f) / (4 * D * tau); } if (rnd() < Math.exp(2 * (L.lp - w.lp) + lg)) { acc++; x = Float64Array.from(xn); F = Float64Array.from(Fn); E1 = L.E; lp = L.lp; } }
      const cap = (e) => Math.max(Erun - ecut, Math.min(Erun + ecut, e)), wt = Math.exp(-tau * (0.5 * (cap(w.E) + cap(E1)) - ET)), m = Math.min(Math.floor(wt + rnd()), 3);
      for (let k = 0; k < m; k++) next.push({ x: k ? Float64Array.from(x) : x, F: k ? Float64Array.from(F) : F, E: E1, sgn: w.sgn, lp });
      sE += wt * E1; sW += wt; { let r2 = 0; for (let a = 0; a < d; a++) { let c = 0; for (let i = 0; i < A; i++) c += x[i * d + a]; c /= A; for (let i = 0; i < A; i++) r2 += (x[i * d + a] - c) ** 2; } sR += (wt * r2) / A; }
    }
    W = next; const Em = sE / sW; if (st < equil) { Erun = Em; ET = Em - Math.log(W.length / walkers) / (20 * tau); } else { Erun += (Em - Erun) / Math.min(st - equil + 1, 2000); ET = Erun - Math.log(W.length / walkers) / (200 * tau); } // equilibrating: follow the energy closely
    if (trace) trace(st, W.length, Em, ET); if (!W.length) break;
    if (st >= equil) { Es.push(Em); Rs.push(sR / sW); }
  }
  const B = Math.max(1, Math.min(Math.round(0.2 / tau), Math.floor(Es.length / 10))), nb = Math.floor(Es.length / B), bm = Array.from({ length: nb }, (_, i) => Es.slice(i * B, (i + 1) * B).reduce((a, b) => a + b, 0) / B), mean = bm.reduce((a, b) => a + b, 0) / nb, err = Math.sqrt(bm.reduce((a, b) => a + (b - mean) ** 2, 0) / (nb * (nb - 1)));
  return { E: mean, err, acc: acc / tot, A, r2: Rs.reduce((a, b) => a + b, 0) / (Rs.length || 1) }; // r2: the mixed estimate of a nucleon's mean-square distance from the centre of mass
}

/* ———— nuclear matter (Brueckner–Hartree–Fock) ———— */

/* the three-nucleon repulsion's energy per nucleon in uniform matter of density rho (Hartree) */
/* the fitted three-nucleon strength: c = W π³ b⁶/2 (MeV fm⁶) saturating our matter at −16 MeV (tools/nuclei.mjs fit, which
   recomputes it; its bake checks the two agree). For a range b, W = 2c/(π³ b⁶) */
export const THREE_C = 493.4, THREE_C_MN = 382.4; // Malfliet–Tjon's; Minnesota's
export const threeForce = (b, c = THREE_C) => ({ b, W: (2 * c) / (Math.PI ** 3 * b ** 6) });
export const threeBodyMatter = (d, { W, b }, rho) => 0.5 * W * (Math.PI ** (d / 2) * b ** d) ** 2 * rho * rho;
const SD = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI }; // the unit sphere's area
export function gaussLegendre(n) { const x = [], w = []; for (let i = 0; i < n; i++) { let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), pp = 0; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 0; j < n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1); } pp = (n * (z * p1 - p2)) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return { x, w }; }
// the force's Fourier transform: Σ c e^(−μr)/r → 4π c/(p²+μ²) (3D), 4π² c/(p²+μ²)^(3/2) (4D)
// a Yukawa's Fourier transform 4πV/(p² + m²) (3D), 4π²V/(p² + m²)^(3/2) (4D); a Gaussian's V (π/m)^(d/2) e^(−p²/4m)
export const ft = (d, p, s) => { const T = termsOf(p); return (p2) => T.reduce((t, q) => t + (q.att ? s : 1) * q.V * (q.kind === "yuk" ? (d === 3 ? (4 * Math.PI) / (p2 + q.m * q.m) : (4 * Math.PI * Math.PI) / (p2 + q.m * q.m) ** 1.5) : (Math.PI / q.m) ** (d / 2) * Math.exp(-p2 / (4 * q.m))), 0); };
// Legendre polynomials in d dims (Gegenbauer λ = d/2 − 1, normalized to 1 at t = 1)
function legendreD(d, lmax, t) { const lam = d / 2 - 1, C = [1, 2 * lam * t]; for (let n = 2; n <= lmax; n++) C.push((2 * t * (n + lam - 1) * C[n - 1] - (n + 2 * lam - 2) * C[n - 2]) / n); const c1 = [1]; for (let n = 1; n <= lmax; n++) c1.push((c1[n - 1] * (n + 2 * lam - 1)) / n); return C.slice(0, lmax + 1).map((v, n) => v / c1[n]); }
export const degeneracy = (d, l) => (d === 3 ? 2 * l + 1 : (l + 1) * (l + 1));
// v_l(k', q) = ∫ Ṽ(|k' − q|) P_l(x) w(x) dx / (S_d ∫ w dx), x = cos θ, w = sin^(d−2) θ
export function projector(d, lmax, nth = 96) {
  const { x, w } = gaussLegendre(nth), th = x.map((u) => (Math.PI * (u + 1)) / 2), wt = w.map((v, i) => (v * Math.PI) / 2 * Math.sin(th[i]) ** (d - 2)), norm = wt.reduce((a, b) => a + b, 0);
  const cs = th.map(Math.cos), P = cs.map((t) => legendreD(d, lmax, t));
  return (Vt, k1, k2) => { const out = new Float64Array(lmax + 1); for (let i = 0; i < nth; i++) { const v = Vt(k1 * k1 + k2 * k2 - 2 * k1 * k2 * cs[i]) * wt[i]; for (let l = 0; l <= lmax; l++) out[l] += v * P[i][l]; } for (let l = 0; l <= lmax; l++) out[l] /= SD[d] * norm; return out; };
}
// the q grid: q = c tan(πt/4 + π/4·…) mapped Gauss–Legendre on [0, ∞)
export function qGrid(n, c = 2.5) { const { x, w } = gaussLegendre(n); return { q: x.map((u) => c * Math.tan((Math.PI / 4) * (u + 1))), w: x.map((u, i) => (w[i] * c * Math.PI) / 4 / Math.cos((Math.PI / 4) * (u + 1)) ** 2) }; }
function solveLin(M, b) { const n = b.length, A = M.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (f) for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } } const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x; }
function det(M) { const n = M.length, A = M.map((r) => r.slice()); let D = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; D = -D; } D *= A[c][c]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; } } return D; }
/* the free two-body bound state: the ω where det(1 − K(ω)) = 0 for l = 0 (K = v (S_d/(2π)^d) q^(d−1) w/(ω − ħ²q²/m)) */
export function freePole(d, pot, s, { nq = 48 } = {}) {
  const G = qGrid(nq), pj = projector(d, 0), Vt = ft(d, pot, s), v = G.q.map((a) => G.q.map((b) => pj(Vt, a, b)[0])), f = (2 * Math.PI) ** d;
  const D = (om) => det(G.q.map((_, i) => G.q.map((q, j) => (i === j ? 1 : 0) - (v[i][j] * SD[d] * SD[d] * q ** (d - 1) * G.w[j]) / f / (om - HB2M * q * q))));
  let a = -60, b = -1e-4; const fa = D(a); for (let it = 0; it < 80; it++) { const m = (a + b) / 2; if (Math.sign(D(m)) === Math.sign(fa)) a = m; else b = m; } return (a + b) / 2;
}
const SD1 = { 3: 2 * Math.PI, 4: 4 * Math.PI }; // the (d−1)-sphere's area, for dΩ_d = S_{d−1} sin^(d−2)α dα
// the angle-averaged Pauli operator: both nucleons outside the Fermi sphere, averaged over the angle between P and q
function pauli(d, q, P, kF) { if (P < 1e-9) return q > kF ? 1 : 0; const x0 = (P * P + q * q - kF * kF) / (2 * P * q); if (x0 <= 0) return 0; if (x0 >= 1) return 1; return d === 3 ? x0 : (x0 * Math.sqrt(1 - x0 * x0) + Math.asin(x0)) / (Math.PI / 2); }
/* nuclear matter at Fermi momentum kF: kind "symmetric" (protons and neutrons) or "neutron". Serber's force: MT-III in the
   even waves of S = 1, T = 0, MT-I in the even waves of S = 0, T = 1, nothing in odd waves. Returns E/A, ρ, and U(k) = A + Bk² */
export function matter({ d, s, kF, kind = "symmetric", lmax = 8, nq = 48, nk = 12, iters = 30, A0 = -60, B0 = 0, quiet = true, three = null, force = MT }) {
  const chans = kind === "symmetric" ? [{ pot: force.triplet, w: 3 }, { pot: force.singlet, w: 3 }] : [{ pot: force.singlet, w: 1 }], nu = kind === "symmetric" ? 4 : 2;
  const G = qGrid(nq), pj = projector(d, lmax), ls = []; for (let l = 0; l <= lmax; l += 2) ls.push(l);
  const kk = Array.from({ length: nk + 1 }, (_, i) => (kF * i) / nk), f = (SD[d] * SD[d]) / (2 * Math.PI) ** d;
  const pre = chans.map((c) => { const Vt = ft(d, c.pot, s); return { w: c.w, vqq: G.q.map((a) => G.q.map((b) => pj(Vt, a, b))), vkq: kk.map((k) => G.q.map((b) => pj(Vt, Math.max(k, 1e-6), b))), vkk: kk.map((k) => pj(Vt, Math.max(k, 1e-6), Math.max(k, 1e-6))) }; });
  let A = A0, B = B0, Gs = null, Ebar = 0;
  for (let it = 0; it < iters; it++) {
    // Σ_channels w Σ_l N S_d 2 g_l(k, k) on the (k, P) grid
    Gs = kk.map(() => new Float64Array(nk + 1));
    for (let a = 0; a <= nk; a++) for (let b = 0; b <= nk; b++) {
      const k = kk[a], P = kk[b]; if (Math.hypot(k, P) > kF * 1.0001 && false) continue;
      const om = 2 * A + (HB2M + 2 * B) * (P * P + k * k), F = G.q.map((q, j) => (f * q ** (d - 1) * G.w[j] * pauli(d, q, P, kF)) / (om - HB2M * (P * P + q * q)));
      let tot = 0;
      for (const c of pre) for (const l of ls) {
        const M = G.q.map((_, i) => G.q.map((_, j) => (i === j ? 1 : 0) - c.vqq[i][j][l] * F[j])), g = solveLin(M, G.q.map((_, i) => c.vkq[a][i][l]));
        let gkk = c.vkk[a][l]; for (let j = 0; j < nq; j++) gkk += c.vkq[a][j][l] * F[j] * g[j];
        tot += c.w * degeneracy(d, l) * SD[d] * 2 * gkk;
      }
      Gs[a][b] = tot;
    }
    const Gat = (k, P) => { const x = Math.min(nk - 1e-9, (k / kF) * nk), y = Math.min(nk - 1e-9, (P / kF) * nk), i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j; return (1 - u) * (1 - v) * Gs[i][j] + u * (1 - v) * Gs[i + 1][j] + (1 - u) * v * Gs[i][j + 1] + u * v * Gs[i + 1][j + 1]; };
    // U(k1) = (1/ν) ∫_{k2<kF} d^dk2/(2π)^d Gs(|k1 − k2|/2, |k1 + k2|/2)
    const g2 = gaussLegendre(16), ga = gaussLegendre(16), U = [], K1 = [];
    for (let i = 0; i <= 8; i++) {
      const k1 = (kF * i) / 8; let sum = 0;
      for (let m = 0; m < 16; m++) { const k2 = (kF * (g2.x[m] + 1)) / 2, w2 = (kF * g2.w[m]) / 2; for (let n = 0; n < 16; n++) { const al = (Math.PI * (ga.x[n] + 1)) / 2, wa = (Math.PI * ga.w[n]) / 2, c = Math.cos(al); const k = Math.sqrt(Math.max(0, k1 * k1 + k2 * k2 - 2 * k1 * k2 * c)) / 2, P = Math.sqrt(k1 * k1 + k2 * k2 + 2 * k1 * k2 * c) / 2; sum += w2 * wa * k2 ** (d - 1) * Math.sin(al) ** (d - 2) * Gat(k, P); } }
      U.push((SD1[d] * sum) / (2 * Math.PI) ** d / nu); K1.push(k1);
    }
    // fit U = A + B k², and the Fermi-ball average of U
    const n = U.length, sx = K1.reduce((t, k) => t + k * k, 0), sxx = K1.reduce((t, k) => t + k ** 4, 0), sy = U.reduce((t, u) => t + u, 0), sxy = U.reduce((t, u, i) => t + u * K1[i] ** 2, 0);
    const Bn = (n * sxy - sx * sy) / (n * sxx - sx * sx), An = (sy - Bn * sx) / n;
    const dA = Math.abs(An - A); A = 0.5 * A + 0.5 * An; B = 0.5 * B + 0.5 * Bn; Ebar = An + (Bn * kF * kF * d) / (d + 2);
    if (!quiet) console.log(it, A.toFixed(3), B.toFixed(3));
    if (dA < 1e-4) break;
  }
  const T = (d / (d + 2)) * (HB2M / 2) * kF * kF, rho = (nu * BALL[d] * kF ** d) / (2 * Math.PI) ** d;
  const E3 = three ? threeBodyMatter(d, three, rho) : 0;
  return { kF, rho, T, U: { A, B }, E2: T + 0.5 * Ebar, E3, E: T + 0.5 * Ebar + E3 };
}

/* ———— light nuclei as clusters of helium-4s (Saito's orthogonality, Kukulin's pseudopotential) ———— */
const J1 = (x) => { const N = 200; let s = 0; for (let i = 0; i <= N; i++) { const t = (Math.PI * i) / N, w = i === 0 || i === N ? 0.5 : 1; s += w * Math.cos(t - x * Math.sin(t)); } return s / N; };
const j0 = (d, x) => (x < 1e-8 ? 1 : d === 3 ? Math.sin(x) / x : (2 * J1(x)) / x);
/* the direct folding of a central force (FT Vt) over two Gaussian helium-4s (nucleon density ∝ e^(−a r²)), per nucleon pair */
function folded2(d, Vt, a, R) { const n = 600, pmax = 12; let s = 0; for (let i = 1; i <= n; i++) { const p = (pmax * (i - 0.5)) / n; s += p ** (d - 1) * Vt(p * p) * Math.exp(-(p * p) / (2 * a)) * j0(d, p * R); } return ((SD[d] / (2 * Math.PI) ** d) * s * pmax) / n; }
/* the helium-4 pair's potential: λ × 16 pairs × (3/32)(v_t + v_s) folded (Serber's even waves, saturated spin and isospin), plus their Coulomb */
function alphaPot(d, force, s, a, lambda) {
  const Vt = ft(d, force.triplet, s), Vs = ft(d, force.singlet, s), grid = Array.from({ length: 401 }, (_, i) => (12 * i) / 400), tab = grid.map((R) => 1.5 * (folded2(d, Vt, a, R) + folded2(d, Vs, a, R)));
  return (R) => { const x = (R / 12) * 400, i = Math.min(399, Math.floor(x)), f = x - i, nuc = R < 12 ? tab[i] * (1 - f) + tab[i + 1] * f : 0; return lambda * nuc + (4 * E2 * erfA(Math.sqrt(a / 2) * R)) / R; };
}
function erfA(x) { const t = 1 / (1 + 0.3275911 * x), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
// Laguerre L_n^(α)(x)
const lag = (n, al, x) => { let a = 1, b = 1 + al - x; if (n === 0) return a; for (let k = 2; k <= n; k++) { const c = ((2 * k - 1 + al - x) * b - (k - 1 + al) * a) / k; a = b; b = c; } return b; };
/* the lowest allowed s-state of two helium-4s: energy (MeV, below 0: bound) */
function lowestAllowed(d, V, a, { rmax = 40, h = 0.02, Lam = 1e5, nForbid = 2 } = {}) {
  const c = HB2M / 4, n = Math.round(rmax / h) - 1, r = Float64Array.from({ length: n }, (_, i) => (i + 1) * h), L2 = ((d - 1) * (d - 3)) / 4;
  const dg = Float64Array.from(r, (x) => (2 * c) / (h * h) + (c * L2) / (x * x) + V(x)), off = -c / (h * h);
  // the forbidden oscillator states (relative Gaussian e^(−aR²): x = 2aR²), u = R^((d−1)/2) L_n^(d/2−1)(x) e^(−aR²), orthonormal on the grid
  const F = []; for (let k = 0; k < nForbid; k++) { let u = Float64Array.from(r, (x) => x ** ((d - 1) / 2) * lag(k, d / 2 - 1, 2 * a * x * x) * Math.exp(-a * x * x)); for (const f of F) { const p = u.reduce((t, v, i) => t + v * f[i], 0); u = u.map((v, i) => v - p * f[i]); } const nm = Math.sqrt(u.reduce((t, v) => t + v * v, 0)); F.push(u.map((v) => v / nm)); }
  const thomas = (shift, b) => { const cp = new Float64Array(n), dp = new Float64Array(n); cp[0] = off / (dg[0] - shift); dp[0] = b[0] / (dg[0] - shift); for (let i = 1; i < n; i++) { const m = dg[i] - shift - off * cp[i - 1]; cp[i] = off / m; dp[i] = (b[i] - off * dp[i - 1]) / m; } const x = new Float64Array(n); x[n - 1] = dp[n - 1]; for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1]; return x; };
  // (T + Λ F Fᵀ − σ)⁻¹ b by Woodbury
  const sigma = Math.min(...dg.map((v, i) => v - 2 * Math.abs(off))) - 5;
  const AiF = F.map((f) => thomas(sigma, f)), m = F.length, C = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1 / Lam : 0) + F[i].reduce((t, v, k) => t + v * AiF[j][k], 0)));
  const solveSmall = (M, y) => { if (m === 0) return []; if (m === 1) return [y[0] / M[0][0]]; const det = M[0][0] * M[1][1] - M[0][1] * M[1][0]; return [(M[1][1] * y[0] - M[0][1] * y[1]) / det, (M[0][0] * y[1] - M[1][0] * y[0]) / det]; };
  const apply = (b) => { const x = thomas(sigma, b), y = F.map((f) => f.reduce((t, v, k) => t + v * x[k], 0)), z = solveSmall(C, y); return x.map((v, k) => v - z.reduce((t, zz, j) => t + zz * AiF[j][k], 0)); };
  let v = Float64Array.from(r, (x) => x * Math.exp(-0.1 * x)), mu = 0;
  for (let it = 0; it < 200; it++) { const w = apply(v), nm = Math.sqrt(w.reduce((t, q) => t + q * q, 0)); const ray = v.reduce((t, q, i) => t + q * w[i], 0) / v.reduce((t, q) => t + q * q, 0); v = w.map((q) => q / nm); const muN = sigma + 1 / ray; if (Math.abs(muN - mu) < 1e-9) { mu = muN; break; } mu = muN; }
  return mu;
}
function folded1(d, Vt, a, R) { const n = 600, pmax = 12; let s = 0; for (let i = 1; i <= n; i++) { const p = (pmax * (i - 0.5)) / n; s += p ** (d - 1) * Vt(p * p) * Math.exp(-(p * p) / (4 * a)) * j0(d, p * R); } return ((SD[d] / (2 * Math.PI) ** d) * s * pmax) / n; }
function nucleonPot(d, F, s, a, lam) { const Vt = ft(d, F.triplet, s), Vs = ft(d, F.singlet, s), g = Array.from({ length: 401 }, (_, i) => (12 * i) / 400), tab = g.map((R) => 4 * (3 / 32) * (folded1(d, Vt, a, R) + folded1(d, Vs, a, R))); return (R) => { const x = (R / 12) * 400, i = Math.min(399, Math.floor(x)), f = x - i; return R < 12 ? lam * (tab[i] * (1 - f) + tab[i + 1] * f) : 0; }; }
/* a helium-4's Gaussian width a (nucleon density ∝ e^(−a r²)) for a mean-square radius r2 about its centre (3 of 4 nucleons move) */
export const alphaWidth = (d, r2) => (0.75 * (d / 2)) / r2;
/* two helium-4s' lowest allowed s-state (MeV; below 0, bound) for the force F at strength s, width a, folding factor lam */
export const alphaPair = (d, F, s, a, lam, opts = {}) => lowestAllowed(d, alphaPot(d, F, s, a, lam), a, { rmax: 50, ...opts });
/* a nucleon's lowest p-state on a helium-4 (undefined: unbound) */
export const alphaNucleon = (d, F, s, a, lam) => levels(nucleonPot(d, F, s, a, lam), { d, l: 1, c: (HB2M * 5) / 8, rmax: 60, h: 0.01 })[0];
/* the folding factor that puts ours (d = 3, s = 1, a for 2.13 fm²) at threshold */
export function calibrate(kind, F, a3 = alphaWidth(3, 2.13)) {
  const bound = kind === "pair" ? (lam) => alphaPair(3, F, 1, a3, lam) < -1e-3 : (lam) => alphaNucleon(3, F, 1, a3, lam) !== undefined;
  let lo = 0.5, hi = 8; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (bound(m)) hi = m; else lo = m; } return (lo + hi) / 2;
}

/* ———— the helium-4 ladder ———— */
const CA = HB2M / 4; // ħ²/2μ for two helium-4s
/* the deep folded nuclear part (no Coulomb), tabulated */
export function deepNuclear(d, F, s, a, lam) { const Vt = ft(d, F.triplet, s), Vs = ft(d, F.singlet, s), H = 0.02, n = 800, tab = Float64Array.from({ length: n + 1 }, (_, i) => lam * 1.5 * (folded2(d, Vt, a, i * H) + folded2(d, Vs, a, i * H))); return (r) => { const x = r / H; if (x >= n) return 0; const i = Math.floor(x), f = x - i; return tab[i] * (1 - f) + tab[i + 1] * f; }; }
/* the ground state on the grid (u, its energy) for an l = 0 potential V in d dims: inverse iteration on the tridiagonal problem */
function groundU(d, V, { rmax = 30, h = 0.005 } = {}) {
  const E = levels(V, { d, l: 0, c: CA, rmax, h, emax: 1e4 })[0], n = Math.round(rmax / h) - 1, L2 = ((d - 1) * (d - 3)) / 4, off = -CA / (h * h), r = Float64Array.from({ length: n }, (_, i) => (i + 1) * h);
  const dg = Float64Array.from(r, (x) => (2 * CA) / (h * h) + (CA * L2) / (x * x) + V(x) - E - 1e-9); let v = new Float64Array(n).fill(1);
  for (let it = 0; it < 5; it++) { const cp = new Float64Array(n), dp = new Float64Array(n); cp[0] = off / dg[0]; dp[0] = v[0] / dg[0]; for (let i = 1; i < n; i++) { const m = dg[i] - off * cp[i - 1]; cp[i] = off / m; dp[i] = (v[i] - off * dp[i - 1]) / m; } const x = new Float64Array(n); x[n - 1] = dp[n - 1]; for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1]; let nm = 0; for (const q of x) nm = Math.max(nm, Math.abs(q)); v = x.map((q) => Math.abs(q) / nm); }
  return { E, u: v, r, h };
}
/* Baye's supersymmetric step: V → V − 2(W − E₀) + 2c ((ln u₀)′)², W = V + c L2/r² (the identity c (ln u)″ = W − E − c ((ln u)′)²) */
function susyStep(d, V, g) {
  const { E, u, r, h } = g, n = u.length, L2 = ((d - 1) * (d - 3)) / 4, lp = new Float64Array(n), W = (x) => V(x) + (CA * L2) / (x * x);
  for (let i = 0; i < n; i++) lp[i] = i === 0 ? (Math.log(u[1]) - Math.log(u[0])) / h : i === n - 1 ? lp[i - 1] : (Math.log(u[i + 1]) - Math.log(u[i - 1])) / (2 * h);
  // a deeply bound state's tail sinks below what inverse iteration leaves of the other states, so its log-derivative is
  // wrong there: past the point where u falls below 1e-6, y = (ln u)′ comes instead from c (y′ + y²) = W − E, integrated
  // inward (stable for a decaying state) from y = −√((W − E)/c) at the edge
  let cut = 0; while (cut < n - 1 && u[cut] < 1e-6) cut++; while (cut < n - 1 && u[cut + 1] >= 1e-6) cut++;
  if (cut < n - 1) { const f = (x, y) => (W(x) - E) / CA - y * y; let y = -Math.sqrt(Math.max(0, (W(r[n - 1]) - E) / CA)); lp[n - 1] = y;
    for (let i = n - 1; i > cut; i--) { const x = r[i], k1 = f(x, y), k2 = f(x - h / 2, y - (h / 2) * k1), k3 = f(x - h / 2, y - (h / 2) * k2), k4 = f(x - h, y - h * k3); y -= (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4); lp[i - 1] = y; } }
  const tab = Float64Array.from(r, (x, i) => V(x) - 2 * (W(x) - E) + 2 * CA * lp[i] ** 2);
  return (x) => { if (x <= h) return tab[0] * (h / x) ** 2; const t = x / h - 1, i = Math.min(n - 2, Math.floor(t)), f = t - i; return x >= r[n - 1] ? 0 : tab[i] * (1 - f) + tab[i + 1] * f; };
}
/* the shallow local helium-4 pair potential: the deep folding with its two lowest s-states (Pauli-forbidden) removed, plus Coulomb */
export function alphaLocal(d, F, s, a, lam) {
  const { E0, E1, V: V2 } = susyRemove(d, deepNuclear(d, F, s, a, lam)), coul = (r) => (4 * E2 * erfA(Math.sqrt(a / 2) * r)) / r;
  return { E0, E1, V: (r) => V2(r) + coul(r), nuclear: V2 };
}
/* an s-wave potential (two helium-4s' reduced mass) with its two lowest s-states removed by two supersymmetric steps, the
   rest of its spectrum kept */
export function susyRemove(d, deep) {
  const g0 = groundU(d, deep), V1 = susyStep(d, deep, g0), g1 = groundU(d, V1);
  return { E0: g0.E, E1: g1.E, V: susyStep(d, V1, g1) };
}
/* diffusion Monte Carlo for N helium-4s (identical bosons: no nodes, exact for the given forces), pair potential V(r),
   optionally a three-helium-4 force W Σ_triples e^(−(r_ij² + r_jk² + r_ik²)/b²) */
export function alphaDMC({ d, N, V, three = null, tau = 2e-4, walkers = 600, steps = 12000, equil = 3000, seed = 1, omega = 0.3 }) {
  const D = HB2M / 8, S = new Uint32Array([seed * 2654435761 >>> 0, 0x9e3779b9, 0x243f6a88, 0xb7e15162 ^ seed]); const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  const n32 = () => { const r = Math.imul(rotl(Math.imul(S[1], 5), 7), 9) >>> 0, t = S[1] << 9; S[2] ^= S[0]; S[3] ^= S[1]; S[1] ^= S[2]; S[0] ^= S[3]; S[2] ^= t; S[3] = rotl(S[3], 11); return r; };
  for (let i = 0; i < 20; i++) n32(); const rnd = () => (n32() + 0.5) / 4294967296; let spare = null;
  const gauss = () => { if (spare !== null) { const g = spare; spare = null; return g; } const r = Math.sqrt(-2 * Math.log(rnd())), t = 2 * Math.PI * rnd(); spare = r * Math.sin(t); return r * Math.cos(t); };
  const om = (omega * 3) / Math.max(3, N - 1), T = pairState(V, { d, c: CA, omega: om, rmax: 40 }), n = N * d, pairs = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) pairs.push([i, j]);
  const local = (x, F) => { F.fill(0); let e = 0, lp = 0;
    for (const [i, j] of pairs) { let r2 = 0; for (let k = 0; k < d; k++) { const u = x[i * d + k] - x[j * d + k]; r2 += u * u; } const r = Math.sqrt(r2), g = T.upf(r); lp += T.lnf(r); e += T.E - om * r2 + 2 * D * g * g; for (let k = 0; k < d; k++) { const t = (g * (x[i * d + k] - x[j * d + k])) / r; F[i * d + k] += 2 * t; F[j * d + k] -= 2 * t; } }
    if (three) { const R2 = (i, j) => { let t = 0; for (let k = 0; k < d; k++) { const u = x[i * d + k] - x[j * d + k]; t += u * u; } return t; }; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) for (let k = j + 1; k < N; k++) e += three.W * Math.exp(-(R2(i, j) + R2(j, k) + R2(i, k)) / (three.b * three.b)); }
    let q = 0; for (let k = 0; k < n; k++) q += (F[k] / 2) ** 2; return { E: e - D * q, lp }; };
  const drift = (F) => { const out = new Float64Array(n); for (let i = 0; i < N; i++) { let v2 = 0; for (let a = 0; a < d; a++) v2 += (F[i * d + a] / 2) ** 2; const f = v2 > 0 ? (-1 + Math.sqrt(1 + 2 * D * tau * v2)) / (D * tau * v2) : 1; for (let a = 0; a < d; a++) out[i * d + a] = f * D * tau * F[i * d + a]; } return out; };
  const spread = 1.5 + 0.6 * Math.pow(N, 1 / d); let W = []; while (W.length < walkers) { const x = Float64Array.from({ length: n }, () => spread * gauss()), F = new Float64Array(n), L = local(x, F); W.push({ x, F, E: L.E, lp: L.lp }); }
  const e0 = W.map((w) => w.E).sort((a, b) => a - b), ecut = Math.max(20, 5 * (e0[Math.floor(0.75 * walkers)] - e0[Math.floor(0.25 * walkers)])); let ET = e0[walkers >> 1], Erun = ET; const Es = [], xn = new Float64Array(n), Fn = new Float64Array(n);
  for (let st = 0; st < steps; st++) {
    const next = []; let sE = 0, sW = 0;
    for (const w of W) {
      const dr = drift(w.F); for (let k = 0; k < n; k++) xn[k] = w.x[k] + dr[k] + Math.sqrt(2 * D * tau) * gauss();
      const L = local(xn, Fn), dn = drift(Fn); let lg = 0; for (let k = 0; k < n; k++) { const f = w.x[k] - xn[k] - dn[k], b = xn[k] - w.x[k] - dr[k]; lg += (b * b - f * f) / (4 * D * tau); }
      let x = w.x, F = w.F, E1 = w.E, lp = w.lp; if (rnd() < Math.exp(2 * (L.lp - w.lp) + lg)) { x = Float64Array.from(xn); F = Float64Array.from(Fn); E1 = L.E; lp = L.lp; }
      const cap = (e) => Math.max(Erun - ecut, Math.min(Erun + ecut, e)), wt = Math.exp(-tau * (0.5 * (cap(w.E) + cap(E1)) - ET)), m = Math.min(Math.floor(wt + rnd()), 3);
      for (let k = 0; k < m; k++) next.push({ x: k ? Float64Array.from(x) : x, F: k ? Float64Array.from(F) : F, E: E1, lp });
      sE += wt * E1; sW += wt;
    }
    W = next; if (!W.length) break; const Em = sE / sW;
    if (st < equil) { Erun = Em; ET = Em - Math.log(W.length / walkers) / (20 * tau); } else { Erun += (Em - Erun) / Math.min(st - equil + 1, 2000); ET = Erun - Math.log(W.length / walkers) / (200 * tau); Es.push(Em); }
  }
  const B = Math.max(1, Math.min(Math.round(0.5 / tau), Math.floor(Es.length / 10))), nb = Math.floor(Es.length / B), bm = Array.from({ length: nb }, (_, i) => Es.slice(i * B, (i + 1) * B).reduce((a, b) => a + b, 0) / B), mean = bm.reduce((a, b) => a + b, 0) / nb;
  return { E: mean, err: Math.sqrt(bm.reduce((a, b) => a + (b - mean) ** 2, 0) / (nb * (nb - 1))), N };
}
/* the supersymmetric factor that puts our two helium-4s at threshold */
export function calibrateLocal(F, a3 = alphaWidth(3, 2.13)) {
  const E = (lam) => levels(alphaLocal(3, F, 1, a3, lam).V, { d: 3, l: 0, c: CA, rmax: 60, h: 0.005, emax: 5 })[0];
  let lo = 1.5, hi = 4.5; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (E(m) < 0) hi = m; else lo = m; } return (lo + hi) / 2;
}

/* Radiative capture: two helium-4s meeting and ending bound by sending off light. Two identical spinless helium-4s
   have their centre of charge on their centre of mass, so they have no dipole to radiate: their capture is electric
   quadrupole (E2), as our helium-4 captures onto carbon and oxygen are. A transition's quadrupole Q_ij = ⟨f|Σ q x_i x_j|i⟩
   (its trace doesn't radiate) emits at Γ = 2π Σ_photons |⟨ε·J(k)⟩|²/(2ω ε_eff V) δ(ω_k − ω), and the sum over a
   photon's d − 1 polarizations and directions gives Γ = π S_d ω^(d+2) Tr(QQ†) / (4 (2π)^d (d + 2) ε_eff). Ours: ε_eff = ε₀
   = 1/4πα, so Γ = α ω⁵ Tr(QQ†)/10 (Blatt and Weisskopf's 4π/75 · α ω⁵ B(E2)). Through the lens vacuum a photon of
   frequency ω carries its energy at ε₀ℓω, and the pinned 1/r fixes α = e²/(4π² ε₀ ℓ), so ε_eff = ω/4π²α and ℓ drops
   out: Γ = (π/48) α ω⁵ Tr(QQ†), the same power of ω as ours and 0.65 of our strength (ħ = c = 1, ω in fm⁻¹). */
export const E2RATE = { 3: 1 / 10, 4: Math.PI / 48 };
const GAM = { 3: Math.sqrt(Math.PI) / 2, 4: 1 }; // Γ(d/2)
/* all bound states of V in the l-th partial wave, on the same three-point grid levels() uses: [{E, u}], ∫u² dr = 1 */
function boundStates(V, { d, l, c, rmax = 30, h = 0.01 }) {
  const n = Math.round(rmax / h) - 1, L2 = l * (l + d - 2) + ((d - 1) * (d - 3)) / 4, off = -c / (h * h);
  return levels(V, { d, l, c, rmax, h, emax: 0 }).map((E) => {
    const dg = Float64Array.from({ length: n }, (_, i) => { const x = (i + 1) * h; return (2 * c) / (h * h) + (c * L2) / (x * x) + V(x) - E * (1 + 1e-11) - 1e-12; });
    let v = Float64Array.from({ length: n }, (_, i) => Math.sin((i + 1) * 0.37) + 1.1);
    for (let it = 0; it < 4; it++) { const cp = new Float64Array(n), dp = new Float64Array(n); cp[0] = off / dg[0]; dp[0] = v[0] / dg[0];
      for (let i = 1; i < n; i++) { const m = dg[i] - off * cp[i - 1]; cp[i] = off / m; dp[i] = (v[i] - off * dp[i - 1]) / m; }
      const x = new Float64Array(n); x[n - 1] = dp[n - 1]; for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
      const nm = Math.sqrt(x.reduce((t, y) => t + y * y, 0) * h); let big = 0; for (const y of x) if (Math.abs(y) > Math.abs(big)) big = y; v = x.map((y) => (y / nm) * Math.sign(big)); }
    return { E, u: v, h };
  });
}
/* the regular scattering solution of the l-th partial wave at energy E > 0, normalized as that partial wave of a unit
   plane wave e^(ik·r) = Γ(ν)(kr/2)^(−ν) Σ_l i^l (ν + l) J_(ν+l)(kr) C_l^ν(k̂·r̂), ν = (d − 2)/2: far out
   u = r^((d−1)/2) R swings with amplitude Γ(ν) 2^ν (ν + l) √(2/π) k^(−(d−1)/2). Returned on the grid 0, h, 2h, … */
function scatterU(V, { d, l, c, E, h = 0.01, rin = 30 }) {
  const L2 = l * (l + d - 2) + ((d - 1) * (d - 3)) / 4, k = Math.sqrt(E / c), f = (r) => L2 / (r * r) + (V(r) - E) / c;
  const nu = (d - 2) / 2, amp = (GAM[d] / nu) * Math.pow(2, nu) * (nu + l) * Math.sqrt(2 / Math.PI) * Math.pow(k, -(d - 1) / 2);
  const rt = Math.max(rin, (V(rin) * rin) / E), rmax = Math.max(4 * rin, 8 * rt), p = l + (d - 1) / 2;
  const rk = (r, y, s) => { const g = (r, y) => [y[1], f(r) * y[0]], a = g(r, y), b = g(r + s / 2, [y[0] + (s / 2) * a[0], y[1] + (s / 2) * a[1]]), q = g(r + s / 2, [y[0] + (s / 2) * b[0], y[1] + (s / 2) * b[1]]), e = g(r + s, [y[0] + s * q[0], y[1] + s * q[1]]);
    return [y[0] + (s / 6) * (a[0] + 2 * b[0] + 2 * q[0] + e[0]), y[1] + (s / 6) * (a[1] + 2 * b[1] + 2 * q[1] + e[1])]; };
  const n = Math.round(rin / h), u = new Float64Array(n + 1); let r = h / 4, y = [r ** p, p * r ** (p - 1)];
  for (let i = 0; i < 4; i++) { y = rk(r, y, h / 16); r += h / 16; } // to h/2 finely, past the 1/r² start
  y = rk(r, y, h / 2); r = h; u[1] = y[0];
  for (let i = 1; i < n; i++) { y = rk(r, y, h); r += h; u[i + 1] = y[0]; }
  let scale = 1; const s = 0.02, ren = (m) => { y = [y[0] / m, y[1] / m]; scale *= m; };
  while (r < rmax) { y = rk(r, y, s); r += s; const m = Math.abs(y[0]) + Math.abs(y[1]); if (m > 1e200) ren(m); }
  const kl = Math.sqrt(Math.max(1e-12, -f(r))), A = scale * Math.sqrt((y[0] ** 2 + (y[1] / kl) ** 2) * (kl / k));
  return { u: u.map((x) => (x * amp) / A), h, k };
}
/* ∫ C_2^ν(cos θ) (cos²θ − 1/d) dΩ_d, which sets how much of a plane wave's d-wave a quadrupole carries into an s-state */
function dWaveOverlap(d) { const nu = (d - 2) / 2, M = 4000; let s = 0; for (let i = 0; i < M; i++) { const t = (Math.PI * (i + 0.5)) / M, x = Math.cos(t); s += (2 * nu * (nu + 1) * x * x - nu) * (x * x - 1 / d) * Math.sin(t) ** (d - 2); } return (SD1[d] * s * Math.PI) / M; }
/* two helium-4s in d dimensions (the deep folded potential plus Coulomb; its lowest two s-states and lowest d-state are
   Pauli-forbidden, the rest allowed) at relative energy E (MeV): every bound state they can reach by an E2 photon, from
   their s-wave (into 2⁺ states) and their d-wave (into 0⁺ states). σv in fm^(d−1) c, identical bosons counted; the
   dimensionless S̃ = σ k^(d−1) e^G strips the barrier, the part logRate in stars.js assumes the same in both worlds */
export function alphaCapture({ d, F, s = 1, a, lam, E, deep = null }) {
  const Vn = deep ?? deepNuclear(d, F, s, a, lam), V = (r) => Vn(r) + (4 * E2 * erfA(Math.sqrt(a / 2) * r)) / r, c = CA, mu = HB2M > 0 ? (2 * 197.327 ** 2) / HB2M : 0;
  const fin = { 0: boundStates(V, { d, l: 0, c }).slice(2), 2: boundStates(V, { d, l: 2, c }).slice(1) }, h = 0.01, parts = [];
  const sc = { 0: scatterU(V, { d, l: 0, c, E, h }), 2: scatterU(V, { d, l: 2, c, E, h }) }, nu = (d - 2) / 2;
  const cD = dWaveOverlap(d) / ((1 - 1 / d) * Math.sqrt(SD[d])), ang = { 0: SD[d] * (1 - 1 / d), 2: cD * cD * (1 - 1 / d) };
  for (const [li, lf] of [[0, 2], [2, 0]]) for (const st of fin[lf]) {
    const ui = sc[li].u; let I = 0; for (let i = 1; i < st.u.length && i < ui.length; i++) { const r = i * h; I += st.u[i - 1] * ui[i] * r * r * h; }
    const w = (E - st.E) / 197.327, sv = 2 * E2RATE[d] * ALPHA_FS * w ** 5 * I * I * ang[li];
    parts.push({ from: li, to: lf, Ef: st.E, Egamma: E - st.E, sv });
  }
  const k = sc[0].k, v = (197.327 * k) / mu, sv = parts.reduce((t, p) => t + p.sv, 0);
  return { E, k, v, sv, sigma: sv / v, parts, nu };
}
const ALPHA_FS = 1 / 137.035999;
/* a bound 2⁺'s E2 width to a 0⁺ (MeV), averaged over the 2⁺'s substates: (1 − 1/d) of the quadrupole shared among the
   l = 2 harmonics (5 ours, 9 in 4D) */
export function e2Width(d, u2, u0, h, Egamma) { let I = 0; for (let i = 0; i < Math.min(u2.length, u0.length); i++) { const r = (i + 1) * h; I += u2[i] * u0[i] * r * r * h; } const N2 = d === 3 ? 5 : 9, w = Egamma / 197.327; return 197.327 * E2RATE[d] * ALPHA_FS * w ** 5 * I * I * (1 - 1 / d) / N2; }
export { boundStates, scatterU };

/* ———— the first minutes' captures ———— */
/* ⟨1/r⟩ for r spread as (ν/π)^(d/2) e^(−ν(r − S)²) about a point S away: a Gaussian charge under the pinned 1/r. Ours
   erf(√ν S)/S; in 4D, from 1/r = (2/√π)∫e^(−t²r²)dt, (√(πν)/2) e^(−x)(I₀(x) + I₁(x)) with x = νS²/2 */
/* e^(−x)(I₀(x) + I₁(x)) and erf, to near machine precision: the projections of Brink's kernels onto Pauli-allowed states
   cancel large parts against each other, and a 1e−7 error in the Coulomb term would survive the cancellation. Series
   below x = 25, Hankel's asymptotic series above (its terms shrink past that) */
function i01(x) {
  if (x < 25) { const h = x / 2; let t0 = 1, t1 = h, s0 = 1, s1 = h; for (let k = 1; k < 200; k++) { t0 *= (h * h) / (k * k); t1 *= (h * h) / (k * (k + 1)); s0 += t0; s1 += t1; if (t0 < 1e-17 * s0 && t1 < 1e-17 * s1) break; } return Math.exp(-x) * (s0 + s1); }
  const asym = (nu) => { const m = 4 * nu * nu; let term = 1, sum = 1; for (let k = 1; k < 30; k++) { const nt = (-term * (m - (2 * k - 1) ** 2)) / (k * 8 * x); if (Math.abs(nt) > Math.abs(term)) break; term = nt; sum += term; } return sum / Math.sqrt(2 * Math.PI * x); };
  return asym(0) + asym(1);
}
function erfC(x) {
  const ax = Math.abs(x); let v;
  if (ax < 3) { let term = ax, sum = ax; for (let k = 1; k < 200; k++) { term *= (-ax * ax) / k; const c = term / (2 * k + 1); sum += c; if (Math.abs(c) < 1e-17 * Math.abs(sum)) break; } v = (2 / Math.sqrt(Math.PI)) * sum; }
  else { let f = ax, C = ax, D = 0; for (let k = 1; k < 300; k++) { const an = k / 2; D = ax + an * D; C = ax + an / C; D = 1 / D; const delta = C * D; f *= delta; if (Math.abs(delta - 1) < 1e-16) break; } v = 1 - Math.exp(-ax * ax) / (Math.sqrt(Math.PI) * f); }
  return x < 0 ? -v : v;
}
export function coulombAvg(d, nu, S) {
  if (d === 3) return S < 1e-8 ? 2 * Math.sqrt(nu / Math.PI) : erfC(Math.sqrt(nu) * S) / S;
  return (Math.sqrt(Math.PI * nu) / 2) * i01((nu * S * S) / 2);
}
/* a nucleon meeting a helium-4 and ending bound in a p-state (mass 5) by an electric-dipole photon, which their unequal
   charge-to-mass ratios allow: dipole charge (Z₁A₂ − Z₂A₁)/A = +2/5 e for a proton, −2/5 for a neutron. Γ = E1RATE α ω³ |D|²:
   (4/3) ours, (3π/8) through the lens vacuum (ℓ again gone). From the nucleon's s-wave into every bound p-state of the folded
   potential (nucleonPot, the factor λ set on our helium-5), the proton feeling helium-4's Gaussian charge. σv in fm^(d−1) c */
export const E1RATE = { 3: 4 / 3, 4: (3 * Math.PI) / 8 };
export function nucleonCapture({ d, F, s, a, lam, E, Z = 1, Vn = null }) {
  const Vf = Vn ?? nucleonPot(d, F, s, a, lam), V = Z ? (r) => Vf(r) + 2 * Z * E2 * coulombAvg(d, a, r) : Vf, c = (HB2M * 5) / 8, mu = (0.8 * 197.327 ** 2) / HB2M, h = 0.01;
  const fin = boundStates(V, { d, l: 1, c, rmax: 40 }), sc = scatterU(V, { d, l: 0, c, E, h }), ee = Z ? 0.4 : -0.4, parts = [];
  for (const st of fin) { let I = 0; for (let i = 1; i < st.u.length && i < sc.u.length; i++) I += st.u[i - 1] * sc.u[i] * i * h * h; const w = (E - st.E) / 197.327; parts.push({ Ef: st.E, sv: E1RATE[d] * ALPHA_FS * w ** 3 * ee * ee * I * I * SD[d] }); }
  const sv = parts.reduce((t, p) => t + p.sv, 0), v = (197.327 * sc.k) / mu;
  return { E, k: sc.k, v, sv, sigma: sv / v, parts };
}
export { nucleonPot };

/* ———— the ladder's rungs: a helium-4 captured onto a core of k helium-4s ————
   The helium-4–core potential is the helium-4 pair's deep potential folded over the core's helium-4 centres (a Gaussian
   spread of mean-square radius rc2 about the core's middle, k of them), V(r) = k ∫ ρ(R) V_αα(|r − R|) d^dR, times one
   factor per rung set so the product's ground state sits at the rung's capture energy. The Pauli principle forbids the
   relative states with fewer than Q oscillator quanta (2n + l < Q, Wildermuth's rule: Q = 4 while the four nucleons
   enter the first excited shell, which holds A ≤ 16 ours and A ≤ 20 in 4D, then 8): those are the deep potential's lowest
   levels and are skipped. Capture is electric quadrupole (both spinless, the same charge-to-mass ratio, so no dipole),
   with charge (Z₁A₂² + Z₂A₁²)/A² = 2k/(k + 1) for helium-4 onto k helium-4s. */
export function foldCore(d, Vaa, k, rc2, { rmax = 16, dr = 0.05 } = {}) {
  const n = Math.round(rmax / dr), sig = Math.sqrt(rc2 / d), Rmax = 5 * sig, NR = 80, NT = 48, tab = new Float64Array(n + 1);
  const rho = (R) => Math.pow(d / (2 * Math.PI * rc2), d / 2) * Math.exp((-d * R * R) / (2 * rc2));
  for (let i = 0; i <= n; i++) { const r = i * dr; let s = 0;
    for (let a = 0; a < NR; a++) { const R = (Rmax * (a + 0.5)) / NR; let ang = 0; for (let b = 0; b < NT; b++) { const t = (Math.PI * (b + 0.5)) / NT; ang += Vaa(Math.sqrt(Math.max(0, r * r + R * R - 2 * r * R * Math.cos(t)))) * Math.sin(t) ** (d - 2); }
      s += rho(R) * R ** (d - 1) * SD1[d] * ang * (Math.PI / NT) * (Rmax / NR); }
    tab[i] = k * s; }
  return (r) => { const x = r / dr; if (x >= n) return 0; const i = Math.floor(x), f = x - i; return tab[i] * (1 - f) + tab[i + 1] * f; };
}
/* the rung's potential (nuclear part times f, plus Coulomb between charges 2 and 2k spread over ν) and its reduced ħ²/2μ */
function rungParts(d, Vfold, k, f, nu = 0.3) { const A2 = 4 * k, c = (HB2M * (4 + A2)) / (8 * A2); return { V: (r) => f * Vfold(r) + 2 * 2 * k * E2 * coulombAvg(d, nu, r), c }; }
/* the factor that puts the lowest allowed 0⁺ at −Q MeV (Q/2 forbidden s-states below it for Q quanta) */
export function rungFactor(d, Vfold, k, Qval, { quanta = 4 } = {}) {
  const nF = quanta / 2, E0 = (f) => { const { V, c } = rungParts(d, Vfold, k, f); return levels(V, { d, l: 0, c, rmax: 30, h: 0.01, emax: 1e4 })[nF]; };
  let lo = 0.2, hi = 6; for (let it = 0; it < 50; it++) { const m = (lo + hi) / 2, e = E0(m); if (e === undefined || e > -Qval) lo = m; else hi = m; } return (lo + hi) / 2;
}
/* helium-4 onto k helium-4s at relative energy E: σv (fm^(d−1) c) by E2 into every allowed bound 2⁺ (from the s-wave)
   and 0⁺ (from the d-wave) */
export function rungCapture({ d, Vfold, k, f, E, quanta = 4 }) {
  const { V, c } = rungParts(d, Vfold, k, f), h = 0.01, mu = ((4 * 4 * k) / (4 + 4 * k)) * (197.327 ** 2 / HB2M), ee = (2 * k) / (k + 1);
  const fin = { 0: boundStates(V, { d, l: 0, c }).slice(quanta / 2), 2: boundStates(V, { d, l: 2, c }).slice(quanta / 2 - 1) }, parts = [];
  const sc = { 0: scatterU(V, { d, l: 0, c, E, h }), 2: scatterU(V, { d, l: 2, c, E, h }) }, cD = dWaveOverlap(d) / ((1 - 1 / d) * Math.sqrt(SD[d])), ang = { 0: SD[d] * (1 - 1 / d), 2: cD * cD * (1 - 1 / d) };
  for (const [li, lf] of [[0, 2], [2, 0]]) for (const st of fin[lf]) { const ui = sc[li].u; let I = 0; for (let i = 1; i < st.u.length && i < ui.length; i++) { const r = i * h; I += st.u[i - 1] * ui[i] * r * r * h; }
    const w = (E - st.E) / 197.327; parts.push({ from: li, to: lf, Ef: st.E, sv: E2RATE[d] * ALPHA_FS * ee * ee * w ** 5 * I * I * ang[li] }); }
  const sv = parts.reduce((t, p) => t + p.sv, 0), k0 = sc[0].k, v = (197.327 * k0) / mu;
  return { E, k: k0, v, sv, sigma: sv / v, parts };
}
