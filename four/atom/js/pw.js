/* ATOM⁴'s crystals by quantum mechanics, no DOM: density-functional theory on plane waves in d = 3 (ours, the check) or
   d = 4 dimensions. The referee the ionic model (js/ionic.js) needs, and the band structure lasers need.

   A crystal's electrons in a periodic cell (rows of H the lattice vectors, volume Ω): each orbital at crystal momentum k
   is ψ = Ω^(−½) Σ_G c_G e^(i(k+G)·r), the G the reciprocal lattice (rows of 2π H⁻ᵀ) with |k + G|²/2 ≤ ecut. The
   Hamiltonian is the book's own physics in plane waves:
     kinetic   |k + G|²/2, diagonal;
     Hartree   V_H(G) = K(G) ρ(G), with the force's own transform: K = 4π/G² in 3D, the pinned 1/r's 4π²/G³ in 4D;
     exchange  local, ε_x = −C_d ρ^(1+1/d) (js/atom.js's EXCHANGE: Dirac's in 3D, its 4D counterpart), no correlation;
     ions      each species' pseudopotential: a local part v(r) (FT'd by `radialFT`) and Kleinman–Bylander projectors.
   The local and Hartree terms act on a real-space grid (FFT); the projectors in G space. Bands by block Davidson with
   Rayleigh–Ritz (complex Hermitian, solved as its real symmetric double), the density mixed by Pulay with Kerker's
   damping of long waves.

   Energies (per cell): band kinetic + nonlocal, ∫ρV_loc, E_H, E_x, and the ions' Ewald energy. Every G = 0 term
   follows one convention: the ions sit in a uniform negative background, the electrons in a uniform positive one, and
   the divergent pieces cancel because the cell is neutral. What's left is each species' "α Z" term, ∫(v(r) + Z/r) d^d r
   × N_electrons / Ω, and the Ewald background −Q²/(2Ω) ∫ erfc(αr)/r d^d r. */
import { erfc, Qgamma } from "./md.js";
import { jacobiEigen } from "./gauss.js";
import { Ionic } from "./ionic.js";

export const SPHERE = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI };
export const EXCHANGE = { 3: 0.75 * Math.cbrt(3 / Math.PI), 4: 16 / (15 * Math.sqrt(Math.PI)) }; // as js/atom.js
const GAM = { 0.5: Math.sqrt(Math.PI), 1: 1, 1.5: Math.sqrt(Math.PI) / 2, 2: 1, 2.5: (3 * Math.sqrt(Math.PI)) / 4, 3: 2 };
/* the Coulomb kernel's transform: 3D 4π/G², pinned 4D 4π²/G³ */
export const coulombK = (d, g) => (d === 3 ? (4 * Math.PI) / (g * g) : (4 * Math.PI * Math.PI) / (g * g * g));
/* the transform of the smooth part of 1/r, erf(αr)/r, in d dimensions (js/ionic.js's FT_p at p = 1) */
export const smoothK = (d, g, alpha) => (Math.PI ** (d / 2) * 2 ** (d - 1) * g ** (1 - d) * GAM[(d - 1) / 2] * Qgamma((d - 1) / 2, (g * g) / (4 * alpha * alpha))) / GAM[0.5];
/* ∫ erfc(αr)/r d^d r: the uniform background's term (3D π/α², 4D 2π^(3/2)/3α³) */
export const backgroundInt = (d, alpha) => (SPHERE[d] * GAM[d / 2]) / ((d - 1) * Math.sqrt(Math.PI) * alpha ** (d - 1));

/* ---------------------------------------------------------------- the FFT in any number of dimensions
   mixed radix (2, 3, 4, 5) Cooley–Tukey, decimation in time: a digit-reversed copy, then the stages from the smallest
   blocks up. Forward: X_n = Σ_j x_j e^(−2πi n·j/N), unscaled both ways */
