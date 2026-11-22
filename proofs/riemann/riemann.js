// riemann.js — the only copy of the maths behind proofs.mino.mobi/riemann/.
// The page, and riemann.selftest.mjs, import this file. No dependencies.
//
//   zeta(s)        ζ(s) for any complex s ≠ 1, by Euler–Maclaurin summation
//   theta(t)       the Riemann–Siegel theta function, from log Γ
//   Z(t)           Hardy's Z function: real, |Z(t)| = |ζ(½+it)|, sign changes = zeros
//   findZeros(T)   every sign change of Z on (0, T], refined by bisection
//   psi(x)         Chebyshev ψ(x) = Σ_{pᵏ ≤ x} log p, by sieve
//   psiExplicit    the explicit formula: ψ(x) rebuilt from the first K zeros
//
// Complex numbers are [re, im] pairs.

const TAU = 2 * Math.PI;

// ---- complex arithmetic ----------------------------------------------------
export const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
export const cexp = (a) => { const r = Math.exp(a[0]); return [r * Math.cos(a[1]), r * Math.sin(a[1])]; };
export const clog = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
export const cabs = (a) => Math.hypot(a[0], a[1]);
// n^(-s) for a positive real n
const npow = (lnN, s) => { const r = Math.exp(-s[0] * lnN), a = -s[1] * lnN; return [r * Math.cos(a), r * Math.sin(a)]; };

// ---- log Γ (Stirling after shifting Re z up to ≥ 12) -----------------------
// Principal logs throughout, which gives the continuous branch for Re z > 0:
// that is what makes theta(t) continuous rather than wrapped mod 2π.
const STIRLING = [1 / 12, -1 / 360, 1 / 1260, -1 / 1680, 1 / 1188, -691 / 360360, 1 / 156];
export function lnGamma(z) {
  if (z[0] < 0.5) {
    // reflection: lnΓ(z) = log π − log sin(πz) − lnΓ(1−z)  (branch not continuous; only used off the page's paths)
    const sinpz = csin([Math.PI * z[0], Math.PI * z[1]]);
    return csub(csub([Math.log(Math.PI), 0], clog(sinpz)), lnGamma([1 - z[0], -z[1]]));
  }
  let shift = [0, 0], w = z;
  while (w[0] < 12) { shift = cadd(shift, clog(w)); w = [w[0] + 1, w[1]]; }
  const lw = clog(w), inv = cdiv([1, 0], w), inv2 = cmul(inv, inv);
  let r = cadd(csub(cmul([w[0] - 0.5, w[1]], lw), w), [0.5 * Math.log(TAU), 0]);
  let p = inv;
  for (const c of STIRLING) { r = cadd(r, [c * p[0], c * p[1]]); p = cmul(p, inv2); }
  return csub(r, shift);
}
export const cgamma = (z) => cexp(lnGamma(z));
function csin(a) { return [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])]; }

// ---- ζ(s) by Euler–Maclaurin -----------------------------------------------
// ζ(s) = Σ_{n<N} n^-s + N^(1-s)/(s-1) + N^-s/2 + Σ_k B_2k/(2k)! · s(s+1)…(s+2k-2) · N^(-s-2k+1) + R.
// With N chosen so |s + 2K| ≤ πN, each term shrinks by about 4×, so K = 20 terms leave ~1e-12.
const K_EM = 20;
const BC = (() => {        // B_2k / (2k)!
  const exact = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6];
  const out = [];
  let fact = 1;
  for (let k = 1; k <= K_EM; k++) {
    fact *= (2 * k - 1) * (2 * k);
    if (k <= exact.length) out.push(exact[k - 1] / fact);
    else {                 // B_2k/(2k)! = (-1)^(k+1) · 2ζ(2k) / (2π)^(2k), and ζ(2k) converges at once for k ≥ 8
      let z = 0; for (let n = 1; n <= 60; n++) z += Math.pow(n, -2 * k);
      out.push((k % 2 ? 1 : -1) * 2 * z / Math.pow(TAU, 2 * k));
    }
  }
  return out;
})();

