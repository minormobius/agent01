/* The metals' opacity for ours, from the book's own ions (no DOM; atom/js/iondata.js, fusion/tools/ions3.mjs): a first
   pass, bound–free and free–free only, no lines.
     · Each element's ion balance by Saha at the gas's n_e, ionization energies as the atom's total-energy differences,
       lowered by Debye–Hückel, ΔI = (q + 1) e²/(4πε₀ λ_D) (an ion whose lowered energy falls to zero is pressure-ionized);
       statistical weights taken as equal (stated).
     · Bound–free from every occupied subshell of every ion: Kramers's hydrogenic cross-section per electron,
       σ = 7.91 × 10⁻²² m² · n/Z_eff² · (χ/ħω)³ above the edge χ (the subshell's orbital energy less the lowering), with
       Z_eff² = n²χ/Ry, Gaunt factor 1.
     · Free–free on the ions, Kramers's with charge q² (Gaunt factor 1; the hydrogen–helium part is the surface model's).
   Abundances: Asplund 2009's log ε, scaled to the mass fraction Z. prep(st, rho, Z) → ħω (eV) ↦ opacity per metre, for
   surface.js's `metals` hook.

   4D (prep(st, rho, Z, 4, mix); mix: each element's share of the metals by mass, {Z: share}, elements 4–13 from
   atom/js/iondata4.js, fusion/tools/ions3.mjs 4): the same three parts in four dimensions, each the book's own.
     · Saha in 4D, n_(q+1) n_e / n_q = 2 (m_e kT/2πħ²)² e^(−I/kT) (statistical weights equal, as ours).
     · The lowering is the screening cloud's potential at the nucleus under the pinned 1/r, ΔI = (q + 1) C₄ αħc k_D,
       C₄ = π/(3√3), k_D³ = 4π²αħc Σn z²/kT (atom/js/screen.js; ours' formula above is the same with C₃ = 1), where that
       holds; a 4D core has under one electron to a screening ball, where Debye–Hückel overshoots, so as screen.js does
       for the rates it is bridged to the ion sphere, ΔI = min(weak, E(q) − E(q + 1)), E(Z) = −c₄Z²αħc/a_Z the ion's
       energy in its own sphere of Z electrons, (π²/2)a_Z⁴n_e = Z.
     · Bound–free from every occupied subshell: the hydrogen-like shape of its own level (atom/js/photoshape.js, from the
       book's dipole rate), σ = Z_eff⁻⁴ σ₁(ħω/χ) a₀³ per electron, Z_eff = ν√(2χ), ν = n + ½: no Kramers law, which has
       no 4D form. Past the table's last point σ₁ follows its last two points' power law.
     · Free–free on the ions, the book's classical 4D form (mainseq.js kappaFF4), n_e Σn_i q² π⁵α³ħ²c³(1 + x)/(m²ω⁵), its
       (1 − e^(−x)) left to the caller as ours' is. */
import { IONS } from "./iondata.js";
import { IONS4 } from "./iondata4.js";
import { XS as PX, SHAPE } from "./photoshape.js";
import { plasma, CIS } from "./screen.js";

const RY = 13.605693122994, KB = 8.617333262e-5, A0 = 0.529177210903e-10, MU = 1.66053906660e-27, ME = 9.1093837015e-31, HBAR = 1.054571817e-34, K_EV = 1.602176634e-19;
const MASS = { C: 12.011, N: 14.007, O: 15.999, Ne: 20.18, Na: 22.99, Mg: 24.305, Al: 26.98, Si: 28.085, S: 32.06, Ar: 39.95, Ca: 40.078, Cr: 51.996, Mn: 54.938, Fe: 55.845, Ni: 58.693 };
/* each element's share of the metals by mass (Asplund 2009 relative to hydrogen, normalized over the elements kept) */
const W = (() => { const w = IONS.map((e) => 10 ** (e.eps - 12) * MASS[e.sym]), s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); })();
const IP = IONS.map((e) => e.ions.map((x, i) => (i ? e.ions[i - 1].E - x.E : -x.E))); // IP[el][n−1]: the ion with n electrons → n − 1

export function prep(st, rho, Z, d = 3, mix = null) {
  if (d === 4) return prep4(st, rho, Z, mix);
  const { T, ne } = st, kT = KB * T, nH = (rho * (st.X ?? 0.7)) / (1.00784 * MU);
  // Debye length (ions and electrons; atomic units), lowering per unit of the ion's charge
  const nAll = ne + (st.hp ?? 0) + (st.he1 ?? 0) + 4 * (st.he2 ?? 0), lD = Math.sqrt((kT / 27.211386) / (4 * Math.PI * nAll * A0 ** 3)), dI = 27.211386 / lD;
  const saha = 2 * ((ME * kT * K_EV) / (2 * Math.PI * HBAR * HBAR)) ** 1.5 / ne; // n_{q+1}/n_q = saha · e^(−I/kT)
  const pops = []; // per element: number density of each electron count n (index n, 0 = bare)
  IONS.forEach((e, k) => { const N = (rho * Z * W[k]) / (MASS[e.sym] * MU), Zn = e.Z, lr = new Float64Array(Zn + 1); // ln of the ratio to the bare nucleus
    for (let n = 1; n <= Zn; n++) { const q = Zn - n, I = IP[k][n - 1] - (q + 1) * dI; lr[n] = lr[n - 1] + (I > 0 ? I / kT - Math.log(saha) : -Infinity); }
    const mx = Math.max(...lr), p = Array.from(lr, (v) => Math.exp(v - mx)), s = p.reduce((a, b) => a + b, 0); pops.push(p.map((v) => (N * v) / s)); });
  // the edges: [χ (eV), σ at the edge (m²)·density] for every subshell of every ion present
  const edges = []; let ff = 0;
  IONS.forEach((e, k) => e.ions.forEach((ion) => { const nd = pops[k][ion.n]; if (!(nd > 1e-30 * nH)) return; const q = e.Z - ion.n;
    for (const [n, , occ, eps] of ion.sub) { const chi = -eps - dI(q); if (!(chi > 0)) continue; const zeff2 = (n * n * chi) / RY; edges.push([chi, nd * occ * 7.91e-22 * (n / zeff2)]); } }));
  IONS.forEach((e, k) => pops[k].forEach((nd, n) => { const q = e.Z - n; ff += nd * q * q; })); // Σ n_i q² for the ions' free–free
  edges.sort((a, b) => a[0] - b[0]);
  return (wEv) => { let k = 0; for (const [chi, s] of edges) { if (chi > wEv) break; k += s * (chi / wEv) ** 3; }
    const nu = (wEv * K_EV) / (2 * Math.PI * HBAR), kff = 100 * 3.69e8 * (ne * 1e-6) * (ff * 1e-6) * T ** -0.5 * nu ** -3; return k + kff; };
}

