/* The 4D burning network (data4.js, baked by tools/rates4.mjs), run as the widget runs ours: backward Euler with Newton
   and an analytic Jacobian, two-body rates k(T) (interpolated in log T) and decays λ, Y per nucleon. No DOM.
   Stages: 1 hydrogen with helium at the Sun's pace (found here: half the hydrogen gone in 4.6 Gyr, our Sun's centre's
   pace, which is how the book compares worlds), 2 the helium core where hydrogen burning leaves helium (at its rate-matched
   ignition, nuclei.mjs capture), 3 ceryllium + ceryllium where helium burning leaves ceryllium-8 (0.27 GK, cerburn). */
import { NET4, TGRID } from "../data4.js";

const YR = 3.15576e7;
export const STRENGTHS = Object.keys(NET4).map(Number);
const lerp = (k, T) => { const lt = Math.log(T), g = TGRID.map(Math.log); let i = 0; while (i < g.length - 2 && g[i + 1] < lt) i++; const f = Math.min(1, Math.max(0, (lt - g[i]) / (g[i + 1] - g[i]))), a = Math.max(k[i], 1e-300), b = Math.max(k[i + 1], 1e-300); return Math.exp(Math.log(a) * (1 - f) + Math.log(b) * f); };

export function model(s) {
  const M = NET4[s], idx = Object.fromEntries(M.species.map((x, i) => [x.key, i])), n = M.species.length;
  const rx = M.reactions.map((r, id) => { const cnt = {}; for (const x of r.r) cnt[x] = (cnt[x] ?? 0) + 1; const net = {}; for (const x of r.r) net[x] = (net[x] ?? 0) - 1; for (const x of r.p) net[x] = (net[x] ?? 0) + 1;
    const fact = Object.values(cnt).reduce((p, c) => p * (c === 2 ? 2 : c === 3 ? 6 : 1), 1);
    return { id, ...r, react: Object.entries(cnt).map(([k, c]) => [idx[k], c]), dY: Object.entries(net).filter(([, v]) => v).map(([k, v]) => [idx[k], v]), sym: fact }; });
  const constants = (T, rhoX = 1, mult = null) => rx.map((r) => { let k = r.lam != null ? r.lam : (lerp(r.k, T) * rhoX) / r.sym; if (mult?.[r.id]) k *= mult[r.id]; return k; });
  const fluxes = (Y, k) => rx.map((r, i) => { let f = k[i]; for (const [j, c] of r.react) f *= c === 1 ? Y[j] : Y[j] ** c; return f; });
  function rhs(Y, k, f, J) { f.fill(0); for (const row of J) row.fill(0);
    rx.forEach((r, i) => { let w = k[i]; for (const [j, c] of r.react) w *= c === 1 ? Y[j] : Y[j] ** c; for (const [q, v] of r.dY) f[q] += v * w;
      for (const [j, c] of r.react) { let d = k[i] * c * (c === 1 ? 1 : Y[j] ** (c - 1)); for (const [l, m] of r.react) if (l !== j) d *= m === 1 ? Y[l] : Y[l] ** m; for (const [q, v] of r.dY) J[q][j] += v * d; } }); }
  function solve(A, b) { const N = b.length; for (let c = 0; c < N; c++) { let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; const d = A[c][c]; if (!d) continue; for (let r = c + 1; r < N; r++) { const q = A[r][c] / d; if (!q) continue; for (let x = c; x < N; x++) A[r][x] -= q * A[c][x]; b[r] -= q * b[c]; } }
    const x = new Float64Array(N); for (let r = N - 1; r >= 0; r--) { let s = b[r]; for (let c = r + 1; c < N; c++) s -= A[r][c] * x[c]; x[r] = A[r][r] ? s / A[r][r] : 0; } return x; }
  const toY = (X) => { const Y = new Float64Array(n); for (const [k, x] of Object.entries(X)) if (idx[k] != null) Y[idx[k]] = x / M.species[idx[k]].A; return Y; };
  const toX = (Y) => Array.from(Y, (y, i) => y * M.species[i].A);
  function run({ T, rhoX = 1, X0, fuel, until = 1e-3, tmax = 1e22, mult = null, maxSteps = 5000 }) {
    const k = constants(T, rhoX, mult), f = new Float64Array(n), J = Array.from({ length: n }, () => new Float64Array(n)), fi = idx[fuel];
    let Y = toY(X0), t = 0, dt = 1e-6; const Y0 = Y[fi], snaps = [{ t: 0, Y: Float64Array.from(Y) }];
    for (let step = 0; step < maxSteps && Y[fi] > until * Y0 && t < tmax; step++) {
      const X = Float64Array.from(Y); let ok = false;
      for (let it = 0; it < 12; it++) { rhs(X, k, f, J); const A = J.map((row, i) => Array.from(row, (v, j) => (i === j ? 1 : 0) - dt * v)), b = Array.from(X, (v, i) => -(v - Y[i] - dt * f[i])), d = solve(A, b);
        let mx = 0; for (let i = 0; i < n; i++) { X[i] = Math.max(0, X[i] + d[i]); mx = Math.max(mx, Math.abs(d[i]) / Math.max(X[i], 1e-12)); } if (mx < 1e-8) { ok = true; break; } }
      let ch = 0; for (let i = 0; i < n; i++) if (X[i] > 1e-6 || Y[i] > 1e-6) ch = Math.max(ch, Math.abs(X[i] - Y[i]) / Math.max(X[i], Y[i]));
      if (!ok || ch > 0.25) { dt /= 3; continue; }
      Y = X; t += dt; snaps.push({ t, Y: Float64Array.from(Y) }); dt *= ch < 0.02 ? 1.6 : ch < 0.08 ? 1.2 : 1;
    }
    return { k, snaps, t, Y, T, fuel };
  }
  /* the temperature at which half the hydrogen goes in 4.6 Gyr (our Sun's centre's pace) */
  function sunPace(X0, opts = {}) {
    const half = (T) => { const r = run({ T, X0, fuel: "1-1", until: 0.5, ...opts }); return r.Y[idx["1-1"]] > 0.5 * toY(X0)[idx["1-1"]] * 1.001 ? Infinity : r.t; };
    let lo = 1e6, hi = 4e8; for (let i = 0; i < 40; i++) { const m = Math.sqrt(lo * hi); if (half(m) > 4.6e9 * YR) lo = m; else hi = m; } return Math.sqrt(lo * hi);
  }
  return { M, idx, rx, species: M.species, constants, fluxes, run, sunPace, toY, toX, n };
}