const PLANS = new Map();
export const goodSize = (n) => { for (let m = Math.max(1, n); ; m++) { let k = m; for (const p of [2, 3, 5]) while (k % p === 0) k /= p; if (k === 1) return m; } };
function plan(n) {
  if (PLANS.has(n)) return PLANS.get(n);
  const f = []; let k = n; while (k % 4 === 0) { f.push(4); k /= 4; } for (const p of [2, 3, 5]) while (k % p === 0) { f.push(p); k /= p; } if (k !== 1) throw new Error(`fft: ${n} is not 2^a 3^b 5^c`);
  // digit reversal: input index i = q1 + p1 q2 + p1 p2 q3 …  →  position q1 (n/p1) + q2 (n/p1 p2) + …
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) { let r = i, pos = 0, span = n; for (const p of f) { span /= p; pos += (r % p) * span; r = Math.floor(r / p); } perm[pos] = i; }
  const c = new Float64Array(n), s = new Float64Array(n); for (let j = 0; j < n; j++) { c[j] = Math.cos((2 * Math.PI * j) / n); s[j] = Math.sin((2 * Math.PI * j) / n); }
  const P = { n, f, perm, c, s, br: new Float64Array(n), bi: new Float64Array(n) }; PLANS.set(n, P); return P;
}
function fft1(re, im, n, inverse) {
  const P = plan(n), { f, perm, c, s } = P, sg = inverse ? 1 : -1;
  let xr = P.br, xi = P.bi, yr = (P.cr ??= new Float64Array(n)), yi = (P.ci ??= new Float64Array(n));
  for (let i = 0; i < n; i++) { xr[i] = re[perm[i]]; xi[i] = im[perm[i]]; }
  const C3 = -0.5, S3 = sg * Math.sqrt(3) / 2, C51 = Math.cos((2 * Math.PI) / 5), C52 = Math.cos((4 * Math.PI) / 5), S51 = sg * Math.sin((2 * Math.PI) / 5), S52 = sg * Math.sin((4 * Math.PI) / 5);
  let m = 1;
  for (let st = f.length - 1; st >= 0; st--) { const p = f[st], L = p * m, step = n / L;
    for (let b0 = 0; b0 < n; b0 += L) for (let k = 0; k < m; k++) {
      const i0 = b0 + k, w1 = k * step; // twiddle W^(q k step) for each input q
      let a0r = xr[i0], a0i = xi[i0], a1r, a1i, a2r, a2i, a3r, a3i, a4r, a4i;
      { const j = i0 + m, wr = c[w1], wi = sg * s[w1], ur = xr[j], ui = xi[j]; a1r = ur * wr - ui * wi; a1i = ur * wi + ui * wr; }
      if (p >= 3) { const j = i0 + 2 * m, w = 2 * w1, wr = c[w], wi = sg * s[w], ur = xr[j], ui = xi[j]; a2r = ur * wr - ui * wi; a2i = ur * wi + ui * wr; }
      if (p >= 4) { const j = i0 + 3 * m, w = 3 * w1, wr = c[w], wi = sg * s[w], ur = xr[j], ui = xi[j]; a3r = ur * wr - ui * wi; a3i = ur * wi + ui * wr; }
      if (p === 5) { const j = i0 + 4 * m, w = 4 * w1, wr = c[w], wi = sg * s[w], ur = xr[j], ui = xi[j]; a4r = ur * wr - ui * wi; a4i = ur * wi + ui * wr; }
      if (p === 2) { yr[i0] = a0r + a1r; yi[i0] = a0i + a1i; yr[i0 + m] = a0r - a1r; yi[i0 + m] = a0i - a1i; }
      else if (p === 4) { const t0r = a0r + a2r, t0i = a0i + a2i, t1r = a0r - a2r, t1i = a0i - a2i, t2r = a1r + a3r, t2i = a1i + a3i, t3r = a1r - a3r, t3i = a1i - a3i;
        // ±i (a1 − a3): forward −i, inverse +i
        const jr = -sg * t3i, ji = sg * t3r;
        yr[i0] = t0r + t2r; yi[i0] = t0i + t2i; yr[i0 + m] = t1r + jr; yi[i0 + m] = t1i + ji; yr[i0 + 2 * m] = t0r - t2r; yi[i0 + 2 * m] = t0i - t2i; yr[i0 + 3 * m] = t1r - jr; yi[i0 + 3 * m] = t1i - ji; }
      else if (p === 3) { const sr = a1r + a2r, si = a1i + a2i, dr = a1r - a2r, di = a1i - a2i, mr = a0r + C3 * sr, mi = a0i + C3 * si;
        yr[i0] = a0r + sr; yi[i0] = a0i + si; yr[i0 + m] = mr - S3 * di; yi[i0 + m] = mi + S3 * dr; yr[i0 + 2 * m] = mr + S3 * di; yi[i0 + 2 * m] = mi - S3 * dr; }
      else { // radix 5
        const s1r = a1r + a4r, s1i = a1i + a4i, d1r = a1r - a4r, d1i = a1i - a4i, s2r = a2r + a3r, s2i = a2i + a3i, d2r = a2r - a3r, d2i = a2i - a3i;
        const m1r = a0r + C51 * s1r + C52 * s2r, m1i = a0i + C51 * s1i + C52 * s2i, m2r = a0r + C52 * s1r + C51 * s2r, m2i = a0i + C52 * s1i + C51 * s2i;
        const n1r = S51 * d1r + S52 * d2r, n1i = S51 * d1i + S52 * d2i, n2r = S52 * d1r - S51 * d2r, n2i = S52 * d1i - S51 * d2i;
        yr[i0] = a0r + s1r + s2r; yi[i0] = a0i + s1i + s2i;
        yr[i0 + m] = m1r - n1i; yi[i0 + m] = m1i + n1r; yr[i0 + 4 * m] = m1r + n1i; yi[i0 + 4 * m] = m1i - n1r;
        yr[i0 + 2 * m] = m2r - n2i; yi[i0 + 2 * m] = m2i + n2r; yr[i0 + 3 * m] = m2r + n2i; yi[i0 + 3 * m] = m2i - n2r; }
    }
    let t = xr; xr = yr; yr = t; t = xi; xi = yi; yi = t; m = L; }
  for (let i = 0; i < n; i++) { re[i] = xr[i]; im[i] = xi[i]; }
}
export function fftn(re, im, dims, inverse = false) {
  const total = re.length; let stride = total;
  for (let a = 0; a < dims.length; a++) {
    const n = dims[a]; stride /= n; const outer = total / (n * stride), tr = new Float64Array(n), ti = new Float64Array(n);
    for (let o = 0; o < outer; o++) for (let inn = 0; inn < stride; inn++) { const base = o * n * stride + inn;
      for (let k = 0; k < n; k++) { tr[k] = re[base + k * stride]; ti[k] = im[base + k * stride]; }
      fft1(tr, ti, n, inverse);
      for (let k = 0; k < n; k++) { re[base + k * stride] = tr[k]; im[base + k * stride] = ti[k]; } }
  }
}

/* ---------------------------------------------------------------- radial transforms
   f̂(q) = ∫ f(r) e^(−iq·r) d^d r = S_d ∫ r^(d−1) f(r) Λ_d(qr) dr, Λ₃ = sin x/x, Λ₄ = 2J₁(x)/x (the sphere-averaged plane
   wave); the radial grid r (uniform or not) with trapezoid weights */
function besselJ1(x) { // Abramowitz–Stegun 9.4.4/9.4.6 below 8 and above, |error| < 1e-7
  const ax = Math.abs(x); if (ax < 8) { const y = x * x; return (x * (72362614232 + y * (-7895059235 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))))) / (144725228442 + y * (2300535178 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))))); }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491, p1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6))), p2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const v = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * p1 - z * Math.sin(xx) * p2); return x < 0 ? -v : v; }
export const sphereWave = (d, x) => (x < 1e-6 ? 1 - (x * x) / (2 * (d)) : d === 3 ? Math.sin(x) / x : (2 * besselJ1(x)) / x);
export function radialFT(d, r, f, q) { let s = 0; for (let i = 0; i < r.length - 1; i++) { const h = r[i + 1] - r[i], a = r[i] ** (d - 1) * f[i] * sphereWave(d, q * r[i]), b = r[i + 1] ** (d - 1) * f[i + 1] * sphereWave(d, q * r[i + 1]); s += (h * (a + b)) / 2; } return SPHERE[d] * s; }

/* ---------------------------------------------------------------- harmonics for the projectors
   Real orthonormal harmonics on the (d−1)-sphere for l = 0, 1, 2 as functions of a unit vector: l = 0 a constant,
   l = 1 the d coordinates, l = 2 the traceless products (xᵢxⱼ off the diagonal, then d − 1 orthonormalized
   combinations of the squares). Normalized so ∫ Y² dΩ = 1. Counts 1, d, d(d+1)/2 − 1: 1, 3, 5 in ours, 1, 4, 9 in 4D */
