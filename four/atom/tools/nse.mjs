/* Where deep burning ends, element by element: nuclear statistical equilibrium in any d. Once a core is hot enough that
   light breaks nuclei as fast as captures build them, the composition stops depending on the reactions and follows a Saha
   equation over every nucleus:
       n(Z, A) = g (A m_u kT / 2πħ²)^(d/2) exp[(Z μ_p + N μ_n + B(Z, A)) / kT]
   with μ_p, μ_n set by the density of nucleons and their share of protons (Y_e). The thermal wavelength's power d/2 is
   where the dimension enters. Masses from the book's trusted 4D liquid drops (js/nucleidata.js: both nucleon forces,
   B = a_v A − a_s A^¾ − a_c Z(Z−1)/A^¼ − a_a (A−2Z)²/A), helium-4 at its computed binding; nuclei inside both drip lines.
   No shell or pairing terms (none were computed for 4D), no excited states (g = 1; 2 for a free nucleon), no screening.
   Densities as fractions of nuclear saturation (ours 0.16 fm⁻³; 4D from the book's radius, 2/π²r₀⁴ with r₀ = 1 fm):
   our silicon burning runs at about 10⁻⁶ of it.
     node four/atom/tools/nse.mjs ours      the check: our liquid drop at 3.5–6 billion K, 10⁻⁶ of saturation, Y_e 0.5
                                            (the measured endpoint is nickel-56, element 28)
     node four/atom/tools/nse.mjs four      4D, each trusted drop, kT 0.5–4 MeV, densities 10⁻⁷–10⁻⁵, Y_e 0.5 and 0.45
     node four/atom/tools/nse.mjs bake      → js/nsedata.js */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const here = path.dirname(new URL(import.meta.url).pathname), DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-nse"); mkdirSync(DIR, { recursive: true });
const MU = 931.494, HBARC = 197.327, KB = 8.617333e-11; // MeV, MeV fm, MeV/K
/* the nuclei: [Z, A, B (MeV), g] inside the drip lines, plus n, p, and helium-4 at its own binding */
export function nuclides(drop, { Zmax, he4 }) {
  const B = (Z, A) => (Z < 1 || A < Z ? -Infinity : drop.av * A - drop.as * A ** drop.ps - (drop.ac * Z * (Z - 1)) / A ** drop.pc - (drop.aa * (A - 2 * Z) ** 2) / A + (drop.ap ? ((A % 2) ? 0 : (Z % 2 ? -1 : 1) * drop.ap / Math.sqrt(A)) : 0));
  const out = [[0, 1, 0, 2], [1, 1, 0, 2], [2, 4, he4, 1]];
  for (let Z = 3; Z <= Zmax; Z++) for (let A = Z + 1; A <= 4 * Z + 20; A++) {
    const b = B(Z, A); if (!(b > 0)) continue;
    const Sn = b - (A - 1 > Z ? B(Z, A - 1) : 0), Sp = b - B(Z - 1, A - 1); if (!(Sn > 0 && Sp > 0)) continue;
    out.push([Z, A, b, 1]);
  }
  return out;
}
const lse = (xs) => { const m = Math.max(...xs); return m + Math.log(xs.reduce((s, x) => s + Math.exp(x - m), 0)); };
/* μ_p, μ_n (MeV) for nucleon density nB (fm^-d) and proton share Ye, by nested bisection (both sums rise steadily with
   each μ, so it can't miss; Newton on the same equations jumped between solutions from one temperature to the next):
   for each μ_n, μ_p from the protons' count; then μ_n from the nucleons'. Returns the mass fractions and the residuals */
