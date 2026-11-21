/* A star's main-sequence life: burnt shell by shell, the stirred regions mixed, the star re-solved at every step.
   Ours first, as the check against the standard solar model; 4D follows on the same driver.
     node four/atom/tools/evolve.mjs ours [M☉=1] [dX=0.01] [simple] [X0=0.70] [Z=0.02] [kap=kramers|book|opal] [alpha=<MLT α; 0 = no envelope>] [settle=<yr>] [tmax=<Gyr>] [grav=1]
       → $TMPDIR/atom4-mainseq/evolve-ours-<M>….json
   The star is atom/js/mainseq.js's (hydrostatic and thermal equilibrium, our opacity, Fermi–Dirac electrons), now with
   a composition that varies with mass (opts.compAt). Energy from burning, and with `grav=1` also from contraction
   (ε_grav = −du/dt + (P/ρ²) dρ/dt at each mass; the gas, ideal ions and Fermi–Dirac electrons, both non-relativistic,
   has u = (d/2) P/ρ exactly, so ε_grav = (P/ρ)[(d+2)/2 · d ln ρ − d/2 · d ln P]/dt, the earlier model's ρ taken at the
   later one's composition so burning's change of μ isn't counted; radiation's share left out; its reference model: see
   gravRef). Without
   it, a core changing faster than burning can follow has no solution (the oitrogen stall). Composition on a fixed grid in q = m/M.
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
   if what the shells burnt over it matches what the half-way star radiated to 0.3% (BALTOL), else it is halved; a
   mismatch a halving doesn't shrink is structural (a stirred core's ⁷Be branch, up to ~0.5%) and is kept as eBal. The step is set so the hydrogen anywhere falls by at most dX (and by at most a tenth of what
   is there), and grows at most ×2 a step; the first is a thousand years, while the ³He of the core comes into balance.
   No diffusion, no overshoot, no mass loss, no rotation. */
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { star, convectiveCore, teff, rhoOf, gradAd, SI, kappaOurs, kappaFF4, pinnedF, toPinned } from "../js/mainseq.js";
import { ours, fourNet, firstStar, G0, MSUN, LSUN, RSUN } from "./mainseq.mjs";
import { shell4 } from "../../fusion/js/shell4.js";
import * as SH from "../../fusion/js/shell.js";
import { SUN_X } from "../../fusion/js/net.js";
import { kappa as kappaOPAL } from "../js/opal.js";
import { makeEnvelope } from "../js/envelope.js";
import * as SURF from "../js/surface.js";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-mainseq"); mkdirSync(DIR, { recursive: true });
const GYR = 3.15576e16, YR = 3.15576e7, BALTOL = +(process.env.BALTOL ?? 0.003), DRHO = +(process.env.DRHO ?? 0.05), [cmd, ...args] = process.argv.slice(2);

/* the composition grid: q_j = (j/N)^1.5, finer at the centre where the burning is */
const NQ = 400, QS = Float64Array.from({ length: NQ + 1 }, (_, j) => (j / NQ) ** 1.5), WQ = (() => { const w = new Float64Array(NQ + 1); for (let j = 0; j < NQ; j++) { const h = QS[j + 1] - QS[j]; w[j] += h / 2; w[j + 1] += h / 2; } return w; })();
const bracket = (xs, x) => { const n = xs.length; if (x <= xs[0]) return [0, 0, 0]; if (x >= xs[n - 1]) return [n - 1, n - 1, 0]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; } return [lo, hi, (x - xs[lo]) / (xs[hi] - xs[lo] || 1)]; };
const interp = (xs, ys, x) => { const [a, b, t] = bracket(xs, x); return ys[a] * (1 - t) + ys[b] * t; };

/* a world for the driver: the state of a shell (an array), its hydrogen, its EOS composition, its burning */
/* the book's own opacity in the interior (kap "book"): the surface model's Rosseland mean (atom/js/surface.js: Saha
   hydrogen and helium, electron scattering, free–free with the Born–Elwert Gaunt factor, bound–free from the book's dipole
   rates; metals only as electron donors, so right only for metal-poor gas), tabulated lazily in log T (0.02), log ρ
   (0.05) and X (0.05), trilinear in log κ */
function bookKappa(Z) {
  const W = new Map(), C = new Map(), wAt = (k) => { let w = W.get(k); if (!w) { const X = Math.min(k * 0.05, 1 - Z); w = SURF.world(3, { X, Y: 1 - X - Z, Z, gff: "elwert" }); W.set(k, w); } return w; };
  const cell = (k, i, j) => { const key = (k * 1000 + i) * 1000 + j; let v = C.get(key); if (v === undefined) { v = Math.log(wAt(k).kappaR(10 ** (i * 0.02), 10 ** (j * 0.05 - 10))); C.set(key, v); } return v; };
  return (rho, T, c) => { const x = Math.min(Math.max(c.X, 0), 1 - Z) / 0.05, y = Math.log10(T) / 0.02, z = (Math.log10(rho) + 10) / 0.05, k = Math.min(Math.floor(x), 19), i = Math.floor(y), j = Math.floor(z), a = x - k, b = y - i, e = z - j;
    let v = 0; for (const [dk, wa] of [[0, 1 - a], [1, a]]) for (const [di, wb] of [[0, 1 - b], [1, b]]) for (const [dj, we] of [[0, 1 - e], [1, e]]) if (wa * wb * we) v += wa * wb * we * cell(k + dk, i + di, j + dj);
    return Math.exp(v); };
}
/* ours' opacity: `kramers` (the textbook law, scattering + Kramers), `book` (above) or `opal` (OPAL's tables, atom/js/opal.js: measured
   input); `alpha` > 0 puts an envelope (atom/js/envelope.js) at the surface, on the surface model's gas, mixing length
   α H_P, fitted to the interior at 3 × 10⁵ K: with `opal` the envelope takes OPAL's opacity too, else the surface
   model's own (the book's: scattering, free–free, bound–free and H⁻ from its atoms; metals only as electron donors).
   CNO scales with Z from net.js's solar mix. */
