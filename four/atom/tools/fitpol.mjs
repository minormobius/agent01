/* Fits the polarizable force field (js/polmodel.js) for each water and writes js/polfields.js. Three stages, each from
   the molecule's own Hartree–Fock and nothing fitted to pairs until the last:
   1. the charges and, in 4D, the clouds, from its electrostatic potential (tools/esp.mjs fitSites);
   2. the site polarizabilities and the Thole a within the molecule, from its polarizability tensor by finite field
      (tools/polarize.mjs);
   3. the repulsions (A per site pair, exponents by the Born–Mayer rule) and the clouds' damping scale, from the pair
      energies in js/ffdata.js. Weights as tools/fitff.mjs gives them (e^(−E/W), the attractive placements counting most),
      except the crowded pairs from crystal probes (k ≥ 10000), which count PROBE times: a crystal is many such contacts,
      and a fit that gives them up for the dimer's last kcal/mol packs crystals it shouldn't.
     node four/atom/tools/fitpol.mjs [key …]    # writes js/polfields.js (about ten minutes; 4D tensors and potentials) */
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FFDATA } from "../js/ffdata.js";
import { FORCEFIELDS } from "../js/forcefields.js";
import { polTerms, tensorOf, clusterEnergy } from "../js/polmodel.js";
import { bornMayer } from "./fitff.mjs";
import { polarizability } from "./polarize.mjs";
import { espGrid, fitSites } from "./esp.mjs";
import { WORLDS, monoOf } from "./forcefield.mjs";
import { hydrideAtoms } from "./census.mjs";

