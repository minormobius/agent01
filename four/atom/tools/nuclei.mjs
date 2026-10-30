/* The abundance question's nuclear runs (js/nuclear.js), each cached as JSON in $TMPDIR/atom4-nuclei so the runner can
   carry the long ones and `bake` can gather them:
     node four/atom/tools/nuclei.mjs fit                         our nuclear matter (3D) with Serber's Malfliet–Tjon, and
                                                                 the three-nucleon strength that saturates it at −16 MeV
     node four/atom/tools/nuclei.mjs matter <d> <s> <kind>       nuclear matter over a range of densities (kind:
                                                                 symmetric | neutron), the force's attraction × s
     node four/atom/tools/nuclei.mjs he4 <d> <s> <b|none> [A]    helium-4 (or A = 2, 3) by diffusion Monte Carlo, with
                                                                 the three-nucleon force of range b fm, or without
     node four/atom/tools/nuclei.mjs bake                        → js/nucleidata.js
   The three-nucleon force is W Σ_cyclic e^(−(r_ij² + r_ik²)/b²); fit gives c = W π³ b⁶/2 (its Hartree energy per nucleon
   in our matter is c ρ²), so W = 2c/(π³ b⁶) for each b, and in 4D the same W and b give c₄ = c π b². */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { matter, fixedNode, window as nucWindow, MT, mtPot, coulombFactor, THREE_C, threeForce } from "../js/nuclear.js";

const DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-nuclei"); mkdirSync(DIR, { recursive: true });
const save = (name, obj) => { writeFileSync(path.join(DIR, name), JSON.stringify(obj)); console.log("wrote", name); };
const load = (name) => (existsSync(path.join(DIR, name)) ? JSON.parse(readFileSync(path.join(DIR, name), "utf8")) : null);
const KF = { 3: [0.6, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.36, 1.45, 1.55, 1.7, 1.85, 2.0], 4: [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.35, 2.5, 2.7] };
export const B_RANGE = [0.7, 1.0, 1.4];
export const STRENGTHS = { 3: [1], 4: [1.2292, 1.2986, 1.4993] }; // ours; 4D's window: the deuteron binds, as ours, the diproton binds
const tag = (x) => String(x).replace(".", "p");

