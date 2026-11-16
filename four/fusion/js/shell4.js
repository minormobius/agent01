/* Burning in one shell of a 4D star, on the 4D network (net4.js, data4.js), for the evolution driver
   (atom/tools/evolve.mjs): fusion/js/shell.js's twin, with the same calls. No DOM.
   The network knows its rates relative to proton + proton's at a reference density; fusion/eps4.json carries, per
   strength, ρ_ref(T), the density at which the network's rates are absolute (eps4.mjs: k_pp,net(T) = n_b⟨σv⟩_abs), so a
   shell at ρ burns at rhoX = ρ/ρ_ref(T). The energy is the loss of atomic rest mass, M(Z, N) = Z m_H + N m_n − B, as
   eps4.mjs takes it: the neutrinos' share is not taken off (ours' pp chains lose ~2%), and there is no screening (its
   Debye form under the pinned law is not worked out; ours' raises the Sun's rates 5–15%).
   The short-lived species are found, not listed: at a shell's ρ, T a species whose destruction lifetime is under a
   year sits at its steady state for the structure's energy; the rest are held. Every species is evolved in a burn. */
import { model } from "./net4.js";
import { readFileSync } from "node:fs";

const MH = 938.783, MN = 939.565, MU = 1.66053906660e-27, MEVJ = 1.602176634e-13, YR = 3.15576e7;
const EPS4 = JSON.parse(readFileSync(new URL("../eps4.json", import.meta.url), "utf8"));

