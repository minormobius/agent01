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
import { MOLS, placement } from "./molpair.mjs";

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
} else if (cmd === "wells") {
  /* the field's own deepest pairs, which random placements rarely land in: 4000 random placements scored on the fitted
     field, the best 300 refined by small rigid moves of the second molecule, the distinct minima (by energy, 0.02 kcal/mol)
     kept, 16 of them at least 0.01 kcal/mol apart (from the deepest down) written for molpair.mjs `well` to recompute by MP2 (k = 5000 + i, so a refit takes them in) */
  const grown = (process.argv.find((a) => a.startsWith("--plus=")) ?? "").split("=")[1] ?? "", key = grown ? `${name}@${grown}` : name, M = MOLS[name];
  const F = (await import("../js/molffdata.js")).MOLFF[key]; if (!F) { console.log(`no field ${key}`); process.exit(1); }
  const d = M.d; let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const E = (A, B) => modelEnergy(F.p, M, A.map((a) => a.at), B.map((b) => b.at));
  const nudge = (B, h) => { const c = B[0].at, S = Array.from({ length: d }, () => new Array(d).fill(0)); for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) { const v = (rnd() - 0.5) * h; S[i][j] = v; S[j][i] = -v; }
    // an exact rotation: the rows of I + S, Gram–Schmidt orthonormalized (B stays rigid however many moves it takes)
    const Q = []; for (let i = 0; i < d; i++) { let r = S[i].map((v, j) => v + (i === j ? 1 : 0)); for (const q of Q) { const p = r.reduce((t, x, j) => t + x * q[j], 0); r = r.map((x, j) => x - p * q[j]); } const n = Math.hypot(...r); Q.push(r.map((x) => x / n)); }
    const t = Array.from({ length: d }, () => (rnd() - 0.5) * h * 2); return B.map((b) => ({ Z: b.Z, at: b.at.map((_, i) => c[i] + t[i] + b.at.reduce((q, x, j) => q + Q[i][j] * (x - c[j]), 0)) })); };
  const starts = Array.from({ length: 4000 }, (_, k) => { const [A, B] = placement(M, 100000 + k); return { A, B, e: E(A, B) }; }).sort((a, b) => a.e - b.e).slice(0, 300);
  const mins = [];
  for (const st of starts) { let { A, B, e } = st; for (let it = 0, h = 0.3; it < 1500; it++) { const nb = nudge(B, h), ne = E(A, nb); if (ne < e) { B = nb; e = ne; } else if (it % 150 === 149) h *= 0.6; }
    const cen = B[0].at; if (!mins.some((m) => Math.abs(m.e - e) < 0.005 / KCAL && Math.hypot(...m.B[0].at.map((x, i) => x - cen[i])) < 0.3)) mins.push({ A, B, e }); }
  mins.sort((a, b) => a.e - b.e); const keep = []; for (const m of mins) { if (keep.length >= 16) break; if (keep.every((k) => Math.abs(k.e - m.e) >= 0.01 / KCAL)) keep.push(m); } // spread over the well's depths, not one well's symmetric copies
  const wj = JSON.stringify(keep.map((m) => ({ A: m.A, B: m.B, model: m.e }))); writeFileSync(path.join(DIR, `wells-${name}${grown}.json`), wj); writeFileSync(path.join(here, `wells-${name}${grown}.json`), wj + "\n"); // the repo copy is what the runner reads
  console.log(`${key}: ${mins.length} distinct minima from 300; deepest ${keep.map((m) => (m.e * KCAL).toFixed(3)).join(", ")} kcal/mol on the field (the random set's deepest MP2 placement for comparison: see molpair bake)`);
} else if (cmd === "fit") {
  // --plus=Dd: fit to the grown basis's placements (pairDd-…), stored as "<name>@Dd"
  const grown = (process.argv.find((a) => a.startsWith("--plus=")) ?? "").split("=")[1] ?? "", key = grown ? `${name}@${grown}` : name;
  const M = MOLS[name], pts = readdirSync(DIR).filter((f) => f.startsWith(`pair${grown}-${name}-`)).map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8"))).filter((r) => r.ok && r.mp2 < 40 / KCAL).sort((a, b) => a.k - b.k);
  if (pts.length < 20) { console.log(`${name}: only ${pts.length} placements so far`); process.exit(0); }
  const cut = Math.floor(pts.length * 0.8), train = pts.slice(0, cut), test = pts.slice(cut);
  const starts = [[0.2, 3, 3, 3, 20, 20, 20], [0.4, 4, 4, 4, 100, 100, 100], [0.1, 2, 2, 2, 5, 5, 5]].map((s) => (M.d === 4 ? [...s.map((v, i) => (i >= 4 ? v * 10 : v)), 2, 2] : s));
  const rms = (p, set) => Math.sqrt(set.filter((x) => x.mp2 < 0).reduce((t, x) => t + (modelEnergy(p, M, x.A, x.B) - x.mp2) ** 2, 0) / Math.max(1, set.filter((x) => x.mp2 < 0).length)) * KCAL;
  const best = starts.map((s) => fit(M, train, s)).sort((a, b) => rms(a, train) - rms(b, train))[0];
  const out = existsSync(path.join(here, "../js/molffdata.js")) ? (await import("../js/molffdata.js")).MOLFF : {};
  out[key] = { d: M.d, X: M.X, L: M.L, R: M.R, theta: M.theta, names: NAMES.slice(0, best.length), p: best.map((v) => +v.toPrecision(10)), train: train.length, test: test.length, rmsTrain: +rms(best, train).toFixed(3), rmsTest: +rms(best, test).toFixed(3) };
  writeFileSync(path.join(here, "../js/molffdata.js"), `/* Generated by tools/molff.mjs fit; do not edit. Per molecule, the XL₂ force field (charges on the nuclei, Born–Mayer
   repulsions, damped dispersion; parameters as named), fitted to MP2 pair energies, and its rms error (kcal/mol, the
   attractive placements) on the placements it was fitted to and on the fifth held out. */
export const MOLFF = ${JSON.stringify(out)};
`);
  console.log(`${name}: rms ${out[name].rmsTrain} kcal/mol on ${train.length} fitted, ${out[name].rmsTest} on ${test.length} held out; ${best.map((v, i) => `${NAMES[i]} ${v.toFixed(4)}`).join(", ")}`);
} else console.error("usage: molff.mjs fit <OF2|PxGl2>");
