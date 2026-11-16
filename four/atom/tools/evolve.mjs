/* A star's main-sequence life: burnt shell by shell, the stirred regions mixed, the star re-solved at every step.
   Ours first, as the check against the standard solar model; 4D follows on the same driver.
     node four/atom/tools/evolve.mjs ours [M☉=1] [dX=0.01] [simple] [X0=0.70] [tmax=<Gyr>]   → $TMPDIR/atom4-mainseq/evolve-ours-<M>….json
   The star is atom/js/mainseq.js's (hydrostatic and thermal equilibrium, our opacity, Fermi–Dirac electrons), now with
   a composition that varies with mass (opts.compAt). Energy only from burning: the slow contraction's share (ε_grav)
   is left out, which is small on the main sequence. Composition on a fixed grid in q = m/M.
   Burning, two ways:
     · the network (default): fusion/js/shell.js, every REACLIB reaction of the pp chains and the CN and NO cycles, with
       weak screening and the neutrinos' share taken off. Each shell keeps its own p, ³He, ⁴He and CNO isotopes; the
       short-lived ones (d, ⁷Be, …) sit at their steady state. Each step burns each shell implicitly at its own ρ, T. In
       the structure, each shell's ε(ρ, T) is a local power law fitted at its last ρ, T (ε and its two slopes), and the
       star is re-solved and the law refitted until the luminosity settles (|Δ ln L| < 10⁻⁴).
     · `simple`: mainseq.mjs's old law (p + p at 13.1 MeV a reaction, two protons used; CNO at nitrogen-14's pace, held at
       0.014 by mass, 25.0 MeV and four protons a cycle), scaled by the local hydrogen. Kept to show what the network changed.
   Each step is a midpoint (second-order) step in time: burn half a step at the present star's ρ, T, re-solve, burn the
   whole step at that half-way star's ρ, T; then every region the solver stirred (its gradient at the adiabatic one) is
   mixed to one composition. A stirred region burns as one zone, on its shells' mass-weighted rates (burning each shell
   on its own over a step starves a convective core's centre of the fuel the stirring brings it). A step is accepted only
   if what the shells burnt over it matches what the half-way star radiated to 0.3% (BALTOL), else it is halved. The step is set so the hydrogen anywhere falls by at most dX (and by at most a tenth of what
   is there), and grows at most ×2 a step; the first is a thousand years, while the ³He of the core comes into balance.
   No diffusion, no overshoot, no mass loss, no rotation. */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { star, convectiveCore, teff, rhoOf, gradAd, SI, kappaOurs, kappaFF4, pinnedF, toPinned } from "../js/mainseq.js";
import { ours, fourNet, firstStar, G0, MSUN, LSUN, RSUN } from "./mainseq.mjs";
import { shell4 } from "../../fusion/js/shell4.js";
import * as SH from "../../fusion/js/shell.js";
import { SUN_X } from "../../fusion/js/net.js";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-mainseq"); mkdirSync(DIR, { recursive: true });
const GYR = 3.15576e16, YR = 3.15576e7, BALTOL = +(process.env.BALTOL ?? 0.003), [cmd, ...args] = process.argv.slice(2);

/* the composition grid: q_j = (j/N)^1.5, finer at the centre where the burning is */
const NQ = 400, QS = Float64Array.from({ length: NQ + 1 }, (_, j) => (j / NQ) ** 1.5), WQ = (() => { const w = new Float64Array(NQ + 1); for (let j = 0; j < NQ; j++) { const h = QS[j + 1] - QS[j]; w[j] += h / 2; w[j + 1] += h / 2; } return w; })();
const bracket = (xs, x) => { const n = xs.length; if (x <= xs[0]) return [0, 0, 0]; if (x >= xs[n - 1]) return [n - 1, n - 1, 0]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; } return [lo, hi, (x - xs[lo]) / (xs[hi] - xs[lo] || 1)]; };
const interp = (xs, ys, x) => { const [a, b, t] = bracket(xs, x); return ys[a] * (1 - t) + ys[b] * t; };

