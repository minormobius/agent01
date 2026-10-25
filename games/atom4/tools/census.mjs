/* Bakes js/census.js: which hydride is the water of 4D. Every hydride of 4D's second and third rows (elements 3–11
   and 13–21), and our NH₃, H₂O and HF as the check, by the same Hartree–Fock (js/gauss.js) and the same recipe.
     node games/atom4/tools/census.mjs        # writes js/census.js (an hour or two; jobs run four at a time)

   Counting: an outer shell of m = d + 1 orbitals (s and d p's) holding v electrons makes v bonds while v ≤ m, and
   2m − v bonds with v − m lone pairs past that. Each hydride takes the symmetric shape that implies: the bonds along
   the corners of a simplex (all m of them), or tilted at α from an axis in a smaller simplex (a pyramid; flat at
   90°), or bent at θ (two), or straight (one). Its size and angle are minimized; then a few random nudges of every
   hydrogen (0.08 bohr) test that it's a minimum and not a saddle: a saddle drops by more than the minimizer's own
   leftover slope (1e-5 hartree). For each: the charge on hydrogen (Mulliken), the dipole, the
   top orbital. For every hydride whose hydrogens are positive and that has lone pairs: the hydrogen-bonded pair, as
   for Yater (tools/molecules.mjs), minimized over the distance and the acceptor's tilt, counterpoise-corrected.

   How much the bonds hold a liquid together: each molecule can make min(hydrogens, lone pairs) hydrogen bonds in a
   network (water 2, ammonia and HF 1), so the network's pull per molecule is about that many times one bond. In
   our world that orders water > HF > ammonia, as their boiling points and heats of vaporization do. */
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "../js/gauss.js";
import { TABLE } from "../js/table.js";
import { simplex } from "../js/polytopes.js";
import { minimize2 } from "./molecules.mjs";

const ET = G.evenTempered;
/* the census: 4D rows two and three; our N, O, F */
export const MEMBERS = { 3: [7, 8, 9], 4: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21] };
/* valence electrons, bonds and lone pairs, by counting */
export function valence(Z, d) {
  const core = d === 3 ? (Z > 10 ? 10 : 2) : Z > 12 ? 12 : 2, v = Z - core, m = d + 1;
  return { v, bonds: v <= m ? v : 2 * m - v, lp: v > m ? v - m : 0 };
}
/* an even-tempered basis scaled to the atom: the most diffuse exponents set by its ionization energy, the tightest
   by Z² (the recipe that gave Yater and our water, tools/molecules.mjs, written as a rule) */
export function basisFor(Z, d) {
  if (Z === 1) return d === 3 ? [[0, ET(0.05, 3, 5)], [1, [0.8]]] : [[0, ET(0.04, 3, 5)], [1, [0.6]]];
  const I = TABLE[d][Z - 1].ion, k = d === 3 ? { s: 0.26, S: 280, p: 0.33, P: 0.57, dd: 2.6 } : { s: 0.1, S: 75, p: 0.12, P: 0.15, dd: 1.25 };
  const count = (lo, hi) => Math.max(3, Math.ceil(Math.log(hi / lo) / Math.log(2.5)) + 1);
  return [[0, ET(k.s * I, 2.5, count(k.s * I, k.S * Z * Z))], [1, ET(k.p * I, 2.5, count(k.p * I, k.P * Z * Z))], [2, [k.dd * I]]];
}

const unit = (d, k) => Array.from({ length: d }, (_, q) => (q === k ? 1 : 0));
const dotv = (a, b) => a.reduce((s, x, k) => s + x * b[k], 0);
/* the bond directions of a hydride with b bonds: param is θ (two bonds) or α (a pyramid), unused otherwise */
export function shapeOf(b, d) { return b === 1 || b === d + 1 ? "fixed" : b === 2 ? "bent" : "pyramid"; }
export function directions(b, d, param) {
  const e = (k) => unit(d, k);
  if (b === 1) return [e(0)];
  if (b === d + 1) return simplex(d).map((v) => v.slice(0, d));
  if (b === 2) { const t = (param * Math.PI) / 360; return [1, -1].map((s) => e(0).map((x, k) => Math.cos(t) * x + s * Math.sin(t) * e(1)[k])); }
  const a = (param * Math.PI) / 180; // b hydrogens at the corners of a (b − 1)-simplex across the axis, tilted α from it
  return simplex(b - 1).map((s) => e(0).map((x, k) => Math.cos(a) * x + (k >= 1 && k <= b - 1 ? Math.sin(a) * s[k - 1] : 0)));
}
export function hydrideAtoms(Z, d, R, param) {
  const { bonds } = valence(Z, d);
  return [{ Z, at: new Array(d).fill(0) }, ...directions(bonds, d, param).map((u) => ({ Z: 1, at: u.map((x) => x * R) }))];
}
const shellsOf = (atoms, d) => atoms.flatMap((a, i) => G.shellsFor(a, basisFor(a.Z, d)).map((s) => ({ ...s, atom: i })));
export function hydride(atoms, d, extra = {}) {
  const shells = shellsOf(atoms, d), one = G.oneElectron(shells, atoms, d), ERI = G.twoElectron(shells, d, one.F), n = atoms.reduce((s, a) => s + a.Z, 0) / 2;
  const r = G.hartreeFock(atoms, shells, d, { nAlpha: n, nBeta: n, ints: { one, ERI }, ...extra });
  // Mulliken: each atom's share of the electrons, Σ over its functions of (PS)_μμ
  const N = one.n, pop = new Float64Array(atoms.length);
  for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += (r.Pa[i * N + j] + r.Pb[i * N + j]) * one.S[j * N + i]; pop[shells[one.F[i].shell].atom] += s; }
  return { ...r, charges: atoms.map((a, i) => a.Z - pop[i]), nOcc: n };
}

