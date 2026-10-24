/* Lumen⁴'s physics, no DOM: the page draws it, the selftest checks it. Light in n spatial dimensions, n = 3 (ours)
   and n = 4, worked out exactly where it can be and numerically (and checked) where it can't.

   What changes from 3D to 4D, and what doesn't:
     falloff     a source of dimension k spreads into n − k − 1 directions: I ∝ r^−(n−k−1)
     a laser     still a line (collimation is a narrow beam in any dimension); its cross-section is an (n−1)-ball,
                 so far away it fades like a point: on axis (w0/w(z))^(n−1)
     a flash     Huygens' principle (a sharp wavefront) holds only in odd n: in 4D a flash leaves a wake
     a hole      a round aperture is an (n−1)-ball: 3D's Airy (2J₁(x)/x)² becomes (3j₁(x)/x)²
     glare       light has n − 1 polarizations; at a surface one lies in the plane of incidence (p) and n − 2
                 across it (s), so 4D glare at Brewster's angle is polarized in a plane, not along a line
     a hot body  photon modes grow like ν^(n−1), so the spectrum is ν^n/(e^x − 1): bluer, and power ∝ T^(n+1)
     a rainbow   the same 42° (it's plane-of-incidence optics), but a cone of directions: in your slice of view
                 it shrinks as the sun leans into w, and is gone past 42°
     unchanged   Snell's law, total internal reflection, slit diffraction, interference, Lambert's law: all
                 happen in a plane (of incidence, of the slit's narrow direction), the same in any dimension */

/* ------------------------------------------------------------- falloff and the laser */
/* the intensity exponent for a source of dimension k in n dimensions: I ∝ r^−falloff */
export const falloff = (n, k) => n - k - 1;
/* a Gaussian beam: waist w0, wavelength lam (same units). Its width at z, and its on-axis intensity relative to the
   waist (the power, through an (n−1)-ball cross-section, is conserved) */
export const rayleigh = (w0, lam) => (Math.PI * w0 * w0) / lam;
export const beamWidth = (z, w0, lam) => w0 * Math.sqrt(1 + (z / rayleigh(w0, lam)) ** 2);
export const beamOnAxis = (z, w0, lam, n) => (w0 / beamWidth(z, w0, lam)) ** (n - 1);

/* ------------------------------------------------------------- a flash: the wave equation's Green's function
   A pulse f(t) from a point source, seen at distance r. In 3D the field is the pulse itself, delayed and scaled:
     u₃(r, t) = f(t − r) / (4πr)
   In 2D the response to an instant flash is θ(t − r)/(2π√(t² − r²)): it never stops, and with s = t − r cosh η
     u₂(r, t) = (1/2π) ∫₀^∞ f(t − r cosh η) dη
   and the dimensions two apart are related by G_{n+2} = −(1/2πr) ∂_r G_n, so
     u₄(r, t) = (1/4π²r) ∫₀^∞ cosh η · f′(t − r cosh η) dη
   No singularity is left to integrate. The instant flash in 4D is a front followed by −(t² − r²)^(−3/2)/4π² inside
   the light cone: a negative wake that dies like t⁻³. Units: c = 1. */
export const gauss = (sig) => ({ f: (s) => Math.exp(-(s * s) / (2 * sig * sig)), fp: (s) => (-s / (sig * sig)) * Math.exp(-(s * s) / (2 * sig * sig)), sig });
export const u3 = (r, t, P) => P.f(t - r) / (4 * Math.PI * r);
function simpson(g, a, b, N) { // N even
  const h = (b - a) / N; let s = g(a) + g(b);
  for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * g(a + i * h);
  return (s * h) / 3;
}
export function u2(r, t, P, N = 600) {
  const top = Math.acosh(Math.max(1, (t + 9 * P.sig) / r)); if (top <= 0) return 0;
  return simpson((e) => P.f(t - r * Math.cosh(e)), 0, top, N) / (2 * Math.PI);
}
export function u4(r, t, P, N = 600) {
  const top = Math.acosh(Math.max(1, (t + 9 * P.sig) / r)); if (top <= 0) return 0;
  return simpson((e) => Math.cosh(e) * P.fp(t - r * Math.cosh(e)), 0, top, N) / (4 * Math.PI * Math.PI * r);
}
/* the instant flash's wake in 4D, inside the cone (t > r) */
export const wake4 = (r, t) => -1 / (4 * Math.PI * Math.PI * (t * t - r * r) ** 1.5);