export function zeta(s) {
  if (s[0] === 1 && s[1] === 0) return [Infinity, 0];
  if (s[0] < -0.5) {
    // functional equation, so the sum never has to fight huge |N^-s|:
    // ζ(s) = 2^s π^(s-1) sin(πs/2) Γ(1-s) ζ(1-s)
    const t = [1 - s[0], -s[1]];
    const f = cmul(cmul(cexp([s[0] * Math.LN2, s[1] * Math.LN2]), cexp([(s[0] - 1) * Math.log(Math.PI), s[1] * Math.log(Math.PI)])),
                   cmul(csin([Math.PI * s[0] / 2, Math.PI * s[1] / 2]), cgamma(t)));
    return cmul(f, zeta(t));
  }
  const N = Math.max(12, Math.ceil((Math.hypot(s[0] + 2 * K_EM, s[1])) / Math.PI) + 2);
  let sum = [0, 0];
  for (let n = 1; n < N; n++) sum = cadd(sum, npow(Math.log(n), s));
  const lnN = Math.log(N), Ns = npow(lnN, s);                    // N^-s
  sum = cadd(sum, cdiv(cmul(Ns, [N, 0]), [s[0] - 1, s[1]]));     // N^(1-s)/(s-1)
  sum = cadd(sum, [Ns[0] / 2, Ns[1] / 2]);
  let rise = s;                                                  // s(s+1)…(s+2k-2)
  let pw = [Ns[0] / N, Ns[1] / N];                               // N^(-s-1)
  for (let k = 1; k <= K_EM; k++) {
    const term = cmul(rise, pw);
    sum = cadd(sum, [BC[k - 1] * term[0], BC[k - 1] * term[1]]);
    rise = cmul(cmul(rise, [s[0] + 2 * k - 1, s[1]]), [s[0] + 2 * k, s[1]]);
    pw = [pw[0] / (N * N), pw[1] / (N * N)];
  }
  return sum;
}

// ---- θ(t) and Z(t) ---------------------------------------------------------
export function theta(t) {
  return lnGamma([0.25, t / 2])[1] - (t / 2) * Math.log(Math.PI);
}
// the textbook asymptotic, for the selftest to hold theta() against
export function thetaAsymptotic(t) {
  return (t / 2) * Math.log(t / TAU) - t / 2 - Math.PI / 8 + 1 / (48 * t) + 7 / (5760 * t ** 3);
}
export function Z(t) {
  const th = theta(t), z = zeta([0.5, t]);
  return Math.cos(th) * z[0] - Math.sin(th) * z[1];
}
// the part of e^{iθ}ζ(½+it) that must vanish if θ and ζ are both right
export function Zimag(t) {
  const th = theta(t), z = zeta([0.5, t]);
  return Math.sin(th) * z[0] + Math.cos(th) * z[1];
}
// Riemann–von Mangoldt: the smooth part of N(T), the number of zeros with 0 < γ ≤ T
export const Nsmooth = (T) => theta(T) / Math.PI + 1;

// ---- finding zeros ---------------------------------------------------------
// Scan Z at step h and bisect each sign change. The step must stay well below the
// closest pair of zeros in range; findZeros' callers check the total against known counts.
export function findZeros(T, h = 0.05) {
  const out = [];
  let a = 1, za = Z(a);
  while (a < T) {
    const b = Math.min(a + h, T), zb = Z(b);
    if (za === 0) out.push(a);
    else if (za * zb < 0) {
      let lo = a, hi = b, zlo = za;
      for (let i = 0; i < 52 && hi - lo > 1e-13; i++) {
        const m = (lo + hi) / 2, zm = Z(m);
        if (zm === 0) { lo = hi = m; break; }
        if (zlo * zm < 0) hi = m; else { lo = m; zlo = zm; }
      }
      out.push((lo + hi) / 2);
    }
    a = b; za = zb;
  }
  return out;
}

// ---- primes ----------------------------------------------------------------
export function sieve(n) {
  const comp = new Uint8Array(n + 1), ps = [];
  for (let i = 2; i <= n; i++) {
    if (!comp[i]) { ps.push(i); for (let j = i * i; j <= n; j += i) comp[j] = 1; }
  }
  return ps;
}
// Chebyshev ψ(x), with ψ₀ convention (half the jump) available via psi0
export function psi(x, primes = sieve(Math.floor(x))) {
  let s = 0;
  for (const p of primes) {
    if (p > x) break;
    const lp = Math.log(p);
    for (let q = p; q <= x; q *= p) s += lp;
  }
  return s;
}
// Λ(n): log p if n = p^k, else 0
export function vonMangoldt(n) {
  if (n < 2) return 0;
  for (let p = 2; p * p <= n; p++) {
    if (n % p === 0) { let m = n; while (m % p === 0) m /= p; return m === 1 ? Math.log(p) : 0; }
  }
  return Math.log(n);
}
export function psi0(x) {
  const v = psi(x);
  return Number.isInteger(x) ? v - vonMangoldt(x) / 2 : v;
}
// ψ₀(x) = x − Σ_ρ x^ρ/ρ − log 2π − ½ log(1 − x⁻²), zeros paired with their conjugates.
export function psiExplicit(x, zeros, K = zeros.length) {
  const lx = Math.log(x), sx = Math.sqrt(x);
  let s = x - Math.log(TAU) - 0.5 * Math.log(1 - 1 / (x * x));
  for (let j = 0; j < K && j < zeros.length; j++) {
    const g = zeros[j], a = g * lx;
    // 2 Re( x^(½+iγ) / (½+iγ) ) = 2√x (½cos a + γ sin a) / (¼ + γ²)
    s -= 2 * sx * (0.5 * Math.cos(a) + g * Math.sin(a)) / (0.25 + g * g);
  }
  return s;
}

