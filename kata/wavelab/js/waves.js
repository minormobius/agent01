/* WAVELAB's water, no DOM: linear water waves on a surface of any dimension, solved exactly.

   The water is still and swirl-free below its surface, so its motion obeys Laplace's equation, in four dimensions as in
   three. A plane wave on the surface, η = a cos(k·x − ωt), with k a vector along the surface, has the motion under it
   fading as e^{−|k| depth}, and its frequency is set by its wavenumber alone:
       ω² = g |k| tanh(|k| h)                    (h the water's depth; deep water: ω² = g |k|)
   the same in any dimension, because a plane wave only ever sees its own direction. So any surface can be written as a
   sum of plane waves (its Fourier transform) and each one turned at its own ω: exact, at any time, with no time step.

   The surface here is a periodic box (a 3-torus for kata's water, a 2-torus for ours), N samples a side, dx apart.
   The state is one complex amplitude per wave, Z(k), meaning η(x, t) = Re (1/N^D) Σ Z(k) e^{i(k·x − ω t)}. A real
   bump added at time t₀ with no velocity is Z += B̂(k) e^{−ik·x₀} e^{+iωt₀}: its waves at +k and −k then run apart, and
   together make η = Σ B̂ cos(ω(t − t₀)) e^{ik·(x − x₀)}, the bump released. A travelling plane wave is one Z at one k. */
import { makeGridFFT } from "./fft.js";
export const G = 9.81;
export function omega(k, h = Infinity) { return Math.sqrt(G * k * (Number.isFinite(h) ? Math.tanh(k * h) : 1)); }