/* the 4D metals: ħω (eV) ↦ opacity per metre, without stimulated emission (the caller's) */
const LPX = PX.map(Math.log), SH4 = Object.fromEntries(Object.entries(SHAPE[4]).map(([k, v]) => [k, v.map((y) => Math.log(y))]));
const shape4 = (key, x) => { const ly = SH4[key]; if (!ly || x < 1) return 0; const lx = Math.log(x); if (lx <= LPX[0]) return Math.exp(ly[0]);
  const n = LPX.length; if (lx >= LPX[n - 1]) { const sl = (ly[n - 1] - ly[n - 2]) / (LPX[n - 1] - LPX[n - 2]); return Math.exp(ly[n - 1] + sl * (lx - LPX[n - 1])); }
  let i = 0; while (LPX[i + 1] < lx) i++; const t = (lx - LPX[i]) / (LPX[i + 1] - LPX[i]); return Math.exp(ly[i] * (1 - t) + ly[i + 1] * t); };
const IP4 = IONS4.map((e) => e.ions.map((x, i) => (i ? e.ions[i - 1].E - x.E : -x.E)));
export function pops4(st, rho, Z, mix) {
  const { T, ne } = st, kT = KB * T, kTJ = kT * K_EV, HA = 27.211386245988;
  const p = plasma(4, T, [[st.hp ?? 0, 1], [st.he1 ?? 0, 1], [st.he2 ?? 0, 2]], ne), w1 = p.Hw(1, 1) / K_EV, AHC = 7.2973525693e-3 * HBAR * 2.99792458e8;
  const Eis = (z) => (z > 0 ? (-CIS[4] * z * z * AHC) / ((2 * z) / (Math.PI ** 2 * ne)) ** 0.25 / K_EV : 0), dI = (q) => Math.min((q + 1) * w1, Eis(q) - Eis(q + 1)); // eV, an ion of charge q losing one more
  const saha = (2 * ((ME * kTJ) / (2 * Math.PI * HBAR * HBAR)) ** 2) / ne;
  const els = IONS4.map((e, k) => { const share = mix?.[e.Z] ?? 0; if (!(share > 0)) return null; const N = (rho * Z * share) / (e.Z * 2 * MU), lr = new Float64Array(e.Z + 1); // mass 2Z (N = Z)
    for (let n = 1; n <= e.Z; n++) { const q = e.Z - n, I = IP4[k][n - 1] - dI(q); lr[n] = lr[n - 1] + (I > 0 ? I / kT - Math.log(saha) : -Infinity); }
    const mx = Math.max(...lr), w = Array.from(lr, (v) => Math.exp(v - mx)), s = w.reduce((a, b) => a + b, 0); return { e, pop: w.map((v) => (N * v) / s) }; }).filter(Boolean);
  return { els, dI, weak1: w1, kD: p.kD, HA };
}
function prep4(st, rho, Z, mix) {
  const { T, ne } = st, { els, dI, HA } = pops4(st, rho, Z, mix), A3 = A0 ** 3, edges = []; let zz = 0;
  for (const { e, pop } of els) e.ions.forEach((ion) => { const nd = pop[ion.n]; if (!(nd > 0)) return; const q = e.Z - ion.n;
    for (const [n, l, occ, eps] of ion.sub) { const chi = -eps - (q + 1) * dI; if (!(chi > 0)) continue; const zeff = (n + 0.5) * Math.sqrt((2 * chi) / HA); edges.push([chi, `${n}${l}`, (nd * occ * A3) / zeff ** 4]); } });
  for (const { e, pop } of els) pop.forEach((nd, n) => { const q = e.Z - n; zz += nd * q * q; });
  const ALPHA = 7.2973525693e-3, C = 2.99792458e8;
  return (wEv) => { let k = 0; for (const [chi, key, a] of edges) if (wEv >= chi) k += a * shape4(key, wEv / chi);
    const om = (wEv * K_EV) / HBAR, x = wEv / (KB * T); return k + (ne * zz * Math.PI ** 5 * ALPHA ** 3 * HBAR ** 2 * C ** 3 * (1 + x)) / (ME ** 2 * om ** 5); };
}