/* a world for the driver: the state of a shell (an array), its hydrogen, its EOS composition, its burning */
function networkWorld(X0 = 0.70, Z = 0.02) {
  const o = ours(), cno = { c12: SUN_X.c12, n14: SUN_X.n14, o16: SUN_X.o16 }, zc = cno.c12 + cno.n14 + cno.o16, Zrest = Z - zc, sh = { Zrest };
  const init = SH.fromX({ p: X0, he4: 1 - X0 - Z, ...cno }), iP = SH.I.p;
  return { name: "network", d: 3, G: o.G, Z, init: () => Float64Array.from(init), H: (s) => s[iP], comp: (s) => ({ X: s[iP], Y: 1 - Z - s[iP], Z }),
    kappa: (rho, T, s) => kappaOurs({ X: s[iP], Y: 1 - Z - s[iP], Z })(rho, T), kappaC: (rho, T, c) => kappaOurs(c)(rho, T),
    eps: (rho, T, s) => SH.eps(rho, T, s, sh), dHdt: (rho, T, s) => SH.dYdt(rho, T, s, sh)[iP],
    burn: (rho, T, s, dt) => { const r = SH.burn(rho, T, s, dt, sh); return { s: r.Y, E: r.E }; },
    burnZone: (rows, s, ws, dt) => { const K = new Float64Array(SH.RS.length); let sw = 0; rows.forEach((r, i) => { const k = SH.constants(r.T, r.rho, s, sh); sw += ws[i]; for (let c = 0; c < K.length; c++) K[c] += ws[i] * k[c]; });
      for (let c = 0; c < K.length; c++) K[c] /= sw; const r = SH.burnK(K, s, dt, sh); return { s: r.Y, E: r.E }; },
    extra: (s) => ({ he3: s[SH.I.he3] * 3, c12: s[SH.I.c12] * 12, n14: s[SH.I.n14] * 14 }) };
}
function simpleWorld(X0 = 0.70) {
  const o = ours(), Z = o.comp.Z, comp = (s) => ({ X: s[0], Y: 1 - Z - s[0], Z }), mH = SI.mu * 1.007825;
  const parts = (rho, T, X) => { const np = (rho * X) / SI.mu, nN = (rho * 0.014) / (14 * SI.mu), rpp = (np * np * o.svpp(T)) / 2, rcno = nN * np * o.svN(T);
    return { pp: (rpp * 13.1 * SI.MeV) / rho, cno: (rcno * 25.0 * SI.MeV) / rho, dX: -(2 * rpp + 4 * rcno) * mH / rho }; };
  return { name: "simple", d: 3, G: o.G, Z, init: () => Float64Array.of(X0), H: (s) => s[0], comp, kappa: (rho, T, s) => kappaOurs(comp(s))(rho, T),
    kappaC: (rho, T, c) => kappaOurs(c)(rho, T),
    eps: (rho, T, s) => { const p = parts(rho, T, s[0]); return { eps: p.pp + p.cno, pp: p.pp, cno: p.cno }; }, dHdt: (rho, T, s) => parts(rho, T, s[0]).dX,
    burn: (rho, T, s, dt) => { // dX/dt = −aX² − bX at fixed ρ, T: exactly
      const p = parts(rho, T, 1), np1 = rho / SI.mu, a = (np1 * np1 * o.svpp(T) * mH) / rho, b = (4 * ((rho * 0.014) / (14 * SI.mu)) * np1 * o.svN(T) * mH) / rho, X = s[0];
      const Xn = b > 0 ? (b * X * Math.exp(-b * dt)) / (b + a * X * (1 - Math.exp(-b * dt))) : X / (1 + a * X * dt);
      const E = (X - Xn) * (p.pp + p.cno) / -p.dX; return { s: Float64Array.of(Xn), E }; },
    burnZone: (rows, s, ws, dt) => { // the zone's mean a and b, then exactly as one shell
      let sw = 0, A = 0, B = 0, EA = 0, EB = 0; for (let i = 0; i < rows.length; i++) { const { rho, T } = rows[i]; const np1 = rho / SI.mu, a = (np1 * np1 * o.svpp(T) * mH) / rho, b = (4 * ((rho * 0.014) / (14 * SI.mu)) * np1 * o.svN(T) * mH) / rho, p = parts(rho, T, 1);
        sw += ws[i]; A += ws[i] * a; B += ws[i] * b; EA += ws[i] * (p.pp / (a || 1)); EB += ws[i] * (b ? p.cno / b : 0); }
      A /= sw; B /= sw; const X = s[0], Xn = B > 0 ? (B * X * Math.exp(-B * dt)) / (B + A * X * (1 - Math.exp(-B * dt))) : X / (1 + A * X * dt);
      return { s: Float64Array.of(Xn), E: (X - Xn) * ((EA / sw) * A + (EB / sw) * B) / (A + B) }; }, extra: () => ({}) };
}

