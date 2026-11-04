/* PHASELAB, no DOM: two liquids un-mixing, in 3D and in 4D, by the same code.

   THE MODEL is Cahn–Hilliard: φ is the mixture's composition (+1 pure liquid A, −1 pure liquid B), its free energy
       F = ∫ ¼φ⁴ − ½aφ² + ½ε²|∇φ|²
   with a = 1 for an immiscible pair, A and B (below their critical temperature: two wells at φ = ±1, so a flat
   interface between them has pure A on one side and pure B on the other) and a < 0 for a pair that mixes (above it: one
   well at φ = 0, and any mixture stays mixed). Every preset but one uses the immiscible pair,
   (and a price on gradients, which is the price of interface), and φ flows down the gradient of its chemical potential
   μ = φ³ − aφ − ε²∇²φ, conserving the amount of each:
       ∂φ/∂t = ∇²μ.
   Nothing in that knows how many dimensions it's in except ∇². A flat interface is φ = tanh(x / √2ε) in any dimension,
   with surface tension σ = (2√2/3) ε per unit of interface (area in 3D, 3-volume in 4D).

   THE SOLVER is spectral, on a periodic grid of N per side (spacing 1), D = 3 or 4, by WAVELAB's 1D FFT batched over
   any number of axes. Each step is semi-implicit and stabilised (Eyre's splitting: the stiff ε²k⁴ and a stabiliser Ak²
   implicit, the rest explicit), which is stable for any step when A ≥ 2:
       (1 + dt A k² + dt ε² k⁴) φ̂' = (1 + dt A k²) φ̂ − dt k² F[φ³ − aφ].
   Two FFTs a step: F[φ³ − aφ] forward, φ̂' back. */
import { makeFFT } from "../../wavelab/js/fft.js";

/* the FFT along every axis of a D-dimensional grid, batched: along axis a ≥ 1 each butterfly is done for every line at
   once, so the inner loop runs over N^a consecutive numbers (WAVELAB's line-at-a-time transform, generalised to 4D,
   took ~100 ms for 32⁴; this takes a fraction). Axis 0's lines are contiguous already: they go one at a time. */
export function makeBatchFFT(N, D) {
  const L = Math.log2(N), f1 = makeFFT(N), M = N ** D, rev = new Uint32Array(N), cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
  for (let i = 0; i < N; i++) { let r = 0; for (let b = 0; b < L; b++) r |= ((i >> b) & 1) << (L - 1 - b); rev[i] = r; }
  for (let k = 0; k < N / 2; k++) { cs[k] = Math.cos((2 * Math.PI * k) / N); sn[k] = Math.sin((2 * Math.PI * k) / N); }
  return function (re, im, inverse = false) {
    for (let l = 0; l < M; l += N) f1(re, im, inverse, l, 1);
    const sg = inverse ? 1 : -1;
    for (let a = 1; a < D; a++) {
      const st = N ** a, blk = st * N;
      // tiled: C columns at a time get every stage while they're in cache (32 × 64 complex numbers, 32 kB)
      const C = Math.min(st, 64);
      for (let base = 0; base < M; base += blk) for (let l0 = 0; l0 < st; l0 += C) {
        const l1 = l0 + C;
        for (let i = 0; i < N; i++) { const j = rev[i]; if (j <= i) continue; const x = base + i * st, y = base + j * st; for (let lo = l0; lo < l1; lo++) { let t = re[x + lo]; re[x + lo] = re[y + lo]; re[y + lo] = t; t = im[x + lo]; im[x + lo] = im[y + lo]; im[y + lo] = t; } }
        for (let size = 2; size <= N; size <<= 1) {
          const half = size >> 1, step = N / size;
          for (let j = 0; j < half; j++) {
            const c = cs[j * step], s = sg * sn[j * step];
            for (let i = 0; i < N; i += size) {
              const x = base + (i + j) * st, y = x + half * st;
              for (let lo = l0; lo < l1; lo++) { const br = re[y + lo], bi = im[y + lo], tr = br * c - bi * s, ti = br * s + bi * c; re[y + lo] = re[x + lo] - tr; im[y + lo] = im[x + lo] - ti; re[x + lo] += tr; im[x + lo] += ti; }
            }
          }
        }
      }
    }
  };
}