function networkWorld(X0 = 0.70, Z = 0.02, { kap = "kramers", alpha = 0 } = {}) {
  const o = ours(), zs = Z / 0.02, cno = { c12: SUN_X.c12 * zs, n14: SUN_X.n14 * zs, o16: SUN_X.o16 * zs }, zc = cno.c12 + cno.n14 + cno.o16, Zrest = Z - zc, sh = { Zrest };
  const init = SH.fromX({ p: X0, he4: 1 - X0 - Z, ...cno }), iP = SH.I.p, K = kap === "opal" ? (rho, T, c) => kappaOPAL(rho, T, c.X, c.Z) : kap === "book" ? bookKappa(Z) : (rho, T, c) => kappaOurs(c)(rho, T);
  const E = alpha > 0 ? makeEnvelope(3, { X: X0, Y: 1 - X0 - Z, Z, alpha, gff: kap === "book" ? "elwert" : 1, kappa: kap === "opal" ? (rho, T) => K(rho, T, { X: X0, Y: 1 - X0 - Z, Z }) : null }) : null;
  return { name: "network", d: 3, G: o.G, Z, kap, alpha, init: () => Float64Array.from(init), H: (s) => s[iP], comp: (s) => ({ X: s[iP], Y: 1 - Z - s[iP], Z }),
    envelope: E ? (M) => (R, L, f) => E.envelope({ M, R, L, G: o.G, f }) : null,
    kappa: (rho, T, s) => K(rho, T, { X: s[iP], Y: 1 - Z - s[iP], Z }), kappaC: K,
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
/* the metals' opacity factor for a second-generation 4D star: κ_R with the mix over κ_R without, surface.js's gas at
   X, Y of the start, on log T 5–8 × log ρ 9–19 (kg/m⁴), bilinear in the logs, clamped at the edges */
function kappaFactor4(g) { const lt = Array.from({ length: 21 }, (_, i) => 5 + 0.15 * i), lr = Array.from({ length: 21 }, (_, i) => 9 + 0.5 * i);
  const X = 0.75 * (1 - g.Z), Y = 0.25 * (1 - g.Z), w0 = SURF.world(4, { X, Y }), w1 = SURF.world(4, { X, Y, Z: g.Z, metals: g.mix, metalsFF: !g.seeds });
  const F = lt.map((t) => lr.map((r) => Math.log(w1.kappaR(10 ** t, 10 ** r) / w0.kappaR(10 ** t, 10 ** r))));
  const at = (g0, x) => { const i = Math.max(0, Math.min(g0.length - 2, Math.floor((x - g0[0]) / (g0[1] - g0[0])))), u = Math.max(0, Math.min(1, (x - g0[i]) / (g0[1] - g0[0]))); return [i, u]; };
  return (rho, T) => { const [i, u] = at(lt, Math.log10(T)), [j, v] = at(lr, Math.log10(rho)); return Math.exp(F[i][j] * (1 - u) * (1 - v) + F[i + 1][j] * u * (1 - v) + F[i][j + 1] * (1 - u) * v + F[i + 1][j + 1] * u * v); }; }
/* gen2 (the second generation, PI 2026-11-18): { Z, mix: {Z: share by mass}, seeds, kappa }. seeds: the mix in the starting
   composition, each element up to the network's heaviest (16) as its N = Z isotope (or the nearest the network holds),
   heavier ones as an inert stand-in, the network's heaviest nucleus (declared). kappa: a factor on the structure's
   opacity, κ with the metals over κ without, from surface.js / metals.js on a grid of T and ρ at the gas's start (fixed
   in time; declared), bound–free only when the seeds are in (their free–free already counts in kappaFF4's Σ n Z²). */
function fourWorld(Grel, s, ff = 1, plasma = false, gen2 = null) {
  const sh = shell4(s, "ladder", { screen: plasma }), iP = sh.I["1-1"], A = sh.AS, Z = sh.ZS;
  const X0 = { "1-1": 0.75 * (gen2?.seeds ? 1 - gen2.Z : 1), "2-4": 0.25 * (gen2?.seeds ? 1 - gen2.Z : 1) };
  if (gen2?.seeds) { const top = sh.SPEC.at(-1); for (const [z, share] of Object.entries(gen2.mix)) { const k = [`${z}-${2 * z}`, `${z}-${2 * z + 1}`, `${z}-${2 * z - 1}`].find((x) => sh.SPEC.includes(x)) ?? top; X0[k] = (X0[k] ?? 0) + gen2.Z * share; } }
  const init = sh.fromX(X0), kf = gen2?.kappa ? kappaFactor4(gen2) : null;
  const parts = (y) => { let X = y[iP] * A[iP], He = 0, ions = 0, zz = 0; for (let i = 0; i < sh.NS; i++) { const x = y[i] * A[i]; zz += y[i] * Z[i] * Z[i]; if (i === iP) continue; if (Z[i] <= 2) He += x; else ions += y[i]; } return { X, He, ions, zz }; };
  const comp = (y) => { const p = parts(y); return { X: p.X, Y: p.He, Z: 14 * p.ions }; }; // rhoOf counts ions as X + Y/4 + Z/14
  // Tburn: shells cooler than this neither burn nor enter the structure's energy law. Ours' 2 MK sits far below the Sun's
  // burning; a 4D core at s 1.8–1.85 burns at 2.5–3.5 MK, so a 2 MK cut switched shells on and off as the star moved and
  // stalled the solve mid-life (evolve4-1/2, G 1e-11/1e-14). shell4.js gives nothing below 1 MK anyway.
  // loose: a Newton stall under 5 × 10⁻⁴ (a 0.05% mismatch at the fitting mass) counts as solved; pinned gravity's table
  // and the integrator's adaptive steps floor the residual near 10⁻⁵–10⁻⁴, under the strict 10⁻⁶ the solver aims for.
  // fit: where the shooting meets (mass fraction; ours 0.5). In a 4D core at 2.5–3.5 MK a change of 10⁻⁵ in ln T_c grew
  // ×300 by mid-mass, so the Jacobian went near-singular (P_c and T_c columns parallel) and Newton overshot: the mid-life
  // stall of evolve4-1/2. Meeting at 0.2 of the mass, the stalled G 1e-11 s 1.85 star runs on with no failed solve.
  return { name: `4D s ${s} G ${Grel} ff ${ff}`, d: 4, Tburn: 1e6, loose: +(process.env.LOOSE ?? 5e-4), fit: 0.2, G: G0 * Grel, pinned: true, Mch: fourNet(Grel, s, "ladder", ff).Mch, init: () => Float64Array.from(init), H: (y) => y[iP] * A[iP], comp,
    kappa: (rho, T, y) => { const p = parts(y); return kappaFF4({ X: p.X, Y: p.zz - p.X, Z: 0 }, ff, { plasma })(rho, T) * (kf ? kf(rho, T) : 1); },
    kcomp: (y) => { const p = parts(y); return { X: p.X, Y: p.zz - p.X, Z: 0 }; }, kappaC: (rho, T, c) => kappaFF4(c, ff, { plasma })(rho, T) * (kf ? kf(rho, T) : 1), // Y here carries Σ n Z² less hydrogen's
    eps: (rho, T, y) => sh.eps(rho, T, y), dHdt: (rho, T, y) => sh.dYdt(rho, T, y)[iP] * A[iP],
    burn: (rho, T, y, dt) => { const r = sh.burn(rho, T, y, dt); return { s: r.Y, E: r.E }; },
    burnZone: (rows, y, ws, dt) => { const K = new Float64Array(sh.RS.length); let sw = 0; rows.forEach((r, i) => { const k = sh.constants(r.T, r.rho, y); sw += ws[i]; for (let c = 0; c < K.length; c++) K[c] += ws[i] * k[c]; });
      for (let c = 0; c < K.length; c++) K[c] /= sw; const r = sh.burnK(K, y, dt); return { s: r.Y, E: r.E }; },
    // the first star: from the zero-age sequence's own star at this mass where mainseq.mjs net has one (its centre, size
    // and light as Newton's guess; a ladder star far from the analogue can defeat firstStar's search), else firstStar
    first: (M) => { const o = { ...fourNet(Grel, s, "ladder", ff), fit: 0.2 };
      const nf = path.join(DIR, `net-${Grel}-${s}-ladder-ff${ff}.json`), row = existsSync(nf) ? JSON.parse(readFileSync(nf, "utf8")).rows.find((r) => Math.abs(r.M / M - 1) < 0.01) : null;
      if (row) { const a = star({ ...o, M }, [Math.log(row.Pc), Math.log(row.Tc), Math.log(row.R), Math.log(row.L)]); if (a.ok) { const t = toPinned({ ...o, M }, a); if (t.ok) return t; } }
      const a = firstStar(o, M); if (!a) return null; return toPinned({ ...o, M }, a); },
    extra: (y) => Object.fromEntries(sh.SPEC.map((k, i) => [k, y[i] * A[i]]).filter(([, v]) => v > 1e-3)) };
}

const lerpState = (S, q) => { const [a, b, t] = bracket(QS, q); if (!t) return S[a]; const A = S[a], B = S[b], o = new Float64Array(A.length); for (let i = 0; i < A.length; i++) o[i] = A[i] * (1 - t) + B[i] * t; return o; };
/* each shell's ε(ρ, T) as a power law fitted at (ρ₀, T₀) */
function fitLaws(W, S, at) { return S.map((s, j) => { const { rho, T } = at[j]; if (!(T > (W.Tburn ?? 2e6)) || !(rho > 0)) return null; const e0 = W.eps(rho, T, s).eps; if (!(e0 > 0)) return null;
  const er = W.eps(rho * 1.02, T, s).eps, eT = W.eps(rho, T * 1.01, s).eps; return { l0: Math.log(e0), a: Math.log(er / e0) / Math.log(1.02), b: Math.log(eT / e0) / Math.log(1.01), lr: Math.log(rho), lT: Math.log(T) }; }); }
const law = (f, lr, lT) => (f ? Math.exp(f.l0 + f.a * (lr - f.lr) + f.b * (lT - f.lT)) : 0);
/* solve the star for the shells S: the fitted laws refitted at each solution until L settles */
/* ε_grav, implicit in each trial's own ρ and P, against a reference model on its dense integration path (a grid's
   interpolation error, ~10⁻⁴ in ln P, would swamp it). The reference is the latest earlier model whose central ρ differs
   from now by GREF (1%), else the oldest kept: on the main sequence ε_grav is a small difference of two large terms, and
   the shooting matches its two integrations only to ~10⁻⁵, so a baseline of one short step leaves noise as large as the
   burning and makes the solve stiff (a trial's small departure became an energy term many times the burning). It is
   left out while the reference is under KHMIN (1%) of the thermal time GM²/RL back, where it is negligible anyway. */
const GREF = +(process.env.GREF ?? 0.01), KHMIN = +(process.env.KHMIN ?? 0.01);
function gravRef(W, gr, comp) { if (!gr) return null; const P = gr.prof, ms = P.map((x) => x.m), lP = P.map((x) => Math.log(x.P)), lT = P.map((x) => Math.log(x.T));
  return { ms, lP, lT, comp, dt: gr.dt }; }
const epsGrav = (W, G, M, rho, m, P) => { const lP0 = interp(G.ms, G.lP, m), lT0 = interp(G.ms, G.lT, m), r0 = rhoOf(W.d, Math.exp(lP0), Math.exp(lT0), G.comp(m));
  return ((P / rho) * (((W.d + 2) / 2) * Math.log(rho / r0) - (W.d / 2) * (Math.log(P) - lP0))) / G.dt; };
function solve(W, M, S, guess, at0, f0 = null, scale = 1, gr = null) {

  // the EOS and opacity need only a few numbers from each shell: precomputed, then interpolated in q
  const CQ = S.map((y) => W.comp(y)), KQ = S.map((y) => (W.kcomp ? W.kcomp(y) : W.comp(y))), mixQ = (A, m) => { const [a, b, t] = bracket(QS, m / M); if (!t) return A[a]; const o = {}; for (const k in A[a]) o[k] = A[a][k] * (1 - t) + A[b][k] * t; return o; };
  const comp = (m) => mixQ(CQ, m), kap = W.kappaC ?? ((rho, T, c) => W.kappa(rho, T, null, c));
  const GR = gravRef(W, gr, comp);
  let at = at0, s = null, p = guess, last = null, f = f0;
  for (let k = 0; k < 8; k++) {
    const laws = fitLaws(W, S, at), eps = (rho, T, m, P) => { const [a, b, t] = bracket(QS, m / M), lr = Math.log(rho), lT = Math.log(T); return scale * (law(laws[a], lr, lT) * (1 - t) + law(laws[b], lr, lT) * t) + (GR && P > 0 ? epsGrav(W, GR, M, rho, m, P) : 0); };
    s = star({ d: W.d, M, G: W.G, comp: CQ[0], compAt: comp, eps, kappa: (rho, T, m) => kap(rho, T, mixQ(KQ, m)), ...(f ? { f } : {}), ...(W.envelope ? { envelope: W.envelope(M) } : {}), ...(W.loose ? { loose: W.loose } : {}), ...(W.fit ? { fit: W.fit } : {}) }, p);
    if (!s.ok) return { s }; p = s.p; at = sample(W, M, S, s).rows;
    if (process.env.DEBUG_SOLVE) console.log(`    solve ${k}: L ${s.L.toExponential(6)} (Newton ${s.it})`);
    if (last && Math.abs(Math.log(s.L / last)) < 1e-4) break; last = s.L;
  }
  // pinned gravity is held through the solve (pinnedF from a profile carries ~1% noise, which would never let L settle)
  // and updated once from the solution, damped, for the next one: it lags the star by one step, over which it barely moves
  if (W.pinned && s.ok && !process.env.FREEZE_PINNED) { const fo = f, fn = pinnedF(s.prof); f = fo ? (m) => 0.5 * (fo(m) + fn(m)) : fn; }
  // the whole star's gravothermal power on the composition grid (the solution's own P, ρ at each q)
  if (GR && s.ok) s.Lgrav = M * at.reduce((acc, r, j) => acc + WQ[j] * epsGrav(W, GR, M, r.rho, QS[j] * M, r.P), 0);
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
    if (sm.stir[j]) { let k = j; while (k + 1 <= NQ && sm.stir[k + 1]) k++; const idx = []; for (let i = j; i <= k; i++) if (at[i].T > (W.Tburn ?? 2e6)) idx.push(i);
      if (idx.length) { const r = W.burnZone(idx.map((i) => at[i]), S[j], idx.map((i) => WQ[i]), dt), sw = idx.reduce((a, i) => a + WQ[i], 0); E += sw * r.E; for (let i = j; i <= k; i++) O[i] = Float64Array.from(r.s); }
      else for (let i = j; i <= k; i++) O[i] = Float64Array.from(S[i]);
      j = k + 1; continue; }
    const { rho, T } = at[j]; if (!(T > (W.Tburn ?? 2e6))) O[j] = Float64Array.from(S[j]); else { const r = W.burn(rho, T, S[j], dt); E += WQ[j] * r.E; O[j] = r.s; } j++; }
  return { S: O, E }; };

function evolve(W, M, { dX = 0.01, tmax = 20 * GYR, Hstop = 1e-3, guess, label, settle = 0, ckpt = null, from = null }) {
  let S = Array.from({ length: NQ + 1 }, () => W.init()), t = 0;
  // a checkpoint (written every few minutes, so a run cut at a deadline resumes): the shells, the clock, the star's
  // unknowns and its last conditions, pinned gravity as a table, and what has been kept so far
  // from: another run's checkpoint to start from when this run has none of its own (a run past exhaustion, or with ε_grav,
  // picks up where its plain run stopped)
  const src = ckpt && existsSync(ckpt) ? ckpt : from && existsSync(path.join(DIR, from)) ? path.join(DIR, from) : null, C = src ? JSON.parse(readFileSync(src, "utf8")) : null;
  if (from && !src) throw new Error(`from: neither ${ckpt} nor ${path.join(DIR, from)} exists`);
  if (C) { const ft = C.fTab, fOf = ft ? (m) => { const [a, b, u] = bracket(ft.map((x) => x[0]), m); return ft[a][1] * (1 - u) + ft[b][1] * u; } : null;
    S = C.S.map((x) => Float64Array.from(x)); t = C.t; const r = solve(W, M, S, C.p, C.at, fOf); if (!r.s.ok) throw new Error(`resume: the checkpointed star didn't solve (${r.s.why}, residual ${r.s.res?.toExponential(2)} after ${r.s.it} Newton steps)`);
    console.log(`${label}: resumed at ${(t / GYR).toFixed(4)} Gyr from ${src}`); return run(r.s, r.f, C); }
  return run(null, null, null);
  function run(s1, g1, C) {
  // the first star: its laws fitted at a guessed profile, then re-solved to self-consistency
  // the zero-age star on the shell laws, from the first star on the network's law: directly, or, where the two laws
  // disagree too much for Newton (G 1e-11 s 1.5152: on the first star's profile the shell laws burn 80× the network's law), by
  // continuation: the shell laws scaled until they balance the first star's own light, then the scale walked to 1
  function firstShell(s0) { const at = sample(W, M, S, s0).rows, d = solve(W, M, S, s0.p, at, s0.f ?? null); if (d.s.ok) return d;
    const lnuc = at.reduce((t, r, j) => t + WQ[j] * (r.T > (W.Tburn ?? 2e6) ? W.eps(r.rho, r.T, S[j]).eps : 0), 0) * M; let k = s0.L / lnuc;
    if (process.env.DEBUG_SOLVE) console.log(`    first star L ${s0.L.toExponential(3)}, shell laws give ${lnuc.toExponential(3)} on its profile (×${k.toPrecision(3)}); direct solve ${d.s.why}, residual ${d.s.res?.toExponential(2)}`);
    if (!(k > 0) || Math.abs(Math.log(k)) < 1e-3) return d; let cur = solve(W, M, S, s0.p, at, s0.f ?? null, k); if (process.env.DEBUG_SOLVE) console.log(`    scaled solve: ${cur.s.ok ? "ok" : cur.s.why + " " + cur.s.res?.toExponential(2)}`); if (!cur.s.ok) return d; let step = 0.5;
    while (k !== 1) { const kn = k > 1 ? Math.max(1, k * Math.exp(-step)) : Math.min(1, k * Math.exp(step)), t = solve(W, M, S, cur.s.p, cur.at, cur.f, kn); if (!t.s.ok) { step /= 2; if (step < 1e-3) return t; continue; }
      cur = t; k = kn; step = Math.min(1, step * 1.5); console.log(`${label} zero age by continuation: shell laws ×${k.toFixed(3)}, L ${cur.s.L.toExponential(4)} W, Tc ${(cur.s.Tc / 1e6).toFixed(2)} MK`); }
    return cur; }
  const s0 = C ? null : W.first ? W.first(M) : star({ d: W.d, M, G: W.G, comp: W.comp(S[0]), eps: (rho, T) => W.eps(rho, T, S[0]).eps, kappa: (rho, T) => W.kappa(rho, T, S[0]), ...(W.envelope ? { envelope: W.envelope(M) } : {}) }, guess);
  if (!C && !s0?.ok) throw new Error(`zero-age star didn't solve (${s0?.why ?? "no first star"})`);
  let { s, f: grav } = C ? { s: s1, f: g1 } : firstShell(s0);
  if (!s.ok) throw new Error(`zero-age star didn't solve with shell laws (${s.why})`);
  let smp = sample(W, M, S, s), dtLast = C ? C.dtLast : 1e3 * YR, eBal = null, balRef = 1, lgrav = null;
  // ε_grav's references: the accepted models, newest last ({ t, rhoc, prof }); a resumed run starts with its checkpoint's
  const hist = []; const remember = () => { hist.push({ t, rhoc: smp.rows[0].rho, prof: s.prof }); if (hist.length > 400) hist.shift(); };
  const refFor = (tEnd) => { if (!W.grav || !hist.length) return null; const now = smp.rows[0].rho; let R = null;
    for (let k = hist.length - 1; k >= 0; k--) if (Math.abs(Math.log(now / hist[k].rhoc)) >= GREF) { R = hist[k]; break; }
    R = R ?? hist[0]; const dte = tEnd - R.t, tKH = (W.G * M * M) / (s.R * s.L); return dte >= KHMIN * tKH ? { prof: R.prof, dt: dte } : null; };
  // settling (settle > 0 years): fresh gas has none of its burning's intermediates; burn the shells for 10², 2 × 10², …
  // years up to `settle` at the star's own conditions, re-solving each time, and only then start the clock, so the
  // zero-age star has its short- and middle-lived nuclei in balance (the usual zero-age convention)
  const settled = C ? C.settled : []; for (let tp = 1e2, fails = 0; !C && tp <= settle * 1.0001; ) { const b = burnAll(W, S, smp, tp * YR), Sn = mix(b.S, smp.stir), f = solve(W, M, Sn, s.p, smp.rows, grav);
    if (!f.s.ok) { if (++fails > 6) throw new Error(`settling failed at ${tp.toPrecision(3)} yr (${f.s.why})`); tp /= 2; continue; } fails = 0;
    S = mix(Sn, sample(W, M, Sn, f.s).stir); s = f.s; grav = f.f; smp = sample(W, M, S, s); settled.push({ yr: tp, L: s.L, Tc: s.Tc, H: W.H(S[0]) }); console.log(`${label} settling ${tp.toPrecision(3)} yr: L ${s.L.toExponential(4)} W, Tc ${(s.Tc / 1e6).toFixed(2)} MK, central H ${W.H(S[0]).toFixed(5)}`); dtLast = tp * YR / 4; tp *= 2; }
  const track = C ? C.track : [], profiles = C ? C.profiles : [], keepProf = (s, smp) => profiles.push({ tGyr: t / GYR, R: s.R, L: s.L, rows: smp.rows.filter((_, j) => j % 10 === 0).map((r, i) => ({ q: r.q, r: +r.r.toPrecision(5), T: +r.T.toPrecision(5), rho: +r.rho.toPrecision(5), l: +r.l.toPrecision(5), H: +W.H(S[i * 10]).toPrecision(5), stir: smp.stir[i * 10], ...Object.fromEntries(Object.entries(W.extra(S[i * 10])).map(([k, v]) => [k, +v.toPrecision(4)])) })) });
  const keep = () => { const c = smp.rows[0], e = smp.rows.map((r, j) => W.eps(r.rho, r.T, S[j])), lpp = e.reduce((a, x, j) => a + WQ[j] * x.pp, 0), lcno = e.reduce((a, x, j) => a + WQ[j] * x.cno, 0);
    const lq = (f) => { for (let j = 1; j <= NQ; j++) if (smp.rows[j].l >= f) return QS[j]; return 1; };
    const row = { t, tGyr: t / GYR, L: s.L, R: s.R, Teff: teff(W.d, s), Tc: s.Tc, rhoc: c.rho, Pc: s.Pc, Xc: W.H(S[0]), qcc: convectiveCore(W.d, s), ppShare: lpp / (lpp + lcno), Lnuc: (lpp + lcno) * M, q50: lq(0.5), q90: lq(0.9), eBal, ...(W.grav ? { Lgrav: lgrav } : {}),
      Hq: Array.from({ length: 21 }, (_, i) => +W.H(lerpState(S, i / 20)).toFixed(5)), centre: W.extra(S[0]) };
    track.push(row); console.log(`${label} ${row.tGyr.toFixed(3)} Gyr: ${W.d === 3 ? `L ${(s.L / LSUN).toFixed(4)} L☉, R ${(s.R / RSUN).toFixed(4)} R☉` : `L ${s.L.toExponential(4)} W, R ${s.R.toExponential(4)} m`}, Teff ${row.Teff.toFixed(0)} K, Tc ${(s.Tc / 1e6).toFixed(2)} MK, ρc ${W.d === 3 ? `${(c.rho / 1000).toFixed(1)} g/cm³` : `${c.rho.toExponential(3)} kg/m⁴`}, Xc ${row.Xc.toFixed(4)}, stirred core ${row.qcc.toFixed(3)}, pp ${(row.ppShare * 100).toFixed(1)}%, half the light inside q ${row.q50.toFixed(3)}${eBal ? `, burnt/radiated ${eBal.toFixed(4)}` : ""}${lgrav != null ? `, contraction ${(100 * lgrav / s.L).toFixed(2)}% of L` : ""}`); };
  // profiles at every 0.5 Gyr (ours) and as the centre's hydrogen falls past 90%, 80%, … 10%, 1% of its start (both)
  const H0 = W.H(W.init()), fracs = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.01]; let nextProf = C ? C.nextProf : 0.5, nextFrac = C ? C.nextFrac : 0, lastCk = Date.now();
  const save = () => { if (!ckpt) return; const ft = W.pinned && grav ? s.prof.filter((_, i) => i % 4 === 0).map((q) => [q.m, grav(q.m)]) : null;
    writeFileSync(ckpt + ".part", JSON.stringify({ S: S.map((x) => Array.from(x)), t, dtLast, p: s.p, at: smp.rows.map((r) => ({ rho: r.rho, T: r.T })), fTab: ft, track, profiles, settled, nextProf, nextFrac })); renameSync(ckpt + ".part", ckpt); lastCk = Date.now(); };
  if (!C) { keep(); keepProf(s, smp); } if (W.grav) remember();
  for (let n = 0; n < 3000 && t < tmax && W.H(S[0]) > Hstop; n++) {
    let dt = dtLast * 2; for (let j = 0; j <= NQ; j++) { const r = smp.rows[j]; if (!(r.T > (W.Tburn ?? 2e6))) continue; const h = W.H(S[j]), d = W.dHdt(r.rho, r.T, S[j]); if (d < 0) dt = Math.min(dt, dX / -d, (0.1 * Math.max(h, Hstop)) / -d); }
    if (process.env.DEBUG_DT) { let jm = -1, dm = Infinity; for (let j = 0; j <= NQ; j++) { const r = smp.rows[j]; if (!(r.T > (W.Tburn ?? 2e6))) continue; const d = W.dHdt(r.rho, r.T, S[j]); if (d < 0 && dX / -d < dm) { dm = dX / -d; jm = j; } } console.log(`    dt ${(dt / YR).toExponential(2)} yr; the tightest shell q ${QS[jm]?.toFixed(4)} T ${(smp.rows[jm]?.T / 1e6).toFixed(2)} MK, X ${W.H(S[jm]).toFixed(4)}, dX/dt ${(-dX / dm * YR).toExponential(2)} /yr`); }
    dt = Math.min(dt, tmax - t); let done = false, prevBal = null;
    for (let tries = 0; tries < 6 && !done; tries++) {
      const h1 = burnAll(W, S, smp, dt / 2), Sh = mix(h1.S, smp.stir), h = solve(W, M, Sh, s.p, smp.rows, grav, 1, refFor(t + dt / 2)); if (!h.s.ok) { if (process.env.DEBUG_SOLVE) console.log(`    half-step solve failed (${h.s.why}, residual ${h.s.res?.toExponential(2)}, Newton ${h.s.it}), dt ${(dt / YR).toExponential(2)} yr`); dt /= 2; continue; }
      const smh = sample(W, M, Sh, h.s), b = burnAll(W, S, smh, dt), bal = (b.E * M + (h.s.Lgrav ?? 0) * dt) / (h.s.L * dt); // what the shells burnt (and, with grav, the star's contraction released) over the step against what the half-way star radiated
      // the step's energy doesn't add up: shorter, unless halving it left the mismatch where it was. A step's own error
      // falls about fourfold a halving (second order); one that doesn't fall is structural (a stirred core's short-lived
      // nuclei, ⁷Be's branch above all, are uniform in its zone burn but in balance shell by shell in the structure: up
      // to ~0.5% of the energy in a CNO core), and is recorded rather than chased
      // once a mismatch is known to be structural, later steps are judged against its level, not against 1
      const structural = prevBal != null && Math.abs(bal - prevBal) < BALTOL / 3;
      if (Math.abs(bal - balRef) > BALTOL && !structural && tries < 5 && dt > 1e3 * YR) { prevBal = bal; dt /= 2; continue; }
      balRef = structural || Math.abs(bal - 1) > BALTOL ? bal : 1;
      const Sn = mix(b.S, smh.stir), f = solve(W, M, Sn, h.s.p, smh.rows, h.f, 1, refFor(t + dt)); if (!f.s.ok) { if (process.env.DEBUG_SOLVE) console.log(`    full-step solve failed (${f.s.why}, residual ${f.s.res?.toExponential(2)}, Newton ${f.s.it})`); dt /= 2; continue; }
      // with grav, a step that moves the centre's density by more than DRHO (5%) is too long for the backward difference
      const dRho = W.grav ? Math.abs(Math.log(rhoOf(W.d, f.s.prof[0].P, f.s.prof[0].T, W.comp(Sn[0])) / smp.rows[0].rho)) : 0;
      if (W.grav && tries < 5 && dRho > DRHO) { if (process.env.DEBUG_SOLVE) console.log(`    centre ρ moved ${(100 * dRho).toFixed(1)}%: halving`); dt /= 2; continue; }
      eBal = bal; grav = f.f; lgrav = h.s.Lgrav ?? null;
      if (process.env.DEBUG_BAL) { const bands = [0, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1.01], acc = bands.slice(1).map(() => [0, 0]);
        for (let j = 0; j <= NQ; j++) { const r = smh.rows[j]; if (!(r.T > (W.Tburn ?? 2e6))) continue; const k = bands.findIndex((x, i) => QS[j] >= x && QS[j] < bands[i + 1]), e = W.eps(r.rho, r.T, Sh[j]).eps, eb = W.burn(r.rho, r.T, S[j], dt).E / dt; acc[k][0] += WQ[j] * e; acc[k][1] += WQ[j] * eb; }
        console.log(`  balance by q band (burnt/structure): ${acc.map(([e, b], i) => `${bands[i]}–${bands[i + 1]}: ${(b / e).toFixed(4)} (${((e * M) / h.s.L * 100).toFixed(1)}%)`).join("; ")}`); }
      const smn = sample(W, M, Sn, f.s); S = mix(Sn, smn.stir); s = f.s; smp = smn; t += dt; dtLast = dt; done = true; if (W.grav) remember();
    }
    if (!done) { console.log(`${label}: stopped at ${(t / GYR).toFixed(3)} Gyr, Xc ${W.H(S[0]).toFixed(4)} (the star didn't solve on a smaller step)`); return { track, profiles, settled, stopped: `no solution past Xc ${W.H(S[0]).toFixed(4)}` }; }
    keep(); let kp = false; if (W.d === 3 && t / GYR >= nextProf) { kp = true; nextProf += 0.5; }
    // past central exhaustion (Hstop < 10⁻³), a profile every 10 models: the core's growth is what such a run is for
    if (Hstop < 1e-3 && W.H(S[0]) < 1e-3 && track.length % 10 === 0) kp = true; while (nextFrac < fracs.length && W.H(S[0]) <= fracs[nextFrac] * H0) { kp = true; nextFrac++; } if (kp) keepProf(s, smp);
    if (Date.now() - lastCk > +(process.env.CKPT_EVERY ?? 180) * 1e3) save();
  }
  keepProf(s, smp); save();
  return { track, profiles, settled, stopped: W.H(S[0]) <= Hstop ? `central hydrogen below ${Hstop}` : t >= tmax * (1 - 1e-9) ? "tmax" : "step limit" };
  }
}

