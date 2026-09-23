// field.js — a seeded, explicit leading-order field of the 2026 blowup ansatz,
// evaluable anywhere in space and time, for the /explorer/ page.
//
// What is exact here, and what is modelled:
//   EXACT   the similarity change of variables (3.2); incompressibility, because
//           the radial flux V₀ is derived from the axial profile U by the
//           paper's identity (4.7); regularity at the axis, because the swirl
//           is √(2X)·F with F smooth; the leading centrifugal pressure balance
//           Π_X = E²/2X normalised to vanish at infinity (4.25); the exterior
//           heat law E → c∞·X^−A·H(2d/X) asymptotically (4.29); every scaling
//           exponent (A = ½+h, D = ½−h).
//   MODEL   the shape of the profiles between the axis and the far field. The
//           paper proves such profiles exist and fixes them by estimates; it
//           does not print them. A seed picks one member of a family with the
//           right structure. The pulse annulus radii are illustrative.
//
// The same formulas are written twice on purpose — once here (CPU: streamlines,
// particles, the selftest) and once as GLSL in `glslField()` (GPU: the section
// plane and the pressure volume). The selftest compares the two through the
// tables both read, not by running a GPU.
(function (root) {
  'use strict';

  // ------------------------------------------------------------ helpers ----
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashSeed(s) { let h = 2166136261; const str = String(s); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // Abramowitz–Stegun 7.1.26, |err| < 1.5e-7 — the same polynomial the shader uses
  function erf(x) {
    if (Math.abs(x) < 0.1) { const x2 = x * x; return 1.1283791670955126 * x * (1 - x2 / 3 + x2 * x2 / 10 - x2 * x2 * x2 / 42); }   // series: relative accuracy near 0
    const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y;
  }
  function lgamma(x) { const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]; if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x); x -= 1; let a = c[0]; const t = x + g + 0.5; for (let i = 1; i < g + 2; i++) a += c[i] / (x + i); return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a); }
  // H(Z) = Γ(1+h)⁻¹ ∫₀^∞ e^{-v} v^h (1+Zv)^{-h} dv, with v = u² (see /exterior/)
  function Hexact(Z, h) {
    const n = 600, b = 9, du = b / n; let s = 0;
    for (let i = 0; i <= n; i++) { const u = i * du; const f = 2 * Math.exp(-u * u) * Math.pow(u, 1 + 2 * h) * Math.pow(1 + Z * u * u, -h); s += f * (i === 0 || i === n ? 1 : (i % 2 ? 4 : 2)); }
    return s * du / 3 / Math.exp(lgamma(1 + h));
  }

  // ------------------------------------------------------ the specimen -----
  // seed → the free choices of the family. Ranges are the ones that keep the
  // core recognisable; h stays inside the proof's 0 < h < 1/100.
  function params(seed) {
    const r = mulberry(hashSeed(seed));
    const pick = (lo, hi) => lo + (hi - lo) * r();
    return {
      seed: String(seed),
      h: pick(0.003, 0.01),          // the exponent; A = ½+h, D = ½−h
      j0: pick(0.006, 0.05),         // axis offset of U* = 4η + j₀ (Prop. 4.10 allows 0 < j₀ ≤ .05)
      Xu: pick(0.9, 2.4),            // core of the axial flow: U = (4η+j₀)·ψ(X), ψ = exp(−(X/Xu)²) − κ·shell
      XrF: pick(2.2, 3.2),           // the return-flow shell sits at Xr = XrF·Xu …
      WrF: pick(0.55, 0.95),         // … with width Wr = WrF·Xu; κ makes ∫₀^∞ψ dX = 0 exactly (M(∞) = 0, (4.28))
      Xe: pick(0.25, 1.2),           // swirl core radius in X: E ∝ √(2X)(X+Xe)^(−A−½)
      Xs: pick(0.8, 3.5),            // radius of the extra swirl bulge
      beta: pick(0.0, 1.4),          // strength of that bulge, shaped (1+η²)⁻¹ like the reference profile
      cinf: pick(0.7, 1.3),          // c∞: the exterior swirl amplitude
      Xa: pick(1.6, 2.6),            // illustrative pulse annulus
      Xb: pick(4.0, 6.5),
      bands: 2 + Math.floor(r() * 3),   // pulse rings drawn per band
      hue: r(),                      // palette rotation
      pseed: (r() * 1e9) >>> 0,      // particle / noise seed
    };
  }

  // ------------------------------------------------------ the tables -------
  const HZ_N = 512, HZ_UMAX = Math.log(1 + 1e6);      // H(Z) on u = log(1+Z)
  const PI_NX = 1024, PI_NE = 64, PI_XMIN = 1e-3, PI_XMAX = 1e4;
  function build(p) {
    const A = 0.5 + p.h, D = 0.5 - p.h, h = p.h;
    // H table
    const Htab = new Float32Array(HZ_N);
    for (let i = 0; i < HZ_N; i++) { const Z = Math.exp(HZ_UMAX * i / (HZ_N - 1)) - 1; Htab[i] = Hexact(Z, h); }
    const Hlook = (Z) => {
      if (Z <= 0) return Htab[0];
      const u = Math.log(1 + Z) * (HZ_N - 1) / HZ_UMAX;
      if (u >= HZ_N - 1) return Htab[HZ_N - 1] * Math.pow((1 + Z) / 1e6, -h);   // asymptote H ~ Z^−h
      const i = Math.floor(u), f = u - i; return Htab[i] * (1 - f) + Htab[i + 1] * f;
    };
    const f_eta = (eta) => 1 / (1 + eta * eta);
    // the swirl profile E(X, η) and F = E/√(2X)
    const F = (X, eta) => { const d = 1 - eta * eta; const base = (p.cinf / Math.SQRT2) * Math.pow(X + p.Xe, -A - 0.5) * Hlook(2 * d / (X + p.Xe)); return base * (1 + p.beta * f_eta(eta) * Math.exp(-X / p.Xs)); };
    const E = (X, eta) => Math.sqrt(2 * X) * F(X, eta);
    // the axial profile ψ(X) = exp(−(X/Xu)²) − κ·exp(−((X−Xr)/Wr)²): outflow near the axis, a return
    // shell farther out, κ chosen so ∫₀^∞ ψ dX = 0 — the paper's M(∞,η) = 0 — which is exactly what
    // makes the radial flux V₀ vanish outside the support of U. A_X(ψ) = X⁻¹∫₀^X ψ in closed form.
    const Xr = p.XrF * p.Xu, Wr = p.WrF * p.Xu, SP = Math.sqrt(Math.PI);
    const kappa = p.Xu / (Wr * (1 + erf(Xr / Wr)));
    const psi0 = 1 - kappa * Math.exp(-(Xr / Wr) * (Xr / Wr)), dpsi0 = kappa * (2 * Xr / (Wr * Wr)) * Math.exp(-(Xr / Wr) * (Xr / Wr));
    const chi = (X) => Math.exp(-(X / p.Xu) * (X / p.Xu)) - kappa * Math.exp(-((X - Xr) / Wr) * ((X - Xr) / Wr));
    const Achi = (X) => X < 1e-3 * p.Xu ? psi0 + 0.5 * X * dpsi0
      : ((SP * p.Xu / 2) * erf(X / p.Xu) - kappa * (SP * Wr / 2) * (erf((X - Xr) / Wr) + erf(Xr / Wr))) / X;
    const U = (X, eta) => (4 * eta + p.j0) * chi(X);
    // V₀ from (4.7): (X/L)(2ηU − 2Dη A_X(U) − d ∂_η A_X(U)), with A_X(U) = (4η+j₀)A_X(χ), ∂_η A_X(U) = 4 A_X(χ)
    const V0 = (X, eta) => { const d = 1 - eta * eta, L = 1 - 2 * h * eta * eta, a = Achi(X); return (X / L) * (2 * eta * U(X, eta) - 2 * D * eta * (4 * eta + p.j0) * a - d * 4 * a); };
    const v0 = (X, eta) => { const d = 1 - eta * eta, L = 1 - 2 * h * eta * eta, a = Achi(X); return (2 * eta * U(X, eta) - 2 * D * eta * (4 * eta + p.j0) * a - d * 4 * a) / L; };   // V₀/X, smooth at X = 0
    // Π table on a log grid: Π(X,η) = −∫_X^∞ E²/(2x) dx = −∫ E²/2 d(log x), tail c∞² X^−2A/(2A)
    const dl = Math.log(PI_XMAX / PI_XMIN) / (PI_NX - 1);
    const Pi = new Float32Array(PI_NX * PI_NE);
    for (let j = 0; j < PI_NE; j++) {
      const eta = -1 + 2 * j / (PI_NE - 1);
      let acc = p.cinf * p.cinf * Math.pow(PI_XMAX, -2 * A) / (4 * A);   // ∫_{Xmax}^∞ E²/(2x) with E² → c∞² x^−2A
      let prev = E(PI_XMAX, eta) ** 2 / 2;
      Pi[j * PI_NX + PI_NX - 1] = -acc;
      for (let i = PI_NX - 2; i >= 0; i--) { const X = PI_XMIN * Math.exp(i * dl); const cur = E(X, eta) ** 2 / 2; acc += 0.5 * dl * (cur + prev); prev = cur; Pi[j * PI_NX + i] = -acc; }
    }
    const PiLook = (X, eta) => {
      let s = (Math.log(Math.max(X, PI_XMIN) / PI_XMIN)) / dl; if (s > PI_NX - 1) s = PI_NX - 1;
      let t = (Math.min(1, Math.max(-1, eta)) + 1) / 2 * (PI_NE - 1);
      const i = Math.min(PI_NX - 2, Math.floor(s)), j = Math.min(PI_NE - 2, Math.floor(t)), fs = s - i, ft = t - j;
      const a = Pi[j * PI_NX + i], b = Pi[j * PI_NX + i + 1], c = Pi[(j + 1) * PI_NX + i], dd = Pi[(j + 1) * PI_NX + i + 1];
      return (a * (1 - fs) + b * fs) * (1 - ft) + (c * (1 - fs) + dd * fs) * ft;
    };
    // q from (z, τ): q − z²q^{2h} = τ (Lemma 4.1), Newton
    const qOf = (z, tau) => {
      let q = Math.max(tau, Math.pow(Math.abs(z), 1 / D)) + tau;
      for (let i = 0; i < 12; i++) { const q2h = Math.pow(q, 2 * h); const f = q - z * z * q2h - tau, df = 1 - 2 * h * z * z * q2h / q; const nq = q - f / df; if (Math.abs(nq - q) < 1e-13 * q) { q = nq; break; } q = Math.max(nq, tau * 0.5); }
      return q;
    };
    // the field at a Cartesian point, physical units, ν = 1
    function at(x, y, z, tau, out) {
      out = out || {};
      const q = qOf(z, tau), r2 = x * x + y * y, X = r2 / (2 * q), eta = z / Math.pow(q, D);
      const vv = v0(X, eta);                            // V₀/X, smooth at the axis (V₀ = X·v₀)
      const Ff = F(X, eta), qa = Math.pow(q, -A), qa2 = qa / Math.sqrt(q);   // q^−A and q^−A−½
      out.u = (vv / (2 * q)) * x - qa2 * Ff * y;         // (4.5)
      out.v = (vv / (2 * q)) * y + qa2 * Ff * x;
      out.w = qa * U(X, eta);
      out.p = qa * qa * PiLook(X, eta);                 // q^−2A Π
      out.q = q; out.X = X; out.eta = eta;
      out.uth = qa * E(X, eta); out.ur = X > 1e-12 ? V0(X, eta) / Math.sqrt(r2) : 0;
      return out;
    }
    return { p, A, D, h, Htab, Pi, PiLook, Hlook, F, E, U, V0, v0, Achi, chi, kappa, Xr, Wr, qOf, at, consts: { HZ_N, HZ_UMAX, PI_NX, PI_NE, PI_XMIN, PI_XMAX, dl } };
  }

  // -------------------------------------------------------- the shader -----
  // GLSL for the same field. Expects: uniform sampler2D uPi (R32F, PI_NX × PI_NE),
  // uniform sampler2D uH (R32F, HZ_N × 1), and the uniforms declared below.
  function glslField() {
    return `
uniform sampler2D uPi; uniform sampler2D uH;
uniform float uHh, uA, uD, uJ0, uXu, uXe, uXs, uBeta, uCinf, uTau, uXr, uWr, uKappa, uPsi0, uDpsi0;
const float HZ_N = ${HZ_N}.0, HZ_UMAX = ${HZ_UMAX.toFixed(8)};
const float PI_NX = ${PI_NX}.0, PI_NE = ${PI_NE}.0, PI_XMIN = ${PI_XMIN}, PI_DL = ${(Math.log(PI_XMAX / PI_XMIN) / (PI_NX - 1)).toFixed(10)};
float erf_(float x) {
  if (abs(x) < 0.1) { float x2 = x * x; return 1.1283791671 * x * (1.0 - x2 / 3.0 + x2 * x2 / 10.0 - x2 * x2 * x2 / 42.0); }
  float s = x < 0.0 ? -1.0 : 1.0; x = abs(x); float t = 1.0 / (1.0 + 0.3275911 * x); float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x); return s * y;
}
float Hlook(float Z) {
  if (Z <= 0.0) return texelFetch(uH, ivec2(0, 0), 0).r;
  float u = log(1.0 + Z) * (HZ_N - 1.0) / HZ_UMAX;
  if (u >= HZ_N - 1.0) return texelFetch(uH, ivec2(int(HZ_N) - 1, 0), 0).r * pow((1.0 + Z) / 1.0e6, -uHh);
  int i = int(floor(u)); float f = u - float(i);
  return mix(texelFetch(uH, ivec2(i, 0), 0).r, texelFetch(uH, ivec2(i + 1, 0), 0).r, f);
}
float PiLook(float X, float eta) {
  float s = log(max(X, PI_XMIN) / PI_XMIN) / PI_DL; s = min(s, PI_NX - 1.0);
  float t = (clamp(eta, -1.0, 1.0) + 1.0) * 0.5 * (PI_NE - 1.0);
  int i = min(int(PI_NX) - 2, int(floor(s))); int j = min(int(PI_NE) - 2, int(floor(t)));
  float fs = s - float(i), ft = t - float(j);
  float a = texelFetch(uPi, ivec2(i, j), 0).r, b = texelFetch(uPi, ivec2(i + 1, j), 0).r;
  float c = texelFetch(uPi, ivec2(i, j + 1), 0).r, d = texelFetch(uPi, ivec2(i + 1, j + 1), 0).r;
  return mix(mix(a, b, fs), mix(c, d, fs), ft);
}
float qOf(float z, float tau) {
  float q = max(tau, pow(abs(z), 1.0 / uD)) + tau;
  for (int i = 0; i < 10; i++) { float q2h = pow(q, 2.0 * uHh); float f = q - z * z * q2h - tau; float df = 1.0 - 2.0 * uHh * z * z * q2h / q; q = max(q - f / df, tau * 0.5); }
  return q;
}
float Fprof(float X, float eta) { float d = 1.0 - eta * eta; float base = (uCinf * 0.7071067812) * pow(X + uXe, -uA - 0.5) * Hlook(2.0 * d / (X + uXe)); return base * (1.0 + uBeta / (1.0 + eta * eta) * exp(-X / uXs)); }
float chi_(float X) { return exp(-(X / uXu) * (X / uXu)) - uKappa * exp(-((X - uXr) / uWr) * ((X - uXr) / uWr)); }
float Achi(float X) {
  if (X < 0.02 * uXu) return uPsi0 + 0.5 * X * uDpsi0;
  return ((0.8862269255 * uXu) * erf_(X / uXu) - uKappa * (0.8862269255 * uWr) * (erf_((X - uXr) / uWr) + erf_(uXr / uWr))) / X;
}
float Uprof(float X, float eta) { return (4.0 * eta + uJ0) * chi_(X); }
float v0_(float X, float eta) { float d = 1.0 - eta * eta, L = 1.0 - 2.0 * uHh * eta * eta, a = Achi(X); return (2.0 * eta * Uprof(X, eta) - 2.0 * uD * eta * (4.0 * eta + uJ0) * a - d * 4.0 * a) / L; }
// returns velocity (xyz) and pressure (w); also writes q, X, eta
vec4 fieldAt(vec3 P, out float q, out float X, out float eta) {
  q = qOf(P.z, uTau); float r2 = P.x * P.x + P.y * P.y; X = r2 / (2.0 * q); eta = P.z / pow(q, uD);
  float v0 = v0_(X, eta);
  float Ff = Fprof(X, eta), qa = pow(q, -uA), qa2 = qa / sqrt(q);
  vec3 u = vec3((v0 / (2.0 * q)) * P.x - qa2 * Ff * P.y, (v0 / (2.0 * q)) * P.y + qa2 * Ff * P.x, qa * Uprof(X, eta));
  float p = qa * qa * PiLook(X, eta);
  return vec4(u, p);
}`;
  }

  root.NSFIELD = { params, build, glslField, erf, Hexact, mulberry, hashSeed };
})(typeof window !== 'undefined' ? window : globalThis);