/* a one-parameter minimum by parabolas through three points, the step held to two spacings, shrinking after a free step */
export function minimize1(f, x, h, passes = 3, shrink = 3, maxPass = 30) {
  for (let pass = 0, done = 0; done < passes && pass < maxPass; pass++) {
    const a = f(x - h), b = f(x), c = f(x + h), curv = a - 2 * b + c, u = curv > 0 ? (a - c) / (2 * curv) : (a < c ? -1 : 1) * 2, dx = Math.max(-2, Math.min(2, u));
    x += dx * h; if (curv > 0 && dx === u) { h /= shrink; done++; }
  }
  return x;
}
/* the first guess at a bond: the heavy atom's outer orbital's mean radius (js/table.js) plus hydrogen's share */
const START = { 3: { H: 0.55, bent: 105, pyr: 75 }, 4: { H: 1.4, bent: 120, pyr: 80 } };
const startR = (Z, d) => { const o = TABLE[d][Z - 1].orb; return o[o.length - 1].r + START[d].H; };
const round = (v, k) => +v.toFixed(k);
/* a seeded generator for the nudges (mulberry32) */
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function hydrideJob(Z, d) {
  const val = valence(Z, d), shape = shapeOf(val.bonds, d), R0 = startR(Z, d);
  const E = (R, p) => hydride(hydrideAtoms(Z, d, R, p), d).E;
  let R, param = null;
  if (shape === "fixed") R = minimize1((x) => E(x, null), R0, 0.08, 4);
  else { const p0 = shape === "bent" ? START[d].bent : START[d].pyr, m = minimize2(E, R0, p0, 0.08, 4, 4, 3, 30); R = m.x; param = m.y; }
  const atoms = hydrideAtoms(Z, d, R, param), r = hydride(atoms, d);
  // nudge every hydrogen at random: a minimum rises every time (to within the minimizer's leftover slope)
  const rand = rng(Z * 31 + d), nudges = [];
  for (let k = 0; k < 3; k++) { const moved = atoms.map((a, i) => (i ? { ...a, at: a.at.map((x) => x + 0.08 * (2 * rand() - 1)) } : a)); nudges.push(hydride(moved, d).E - r.E); }
  const hq = r.charges.slice(1);
  return { Z, d, ...val, shape, R: round(R, 4), param: param == null ? null : round(param, 2), E: round(r.E, 6), dipole: round(Math.hypot(...r.dipole), 4),
    qH: round(hq.reduce((s, q) => s + q, 0) / hq.length, 3), homo: round(r.epsA[r.nOcc - 1], 4), lumo: round(r.epsA[r.nOcc], 4),
    minimum: nudges.every((x) => x > -1e-5), nudges: nudges.map((x) => +x.toExponential(2)), ok: r.converged };
}

/* two hydrides hydrogen-bonded. The donor's first hydrogen points along +x₁ (a reflection takes it there); the
   acceptor's X sits at (R, 0, …) with the axis its lone pairs face away from turned to (cos β, sin β) in the x₁x₂
   plane (its x₂ direction to x₃, its x₃ to the plane's other direction, x₄ kept) */