/* 4D (paper 2's stars): fusion/js/shell4.js on the 4D network at strength s, free–free × ff through the lens vacuum
   (kappaFF4, with each shell's own Σ n Z² and electrons), pinned 1/r gravity summed over the profile (mainseq.js
   pinnedF, damped as nextPinned damps it), primordial gas (hydrogen 0.75, helium-4 0.25). The ash past helium counts in
   the EOS by its own ions per mass. The first star is mainseq.mjs's on eps4.json's table (firstStar, then toPinned). */
function fourWorld(Grel, s, ff = 1) {
  const sh = shell4(s), iP = sh.I["1-1"], A = sh.AS, Z = sh.ZS, init = sh.fromX({ "1-1": 0.75, "2-4": 0.25 });
  const parts = (y) => { let X = y[iP] * A[iP], He = 0, ions = 0, zz = 0; for (let i = 0; i < sh.NS; i++) { const x = y[i] * A[i]; zz += y[i] * Z[i] * Z[i]; if (i === iP) continue; if (Z[i] <= 2) He += x; else ions += y[i]; } return { X, He, ions, zz }; };
  const comp = (y) => { const p = parts(y); return { X: p.X, Y: p.He, Z: 14 * p.ions }; }; // rhoOf counts ions as X + Y/4 + Z/14
  return { name: `4D s ${s} G ${Grel} ff ${ff}`, d: 4, G: G0 * Grel, pinned: true, Mch: fourNet(Grel, s, "ladder", ff).Mch, init: () => Float64Array.from(init), H: (y) => y[iP] * A[iP], comp,
    kappa: (rho, T, y) => { const p = parts(y); return kappaFF4({ X: p.X, Y: p.zz - p.X, Z: 0 }, ff)(rho, T); },
    kcomp: (y) => { const p = parts(y); return { X: p.X, Y: p.zz - p.X, Z: 0 }; }, kappaC: (rho, T, c) => kappaFF4(c, ff)(rho, T), // Y here carries Σ n Z² less hydrogen's
    eps: (rho, T, y) => sh.eps(rho, T, y), dHdt: (rho, T, y) => sh.dYdt(rho, T, y)[iP] * A[iP],
    burn: (rho, T, y, dt) => { const r = sh.burn(rho, T, y, dt); return { s: r.Y, E: r.E }; },
    burnZone: (rows, y, ws, dt) => { const K = new Float64Array(sh.RS.length); let sw = 0; rows.forEach((r, i) => { const k = sh.constants(r.T, r.rho); sw += ws[i]; for (let c = 0; c < K.length; c++) K[c] += ws[i] * k[c]; });
      for (let c = 0; c < K.length; c++) K[c] /= sw; const r = sh.burnK(K, y, dt); return { s: r.Y, E: r.E }; },
    first: (M) => { const o = fourNet(Grel, s, "ladder", ff), a = firstStar(o, M); if (!a) return null; return toPinned({ ...o, M }, a); },
    extra: (y) => Object.fromEntries(sh.SPEC.map((k, i) => [k, y[i] * A[i]]).filter(([, v]) => v > 1e-3)) };
}

