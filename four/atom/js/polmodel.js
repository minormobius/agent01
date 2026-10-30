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

/* the model's terms: elec { qH, cX, cH } (tools/esp.mjs: the charges and, in 4D, the clouds, fitted to the molecule's
   own potential), pol { aX, aH, thole } (to its polarizability tensor), B { XX, XH, HH } (Born–Mayer's exponents),
   and p the fitted rest: [lnA_XX, lnA_XH, lnA_HH], optionally [lnD_XH, b_XH] for a short-range X···H attraction
   D e^(−br) (charge transfer), and C an X–X dispersion if asked. cdamp scales the exponent of the clouds' damping
   (1: the repulsion's own; fitted, since how fast two clouds' overlap spoils their far-field forms isn't known) */
export const POLNAMES = ["lnA_XX", "lnA_XH", "lnA_HH", "lnD_XH", "b_XH"];
export function polTerms({ elec, pol, B, p, C = 0, cdamp = 1 }) {
  const [aXX, aXH, aHH, dXH, bXH] = p;
  return { cdamp, q: elec.qH, cX: elec.cX || 0, cH: elec.cH || 0, pol, pairs: { "X|X": { tt: [Math.exp(aXX), B.XX, C] }, "X|H": { tt: [Math.exp(aXH), B.XH, 0] }, "H|H": { tt: [Math.exp(aHH), B.HH, 0] } }, ct: dXH === undefined ? null : { D: Math.exp(dXH), b: expOf(bXH) } };
}
/* solve a small dense system M x = b (Gaussian elimination, partial pivoting) */
function solve(M, b) {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (f) for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
  const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x;
}
/* between molecules, Thole's own a (his fit to molecular polarizabilities; our water's tensor gives 0.384 by itself).
   Within a molecule the a fitted to its tensor shapes its response only, and can run to no damping at all, which
   between molecules would let two dipoles pull each other without limit at contact */
export const THOLE = 0.39;
/* Thole's damping for sites of polarizability ai, aj at distance r: [λ₃, λ₅] */
export function thole(r, ai, aj, a) { const s = ai * aj; if (!(s > 0)) return [1, 1]; const u3 = (r * r * r) / Math.sqrt(s), e = Math.exp(-a * u3); return [1 - e, 1 - (1 + a * u3) * e]; }
/* and with their slopes in r: [λ₃, λ₅, dλ₃/dr, dλ₅/dr] */
export function tholeJet(r, ai, aj, a) { const s = ai * aj; if (!(s > 0)) return [1, 1, 0, 0]; const u3 = (r * r * r) / Math.sqrt(s), e = Math.exp(-a * u3), du = (3 * r * r) / Math.sqrt(s); return [1 - e, 1 - (1 + a * u3) * e, a * e * du, a * a * u3 * e * du]; }
/* the dipoles answering fields E (flat, per site) for sites at x (array of d-vectors) with polarizabilities al:
   (α⁻¹ − T) μ = E, solved directly */