export const EPS = 1, A = 2, SIGMA = (2 * Math.SQRT2 / 3) * EPS;
/* a small seeded generator, so a run can be repeated */
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function makeCH(D, N) {
  const M = N ** D, fft = makeBatchFFT(N, D), k2 = new Float64Array(M);
  for (let p = 0; p < M; p++) { let q = p, s = 0; for (let a = 0; a < D; a++) { const n = q % N, m = n <= N / 2 ? n : n - N; s += ((2 * Math.PI * m) / N) ** 2; q = Math.floor(q / N); } k2[p] = s; }
  const ch = { a: 1, D, N, M, k2, phi: new Float64Array(M), hr: new Float64Array(M), hi: new Float64Array(M), wr: new Float64Array(M), wi: new Float64Array(M), t: 0, steps: 0, fft };
  return ch;
}
/* set φ (a function of the cell's coordinates, or an array) and take its transform */
export function setPhi(ch, f) {
  const { D, N, M, phi } = ch, c = new Array(D);
  for (let p = 0; p < M; p++) { let q = p; for (let a = 0; a < D; a++) { c[a] = q % N; q = Math.floor(q / N); } phi[p] = typeof f === "function" ? f(c) : f[p]; }
  ch.hr.set(phi); ch.hi.fill(0); ch.fft(ch.hr, ch.hi, false); ch.t = 0; ch.steps = 0;
  return ch;
}
export function step(ch, dt) {
  const { M, phi, hr, hi, wr, wi, k2, a } = ch;
  for (let p = 0; p < M; p++) { const f = phi[p]; wr[p] = f * f * f - a * f; wi[p] = 0; }
  ch.fft(wr, wi, false);
  for (let p = 0; p < M; p++) {
    const k = k2[p], den = 1 + dt * A * k + dt * EPS * EPS * k * k, num = 1 + dt * A * k;
    hr[p] = (num * hr[p] - dt * k * wr[p]) / den; hi[p] = (num * hi[p] - dt * k * wi[p]) / den;
    wr[p] = hr[p]; wi[p] = hi[p];
  }
  ch.fft(wr, wi, true);
  for (let p = 0; p < M; p++) phi[p] = wr[p] / M;
  ch.t += dt; ch.steps++;
}
/* the step size a run takes as it coarsens: small while the pattern is fine, larger as it grows (the scheme is stable
   for any step; this keeps it accurate where it matters) */
export const dtAt = (t) => Math.min(4, 0.3 + 0.02 * t);
/* droplets: only where they settle matters, not how fast, so they step boldly */
export const dtDrop = (t) => Math.min(6, 1 + 0.05 * t);

/* μ = φ³ − aφ − ε²∇²φ, everywhere (one more transform pair) */
export function mu(ch) {
  const { M, phi, hr, hi, wr, wi, k2, a } = ch, out = new Float64Array(M);
  for (let p = 0; p < M; p++) { const f = phi[p]; wr[p] = f * f * f - a * f; wi[p] = 0; }
  ch.fft(wr, wi, false);
  for (let p = 0; p < M; p++) { wr[p] += EPS * EPS * k2[p] * hr[p]; wi[p] += EPS * EPS * k2[p] * hi[p]; }
  ch.fft(wr, wi, true);
  for (let p = 0; p < M; p++) out[p] = wr[p] / M;
  return out;
}

/* the free energy F = Σ ¼φ⁴ − ½aφ² + ¼a² + ½ε²|∇φ|² (the constant makes it ¼(φ² − 1)² for a = 1, zero for pure
   liquid; the gradient part spectrally, from φ̂): the scheme never raises it */
export function energy(ch) {
  let f = 0; for (let p = 0; p < ch.M; p++) { const v = ch.phi[p]; f += 0.25 * v ** 4 - 0.5 * ch.a * v * v + 0.25 * ch.a * ch.a; }
  let g = 0; for (let p = 0; p < ch.M; p++) g += ch.k2[p] * (ch.hr[p] ** 2 + ch.hi[p] ** 2);
  return f + (0.5 * EPS * EPS * g) / ch.M;
}

/* WHAT TO MEASURE
   domain size  L = 2π / ⟨k⟩, the structure factor |φ̂|²'s mean wavenumber
   interface    S_V: interface measure per unit volume (area per volume in 3D, 3-volume per 4-volume in 4D), as
                ∫|∇φ|/2 (a sharp interface from −1 to +1 contributes exactly its measure); and the fraction of all the
                stuff that sits in an interface (|φ| < 0.6)
   droplets     the minority liquid's connected pieces (periodic, face neighbours): how many, and the largest one's
                share of it (1: one connected network; small: droplets) */