/* ------------------------------------------------------------- a round hole: Fraunhofer diffraction
   x = (πD/λ) sin θ. 3D: the aperture is a disc, I = (2J₁(x)/x)² (Airy). 4D: the aperture is a 3-ball, and the
   Fourier transform of a 3-ball is 3j₁(x)/x with j₁ the spherical Bessel function. */
export function J0(x) { // Numerical Recipes' rational approximations, |error| < 1e-8
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    return (57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))))) /
      (57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y)))));
  }
  const z = 8 / ax, y = z * z, xx = ax - 0.785398164;
  const a = 1 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const b = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
}
export function J1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    return (x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))))) /
      (144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y)))));
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const a = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const b = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const v = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a - z * Math.sin(xx) * b);
  return x < 0 ? -v : v;
}
/* the amplitude through the hole, 1 straight through */
export const amp3 = (x) => (Math.abs(x) < 1e-6 ? 1 : (2 * J1(x)) / x);
export const amp4 = (x) => (Math.abs(x) < 1e-3 ? 1 - (x * x) / 10 : (3 * (Math.sin(x) - x * Math.cos(x))) / (x * x * x));
export const airy = (x, n) => (n === 3 ? amp3(x) : amp4(x)) ** 2;
/* the totals over the whole screen (a plane in 3D, a 3-space in 4D: area element x^(n−2) dx, up to a constant):
   ∫ (2J₁/x)² x dx = 2, ∫ (3j₁/x)² x² dx = 9 ∫ j₁² dx = 3π/2 */
export const AIRY_TOTAL = { 3: 2, 4: (3 * Math.PI) / 2 };
/* the fraction of the light inside x (encircled energy), by Simpson; 3D's has a closed form, 1 − J₀² − J₁² */
export function encircled(x, n, N = 2000) { if (x <= 0) return 0; return simpson((s) => airy(s, n) * s ** (n - 2), 0, x, N) / AIRY_TOTAL[n]; }
/* the first dark ring: 3D at x = 3.8317 (J₁'s first zero, 1.22 λ/D), 4D at x = 4.4934 (tan x = x, 1.43 λ/D) */
export function firstDark(n) {
  let a = 3, b = 5; const g = (x) => (n === 3 ? J1(x) : Math.sin(x) - x * Math.cos(x));
  for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (g(a) * g(m) <= 0) b = m; else a = m; }
  return (a + b) / 2;
}

/* ------------------------------------------------------------- glare: Fresnel, and the polarizations
   Fresnel's amplitudes are the same in any dimension (the boundary conditions are in the plane of incidence). What
   changes is how many of each: n − 1 transverse directions, one of them p (in the plane of incidence) and n − 2 s. */
export function fresnel(theta, n1, n2) {
  const ci = Math.cos(theta), st = (n1 / n2) * Math.sin(theta);
  if (st >= 1) return { Rs: 1, Rp: 1, tir: true };
  const ct = Math.sqrt(1 - st * st), rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
  return { Rs: rs * rs, Rp: rp * rp, tir: false };
}
export const brewster = (n1, n2) => Math.atan(n2 / n1);
/* unpolarized light (every transverse direction alike) reflects R = ((n − 2)Rs + Rp)/(n − 1) */
export const reflectUnpolarized = (theta, n1, n2, n) => { const f = fresnel(theta, n1, n2); return ((n - 2) * f.Rs + f.Rp) / (n - 1); };
/* unpolarized light through a polarizer that passes a k-dimensional subspace of the n − 1 transverse directions */
export const passUnpolarized = (n, k) => k / (n - 1);

