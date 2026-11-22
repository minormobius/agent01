/* Relaxation (Henyey) for a star's structure: the same equations and physics as mainseq.js star() (its exported
   `equations`: the right-hand side and the photosphere), solved on a mesh all at once by Newton from a previous model,
   where star() shoots from the centre and the surface to a meeting point. Shooting can't follow a star whose envelope
   swells past the main sequence (evolve4-16 to -19 stalled at 15.112 Gyr); relaxation, the stellar codes' way, can.
   No DOM.
     · unknowns at every node k: ln r, ln P, ln T and ℓ = L/L₀ (L₀ the guess's surface luminosity, for scaling);
     · the mesh uniform in s = ln m − ln(M − m + δ), δ the mass above the photosphere (the guess's column at τ = ⅔): the
       nodes crowd geometrically toward both the centre and the surface, as shooting's integrator does, and in s the
       solution is smooth at both ends (ln r ≈ (1/d) ln m inward, ln P ≈ ln(M − m + δ) outward);
     · each interval: y_{k+1} − y_k = ½Δs (w_k F_k + w_{k+1} F_{k+1}), F = star()'s dy/dm (L scaled by L₀), w = dm/ds
       (the trapezoid rule, second order);
     · the inner edge m₀ = 10⁻⁸ M (star()'s): r from the node's own density, r^d = d m₀/(S ρ), and L = ε m₀; the outer
       edge m = M: P and T the photosphere's for the node's R and L (star()'s `surface`). No envelope (`opts.envelope`)
       yet: that is ours on OPAL, and a star that has one is refused;
     · Newton on the banded system (4 unknowns a node; partial pivoting within the band), each node's 4×4 Jacobian by
       differences, steps damped to 0.5 in any ln and a line search on the residual.
   relax(opts, guessProf, { N, tol, maxIt }) → star()'s shape: { ok, p, Pc, Tc, R, L, prof, res, it }. */
import { equations } from "./mainseq.js";