const lerpState = (S, q) => { const [a, b, t] = bracket(QS, q); if (!t) return S[a]; const A = S[a], B = S[b], o = new Float64Array(A.length); for (let i = 0; i < A.length; i++) o[i] = A[i] * (1 - t) + B[i] * t; return o; };
/* each shell's ε(ρ, T) as a power law fitted at (ρ₀, T₀) */
function fitLaws(W, S, at) { return S.map((s, j) => { const { rho, T } = at[j]; if (!(T > 2e6) || !(rho > 0)) return null; const e0 = W.eps(rho, T, s).eps; if (!(e0 > 0)) return null;
  const er = W.eps(rho * 1.02, T, s).eps, eT = W.eps(rho, T * 1.01, s).eps; return { l0: Math.log(e0), a: Math.log(er / e0) / Math.log(1.02), b: Math.log(eT / e0) / Math.log(1.01), lr: Math.log(rho), lT: Math.log(T) }; }); }
const law = (f, lr, lT) => (f ? Math.exp(f.l0 + f.a * (lr - f.lr) + f.b * (lT - f.lT)) : 0);
/* solve the star for the shells S: the fitted laws refitted at each solution until L settles */
function solve(W, M, S, guess, at0, f0 = null) {
  // the EOS and opacity need only a few numbers from each shell: precomputed, then interpolated in q
  const CQ = S.map((y) => W.comp(y)), KQ = S.map((y) => (W.kcomp ? W.kcomp(y) : W.comp(y))), mixQ = (A, m) => { const [a, b, t] = bracket(QS, m / M); if (!t) return A[a]; const o = {}; for (const k in A[a]) o[k] = A[a][k] * (1 - t) + A[b][k] * t; return o; };
  const comp = (m) => mixQ(CQ, m), kap = W.kappaC ?? ((rho, T, c) => W.kappa(rho, T, null, c));
  let at = at0, s = null, p = guess, last = null, f = f0;
  for (let k = 0; k < 8; k++) {
    const laws = fitLaws(W, S, at), eps = (rho, T, m) => { const [a, b, t] = bracket(QS, m / M), lr = Math.log(rho), lT = Math.log(T); return law(laws[a], lr, lT) * (1 - t) + law(laws[b], lr, lT) * t; };
    s = star({ d: W.d, M, G: W.G, comp: CQ[0], compAt: comp, eps, kappa: (rho, T, m) => kap(rho, T, mixQ(KQ, m)), ...(f ? { f } : {}) }, p);
    if (!s.ok) return { s }; p = s.p; at = sample(W, M, S, s).rows;
    if (process.env.DEBUG_SOLVE) console.log(`    solve ${k}: L ${s.L.toExponential(6)} (Newton ${s.it})`);
    if (last && Math.abs(Math.log(s.L / last)) < 1e-4) break; last = s.L;
  }
  // pinned gravity is held through the solve (pinnedF from a profile carries ~1% noise, which would never let L settle)
  // and updated once from the solution, damped, for the next one: it lags the star by one step, over which it barely moves
  if (W.pinned && s.ok) { const fo = f, fn = pinnedF(s.prof); f = fo ? (m) => 0.5 * (fo(m) + fn(m)) : fn; }
  return { s, at, f };
}
/* the profile on the composition grid: P, T, ρ at each q (ρ from the shell's own composition), and the stirred flag */
function sample(W, M, S, s) {
  const p = s.prof, ms = p.map((x) => x.m / M), lP = p.map((x) => Math.log(x.P)), lT = p.map((x) => Math.log(x.T)), lr = p.map((x) => Math.log(x.r)), Ls = p.map((x) => x.L / s.L), gad = gradAd(W.d);
  const rows = S.map((sj, j) => { const q = Math.max(QS[j], ms[0]), P = Math.exp(interp(ms, lP, q)), T = Math.exp(interp(ms, lT, q)); return { q: QS[j], P, T, rho: rhoOf(W.d, P, T, W.comp(sj)), r: Math.exp(interp(ms, lr, q)) / s.R, l: interp(ms, Ls, q) }; });
  const stir = new Uint8Array(NQ + 1); for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i]; if (b.P === a.P) continue; const nab = Math.log(b.T / a.T) / Math.log(b.P / a.P); if (nab >= 0.98 * gad) for (let j = 0; j <= NQ; j++) if (QS[j] >= a.m / M && QS[j] <= b.m / M) stir[j] = 1; }
  if (stir[1]) stir[0] = 1; return { rows, stir };
}
/* every stirred run of the grid mixed to its mass-weighted mean, species by species */
function mix(S, stir) { const O = S.map((s) => Float64Array.from(s)); let j = 0;
  while (j <= NQ) { if (!stir[j]) { j++; continue; } let k = j; while (k + 1 <= NQ && stir[k + 1]) k++; let sw = 0; const acc = new Float64Array(O[j].length);
    for (let i = j; i <= k; i++) { sw += WQ[i]; for (let c = 0; c < acc.length; c++) acc[c] += WQ[i] * O[i][c]; } if (sw > 0) for (let i = j; i <= k; i++) for (let c = 0; c < acc.length; c++) O[i][c] = acc[c] / sw; j = k + 1; }
  return O; }
