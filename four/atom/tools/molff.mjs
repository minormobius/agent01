/* A force field for XL₂ molecules (PxGl₂, our OF₂), fitted to tools/molpair.mjs's MP2 pair energies, so their liquids
   can be simulated (tools/liquid.mjs models of3, pg4). Sites on the nuclei: the ligands carry q each and the centre
   −2q; every pair of site types (X–X, X–L, L–L) an exponential repulsion A e^(−Br), B held at the Born–Mayer rule
   √(2I_a) + √(2I_b) as the book's water fields hold theirs, and a Tang–Toennies-damped −f₆(Br) C/r⁶. The pairs are
   MP2, so C here is the dispersion it should be, not a Hartree–Fock stand-in. Levenberg–Marquardt on the energies,
   each weighted e^(−E/W)/(1 + E/W), W = 3 kcal/mol, those above +40 kcal/mol left out; the last fifth of the
   placements held out of the fit and reported as its test.
     node four/atom/tools/molff.mjs fit <OF2|PxGl2>     → js/molffdata.js */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { shortPair } from "../js/md.js";
import { bornMayer } from "./fitff.mjs";
import { MOLS } from "./molpair.mjs";

const here = path.dirname(new URL(import.meta.url).pathname), DIR = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-molpair"), KCAL = 627.5095;
export const NAMES = ["q", "lnA_XX", "lnA_XL", "lnA_LL", "C_XX", "C_XL", "C_LL", "c_X", "c_L"];
/* in 4D each site also carries a cloud term (js/polmodel.js's): a round cloud's own potential once the shell theorem
   fails, c/r³, so charge–cloud q c/r³ and cloud–cloud −3cc′/r⁵, Tang–Toennies-damped at the pair's Born–Mayer exponent:
   the permanent pull between neutral 4D clouds, which a 3D-style field can only fake with its 1/r⁶ */