export function stats(ch) {
  const { D, N, M, phi, hr, hi, k2 } = ch;
  let sk = 0, s0 = 0, mean = 0, inter = 0, grad = 0;
  for (let p = 1; p < M; p++) { const S = hr[p] * hr[p] + hi[p] * hi[p]; sk += Math.sqrt(k2[p]) * S; s0 += S; }
  const stride = Array.from({ length: D }, (_, a) => N ** a);
  for (let p = 0; p < M; p++) {
    const f = phi[p]; mean += f; if (Math.abs(f) < 0.6) inter++;
    let g2 = 0, q = p; for (let a = 0; a < D; a++) { const n = q % N; q = Math.floor(q / N); const up = n === N - 1 ? p - (N - 1) * stride[a] : p + stride[a], dn = n === 0 ? p + (N - 1) * stride[a] : p - stride[a]; g2 += ((phi[up] - phi[dn]) / 2) ** 2; }
    grad += Math.sqrt(g2);
  }
  mean /= M;
  let ms = 0; for (let p = 0; p < M; p++) ms += (phi[p] - mean) ** 2;
  return { t: ch.t, rms: Math.sqrt(ms / M), L: s0 > 0 ? (2 * Math.PI) / (sk / s0) : Infinity, mean, SV: grad / 2 / M, interFrac: inter / M, ...clusters(ch, mean < 0 ? 1 : -1) };
}
/* the pieces of the liquid with sign sg (union–find, periodic, face neighbours) */
export function clusters(ch, sg) {
  const { D, N, M, phi } = ch, par = new Int32Array(M).fill(-1), stride = Array.from({ length: D }, (_, a) => N ** a);
  const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let p = 0; p < M; p++) if (phi[p] * sg > 0) par[p] = p;
  for (let p = 0; p < M; p++) {
    if (par[p] < 0) continue; let q = p;
    for (let a = 0; a < D; a++) { const n = q % N; q = Math.floor(q / N); const nb = n === N - 1 ? p - (N - 1) * stride[a] : p + stride[a]; if (par[nb] >= 0) { const ra = find(p), rb = find(nb); if (ra !== rb) par[ra] = rb; } }
  }
  const size = new Map(); let tot = 0;
  for (let p = 0; p < M; p++) if (par[p] >= 0) { const r = find(p); size.set(r, (size.get(r) || 0) + 1); tot++; }
  let big = 0, pieces = 0; const all = []; for (const v of size.values()) { if (v >= 2) { pieces++; all.push(v); } big = Math.max(big, v); }
  all.sort((a, b) => b - a);
  return { pieces, largest: tot ? big / tot : 0, minority: tot / M, sizes: all.slice(0, 3) };
}

/* starting states */
export function quench(ch, phi0, seed = 1, amp = 0.05) { const r = rng(seed); return setPhi(ch, () => phi0 + amp * (2 * r() - 1)); }
/* how much A the B-rich liquid holds dissolved, as a fraction (φ = −1 is none; −0.9 is 5%), averaged far from any
   interface; and how much it must hold for a droplet of A of radius R to be in balance with it: the composition where
   f'(φ) = φ³ − φ equals the droplet's μ = (d − 1)σ / (Δφ R) (Gibbs–Thomson, Δφ = 2), solved by Newton from pure B.
   A flat interface (R → ∞) needs none: this pair is fully immiscible; only curvature dissolves anything */
export function dissolved(ch) { let s = 0, n = 0; for (let p = 0; p < ch.M; p++) if (ch.phi[p] < -0.8) { s += ch.phi[p]; n++; } return n ? (s / n + 1) / 2 : 0; }
export function need(D, R) { const m = ((D - 1) * SIGMA) / (2 * R); let x = -1; for (let i = 0; i < 40; i++) x -= (x * x * x - x - m) / (3 * x * x - 1); return (x + 1) / 2; }
/* a ball of the + liquid of radius R in the − one, centred, with the flat interface's own profile */
/* (in a liquid already a little over-saturated, bg above −1: in a box this small a droplet in pure liquid dissolves away
   entirely, the liquid round it absorbing it, and there's no equilibrium to measure) */
export function droplet(ch, R, bg = -0.9) { const c = ch.N / 2; return setPhi(ch, (x) => { const u = Math.tanh((R - Math.hypot(...x.map((v) => v - c))) / (Math.SQRT2 * EPS)); return bg + ((u + 1) / 2) * (1 - bg); }); }
/* the chemical potential far from any interface (the cells with |φ| > 0.9 and |μ| measured there): at equilibrium μ is
   the same everywhere, so this is it; and the radius a + piece of n cells would have as a ball */
export function farMu(ch) { const m = mu(ch); let s = 0, n = 0; for (let p = 0; p < ch.M; p++) if (ch.phi[p] < -0.8) { s += m[p]; n++; } return n ? s / n : 0; }
export const radiusOf = (D, cells) => (D === 3 ? Math.cbrt(cells / ((4 / 3) * Math.PI)) : Math.sqrt(Math.sqrt(cells / (Math.PI ** 2 / 2))));
/* the volume of a d-ball, and the radius of a ball of the + liquid that holds what φ holds above the background */
export const ballVol = (D, R) => (D === 3 ? (4 / 3) * Math.PI * R ** 3 : (Math.PI ** 2 / 2) * R ** 4);
export function dropRadius(ch, bg) { let v = 0; for (let p = 0; p < ch.M; p++) v += (ch.phi[p] - bg) / (1 - bg); return ch.D === 3 ? Math.cbrt(v / ((4 / 3) * Math.PI)) : Math.sqrt(Math.sqrt(v / (Math.PI ** 2 / 2))); }
