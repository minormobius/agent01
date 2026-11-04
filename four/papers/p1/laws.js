/* The charge law's first consequences, for paper 1's opening sections: one electron in a central potential V(r) in d
   dimensions, on its own log grid (so the grid's inner end can be moved: that's the test of a collapse). No DOM.
     levels(V, l, nr, d, grid)   the nr-th level (nr radial nodes) of angular momentum l, or null if it isn't bound
   The radial equation in x = ln r: y'' = f y, f = 2r²(V − ε) + (L + ½)², L = l + (d − 3)/2, as atom.js has it.
   Uses:
     - Gauss's law in 4D, V = −α/r²: scale-free. Below α = ½ nothing binds; above it the ground level runs off with the
       grid's inner end, ε ∝ −1/r₀² (the fall to the centre). There is no Bohr radius either way.
     - V = −1/r^p: only p = 1 keeps the levels of one shell together (2s with 2p, 3s with 3p and 3d), the degeneracy
       behind shells of 2, 8, 18 … in ours and 2, 8, 18, 32 … (2(l+1)²) in 4D. */

export function grid(r0 = 1e-5, rmax = 400, n = 4000) {
  const h = Math.log(rmax / r0) / (n - 1), R = Float64Array.from({ length: n }, (_, i) => r0 * Math.exp(i * h));
  return { R, h, n };
}

/* outward Numerov over the grid, to where the solution is deep in the forbidden region; the number of sign changes */
function nodes(f, h, n) {
  const h2 = (h * h) / 12; let y0 = 1e-30, y1 = 1e-30 * Math.exp(h * Math.sqrt(Math.max(f[0], 0))), c = 0;
  for (let i = 1; i < n - 1; i++) {
    if (h2 * f[i + 1] > 0.5) break; // deep in the forbidden region: no more nodes, and Numerov would fake some
    const y2 = (2 * y1 * (1 + 5 * h2 * f[i]) - y0 * (1 - h2 * f[i - 1])) / (1 - h2 * f[i + 1]);
    if ((y2 > 0) !== (y1 > 0) && y2 !== 0) c++;
    y0 = y1; y1 = y2; if (Math.abs(y1) > 1e200) { y0 *= 1e-200; y1 *= 1e-200; }
  }
  return c;
}

export function levels(V, l, nr, d, g = grid(), emin = null) {
  const { R, h, n } = g, Lh = l + (d - 3) / 2 + 0.5, f = new Float64Array(n), Vg = Float64Array.from(R, V);
  const count = (e) => { for (let i = 0; i < n; i++) f[i] = 2 * R[i] * R[i] * (Vg[i] - e) + Lh * Lh; return nodes(f, h, n); };
  if (count(-1e-12) <= nr) return null; // not even nr + 1 levels below zero: this one isn't bound (on this grid)
  let lo = emin ?? Math.min(...Vg.map((v, i) => v + (Lh * Lh - 0.25) / (2 * R[i] * R[i]))) * 1.01, hi = -1e-12;
  if (count(lo) > nr) return -Infinity; // the bound below was too high: deeper than the grid can hold
  for (let it = 0; it < 200 && hi - lo > 1e-13 * Math.max(1, Math.abs(lo)); it++) { const e = 0.5 * (lo + hi); if (count(e) > nr) hi = e; else lo = e; }
  return 0.5 * (lo + hi);
}

/* Gauss's law in 4D: the s ground level of −α/r² as the grid's inner end r₀ moves. Bound and settled would be a
   Bohr radius; null is no binding; a level scaling as 1/r₀² is the fall to the centre */
export function gaussLaw(alpha, r0s = [1e-3, 1e-4, 1e-5]) {
  return r0s.map((r0) => { const e = levels((r) => -alpha / (r * r), 0, 0, 4, grid(r0, 400, 6000)); return { r0, e, bound: e !== null, eTimesR0sq: e === null ? null : e * r0 * r0 }; });
}

/* the splittings within a shell for V = −1/r^p in d dimensions: (ε(2p) − ε(2s))/|ε(2s)| and (ε(3d) − ε(3s))/|ε(3s)| */
export function shellSplit(p, d = 4) {
  const V = (r) => -1 / r ** p, g = grid(1e-5, p < 1 ? 4000 : 600, 6000);
  const e = (l, nr) => levels(V, l, nr, d, g);
  const s2 = e(0, 1), p2 = e(1, 0), s3 = e(0, 2), d3 = e(2, 0);
  return { p, s2, p2, s3, d3, split2: (p2 - s2) / Math.abs(s2), split3: (d3 - s3) / Math.abs(s3) };
}
