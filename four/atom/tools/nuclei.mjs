/* The abundance question's nuclear runs (js/nuclear.js), each cached as JSON in $TMPDIR/atom4-nuclei so the runner can
   carry the long ones and `bake` can gather them. Every command takes the force as a last word: MT (Malfliet–Tjon, the
   default) or MN (Minnesota, the second force that checks nothing hangs on the first's shape):
     node four/atom/tools/nuclei.mjs fit [MN]                    our nuclear matter (3D), and the three-nucleon strength
                                                                 that saturates it at −16 MeV
     node four/atom/tools/nuclei.mjs matter <d> <s> <kind> [MN]  nuclear matter over a range of densities (kind:
                                                                 symmetric | neutron), the force's attraction × s
     node four/atom/tools/nuclei.mjs he4 <d> <s> <b|none> [A] [MN]  helium-4 (or A = 2, 3) by diffusion Monte Carlo, with
                                                                 the three-nucleon force of range b fm, or without; and
                                                                 its mean-square radius (the mixed estimate)
     node four/atom/tools/nuclei.mjs cluster [MN]                light nuclei as helium-4 clusters: the folding factors
                                                                 calibrated on our ⁸Be and ⁵He, then 4D's across the
                                                                 window (needs he4's radii without the three-nucleon force)
     node four/atom/tools/nuclei.mjs ladder <d> <s> <N> [MN]     N helium-4s (the ladder: carbon is 3, pxygen 5) by Monte
                                                                 Carlo on the supersymmetric pair potential (needs he4's radii)
     node four/atom/tools/nuclei.mjs capture [MN]                the first capture, two helium-4s → beryllium-8 + light
                                                                 (E2), across 4D's window: its nuclear factor against our
                                                                 ¹²C(α,γ)¹⁶O's, and the temperature that matches its rate
     node four/atom/tools/nuclei.mjs brink <d> <s> <b> <N>        N helium-4s microscopically (js/brink.js: Brink's clusters,
                                                                 antisymmetrized, Minnesota plus the three-nucleon force of
                                                                 range b, its exchange mixture u set on our ⁸Be), bases of
                                                                 240 and 480 placements; N = 2 also gives the 2⁺
     node four/atom/tools/nuclei.mjs mass5 <d> <s> <b>            a nucleon on a helium-4 microscopically (Brink, antisymmetrized,
                                                                 Minnesota + the three-nucleon force of range b, u set on our
                                                                 ⁸Be): mass 5's lowest s-, p- and d-states, neutron and proton
     node four/atom/tools/nuclei.mjs burning                      how far stars build: the smallest core (× its Chandrasekhar
                                                                 mass) that lights each stage, ours as the check, then 4D's
                                                                 hydrogen, helium (the first capture) and each helium-4 rung
     node four/atom/tools/nuclei.mjs rungcap [MN]                 the ladder's rungs past the first: helium-4 onto 2–5 helium-4s
                                                                 by E2 (folded potential, one depth per rung set on its capture
                                                                 energy from the ladder and from Brink), ours' ¹²C(α,γ) the check
     node four/atom/tools/nuclei.mjs bake                        → js/nucleidata.js
   The three-nucleon force is W Σ_cyclic e^(−(r_ij² + r_ik²)/b²); fit gives c = W π³ b⁶/2 (its Hartree energy per nucleon
   in our matter is c ρ²), so W = 2c/(π³ b⁶) for each b, and in 4D the same W and b give c₄ = c π b². */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { matter, fixedNode, window as nucWindow, MT, MN, mtPot, coulombFactor, THREE_C, THREE_C_MN, threeForce, alphaWidth, alphaPair, alphaNucleon, calibrate, alphaLocal, alphaDMC, calibrateLocal, alphaCapture, deepNuclear, nucleonCapture, nucleonPot, levels, HB2M, foldCore, rungFactor, rungCapture } from "../js/nuclear.js";
import { criticalZ } from "../js/dirac.js";
import * as BR from "../js/brink.js";
import * as BB from "../js/bbn.js";
import { logRate, gamow, KB_MEV, matchingTemperature } from "../js/stars.js";
import * as BU from "../js/burning.js";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-nuclei"); mkdirSync(DIR, { recursive: true });
const save = (name, obj) => { writeFileSync(path.join(DIR, name), JSON.stringify(obj)); console.log("wrote", name); };
const load = (name) => (existsSync(path.join(DIR, name)) ? JSON.parse(readFileSync(path.join(DIR, name), "utf8")) : null);
const KF = { 3: [0.6, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.36, 1.45, 1.55, 1.7, 1.85, 2.0], 4: [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.35, 2.5, 2.7] };
export const B_RANGE = [0.7, 1.0, 1.4];
/* each force: its terms, its fitted three-nucleon strength, and 4D's window (the deuteron binds; binds as ours; the
   diproton binds), from nuclear.js's window(4, force) */
export const FORCES = { MT: { F: MT, c: THREE_C, s4: [1.2292, 1.2986, 1.4993], pre: "" }, MN: { F: MN, c: THREE_C_MN, s4: [1.4002, 1.5152, 1.8909], pre: "MN-" } };
export const LAMBDA_FACTORS = [0.8, 1, 1.25];
const tag = (x) => String(x).replace(".", "p");
const R2_OURS = 2.13; // our helium-4's mean-square point-nucleon radius, fm² (1.46 fm)