export function induce(x, al, E, d, a, mol = null, inter = a) {
  const n = x.length, idx = [], M = []; x.forEach((_, i) => { if (al[i] > 0) idx.push(i); });
  const m = idx.length * d; for (let r = 0; r < m; r++) M.push(new Array(m).fill(0));
  idx.forEach((i, I) => {
    for (let c = 0; c < d; c++) M[I * d + c][I * d + c] = 1 / al[i];
    idx.forEach((j, J) => {
      if (J <= I) return; const r = x[i].map((v, c) => v - x[j][c]), r2 = r.reduce((s, v) => s + v * v, 0), rr = Math.sqrt(r2), [l3, l5] = thole(rr, al[i], al[j], mol && mol[i] !== mol[j] ? inter : a);
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
/* Tang–Toennies' damping f_n(x) = 1 − e^(−x) Σ_{k≤n} xᵏ/k!, and its slope e^(−x) xⁿ/n! */
export function ttf(n, x) { let t = 1, s = 1; for (let k = 1; k <= n; k++) { t *= x / k; s += t; } const e = Math.exp(-x); return [1 - e * s, e * t]; }
/* the energy of a cluster of rigid molecules (each a list of site positions, heavy atom first): charges between
   molecules, the induced dipoles, the repulsions (and dispersion if the terms carry it). Returns its parts, and with
   grad its slope g in every site (flat, n × d). The dipoles are where the energy is stationary in them, so the slope is
   the field's at fixed dipoles (Hellmann–Feynman): each pair's terms, the dipoles' included, differentiated as they stand */
export function clusterEnergy(terms, mols, grad = false) {
  const { q, pol, pairs } = terms, d = mols[0][0].length, nH = mols[0].length - 1, qq = (i) => (i ? q : -nH * q), ty = (i) => (i ? "H" : "X");
  const x = [], al = [], mol = [], ch = [], cl = []; mols.forEach((M, a) => M.forEach((p, i) => { x.push(p); al.push(i ? pol.aH : pol.aX); mol.push(a); ch.push(qq(i)); cl.push(i ? terms.cH : terms.cX); }));
  const n = x.length, E = new Float64Array(n * d); let Eq = 0, Er = 0, Ec = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (mol[i] === mol[j]) continue;
    const r = x[i].map((v, c) => v - x[j][c]), r2 = r.reduce((s, v) => s + v * v, 0), rr = Math.sqrt(r2), [l3] = thole(rr, al[i], al[j], pol.inter ?? THOLE);
    Eq += (ch[i] * ch[j]) / rr; if (terms.ct && (i % (nH + 1) === 0) !== (j % (nH + 1) === 0)) Er -= terms.ct.D * Math.exp(-terms.ct.b * rr); const ti = ty(i % (nH + 1)), tj = ty(j % (nH + 1)), key = ti !== tj ? "X|H" : `${ti}|${tj}`; Er += shortPair(pairs[key], r2)[0];
    // the clouds (4D): a charge meets a cloud as q c/r³, two clouds as −3 c c′/r⁵ (−(c/r³)'s Laplacian, c = S/8); a
    // cloud's field on a dipole is 3c r/r⁵
    // Inside the clouds those forms fail (they are the far field), so each is damped Tang–Toennies-fashion with the
    // pair's own Born–Mayer exponent b: f_n(br) = 1 − e^(−br) Σ_{k≤n} (br)ᵏ/k!, f₃ on r⁻³ and f₅ on r⁻⁵; the fields
    // are the damped potentials' slopes
    const bd = pairs[key].tt[1] * (terms.cdamp ?? 1), r3 = r2 * rr, r5 = r3 * r2, bb = bd * rr, [f3, g3] = ttf(3, bb), [f5] = ttf(5, bb);
    Ec += (f3 * (ch[i] * cl[j] + cl[i] * ch[j])) / r3 - (3 * f5 * cl[i] * cl[j]) / r5;
    const fc = (3 * f3) / r5 - (bd * g3) / (r3 * rr); // −(1/r) d/dr [f₃(br)/r³]
    for (let c = 0; c < d; c++) { E[i * d + c] += r[c] * ((l3 * ch[j]) / r3 + cl[j] * fc); E[j * d + c] -= r[c] * ((l3 * ch[i]) / r3 + cl[i] * fc); }
  }
  const mu = induce(x, al, E, d, pol.thole, mol, pol.inter ?? THOLE); let Ep = 0; for (let k = 0; k < E.length; k++) Ep -= 0.5 * mu[k] * E[k];
  const out = { E: Eq + Ec + Ep + Er, Eq, Ecloud: Ec, Epol: Ep, Erep: Er, mu };
  if (grad) out.g = clusterSlope(terms, x, al, mol, ch, cl, mu, nH);
  return out;
}
/* clusterEnergy's slope at fixed dipoles mu. Each pair's energy e(r), r = x_i − x_j, is a sum of a radial part, the
   fields' −f(r) u·r and the dipoles' −(b₂ (μ_i·r)(μ_j·r) − b₁ μ_i·μ_j), b₁ = λ₃/r³, b₂ = 3λ₅/r⁵ */
function clusterSlope(terms, x, al, mol, ch, cl, mu, nH) {
  const { pol, pairs } = terms, d = x[0].length, n = x.length, g = new Float64Array(n * d), ty = (i) => (i ? "H" : "X"), r = new Float64Array(d), de = new Float64Array(d);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    let r2 = 0; for (let c = 0; c < d; c++) { r[c] = x[i][c] - x[j][c]; r2 += r[c] * r[c]; } const rr = Math.sqrt(r2), r3 = r2 * rr, inter = mol[i] !== mol[j];
    let rad = 0; de.fill(0); // rad: (de/dr)/r of the radial part; de: the rest of de/dr
    const mi = (c) => mu[i * d + c], mj = (c) => mu[j * d + c];
    if (inter) {
      rad -= (ch[i] * ch[j]) / r3;
      if (terms.ct && (i % (nH + 1) === 0) !== (j % (nH + 1) === 0)) rad += (terms.ct.D * terms.ct.b * Math.exp(-terms.ct.b * rr)) / rr;
      const ti = ty(i % (nH + 1)), tj = ty(j % (nH + 1)), key = ti !== tj ? "X|H" : `${ti}|${tj}`; rad -= shortPair(pairs[key], r2)[1];
      const bd = pairs[key].tt[1] * (terms.cdamp ?? 1), bb = bd * rr, [f3, g3] = ttf(3, bb), [f5, g5] = ttf(5, bb), g2 = (g3 * 3) / (bb || 1);
      rad += ((ch[i] * cl[j] + cl[i] * ch[j]) * ((bd * g3) / r3 - (3 * f3) / (r3 * rr))) / rr - (3 * cl[i] * cl[j] * ((bd * g5) / (r3 * r2) - (5 * f5) / (r3 * r3))) / rr;
      // the fields: charges' λ₃/r³ and clouds' fc = 3f₃/r⁵ − b g₃/r⁴, each −f(r) u·r
      const [l3, , dl3] = tholeJet(rr, al[i], al[j], pol.inter ?? THOLE), fq = l3 / r3, dfq = dl3 / r3 - (3 * l3) / (r3 * rr);
      const fc = (3 * f3) / (r3 * r2) - (bd * g3) / (r2 * r2), dfc = (7 * bd * g3) / (r3 * r2) - (15 * f3) / (r3 * r3) - (bd * bd * (g2 - g3)) / (r2 * r2);
      let uq = 0, uc = 0; for (let c = 0; c < d; c++) { uq += (ch[j] * mi(c) - ch[i] * mj(c)) * r[c]; uc += (cl[j] * mi(c) - cl[i] * mj(c)) * r[c]; }
      rad -= (dfq * uq + dfc * uc) / rr; for (let c = 0; c < d; c++) de[c] -= fq * (ch[j] * mi(c) - ch[i] * mj(c)) + fc * (cl[j] * mi(c) - cl[i] * mj(c));
    }
    if (al[i] > 0 && al[j] > 0) {
      const [l3, l5, dl3, dl5] = tholeJet(rr, al[i], al[j], inter ? pol.inter ?? THOLE : pol.thole), b1 = l3 / r3, b2 = (3 * l5) / (r3 * r2), db1 = dl3 / r3 - (3 * l3) / (r3 * rr), db2 = (3 * dl5) / (r3 * r2) - (15 * l5) / (r3 * r3);
      let ai = 0, aj = 0, ij = 0; for (let c = 0; c < d; c++) { ai += mi(c) * r[c]; aj += mj(c) * r[c]; ij += mi(c) * mj(c); }
      rad -= (db2 * ai * aj - db1 * ij) / rr; for (let c = 0; c < d; c++) de[c] -= b2 * (mi(c) * aj + mj(c) * ai);
    }
    for (let c = 0; c < d; c++) { const v = rad * r[c] + de[c]; g[i * d + c] += v; g[j * d + c] -= v; }
  }
  return g;
}
export { expOf };