/* burn every shell for dt at the star sm's conditions: radiative shells each on their own, each stirred run of sm as one
   zone (its composition mixed first) */
const burnAll = (W, S0, sm, dt) => { const at = sm.rows, S = mix(S0, sm.stir), O = new Array(NQ + 1); let E = 0, j = 0;
  while (j <= NQ) {
    if (sm.stir[j]) { let k = j; while (k + 1 <= NQ && sm.stir[k + 1]) k++; const idx = []; for (let i = j; i <= k; i++) if (at[i].T > 2e6) idx.push(i);
      if (idx.length) { const r = W.burnZone(idx.map((i) => at[i]), S[j], idx.map((i) => WQ[i]), dt), sw = idx.reduce((a, i) => a + WQ[i], 0); E += sw * r.E; for (let i = j; i <= k; i++) O[i] = Float64Array.from(r.s); }
      else for (let i = j; i <= k; i++) O[i] = Float64Array.from(S[i]);
      j = k + 1; continue; }
    const { rho, T } = at[j]; if (!(T > 2e6)) O[j] = Float64Array.from(S[j]); else { const r = W.burn(rho, T, S[j], dt); E += WQ[j] * r.E; O[j] = r.s; } j++; }
  return { S: O, E }; };

function evolve(W, M, { dX = 0.01, tmax = 20 * GYR, Hstop = 1e-3, guess, label }) {
  let S = Array.from({ length: NQ + 1 }, () => W.init()), t = 0;
  // the first star: its laws fitted at a guessed profile, then re-solved to self-consistency
  const s0 = W.first ? W.first(M) : star({ d: W.d, M, G: W.G, comp: W.comp(S[0]), eps: (rho, T) => W.eps(rho, T, S[0]).eps, kappa: (rho, T) => W.kappa(rho, T, S[0]) }, guess);
  if (!s0?.ok) throw new Error(`zero-age star didn't solve (${s0?.why ?? "no first star"})`);
  let { s, at, f: grav } = solve(W, M, S, s0.p, sample(W, M, S, s0).rows, s0.f ?? null); if (!s.ok) throw new Error(`zero-age star didn't solve with shell laws (${s.why})`);
  let smp = sample(W, M, S, s), dtLast = 1e3 * YR, eBal = null;
  const track = [], profiles = [], keepProf = (s, smp) => profiles.push({ tGyr: t / GYR, R: s.R, L: s.L, rows: smp.rows.filter((_, j) => j % 10 === 0).map((r, i) => ({ q: r.q, r: +r.r.toPrecision(5), T: +r.T.toPrecision(5), rho: +r.rho.toPrecision(5), l: +r.l.toPrecision(5), H: +W.H(S[i * 10]).toPrecision(5), stir: smp.stir[i * 10], ...Object.fromEntries(Object.entries(W.extra(S[i * 10])).map(([k, v]) => [k, +v.toPrecision(4)])) })) });
  const keep = () => { const c = smp.rows[0], e = smp.rows.map((r, j) => W.eps(r.rho, r.T, S[j])), lpp = e.reduce((a, x, j) => a + WQ[j] * x.pp, 0), lcno = e.reduce((a, x, j) => a + WQ[j] * x.cno, 0);
    const lq = (f) => { for (let j = 1; j <= NQ; j++) if (smp.rows[j].l >= f) return QS[j]; return 1; };
    const row = { t, tGyr: t / GYR, L: s.L, R: s.R, Teff: teff(W.d, s), Tc: s.Tc, rhoc: c.rho, Pc: s.Pc, Xc: W.H(S[0]), qcc: convectiveCore(W.d, s), ppShare: lpp / (lpp + lcno), Lnuc: (lpp + lcno) * M, q50: lq(0.5), q90: lq(0.9), eBal,
      Hq: Array.from({ length: 21 }, (_, i) => +W.H(lerpState(S, i / 20)).toFixed(5)), centre: W.extra(S[0]) };
    track.push(row); console.log(`${label} ${row.tGyr.toFixed(3)} Gyr: ${W.d === 3 ? `L ${(s.L / LSUN).toFixed(4)} L☉, R ${(s.R / RSUN).toFixed(4)} R☉` : `L ${s.L.toExponential(4)} W, R ${s.R.toExponential(4)} m`}, Teff ${row.Teff.toFixed(0)} K, Tc ${(s.Tc / 1e6).toFixed(2)} MK, ρc ${W.d === 3 ? `${(c.rho / 1000).toFixed(1)} g/cm³` : `${c.rho.toExponential(3)} kg/m⁴`}, Xc ${row.Xc.toFixed(4)}, stirred core ${row.qcc.toFixed(3)}, pp ${(row.ppShare * 100).toFixed(1)}%, half the light inside q ${row.q50.toFixed(3)}${eBal ? `, burnt/radiated ${eBal.toFixed(4)}` : ""}`); };
  keep(); keepProf(s, smp); let nextProf = 0.5;
  for (let n = 0; n < 3000 && t < tmax && W.H(S[0]) > Hstop; n++) {
    let dt = dtLast * 2; for (let j = 0; j <= NQ; j++) { const r = smp.rows[j]; if (!(r.T > 2e6)) continue; const h = W.H(S[j]), d = W.dHdt(r.rho, r.T, S[j]); if (d < 0) dt = Math.min(dt, dX / -d, (0.1 * Math.max(h, Hstop)) / -d); }
    dt = Math.min(dt, tmax - t); let done = false;
    for (let tries = 0; tries < 6 && !done; tries++) {
      const h1 = burnAll(W, S, smp, dt / 2), Sh = mix(h1.S, smp.stir), h = solve(W, M, Sh, s.p, smp.rows, grav); if (!h.s.ok) { dt /= 2; continue; }
      const smh = sample(W, M, Sh, h.s), b = burnAll(W, S, smh, dt), bal = (b.E * M) / (h.s.L * dt); // what the shells burnt over the step against what the half-way star radiated
      if (Math.abs(bal - 1) > BALTOL && tries < 5 && dt > 1e3 * YR) { dt /= 2; continue; } // the step's energy doesn't add up: shorter
      const Sn = mix(b.S, smh.stir), f = solve(W, M, Sn, h.s.p, smh.rows, h.f); if (!f.s.ok) { dt /= 2; continue; }
      eBal = bal; grav = f.f;
      if (process.env.DEBUG_BAL) { const bands = [0, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1.01], acc = bands.slice(1).map(() => [0, 0]);
        for (let j = 0; j <= NQ; j++) { const r = smh.rows[j]; if (!(r.T > 2e6)) continue; const k = bands.findIndex((x, i) => QS[j] >= x && QS[j] < bands[i + 1]), e = W.eps(r.rho, r.T, Sh[j]).eps, eb = W.burn(r.rho, r.T, S[j], dt).E / dt; acc[k][0] += WQ[j] * e; acc[k][1] += WQ[j] * eb; }
        console.log(`  balance by q band (burnt/structure): ${acc.map(([e, b], i) => `${bands[i]}–${bands[i + 1]}: ${(b / e).toFixed(4)} (${((e * M) / h.s.L * 100).toFixed(1)}%)`).join("; ")}`); }
      const smn = sample(W, M, Sn, f.s); S = mix(Sn, smn.stir); s = f.s; smp = smn; t += dt; dtLast = dt; done = true;
    }
    if (!done) { console.log(`${label}: stopped at ${(t / GYR).toFixed(3)} Gyr, Xc ${W.H(S[0]).toFixed(4)} (the star didn't solve on a smaller step)`); return { track, profiles, stopped: `no solution past Xc ${W.H(S[0]).toFixed(4)}` }; }
    keep(); if (t / GYR >= nextProf) { keepProf(s, smp); nextProf += 0.5; }
  }
  keepProf(s, smp);
  return { track, profiles, stopped: W.H(S[0]) <= Hstop ? `central hydrogen below ${Hstop}` : t >= tmax * (1 - 1e-9) ? "tmax" : "step limit" };
}