function scan(d, s, kind, F) {
  const rows = [];
  for (const kF of KF[d]) { const t = Date.now(), r = matter({ d, s, kF, kind, force: F }); rows.push({ kF, rho: r.rho, E2: r.E2, A: r.U.A, B: r.U.B }); console.log(`d=${d} s=${s} ${kind} kF=${kF} ρ=${r.rho.toPrecision(4)} E2/A=${r.E2.toFixed(3)} (${Date.now() - t} ms)`); }
  return rows;
}
/* along a scan (E2 per nucleon against ρ), the minimum of E2 + c ρ², interpolated in ln ρ */
export function saturation(rows, c) {
  const r = [...rows].sort((a, b) => a.rho - b.rho), at = (rho) => { for (let i = 0; i + 1 < r.length; i++) if (rho >= r[i].rho && rho <= r[i + 1].rho) { const f = (Math.log(rho) - Math.log(r[i].rho)) / (Math.log(r[i + 1].rho) - Math.log(r[i].rho)); return r[i].E2 + f * (r[i + 1].E2 - r[i].E2); } return null; };
  let best = { E: Infinity, rho: null, edge: false }; const lo = Math.log(r[0].rho), hi = Math.log(r[r.length - 1].rho);
  for (let x = lo; x <= hi; x += 0.002) { const rho = Math.exp(x), E = at(rho) + c * rho * rho; if (E < best.E) best = { E, rho, edge: hi - x < 0.01 }; }
  return { ...best, at: (rho) => at(rho) + c * rho * rho };
}

/* the well's bottom, from the scan: a parabola in ρ through the three points round the minimum gives ρ₀ and E/A, and the
   bulk modulus K = d² ρ₀² ∂²(E/A)/∂ρ² (9ρ₀² … in ours). With them the signs of a model leaving its domain: the free kinetic
   energy (d/(d + 2)) ε_F and the rest as potential, the Fermi speed ħk_F/mc, the sound speed √(K/d²m) and the binding over
   the nucleon's rest mass. Trusted: the minimum resolved inside the scan and sound slower than c/2 */
const MNUC = 938.92, HBC = 197.327, BALLV = { 3: (4 * Math.PI) / 3, 4: (Math.PI * Math.PI) / 2 };
export function wellOf(d, rows, c) {
  const r = [...rows].sort((a, b) => a.rho - b.rho).map((x) => ({ rho: x.rho, E: x.E2 + c * x.rho * x.rho }));
  let i = r.reduce((b, x, k) => (x.E < r[b].E ? k : b), 0); const edge = i === 0 || i === r.length - 1; i = Math.min(Math.max(i, 1), r.length - 2);
  const [p, q, t] = [r[i - 1], r[i], r[i + 1]], den = (p.rho - q.rho) * (p.rho - t.rho) * (q.rho - t.rho);
  const A = (t.rho * (q.E - p.E) + q.rho * (p.E - t.E) + p.rho * (t.E - q.E)) / den, B = (t.rho ** 2 * (p.E - q.E) + q.rho ** 2 * (t.E - p.E) + p.rho ** 2 * (q.E - t.E)) / den, C0 = q.E - A * q.rho ** 2 - B * q.rho;
  const rho0 = -B / (2 * A), E = A * rho0 * rho0 + B * rho0 + C0, kF = Math.pow((rho0 * (2 * Math.PI) ** d) / (4 * BALLV[d]), 1 / d), T = (d / (d + 2)) * (41.47106 / 2) * kF * kF, K = d * d * rho0 * rho0 * 2 * A;
  const cs = Math.sqrt(Math.max(0, K) / (d * d * MNUC)), vF = (HBC * kF) / MNUC;
  return { rho0, E, T, V: E - T, K, kF, cs, vF, bind: -E / MNUC, spacing: Math.pow(rho0, -1 / d), edge, trusted: !edge && cs < 0.5 };
}

