/* Bakes js/molecules.js: Pxygen (element 10, two short of 4D's second noble gas) and Yater (H₂Px), with our oxygen
   and water computed the same way beside them as the check.
     node games/atom4/tools/molecules.mjs        # writes js/molecules.js (about half an hour; jobs run in parallel)

   Hartree–Fock on even-tempered Gaussians (js/gauss.js), the same recipe in both worlds, scaled to each world's
   atoms. Two basis sizes per world; the difference is the basis's share of the error. For each world:
     the heavy atom: its Hund ground state (unrestricted) and its closed-shell state
     the molecule: bond length and angle (minimized), dipole moment, energy to pull it apart into atoms, the cost of
       straightening it
     two molecules hydrogen-bonded (small basis, monomers held at their shape): the distance between heavy atoms, the
       acceptor's tilt, and the bond's energy, corrected for the basis's borrowing (counterpoise)
   Validation (closed forms and independent numbers) runs in the selftest. */
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "../js/gauss.js";

const ET = G.evenTempered;
/* the heavy atom of each world: our oxygen (Z = 8, 1s² 2s² 2p⁴) and Pxygen (Z = 10, 1s² 2s² 2p⁶ of 8) */
export const HEAVY = { 3: { Z: 8, closed: 5, alpha: 5, beta: 3 }, 4: { Z: 10, closed: 6, alpha: 6, beta: 4 } };
/* [l, exponents] per shell kind; 4D's atoms are bigger (hydrogen's Bohr radius is 1.5 times ours), so its exponents
   sit lower. big adds f on the heavy atom and d on hydrogen; past it, the 4D angle moved by under a degree */
export const BASIS = {
  3: { small: { X: [[0, ET(0.12, 2.5, 14)], [1, ET(0.15, 2.5, 7)], [2, [1.2]]], H: [[0, ET(0.05, 3, 5)], [1, [0.8]]] },
       big: { X: [[0, ET(0.08, 2.0, 18)], [1, ET(0.1, 2.0, 10)], [2, [3.0, 1.0, 0.33]], [3, [1.2]]], H: [[0, ET(0.05, 3, 6)], [1, [2.0, 0.7, 0.25]], [2, [1.0]]] } },
  4: { small: { X: [[0, ET(0.05, 2.5, 14)], [1, ET(0.06, 2.5, 7)], [2, [0.6]]], H: [[0, ET(0.04, 3, 5)], [1, [0.6]]] },
       big: { X: [[0, ET(0.03, 2.0, 18)], [1, ET(0.04, 2.0, 10)], [2, [2.4, 0.8, 0.27]], [3, [0.8]]], H: [[0, ET(0.04, 3, 6)], [1, [1.6, 0.6, 0.22]], [2, [0.8]]] } },
};
const unit = (d, k) => Array.from({ length: d }, (_, q) => (q === k ? 1 : 0));
const add = (a, b, s = 1) => a.map((x, k) => x + s * b[k]);
const shellsOf = (atoms, B) => atoms.flatMap((a) => G.shellsFor(a, a.Z === 1 ? B.H : B.X));

/* H₂X in the x₁x₂ plane, X at the origin, the bisector along x₁ */
export function monomerAtoms(d, R, thd) {
  const th = (thd * Math.PI) / 180, X = { Z: HEAVY[d].Z, at: new Array(d).fill(0) };
  const h = (s) => ({ Z: 1, at: add(unit(d, 0).map((x) => x * R * Math.cos(th / 2)), unit(d, 1), s * R * Math.sin(th / 2)) });
  return [X, h(1), h(-1)];
}
export function monomer(d, R, thd, size = "small") {
  const atoms = monomerAtoms(d, R, thd);
  return G.hartreeFock(atoms, shellsOf(atoms, BASIS[d][size]), d, { nAlpha: HEAVY[d].closed, nBeta: HEAVY[d].closed });
}
export function atoms(d, size = "small") {
  const B = BASIS[d][size], o = new Array(d).fill(0), X = { Z: HEAVY[d].Z, at: o }, H = { Z: 1, at: o }, hv = HEAVY[d];
  const hund = G.hartreeFock([X], G.shellsFor(X, B.X), d, { nAlpha: hv.alpha, nBeta: hv.beta });
  const closed = G.hartreeFock([X], G.shellsFor(X, B.X), d, { nAlpha: hv.closed - 1, nBeta: hv.closed - 1 });
  const h = G.hartreeFock([H], G.shellsFor(H, B.H), d, { nAlpha: 1, nBeta: 0 });
  return { hund: hund.E, closed: closed.E, H: h.E, ok: hund.converged && closed.converged && h.converged };
}

