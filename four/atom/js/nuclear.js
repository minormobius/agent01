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
     Serber's even-wave form, with the exchange read off these nodes, underbinds (⁶He −21.5 ± 1.0, ⁸Be −36 ± 5). So the
     book uses it for A ≤ 4 only. With steps = 0 it returns the trial's local energy and ln ψ, for checking.
   · shells: the Woods–Saxon single-particle levels with a spin–orbit term. 4D's spin couples to the left half of a
     turning only (js/turning.js, js/magnet.js), so the 3D l·s (l/2 and −(l + 1)/2, 2l + 2 and 2l states) becomes
     2 s·J_L (l/2 and −(l + 2)/2, (l + 1)(l + 2) and l(l + 1) states), at our strength: a declaration.
   · coulombFactor: ½⟨1/r⟩ between two points of a uniform unit d-ball (3/5 in 3D), from js/kernel.js's shell kernel. */
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
export function fixedNode({ d, counts, V, s = 1, like = "zero", coulomb = true, tau = 1e-4, walkers = 800, steps = 20000, equil = 4000, seed = 1, omega = 0.5, omegaLike = 0.3, trace = null }) {
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