export class Pond {
  /* D: 2 (our water) or 3 (kata's), N per side, dx metres; h the depth (Infinity: deep) */
  constructor(D, N, dx, h = Infinity) {
    Object.assign(this, { D, N, dx, L: N * dx, t: 0, decay: 0.02 });
    const M = (this.M = N ** D); this.Zr = new Float64Array(M); this.Zi = new Float64Array(M); this.re = new Float64Array(M); this.im = new Float64Array(M);
    this.eta = new Float32Array(M); this.kv = new Float64Array(M * D); this.k = new Float64Array(M); this.w = new Float64Array(M);
    this.fft = makeGridFFT(N, D);
    for (let i = 0; i < M; i++) {
      let r = i, k2 = 0;
      for (let d = 0; d < D; d++) { const n = r % N; r = (r - n) / N; const kd = ((2 * Math.PI) / this.L) * (n < N / 2 ? n : n - N); this.kv[i * D + d] = kd; k2 += kd * kd; }
      this.k[i] = Math.sqrt(k2);
    }
    this.setDepth(h);
  }
  setDepth(h) { this.h = h; for (let i = 0; i < this.M; i++) this.w[i] = omega(this.k[i], h); this.phT = undefined; }
  clear() { this.Zr.fill(0); this.Zi.fill(0); }
  /* a Gaussian bump of height a and width σ at x0, released now */
  drop(x0, a = 0.3, sigma = 1.2) {
    const { D, M, kv, k, w, t, dx } = this, s = a * (2 * Math.PI) ** (D / 2) * sigma ** D / dx ** D;
    for (let i = 0; i < M; i++) {
      let kx = 0; for (let d = 0; d < D; d++) kx += kv[i * D + d] * x0[d];
      const m = s * Math.exp(-0.5 * k[i] * k[i] * sigma * sigma); if (m < 1e-9 * s) continue;
      const ph = -kx + w[i] * t; this.Zr[i] += m * Math.cos(ph); this.Zi[i] += m * Math.sin(ph);
    }
  }
  /* a travelling plane wave: n the wave's integer index along each axis (k = 2π n / L), a its height */
  swell(n, a = 0.15) {
    const { N, D } = this; let i = 0; for (let d = D - 1; d >= 0; d--) i = i * N + ((n[d] % N) + N) % N;
    this.Zr[i] += a * this.M; return i;
  }
  /* a standing wave of one frequency: every wave with |k| near k0, weighted by a real spherical harmonic of its direction
   (l = 0, 1, 2 about the axis), centred at c. In space it's j_l(k0 r) Y_l: the shape of an s, p or d orbital */
  orbital(l, k0, axis, c, peak = 0.3) {
    const { D, M, kv, k, t, w } = this, ax = axis.map((x) => x / Math.hypot(...axis)), tmpR = new Float64Array(M), tmpI = new Float64Array(M);
    for (let i = 0; i < M; i++) {
      if (k[i] < 1e-9) continue;
      const g = Math.exp(-(((k[i] - k0) / 0.045) ** 2)); if (g < 1e-6) continue; // a thin shell of wavelengths: its frequencies stay together (dω = g dk / 2ω)
      let ca = 0, kc = 0; for (let d = 0; d < D; d++) { ca += (kv[i * D + d] / k[i]) * ax[d]; kc += kv[i * D + d] * c[d]; }
      const Y = l === 0 ? 1 : l === 1 ? ca : (3 * ca * ca - 1) / 2;
      // i^l keeps the field real (Y(−k) = (−1)^l Y(k)); e^{−ik·c} centres it; e^{iωt} so it peaks now
      const ph = (l * Math.PI) / 2 - kc + w[i] * t; tmpR[i] = g * Y * Math.cos(ph); tmpI[i] = g * Y * Math.sin(ph);
    }
    // scale so its crest is `peak` high
    this.re.set(tmpR); this.im.set(tmpI); for (let i = 0; i < M; i++) { const ph = -w[i] * t, cr = Math.cos(ph), sr = Math.sin(ph), a = this.re[i], b = this.im[i]; this.re[i] = a * cr - b * sr; this.im[i] = a * sr + b * cr; }
    this.fft(this.re, this.im, true); let mx = 0; for (let i = 0; i < M; i++) mx = Math.max(mx, Math.abs(this.re[i]));
    const sc = mx > 0 ? (peak * M) / mx : 0; // (the inverse transform is unscaled: η is it over M)
    for (let i = 0; i < M; i++) { this.Zr[i] += tmpR[i] * sc; this.Zi[i] += tmpI[i] * sc; }
  }
  advance(dt) { this.t += dt; if (this.decay) { const f = Math.exp(-this.decay * dt); for (let i = 0; i < this.M; i++) { this.Zr[i] *= f; this.Zi[i] *= f; } } }
  /* the surface now, η at every sample (also kept in this.eta). Each wave's phase e^{−iωt} is kept turning by one
     precomputed step per call when the clock moves on by the same dt (the page's case), else recomputed */
  field() {
    const { M, Zr, Zi, w, t, re, im } = this;
    if (!this.ph || this.phT === undefined || Math.abs(t - this.phT - this.phDt) > 1e-9 || this.phRe !== this.D) {
      const dt = this.phT === undefined ? 0 : t - this.phT;
      if (!this.ph) { this.ph = new Float64Array(2 * M); this.rot = new Float64Array(2 * M); }
      for (let i = 0; i < M; i++) { const a = -w[i] * t; this.ph[2 * i] = Math.cos(a); this.ph[2 * i + 1] = Math.sin(a); const b = -w[i] * dt; this.rot[2 * i] = Math.cos(b); this.rot[2 * i + 1] = Math.sin(b); }
      this.phDt = dt; this.phRe = this.D;
    } else {
      const ph = this.ph, rot = this.rot;
      for (let i = 0; i < M; i++) { const c = ph[2 * i], s = ph[2 * i + 1], rc = rot[2 * i], rs = rot[2 * i + 1]; ph[2 * i] = c * rc - s * rs; ph[2 * i + 1] = c * rs + s * rc; }
    }
    this.phT = t;
    const ph = this.ph;
    for (let i = 0; i < M; i++) { const c = ph[2 * i], s = ph[2 * i + 1]; re[i] = Zr[i] * c - Zi[i] * s; im[i] = Zr[i] * s + Zi[i] * c; }
    this.fft(re, im, true);
    const inv = 1 / M; for (let i = 0; i < M; i++) this.eta[i] = re[i] * inv;
    return this.eta;
  }
  /* η at a point (trilinear / bilinear, periodic), from the last field() */
  at(x) {
    const { N, D, dx, eta } = this, f = x.map((v) => v / dx), i0 = f.map((v) => Math.floor(v)), u = f.map((v, d) => v - i0[d]);
    let r = 0;
    for (let c = 0; c < 1 << D; c++) {
      let wgt = 1, idx = 0;
      for (let d = D - 1; d >= 0; d--) { const b = (c >> d) & 1; wgt *= b ? u[d] : 1 - u[d]; idx = idx * N + ((((i0[d] + b) % N) + N) % N); }
      r += wgt * eta[idx];
    }
    return r;
  }
  energy() { let e = 0; for (let i = 0; i < this.M; i++) e += this.Zr[i] ** 2 + this.Zi[i] ** 2; return e; }
}
