/* Burning in one shell of a 4D star, on the 4D network (net4.js, data4.js), for the evolution driver
   (atom/tools/evolve.mjs): fusion/js/shell.js's twin, with the same calls. No DOM.
   The network knows its rates relative to proton + proton's at a reference density; fusion/eps4.json carries, per
   strength, ρ_ref(T), the density at which the network's rates are absolute (eps4.mjs: k_pp,net(T) = n_b⟨σv⟩_abs), so a
   shell at ρ burns at rhoX = ρ/ρ_ref(T). The energy is the loss of atomic rest mass, M(Z, N) = Z m_H + N m_n − B, as
   eps4.mjs takes it: the neutrinos' share is not taken off (ours' pp chains lose ~2%). Screening (`{ screen: true }`) is
   atom/js/screen.js's under the pinned 1/r: weak screening, H = 0.605 Z₁Z₂αħc k_D, or the ion sphere where that would
   overshoot, from the shell's own composition (fully ionized); a capture of three nuclei takes it pairwise as they merge.
   Off by default, so the committed runs stand; ours' (shell.js) raises the Sun's rates 5–15%.
   The short-lived species are found, not listed: at a shell's ρ, T a species whose destruction lifetime is under a
   year sits at its steady state for the structure's energy; the rest are held. Every species is evolved in a burn. */
import { model } from "./net4.js";
import { plasma } from "../../atom/js/screen.js";
import { readFileSync } from "node:fs";

const MH = 938.783, MN = 939.565, MU = 1.66053906660e-27, MEVJ = 1.602176634e-13, YR = 3.15576e7;
const EPS4 = JSON.parse(readFileSync(new URL("../eps4.json", import.meta.url), "utf8"));

