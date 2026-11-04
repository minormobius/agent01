/* WAVELAB's FFT, no DOM: radix-2, complex, in place, along every axis of a 2D or 3D grid (index x + N(y + N z)).
   Forward is Σ f e^{−ikx}; inverse is Σ F e^{+ikx}, unscaled (the caller divides by the number of points). A line is
   transformed where it lies (an offset and a stride into the grid), never copied out. */
export function makeFFT(n) {
  const L = Math.log2(n); if (L % 1) throw new Error("FFT length must be a power of two");
  const rev = new Uint32Array(n), cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
  for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < L; b++) r |= ((i >> b) & 1) << (L - 1 - b); rev[i] = r; }
  for (let k = 0; k < n / 2; k++) { cs[k] = Math.cos((2 * Math.PI * k) / n); sn[k] = Math.sin((2 * Math.PI * k) / n); }
  return function fft(re, im, inverse = false, off = 0, st = 1) {
    for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { const a = off + i * st, b = off + j * st; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
    const sg = inverse ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size, hs = half * st;
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const c = cs[k], s = sg * sn[k];
        for (let i = 0; i < n; i += size) {
          const a = off + (i + j) * st, b = a + hs, br = re[b], bi = im[b], tr = br * c - bi * s, ti = br * s + bi * c;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
  };
}
/* the FFT of a grid along each of its D axes (any D: WAVELAB uses 2 and 3, PHASELAB 3 and 4), N per side: each line copied out, transformed, copied back
   (in-place strided lines measured slower: a stride of N² through the grid is cache-hostile) */
export function makeGridFFT(N, D) {
  const f = makeFFT(N), lr = new Float64Array(N), li = new Float64Array(N), strides = Array.from({ length: D }, (_, a) => N ** a);
  const bases = strides.map((st) => { const b = new Uint32Array(N ** (D - 1)); let n = 0; for (let p = 0; p < N ** D; p++) if (Math.floor(p / st) % N === 0) b[n++] = p; return b; });
  return function gridFFT(re, im, inverse = false) {
    for (let a = 0; a < D; a++) {
      const st = strides[a], B = bases[a];
      for (let l = 0; l < B.length; l++) {
        const base = B[l];
        for (let i = 0, p = base; i < N; i++, p += st) { lr[i] = re[p]; li[i] = im[p]; }
        f(lr, li, inverse);
        for (let i = 0, p = base; i < N; i++, p += st) { re[p] = lr[i]; im[p] = li[i]; }
      }
    }
  };
}