/* the field's pair terms for md.js / gibbs.js, given its parameters and molecule */
export function termsOf(p, M) {
  const [q, aXX, aXL, aLL, cXX, cXL, cLL] = p, B = (a, b) => bornMayer(M.d, a, b), qs = { X: -2 * q, L: q };
  const cl = M.d === 4 && p.length > 7 ? { X: p[7], L: p[8] } : null;
  const one = (s, t, lnA, C) => { const b = B(M[s], M[t]), tt = { tt: [Math.exp(lnA), b, C] }; if (!cl) return tt;
    return { sum: [tt, { ttr: [3, b, qs[s] * cl[t] + cl[s] * qs[t], 3] }, { ttr: [5, b, -3 * cl[s] * cl[t], 5] }] }; };
  return { q, pairs: { "X|X": one("X", "X", aXX, cXX), "X|L": one("X", "L", aXL, cXL), "L|L": one("L", "L", aLL, cLL) } };
}
export function modelEnergy(p, M, A, B) {
  const { q, pairs } = termsOf(p, M), t = (i) => (i ? "L" : "X"), qq = (i) => (i ? q : -2 * q); let E = 0;
  A.forEach((a, i) => B.forEach((b, j) => { const r2 = a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0), key = t(i) === t(j) ? `${t(i)}|${t(i)}` : "X|L"; E += (qq(i) * qq(j)) / Math.sqrt(r2) + shortPair(pairs[key], r2)[0]; }));
  return E;
}
function solve(M, b) { const n = b.length, A = M.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } } const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x; }
export function fit(M, pts, start) {
  const W = 3 / KCAL, w = pts.map((p) => Math.exp(-Math.min(p.mp2, 0) / W) / (1 + Math.max(p.mp2, 0) / W)), resid = (p) => pts.map((pt, i) => Math.sqrt(w[i]) * (modelEnergy(p, M, pt.A, pt.B) - pt.mp2));
  let p = start.slice(), r = resid(p), cost = r.reduce((s, x) => s + x * x, 0), lam = 1e-3;
  for (let it = 0; it < 300; it++) {
    const J = p.map((_, k) => { const h = 1e-6 * Math.max(1, Math.abs(p[k])), pp = p.slice(); pp[k] += h; return resid(pp).map((x, i) => (x - r[i]) / h); });
    const JTJ = p.map((_, a) => p.map((_, b) => J[a].reduce((s, x, i) => s + x * J[b][i], 0))), JTr = p.map((_, a) => J[a].reduce((s, x, i) => s + x * r[i], 0));
    let better = false;
    for (let tries = 0; tries < 20 && !better; tries++) { const step = solve(JTJ.map((row, a) => row.map((v, b) => v + (a === b ? lam * (v + 1e-12) : 0))), JTr.map((x) => -x)), pn = p.map((v, k) => v + step[k]), rn = resid(pn), cn = rn.reduce((s, x) => s + x * x, 0);
      if (cn < cost) { better = Math.abs(cost - cn) > 1e-16; p = pn; r = rn; cost = cn; lam = Math.max(lam / 3, 1e-9); } else lam *= 4; }
    if (!better) break;
  }
  return p;
}
const [cmd, name] = process.argv.slice(2), MAIN = !!process.argv[1] && import.meta.url.endsWith("/" + path.basename(process.argv[1]));
if (!MAIN) {
  // imported (tools/liquid.mjs): no command
} else if (cmd === "fit") {
  const M = MOLS[name], pts = readdirSync(DIR).filter((f) => f.startsWith(`pair-${name}-`)).map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8"))).filter((r) => r.ok && r.mp2 < 40 / KCAL).sort((a, b) => a.k - b.k);
  if (pts.length < 20) { console.log(`${name}: only ${pts.length} placements so far`); process.exit(0); }
  const cut = Math.floor(pts.length * 0.8), train = pts.slice(0, cut), test = pts.slice(cut);
  const starts = [[0.2, 3, 3, 3, 20, 20, 20], [0.4, 4, 4, 4, 100, 100, 100], [0.1, 2, 2, 2, 5, 5, 5]].map((s) => (M.d === 4 ? [...s.map((v, i) => (i >= 4 ? v * 10 : v)), 2, 2] : s));
  const rms = (p, set) => Math.sqrt(set.filter((x) => x.mp2 < 0).reduce((t, x) => t + (modelEnergy(p, M, x.A, x.B) - x.mp2) ** 2, 0) / Math.max(1, set.filter((x) => x.mp2 < 0).length)) * KCAL;
  const best = starts.map((s) => fit(M, train, s)).sort((a, b) => rms(a, train) - rms(b, train))[0];
  const out = existsSync(path.join(here, "../js/molffdata.js")) ? (await import("../js/molffdata.js")).MOLFF : {};
  out[name] = { d: M.d, X: M.X, L: M.L, R: M.R, theta: M.theta, names: NAMES.slice(0, best.length), p: best.map((v) => +v.toPrecision(10)), train: train.length, test: test.length, rmsTrain: +rms(best, train).toFixed(3), rmsTest: +rms(best, test).toFixed(3) };
  writeFileSync(path.join(here, "../js/molffdata.js"), `/* Generated by tools/molff.mjs fit; do not edit. Per molecule, the XL₂ force field (charges on the nuclei, Born–Mayer
   repulsions, damped dispersion; parameters as named), fitted to MP2 pair energies, and its rms error (kcal/mol, the
   attractive placements) on the placements it was fitted to and on the fifth held out. */
export const MOLFF = ${JSON.stringify(out)};
`);
  console.log(`${name}: rms ${out[name].rmsTrain} kcal/mol on ${train.length} fitted, ${out[name].rmsTest} on ${test.length} held out; ${best.map((v, i) => `${NAMES[i]} ${v.toFixed(4)}`).join(", ")}`);
} else console.error("usage: molff.mjs fit <OF2|PxGl2>");