/* ------------------------------------------------------------- a hot body: Planck in n dimensions
   modes ∝ ν^(n−1) dν, each holding hν/(e^x − 1): energy per frequency ∝ ν^n/(e^x − 1), per wavelength
   ∝ λ^−(n+2)/(e^x − 1), x = hc/λkT; total ∝ T^(n+1) */
export const HC_K = 1.438776877e7; // hc/k in nm·K
export const planck = (lamNm, T, n) => lamNm ** -(n + 2) / Math.expm1(HC_K / (lamNm * T));
/* Wien: x = hν/kT at the peak per frequency solves x = n(1 − e^−x); per wavelength x = (n + 2)(1 − e^−x) */
export function wienX(m) { let x = m; for (let i = 0; i < 200; i++) x = m * (1 - Math.exp(-x)); return x; }
export const peakNm = (T, n) => HC_K / (T * wienX(n + 2));
/* ∫ x^n/(e^x − 1) dx = n! ζ(n + 1): π⁴/15 in 3D, 24 ζ(5) in 4D: the Stefan–Boltzmann constants, up to units */
export function planckTotal(n, N = 4000) { return simpson((x) => (x < 1e-9 ? 0 : x ** n / Math.expm1(x)), 0, 60, N); }

/* colour: CIE 1931 2° matching functions (Wyman, Sloan and Shirley's multi-lobe fit), XYZ to linear sRGB */
const lobe = (l, mu, s1, s2) => { const t = (l - mu) / (l < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
export function cie(l) {
  return [
    1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
    0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
    1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
  ];
}
const toRGB = ([X, Y, Z]) => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
const gammaC = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
/* a displayable colour (0–255 each), brightest channel at 1, for a spectrum s(λ in nm) */
export function colourOf(s) {
  const xyz = [0, 0, 0]; for (let l = 380; l <= 780; l += 2) { const c = cie(l), v = s(l); xyz[0] += c[0] * v; xyz[1] += c[1] * v; xyz[2] += c[2] * v; }
  const rgb = toRGB(xyz).map((v) => Math.max(0, v)), m = Math.max(...rgb) || 1;
  return rgb.map((v) => Math.round(255 * gammaC(v / m)));
}
export const starColour = (T, n) => colourOf((l) => planck(l, T, n));
/* one wavelength's colour (for the rainbow): Bruton's piecewise mapping. A pure spectral colour is outside sRGB,
   and the CIE fit above is least accurate in the far red, so for a single line this standard approximation reads
   truer than the integral does */
export function lineColour(l) {
  let r = 0, g = 0, b = 0;
  if (l < 440) { r = (440 - l) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = (510 - l) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; } else if (l < 645) { r = 1; g = (645 - l) / 65; } else r = 1;
  const f = l < 420 ? 0.3 + (0.7 * (l - 380)) / 40 : l > 700 ? 0.3 + (0.7 * (780 - l)) / 80 : 1;
  return [r, g, b].map((v) => Math.round(255 * (v * f) ** 0.8));
}

/* ------------------------------------------------------------- the rainbow
   Through a drop, entering at angle i (refracted to r), light is turned D = 180° + 2i − 4r; its least D is the
   rainbow, 180° − D_min from the point opposite the sun: about 42° for water. That's all in the plane of
   incidence, so it's the same in 4D. But the rainbow is every direction at that angle, a cone; your view is a
   slice. If the antisolar point leans β into w, the slice holds the directions d with
   cos(rainbow) = cos β · cos ρ, ρ measured from the antisolar point's shadow in the slice: a circle of radius
   ρ = arccos(cos θ / cos β), which shrinks as β grows, and is gone at β = θ. */
export const waterN = (lamNm) => 1.3247 + 3300 / (lamNm * lamNm);
export function rainbowAngle(nw) {
  let best = Infinity;
  for (let k = 0; k <= 20000; k++) { const i = (k / 20000) * (Math.PI / 2), r = Math.asin(Math.sin(i) / nw), D = Math.PI + 2 * i - 4 * r; if (D < best) best = D; }
  return Math.PI - best;
}
export const rainbowInSlice = (theta, beta) => (Math.cos(beta) <= Math.cos(theta) ? null : Math.acos(Math.cos(theta) / Math.cos(beta)));