export function shell4(s, mass = "ladder") {
  const m = model(s), tab = EPS4.models[mass]?.[s]; if (!tab) throw new Error(`shell4: eps4.json has no ${mass} model at s = ${s}`);
  const NS = m.n, SPEC = m.species.map((x) => x.key), I = m.idx, ZS = m.species.map((x) => x.Z), AS = m.species.map((x) => x.A), Matom = m.species.map((x) => x.Z * MH + x.N * MN - x.B);
  const RS = m.rx.map((r) => ({ ...r, Q: r.react.reduce((t, [j, c]) => t + c * Matom[j], 0) - r.p.reduce((t, k) => t + Matom[I[k]], 0) }));
  const lT = EPS4.T.map(Math.log), lR = tab.rhoRef.map(Math.log);
  const rhoRef = (T) => { const x = Math.log(T); let i = 0; while (i < lT.length - 2 && lT[i + 1] < x) i++; const f = (x - lT[i]) / (lT[i + 1] - lT[i]); return Math.exp(lR[i] * (1 - f) + lR[i + 1] * f); };
  const constants = (T, rho) => m.constants(T, rho / rhoRef(T));
  const flux = (x, k, Y) => { let f = k; for (const [j, c] of x.react) f *= c === 1 ? Y[j] : Y[j] ** c; return f; };
  function rhsJ(Y, K, J) { const f = new Float64Array(NS); if (J) for (const row of J) row.fill(0);
    for (let i = 0; i < RS.length; i++) { const x = RS[i], k = K[i]; if (!k) continue; const w = flux(x, k, Y); for (const [q, v] of x.dY) f[q] += v * w;
      if (J) for (const [j, c] of x.react) { let d = k * c * (c === 1 ? 1 : Y[j] ** (c - 1)); for (const [l, n] of x.react) if (l !== j) d *= n === 1 ? Y[l] : Y[l] ** n; for (const [q, v] of x.dY) J[q][j] += v * d; } }
    return f; }
  const AB = Array.from({ length: NS }, () => new Float64Array(NS)), BB = new Float64Array(NS), XB = new Float64Array(NS);
  function linIn(A, b, n = NS) { for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (p !== c) { const t = A[c]; A[c] = A[p]; A[p] = t; const u = b[c]; b[c] = b[p]; b[p] = u; } const d = A[c][c]; if (!d) continue;
      const Ac = A[c]; for (let r = c + 1; r < n; r++) { const Ar = A[r], q = Ar[c] / d; if (!q) continue; for (let x = c; x < n; x++) Ar[x] -= q * Ac[x]; b[r] -= q * b[c]; } }
    const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let t = b[r]; const Ar = A[r]; for (let c = r + 1; c < n; c++) t -= Ar[c] * x[c]; x[r] = Ar[r] ? t / Ar[r] : 0; } return x; }
  /* the fast set at these constants: species whose destruction rate per nucleus, −∂f_i/∂Y_i, exceeds 1/yr */
  function fastSet(Y, K) { const J = Array.from({ length: NS }, () => new Float64Array(NS)); rhsJ(Y, K, J); const out = []; for (let i = 0; i < NS; i++) if (-J[i][i] > 1 / YR && i !== I["1-1"]) out.push(i); return out; }
  function steady(Y, K) { const Z = Float64Array.from(Y), F = fastSet(Y, K); if (!F.length) return Z; const J = Array.from({ length: NS }, () => new Float64Array(NS));
    for (let it = 0; it < 12; it++) { const f = rhsJ(Z, K, J), A = F.map((a) => Float64Array.from(F, (b) => J[a][b])), d = linIn(A, Float64Array.from(F, (a) => -f[a]), F.length);
      let mx = 0; F.forEach((a, i) => { const nz = Math.max(0, Z[a] + d[i]); mx = Math.max(mx, Math.abs(nz - Z[a]) / Math.max(nz, 1e-300)); Z[a] = nz; }); if (mx < 1e-10) break; }
    return Z; }
  const C = MEVJ / MU; // MeV per nucleon per second → W/kg
  function eps(rho, T, Y) { if (!(T > 1e6)) return { eps: 0, pp: 0, cno: 0 }; const K = constants(T, rho), Z = steady(Y, K); let e = 0, pp = 0;
    for (let i = 0; i < RS.length; i++) { if (!K[i]) continue; const w = flux(RS[i], K[i], Z) * RS[i].Q; e += w; if (RS[i].react.every(([j]) => ZS[j] <= 2)) pp += w; }
    return { eps: e * C, pp: pp * C, cno: (e - pp) * C }; } // "cno" here: everything past helium (captures on the ladder and its cycles)
  function dYdt(rho, T, Y) { const K = constants(T, rho), Z = steady(Y, K); return rhsJ(Z, K, null); }
  function burnK(K, Y0, dt) { const J = Array.from({ length: NS }, () => new Float64Array(NS)); let Y = Float64Array.from(Y0), t = 0, h = dt / 32, Eg = 0;
    for (let guard = 0; t < dt * (1 - 1e-12) && guard < 5000; guard++) { if (t + h > dt) h = dt - t; const X = Float64Array.from(Y); let ok = false;
      for (let it = 0; it < 15; it++) { const f = rhsJ(X, K, J); for (let i = 0; i < NS; i++) { const Ai = AB[i], Ji = J[i]; for (let j = 0; j < NS; j++) Ai[j] = (i === j ? 1 : 0) - h * Ji[j]; BB[i] = -(X[i] - Y[i] - h * f[i]); }
        const d = linIn(AB, BB); let mx = 0; for (let i = 0; i < NS; i++) { const nz = Math.max(0, X[i] + d[i]); if (nz > 1e-12 || X[i] > 1e-12) mx = Math.max(mx, Math.abs(nz - X[i]) / Math.max(nz, X[i], 1e-12)); X[i] = nz; } if (mx < 1e-9) { ok = true; break; } }
      let ch = 0; for (let i = 0; i < NS; i++) if (Y[i] > 1e-9) ch = Math.max(ch, Math.abs(X[i] - Y[i]) / Y[i]);
      if (!ok || ch > 0.25) { h /= 3; continue; }
      for (let i = 0; i < RS.length; i++) if (K[i]) Eg += flux(RS[i], K[i], X) * RS[i].Q * h;
      Y = X; t += h; h *= ch < 0.03 ? 2 : ch < 0.1 ? 1.3 : 1; }
    if (t < dt * (1 - 1e-9)) throw new Error(`shell4 burn: stalled at ${t.toExponential(2)} of ${dt.toExponential(2)} s`);
    return { Y, E: Eg * C }; }
  const burn = (rho, T, Y0, dt) => burnK(constants(T, rho), Y0, dt);
  const fromX = (Xm) => Float64Array.from(SPEC, (k, i) => (Xm[k] ?? 0) / AS[i]);
  return { s, mass, SPEC, NS, I, ZS, AS, RS, rhoRef, constants, eps, dYdt, steady, burn, burnK, fromX, massX: (Y) => Object.fromEntries(SPEC.map((k, i) => [k, Y[i] * AS[i]])) };
}
