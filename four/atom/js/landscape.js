/* ATOM⁴'s energy landscapes, no DOM: the poses of one rigid molecule against another, and the descent that finds a
   pose's nearest minimum. A pose is a turn exp(Ω) (Ω antisymmetric: one number per plane of turning, d(d−1)/2 of them,
   3 in 3D and 6 in 4D) and a move t (d numbers): 6 numbers for a pair in 3D, 10 in 4D. Shared by
   tools/pairsearch.mjs and the live search in chapter 11. */
/* the matrix exponential of an antisymmetric d × d matrix (scaling and squaring, Taylor) */
export function expm(W, d) {
  let n = 0; for (const v of W) n = Math.max(n, Math.abs(v)); const s = Math.max(0, Math.ceil(Math.log2(n * d + 1e-30)) + 1), k = 1 / 2 ** s;
  const A = W.map((v) => v * k), mul = (X, Y) => { const Z = new Array(d * d).fill(0); for (let i = 0; i < d; i++) for (let l = 0; l < d; l++) { const x = X[i * d + l]; if (x) for (let j = 0; j < d; j++) Z[i * d + j] += x * Y[l * d + j]; } return Z; };
  let E = Array.from({ length: d * d }, (_, i) => (i % (d + 1) === 0 ? 1 : 0)), T = E.slice();
  for (let m = 1; m <= 14; m++) { T = mul(T, A).map((v) => v / m); E = E.map((v, i) => v + T[i]); }
  for (let i = 0; i < s; i++) E = mul(E, E);
  return E;
}
export const planes = (d) => { const P = []; for (let a = 0; a < d; a++) for (let b = a + 1; b < d; b++) P.push([a, b]); return P; };
/* a pose: params = [ω (one per plane), t (d)], applied to the template turned first by R0 */
export function posed(tmpl, R0, params, d) {
  const P = planes(d), W = new Array(d * d).fill(0); P.forEach(([a, b], i) => { W[a * d + b] = params[i]; W[b * d + a] = -params[i]; });
  const M = expm(W, d), t = params.slice(P.length);
  return tmpl.map((p) => { const q = R0.map((row) => row.reduce((s, r, j) => s + r * p[j], 0)); return M.map((_, i) => i).filter((i) => i < d).map((i) => t[i] + q.reduce((s, v, j) => s + M[i * d + j] * v, 0)); });
}
/* a minimum of f by BFGS with numerical gradients and a backtracking line search, run until the gradient is gone
   (|g| < gtol), not merely until f stops changing: a descent that stalls on a ridge isn't a minimum, and counting
   stalls as minima invents basins. bfgsSteps yields each iterate ({ x, f }) so a page can animate the descent; bfgs
   runs it to the end */
export function* bfgsSteps(f, x0, iters = 300, gtol = 1e-6) {
  const n = x0.length, g = (x) => x.map((_, k) => { const h = 1e-5, a = x.slice(), b = x.slice(); a[k] += h; b[k] -= h; return (f(a) - f(b)) / (2 * h); });
  let x = x0.slice(), fx = f(x), gx = g(x), fresh = true, H = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  yield { x, f: fx, g: Math.hypot(...gx) };
  for (let it = 0; it < iters; it++) {
    const p = H.map((row) => -row.reduce((s, v, j) => s + v * gx[j], 0)); let a = 1, xn, fn; const slope = p.reduce((s, v, i) => s + v * gx[i], 0);
    if (slope >= 0) { H = H.map((row, i) => row.map((_, j) => (i === j ? 1 : 0))); continue; }
    for (;;) { xn = x.map((v, i) => v + a * p[i]); fn = f(xn); if (fn <= fx + 1e-4 * a * slope || a < 1e-8) break; a /= 2; }
    // a failed line search means the curvature estimate has gone bad: start it again along the gradient, and only
    // give up if the gradient itself can't go downhill
    if (fn > fx + 1e-4 * a * slope) { if (fresh) break; H = H.map((row, i) => row.map((_, j) => (i === j ? 1 : 0))); fresh = true; continue; }
    const gn = g(xn), s = xn.map((v, i) => v - x[i]), y = gn.map((v, i) => v - gx[i]), sy = s.reduce((t, v, i) => t + v * y[i], 0);
    if (sy > 1e-12) { const Hy = H.map((row) => row.reduce((t, v, j) => t + v * y[j], 0)), yHy = y.reduce((t, v, i) => t + v * Hy[i], 0); H = H.map((row, i) => row.map((v, j) => v + ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy)); }
    x = xn; fx = fn; gx = gn; fresh = false; const gn2 = Math.hypot(...gx); yield { x, f: fx, g: gn2 }; if (gn2 < gtol) break;
  }
  return { x, f: fx };
}
export function bfgs(f, x0, iters = 300, gtol = 1e-6) { let last; for (const s of bfgsSteps(f, x0, iters, gtol)) last = s; return last; }
export const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* a descent to the nearest minimum for molecules posed against a fixed first one, re-centred as it goes: the turn
   exp(Ω) is well behaved near Ω = 0 and badly conditioned once it has wound round (|Ω| of tens of radians), where
   BFGS crawls. So once a molecule's |Ω| passes 1.5 its turn so far is folded into its reference orientation and its
   Ω starts again from zero: the same pose, fresh numbers. x holds each moving molecule's pose numbers in turn, R0s
   their reference orientations; E takes the posed molecules' atoms (a list). Yields { R0s, x, f, g }; the last has
   g < gtol unless it ran out of steps */
export function* clusterSteps(E, tmpl, R0s, x0, d, iters = 900, gtol = 1e-6) {
  const nw = planes(d).length, np = nw + d, m = R0s.length, all = (R, y) => R.map((R0, i) => posed(tmpl, R0, y.slice(i * np, (i + 1) * np), d));
  let R = R0s.slice(), x = x0.slice(), used = 0, last = null;
  while (used < iters) {
    let wound = -1, k = 0;
    for (const st of bfgsSteps((y) => E(all(R, y)), x, iters - used, gtol)) {
      last = { R0s: R, x: st.x, f: st.f, g: st.g }; if (k++) { used++; yield last; }
      for (let i = 0; i < m && wound < 0; i++) if (Math.hypot(...st.x.slice(i * np, i * np + nw)) > 1.5) wound = i;
      if (wound >= 0) break;
    }
    if (wound < 0) { if (k <= 1) yield last; return; }
    x = last.x.slice(); R = R.slice();
    for (let i = 0; i < m; i++) {
      const w = x.slice(i * np, i * np + nw); if (Math.hypot(...w) < 1e-12) continue;
      const W = new Array(d * d).fill(0); planes(d).forEach(([a, b], j) => { W[a * d + b] = w[j]; W[b * d + a] = -w[j]; });
      const M = expm(W, d), Ri = R[i]; R[i] = Array.from({ length: d }, (_, r) => Array.from({ length: d }, (_, c) => Ri.reduce((t, row, l) => t + M[r * d + l] * row[c], 0)));
      for (let j = 0; j < nw; j++) x[i * np + j] = 0;
    }
  }
}
/* one molecule against a fixed one: a pair's pose. Yields { R0, x, f, g } */
export function* poseSteps(E, tmpl, R0, x0, d, iters = 900, gtol = 1e-6) {
  for (const st of clusterSteps((Bs) => E(Bs[0]), tmpl, [R0], x0, d, iters, gtol)) yield { R0: st.R0s[0], x: st.x, f: st.f, g: st.g };
}
export function descend(E, tmpl, R0, x0, d, iters, gtol) { let last; for (const s of poseSteps(E, tmpl, R0, x0, d, iters, gtol)) last = s; return last; }