function scan(d, s, kind) {
  const rows = [];
  for (const kF of KF[d]) { const t = Date.now(), r = matter({ d, s, kF, kind }); rows.push({ kF, rho: r.rho, E2: r.E2, A: r.U.A, B: r.U.B }); console.log(`d=${d} s=${s} ${kind} kF=${kF} ρ=${r.rho.toPrecision(4)} E2/A=${r.E2.toFixed(3)} (${Date.now() - t} ms)`); }
  return rows;
}
/* along a scan (E2 per nucleon against ρ), the minimum of E2 + c ρ², interpolated in ln ρ */
export function saturation(rows, c) {
  const r = [...rows].sort((a, b) => a.rho - b.rho), at = (rho) => { for (let i = 0; i + 1 < r.length; i++) if (rho >= r[i].rho && rho <= r[i + 1].rho) { const f = (Math.log(rho) - Math.log(r[i].rho)) / (Math.log(r[i + 1].rho) - Math.log(r[i].rho)); return r[i].E2 + f * (r[i + 1].E2 - r[i].E2); } return null; };
  let best = { E: Infinity, rho: null, edge: false }; const lo = Math.log(r[0].rho), hi = Math.log(r[r.length - 1].rho);
  for (let x = lo; x <= hi; x += 0.002) { const rho = Math.exp(x), E = at(rho) + c * rho * rho; if (E < best.E) best = { E, rho, edge: hi - x < 0.01 }; }
  return { ...best, at: (rho) => at(rho) + c * rho * rho };
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "fit") {
  const rows = load("matter-3-1-symmetric.json")?.rows ?? scan(3, 1, "symmetric"); save("matter-3-1-symmetric.json", { d: 3, s: 1, kind: "symmetric", rows });
  let lo = 100, hi = 2000; for (let i = 0; i < 60; i++) { const c = (lo + hi) / 2; if (saturation(rows, c).E < -16) lo = c; else hi = c; }
  const c = (lo + hi) / 2, sat = saturation(rows, c); save("fit.json", { c, rho0: sat.rho, E0: sat.E, W: Object.fromEntries(B_RANGE.map((b) => [b, (2 * c) / (Math.PI ** 3 * b ** 6)])) });
  console.log(`c = ${c.toFixed(1)} MeV fm⁶: our matter saturates at ${sat.rho.toFixed(4)} fm⁻³, ${sat.E.toFixed(2)} MeV`);
} else if (cmd === "matter") {
  const [d, s, kind] = [+args[0], +args[1], args[2]]; save(`matter-${d}-${tag(s)}-${kind}.json`, { d, s, kind, rows: scan(d, s, kind) });
} else if (cmd === "he4") {
  const [d, s, bArg, A = 4] = [+args[0], +args[1], args[2], +(args[3] ?? 4)], three = bArg === "none" ? null : threeForce(+bArg);
  const counts = A === 4 ? [1, 1, 1, 1] : A === 3 ? [1, 0, 1, 1] : [0, 0, 1, 1], runs = [];
  for (const seed of [1, 2]) { const t = Date.now(), r = fixedNode({ d, counts, V: { v: (x, ss) => mtPot(MT.v, ss)(x) }, s, like: "same", steps: 30000, tau: 1e-4, seed, equil: 5000, omega: 0.5, three, coulomb: false }); runs.push({ E: r.E, err: r.err }); console.log(`d=${d} A=${A} s=${s} b=${bArg} seed ${seed}: ${r.E.toFixed(3)} ± ${r.err.toFixed(3)} MeV (${((Date.now() - t) / 1000).toFixed(0)} s)`); }
  const w = runs.map((r) => 1 / r.err ** 2), E = runs.reduce((t, r, i) => t + r.E * w[i], 0) / w.reduce((a, b) => a + b, 0), err = 1 / Math.sqrt(w.reduce((a, b) => a + b, 0));
  save(`he-${d}-${tag(s)}-${bArg}-${A}.json`, { d, s, b: bArg, A, three, E, err, runs });
} else if (cmd === "bake") {
  const fit = load("fit.json"), files = readdirSync(DIR), get = (re) => files.filter((f) => re.test(f)).map(load);
  const win = { 3: nucWindow(3), 4: nucWindow(4) }, mats = get(/^matter-/), hes = get(/^he-/), cf4 = coulombFactor(4, 300), e2 = 1.43996;
  // the 4D liquid drop for each strength and range: bulk from the matter, Coulomb exact, the neutron excess from neutron
  // matter scaled as ours (23.7 of 32 MeV), the surface's effective thickness ours (σ = t a_v ρ₀, t from our a_s = 17.8)
  const T_SURF = (17.8 * Math.cbrt(3 / (4 * Math.PI * 0.16))) / (3 * 16), drops = [];
  for (const s of STRENGTHS[4]) for (const b of B_RANGE) {
    const sym = mats.find((m) => m.d === 4 && m.s === s && m.kind === "symmetric"), neu = mats.find((m) => m.d === 4 && m.s === s && m.kind === "neutron"); if (!sym || !neu || !fit) continue;
    const c4 = fit.c * Math.PI * b * b, sat = saturation(sym.rows, c4), av = -sat.E, rho0 = sat.rho, r0 = Math.pow(2 / (Math.PI * Math.PI * rho0), 0.25), ac = (cf4 * e2) / r0, as = (4 * T_SURF * av) / r0;
    const Enm = saturation(neu.rows, c4).at(rho0), aa = (23.7 / 32) * (Enm + av), B = (A, Z) => av * A - as * A ** 0.75 - (ac * Z * (Z - 1)) / A ** 0.25 - (aa * (A - 2 * Z) ** 2) / A;
    let pk = { ba: 0 }; for (let A = 4; A <= 4000; A++) { let bz = 1, bb = -Infinity; for (let Z = 1; Z < A; Z++) { const v = B(A, Z); if (v > bb) { bb = v; bz = Z; } } if (bb / A > pk.ba) pk = { A, Z: bz, ba: bb / A }; }
    drops.push({ s, b, av, rho0, edge: sat.edge, r0, as, ac, aa, peak: pk });
  }
  if (fit && Math.abs(fit.c / THREE_C - 1) > 0.002) throw new Error(`the fit (c = ${fit.c}) has moved from nuclear.js's THREE_C (${THREE_C}): update it, and rerun the light nuclei`);
  const out = { window: win, fit, matter: mats, he: hes, drops, T_SURF };
  writeFileSync(new URL("../js/nucleidata.js", import.meta.url), `/* Generated by tools/nuclei.mjs from js/nuclear.js; do not edit. The strength window, nuclear matter by Brueckner–Hartree–Fock
   (E2: the two-nucleon part per nucleon, MeV, against ρ in fm⁻ᵈ), the three-nucleon fit, light nuclei by diffusion Monte Carlo,
   and the 4D liquid drops built on the matter (estimates: the surface's thickness is ours). */\nexport const NUCLEI = ${JSON.stringify(out)};\n`);
  console.log(`baked: ${mats.length} matter scans, ${hes.length} light nuclei, ${drops.length} liquid drops`);
} else console.log("usage: nuclei.mjs fit | matter <d> <s> <kind> | he4 <d> <s> <b|none> [A] | bake");
