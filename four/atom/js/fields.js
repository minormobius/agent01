/* ATOM⁴'s field theory, no DOM: what it takes to make the force between charges fall as 1/r in four dimensions, and
   what breaks. Every function here is a closed form the selftest checks.

   A static potential that falls as r^−p in D_s space dimensions is the Fourier transform of 1/(k²)^a with
   2a = D_s − p. Ordinary electromagnetism is a = 1 in any dimension: 1/r in 3D, 1/r² in 4D (Gauss). Pinning 1/r in
   4D takes a = 3/2. A relativistic field whose propagator is 1/(p²)^a has scaling dimension Δ = D/2 − a in D
   spacetime dimensions, and a theory with positive probabilities needs Δ ≥ (D − 2)/2, i.e. a ≤ 1: the unitarity
   bound. a = 3/2 breaks it. */
import { k4 } from "./kernel.js";

/* the propagator power that gives a static r^−p in D_s space dimensions */
export const propagatorPower = (p, Ds) => (Ds - p) / 2;
/* its field's scaling dimension in D = D_s + 1 spacetime dimensions, and the least that unitarity allows */
export const scalingDim = (a, Ds) => (Ds + 1) / 2 - a;
export const unitarityFloor = (Ds) => (Ds - 1) / 2;
export const unitary = (a, Ds) => scalingDim(a, Ds) >= unitarityFloor(Ds) - 1e-12;

/* The potential of a unit charge spread evenly over a sphere of radius a, at distance s from the centre. In 3D it's
   Newton's shell theorem: flat inside, a point charge outside. With 1/r in 4D it's neither: inside, the
   potential is 1/a · k(s/a), 15% higher at the centre than at the wall; outside, 1/s · k(a/s), not 1/s. */
export const shellPotential = (s, a, d) => (d === 3 ? 1 / Math.max(s, a) : k4(Math.min(s, a) / Math.max(s, a)) / Math.max(s, a));
export const SHELL_CENTRE_OVER_WALL = 1 / k4(1); // = 3π/8

/* The flux of the field through a sphere round a point charge: area × field. For Gauss's law it's the charge,
   whatever the radius. For 1/r in d dimensions the field is 1/r² and the sphere's area ∝ r^(d−1): the flux grows
   as r^(d−3), linearly in 4D, so empty space round a charge acts as if charged, ρ ∝ 1/r³. */
export const fluxGrowth = (d) => d - 3;
/* ∇²(r^q) = q (q + d − 2) r^(q−2): 1/r is harmonic in 3D and not in 4D, where ∇²(1/r) = −1/r³ */
export const laplacianPowerCoeff = (q, d) => q * (q + d - 2);

/* Route: a nonlinear vacuum. ∇·(|∇φ|^(m−2) ∇φ) = ρ (the m-Laplacian) gives a field |∇φ| ∝ r^(−(d−1)/(m−1)).
   For 1/r (field 1/r²) in 4D, m = 5/2. Fields of two charges then no longer add */
export const nonlinearExponent = (d) => 1 + (d - 1) / 2;

/* Route: a vacuum whose permittivity grows with wavenumber, ε(k) = ε₀ ℓ k, magnetism untouched. Statics: φ(k) =
   ρ/(ε k²) ∝ 1/k³, which is 1/r in 4D. Light: k² = ε(k) ω²/c², so ω = c √(k/ℓ), the dispersion of deep-water
   waves. No single speed of light: the phase speed is c/√(kℓ) and the group speed half that */
export const lightOmega = (k, ell) => Math.sqrt(k / ell); // c = 1
export const phaseSpeed = (k, ell) => 1 / Math.sqrt(k * ell);
export const groupSpeed = (k, ell) => 0.5 / Math.sqrt(k * ell);

