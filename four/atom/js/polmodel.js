/* ATOM⁴'s polarizable force field for rigid HₙX, no DOM, in any d. js/ffmodel.js's model counted each pair alone, and
   to match Hartree–Fock's pair energies it needed an X–X attraction (C₆ of 714 for Xater, 1290 for XH₃, where our
   water's is 4) that stood in for each molecule polarizing the other. That pull adds up neighbour by neighbour, so a
   crystal of them collapsed. Polarization doesn't add up that way: a molecule's response is to the field of all its
   neighbours at once, and fields from opposite sides cancel. So here it is computed as such.

   Each site (X and each H) carries a fixed charge (q on each H, −nq on X) and an isotropic polarizability (α_X, α_H).
   Its induced dipole answers the field of every other molecule's charges and every other dipole, its own molecule's
   included (that coupling is what makes the molecule's response anisotropic):
       μ_i = α_i (E_i + Σ_{j≠i} T_ij μ_j),    E_pol = −½ Σ_i μ_i · E_i,
   E_i being the field of the other molecules' charges alone (a molecule's own charges are already in its Hartree–Fock
   shape). Under the pinned 1/r a charge's field is q r/r³ and a dipole's is T μ, T = (3 r rᵀ − r² I)/r⁵, in every d.
   Close in, both are damped as Thole damps them (1981): with u = r/(α_iα_j)^(1/6), the 1/r³ parts by
   λ₃ = 1 − e^(−a u³) and the 3 r rᵀ/r⁵ part by λ₅ = 1 − (1 + a u³) e^(−a u³), so two dipoles can't run away together.
   α_X, α_H and a are fitted to the molecule's own polarizability tensor from finite-field Hartree–Fock
   (tools/polarize.mjs), before anything else; the rest of the model (q and the repulsions A e^(−Br), the exponents by
   the Born–Mayer rule) is then fitted to the pair energies, with no attraction left to soak anything up. */
import { shortPair } from "./md.js";
import { expOf } from "./ffmodel.js";

export const POLNAMES = ["q", "lnA_XX", "lnA_XH", "lnA_HH", "lnD_XH", "b_XH"];
/* the polarization part from its fit: { aX, aH, thole }; the rest from p (POLNAMES) and the exponents bXX, bXH, bHH
   (bohr⁻¹, Born–Mayer's). An optional dispersion C on X–X, Tang–Toennies-damped, is added only when asked */
export function polTerms(p, pol, B, C = 0) {
  const [q, aXX, aXH, aHH, dXH, bXH] = p;
  return { q, pol, pairs: { "X|X": { tt: [Math.exp(aXX), B.XX, C] }, "X|H": { tt: [Math.exp(aXH), B.XH, 0] }, "H|H": { tt: [Math.exp(aHH), B.HH, 0] } }, ct: dXH === undefined ? null : { D: Math.exp(dXH), b: expOf(bXH) } };
}
/* solve a small dense system M x = b (Gaussian elimination, partial pivoting) */
function solve(M, b) {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (f) for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
  const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x;
}
/* Thole's damping for sites of polarizability ai, aj at distance r: [λ₃, λ₅] */
export function thole(r, ai, aj, a) { const s = ai * aj; if (!(s > 0)) return [1, 1]; const u3 = (r * r * r) / Math.sqrt(s), e = Math.exp(-a * u3); return [1 - e, 1 - (1 + a * u3) * e]; }
/* the dipoles answering fields E (flat, per site) for sites at x (array of d-vectors) with polarizabilities al:
   (α⁻¹ − T) μ = E, solved directly */
export function induce(x, al, E, d, a) {
  const n = x.length, idx = [], M = []; x.forEach((_, i) => { if (al[i] > 0) idx.push(i); });
  const m = idx.length * d; for (let r = 0; r < m; r++) M.push(new Array(m).fill(0));
  idx.forEach((i, I) => {
    for (let c = 0; c < d; c++) M[I * d + c][I * d + c] = 1 / al[i];
    idx.forEach((j, J) => {
      if (J <= I) return; const r = x[i].map((v, c) => v - x[j][c]), r2 = r.reduce((s, v) => s + v * v, 0), rr = Math.sqrt(r2), [l3, l5] = thole(rr, al[i], al[j], a);
      for (let c = 0; c < d; c++) for (let e = 0; e < d; e++) { const T = (3 * l5 * r[c] * r[e]) / (r2 * r2 * rr) - (c === e ? l3 / (r2 * rr) : 0); M[I * d + c][J * d + e] -= T; M[J * d + e][I * d + c] -= T; }
    });
  });
  const b = []; idx.forEach((i) => { for (let c = 0; c < d; c++) b.push(E[i * d + c]); });
  const sol = solve(M, b), mu = new Float64Array(n * d); idx.forEach((i, I) => { for (let c = 0; c < d; c++) mu[i * d + c] = sol[I * d + c]; });
  return mu;
}
/* a molecule's polarizability tensor under the model (its sites at the template, the field uniform): d × d */
export function tensorOf(tmpl, pol) {
  const d = tmpl[0].length, al = tmpl.map((_, i) => (i ? pol.aH : pol.aX));
  return Array.from({ length: d }, (_, k) => { const E = new Float64Array(tmpl.length * d); tmpl.forEach((_, i) => (E[i * d + k] = 1)); const mu = induce(tmpl, al, E, d, pol.thole); return Array.from({ length: d }, (_, c) => tmpl.reduce((s, _, i) => s + mu[i * d + c], 0)); });
}
/* the energy of a cluster of rigid molecules (each a list of site positions, heavy atom first): charges between
   molecules, the induced dipoles, the repulsions (and dispersion if the terms carry it). Returns its parts */
export function clusterEnergy(terms, mols) {
  const { q, pol, pairs } = terms, d = mols[0][0].length, nH = mols[0].length - 1, qq = (i) => (i ? q : -nH * q), ty = (i) => (i ? "H" : "X");
  const x = [], al = [], mol = [], ch = []; mols.forEach((M, a) => M.forEach((p, i) => { x.push(p); al.push(i ? pol.aH : pol.aX); mol.push(a); ch.push(qq(i)); }));
  const n = x.length, E = new Float64Array(n * d); let Eq = 0, Er = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (mol[i] === mol[j]) continue;
    const r = x[i].map((v, c) => v - x[j][c]), r2 = r.reduce((s, v) => s + v * v, 0), rr = Math.sqrt(r2), [l3] = thole(rr, al[i], al[j], pol.thole);
    Eq += (ch[i] * ch[j]) / rr; if (terms.ct && (i % (nH + 1) === 0) !== (j % (nH + 1) === 0)) Er -= terms.ct.D * Math.exp(-terms.ct.b * rr); const ti = ty(i % (nH + 1)), tj = ty(j % (nH + 1)), key = ti !== tj ? "X|H" : `${ti}|${tj}`; Er += shortPair(pairs[key], r2)[0];
    for (let c = 0; c < d; c++) { E[i * d + c] += (l3 * ch[j] * r[c]) / (r2 * rr); E[j * d + c] -= (l3 * ch[i] * r[c]) / (r2 * rr); }
  }
  const mu = induce(x, al, E, d, pol.thole); let Ep = 0; for (let k = 0; k < E.length; k++) Ep -= 0.5 * mu[k] * E[k];
  return { E: Eq + Ep + Er, Eq, Epol: Ep, Erep: Er, mu };
}
export { expOf };