const KCAL = 627.509, W = 3 / KCAL, CAP = 40 / KCAL, PROBE = 50;
const HH_FROM = { "4.9": "4" }; // XH₃ takes Xater's H–H repulsion (its own data leave it at nothing, and its clusters crowd hydrogens)
const fitted = {};
function solve(M, b) { const n = b.length, A = M.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } } const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x; }
/* Levenberg–Marquardt on a residual vector */
function lm(resid, p0, iters = 200) {
  let p = p0.slice(), r = resid(p), cost = r.reduce((s, x) => s + x * x, 0), lam = 1e-3;
  for (let it = 0; it < iters; it++) {
    const J = p.map((_, k) => { const h = 1e-6 * Math.max(1, Math.abs(p[k])), pp = p.slice(); pp[k] += h; return resid(pp).map((x, i) => (x - r[i]) / h); });
    const JTJ = p.map((_, a) => p.map((_, b) => J[a].reduce((s, x, i) => s + x * J[b][i], 0))), JTr = p.map((_, a) => J[a].reduce((s, x, i) => s + x * r[i], 0));
    let improved = false;
    for (let t = 0; t < 20 && !improved; t++) { const M = JTJ.map((row, a) => row.map((v, b) => v + (a === b ? lam * (v + 1e-12) : 0))), step = solve(M, JTr.map((x) => -x)), pn = p.map((v, k) => v + step[k]), rn = resid(pn), cn = rn.reduce((s, x) => s + x * x, 0); if (cn < cost) { p = pn; r = rn; improved = Math.abs(cost - cn) > 1e-16; cost = cn; lam = Math.max(lam / 3, 1e-9); } else lam *= 4; }
    if (!improved) break;
  }
  return p;
}
export function fitKey(key, log = () => {}) {
  const d = WORLDS[key].d, m = monoOf(key), tmpl = hydrideAtoms(m.Z, d, m.R, m.param).map((a) => a.at), Z = m.Z;
  // 1. electrostatics
  const elec = fitSites(espGrid(key, { nPer: 50, shells: [1.4, 1.8, 2.4, 3, 4] })); log(`${key}: charges and clouds`, JSON.stringify(elec));
  // 2. polarization, from the tensor
  const hf = polarizability(key), pol = (x) => ({ aX: Math.exp(x[0]), aH: Math.exp(x[1]), thole: Math.exp(x[2]) });
  const resT = (x) => tensorOf(tmpl, pol(x)).flatMap((row, i) => row.map((v, j) => (v - (i === j ? hf.axes[i] : 0)) / hf.mean));
  let best = null; for (const s of [[1, -1, -1], [1.5, 0, 0], [0.5, 0.5, -1.5], [2, -2, 0.5]]) { const x = lm(resT, s), c = resT(x).reduce((t, v) => t + v * v, 0); if (!best || c < best.c) best = { x, c }; }
  const P = pol(best.x), tensor = tensorOf(tmpl, P).map((r, i) => r[i]); log(`${key}: polarizabilities`, JSON.stringify(P), "tensor", tensor.map((v) => v.toFixed(3)).join(" "), "vs HF", hf.axes.join(" "));
  // 3. repulsions and the clouds' damping
  const B = { XX: bornMayer(d, Z, Z), XH: bornMayer(d, Z, 1), HH: bornMayer(d, 1, 1) }, clouds = d === 4;
  const pts = FFDATA[key].points.filter((p) => p.ok && p.E < CAP), w = pts.map((p) => (p.k >= 10000 ? PROBE : Math.exp(-Math.min(p.E, 0) / W) / (1 + Math.max(p.E, 0) / W)));
  // two hydrogens' overlap is a property of the hydrogens, not of the molecule they sit on: where a world's H–H
  // repulsion is fitted already (HH_FROM), it's taken as fitted there, not left to data that barely see it
  const hh = HH_FROM[key] ? fitted[HH_FROM[key]]?.p[2] : null, full = (x) => (hh === null || hh === undefined ? x : [x[0], x[1], hh, ...x.slice(2)]);
  const T = (y) => { const x = full(y); return polTerms({ elec, pol: P, B, p: x.slice(0, 3), cdamp: clouds ? Math.exp(x[3]) : 1 }); };
  const resid = (y) => pts.map((pt, i) => Math.sqrt(w[i]) * (clusterEnergy(T(y), [pt.A, pt.B]).E - pt.E));
  const old = FORCEFIELDS[key].p, start = clouds ? [old[1], old[4], old[6], 0] : [old[1], old[4], old[6]];
  const y = lm(resid, hh === null || hh === undefined ? start : [start[0], start[1], ...start.slice(3)], 150), x = full(y), TT = T(y);
  if (hh !== null && hh !== undefined) log(`${key}: H–H repulsion taken from ${HH_FROM[key]} (ln A ${hh.toFixed(4)})`);
  const rms = (f) => { const s = pts.filter(f); return s.length ? +(Math.sqrt(s.reduce((t, pt) => t + (clusterEnergy(TT, [pt.A, pt.B]).E - pt.E) ** 2, 0) / s.length) * KCAL).toFixed(3) : null; };
  const scan = FFDATA[key].points.filter((q) => q.k >= 56 && q.k < 63).map((q) => ({ hf: +(q.E * KCAL).toFixed(3), model: +(clusterEnergy(TT, [q.A, q.B]).E * KCAL).toFixed(3) }));
  const out = { d, Z, R: m.R, param: m.param, elec: { qH: +elec.qH.toFixed(6), cX: +elec.cX.toFixed(6), cH: +elec.cH.toFixed(6), rel: +elec.rel.toFixed(4) }, pol: { aX: +P.aX.toFixed(6), aH: +P.aH.toFixed(6), thole: Math.min(+P.thole.toPrecision(6), 1e6) }, tensor: { model: tensor.map((v) => +v.toFixed(4)), hf: hf.axes },
    B, p: x.slice(0, 3).map((v) => +v.toPrecision(10)), cdamp: clouds ? +Math.exp(x[3]).toPrecision(6) : 1, rms: { attractive: rms((q) => q.E < 0 && q.k < 10000), probes: rms((q) => q.k >= 10000), all: rms(() => true) }, scan };
  fitted[key] = out;
  log(`${key}: repulsions ${out.p.join(", ")}, cloud damping ${out.cdamp}; rms attractive ${out.rms.attractive}, probes ${out.rms.probes}, all ${out.rms.all} kcal/mol`);
  return out;
}
/* the field's terms for a key, as js/polmodel.js and js/polcrystal.js take them */
export const termsFor = (F) => polTerms({ elec: F.elec, pol: F.pol, B: F.B, p: F.p, cdamp: F.cdamp });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const keys = process.argv.slice(2).length ? process.argv.slice(2) : ["3", "4", "4.9"], file = new URL("../js/polfields.js", import.meta.url);
  const old = existsSync(file) ? (await import("../js/polfields.js")).POLFIELDS : {}, out = { ...old };
  Object.assign(fitted, old);
  for (const key of keys) out[key] = fitKey(key, console.log);
  writeFileSync(file, `/* Generated by tools/fitpol.mjs; do not edit. Per world, the polarizable force field (js/polmodel.js): charges and 4D's
   clouds fitted to the molecule's Hartree–Fock potential (rel: the misfit over the potential's size), site
   polarizabilities fitted to its Hartree–Fock tensor (both shown), Born–Mayer exponents B, the fitted repulsions p
   (ln A for X–X, X–H, H–H) and the clouds' damping scale, its rms error (kcal/mol) on the attractive placements, on the
   crowded pairs from crystal probes and on all, and the H-bond scan against Hartree–Fock. */
export const POLFIELDS = ${JSON.stringify(out)};
`);
  console.log("wrote js/polfields.js");
}