export function dimerAtoms(mono, d, R, betad) {
  const A = hydrideAtoms(mono.Z, d, mono.R, mono.param), h = A[1].at.map((x) => x / mono.R), e0 = unit(d, 0);
  const w = h.map((x, k) => x - e0[k]), ww = dotv(w, w), refl = (p) => (ww < 1e-12 ? p : p.map((x, k) => x - (2 * dotv(w, p) / ww) * w[k]));
  const b = (betad * Math.PI) / 180, u = [Math.cos(b), Math.sin(b), ...new Array(d - 2).fill(0)], uPerp = [-Math.sin(b), Math.cos(b), ...new Array(d - 2).fill(0)];
  const turn = (p) => { const out = u.map((x) => x * p[0]); for (let k = 0; k < d; k++) out[k] += p[1] * unit(d, 2)[k] + p[2] * uPerp[k] + (d > 3 ? p[3] * unit(d, 3)[k] : 0); return out; };
  return [A.map((a) => ({ ...a, at: refl(a.at) })), A.map((a) => ({ ...a, at: turn(a.at).map((x, k) => x + (k === 0 ? R : 0)) }))];
}
export function interaction(mono, d, R, betad) {
  const [A, B] = dimerAtoms(mono, d, R, betad), all = [...A, ...B], shells = shellsOf(all, d), n = A.reduce((s, a) => s + a.Z, 0) / 2;
  const one = G.oneElectron(shells, all, d), ERI = G.twoElectron(shells, d, one.F);
  const eAB = G.hartreeFock(all, shells, d, { nAlpha: 2 * n, nBeta: 2 * n, ints: { one, ERI } });
  const eA = G.hartreeFock(A, shells, d, { nAlpha: n, nBeta: n, ints: { one: G.oneElectron(shells, A, d), ERI } });
  const eB = G.hartreeFock(B, shells, d, { nAlpha: n, nBeta: n, ints: { one: G.oneElectron(shells, B, d), ERI } });
  return { E: eAB.E - eA.E - eB.E, ok: eAB.converged && eA.converged && eB.converged };
}
export function dimerJob(mono) {
  const d = mono.d, m = minimize2((R, b) => interaction(mono, d, R, b).E, mono.R + (d === 3 ? 3.9 : 3.8), -30, 0.3, 10, 3, 2.5, 30), fin = interaction(mono, d, m.x, m.y);
  return { RXX: round(m.x, 3), beta: round(m.y, 1), E: round(fin.E, 6), ok: fin.ok };
}
export const protic = (m) => m.qH > 0 && m.lp > 0;
/* basis functions in a pair: past PAIR_MAX the unique integrals outgrow memory (three pairs at once), and the pair waits */
export const PAIR_MAX = 190;
export const pairSize = (m) => 2 * G.functionsOf(shellsOf(hydrideAtoms(m.Z, m.d, m.R, m.param), m.d), m.d).length;

/* run each job as its own process, four at a time */
function run(args) {
  return new Promise((ok, fail) => {
    const p = spawn(process.execPath, ["--max-old-space-size=8000", fileURLToPath(import.meta.url), ...args]); let out = "";
    p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => process.stderr.write(b));
    p.on("close", (c) => (c ? fail(new Error(args.join(" ") + " exited " + c)) : ok(JSON.parse(out.trim().split("\n").pop()))));
  });
}
async function pool(tasks, k = 4) { const out = new Array(tasks.length); let next = 0; await Promise.all(Array.from({ length: k }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } })); return out; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv[0] === "hydride") console.log(JSON.stringify(hydrideJob(+argv[1], +argv[2])));
  else if (argv[0] === "dimer") console.log(JSON.stringify(dimerJob(JSON.parse(argv[1]))));
  else {
    const t0 = Date.now(), log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`);
    const jobs = [3, 4].flatMap((d) => MEMBERS[d].map((Z) => ({ Z, d })));
    // the lighter molecules first; each protic one's pair starts as soon as its molecule is done
    const mols = await pool(jobs.map(({ Z, d }) => () => run(["hydride", Z, d]).then((m) => { log(`${d}D ${Z}: R ${m.R} ${m.shape} ${m.param ?? ""} qH ${m.qH} dipole ${m.dipole}${m.minimum ? "" : " NOT A MINIMUM"}`); return m; })));
    for (const m of mols.filter(protic)) if (pairSize(m) > PAIR_MAX) m.dimer = { skipped: pairSize(m) };
    const pairs = await pool(mols.filter((m) => protic(m) && !m.dimer).map((m) => () => run(["dimer", JSON.stringify(m)]).then((x) => { log(`${m.d}D ${m.Z} pair: R ${x.RXX} β ${x.beta} E ${x.E}`); m.dimer = x; return x; })), 3);
    const CENSUS = { 3: mols.filter((m) => m.d === 3), 4: mols.filter((m) => m.d === 4) };
    writeFileSync(new URL("../js/census.js", import.meta.url), `/* Generated by tools/census.mjs from js/gauss.js (Hartree–Fock, the same recipe for every atom); do not edit.
   Atomic units. Per hydride: Z, valence electrons v, bonds, lone pairs lp, the shape (fixed, bent at param = θ, or a
   pyramid tilted param = α from its axis), bond length R, energy E, dipole, the mean Mulliken charge on hydrogen qH,
   the top and next orbitals, whether random nudges all raised the energy (minimum), and for protic ones (qH > 0
   and lone pairs) the hydrogen-bonded pair: heavy atoms RXX apart, the acceptor tilted beta, bound by −E. */
export const CENSUS = ${JSON.stringify(CENSUS)};
`);
    log(`wrote js/census.js (${pairs.length} pairs)`);
  }
}