/* two molecules: the donor in the x₁x₂ plane with one H along +x₁; the acceptor's X at (R, 0, …), its bisector at
   angle β in the x₁x₂ plane, its H–H along x₃ */
export function dimerAtoms(d, r, thd, R, betad) {
  const th = (thd * Math.PI) / 180, b = (betad * Math.PI) / 180, Z = HEAVY[d].Z, e = (k) => unit(d, k);
  const O1 = new Array(d).fill(0), O2 = add(O1, e(0), R), bis = add(e(0).map((x) => x * Math.cos(b)), e(1), Math.sin(b));
  const H3 = (s) => add(add(O2, bis, r * Math.cos(th / 2)), e(2), s * r * Math.sin(th / 2));
  return [[{ Z, at: O1 }, { Z: 1, at: add(O1, e(0), r) }, { Z: 1, at: add(add(O1, e(0), r * Math.cos(th)), e(1), r * Math.sin(th)) }], [{ Z, at: O2 }, { Z: 1, at: H3(1) }, { Z: 1, at: H3(-1) }]];
}
/* the interaction, counterpoise-corrected: each molecule's energy in the pair's whole basis is what the pair is measured against */
export function interaction(d, r, thd, R, betad, size = "small") {
  const [A, B] = dimerAtoms(d, r, thd, R, betad), shells = shellsOf([...A, ...B], BASIS[d][size]), n = HEAVY[d].closed;
  const one = G.oneElectron(shells, [...A, ...B], d), ERI = G.twoElectron(shells, d, one.F);
  const eAB = G.hartreeFock([...A, ...B], shells, d, { nAlpha: 2 * n, nBeta: 2 * n, ints: { one, ERI } });
  const eA = G.hartreeFock(A, shells, d, { nAlpha: n, nBeta: n, ints: { one: G.oneElectron(shells, A, d), ERI } });
  const eB = G.hartreeFock(B, shells, d, { nAlpha: n, nBeta: n, ints: { one: G.oneElectron(shells, B, d), ERI } });
  return { E: eAB.E - eA.E - eB.E, ok: eAB.converged && eA.converged && eB.converged };
}

/* minimum of f(x, y) by quadratic fits on 3×3 grids, each centred on the last fit's minimum. A step is held to two
   grid spacings; the spacing shrinks only after a step that didn't need holding, until it has shrunk `passes` times */
export function minimize2(f, x, y, hx, hy, passes = 3, shrink = 3) {
  let curv = null;
  for (let pass = 0, done = 0; done < passes && pass < 12; pass++) {
    const rows = [], ys = [];
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) { rows.push([1, i, j, i * i, j * j, i * j]); ys.push(f(x + i * hx, y + j * hy)); }
    const M = Array.from({ length: 6 }, (_, a) => [...Array.from({ length: 6 }, (_, b) => rows.reduce((s, r) => s + r[a] * r[b], 0)), rows.reduce((s, r, k) => s + r[a] * ys[k], 0)]);
    for (let c = 0; c < 6; c++) { let p = c; for (let q = c + 1; q < 6; q++) if (Math.abs(M[q][c]) > Math.abs(M[p][c])) p = q; [M[p], M[c]] = [M[c], M[p]]; for (let q = c + 1; q < 6; q++) { const g = M[q][c] / M[c][c]; for (let k = c; k <= 6; k++) M[q][k] -= g * M[c][k]; } }
    const k = new Array(6); for (let q = 5; q >= 0; q--) { let s = M[q][6]; for (let m = q + 1; m < 6; m++) s -= M[q][m] * k[m]; k[q] = s / M[q][q]; }
    const [, b, c, e, g, h] = k, det = 4 * e * g - h * h, ux = (-2 * g * b + h * c) / det, uy = (-2 * e * c + h * b) / det;
    const pd = det > 0 && e > 0, dx = pd ? Math.max(-2, Math.min(2, ux)) : -Math.sign(b), dy = pd ? Math.max(-2, Math.min(2, uy)) : -Math.sign(c), held = !pd || dx !== ux || dy !== uy; // not a bowl: one spacing downhill
    curv = { xx: (2 * e) / hx ** 2, yy: (2 * g) / hy ** 2, xy: h / (hx * hy) };
    x += dx * hx; y += dy * hy;
    if (!held) { hx /= shrink; hy /= shrink; done++; }
  }
  return { x, y, curv };
}