if (cmd === "ours") {
  const kv = Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => a.split("="))), pos = args.filter((a) => !a.includes("=") && a !== "simple");
  const m = +(pos[0] ?? 1), dX = +(pos[1] ?? 0.01), simple = args.includes("simple"), X0 = +(kv.X0 ?? 0.70), tmax = kv.tmax ? +kv.tmax * GYR : 20 * GYR;
  const Z = +(kv.Z ?? 0.02), kap = kv.kap ?? "kramers", alpha = +(kv.alpha ?? 0), settle = +(kv.settle ?? 0);
  const W = simple ? simpleWorld(X0) : networkWorld(X0, Z, { kap, alpha }), t0 = Date.now(); W.grav = kv.grav === "1";
  const file = path.join(DIR, `evolve-ours-${m}${simple ? "-simple" : ""}${dX !== 0.01 ? `-dX${dX}` : ""}${kv.X0 ? `-X${X0}` : ""}${kv.Z ? `-Z${Z}` : ""}${kap !== "kramers" ? `-${kap}` : ""}${alpha ? `-a${alpha}` : ""}${settle ? `-s${kv.settle}` : ""}${W.grav ? "-eg" : ""}${kv.tmax ? `-to${kv.tmax}` : ""}.json`);
  // the first guess: the 1 M☉ zero-age star under the simple law, walked in mass to m in steps of ×1.12 (as mainseq.mjs
  // ours walks its sequence), each star's unknowns extrapolated from the last two
  const o = ours(), walk = () => { let p = [Math.log(2.3e16), Math.log(1.4e7), Math.log(0.9 * RSUN), Math.log(0.7 * LSUN)], hist = [], mm = 1; const dir = m >= 1 ? 1.12 : 1 / 1.12;
    for (let k = 0; k < 60; k++) { const g = hist.length >= 2 ? hist[1].p.map((v, i) => v + (Math.log(mm / hist[1].m) / Math.log(hist[1].m / hist[0].m)) * (v - hist[0].p[i])) : p, st = star({ ...o, M: mm * MSUN }, g);
      if (!st.ok) throw new Error(`the zero-age walk failed at ${mm.toFixed(3)} M☉`); p = st.p; hist = [...hist.slice(-1), { m: mm, p }]; if (Math.abs(mm - m) < 1e-9) return p; mm = (dir > 1 ? Math.min(m, mm * dir) : Math.max(m, mm * dir)); }
    return p; };
  const r = evolve(W, m * MSUN, { dX, tmax, ckpt: file.replace(/\.json$/, ".ckpt.json"), label: `${m} M☉ ${W.name} X0 ${X0}`, guess: walk(), settle });
  writeFileSync(file, JSON.stringify({ about: `atom/tools/evolve.mjs ours: our star's main sequence (${W.name} burning, ${kap} opacity${alpha ? `, envelope α ${alpha}` : ""}), burnt shell by shell, stirred regions mixed`, m, dX, X0, Z, kap, alpha, NQ, burning: W.name, grav: W.grav, stopped: r.stopped, track: r.track, profiles: r.profiles }));
  console.log(`wrote ${file} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.track.length} models; ${r.stopped})`);
} else if (cmd === "four") {
  // gen2=<held|rock> Z2=<Z, 0.02> parts=<seeds,kappa (both)>: a second-generation star. held: the Sun analogue's own held
  // ash at this G and s (papers/p2/data/ash4.json, elements 4–23 by mass); rock: elements 13–23 evenly
  function gen2Of(kv, G, s) { const Zm = +(kv.Z2 ?? 0.02), parts = (kv.parts ?? "seeds,kappa").split(",");
    let mix; if (kv.gen2 === "rock") mix = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [13 + i, 1 / 11]));
    else { const A4 = JSON.parse(readFileSync(new URL("../../papers/p2/data/ash4.json", import.meta.url), "utf8")).stars.filter((x) => x.G === G && x.s === s), a = A4.find((x) => !(G === 1e-17 && s === 1.5152) || Math.abs(x.m - 0.7812) < 0.01);
      if (!a) throw new Error(`gen2: no held ash for G ${G}, s ${s} in ash4.json`); const h = Object.entries(a.made).filter(([z]) => +z >= 4 && +z <= 23), t = h.reduce((q, [, v]) => q + v, 0); mix = Object.fromEntries(h.map(([z, v]) => [z, v / t])); }
    return { Z: Zm, mix, seeds: parts.includes("seeds"), kappa: parts.includes("kappa") }; }
  // node four/atom/tools/evolve.mjs four <G × ours> <s> <mass in M_Ch | sun> [dX] [ff=1] [tmax=<Gyr>] [settle=<yr, 1e6>] [plasma=1] [grav=1] [Hstop=<central H to stop at, 1e-3>]
  // grav=1: ε_grav in the structure (files -eg). A run can start from an old run's checkpoint copied to its -eg name.
  // Hstop below 10⁻³ (files -Hs<x>) carries a star past the end of its central hydrogen, keeping a profile every 10 models.
  // from=<checkpoint file name in the cache>: start there when this run has no checkpoint of its own.
  // plasma: the charge law's plasma, on by default: the lens vacuum's cutoff in the opacity (mainseq.js kappaFF4) and
  // screening of the network's rates (shell4.js, atom/js/screen.js); its runs' files carry -lp
  const kv = Object.fromEntries(args.filter((a) => a.includes("=")).map((a) => a.split("="))), pos = args.filter((a) => !a.includes("="));
  const Grel = +pos[0], sv = +pos[1], ff = +(kv.ff ?? 1), dX = +(pos[3] ?? 0.01), tmax = kv.tmax ? +kv.tmax * GYR : 200 * GYR, plasma = kv.plasma !== "0", Hstop = +(kv.Hstop ?? 1e-3), gen2 = kv.gen2 ? gen2Of(kv, Grel, sv) : null, W = fourWorld(Grel, sv, ff, plasma, gen2), t0 = Date.now(); W.grav = kv.grav === "1";
  let m = pos[2]; if (m === "sun") { const GR = JSON.parse((await import("node:fs")).readFileSync(new URL("../../papers/p2/data/gravity.json", import.meta.url), "utf8")).runs, r = GR.find((x) => x.G === Grel && x.s === sv); if (!r?.sun) throw new Error(`no Sun analogue at G ${Grel}, s ${sv} in gravity.json`); m = r.sun.m; }
  m = +m; const file = path.join(DIR, `evolve-four-${pos[0]}-${pos[1]}-${(+m).toPrecision(4)}${ff !== 1 ? `-ff${ff}` : ""}${plasma ? "-lp" : ""}${gen2 ? `-g2${kv.gen2}-Z${gen2.Z}-${gen2.seeds ? "s" : ""}${gen2.kappa ? "k" : ""}` : ""}${W.grav ? "-eg" : ""}${dX !== 0.01 ? `-dX${dX}` : ""}${kv.Hstop ? `-Hs${kv.Hstop}` : ""}${kv.tmax ? `-to${kv.tmax}` : ""}.json`);
  const r = evolve(W, m * W.Mch, { dX, tmax, Hstop, from: kv.from ?? null, settle: +(kv.settle ?? 1e6), ckpt: file.replace(/\.json$/, ".ckpt.json"), label: `4D G ${Grel} s ${sv} ${m.toPrecision(4)} M_Ch` });
  writeFileSync(file, JSON.stringify({ about: "atom/tools/evolve.mjs four: a 4D star's main sequence on the 4D network, burnt shell by shell, stirred regions mixed", Grel, s: sv, ff, plasma, m, Mch: W.Mch, dX, NQ, settle: +(kv.settle ?? 1e6), grav: W.grav, settled: r.settled, stopped: r.stopped, track: r.track, profiles: r.profiles }));
  console.log(`wrote ${file} (${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.track.length} models; ${r.stopped})`);
} else console.log("commands: ours [M☉] [dX] [simple] [X0=] [tmax=] | four <G> <s> <M_Ch|sun> [dX] [ff=] [tmax=]");
