/* ATOM⁴'s rigid H₂X force field, no DOM: what tools/fitff.mjs fits and the live views run. Charges on the nuclei (q
   on each hydrogen, −2q on X), an exponential repulsion A e^(−Br) between every pair of sites, and on X–X a
   Tang–Toennies-damped attraction −f₆(Br) C/r⁶ (js/md.js's tt term). Parameters, in atomic units, are NAMES (each B
   through expOf). */
import { shortPair } from "./md.js";

export const NAMES = ["q", "lnA_XX", "B_XX", "C_XX", "lnA_XH", "B_XH", "lnA_HH", "B_HH"];
/* each exponent is held between 0.8 and 4 bohr⁻¹ (a logistic of its parameter), so no fit can switch a repulsion
   off or push the damping so far that the attraction runs undamped into the core */
export const expOf = (z) => 0.8 + 3.2 / (1 + Math.exp(-z));
export function termsOf(p) {
  const [q, aXX, bXX, cXX, aXH, bXH, aHH, bHH] = p;
  return { q, pairs: { "X|X": { tt: [Math.exp(aXX), expOf(bXX), cXX] }, "X|H": { tt: [Math.exp(aXH), expOf(bXH), 0] }, "H|H": { tt: [Math.exp(aHH), expOf(bHH), 0] } } };
}
/* two molecules' interaction under the model (no box): A and B as lists of site positions, heavy atom first */
export function modelEnergy(p, A, B) {
  const { q, pairs } = termsOf(p), ty = (i) => (i ? "H" : "X"), qq = (i) => (i ? q : -2 * q); let E = 0;
  A.forEach((a, i) => B.forEach((b, j) => { const r2 = a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0), key = ty(i) !== ty(j) ? "X|H" : `${ty(i)}|${ty(j)}`; E += (qq(i) * qq(j)) / Math.sqrt(r2) + shortPair(pairs[key], r2)[0]; }));
  return E;
}