/* Route: a small fourth dimension, a circle of circumference ℓ. The potential of a point charge is the sum of its
   images, Σ 1/(r² + (nℓ)²) = (π / ℓ r) coth(π r / ℓ) in the charge's own 3D slice: 1/r² close in (4D), and π/(ℓ r)
   far out (3D). Normalised so the near field is exactly 1/r² */
export const compactPotential = (r, ell) => (Math.PI / (ell * r)) / Math.tanh((Math.PI * r) / ell);

/* The radial pull an s-electron feels, in the u = r^((d−1)/2) R picture: the centrifugal term L(L + 1)/2r² (L = l +
   (d − 3)/2, so 3/8r² for a 4D s-electron) plus the potential. With Gauss's 1/r² both terms scale alike and no
   length is special: no Bohr radius, no atom */
export const effective = (r, d, V) => { const L = (d - 3) / 2; return (L * (L + 1)) / (2 * r * r) + V(r); };

/* Classical orbits under any central force stay in a plane, so in 4D a pinned 1/r force gives Kepler's closed
   ellipses, and Gauss's 1/r³ force gives none that are stable (Ehrenfest, 1917): a circular orbit under force
   ∝ r^−q is stable iff q < 3 */
export const circularOrbitStable = (q) => q < 3;
/* the angle between the bonds of an sp^d hybrid: the corners of a regular simplex, cos θ = −1/d */
export const bondAngle = (d) => (Math.acos(-1 / d) * 180) / Math.PI;

/* ---------------------------------------------------------------- the official position: the lens vacuum
   Of the routes, this universe takes a vacuum with ε(k) = ε₀ ℓ k and μ(k) = μ₀ / (ℓ k), the same in every direction
   and at every frequency, set by a length ℓ. Write E′ = D/ε₀ and B′ = μ₀ H. Then (E′, B′) obey Maxwell's equations
   in empty 4D space exactly, with the same charges and currents: that is light, Lumen⁴'s light, unchanged. What
   pushes a charge is E = E′/(ℓ|k|), B = B′/(ℓ|k|): the light seen through a lens that blurs it with a 1/r³ kernel,
   at each instant, across all of space. Statics: 1/(ℓ k³), the pinned 1/r. Waves: k² = εμ ω²/c², so ω = ck at
   every wavelength. Energy, ½(E·D + B·H) = (E′² + c²B′²) ε₀/(2ℓ|k|), is never negative: no ghosts. The price:
   the blur is instantaneous, so a charge feels another's change at once, everywhere: a preferred frame, an
   absolute "now", and no relativity for electromagnetism. */
export const lensEps = (k, ell) => ell * k; // relative permittivity
export const lensMu = (k, ell) => 1 / (ell * k);
export const lensOmega = (k, ell) => k / Math.sqrt(lensEps(k, ell) * lensMu(k, ell)); // c = 1
export const LENS_STATIC_POWER = 3 / 2; // φ(k) ∝ 1/(ε k²) = 1/(ℓ k³): a = 3/2, so 1/r in 4D
/* what a charge feels of light of frequency ω, against 4D Maxwell: every free wave of one frequency has |k| = ω/c, so
   the lens is one number for it, c/ℓω. Patterns (diffraction, rainbows) are untouched; long waves push harder */
export const lensFactor = (omega, ell) => 1 / (omega * ell);
/* scattering by a small particle (constant polarizability): a dipole radiates ∝ ω^(d+1) in d dimensions (ω⁴ ours,
   ω⁵ in 4D Maxwell). Through the lens, the push on the particle and the energy in what it re-radiates each carry
   c/ℓω against an incident flux that carries one: σ ∝ ω^(d+1) (c/ℓω)², so ω³ in this universe. The sky is still blue,
   less steeply than ours */
export const scatterExponent = (d, lens) => d + 1 - (lens ? 2 : 0);