let [cmd, ...args] = process.argv.slice(2);
const fname = args[args.length - 1] === "MN" ? "MN" : "MT"; if (args[args.length - 1] === "MN" || args[args.length - 1] === "MT") args = args.slice(0, -1);
const FC = FORCES[fname];
if (cmd === "fit") {
  const name = `${FC.pre}matter-3-1-symmetric.json`, rows = load(name)?.rows ?? scan(3, 1, "symmetric", FC.F); save(name, { force: fname, d: 3, s: 1, kind: "symmetric", rows });
  let lo = 50, hi = 3000; for (let i = 0; i < 60; i++) { const c = (lo + hi) / 2; if (saturation(rows, c).E < -16) lo = c; else hi = c; }
  const c = (lo + hi) / 2, sat = saturation(rows, c); save(`${FC.pre}fit.json`, { force: fname, c, rho0: sat.rho, E0: sat.E });
  console.log(`${fname}: c = ${c.toFixed(1)} MeV fm⁶: our matter saturates at ${sat.rho.toFixed(4)} fm⁻³, ${sat.E.toFixed(2)} MeV`);
} else if (cmd === "matter") {
  const [d, s, kind] = [+args[0], +args[1], args[2]]; save(`${FC.pre}matter-${d}-${tag(s)}-${kind}.json`, { force: fname, d, s, kind, rows: scan(d, s, kind, FC.F) });
} else if (cmd === "he4") {
  const [d, s, bArg, A = 4] = [+args[0], +args[1], args[2], +(args[3] ?? 4)], three = bArg === "none" ? null : threeForce(+bArg, FC.c);
  const counts = A === 4 ? [1, 1, 1, 1] : A === 3 ? [1, 0, 1, 1] : [0, 0, 1, 1], runs = [];
  for (const seed of [1, 2]) { const t = Date.now(), r = fixedNode({ d, counts, V: { v: (x, ss) => mtPot(FC.F.v, ss)(x) }, s, like: "same", steps: 30000, tau: 1e-4, seed, equil: 5000, omega: 0.5, three, coulomb: false }); runs.push({ E: r.E, err: r.err, r2: r.r2 }); console.log(`${fname} d=${d} A=${A} s=${s} b=${bArg} seed ${seed}: ${r.E.toFixed(3)} ± ${r.err.toFixed(3)} MeV, r² ${r.r2.toFixed(3)} (${((Date.now() - t) / 1000).toFixed(0)} s)`); }
  const w = runs.map((r) => 1 / r.err ** 2), E = runs.reduce((t, r, i) => t + r.E * w[i], 0) / w.reduce((a, b) => a + b, 0), err = 1 / Math.sqrt(w.reduce((a, b) => a + b, 0)), r2 = runs.reduce((t, r) => t + r.r2, 0) / runs.length;
  save(`${FC.pre}he-${d}-${tag(s)}-${bArg}-${A}.json`, { force: fname, d, s, b: bArg, A, three, E, err, r2, runs });
} else if (cmd === "cluster") {
  // helium-4's size in each world from the Monte Carlo's mean-square radii (mixed estimates, biased alike), ours scaled to its
  // measured 2.13 fm²; the folding factors calibrated on ours, then two helium-4s and a neutron on one in 4D
  const he = (d, s) => load(`${FC.pre}he-${d}-${tag(s)}-none-4.json`), h3 = he(3, 1); if (!h3?.r2) throw new Error("run he4 3 1 none first (with radii)");
  const a3 = alphaWidth(3, R2_OURS), lamPair = calibrate("pair", FC.F, a3), lamN = calibrate("nucleon", FC.F, a3), rows = [];
  console.log(`${fname}: folding factors calibrated on ours: two helium-4s ${lamPair.toFixed(3)}, a nucleon on one ${lamN.toFixed(3)}`);
  for (const s of FC.s4) {
    const h4 = he(4, s); if (!h4?.r2) { console.log(`  no radius for 4D s ${s}: run he4 4 ${s} none ${fname}`); continue; }
    const r2 = (R2_OURS * h4.r2) / h3.r2, a4 = alphaWidth(4, r2);
    for (const f of LAMBDA_FACTORS) { const pair = alphaPair(4, FC.F, s, a4, lamPair * f), nuc = alphaNucleon(4, FC.F, s, a4, lamN * f) ?? null; rows.push({ s, f, r2, pair, nucleon: nuc }); console.log(`  4D s ${s} λ×${f}: two helium-4s ${pair.toFixed(2)} MeV, a neutron on one ${nuc === null ? "unbound" : nuc.toFixed(2) + " MeV"}`); }
  }
  save(`${FC.pre}cluster.json`, { force: fname, R2_OURS, a3, lamPair, lamN, rows });
} else if (cmd === "ladder") {
  const [d, s, N] = [+args[0], +args[1], +args[2]], he = (dd, ss) => load(`${FC.pre}he-${dd}-${tag(ss)}-none-4.json`), h3 = he(3, 1);
  const r2 = d === 3 ? R2_OURS : (R2_OURS * he(4, s).r2) / h3.r2, a = alphaWidth(d, r2), lam = calibrateLocal(FC.F), V = alphaLocal(d, FC.F, s, a, lam).V, runs = [];
  for (const seed of [1, 2]) { const t = Date.now(), r = alphaDMC({ d, N, V, steps: 16000, equil: 4000, seed }); runs.push(r); console.log(`${fname} d=${d} s=${s} N=${N} seed ${seed}: ${r.E.toFixed(3)} ± ${r.err.toFixed(3)} MeV (${((Date.now() - t) / 1000).toFixed(0)} s)`); }
  const w = runs.map((r) => 1 / Math.max(r.err, 1e-3) ** 2), E = runs.reduce((t, r, i) => t + r.E * w[i], 0) / w.reduce((x, y) => x + y, 0), err = Math.max(1 / Math.sqrt(w.reduce((x, y) => x + y, 0)), Math.abs(runs[0].E - runs[1].E) / 2);
  save(`${FC.pre}ladder-${d}-${tag(s)}-${N}.json`, { force: fname, d, s, N, lam, r2, E, err, runs: runs.map((r) => ({ E: r.E, err: r.err })) });
} else if (cmd === "capture") {
  // the barrier the stars chapter's tunnelling counts (nuclei of radius r₀ A^(1/d): 1.2 fm ours, 1.0 fm 4D), and our
  // yardstick, ¹²C(α,γ)¹⁶O at 300 keV: like for like, its E2 capture to the ground state, S = 45 keV b (deBoer et al. 2017)
  // to 70 ± 7 (Shen et al. 2020); for the matched temperature the whole reaction (E1 too), 140 to 162 keV b, since that's
  // what the stars chapter's 0.2 billion K is. S̃ = σ k^(d−1) e^G is what's left once the barrier is taken off,
  // dimensionless in any d
  const AMU = 931.494, op4 = { Z1: 2, Z2: 2, mu: 2 * AMU, rn: 2 * Math.pow(4, 0.25), d: 4 }, op3 = { Z1: 2, Z2: 6, mu: 3 * AMU, rn: 1.2 * (Math.cbrt(4) + Math.cbrt(12)), d: 3 };
  const E3 = 0.3, eta3 = (12 / 137.035999) * Math.sqrt(op3.mu / (2 * E3)), k3sq = (2 * op3.mu * E3) / HBC ** 2;
  const St3 = (S) => ((S / 1000) * 100 / E3) * Math.exp(-2 * Math.PI * eta3) * k3sq * Math.exp(gamow(E3, op3)), ours = [45, 70].map(St3), total = [140, 162].map(St3);
  const tgt = total.map((x) => logRate(2e8, op3) + Math.log(x)), Tmatch = (lnS, t) => { let lo = 1e6, hi = 1e10; for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (logRate(m, op4) + lnS < t) lo = m; else hi = m; } return Math.sqrt(lo * hi); };
  const peak = (T) => { const kT = KB_MEV * T; let best = 0, bv = -Infinity; for (let E = kT / 4; E < 80 * kT; E *= 1.01) { const v = -E / kT - gamow(E, op4); if (v > bv) { bv = v; best = E; } } return best; };
  const he = (dd, ss) => load(`${FC.pre}he-${dd}-${tag(ss)}-none-4.json`), h3 = he(3, 1), lam = calibrateLocal(FC.F), rows = [];
  for (const s of FC.s4) {
    const a = alphaWidth(4, (R2_OURS * he(4, s).r2) / h3.r2), deep = deepNuclear(4, FC.F, s, a, lam), pts = [];
    for (const T of [3e7, 1e8]) { const E = peak(T), R = alphaCapture({ d: 4, F: FC.F, s, a, lam, E, deep }), St = R.sigma * R.k ** 3 * Math.exp(gamow(E, op4)); pts.push({ T, E, S: St, sigma: R.sigma, parts: R.parts }); }
    // the first minutes' tables: σv against relative energy for two helium-4s (E2), and a proton or a neutron on one (E1)
    // mass 5's binding from the microscopic calculation (Minnesota's, mass5, range 1.0 fm, at the same place in the window;
    // Malfliet–Tjon has none of its own): unbound, no nucleon capture; bound, the folded potential's factor reset so its
    // p-state sits there, and the capture computed with it
    const iw = FC.s4.indexOf(s), m5 = load(`mass5-4-${tag(FORCES.MN.s4[iw])}-1.json`), E5 = m5 ? m5.states["1n"] : null, Eg = Array.from({ length: 24 }, (_, i) => 0.002 * Math.pow(1500, i / 23));
    let lam5 = null; if (E5 !== null && E5 < 0) { const pE = (lm) => levels(nucleonPot(4, FC.F, s, a, lm), { d: 4, l: 1, c: (HB2M * 5) / 8, rmax: 60, h: 0.01 })[0] ?? 0; let lo = 0.5, hi = 8; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (pE(m) < E5) hi = m; else lo = m; } lam5 = (lo + hi) / 2; }
    const Vn = lam5 ? nucleonPot(4, FC.F, s, a, lam5) : null, zero = Eg.map(() => 0);
    const table = { E: Eg, aa: Eg.map((E) => alphaCapture({ d: 4, F: FC.F, s, a, lam, E, deep }).sv), p: Vn ? Eg.map((E) => nucleonCapture({ d: 4, F: FC.F, s, a, lam: lam5, E, Z: 1, Vn }).sv) : zero, n: Vn ? Eg.map((E) => nucleonCapture({ d: 4, F: FC.F, s, a, lam: lam5, E, Z: 0, Vn }).sv) : zero, mass5: E5, lam5 };
    const B = -(levels(mtPot(FC.F.triplet, s), { d: 4, rmax: 80, h: 0.01 })[0] ?? 0);
    const S = pts[0].S, row = { s, a, S, ratio: ours.map((x) => S / x), T: tgt.map((t) => Tmatch(Math.log(S), t)), pts, table, deuteronB: B };
    rows.push(row); console.log(`${fname} s=${s}: S̃ ${S.toExponential(2)} (${row.ratio.map((x) => x.toPrecision(2)).join("–")}× ours), rate-matched at ${row.T.map((t) => (t / 1e9).toFixed(4)).join("–")} GK`);
  }
  save(`${FC.pre}capture.json`, { force: fname, ours, total, barrierT: Tmatch(Math.log(total[0]), tgt[0]), rows });
} else if (cmd === "brink") {
  // the exchange mixture u that puts our ⁸Be at its measured +0.092 MeV with this range of three-nucleon force, then the
  // N helium-4s in d dimensions, relative to N free ones in the same model
  const [d, s, b, N] = [+args[0], +args[1], +args[2], +args[3]], th = threeForce(b, THREE_C_MN), nu3 = BR.bestNu(3, 1, th), Ea3 = BR.alphaEnergy(3, nu3, 1, 1, th);
  let lo = 0.85, hi = 1.6; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (BR.twoAlpha({ d: 3, nu: nu3, s: 1, u: m, three: th })[0] - 2 * Ea3 > 0.092) lo = m; else hi = m; }
  const u = (lo + hi) / 2, nu = BR.bestNu(d, s, th), Ea = BR.alphaEnergy(d, nu, s, 1, th), out = { d, s, b, N, u, nu, Ea };
  if (N === 2) { out.E0 = BR.twoAlpha({ d, nu, s, u, three: th })[0] - 2 * Ea; out.E2 = BR.twoAlpha({ d, nu, s, u, three: th, J: 2 })[0] - 2 * Ea; console.log(`d=${d} s=${s} b=${b}: u ${u.toFixed(4)}, ⁸Be 0⁺ ${out.E0.toFixed(2)}, 2⁺ ${out.E2.toFixed(2)} MeV`); }
  else { out.E = {}; for (const K of [240, 480]) { const t = Date.now(); out.E[K] = BR.clusterGCM({ d, N, nu, s, u, K, seed: 1, three: th })[0] - N * Ea; console.log(`d=${d} s=${s} b=${b} N=${N} K=${K}: ${out.E[K].toFixed(2)} MeV (${((Date.now() - t) / 1000).toFixed(0)} s)`); } }
  save(`brink-${d}-${tag(s)}-${tag(b)}-${N}.json`, out);
} else if (cmd === "mass5") {
  // a nucleon on a helium-4, the Pauli principle exact, no factor set on mass 5: u comes from our ⁸Be (as brink), and below
  // zero means bound. Without a spin–orbit force the p-state is its doublet's centre
  const [d, s, b] = [+args[0], +args[1], +args[2]], th = threeForce(b, THREE_C_MN), nu3 = BR.bestNu(3, 1, th), Ea3 = BR.alphaEnergy(3, nu3, 1, 1, th);
  let lo = 0.85, hi = 1.6; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (BR.twoAlpha({ d: 3, nu: nu3, s: 1, u: m, three: th })[0] - 2 * Ea3 > 0.092) lo = m; else hi = m; }
  const u = (lo + hi) / 2, nu = BR.bestNu(d, s, th), Ds = Array.from({ length: 20 }, (_, i) => 0.4 + (i * 10.6) / 19), out = { d, s, b, u, states: {} };
  for (const l of [0, 1, 2]) for (const Z of [0, 1]) { const e = BR.nucleonAlpha({ d, nu, s, u, l, Z, Ds, three: th })[0]; out.states[`${l}${Z ? "p" : "n"}`] = e; }
  console.log(`d=${d} s=${s} b=${b}: ${Object.entries(out.states).map(([k, v]) => `${k} ${v.toFixed(2)}`).join("  ")} MeV`);
  save(`mass5-${d}-${tag(s)}-${tag(b)}.json`, out);
} else if (cmd === "burning") {
  // each stage's temperature, then the smallest core whose highest central temperature reaches it (js/burning.js). Ours:
  // hydrogen at 3 × 10⁶ K for the whole star (X = 0.75), helium at 10⁸ K for a helium core, carbon at 6 × 10⁸ K for a
  // carbon core. 4D: hydrogen at our 3 × 10⁶ K matched through 4D's barrier (proton radii 1, 2, 4 fm, as the stars chapter
  // does), helium at the first capture's temperatures, and each helium-4 rung at its barrier temperature (bake's rungs)
  const H = { mue: 1.17, mui: 1 / 0.775 }, comp = (A) => ({ mue: 2, mui: A }), mass = (d, T, c) => BU.massFor(d, T, { ...c, G: d === 3 ? 6.6743e-11 : 1e-20 });
  const ours = { H: mass(3, 3e6, H), He: mass(3, 1e8, comp(4)), C: mass(3, 6e8, comp(12)), MchSun: BU.chandraMass(3, { G: 6.6743e-11, mue: 2 }) / 1.98847e30 };
  console.log(`ours: H ${ours.H.toFixed(3)}, He ${ours.He.toFixed(3)}, C ${ours.C.toFixed(3)} × M_Ch (${ours.MchSun.toFixed(3)} M☉ here)`);
  const TH = [1, 2, 4].map((rn) => matchingTemperature(3e6, { mu: 469.459, rn })), caps = ["", "MN-"].map((p) => load(`${p}capture.json`)).filter(Boolean), THe = caps.flatMap((c) => c.rows.flatMap((r) => r.T));
  const AMU = 931.494, op = (k) => { const A2 = 4 * k; return { Z1: 2, Z2: 2 * k, mu: ((4 * A2) / (4 + A2)) * AMU, rn: Math.pow(4, 1 / 4) + Math.pow(A2, 1 / 4), d: 4 }; }, op3 = { Z1: 2, Z2: 6, mu: 3 * AMU, rn: 1.2 * (Math.cbrt(4) + Math.cbrt(12)), d: 3 }, target = logRate(2e8, op3);
  const Trung = (k) => { let lo = 1e6, hi = 1e12; for (let i = 0; i < 70; i++) { const m = Math.sqrt(lo * hi); if (logRate(m, op(k)) < target) lo = m; else hi = m; } return Math.sqrt(lo * hi); };
  const stages = [{ stage: "H", T: [Math.min(...TH), Math.max(...TH)], m: [mass(4, Math.min(...TH), H), mass(4, Math.max(...TH), H)] }, { stage: "He", T: [Math.min(...THe), Math.max(...THe)], m: [mass(4, Math.min(...THe), comp(4)), mass(4, Math.max(...THe), comp(4))] }];
  console.log(`4D H at ${stages[0].T.map((t) => (t / 1e9).toFixed(4)).join("–")} GK: cores from ${stages[0].m.map((x) => x.toFixed(3)).join("–")} × M_Ch; He at ${stages[1].T.map((t) => (t / 1e9).toFixed(3)).join("–")} GK: ${stages[1].m.map((x) => x.toFixed(3)).join("–")}`);
  // rungs with their own computed capture (rungcap, both forces, ladder and Brink energies) take its temperature range;
  // the rest stay barrier-only
  const rc = ["", "MN-"].flatMap((p) => load(`${p}rungcap.json`)?.rows ?? []);
  for (let k = 2; k <= 12; k++) { const own = rc.filter((r) => r.k === k), T = own.length ? [Math.min(...own.map((r) => r.T[0])), Math.max(...own.map((r) => r.T[1]))] : [Trung(k), Trung(k)];
    const m = [mass(4, T[0], comp(4 * k)), mass(4, T[1], comp(4 * k))]; stages.push({ stage: `Z${2 * k}`, Zfrom: 2 * k, T, m, computed: own.length > 0 });
    console.log(`4D rung ${2 * k} → ${2 * k + 2} at ${T.map((t) => (t / 1e9).toFixed(3)).join("–")} GK${own.length ? " (computed)" : ""}: core ${m.map((x) => x.toFixed(3)).join("–")} × M_Ch`); if (Math.min(...m) > 0.995) break; }
  save("burning.json", { ours, stages });
} else if (cmd === "rungcap") {
  // each rung's helium-4–core potential: the pair's deep potential folded over the core's helium-4 centres, whose mean-
  // square radius is the core's (a uniform ball, r₀ A^(1/d): 1.2 fm ours, 1.0 fm 4D) less a helium-4's, and that ×1.65
  // (ours' measured carbon-12 is 1.65× the formula's): the spread is part of the uncertainty. One depth factor per rung
  // puts the product's ground state at the rung's capture energy. The nuclear factor S̃ at the barrier-only temperature's
  // Gamow peak, ground-state capture only and all of it, then the temperature matched to our ¹²C(α,γ) (140–162 keV b at
  // 0.2 billion K), as for the first capture
  const AMU = 931.494, he = (dd, ss) => load(`${FC.pre}he-${dd}-${tag(ss)}-none-4.json`), h3 = he(3, 1), lam = calibrateLocal(FC.F);
  const op = (d, k, r0) => { const A2 = 4 * k; return { Z1: 2, Z2: 2 * k, mu: ((4 * A2) / (4 + A2)) * AMU, rn: r0 * (Math.pow(4, 1 / d) + Math.pow(A2, 1 / d)), d }; }, op3 = op(3, 3, 1.2);
  const E3 = 0.3, eta3 = (12 / 137.035999) * Math.sqrt(op3.mu / (2 * E3)), k3sq = (2 * op3.mu * E3) / HBC ** 2, St3 = (S) => ((S / 1000) * 100 / E3) * Math.exp(-2 * Math.PI * eta3) * k3sq * Math.exp(gamow(E3, op3));
  const total = [140, 162].map(St3), tgt = total.map((x) => logRate(2e8, op3) + Math.log(x)), base = logRate(2e8, op3);
  const Tmatch = (o, lnS, t) => { let lo = 1e6, hi = 1e11; for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (logRate(m, o) + lnS < t) lo = m; else hi = m; } return Math.sqrt(lo * hi); };
  const peak = (T, o) => { const kT = KB_MEV * T; let best = 0, bv = -Infinity; for (let E = kT / 4; E < 80 * kT; E *= 1.01) { const v = -E / kT - gamow(E, o); if (v > bv) { bv = v; best = E; } } return best; };
  const ms = (d, A, r0) => (d / (d + 2)) * (r0 * Math.pow(A, 1 / d)) ** 2, quanta = (d, A) => (A <= (d === 3 ? 16 : 20) ? 4 : 8);
  const one = (d, s, k, Q, r2a, r0) => { const a = alphaWidth(d, r2a), Vaa = deepNuclear(d, FC.F, s, a, lam), o = op(d, k, r0), Tb = Tmatch(o, Math.log(total[0]), tgt[0]), E = peak(Tb, o), out = [];
    for (const sc of [1, 1.65]) { const rc2 = Math.max(0.3, sc * (ms(d, 4 * k, r0) - r2a)), Vf = foldCore(d, Vaa, k, rc2), qn = quanta(d, 4 * k + 4), f = rungFactor(d, Vf, k, Q, { quanta: qn }), r = rungCapture({ d, Vfold: Vf, k, f, E, quanta: qn });
      const S = (x) => x * r.k ** (d - 1) * Math.exp(gamow(E, o)) / r.v, gs = r.parts.filter((p) => p.to === 0).reduce((t, p) => t + p.sv, 0);
      out.push({ rc2, f, states: r.parts.map((p) => [p.from, p.to, p.Ef]), Sgs: S(gs), Sall: S(r.sv) }); }
    const Ss = out.flatMap((x) => [x.Sgs, x.Sall]).filter((x) => x > 0), T = Ss.map((x) => Tmatch(o, Math.log(x), tgt[0])).concat(Ss.map((x) => Tmatch(o, Math.log(x), tgt[1])));
    return { k, Q, Tbarrier: Tb, E, fits: out, T: [Math.min(...T), Math.max(...T)] }; };
  // ours: carbon-12 + helium-4 → oxygen-16, the check (E2 to the ground state measured 45–70 keV b)
  const r2o = R2_OURS, chk = one(3, 1, 3, 7.162, r2o, 1.2), eta = (12 / 137.035999) * Math.sqrt(op3.mu / (2 * 0.3));
  const chkS = chk.fits.map((x) => ({ rc2: x.rc2, gs: (x.Sgs / (k3sq * Math.exp(gamow(0.3, op3)))) * 0.3 * Math.exp(2 * Math.PI * eta) * 1000 / 100, f: x.f, states: x.states }));
  console.log(`ours ¹²C(α,γ): E2 to the ground state ${chkS.map((x) => x.gs.toFixed(1)).join(", ")} keV b at 300 keV (measured 45–70)`);
  const rows = [];
  for (const s of FC.s4) { const r2a = (R2_OURS * he(4, s).r2) / h3.r2, lad = (N) => load(`${FC.pre}ladder-4-${tag(s)}-${N}.json`)?.E, bri = (N) => { const x = load(`brink-4-${tag(s)}-1-${N}.json`); return x ? (N === 2 ? x.E0 : x.E["480"]) : null; };
    for (let k = 2; k <= 4; k++) { const Qs = []; if (lad(k) != null && lad(k + 1) != null) Qs.push(["ladder", lad(k) - lad(k + 1)]); if (FC === FORCES.MN && bri(k) != null && bri(k + 1) != null) Qs.push(["brink", bri(k) - bri(k + 1)]);
      for (const [src, Q] of Qs) { const r = one(4, s, k, Q, r2a, 1.0); rows.push({ s, src, ...r }); console.log(`${fname} s=${s} ${src} ${2 * k} → ${2 * k + 2}: Q ${Q.toFixed(0)} MeV, barrier-only ${(r.Tbarrier / 1e9).toFixed(3)} GK, matched ${r.T.map((t) => (t / 1e9).toFixed(3)).join("–")} GK`); } } }
  save(`${FC.pre}rungcap.json`, { force: fname, check: chkS, rows });
} else if (cmd === "bake") {
  const files = readdirSync(DIR), get = (re) => files.filter((f) => re.test(f)).map(load), cf4 = coulombFactor(4, 300), e2 = 1.43996;
  // the 4D liquid drop for each force, strength and range: bulk from the matter, Coulomb exact, the neutron excess from neutron
  // matter scaled as ours (23.7 of 32 MeV), the surface's effective thickness ours (σ = t a_v ρ₀, t from our a_s = 17.8)
  const T_SURF = (17.8 * Math.cbrt(3 / (4 * Math.PI * 0.16))) / (3 * 16), out = { T_SURF, forces: {} };
  for (const [name, FCx] of Object.entries(FORCES)) {
    const fit = load(`${FCx.pre}fit.json`), mats = get(new RegExp(`^${FCx.pre}matter-`)), hes = get(new RegExp(`^${FCx.pre}he-`)), drops = [];
    if (fit && Math.abs(fit.c / FCx.c - 1) > 0.002) throw new Error(`${name}: the fit (c = ${fit.c}) has moved from nuclear.js's (${FCx.c}): update it, and rerun the light nuclei`);
    for (const s of FCx.s4) for (const b of B_RANGE) {
      const sym = mats.find((m) => m.d === 4 && m.s === s && m.kind === "symmetric"), neu = mats.find((m) => m.d === 4 && m.s === s && m.kind === "neutron"); if (!sym || !fit) continue;
      const c4 = fit.c * Math.PI * b * b, sat = saturation(sym.rows, c4), av = -sat.E, rho0 = sat.rho, r0 = Math.pow(2 / (Math.PI * Math.PI * rho0), 0.25), ac = (cf4 * e2) / r0, as = (4 * T_SURF * av) / r0;
      const Enm = neu ? saturation(neu.rows, c4).at(rho0) : null, aa = Enm === null ? null : (23.7 / 32) * (Enm + av), drop = { s, b, av, rho0, edge: sat.edge, r0, as, ac, aa, Enm };
      if (aa !== null) { const B = (A, Z) => av * A - as * A ** 0.75 - (ac * Z * (Z - 1)) / A ** 0.25 - (aa * (A - 2 * Z) ** 2) / A; let pk = { ba: 0 }; for (let A = 4; A <= 4000; A++) { let bz = 1, bb = -Infinity; for (let Z = 1; Z < A; Z++) { const v = B(A, Z); if (v > bb) { bb = v; bz = Z; } } if (bb / A > pk.ba) pk = { A, Z: bz, ba: bb / A }; } drop.peak = pk; }
      drop.well = wellOf(4, sym.rows, c4); drops.push(drop);
    }
    const ours = mats.find((m) => m.d === 3 && m.kind === "symmetric");
    out.forces[name] = { oursWell: ours && fit ? wellOf(3, ours.rows, fit.c) : null, window: { 3: nucWindow(3, FCx.F), 4: nucWindow(4, FCx.F) }, fit, matter: mats, he: hes, drops, cluster: load(`${FCx.pre}cluster.json`), capture: load(`${FCx.pre}capture.json`), ladder: get(new RegExp(`^${FCx.pre}ladder-`)) };
  }
  // the temperature each helium-4 capture needs (tunnelling through Coulomb and 4D's barrier to one fixed rate, set by our
  // ¹²C(α,γ)¹⁶O burning near 0.2 billion K), onto charge 2k; nuclei of radius r₀ A^(1/d), r₀ 1.2 fm ours, 1.0 fm 4D (its
  // trusted matter's spacing gives 1.0–1.05)
  { const AMU = 931.494, op = (d, k, r0) => { const A2 = 4 * k; return { Z1: 2, Z2: 2 * k, mu: ((4 * A2) / (4 + A2)) * AMU, rn: r0 * (Math.pow(4, 1 / d) + Math.pow(A2, 1 / d)), d }; };
    const target = logRate(2e8, op(3, 3, 1.2)), Tfor = (d, k, r0) => { let lo = 1e6, hi = 1e12; for (let i = 0; i < 70; i++) { const m = Math.sqrt(lo * hi); if (logRate(m, op(d, k, r0)) < target) lo = m; else hi = m; } return Math.sqrt(lo * hi); };
    out.rungs = Array.from({ length: 20 }, (_, i) => ({ Z: 2 * (i + 1), ours: Tfor(3, i + 1, 1.2), d4: Tfor(4, i + 1, 1.0) })); }
  out.brink = get(/^brink-/); out.mass5 = get(/^mass5-/); out.burning = load("burning.json"); out.rungcap = { MT: load("rungcap.json"), MN: load("MN-rungcap.json") };
  // the first minutes: ours as the check (Y), and 4D at each strength over the baryons per photon and the clock
  out.bbn = { ours: BB.firstMinutes({ d: 3, B: 2.2246 }), etas: [1e-10, 6.1e-10, 1e-8, 1e-6], t1s: [0.01, 0.1, 1.32], grid: [] };
  for (const [name, FCx] of Object.entries(FORCES)) { const cap = load(`${FCx.pre}capture.json`); if (!cap?.rows?.[0]?.table) continue;
    for (const r of cap.rows) for (const eta of out.bbn.etas) for (const t1 of out.bbn.t1s) { const tb = r.table, res = BB.firstMinutes({ d: 4, B: r.deuteronB, eta, t1, aa: { E: tb.E, sv: tb.aa }, pa: { E: tb.E, sv: tb.p } }); out.bbn.grid.push({ force: name, s: r.s, B: r.deuteronB, eta, t1, ...res }); } }
  out.dirac = { 3: criticalZ(3), 4: criticalZ(4, { r0: 1.0, AperZ: 2.3 }), pointZ4: 1.5 / (1 / 137.035999) };
  writeFileSync(new URL("../js/nucleidata.js", import.meta.url), `/* Generated by tools/nuclei.mjs from js/nuclear.js and js/dirac.js; do not edit. Per force (MT: Malfliet–Tjon; MN: Minnesota):
   the strength window, nuclear matter by Brueckner–Hartree–Fock (E2: the two-nucleon part per nucleon, MeV, against ρ in
   fm⁻ᵈ), the three-nucleon fit, light nuclei by diffusion Monte Carlo (with mean-square radii), helium-4 clusters, and the 4D
   liquid drops built on the matter (estimates: the surface's thickness is ours); and where the innermost electron dives. */\nexport const NUCLEI = ${JSON.stringify(out)};\n`);
  console.log(`baked: ${Object.entries(out.forces).map(([k, v]) => `${k} ${v.matter.length} scans, ${v.he.length} light nuclei, ${v.drops.length} drops${v.cluster ? ", clusters" : ""}`).join("; ")}; dirac ${out.dirac[3].toFixed(1)} / ${out.dirac[4].toFixed(1)}`);
} else console.log("usage: nuclei.mjs fit | matter <d> <s> <kind> | he4 <d> <s> <b|none> [A] | cluster | bake   (each optionally ending MN)");