// ---- zero-free regions, for the strip picture --------------------------------
// The classical (de la Vallée Poussin) shape σ > 1 − 1/(R log t), with the explicit
// constant R = 5.558691 (Mossinghoff, Trudgian & Yang). Valid for t ≥ 2.
export const R_CLASSICAL = 5.558691;
export const classicalEdge = (t) => 1 - 1 / (R_CLASSICAL * Math.log(Math.max(t, 2)));

// ---- RH where it is a theorem: elliptic curves over 𝔽_p ---------------------
// #E(𝔽_p) for y² = x³ + a x + b, counting the point at infinity, by Legendre symbols.
// Hasse (1933, the genus-1 case of Weil's RH): |#E − (p + 1)| ≤ 2√p.
export function legendreTable(p) {
  const t = new Int8Array(p).fill(-1);
  t[0] = 0;
  for (let y = 1; y < p; y++) t[(y * y) % p] = 1;
  return t;
}
export function ecCount(a, b, p, leg = legendreTable(p)) {
  let n = p + 1;                       // ∞, plus p for the "1 +" in Σ (1 + (f(x)/p))
  for (let x = 0; x < p; x++) {
    const f = ((((x * x) % p) * x + a * x + b) % p + p) % p;
    n += leg[f];
  }
  return n;
}
export const isSquarefreeCubic = (a, b, p) => ((4 * a * a * a + 27 * b * b) % p + p) % p !== 0;

// ---- li(x), by Ramanujan's series --------------------------------------------------
// li(x) = γ + ln ln x + √x Σ_{n≥1} (−1)^(n−1) (ln x)^n / (n! 2^(n−1)) Σ_{k=0}^{⌊(n−1)/2⌋} 1/(2k+1)
export const EULER_GAMMA = 0.5772156649015329;
export function li(x) {
  const L = Math.log(x);
  let sum = 0, term = 1, inner = 0;
  for (let n = 1; n < 200; n++) {
    term *= L / n;                                    // L^n / n!
    if ((n - 1) % 2 === 0) inner += 1 / (n);          // adds 1/(2k+1) with 2k+1 = n when n is odd
    const t = (n % 2 ? 1 : -1) * term / 2 ** (n - 1) * inner;
    sum += t;
    if (Math.abs(t) < 1e-17 * Math.abs(sum) && n > 2 * L) break;
  }
  return EULER_GAMMA + Math.log(L) + Math.sqrt(x) * sum;
}
// unfolded spacings: u = θ(γ)/π + 1 has mean gap 1 (for the gap-statistics slide)
export function unfoldedGaps(zeros) {
  const u = zeros.map(Nsmooth), g = [];
  for (let i = 1; i < u.length; i++) g.push(u[i] - u[i - 1]);
  return g;
}
// GUE nearest-neighbour spacing (Wigner surmise, β = 2) and Poisson
export const wignerGUE = (s) => (32 / (Math.PI ** 2)) * s * s * Math.exp(-4 * s * s / Math.PI);
export const poisson = (s) => Math.exp(-s);

// ---- one zero off the line: where x^β overtakes √x · log x -------------------------------
// With L = ln x, x^β > √x ln x  ⟺  g(L) = (β − ½)L − ln L > 0. g is convex with its minimum at
// L* = 1/(β − ½), where g(L*) = 1 + ln(β − ½). If that is ≥ 0 (β ≥ ½ + 1/e ≈ 0.868), x^β is never
// smaller: there is no crossover, and this returns null. Otherwise the crossover for good is g's
// larger root, found by bisection on [L*, ∞). Returns L = ln x.
export function offLineCrossover(beta) {
  const d = beta - 0.5;
  if (!(d > 0)) return Infinity;
  if (1 + Math.log(d) >= 0) return null;
  const g = (L) => d * L - Math.log(L);
  let lo = 1 / d, hi = 2 / d;
  while (g(hi) <= 0) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) { const m = (lo + hi) / 2; if (g(m) > 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