if (cmd === "ours") {
  const kv = Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => a.split("="))), pos = args.filter((a) => !a.includes("=") && a !== "simple");
  const m = +(pos[0] ?? 1), dX = +(pos[1] ?? 0.01), simple = args.includes("simple"), X0 = +(kv.X0 ?? 0.70), tmax = kv.tmax ? +kv.tmax * GYR : 20 * GYR;
  const W = simple ? simpleWorld(X0) : networkWorld(X0), t0 = Date.now();
  const r = evolve(W, m * MSUN, { dX, tmax, label: `${m} M☉ ${W.name} X0 ${X0}`, guess: [Math.log(2.3e16), Math.log(1.4e7), Math.log(0.9 * RSUN), Math.log(0.7 * LSUN)] });
  const file = path.join(DIR, `evolve-ours-${m}${simple ? "-simple" : ""}${dX !== 0.01 ? `-dX${dX}` : ""}${kv.X0 ? `-X${X0}` : ""}${kv.tmax ? `-to${kv.tmax}` : ""}.json`);
  writeFileSync(file, JSON.stringify({ about: `atom/tools/evolve.mjs ours: our star's main sequence (${W.name} burning), burnt shell by shell, stirred regions mixed`, m, dX, X0, NQ, burning: W.name, stopped: r.stopped, track: r.track, profiles: r.profiles }));
  console.log(`wrote ${file} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.track.length} models; ${r.stopped})`);
} else if (cmd === "four") {
  // node four/atom/tools/evolve.mjs four <G × ours> <s> <mass in M_Ch | sun> [dX] [ff=1] [tmax=<Gyr>]
  const kv = Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => a.split("="))), pos = args.filter((a) => !a.includes("="));
  const Grel = +pos[0], sv = +pos[1], ff = +(kv.ff ?? 1), dX = +(pos[3] ?? 0.01), tmax = kv.tmax ? +kv.tmax * GYR : 200 * GYR, W = fourWorld(Grel, sv, ff), t0 = Date.now();
  let m = pos[2]; if (m === "sun") { const GR = JSON.parse((await import("node:fs")).readFileSync(new URL("../../papers/p2/data/gravity.json", import.meta.url), "utf8")).runs, r = GR.find((x) => x.G === Grel && x.s === sv); if (!r?.sun) throw new Error(`no Sun analogue at G ${Grel}, s ${sv} in gravity.json`); m = r.sun.m; }
  m = +m; const r = evolve(W, m * W.Mch, { dX, tmax, label: `4D G ${Grel} s ${sv} ${m.toPrecision(4)} M_Ch` });
  const file = path.join(DIR, `evolve-four-${pos[0]}-${pos[1]}-${(+m).toPrecision(4)}${ff !== 1 ? `-ff${ff}` : ""}${dX !== 0.01 ? `-dX${dX}` : ""}${kv.tmax ? `-to${kv.tmax}` : ""}.json`);
  writeFileSync(file, JSON.stringify({ about: "atom/tools/evolve.mjs four: a 4D star's main sequence on the 4D network, burnt shell by shell, stirred regions mixed", Grel, s: sv, ff, m, Mch: W.Mch, dX, NQ, stopped: r.stopped, track: r.track, profiles: r.profiles }));
  console.log(`wrote ${file} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.track.length} models; ${r.stopped})`);
} else console.log("commands: ours [M☉] [dX] [simple] [X0=] [tmax=] | four <G> <s> <M_Ch|sun> [dX] [ff=] [tmax=]");