export function harmonics(d, l) {
  const S = SPHERE[d];
  if (l === 0) return [() => 1 / Math.sqrt(S)];
  if (l === 1) { const c = Math.sqrt(d / S); return Array.from({ length: d }, (_, i) => (u) => c * u[i]); }
  if (l === 2) { // ⟨xᵢ²xⱼ²⟩ = 1/d(d+2) (i ≠ j), ⟨xᵢ⁴⟩ = 3/d(d+2) on the unit sphere
    const out = [], m2 = 1 / (d * (d + 2)), co = Math.sqrt(1 / (S * m2));
    for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) out.push((u) => co * u[i] * u[j]);
    // diagonal: vectors a with Σa = 0, made orthonormal under ⟨(Σ aᵢxᵢ²)(Σ bⱼxⱼ²)⟩ = m2 (2 a·b + (Σa)(Σb)) = 2 m2 a·b
    for (let k = 1; k < d; k++) { const a = Array.from({ length: d }, (_, i) => (i < k ? 1 : i === k ? -k : 0)), n = Math.sqrt(a.reduce((t, v) => t + v * v, 0)), c = 1 / Math.sqrt(S * 2 * m2) / n;
      out.push((u) => c * a.reduce((t, v, i) => t + v * u[i] * u[i], 0)); }
    return out;
  }
  throw new Error("harmonics: l ≤ 2");
}

/* ---------------------------------------------------------------- small dense complex Hermitian algebra
   matrices as { re, im } Float64Arrays, row-major n × n; eigen by the real symmetric double [[A, −B], [B, A]], whose
   eigenvalues come in equal pairs: of each pair the vector that is (x, y) gives x + iy */
function hermEigen(M, n) {
  const N2 = 2 * n, R = new Float64Array(N2 * N2);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = M.re[i * n + j], b = M.im[i * n + j]; R[i * N2 + j] = a; R[(i + n) * N2 + j + n] = a; R[i * N2 + j + n] = -b; R[(i + n) * N2 + j] = b; }
  const { values, vectors } = jacobiEigen(R, N2), idx = Array.from({ length: N2 }, (_, i) => i).sort((p, q) => values[p] - values[q]);
  // take one of each degenerate pair: Gram–Schmidt the complex vectors in order, keeping n independent ones
  const vals = [], vre = [], vim = [], used = new Set();
  // two passes: first only vectors well clear of those taken (each pair's twin is i times its partner); then, if a
  // degenerate block mixed the pairs, whatever independent part is left, so exactly n come back
  for (const thr of [0.25, 1e-8]) for (const k of idx) { if (vals.length === n) break; if (used.has(k)) continue;
    let xr = new Float64Array(n), xi = new Float64Array(n); for (let i = 0; i < n; i++) { xr[i] = vectors[i * N2 + k]; xi[i] = vectors[(i + n) * N2 + k]; }
    for (let p = 0; p < vals.length; p++) { let sr = 0, si = 0; for (let i = 0; i < n; i++) { sr += vre[p][i] * xr[i] + vim[p][i] * xi[i]; si += vre[p][i] * xi[i] - vim[p][i] * xr[i]; } for (let i = 0; i < n; i++) { xr[i] -= sr * vre[p][i] - si * vim[p][i]; xi[i] -= sr * vim[p][i] + si * vre[p][i]; } }
    let nn = 0; for (let i = 0; i < n; i++) nn += xr[i] * xr[i] + xi[i] * xi[i]; if (nn < thr) continue; nn = Math.sqrt(nn);
    for (let i = 0; i < n; i++) { xr[i] /= nn; xi[i] /= nn; } used.add(k); vals.push(values[k]); vre.push(xr); vim.push(xi); }
  // the second pass can take them out of order: sort by eigenvalue (the Rayleigh quotient, exact for an eigenvector)
  const ord = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]); return { values: ord.map((i) => vals[i]), re: ord.map((i) => vre[i]), im: ord.map((i) => vim[i]) };
}

/* ---------------------------------------------------------------- the crystal
   opts: d, H (rows, bohr), atoms [{ x: cartesian, sp: species key }], species { key: { Z (valence charge),
   vloc(q) the local part's transform (its −Z K(q) included), alphaZ = ∫(v + Z/r) d^d r, proj: [{ l, beta(q) the radial
   projector's transform per unit harmonic, D }] }, ecut (hartree), kpts [{ k: cartesian, w }], nbands, nelec */