/* Magnetism, through the same lens. A steady current I round a loop makes A_i(x) = I ∮ G(|x − y|) dy_i with the
   charge's own kernel (1/r in our 3D and in pinned 4D; 1/r² in 4D Maxwell), and the field is the 2-form
   B_ij = ∂_i A_j − ∂_j A_i: one number per plane, three in 3D (we write them as a vector), six in 4D. dB = 0 still,
   so there are no magnetic monopoles; but as with Gauss's law, Ampère's fails for the pinned kernel. A loop's far
   field falls one power faster than the kernel's slope: 1/r³ for a 1/r kernel (ours, and pinned 4D), 1/r⁴ for 1/r². */
export function loopField(x, power = 1, n = 720) { // unit current round a unit circle in the (0, 1) plane; G = r^−power
  const d = x.length, B = Array.from({ length: d }, () => Array(d).fill(0)), dt = (2 * Math.PI) / n;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) * dt, y = Array(d).fill(0), dy = Array(d).fill(0); y[0] = Math.cos(t); y[1] = Math.sin(t); dy[0] = -Math.sin(t) * dt; dy[1] = Math.cos(t) * dt;
    const r = x.map((v, i) => v - y[i]), r2 = r.reduce((s, v) => s + v * v, 0), g = -power * r2 ** (-(power + 2) / 2); // ∂_i G = g r_i
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) B[i][j] += g * (r[i] * dy[j] - r[j] * dy[i]);
  }
  return B;
}
export const bivectorSize = (B) => { let s = 0; for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) s += B[i][j] ** 2; return Math.sqrt(s); };
/* a charge in a uniform field B (a 4 × 4 antisymmetric matrix): dv/dt = B v, so v turns by exp(tB), a rotation. It
   turns in two planes at once, at rates (|L| ± |R|)/2 from the field's left and right halves (js/turning.js): one
   plane and free drift for a simple field, a torus for a general one, closed circles when it's all one half */
export function expm(M, t) { // exp(tM) by scaling and squaring a Taylor series
  const n = M.length, I = () => M.map((r, i) => r.map((_, j) => +(i === j))), mul = (A, C) => A.map((r) => C[0].map((_, j) => r.reduce((s, v, k) => s + v * C[k][j], 0)));
  let s = 0, nrm = Math.max(...M.map((r) => r.reduce((a, v) => a + Math.abs(v), 0))) * Math.abs(t); while (nrm > 0.25) { nrm /= 2; s++; }
  const A = M.map((r) => r.map((v) => (v * t) / 2 ** s)); let E = I(), term = I();
  for (let k = 1; k < 20; k++) { term = mul(term, A).map((r) => r.map((v) => v / k)); E = E.map((r, i) => r.map((v, j) => v + term[i][j])); }
  for (; s > 0; s--) E = mul(E, E);
  return E;
}
export function cyclotronPath(B, v0, T, n = 600) {
  const dt = T / n, R = expm(B, dt), path = []; let x = v0.map(() => 0), v = v0.slice();
  for (let k = 0; k <= n; k++) { path.push(x.slice()); const w = R.map((r) => r.reduce((s, c, j) => s + c * v[j], 0)); x = x.map((p, i) => p + (dt * (v[i] + w[i])) / 2); v = w; }
  return path;
}
export function cyclotronRates(B) { // the two plane rates of a 4D field, from its left (self-dual) and right halves
  const L = Math.hypot(B[0][1] + B[2][3], B[0][2] + B[3][1], B[0][3] + B[1][2]), R = Math.hypot(B[0][1] - B[2][3], B[0][2] - B[3][1], B[0][3] - B[1][2]);
  return { fast: (L + R) / 2, slow: Math.abs(L - R) / 2, left: L, right: R };
}
/* a neutral atom, as a nucleus +1 in a shell −1 of radius a: what a test charge feels outside it. Zero in 3D (the
   shell theorem). In pinned 4D it's (1 − k(a/s))/s ≈ a²/8s³ > 0: it pulls electrons and pushes protons */
export const neutralShell = (s, a, d) => 1 / s - shellPotential(s, a, d);