/* ---------------------------------------------------------------- the jobs */
const START = { 3: { R: 1.78, th: 105, RXX: 5.7, beta: -57 }, 4: { R: 2.8, th: 120, RXX: 8.0, beta: -62 } };
const round = (v, k) => +v.toFixed(k);
export function moleculeJob(d, size) {
  const s = START[d], m = minimize2((R, th) => monomer(d, R, th, size).E, s.R, s.th, 0.06, 3);
  const r = monomer(d, m.x, m.y, size), lin = monomer(d, m.x, 180, size), at = atoms(d, size);
  return { d, size, R: round(m.x, 4), theta: round(m.y, 2), E: round(r.E, 6), dipole: round(Math.hypot(...r.dipole), 4), linear: round(lin.E - r.E, 5),
    De: round(at.hund + 2 * at.H - r.E, 5), atom: { hund: round(at.hund, 6), closed: round(at.closed, 6), H: round(at.H, 6) },
    homo: round(r.epsA[HEAVY[d].closed - 1], 4), homo2: round(r.epsA[HEAVY[d].closed - 2], 4), lumo: round(r.epsA[HEAVY[d].closed], 4), kRR: round(m.curv.xx, 4), kTT: round(m.curv.yy, 7), ok: r.converged && lin.converged && at.ok };
}
export function dimerJob(d, r, th) {
  const s = START[d], m = minimize2((R, b) => interaction(d, r, th, R, b).E, s.RXX, s.beta, 0.3, 10, 3, 2.5), fin = interaction(d, r, th, m.x, m.y);
  return { d, r, theta: th, RXX: round(m.x, 3), beta: round(m.y, 1), E: round(fin.E, 6), ok: fin.ok };
}

/* run each job as its own process, so the four cores share them */
function run(args) {
  return new Promise((ok, fail) => {
    const p = spawn(process.execPath, ["--max-old-space-size=8000", fileURLToPath(import.meta.url), ...args]); let out = "";
    p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => process.stderr.write(b));
    p.on("close", (c) => (c ? fail(new Error(args.join(" ") + " exited " + c)) : ok(JSON.parse(out.trim().split("\n").pop()))));
  });
}
const argv = process.argv.slice(2);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (argv[0] === "molecule") console.log(JSON.stringify(moleculeJob(+argv[1], argv[2])));
  else if (argv[0] === "dimer") console.log(JSON.stringify(dimerJob(+argv[1], +argv[2], +argv[3])));
  else {
    const t0 = Date.now(), log = (s) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${s}`);
    const mols = {};
    // the small-basis molecules first (the dimers need their shapes), alongside the big ones
    const big = Promise.all([3, 4].map((d) => run(["molecule", d, "big"]).then((m) => { log(`${d}D big: R ${m.R} θ ${m.theta}`); return m; })));
    const dims = Promise.all([3, 4].map((d) => run(["molecule", d, "small"]).then((m) => { log(`${d}D small: R ${m.R} θ ${m.theta}`); mols[d] = m; return run(["dimer", d, m.R, m.theta]); }).then((x) => { log(`${d}D dimer: R ${x.RXX} β ${x.beta} E ${x.E}`); return x; })));
    const [bigs, dimers] = await Promise.all([big, dims]);
    const MOLECULES = { 3: { small: mols[3], big: bigs[0], dimer: dimers[0] }, 4: { small: mols[4], big: bigs[1], dimer: dimers[1] } };
    const src = `/* Generated by tools/molecules.mjs from js/gauss.js (Hartree–Fock, even-tempered Gaussians); do not edit.
   Atomic units. Per world (3: our oxygen and water, 4: Pxygen and Yater) and basis size: the molecule's bond length R
   and angle theta (degrees), energy E, dipole, the cost of straightening it (linear), the energy to pull it into atoms
   (De, from the heavy atom's Hund state), the atoms' energies, the top orbitals, and the curvatures kRR (both bonds
   stretched together) and kTT (per degree²). dimer: the hydrogen-bonded pair at the small basis, heavy atoms RXX
   apart, the acceptor tilted by beta, bound by -E (counterpoise-corrected). */
export const MOLECULES = ${JSON.stringify(MOLECULES)};
`;
    writeFileSync(new URL("../js/molecules.js", import.meta.url), src);
    log("wrote js/molecules.js");
  }
}