export function relax(opts, guess, { N = 1000, tol = 1e-9, maxIt = 40 } = {}) {
  const { d, M, G } = opts; if (opts.envelope) return { ok: false, why: "relax: no envelope boundary yet" };
  const { S, ff, rhs, surface, cAt } = equations(opts), eps = opts.eps;
  const g = guess.filter((q) => q.m > 0 && q.r > 0 && q.P > 0 && q.T > 0).sort((a, b) => a.m - b.m), last = g.at(-1);
  if (g.length < 10 || Math.abs(last.m / M - 1) > 1e-6) return { ok: false, why: "relax: the guess must run to the surface" };
  const L0 = last.L, gs = (G * M * (ff ? ff(M) : 1)) / (last.r * last.r), delta = Math.max((last.P * S * last.r ** (d - 1)) / gs, 1e-30 * M);
  const sOf = (m) => Math.log(m) - Math.log(M - m + delta), m0 = 1e-8 * M, s0 = sOf(m0), s1 = sOf(M);
  // the mesh: m from s by bisection (s is monotone in m)
  const mOf = (s) => { let lo = m0 * 0.5, hi = M; for (let i = 0; i < 200; i++) { const mid = 0.5 * (lo + hi); if (sOf(mid) < s) lo = mid; else hi = mid; } return 0.5 * (lo + hi); };
  const ms = new Float64Array(N + 1); for (let k = 0; k <= N; k++) ms[k] = k === 0 ? m0 : k === N ? M : mOf(s0 + ((s1 - s0) * k) / N);
  const ds = (s1 - s0) / N, w = Float64Array.from(ms, (m) => (m * (M - m + delta)) / (M + delta)); // dm/ds
  // the guess on the mesh: ln r, ln P, ln T and ℓ, linear in s (the guess's own points crowd at both ends too)
  const gsv = g.map((q) => sOf(q.m)), y = new Float64Array(4 * (N + 1));
  for (let k = 0, j = 0; k <= N; k++) { const s = sOf(ms[k]); while (j < g.length - 2 && gsv[j + 1] < s) j++;
    const a = g[j], b = g[j + 1], t = Math.max(0, Math.min(1, (s - gsv[j]) / (gsv[j + 1] - gsv[j] || 1)));
    let lr = Math.log(a.r) * (1 - t) + Math.log(b.r) * t; if (s < gsv[0]) lr = Math.log(g[0].r) + Math.log(ms[k] / g[0].m) / d;
    y[4 * k] = lr; y[4 * k + 1] = Math.log(a.P) * (1 - t) + Math.log(b.P) * t; y[4 * k + 2] = Math.log(a.T) * (1 - t) + Math.log(b.T) * t;
    y[4 * k + 3] = s < gsv[0] ? (g[0].L * ms[k]) / g[0].m / L0 : (a.L * (1 - t) + b.L * t) / L0; }
  const Fof = (k, yk) => { const f = rhs(ms[k], [yk[0], yk[1], yk[2], yk[3] * L0]); return [f[0], f[1], f[2], f[3] / L0]; };
  const inner = (yk) => { const rho = Math.exp(yk[1]) > 0 ? rhoOfNode(yk) : NaN; return [yk[0] - Math.log((d * m0) / (S * rho)) / d, yk[3] - (eps(rho, Math.exp(yk[2]), m0, Math.exp(yk[1])) * m0) / L0]; };
  const rhoOfNode = (yk) => { const f = rhs(m0, [yk[0], yk[1], yk[2], 0]); return 1 / (S * Math.exp(d * yk[0]) * f[0]); }; // ρ from dr/dm's own ρ (same EOS)
  const outer = (yk) => { const sf = surface(yk[0], Math.log(yk[3] * L0)); return [yk[1] - sf[1], yk[2] - sf[2]]; };
  const H = 1e-7;
  function system(y, wantJ) {
    const n = 4 * (N + 1), Rv = new Float64Array(n), F = [], JF = [];
    for (let k = 0; k <= N; k++) { const yk = Array.from(y.subarray(4 * k, 4 * k + 4)), f = Fof(k, yk); F.push(f);
      if (wantJ) { const J = [0, 1, 2, 3].map((v) => { const q = yk.slice(), h = v === 3 ? H * Math.max(Math.abs(yk[3]), 1e-3) : H; q[v] += h; const fq = Fof(k, q); return fq.map((x, i) => (x - f[i]) / h); }); JF.push(J); } }
    const rows = wantJ ? [] : null, put = (row, col, v) => { if (v !== 0) rows[row].set(col, (rows[row].get(col) ?? 0) + v); };
    if (wantJ) for (let i = 0; i < n; i++) rows.push(new Map());
    const bc = (fn, yk, r0, c0) => { const b0 = fn(yk); Rv[r0] = b0[0]; Rv[r0 + 1] = b0[1]; if (!wantJ) return;
      for (let v = 0; v < 4; v++) { const q = yk.slice(), h = v === 3 ? H * Math.max(Math.abs(yk[3]), 1e-3) : H; q[v] += h; const bq = fn(q); for (let i = 0; i < 2; i++) put(r0 + i, c0 + v, (bq[i] - b0[i]) / h); } };
    bc(inner, Array.from(y.subarray(0, 4)), 0, 0);
    for (let k = 0; k < N; k++) { const r0 = 2 + 4 * k;
      for (let v = 0; v < 4; v++) { Rv[r0 + v] = y[4 * (k + 1) + v] - y[4 * k + v] - 0.5 * ds * (w[k] * F[k][v] + w[k + 1] * F[k + 1][v]);
        if (wantJ) { put(r0 + v, 4 * k + v, -1); put(r0 + v, 4 * (k + 1) + v, 1);
          for (let u = 0; u < 4; u++) { put(r0 + v, 4 * k + u, -0.5 * ds * w[k] * JF[k][u][v]); put(r0 + v, 4 * (k + 1) + u, -0.5 * ds * w[k + 1] * JF[k + 1][u][v]); } } } }
    bc(outer, Array.from(y.subarray(4 * N, 4 * N + 4)), 4 * N + 2, 4 * N);
    return { Rv, rows };
  }
  const norm = (R) => { let s = 0; for (const x of R) { if (!Number.isFinite(x)) return Infinity; s = Math.max(s, Math.abs(x)); } return s; };
  let sys = system(y, true), res = norm(sys.Rv), it = 0;
  for (; it < maxIt; it++) {
    if (!(res < Infinity)) return { ok: false, why: "relax: the guess gives no finite residual", it };
    if (res < tol) break;
    const dx = bandSolve(sys.rows, Float64Array.from(sys.Rv, (v) => -v)); if (!dx) return { ok: false, why: "relax: singular", it, res };
    let big = 0; for (let i = 0; i < dx.length; i++) big = Math.max(big, Math.abs(i % 4 === 3 ? dx[i] / Math.max(Math.abs(y[i]), 1e-3) : dx[i]));
    let lam = Math.min(1, 0.5 / big), next = null;
    for (; lam > 1e-4; lam /= 2) { const q = Float64Array.from(y, (v, i) => v + lam * dx[i]), s2 = system(q, false), r2 = norm(s2.Rv); if (r2 < res || (big * lam < 1e-10)) { y.set(q); next = r2; break; } }
    if (next == null) return { ok: false, why: "relax: stalled", it, res };
    if (big * lam < 1e-11) { res = next; break; }
    sys = system(y, true); res = norm(sys.Rv);
  }
  const prof = []; for (let k = 0; k <= N; k++) prof.push({ m: ms[k], r: Math.exp(y[4 * k]), P: Math.exp(y[4 * k + 1]), T: Math.exp(y[4 * k + 2]), L: y[4 * k + 3] * L0 });
  const p = [y[1], y[2], y[4 * N], Math.log(y[4 * N + 3] * L0)];
  return { ok: res < Math.max(tol * 1e3, 1e-6), it, res, p, Pc: Math.exp(p[0]), Tc: Math.exp(p[1]), R: Math.exp(p[2]), L: Math.exp(p[3]), prof, relax: true };
}

/* Gaussian elimination with partial pivoting on sparse rows (Map col → value); the system is banded (a node couples only
   to its neighbours), so each column has a handful of candidates below the diagonal */
function bandSolve(rows, b) {
  const n = b.length; b = Float64Array.from(b); const A = rows.slice();
  for (let c = 0; c < n; c++) { let p = -1, best = 0; for (let r = c; r < Math.min(n, c + 12); r++) { const v = Math.abs(A[r].get(c) ?? 0); if (v > best) { best = v; p = r; } }
    if (p < 0) return null; if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; }
    const Ac = A[c], d = Ac.get(c);
    for (let r = c + 1; r < Math.min(n, c + 12); r++) { const v = A[r].get(c); if (!v) continue; const q = v / d; for (const [col, x] of Ac) if (col > c) A[r].set(col, (A[r].get(col) ?? 0) - q * x); A[r].delete(c); b[r] -= q * b[c]; } }
  const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let t = b[r]; for (const [col, v] of A[r]) if (col > r) t -= v * x[col]; x[r] = t / A[r].get(r); } return x;
}