export class PW {
  constructor(o) {
    Object.assign(this, { d: o.d, H: o.H, atoms: o.atoms, species: o.species, ecut: o.ecut, nelec: o.nelec });
    const d = this.d, H = this.H;
    this.Hi = inv(H); this.vol = Math.abs(det(H));
    this.B = Array.from({ length: d }, (_, j) => Array.from({ length: d }, (_, a) => 2 * Math.PI * this.Hi[a][j])); // rows: reciprocal vectors
    const gmax = 2 * Math.sqrt(2 * this.ecut); // the density's reach
    this.dims = H.map((h) => goodSize(2 * Math.ceil((gmax * Math.hypot(...h)) / (2 * Math.PI)) + 1)); // |n_a| ≤ |G||a_a|/2π
    this.ntot = this.dims.reduce((a, b) => a * b, 1);
    this.kpts = o.kpts ?? [{ k: new Array(d).fill(0), w: 1 }];
    this.nbands = o.nbands ?? Math.ceil(this.nelec / 2) + 2;
    this.basis = this.kpts.map((kp) => this.makeBasis(kp.k));
    this.gridG(); this.ewald = this.ewaldEnergy();
  }
  /* every grid point's G vector and |G| (the grid's index n_a taken mod N_a into −N/2 … N/2 − 1) */
  gridG() {
    const { d, dims, ntot } = this; this.G = new Float64Array(ntot * d); this.G2 = new Float64Array(ntot);
    const n = new Array(d).fill(0);
    for (let idx = 0; idx < ntot; idx++) { let r = idx; for (let a = d - 1; a >= 0; a--) { n[a] = r % dims[a]; r = (r - n[a]) / dims[a]; }
      let g2 = 0; for (let c = 0; c < d; c++) { let s = 0; for (let a = 0; a < d; a++) { const m = n[a] < dims[a] / 2 ? n[a] : n[a] - dims[a]; s += m * this.B[a][c]; } this.G[idx * d + c] = s; g2 += s * s; } this.G2[idx] = g2; }
  }
  gridIndex(m) { let idx = 0; for (let a = 0; a < this.d; a++) idx = idx * this.dims[a] + ((m[a] % this.dims[a]) + this.dims[a]) % this.dims[a]; return idx; }
  makeBasis(k) {
    const { d, B, ecut } = this, kmax = Math.sqrt(2 * ecut), bound = this.H.map((h) => Math.ceil(((kmax + Math.hypot(...k)) * Math.hypot(...h)) / (2 * Math.PI)));
    const idx = [], kg = [], m = bound.map((b) => -b);
    for (;;) { const v = new Array(d).fill(0); for (let a = 0; a < d; a++) for (let c = 0; c < d; c++) v[c] += m[a] * B[a][c];
      const q = v.map((x, c) => x + k[c]), q2 = q.reduce((t, x) => t + x * x, 0); if (q2 / 2 <= ecut) { idx.push(this.gridIndex(m)); kg.push(...q); }
      let i = 0; while (i < d && m[i] === bound[i]) { m[i] = -bound[i]; i++; } if (i === d) break; m[i]++; }
    const n = idx.length, kin = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < d; c++) s += kg[i * d + c] ** 2; kin[i] = s / 2; }
    const B0 = { k, n, idx: Int32Array.from(idx), kg: Float64Array.from(kg), kin };
    B0.proj = this.projectorsFor(B0); return B0;
  }
  /* the Kleinman–Bylander projectors at k: for each atom, channel and harmonic, the vector β(|k+G|) Y(k+G) e^(−i(k+G)·τ)/√Ω */
  projectorsFor(B0) {
    const { d } = this, out = [];
    this.atoms.forEach((at, ai) => { for (const p of this.species[at.sp].proj ?? []) { const Ys = harmonics(d, p.l);
      // the plane wave's expansion carries (−i)^l
      const ph = [[1, 0], [0, -1], [-1, 0], [0, 1]][p.l % 4];
      for (const Y of Ys) { const re = new Float64Array(B0.n), im = new Float64Array(B0.n);
        for (let i = 0; i < B0.n; i++) { const q = Array.from({ length: d }, (_, c) => B0.kg[i * d + c]), qn = Math.hypot(...q), u = qn > 1e-12 ? q.map((x) => x / qn) : q.map((_, c) => (c === 0 ? 1 : 0));
          const amp = (p.beta(qn) * Y(u)) / Math.sqrt(this.vol), arg = -q.reduce((t, x, c) => t + x * at.x[c], 0), cr = Math.cos(arg), ci = Math.sin(arg);
          const ar = amp * (ph[0] * cr - ph[1] * ci), ai = amp * (ph[0] * ci + ph[1] * cr); re[i] = ar; im[i] = ai; }
        out.push({ re, im, D: p.D, atom: ai }); } } });
    return out;
  }
  /* the local potential's G components (ions), V_loc(G) = Σ_atoms e^(−iG·τ) v̂(|G|)/Ω, G = 0 from the α Z terms */
  localG() {
    const { d, ntot, G, G2 } = this, re = new Float64Array(ntot), im = new Float64Array(ntot), cache = new Map();
    for (let idx = 0; idx < ntot; idx++) { if (G2[idx] === 0) continue; const g = Math.sqrt(G2[idx]);
      for (const at of this.atoms) { const sp = this.species[at.sp], key = at.sp + "|" + g.toFixed(10); if (!cache.has(key)) cache.set(key, sp.vloc(g));
        const v = cache.get(key) / this.vol; let arg = 0; for (let c = 0; c < d; c++) arg -= G[idx * d + c] * at.x[c]; re[idx] += v * Math.cos(arg); im[idx] += v * Math.sin(arg); } }
    re[0] = this.atoms.reduce((t, at) => t + this.species[at.sp].alphaZ, 0) / this.vol; // the α Z terms (the G = 0 limit of v + Z K)
    return { re, im };
  }
  /* the ions' energy. In 4D a core's cloud leaks (species S = Σ⟨r²⟩, T = Σ⟨r⁴⟩ of its electrons), so two ions meet as
     Z_iZ_j/r + (Z_i S_j + S_i Z_j)/8r³ + (−3S_iS_j + Z_iT_j + T_iZ_j)/64r⁵: js/ionic.js sums exactly that (Ewald for the
     first two, k = 0 left out), and the background adds −Q²/2Ω ∫erfc(αr)/r and −Q C/Ω ∫Q(3/2, α²r²)/r³ (C = ΣS/8), the
     G = 0 pieces the electrons' side leaves out. In ours, or without clouds, the point-charge sum below. */
  ewaldEnergy(rc) {
    if (this.d === 4 && this.atoms.some((a) => this.species[a.sp].S)) {
      const keys = [...new Set(this.atoms.map((a) => a.sp))], kinds = this.atoms.map((a) => keys.indexOf(a.sp));
      const I = new Ionic({ d: 4, species: keys.map((k) => ({ q: this.species[k].Z, S: this.species[k].S ?? 0, T: this.species[k].T ?? 0 })), short: () => [0, 0], ...(rc ? { rc } : {}) });
      const e = I.energy(this.H, Float64Array.from(this.atoms.flatMap((a) => a.x)), kinds, 1), al = I.alpha;
      const Q = this.atoms.reduce((t, a) => t + this.species[a.sp].Z, 0), C = this.atoms.reduce((t, a) => t + (this.species[a.sp].S ?? 0) / 8, 0);
      return e.E - ((Q * Q) / (2 * this.vol)) * backgroundInt(4, al) - ((Q * C) / this.vol) * ((4 * Math.PI ** 1.5) / al);
    }
    const { d, H, atoms, vol } = this, Z = atoms.map((a) => this.species[a.sp].Z), Q = Z.reduce((a, b) => a + b, 0); rc = rc ?? 14; const alpha = 4.2 / rc;
    let E = 0; const bound = H.map((_, i) => Math.ceil(rc * Math.hypot(...this.Hi.map((r) => r[i]))) + 1), m = bound.map((b) => -b);
    for (;;) { const t = new Array(d).fill(0); for (let a = 0; a < d; a++) for (let c = 0; c < d; c++) t[c] += m[a] * H[a][c];
      for (let i = 0; i < atoms.length; i++) for (let j = 0; j < atoms.length; j++) { let r2 = 0; for (let c = 0; c < d; c++) r2 += (atoms[j].x[c] - atoms[i].x[c] + t[c]) ** 2; if (r2 < 1e-14 || r2 > rc * rc) continue; const r = Math.sqrt(r2); E += (0.5 * Z[i] * Z[j] * erfc(alpha * r)) / r; }
      let i = 0; while (i < d && m[i] === bound[i]) { m[i] = -bound[i]; i++; } if (i === d) break; m[i]++; }
    const kmax = 2 * alpha * Math.sqrt(26), kb = H.map((h) => Math.ceil((kmax * Math.hypot(...h)) / (2 * Math.PI))), n = kb.map((b) => -b);
    for (;;) { const g = new Array(d).fill(0); for (let a = 0; a < d; a++) for (let c = 0; c < d; c++) g[c] += n[a] * this.B[a][c]; const gn = Math.hypot(...g);
      if (gn > 1e-12 && gn <= kmax) { let sr = 0, si = 0; for (let i = 0; i < atoms.length; i++) { const arg = g.reduce((t, x, c) => t + x * atoms[i].x[c], 0); sr += Z[i] * Math.cos(arg); si += Z[i] * Math.sin(arg); } E += (0.5 * smoothK(d, gn, alpha) * (sr * sr + si * si)) / vol; }
      let i = 0; while (i < d && n[i] === kb[i]) { n[i] = -kb[i]; i++; } if (i === d) break; n[i]++; }
    E -= (alpha / Math.sqrt(Math.PI)) * Z.reduce((t, z) => t + z * z, 0); // each ion's own smooth part
    E -= ((Q * Q) / (2 * vol)) * backgroundInt(d, alpha); // the background
    return E;
  }
  /* ψ on the grid from a band's coefficients (unnormalized: Σ c e^(iG·r)) */
  toGrid(B0, cr, ci) { const re = new Float64Array(this.ntot), im = new Float64Array(this.ntot); for (let i = 0; i < B0.n; i++) { re[B0.idx[i]] = cr[i]; im[B0.idx[i]] = ci[i]; } fftn(re, im, this.dims, true); return { re, im }; }
  /* H c for a block of bands at k, given the real-space local potential V (grid) */
  applyH(B0, V, cr, ci) {
    const { ntot } = this, g = this.toGrid(B0, cr, ci);
    for (let j = 0; j < ntot; j++) { g.re[j] *= V[j]; g.im[j] *= V[j]; }
    fftn(g.re, g.im, this.dims, false);
    const hr = new Float64Array(B0.n), hi = new Float64Array(B0.n);
    for (let i = 0; i < B0.n; i++) { hr[i] = B0.kin[i] * cr[i] + g.re[B0.idx[i]] / ntot; hi[i] = B0.kin[i] * ci[i] + g.im[B0.idx[i]] / ntot; }
    for (const p of B0.proj) { let sr = 0, si = 0; for (let i = 0; i < B0.n; i++) { sr += p.re[i] * cr[i] + p.im[i] * ci[i]; si += p.re[i] * ci[i] - p.im[i] * cr[i]; } // ⟨β|c⟩
      sr *= p.D; si *= p.D; for (let i = 0; i < B0.n; i++) { hr[i] += p.re[i] * sr - p.im[i] * si; hi[i] += p.re[i] * si + p.im[i] * sr; } }
    return { hr, hi };
  }
  /* the lowest nb bands at k by block Davidson: X (nb vectors), residuals preconditioned by 1/(T − ε) clipped, then
     Rayleigh–Ritz on [X, P]; returns energies and vectors */
  bands(ki, V, X, { iters = 40, tol = 1e-7 } = {}) {
    const B0 = this.basis[ki], nb = this.nbands, n = B0.n;
    if (!X) { X = []; let seed = 12345 + ki; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => B0.kin[a] - B0.kin[b]);
      for (let b = 0; b < nb; b++) { const xr = new Float64Array(n), xi = new Float64Array(n); for (let i = 0; i < n; i++) { const w = 1 / (1 + B0.kin[i]); xr[i] = 0.1 * w * rnd(); xi[i] = 0.1 * w * rnd(); } xr[order[b]] += 1; X.push({ re: xr, im: xi }); } }
    let eps = null, res = Infinity;
    for (let it = 0; it < iters; it++) {
      const HX = X.map((x) => { const h = this.applyH(B0, V, x.re, x.im); return { re: h.hr, im: h.hi }; });
      // Rayleigh–Ritz on X itself
      let rr = this.ritz([...X], [...HX]); X = rr.X; const HXs = rr.HX; eps = rr.e;
      // residuals
      const P = []; res = 0;
      for (let b = 0; b < nb; b++) { const pr = new Float64Array(n), pi = new Float64Array(n); let rn = 0;
        for (let i = 0; i < n; i++) { const r1 = HXs[b].re[i] - eps[b] * X[b].re[i], r2 = HXs[b].im[i] - eps[b] * X[b].im[i]; rn += r1 * r1 + r2 * r2; const den = B0.kin[i] - eps[b], pre = 1 / (Math.abs(den) < 0.5 ? (den >= 0 ? 0.5 : -0.5) : den); pr[i] = r1 * pre; pi[i] = r2 * pre; }
        res = Math.max(res, Math.sqrt(rn)); let pn = 0; for (let i = 0; i < n; i++) pn += pr[i] * pr[i] + pi[i] * pi[i]; pn = Math.sqrt(pn);
        if (rn > 1e-24 && pn > 0) { for (let i = 0; i < n; i++) { pr[i] /= pn; pi[i] /= pn; } P.push({ re: pr, im: pi }); } } // unit directions keep the overlap well conditioned
      if (res < tol || !P.length) break;
      if (X.length < nb) throw new Error(`bands: the subspace collapsed (${X.length} of ${nb})`);
      const HP = P.map((x) => { const h = this.applyH(B0, V, x.re, x.im); return { re: h.hr, im: h.hi }; });
      rr = this.ritz([...X, ...P], [...HXs, ...HP], nb); X = rr.X; eps = rr.e;
    }
    return { e: eps, X, res };
  }
  /* Rayleigh–Ritz in span(Y): orthonormalize (Löwdin), diagonalize, keep the lowest keep */
  /* non-self-consistent bands: the eigenvalues at any k in a converged potential V (the grid doesn't depend on k, so the
     SCF's V serves every k). For band structures and band edges: ks a list of Cartesian k, nbands how many to take */
  bandsAt(V, ks, { nbands = this.nbands, iters = 80, tol = 1e-8 } = {}) {
    const keep = { basis: this.basis, kpts: this.kpts, nbands: this.nbands };
    try {
      this.nbands = nbands;
      return ks.map((k) => { this.basis = [this.makeBasis(k)]; this.kpts = [{ k, w: 1 }]; const r = this.bands(0, V, null, { iters, tol }); return { k, e: Array.from(r.e), res: r.res }; });
    } finally { Object.assign(this, keep); }
  }
  /* the ions' local potential on the grid (what scf() builds first), for potential() outside an scf */
  localR() { const VL = this.localG(), re = Float64Array.from(VL.re), im = Float64Array.from(VL.im); fftn(re, im, this.dims, true); return re; }
  ritz(Y, HY, keep = Y.length) {
    const m = Y.length, n = Y[0].re.length, dot = (a, b) => { let r = 0, i = 0; for (let k = 0; k < n; k++) { r += a.re[k] * b.re[k] + a.im[k] * b.im[k]; i += a.re[k] * b.im[k] - a.im[k] * b.re[k]; } return [r, i]; };
    const S = { re: new Float64Array(m * m), im: new Float64Array(m * m) }, Hm = { re: new Float64Array(m * m), im: new Float64Array(m * m) };
    for (let p = 0; p < m; p++) for (let q = p; q < m; q++) { const [sr, si] = dot(Y[p], Y[q]), [hr, hi] = dot(Y[p], HY[q]); S.re[p * m + q] = sr; S.im[p * m + q] = si; S.re[q * m + p] = sr; S.im[q * m + p] = -si; Hm.re[p * m + q] = hr; Hm.im[p * m + q] = hi; Hm.re[q * m + p] = hr; Hm.im[q * m + p] = -hi; }
    // S^(−½) over the well-conditioned part
    const se = hermEigen(S, m), keepS = se.values.map((v, i) => [v, i]).filter(([v]) => v > 1e-10 * Math.max(...se.values)), r = keepS.length;
    const T = { re: new Float64Array(m * r), im: new Float64Array(m * r) }; // columns: s_i/√λ_i
    keepS.forEach(([v, i], c) => { for (let p = 0; p < m; p++) { T.re[p * r + c] = se.re[i][p] / Math.sqrt(v); T.im[p * r + c] = se.im[i][p] / Math.sqrt(v); } });
    // H' = T† H T
    const HT = { re: new Float64Array(m * r), im: new Float64Array(m * r) };
    for (let p = 0; p < m; p++) for (let c = 0; c < r; c++) { let sr = 0, si = 0; for (let q = 0; q < m; q++) { const ar = Hm.re[p * m + q], ai = Hm.im[p * m + q], br = T.re[q * r + c], bi = T.im[q * r + c]; sr += ar * br - ai * bi; si += ar * bi + ai * br; } HT.re[p * r + c] = sr; HT.im[p * r + c] = si; }
    const Hp = { re: new Float64Array(r * r), im: new Float64Array(r * r) };
    for (let a = 0; a < r; a++) for (let c = 0; c < r; c++) { let sr = 0, si = 0; for (let p = 0; p < m; p++) { const ar = T.re[p * r + a], ai = -T.im[p * r + a], br = HT.re[p * r + c], bi = HT.im[p * r + c]; sr += ar * br - ai * bi; si += ar * bi + ai * br; } Hp.re[a * r + c] = sr; Hp.im[a * r + c] = si; }
    const he = hermEigen(Hp, r), nk = Math.min(keep, r), X = [], HX = [];
    for (let b = 0; b < nk; b++) { // coefficients in Y: T · u_b
      const cr = new Float64Array(m), ci = new Float64Array(m); for (let p = 0; p < m; p++) { let sr = 0, si = 0; for (let a = 0; a < r; a++) { const ar = T.re[p * r + a], ai = T.im[p * r + a], br = he.re[b][a], bi = he.im[b][a]; sr += ar * br - ai * bi; si += ar * bi + ai * br; } cr[p] = sr; ci[p] = si; }
      const x = { re: new Float64Array(n), im: new Float64Array(n) }, hx = { re: new Float64Array(n), im: new Float64Array(n) };
      for (let p = 0; p < m; p++) { const ar = cr[p], ai = ci[p]; if (ar === 0 && ai === 0) continue; for (let k = 0; k < n; k++) { x.re[k] += ar * Y[p].re[k] - ai * Y[p].im[k]; x.im[k] += ar * Y[p].im[k] + ai * Y[p].re[k]; hx.re[k] += ar * HY[p].re[k] - ai * HY[p].im[k]; hx.im[k] += ar * HY[p].im[k] + ai * HY[p].re[k]; } }
      X.push(x); HX.push(hx); }
    return { e: he.values.slice(0, nk), X, HX };
  }
  /* the electrons' density on the grid from the bands (2 per band, filled lowest-first: an insulator) */
  density(states) {
    const { ntot, vol } = this, rho = new Float64Array(ntot), nocc = this.nelec / 2;
    states.forEach((st, ki) => { const w = this.kpts[ki].w; for (let b = 0; b < nocc; b++) { const occ = 2 * w * Math.min(1, nocc - b); const g = this.toGrid(this.basis[ki], st.X[b].re, st.X[b].im); for (let j = 0; j < ntot; j++) rho[j] += (occ * (g.re[j] ** 2 + g.im[j] ** 2)) / vol; } });
    return rho;
  }
  /* the self-consistent ground state */
  /* pool (optional): k-points shared out to worker threads (tools/pwpool.mjs); its run(V, iters) returns the bands' density,
     kinetic and nonlocal energies, residual and eigenvalues, and states then stay in the workers. rho0 (optional): the starting density; onIter(rho, it) (optional): told each iteration's mixed density */
  scf({ maxIter = 60, tol = 1e-6, log = () => {}, hartree = true, exchange = true, mixHist = 6, beta = 0.5, q0 = 1.5, pool = null, bandIters = 6, rho0 = null, onIter = null } = {}) {
    const { d, ntot, vol, dims, G2 } = this, VL = this.localG(), vlocR = (() => { const re = Float64Array.from(VL.re), im = Float64Array.from(VL.im); fftn(re, im, dims, true); return re; })();
    let rho = rho0 && rho0.length === ntot ? Float64Array.from(rho0) : new Float64Array(ntot).fill(this.nelec / vol), states = this.kpts.map(() => null), E = null, Eold = null; // rho0: a warm start (a relaxation's last step)
    const hist = [];
    for (let it = 0; it < maxIter; it++) {
      const pot = this.potential(rho, vlocR, { hartree, exchange });
      let rhoOut, parts = null, resTxt;
      if (pool) { const r = pool.run(pot.V, it ? bandIters : 40); rhoOut = r.rho; parts = { kin: r.kin, nl: r.nl }; this.eigs = r.eigs; resTxt = r.res.toExponential(1); }
      else { states = this.kpts.map((_, ki) => this.bands(ki, pot.V, states[ki]?.X, { iters: it ? bandIters : 40 })); rhoOut = this.density(states); this.eigs = states.map((s) => s.e); resTxt = states.map((s) => s.res.toExponential(1)).join(" "); }
      E = this.energy(states, rhoOut, VL, { hartree, exchange, parts });
      // Pulay on the density with Kerker's preconditioning (in G space)
      const R = Float64Array.from(rhoOut, (v, j) => v - rho[j]); let rn = 0; for (const v of R) rn += v * v; rn = Math.sqrt((rn * vol) / ntot);
      log(`  scf ${it}: E ${E.total.toFixed(8)}  |Δρ| ${rn.toExponential(2)}  bands ${resTxt}`);
      if (rn < tol && Eold != null && Math.abs(E.total - Eold) < tol) break; Eold = E.total;
      hist.push({ rho: Float64Array.from(rho), R }); if (hist.length > mixHist) hist.shift();
      const m = hist.length, A = Array.from({ length: m + 1 }, () => new Float64Array(m + 1)), b = new Float64Array(m + 1);
      for (let i = 0; i < m; i++) { for (let j = 0; j < m; j++) { let s = 0; for (let k = 0; k < ntot; k++) s += hist[i].R[k] * hist[j].R[k]; A[i][j] = s; } A[i][m] = A[m][i] = 1; } b[m] = 1;
      const cfs = solveLin(A, b) ?? (() => { const c = new Float64Array(m + 1); c[m - 1] = 1; return c; })();
      const rbar = new Float64Array(ntot), Rbar = new Float64Array(ntot); for (let i = 0; i < m; i++) for (let k = 0; k < ntot; k++) { rbar[k] += cfs[i] * hist[i].rho[k]; Rbar[k] += cfs[i] * hist[i].R[k]; }
      // Kerker: damp the residual's long waves, β G²/(G² + q0²)
      const re = Rbar, im = new Float64Array(ntot); fftn(re, im, dims, false); for (let j = 0; j < ntot; j++) { const f = j === 0 ? 0 : (beta * G2[j]) / (G2[j] + q0 * q0); re[j] *= f / ntot; im[j] *= f / ntot; } fftn(re, im, dims, true);
      rho = Float64Array.from(rbar, (v, k) => Math.max(0, v + re[k]));
      const tot = (rho.reduce((a, v) => a + v, 0) * vol) / ntot; for (let k = 0; k < ntot; k++) rho[k] *= this.nelec / tot;
      if (onIter) onIter(rho, it); // the next iteration's input density, for a caller that saves it (a resumable SCF)
    }
    return { E, states, rho };
  }
  /* forces on the ions, −dE/dτ, at self-consistency (Hellmann–Feynman): the local part through the density's G
     components, the projectors' phases e^(−i(k+G)·τ), and the ions' own energy from js/ionic.js's analytic slopes (4D
     clouds included; the background terms don't depend on where the ions are). Returns one d-vector per atom */
  forces(states, rho, nlForces = null) {
    const { d, ntot, dims, G, G2, atoms } = this, F = atoms.map(() => new Float64Array(d)), nocc = this.nelec / 2;
    const re = Float64Array.from(rho), im = new Float64Array(ntot); fftn(re, im, dims, false);
    const cache = new Map();
    for (let j = 1; j < ntot; j++) { if (!(G2[j] > 0)) continue; const g = Math.sqrt(G2[j]), rr = re[j] / ntot, ri = im[j] / ntot;
      atoms.forEach((at, I) => { const key = at.sp + "|" + g.toFixed(10); if (!cache.has(key)) cache.set(key, this.species[at.sp].vloc(g)); const v = cache.get(key);
        let arg = 0; for (let c = 0; c < d; c++) arg += G[j * d + c] * at.x[c]; const imz = -v * (Math.sin(arg) * rr + Math.cos(arg) * ri); // Im(v e^(−iG·τ) ρ*)
        for (let c = 0; c < d; c++) F[I][c] -= G[j * d + c] * imz; }); }
    // the partial cores move with their ions: −∫ v_x(ρ + ρ̃_c) ∂ρ̃_c/∂τ, through v_x's G components
    if (this.coreGrid()) { const pc = this.coreGrid(), vr = new Float64Array(ntot), vi = new Float64Array(ntot); for (let j = 0; j < ntot; j++) vr[j] = -(1 + 1 / d) * EXCHANGE[d] * Math.pow(Math.max(rho[j] + pc[j], 0), 1 / d); fftn(vr, vi, dims, false);
      const cc = new Map(); for (let j = 1; j < ntot; j++) { if (!(G2[j] > 0)) continue; const g = Math.sqrt(G2[j]), xr = vr[j] / ntot, xi = vi[j] / ntot;
        atoms.forEach((at, I) => { const f = this.species[at.sp].rhoc; if (!f) return; const key = at.sp + "|" + g.toFixed(10); if (!cc.has(key)) cc.set(key, f(g)); const v = cc.get(key);
          let arg = 0; for (let c = 0; c < d; c++) arg += G[j * d + c] * at.x[c]; const imz = -v * (Math.sin(arg) * xr + Math.cos(arg) * xi); for (let c = 0; c < d; c++) F[I][c] -= G[j * d + c] * imz; }); } }
    if (nlForces) nlForces.forEach((f, I) => { for (let c = 0; c < d; c++) F[I][c] += f[c]; });
    else this.nonlocalForces(states).forEach((f, I) => { for (let c = 0; c < d; c++) F[I][c] += f[c]; });
    const keys = [...new Set(atoms.map((a) => a.sp))], kinds = atoms.map((a) => keys.indexOf(a.sp));
    const I = new Ionic({ d, species: keys.map((k) => ({ q: this.species[k].Z, S: d === 4 ? this.species[k].S ?? 0 : 0, T: d === 4 ? this.species[k].T ?? 0 : 0 })), short: () => [0, 0] });
    const e = I.energy(this.H, Float64Array.from(atoms.flatMap((a) => a.x)), kinds, 1, true); atoms.forEach((_, i) => { for (let c = 0; c < d; c++) F[i][c] -= e.gx[i * d + c]; });
    return F;
  }
  /* the projectors' share of the forces, from the bands at the k-points this instance holds */
  nonlocalForces(states) {
    const { d, atoms } = this, F = atoms.map(() => new Float64Array(d)), nocc = this.nelec / 2;
    states.forEach((st, ki) => { const B0 = this.basis[ki], w = this.kpts[ki].w;
      for (let b = 0; b < nocc; b++) { const occ = 2 * w * Math.min(1, nocc - b), x = st.X[b];
        for (const p of B0.proj) { let ar = 0, ai = 0; const dr = new Float64Array(d), di = new Float64Array(d);
          for (let i = 0; i < B0.n; i++) { const cr = p.re[i] * x.re[i] + p.im[i] * x.im[i], ci = p.re[i] * x.im[i] - p.im[i] * x.re[i]; ar += cr; ai += ci; // conj(p) c
            for (let c = 0; c < d; c++) { const q = B0.kg[i * d + c]; dr[c] += -q * ci; di[c] += q * cr; } } // i q conj(p) c
          for (let c = 0; c < d; c++) F[p.atom][c] -= occ * p.D * 2 * (ar * dr[c] + ai * di[c]); } } });
    return F;
  }
  /* the bands' kinetic and nonlocal energies (what a worker holding some k-points reports) */
  bandEnergies(states) { const nocc = this.nelec / 2; let kin = 0, nl = 0;
    states.forEach((st, ki) => { const B0 = this.basis[ki], w = this.kpts[ki].w; for (let b = 0; b < nocc; b++) { const occ = 2 * w * Math.min(1, nocc - b), x = st.X[b];
      for (let i = 0; i < B0.n; i++) kin += occ * B0.kin[i] * (x.re[i] ** 2 + x.im[i] ** 2);
      for (const p of B0.proj) { let sr = 0, si = 0; for (let i = 0; i < B0.n; i++) { sr += p.re[i] * x.re[i] + p.im[i] * x.im[i]; si += p.re[i] * x.im[i] - p.im[i] * x.re[i]; } nl += occ * p.D * (sr * sr + si * si); } } });
    return { kin, nl }; }
  /* the partial cores' density on the grid (the nonlinear core correction: it joins the valence density in exchange only) */
  coreGrid() {
    if (this._core !== undefined) return this._core; const { d, ntot, dims, G, G2, atoms } = this;
    if (!atoms.some((a) => this.species[a.sp].rhoc)) return (this._core = null);
    const re = new Float64Array(ntot), im = new Float64Array(ntot), cache = new Map();
    for (let j = 0; j < ntot; j++) { const g = Math.sqrt(G2[j]);
      for (const at of atoms) { const f = this.species[at.sp].rhoc; if (!f) continue; const key = at.sp + "|" + g.toFixed(10); if (!cache.has(key)) cache.set(key, f(g));
        const v = cache.get(key) / this.vol; let arg = 0; for (let c = 0; c < d; c++) arg -= G[j * d + c] * at.x[c]; re[j] += v * Math.cos(arg); im[j] += v * Math.sin(arg); } }
    fftn(re, im, dims, true); for (let j = 0; j < ntot; j++) re[j] = Math.max(0, re[j]); return (this._core = re);
  }
  /* the local potential the electrons feel: ions + Hartree + exchange, on the grid */
  potential(rho, vlocR, { hartree = true, exchange = true } = {}) {
    const { d, ntot, dims, G2 } = this, V = Float64Array.from(vlocR);
    if (hartree) { const re = Float64Array.from(rho), im = new Float64Array(ntot); fftn(re, im, dims, false);
      for (let j = 0; j < ntot; j++) { const K = j === 0 || G2[j] === 0 ? 0 : coulombK(d, Math.sqrt(G2[j])) / ntot; re[j] *= K; im[j] *= K; } fftn(re, im, dims, true); for (let j = 0; j < ntot; j++) V[j] += re[j]; }
    if (exchange) { const pc = this.coreGrid(); for (let j = 0; j < ntot; j++) V[j] += -(1 + 1 / d) * EXCHANGE[d] * Math.pow(Math.max(rho[j] + (pc ? pc[j] : 0), 0), 1 / d); }
    return { V };
  }
  /* the total energy per cell: band kinetic + nonlocal, local, Hartree, exchange, Ewald */
  energy(states, rho, VL, { hartree = true, exchange = true, parts = null } = {}) {
    const { d, ntot, vol, dims, G2 } = this, nocc = this.nelec / 2; let kin = parts ? parts.kin : 0, nl = parts ? parts.nl : 0;
    if (!parts) states.forEach((st, ki) => { const B0 = this.basis[ki], w = this.kpts[ki].w; for (let b = 0; b < nocc; b++) { const occ = 2 * w * Math.min(1, nocc - b), x = st.X[b];
      for (let i = 0; i < B0.n; i++) kin += occ * B0.kin[i] * (x.re[i] ** 2 + x.im[i] ** 2);
      for (const p of B0.proj) { let sr = 0, si = 0; for (let i = 0; i < B0.n; i++) { sr += p.re[i] * x.re[i] + p.im[i] * x.im[i]; si += p.re[i] * x.im[i] - p.im[i] * x.re[i]; } nl += occ * p.D * (sr * sr + si * si); } } });
    const re = Float64Array.from(rho), im = new Float64Array(ntot); fftn(re, im, dims, false); // ρ(G)·N
    let eloc = 0, eh = 0; for (let j = 0; j < ntot; j++) { const rr = re[j] / ntot, ri = im[j] / ntot; eloc += vol * (VL.re[j] * rr + VL.im[j] * ri); if (hartree && j && G2[j] > 0) eh += 0.5 * vol * coulombK(d, Math.sqrt(G2[j])) * (rr * rr + ri * ri); }
    let ex = 0; if (exchange) { const pc = this.coreGrid(); for (let j = 0; j < ntot; j++) ex += -EXCHANGE[d] * Math.pow(Math.max(rho[j] + (pc ? pc[j] : 0), 0), 1 + 1 / d); } ex *= vol / ntot;
    return { kinetic: kin, nonlocal: nl, local: eloc, hartree: eh, exchange: ex, ewald: this.ewald, total: kin + nl + eloc + eh + ex + this.ewald };
  }
}
/* a Monkhorst–Pack grid of k (Γ-centred, n per reciprocal vector), folded by time reversal (k and −k give the same
   energy): [{ k, w }], weights summing to 1. B: the reciprocal vectors as rows */
