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
     node four/atom/tools/nuclei.mjs bake                        → js/nucleidata.js
   The three-nucleon force is W Σ_cyclic e^(−(r_ij² + r_ik²)/b²); fit gives c = W π³ b⁶/2 (its Hartree energy per nucleon
   in our matter is c ρ²), so W = 2c/(π³ b⁶) for each b, and in 4D the same W and b give c₄ = c π b². */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { matter, fixedNode, window as nucWindow, MT, MN, mtPot, coulombFactor, THREE_C, THREE_C_MN, threeForce, alphaWidth, alphaPair, alphaNucleon, calibrate, alphaLocal, alphaDMC, calibrateLocal, alphaCapture, deepNuclear } from "../js/nuclear.js";
import { criticalZ } from "../js/dirac.js";
import { logRate, gamow, KB_MEV } from "../js/stars.js";

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
    const S = pts[0].S, row = { s, a, S, ratio: ours.map((x) => S / x), T: tgt.map((t) => Tmatch(Math.log(S), t)), pts };
    rows.push(row); console.log(`${fname} s=${s}: S̃ ${S.toExponential(2)} (${row.ratio.map((x) => x.toPrecision(2)).join("–")}× ours), rate-matched at ${row.T.map((t) => (t / 1e9).toFixed(4)).join("–")} GK`);
  }
  save(`${FC.pre}capture.json`, { force: fname, ours, total, barrierT: Tmatch(Math.log(total[0]), tgt[0]), rows });
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
  out.dirac = { 3: criticalZ(3), 4: criticalZ(4, { r0: 1.0, AperZ: 2.3 }), pointZ4: 1.5 / (1 / 137.035999) };
  writeFileSync(new URL("../js/nucleidata.js", import.meta.url), `/* Generated by tools/nuclei.mjs from js/nuclear.js and js/dirac.js; do not edit. Per force (MT: Malfliet–Tjon; MN: Minnesota):
   the strength window, nuclear matter by Brueckner–Hartree–Fock (E2: the two-nucleon part per nucleon, MeV, against ρ in
   fm⁻ᵈ), the three-nucleon fit, light nuclei by diffusion Monte Carlo (with mean-square radii), helium-4 clusters, and the 4D
   liquid drops built on the matter (estimates: the surface's thickness is ours); and where the innermost electron dives. */\nexport const NUCLEI = ${JSON.stringify(out)};\n`);
  console.log(`baked: ${Object.entries(out.forces).map(([k, v]) => `${k} ${v.matter.length} scans, ${v.he.length} light nuclei, ${v.drops.length} drops${v.cluster ? ", clusters" : ""}`).join("; ")}; dirac ${out.dirac[3].toFixed(1)} / ${out.dirac[4].toFixed(1)}`);
} else console.log("usage: nuclei.mjs fit | matter <d> <s> <kind> | he4 <d> <s> <b|none> [A] | cluster | bake   (each optionally ending MN)");