export function shell4(s, mass = "ladder", { screen = false } = {}) {
  const m = model(s), tab = EPS4.models[mass]?.[s]; if (!tab) throw new Error(`shell4: eps4.json has no ${mass} model at s = ${s}`);
  const NS = m.n, SPEC = m.species.map((x) => x.key), I = m.idx, ZS = m.species.map((x) => x.Z), AS = m.species.map((x) => x.A), Matom = m.species.map((x) => x.Z * MH + x.N * MN - x.B);
  const RS = m.rx.map((r) => ({ ...r, Q: r.react.reduce((t, [j, c]) => t + c * Matom[j], 0) - r.p.reduce((t, k) => t + Matom[I[k]], 0) }));
  const lT = EPS4.T.map(Math.log), lR = tab.rhoRef.map(Math.log);
  const rhoRef = (T) => { const x = Math.log(T); let i = 0; while (i < lT.length - 2 && lT[i + 1] < x) i++; const f = (x - lT[i]) / (lT[i + 1] - lT[i]); return Math.exp(lR[i] * (1 - f) + lR[i + 1] * f); };
  const RZ = m.rx.map((r) => { const zs = []; for (const [j, c] of r.react) for (let k = 0; k < c; k++) zs.push(ZS[j]); return zs.length >= 2 && zs.every((z) => z > 0) ? zs : null; });
  const constants = (T, rho, Y) => { const K0 = m.constants(T, rho / rhoRef(T)); if (!screen || !Y) return K0;
    const ions = [], K = Float64Array.from(K0); let ne = 0; for (let i = 0; i < NS; i++) if (Y[i] > 0 && ZS[i] > 0) { const n = (rho * Y[i]) / MU; ions.push([n, ZS[i]]); ne += n * ZS[i]; }
    const p = plasma(4, T, ions, ne), memo = new Map(), f = (a, b) => { const k = a * 1000 + b; let v = memo.get(k); if (v === undefined) { v = p.f(a, b); memo.set(k, v); } return v; };
    for (let i = 0; i < K.length; i++) { const zs = RZ[i]; if (!zs || !K[i]) continue; let z = zs[0], g = 1; for (let k = 1; k < zs.length; k++) { g *= f(z, zs[k]); z += zs[k]; } K[i] *= g; }
    return K; };
  /* the reactions flattened into typed arrays (speed, 2026-11-22): every loop below runs the same arithmetic in the same
     order as the destructuring loops it replaced, so the results are the same to the bit */
  const NR = RS.length, R0 = new Int32Array(NR + 1), D0 = new Int32Array(NR + 1);
  for (let i = 0; i < NR; i++) { R0[i + 1] = R0[i] + RS[i].react.length; D0[i + 1] = D0[i] + RS[i].dY.length; }
  const RJ = new Int32Array(R0[NR]), RC = new Int32Array(R0[NR]), DQ = new Int32Array(D0[NR]), DV = new Float64Array(D0[NR]);
  for (let i = 0; i < NR; i++) { RS[i].react.forEach(([j, c], k) => { RJ[R0[i] + k] = j; RC[R0[i] + k] = c; }); RS[i].dY.forEach(([q, v], k) => { DQ[D0[i] + k] = q; DV[D0[i] + k] = v; }); }
  const fluxI = (i, k, Y) => { let f = k; for (let a = R0[i]; a < R0[i + 1]; a++) { const c = RC[a]; f *= c === 1 ? Y[RJ[a]] : Y[RJ[a]] ** c; } return f; };
  // where J can be nonzero: (q, j) for each reaction's products/reactants q and reactants j, and the diagonal
  const PAT = Array.from({ length: NS }, (_, q) => { const js = new Set([q]); for (let i = 0; i < NR; i++) for (let b = D0[i]; b < D0[i + 1]; b++) if (DQ[b] === q) for (let a = R0[i]; a < R0[i + 1]; a++) js.add(RJ[a]); return Int32Array.from([...js].sort((x, y) => x - y)); });
  function rhsJ(Y, K, J) { const f = new Float64Array(NS); if (J) for (const row of J) row.fill(0);
    for (let i = 0; i < NR; i++) { const k = K[i]; if (!k) continue; const w = fluxI(i, k, Y); for (let b = D0[i]; b < D0[i + 1]; b++) f[DQ[b]] += DV[b] * w;
      if (J) for (let a = R0[i]; a < R0[i + 1]; a++) { const j = RJ[a], c = RC[a]; let d = k * c * (c === 1 ? 1 : Y[j] ** (c - 1));
        for (let e = R0[i]; e < R0[i + 1]; e++) { const l = RJ[e]; if (l !== j) { const n = RC[e]; d *= n === 1 ? Y[l] : Y[l] ** n; } }
        for (let b = D0[i]; b < D0[i + 1]; b++) J[DQ[b]][j] += DV[b] * d; } }
    return f; }
  const newJ = () => Array.from({ length: NS }, () => new Float64Array(NS)), JF = newJ(), JB = newJ(); // reused (steady/fastSet; burnK)
  const AB = Array.from({ length: NS }, () => new Float64Array(NS)), BB = new Float64Array(NS), XB = new Float64Array(NS);
  const NZ = new Int32Array(NS); // linIn's scratch: the pivot row's nonzero columns
  function linIn(A, b, n = NS) { for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (p !== c) { const t = A[c]; A[c] = A[p]; A[p] = t; const u = b[c]; b[c] = b[p]; b[p] = u; } const d = A[c][c]; if (!d) continue;
      // only the pivot row's nonzeros are subtracted: the rest would subtract exactly zero (speed, 2026-11-22)
      const Ac = A[c]; let nz = 0; for (let x = c; x < n; x++) if (Ac[x] !== 0) NZ[nz++] = x;
      for (let r = c + 1; r < n; r++) { const Ar = A[r], q = Ar[c] / d; if (!q) continue; for (let k = 0; k < nz; k++) { const x = NZ[k]; Ar[x] -= q * Ac[x]; } b[r] -= q * b[c]; } }
    const x = new Float64Array(n); for (let r = n - 1; r >= 0; r--) { let t = b[r]; const Ar = A[r]; for (let c = r + 1; c < n; c++) t -= Ar[c] * x[c]; x[r] = Ar[r] ? t / Ar[r] : 0; } return x; }
  /* the fast set at these constants: species whose destruction rate per nucleus, −∂f_i/∂Y_i, exceeds 1/yr */
  // fastSet leaves its Jacobian (at Y) in JF and returns the rates there too, which steady's first Newton iteration reuses
  // (it used to recompute exactly the same at Z = Y)
  function fastSet(Y, K) { const f0 = rhsJ(Y, K, JF); const out = []; for (let i = 0; i < NS; i++) if (-JF[i][i] > 1 / YR && i !== I["1-1"]) out.push(i); out.f0 = f0; return out; }
  function steady(Y, K) { const Z = Float64Array.from(Y), F = fastSet(Y, K); if (!F.length) return Z; const J = JF;
    for (let it = 0; it < 12; it++) { const f = it === 0 ? F.f0 : rhsJ(Z, K, J), nf = F.length, A = new Array(nf), rb = new Float64Array(nf);
      for (let i = 0; i < nf; i++) { const Ji = J[F[i]], row = (A[i] = new Float64Array(nf)); for (let k = 0; k < nf; k++) row[k] = Ji[F[k]]; rb[i] = -f[F[i]]; } // plain loops: Float64Array.from(…, fn) was the hot spot
      const d = linIn(A, rb, nf);
      let mx = 0; F.forEach((a, i) => { const nz = Math.max(0, Z[a] + d[i]); mx = Math.max(mx, Math.abs(nz - Z[a]) / Math.max(nz, 1e-300)); Z[a] = nz; }); if (mx < 1e-10) break; }
    return Z; }
  const C = MEVJ / MU; // MeV per nucleon per second → W/kg
  const LIGHT = RS.map((r) => r.react.every(([j]) => ZS[j] <= 2));
  function eps(rho, T, Y) { if (!(T > 1e6)) return { eps: 0, pp: 0, cno: 0 }; const K = constants(T, rho, Y), Z = steady(Y, K); let e = 0, pp = 0;
    for (let i = 0; i < NR; i++) { if (!K[i]) continue; const w = fluxI(i, K[i], Z) * RS[i].Q; e += w; if (LIGHT[i]) pp += w; }
    return { eps: e * C, pp: pp * C, cno: (e - pp) * C }; } // "cno" here: everything past helium (captures on the ladder and its cycles)
  function dYdt(rho, T, Y) { const K = constants(T, rho, Y), Z = steady(Y, K); return rhsJ(Z, K, null); }
  function burnK(K, Y0, dt) { const J = JB; let Y = Float64Array.from(Y0), t = 0, h = dt / 32, Eg = 0;
    for (let guard = 0; t < dt * (1 - 1e-12) && guard < 5000; guard++) { if (t + h > dt) h = dt - t; const X = Float64Array.from(Y); let ok = false;
      for (let it = 0; it < 15; it++) { const f = rhsJ(X, K, J); for (let i = 0; i < NS; i++) { const Ai = AB[i], Ji = J[i], P = PAT[i]; Ai.fill(0); for (let p = 0; p < P.length; p++) { const j = P[p]; Ai[j] = (i === j ? 1 : 0) - h * Ji[j]; } BB[i] = -(X[i] - Y[i] - h * f[i]); }
        const d = linIn(AB, BB); let mx = 0; for (let i = 0; i < NS; i++) { const nz = Math.max(0, X[i] + d[i]); if (nz > 1e-12 || X[i] > 1e-12) mx = Math.max(mx, Math.abs(nz - X[i]) / Math.max(nz, X[i], 1e-12)); X[i] = nz; } if (mx < 1e-9) { ok = true; break; } }
      let ch = 0; for (let i = 0; i < NS; i++) if (Y[i] > 1e-9) ch = Math.max(ch, Math.abs(X[i] - Y[i]) / Y[i]);
      if (!ok || ch > 0.25) { h /= 3; continue; }
      for (let i = 0; i < NR; i++) if (K[i]) Eg += fluxI(i, K[i], X) * RS[i].Q * h;
      Y = X; t += h; h *= ch < 0.03 ? 2 : ch < 0.1 ? 1.3 : 1; }
    if (t < dt * (1 - 1e-9)) throw new Error(`shell4 burn: stalled at ${t.toExponential(2)} of ${dt.toExponential(2)} s`);
    return { Y, E: Eg * C }; }
  const burn = (rho, T, Y0, dt) => burnK(constants(T, rho, Y0), Y0, dt);
  const fromX = (Xm) => Float64Array.from(SPEC, (k, i) => (Xm[k] ?? 0) / AS[i]);
  return { s, mass, SPEC, NS, I, ZS, AS, RS, rhoRef, constants, eps, dYdt, steady, burn, burnK, fromX, massX: (Y) => Object.fromEntries(SPEC.map((k, i) => [k, Y[i] * AS[i]])) };
}