export function solve(nucl, d, kT, nB, Ye) {
  const lnQ = nucl.map(([, A, , g]) => Math.log(g) + (d / 2) * Math.log((A * MU * kT) / (2 * Math.PI * HBARC * HBARC)));
  const lnN = (mp, mn) => nucl.map(([Z, A, B], i) => lnQ[i] + (Z * mp + (A - Z) * mn + B) / kT);
  const sums = (mp, mn) => { const ln = lnN(mp, mn); return { ln, SA: lse(ln.map((x, i) => x + Math.log(nucl[i][1]))), SZ: lse(ln.map((x, i) => (nucl[i][0] ? x + Math.log(nucl[i][0]) : -1e300)))}; };
  const bis = (f, lo, hi) => { for (let k = 0; k < 90; k++) { const m = 0.5 * (lo + hi); if (f(m) > 0) hi = m; else lo = m; } return 0.5 * (lo + hi); };
  const mpOf = (mn) => bis((mp) => sums(mp, mn).SZ - Math.log(Ye * nB), -400, 100);
  const mn = bis((mn) => sums(mpOf(mn), mn).SA - Math.log(nB), -400, 100), mp = mpOf(mn), e = sums(mp, mn);
  const X = e.ln.map((x, i) => Math.exp(x + Math.log(nucl[i][1]) - e.SA));
  return { mp, mn, X, resA: e.SA - Math.log(nB), resZ: e.SZ - Math.log(Ye * nB) };
}
/* a run over temperatures, high to low (each starting from the last), its composition summarised by element */
function sweep(nucl, d, kTs, nB, Ye) {
  let guess = null; const rows = [];
  for (const kT of [...kTs].sort((a, b) => b - a)) {
    const r = solve(nucl, d, kT, nB, Ye); guess = [r.mp, r.mn];
    const byZ = {}; nucl.forEach(([Z], i) => (byZ[Z] = (byZ[Z] || 0) + r.X[i]));
    const zs = Object.entries(byZ).map(([Z, x]) => [+Z, x]).sort((a, b) => b[1] - a[1]), heavy = zs.filter(([Z]) => Z > 2), hsum = heavy.reduce((s, [, x]) => s + x, 0);
    const meanZ = hsum > 0 ? heavy.reduce((s, [Z, x]) => s + Z * x, 0) / hsum : 0, iMax = r.X.indexOf(Math.max(...r.X));
    rows.push({ kT, T: kT / KB, res: +Math.max(Math.abs(r.resA), Math.abs(r.resZ)).toExponential(1), free: { n: byZ[0] ?? 0, p: byZ[1] ?? 0, a: byZ[2] ?? 0 }, heavy: hsum, meanZ, topZ: zs.slice(0, 6).map(([Z, x]) => [Z, +x.toPrecision(3)]), topNucleus: [nucl[iMax][0], nucl[iMax][1]] });
  }
  return rows.sort((a, b) => a.kT - b.kT);
}
const [cmd] = process.argv.slice(2), MAIN = !!process.argv[1] && import.meta.url.endsWith("/" + path.basename(process.argv[1]));
const show = (label, rows) => { console.log(label); for (const r of rows) console.log(`  kT ${r.kT} MeV (${(r.T / 1e9).toFixed(1)} billion K): free n ${r.free.n.toFixed(3)} p ${r.free.p.toFixed(3)} α ${r.free.a.toFixed(3)}, heavy ${r.heavy.toFixed(3)}, mean Z ${r.meanZ.toFixed(1)}, top nucleus Z ${r.topNucleus[0]} A ${r.topNucleus[1]}; by element ${r.topZ.map(([Z, x]) => `${Z}:${x}`).join(" ")}`); };
if (!MAIN) { /* imported */ } else if (cmd === "ours") {
  // the semi-empirical drop (Weizsäcker, with pairing), our helium-4 at 28.30 MeV
  const drop = { av: 15.75, as: 17.8, ps: 2 / 3, ac: 0.711, pc: 1 / 3, aa: 23.7, ap: 11.18 }, nucl = nuclides(drop, { Zmax: 60, he4: 28.296 }), out = [];
  for (const x of [1e-7, 1e-6, 1e-5]) { const rows = sweep(nucl, 3, [0.25, 0.3, 0.35, 0.43, 0.5, 0.6, 0.8], x * 0.16, 0.5); out.push({ x, Ye: 0.5, rows }); show(`ours, ${x} of saturation, Y_e 0.5`, rows); }
  writeFileSync(path.join(DIR, "ours.json"), JSON.stringify(out));
} else if (cmd === "four") {
  const N = (await import("../js/nucleidata.js")).NUCLEI, out = [], nsat = 2 / (Math.PI ** 2);
  for (const f of Object.keys(N.forces)) for (const dr of N.forces[f].drops.filter((x) => x.well?.trusted)) {
    const hs = (N.forces[f].he ?? []).filter((h) => h.d === 4 && h.A === 4 && h.s === dr.s).sort((a, b) => Math.abs(+a.b - +dr.b) - Math.abs(+b.b - +dr.b)), he = hs[0]; // b is stored as text in he
    if (!he) throw new Error(`no computed helium-4 for ${f} s=${dr.s}`); const he4 = -he.E;
    const drop = { av: dr.av, as: dr.as, ps: 3 / 4, ac: dr.ac, pc: 1 / 4, aa: dr.aa }, nucl = nuclides(drop, { Zmax: 220, he4 });
    for (const x of [1e-7, 1e-6, 1e-5]) for (const Ye of [0.5, 0.45]) { const rows = sweep(nucl, 4, [0.5, 1, 1.5, 2, 2.5, 3, 4], x * nsat, Ye); out.push({ force: f, s: dr.s, b: dr.b, he4, x, Ye, n: nucl.length, rows }); show(`4D ${f} s=${dr.s}, ${x} of saturation, Y_e ${Ye} (${nucl.length} nuclei; helium-4 ${he4.toFixed(1)} MeV)`, rows); }
  }
  writeFileSync(path.join(DIR, "four.json"), JSON.stringify(out));
} else if (cmd === "bake") {
  const get = (f) => (existsSync(path.join(DIR, f)) ? JSON.parse(readFileSync(path.join(DIR, f), "utf8")) : null);
  writeFileSync(path.join(here, "../js/nsedata.js"), `/* Generated by tools/nse.mjs bake; do not edit. Nuclear statistical equilibrium: per drop, density (fraction of
   saturation) and Y_e, at each kT (MeV) the free neutrons', protons' and helium-4s' mass fractions, the heavy nuclei's,
   their mean element, the commonest nucleus, and the six commonest elements by mass. ours: our drop, the check. */
export const NSE = ${JSON.stringify({ ours: get("ours.json"), four: get("four.json") })};
`);
  console.log("wrote js/nsedata.js");
} else console.error("usage: nse.mjs ours | four | bake");
