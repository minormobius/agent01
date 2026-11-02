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

/* A FLOATING CORK. In linear theory the water at the surface is pushed along the surface by its slope alone: the
   pressure there is the air's, so the only horizontal force left is gravity's, down the slope,
       du/dt = −g ∇η,
   in all the surface's directions, w among them. A small cork goes where the water at its place goes. Its state is its
   rest place x0, how far it has been carried (ξ) and its velocity (v); it starts at rest, and a slow damping (DAMP)
   lets a cork forget any error in the velocity it starts with (it's given the water's own: Pond.velocity), and a slower
   mooring (MOOR) pulls it back to its rest place, so the 2.5% the grid's slope falls short doesn't add up to a drift. The slope is taken at the cork's REST
   place, as linear theory has it (Airy's orbits): taking it where the cork has got to adds part of the second-order
   motion (the start of Stokes drift) without the rest of it. */
export const DAMP = 0.05, MOOR = 25; // MOOR: seconds for a cork's slow pull back to its rest place (far slower than any wave)
export function corkStep(c, pond, dt, damp = DAMP, moor = MOOR) {
  const at = c.x0, F = pond.slope(at).map((s) => -G * s), k = Math.exp(-damp * dt), m = Number.isFinite(moor) ? Math.exp(-dt / moor) : 1;
  c.F = F; c.v = c.v.map((v, d) => (v + F[d] * dt) * k); c.xi = c.xi.map((x, d) => (x + c.v[d] * dt) * m); c.eta = pond.at(at);
  return c;
}
export function cork(x0) { return { x0: x0.slice(), xi: x0.map(() => 0), v: x0.map(() => 0), F: x0.map(() => 0), eta: 0 }; }

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
  /* THE TANK. The box is periodic; walls are made by the method of images. Along an axis with sym +1 everything put in
     the water is mirrored about 0 (and so, the box being periodic, about L/2 too): a wall at each, the flow through it
     zero, ∂η/∂n = 0 (Neumann). With sym −1 it's mirrored with its sign flipped: η = 0 there (Dirichlet), an edge open
     to a big sea. 0 leaves the axis periodic. The tank is then the half-box [L/2, L] (or [0, L/2], its mirror) along
     each walled axis, and every wave in it reflects as it should, exactly: the images do the reflecting. */
  setSym(sym) { this.sym = sym.slice(); this.clear(); }
  /* the images of a spectrum: out(k) = Σ over the walled axes' flips σ of (Π signs) in(σk) */
  images(R, I) {
    const sym = this.sym || [], { N, D, M } = this, axes = [...Array(D).keys()].filter((d) => sym[d]);
    if (!axes.length) return [R, I];
    const oR = new Float64Array(M), oI = new Float64Array(M), c = new Array(D);
    for (let i = 0; i < M; i++) {
      let r = i; for (let d = 0; d < D; d++) { c[d] = r % N; r = (r - c[d]) / N; }
      for (let f = 0; f < 1 << axes.length; f++) {
        let j = 0, sg = 1;
        for (let d = D - 1; d >= 0; d--) { const a = axes.indexOf(d), flip = a >= 0 && (f >> a) & 1; if (flip) sg *= sym[d]; j = j * N + (flip ? (N - c[d]) % N : c[d]); }
        oR[i] += sg * R[j]; oI[i] += sg * I[j];
      }
    }
    return [oR, oI];
  }
  /* a Gaussian bump of height a and width σ at x0, released now */
  drop(x0, a = 0.3, sigma = 1.2) {
    const { D, M, kv, k, w, t, dx } = this, s = a * (2 * Math.PI) ** (D / 2) * sigma ** D / dx ** D;
    for (let i = 0; i < M; i++) {
      let kx = 0; for (let d = 0; d < D; d++) kx += kv[i * D + d] * x0[d];
      const m = s * Math.exp(-0.5 * k[i] * k[i] * sigma * sigma); if (m < 1e-9 * s) continue;
      if (!this.sym || !this.sym.some((x) => x)) { const ph = -kx + w[i] * t; this.Zr[i] += m * Math.cos(ph); this.Zi[i] += m * Math.sin(ph); continue; }
      // with walls: the drop and its images, Π over axes of e^{−ik x} (periodic), 2 cos kx (walls) or −2i sin kx (open)
      let fr = 1, fi = 0;
      for (let d = 0; d < D; d++) {
        const kd = kv[i * D + d], q = kd * x0[d], sd = this.sym[d]; let ar, ai;
        if (!sd) { ar = Math.cos(q); ai = -Math.sin(q); } else if (sd > 0) { ar = 2 * Math.cos(q); ai = 0; } else { ar = 0; ai = -2 * Math.sin(q); }
        const nr = fr * ar - fi * ai; fi = fr * ai + fi * ar; fr = nr;
      }
      const cr = Math.cos(w[i] * t), ci = Math.sin(w[i] * t); this.Zr[i] += m * (fr * cr - fi * ci); this.Zi[i] += m * (fr * ci + fi * cr);
    }
  }
  /* a travelling plane wave: n the wave's integer index along each axis (k = 2π n / L), a its height */
  swell(n, a = 0.15, phase = 0) {
    const { N, D, M } = this; let i = 0; for (let d = D - 1; d >= 0; d--) i = i * N + ((n[d] % N) + N) % N;
    const walled = (this.sym || []).filter((x) => x).length;
    if (!walled) { this.Zr[i] += a * M * Math.cos(phase); this.Zi[i] += a * M * Math.sin(phase); return i; }
    // with walls: the wave and its reflections, a standing wave of height a (each walled axis doubles it: halve it back)
    const R = new Float64Array(M), I = new Float64Array(M), sc = a * M / 2 ** walled; R[i] = sc * Math.cos(phase); I[i] = sc * Math.sin(phase);
    const [oR, oI] = this.images(R, I); for (let j = 0; j < M; j++) { if (oR[j] || oI[j]) { this.Zr[j] += oR[j]; this.Zi[j] += oI[j]; } }
    return i;
  }
  /* the tank's lowest modes (walls): n = 1 along one axis, a slosh with a wavelength twice the tank. There are D of them
     at one frequency, so any mix is a mode too: a slosh along any direction d, a = its height at the walls */
  seiche(d, a = 0.15) { const m = Math.hypot(...d); for (let j = 0; j < this.D; j++) { const n = new Array(this.D).fill(0); n[j] = 1; if (d[j]) this.swell(n, (a * d[j]) / m); } }
  /* a rough sea: count plane waves from directions spread over the whole sphere of them, 4 to 16 m long, random phases;
     each a × (λ / 10 m) high (longer waves taller, as at sea) */
  sea(count, a, seed = 1) {
    let s = seed >>> 0; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let j = 0; j < count; j++) {
      const z = 2 * r() - 1, ph = 2 * Math.PI * r(), q = Math.sqrt(1 - z * z), dir = this.D === 3 ? [q * Math.cos(ph), q * Math.sin(ph), z] : [Math.cos(ph), Math.sin(ph)];
      const lam = 4 + 12 * r(), m = this.L / lam, n = dir.map((x) => Math.round(x * m));
      if (n.every((x) => x === 0)) continue;
      this.swell(n, a * (this.L / Math.hypot(...n)) / 10, 2 * Math.PI * r());
    }
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
    // with walls, its images; then scale so its crest is `peak` high
    { const [a, b] = this.images(tmpR, tmpI); if (a !== tmpR) { tmpR.set(a); tmpI.set(b); } }
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
  /* the water's velocity along the surface at x, now: each plane wave carries the surface along its direction at
     (g |k| / ω) times its height there (Airy: a ω / tanh(k h), the same thing). Summed over every wave: slow, so only
     for placing a cork */
  velocity(x) {
    const { D, M, kv, k, w, t, Zr, Zi } = this, u = new Array(D).fill(0);
    for (let i = 0; i < M; i++) {
      if (k[i] < 1e-9 || (Zr[i] === 0 && Zi[i] === 0)) continue;
      let kx = 0; for (let d = 0; d < D; d++) kx += kv[i * D + d] * x[d];
      const ph = kx - w[i] * t, re = (Zr[i] * Math.cos(ph) - Zi[i] * Math.sin(ph)) / M, f = (G * re) / w[i];
      for (let d = 0; d < D; d++) u[d] += (f * kv[i * D + d]);
    }
    return u;
  }
  /* the slope of the surface at x (central differences over half a sample), from the last field() */
  slope(x) { const h = this.dx / 2; return x.map((_, d) => { const a = x.slice(), b = x.slice(); a[d] += h; b[d] -= h; return (this.at(a) - this.at(b)) / (2 * h); }); }
  energy() { let e = 0; for (let i = 0; i < this.M; i++) e += this.Zr[i] ** 2 + this.Zi[i] ** 2; return e; }
}
