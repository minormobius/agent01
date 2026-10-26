/* Fits a rigid molecule's force field to the Hartree–Fock pair energies in js/ffdata.js and writes js/forcefields.js.
     node games/atom4/tools/fitff.mjs
   The model, for H₂X: charges on the nuclei (q_H on each hydrogen, −2q_H on X), an exponential repulsion
   A e^(−Br) between every pair of sites, and on X–X a Tang–Toennies-damped attraction −f₆(Br) C/r⁶ (js/md.js's tt
   term). Hartree–Fock has no dispersion, so C here soaks up induction and whatever the charges miss; correlation is
   the calibration's job (our water, through the same fit). Levenberg–Marquardt on the energies, each weighted by
   e^(−E/W) (the placements a liquid visits count most), those above +40 kcal/mol left out (the tight ones count, weakly).
   The repulsions' exponents aren't fitted: they're held at the Born–Mayer rule, √(2I_A) + √(2I_B), so the fit can't
   soften the core (an earlier free fit let 4D molecules crowd until their heavy atoms touched). */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
/* the baked data, or (while the bake runs) the points finished so far in its cache */
const FFDATA = existsSync(new URL("../js/ffdata.js", import.meta.url)) ? (await import("../js/ffdata.js")).FFDATA : fromCache();
function fromCache() {
  const dir = path.join(tmpdir(), "atom4-ff"), out = { 3: { Z: 8, points: [] }, 4: { Z: 10, points: [] } };
  for (const f of readdirSync(dir)) { const r = JSON.parse(readFileSync(path.join(dir, f), "utf8")); out[r.d].points.push(r); }
  return out;
}
import { NAMES, termsOf, modelEnergy } from "../js/ffmodel.js";
export { NAMES, termsOf, modelEnergy };

export const KCAL = 627.509;
const W = 3 / KCAL, CAP = 40 / KCAL;
function solve(M, b) { const n = b.length, A = M.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } } const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x; }
/* the repulsions' exponents by the Born–Mayer rule (chapter 8): each atom's density falls as e^(−√(2I) r), so a
   pair's overlap falls with the sum of the two, I being each atom's ionization energy (js/table.js) */
import { TABLE } from "../js/table.js";
import { expOf } from "../js/ffmodel.js";
export const bornMayer = (d, Za, Zb) => Math.sqrt(2 * TABLE[d][Za - 1].ion) + Math.sqrt(2 * TABLE[d][Zb - 1].ion);
const logitB = (b) => -Math.log(3.2 / (b - 0.8) - 1); // expOf's inverse
export function fit(key, start, free = start.map(() => true)) {
  const pts = FFDATA[key].points.filter((p) => p.ok && p.E < CAP), w = pts.map((p) => Math.exp(-Math.min(p.E, 0) / W) / (1 + Math.max(p.E, 0) / W));
  const resid = (p) => pts.map((pt, i) => Math.sqrt(w[i]) * (modelEnergy(p, pt.A, pt.B) - pt.E));
  let p = start.slice(), r = resid(p), cost = r.reduce((s, x) => s + x * x, 0), lam = 1e-3;
  for (let it = 0; it < 300; it++) {
    const J = p.map((_, k) => { if (!free[k]) return r.map(() => 0); const h = 1e-6 * Math.max(1, Math.abs(p[k])), pp = p.slice(); pp[k] += h; return resid(pp).map((x, i) => (x - r[i]) / h); });
    const JTJ = p.map((_, a) => p.map((_, b) => J[a].reduce((s, x, i) => s + x * J[b][i], 0))), JTr = p.map((_, a) => J[a].reduce((s, x, i) => s + x * r[i], 0));
    let improved = false;
    for (let tries = 0; tries < 20 && !improved; tries++) {
      const M = JTJ.map((row, a) => row.map((v, b) => v + (a === b ? lam * (v + 1e-12) : 0))), step = solve(M, JTr.map((x) => -x)), pn = p.map((v, k) => v + step[k]);
      const rn = resid(pn), cn = rn.reduce((s, x) => s + x * x, 0);
      if (cn < cost) { p = pn; r = rn; improved = Math.abs(cost - cn) > 1e-14; cost = cn; lam = Math.max(lam / 3, 1e-9); } else lam *= 4;
      if (cn >= cost && tries === 19) improved = false;
    }
    if (!improved) break;
  }
  const rms = Math.sqrt(pts.reduce((s, pt) => s + (modelEnergy(p, pt.A, pt.B) - pt.E) ** 2 * (pt.E < 0 ? 1 : 0), 0) / pts.filter((pt) => pt.E < 0).length);
  return { p, rms, n: pts.length };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = {};
  for (const key of Object.keys(FFDATA)) {
    const d = FFDATA[key].d;
    if (FFDATA[key].points.length < 20) { console.log(`${key}: only ${FFDATA[key].points.length} points so far`); continue; }
    // the exponents held at Born–Mayer's; the charge, prefactors and the attraction fitted
    const Z = FFDATA[key].Z, bXX = logitB(bornMayer(d, Z, Z)), bXH = logitB(bornMayer(d, Z, 1)), bHH = logitB(bornMayer(d, 1, 1)), free = [true, true, false, true, true, false, true, false];
    const data = FFDATA[key], R = data.R, best = [3, 4].map((s) => fit(key, [0.35 + 0.1 * (s - 3), Math.log(30 * s), bXX, 10, Math.log(3), bXH, Math.log(1), bHH], free)).sort((a, b) => a.rms - b.rms)[0];
    const scan = data.points.filter((p) => p.k >= 56 && p.k < 63).map((pt) => ({ hf: pt.E * KCAL, model: modelEnergy(best.p, pt.A, pt.B) * KCAL }));
    console.log(`${key}: rms ${(best.rms * KCAL).toFixed(3)} kcal/mol over the attractive points; params`, best.p.map((x, i) => `${NAMES[i]} ${x.toFixed(4)}`).join(", "));
    console.log("   the H-bond scan, HF vs model (kcal/mol):", scan.map((s) => `${s.hf.toFixed(2)}/${s.model.toFixed(2)}`).join("  "));
    out[key] = { d, Z: data.Z, R, param: data.param, names: NAMES, p: best.p.map((x) => +x.toPrecision(10)), rms: +(best.rms * KCAL).toFixed(4), scan };
  }
  writeFileSync(new URL("../js/forcefields.js", import.meta.url), `/* Generated by tools/fitff.mjs from js/ffdata.js; do not edit. Per world, the rigid H₂X force field's parameters
   (atomic units; names as listed), its rms error on the attractive placements (kcal/mol), and the H-bond scan. */
export const FORCEFIELDS = ${JSON.stringify(out)};
`);
}