export function kgrid(H, ns, shift = null) {
  const d = H.length, Hi = inv(H), B = Array.from({ length: d }, (_, j) => Array.from({ length: d }, (_, a) => 2 * Math.PI * Hi[a][j])), sh = shift ?? ns.map(() => 0);
  const seen = new Map(), out = [], m = ns.map(() => 0), tot = ns.reduce((a, b) => a * b, 1);
  for (;;) { const f = m.map((v, i) => ((v + sh[i]) / ns[i]) % 1), wrap = (x) => { let y = x - Math.round(x); if (Math.abs(y + 0.5) < 1e-9) y = 0.5; return y; };
    const fp = f.map(wrap), fn = fp.map((x) => wrap(-x)), key = (v) => v.map((x) => x.toFixed(6)).join(","), kp = key(fp), kn = key(fn);
    if (seen.has(kn)) out[seen.get(kn)].w += 1 / tot; else if (seen.has(kp)) out[seen.get(kp)].w += 1 / tot; else { seen.set(kp, out.length); out.push({ f: fp, k: Array.from({ length: d }, (_, c) => fp.reduce((t, x, a) => t + x * B[a][c], 0)), w: 1 / tot }); }
    let i = 0; while (i < d && m[i] === ns[i] - 1) { m[i] = 0; i++; } if (i === d) break; m[i]++; }
  return out;
}
function solveLin(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[p], M[c]] = [M[c], M[p]]; if (Math.abs(M[c][c]) < 1e-300) return null; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r[n] / r[i]); }
function inv(M) { const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; const v = A[c][c]; A[c] = A[c].map((x) => x / v); for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; A[r] = A[r].map((x, k) => x - f * A[c][k]); } } return A.map((r) => r.slice(n)); }
function det(M) { const n = M.length, A = M.map((r) => r.slice()); let D = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; D = -D; } if (Math.abs(A[c][c]) < 1e-300) return 0; D *= A[c][c]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; } } return D; }
