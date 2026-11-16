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
   surface.js's `metals` hook. */
import { IONS } from "./iondata.js";

const RY = 13.605693122994, KB = 8.617333262e-5, A0 = 0.529177210903e-10, MU = 1.66053906660e-27, ME = 9.1093837015e-31, HBAR = 1.054571817e-34, K_EV = 1.602176634e-19;
const MASS = { C: 12.011, N: 14.007, O: 15.999, Ne: 20.18, Na: 22.99, Mg: 24.305, Al: 26.98, Si: 28.085, S: 32.06, Ar: 39.95, Ca: 40.078, Cr: 51.996, Mn: 54.938, Fe: 55.845, Ni: 58.693 };
/* each element's share of the metals by mass (Asplund 2009 relative to hydrogen, normalized over the elements kept) */
const W = (() => { const w = IONS.map((e) => 10 ** (e.eps - 12) * MASS[e.sym]), s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); })();
const IP = IONS.map((e) => e.ions.map((x, i) => (i ? e.ions[i - 1].E - x.E : -x.E))); // IP[el][n−1]: the ion with n electrons → n − 1

export function prep(st, rho, Z) {
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
    for (const [n, , occ, eps] of ion.sub) { const chi = -eps - (q + 1) * dI; if (!(chi > 0)) continue; const zeff2 = (n * n * chi) / RY; edges.push([chi, nd * occ * 7.91e-22 * (n / zeff2)]); } }));
  IONS.forEach((e, k) => pops[k].forEach((nd, n) => { const q = e.Z - n; ff += nd * q * q; })); // Σ n_i q² for the ions' free–free
  edges.sort((a, b) => a[0] - b[0]);
  return (wEv) => { let k = 0; for (const [chi, s] of edges) { if (chi > wEv) break; k += s * (chi / wEv) ** 3; }
    const nu = (wEv * K_EV) / (2 * Math.PI * HBAR), kff = 100 * 3.69e8 * (ne * 1e-6) * (ff * 1e-6) * T ** -0.5 * nu ** -3; return k + kff; };
}
