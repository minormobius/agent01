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
     it sets how the fitted force carries into 4D. */
import { k4 } from "./kernel.js";

export const HB2M = 41.47106, E2 = 1.43996; // ħ²/m_N (MeV fm²), e² (MeV fm)
export const MT = {
  triplet: { VR: 1438.4812, VA: 626.8932, muR: 3.11, muA: 1.55 }, // MT-III
  singlet: { VR: 1438.4812, VA: 513.9718, muR: 3.11, muA: 1.55 }, // MT-I
  v: { VR: 1458.047, VA: 578.089, muR: 3.11, muA: 1.55 }, // MT-V
};
export const mtPot = (p, s = 1) => (r) => (p.VR * Math.exp(-p.muR * r) - s * p.VA * Math.exp(-p.muA * r)) / r;

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
export function window(d) {
  const E = (p, s) => levels(mtPot(p, s), { d, rmax: 80, h: 0.01 })[0];
  const bisect = (test) => { let a = 0.5, b = 3; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (test(m)) b = m; else a = m; } return b; };
  return { deuteron: bisect((s) => E(MT.triplet, s) !== undefined), ours: bisect((s) => (E(MT.triplet, s) ?? 0) < -2.2246), diproton: bisect((s) => E(MT.singlet, s) !== undefined) };
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
  let ET = med, Erun = ET; const Es = []; const xn = new Float64Array(n), Fn = new Float64Array(n); let acc = 0, tot = 0;
  for (let st = 0; st < steps; st++) {
    const next = []; let sE = 0, sW = 0;
    for (const w of W) {
      const dr = drift(w.F); for (let k = 0; k < n; k++) xn[k] = w.x[k] + dr[k] + Math.sqrt(2 * D * tau) * gauss();
      const L = local(xn, Fn); tot++; let x = w.x, F = w.F, E1 = w.E, lp = w.lp;
      if (L && L.sgn === w.sgn) { const dn = drift(Fn); let lg = 0; for (let k = 0; k < n; k++) { const f = w.x[k] - xn[k] - dn[k], b = xn[k] - w.x[k] - dr[k]; lg += (b * b - f * f) / (4 * D * tau); } if (rnd() < Math.exp(2 * (L.lp - w.lp) + lg)) { acc++; x = Float64Array.from(xn); F = Float64Array.from(Fn); E1 = L.E; lp = L.lp; } }
      const cap = (e) => Math.max(Erun - ecut, Math.min(Erun + ecut, e)), wt = Math.exp(-tau * (0.5 * (cap(w.E) + cap(E1)) - ET)), m = Math.min(Math.floor(wt + rnd()), 3);
      for (let k = 0; k < m; k++) next.push({ x: k ? Float64Array.from(x) : x, F: k ? Float64Array.from(F) : F, E: E1, sgn: w.sgn, lp });
      sE += wt * E1; sW += wt;
    }
    W = next; const Em = sE / sW; if (st < equil) { Erun = Em; ET = Em - Math.log(W.length / walkers) / (20 * tau); } else { Erun += (Em - Erun) / Math.min(st - equil + 1, 2000); ET = Erun - Math.log(W.length / walkers) / (200 * tau); } // equilibrating: follow the energy closely
    if (trace) trace(st, W.length, Em, ET); if (!W.length) break;
    if (st >= equil) Es.push(Em);
  }
  const B = Math.max(1, Math.min(Math.round(0.2 / tau), Math.floor(Es.length / 10))), nb = Math.floor(Es.length / B), bm = Array.from({ length: nb }, (_, i) => Es.slice(i * B, (i + 1) * B).reduce((a, b) => a + b, 0) / B), mean = bm.reduce((a, b) => a + b, 0) / nb, err = Math.sqrt(bm.reduce((a, b) => a + (b - mean) ** 2, 0) / (nb * (nb - 1)));
  return { E: mean, err, acc: acc / tot, A };
}

/* ———— nuclear matter (Brueckner–Hartree–Fock) ———— */

/* the three-nucleon repulsion's energy per nucleon in uniform matter of density rho (Hartree) */
/* the fitted three-nucleon strength: c = W π³ b⁶/2 (MeV fm⁶) saturating our matter at −16 MeV (tools/nuclei.mjs fit, which
   recomputes it; its bake checks the two agree). For a range b, W = 2c/(π³ b⁶) */
export const THREE_C = 493.4;
export const threeForce = (b, c = THREE_C) => ({ b, W: (2 * c) / (Math.PI ** 3 * b ** 6) });
export const threeBodyMatter = (d, { W, b }, rho) => 0.5 * W * (Math.PI ** (d / 2) * b ** d) ** 2 * rho * rho;
const SD = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI }; // the unit sphere's area
export function gaussLegendre(n) { const x = [], w = []; for (let i = 0; i < n; i++) { let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), pp = 0; for (let it = 0; it < 100; it++) { let p1 = 1, p2 = 0; for (let j = 0; j < n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1); } pp = (n * (z * p1 - p2)) / (z * z - 1); const z1 = z; z = z1 - p1 / pp; if (Math.abs(z - z1) < 1e-15) break; } x.push(z); w.push(2 / ((1 - z * z) * pp * pp)); } return { x, w }; }
// the force's Fourier transform: Σ c e^(−μr)/r → 4π c/(p²+μ²) (3D), 4π² c/(p²+μ²)^(3/2) (4D)
export const ft = (d, p, s) => (p2) => (d === 3 ? 4 * Math.PI * (p.VR / (p2 + p.muR ** 2) - (s * p.VA) / (p2 + p.muA ** 2)) : 4 * Math.PI * Math.PI * (p.VR / (p2 + p.muR ** 2) ** 1.5 - (s * p.VA) / (p2 + p.muA ** 2) ** 1.5));
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
export function matter({ d, s, kF, kind = "symmetric", lmax = 8, nq = 48, nk = 12, iters = 30, A0 = -60, B0 = 0, quiet = true, three = null }) {
  const chans = kind === "symmetric" ? [{ pot: MT.triplet, w: 3 }, { pot: MT.singlet, w: 3 }] : [{ pot: MT.singlet, w: 1 }], nu = kind === "symmetric" ? 4 : 2;
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
