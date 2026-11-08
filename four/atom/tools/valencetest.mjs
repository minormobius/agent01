/* Paper 1's direct test of the valence rule on one hydride (darbon's, element 7 of 4D: the census counts five bonds,
   DH₅ in the 5-cell's shape). The census settles the hydrogen count by counting, takes the closed-shell Hartree–Fock
   energy, minimizes size and shape, and checks the minimum with three random nudges. Here, instead:
     node four/atom/tools/valencetest.mjs reactions <Z>        balanced alternatives: XHₙ against XHₙ₋₁ + H and
                                                              XHₙ₋₂ + H₂, each fragment in its own lowest spin state (both
                                                              spins tried where it has a choice), geometries by Hartree–Fock
                                                              in the census's symmetric shapes, energies by UHF and UMP2
     node four/atom/tools/valencetest.mjs hessian <Z> <i>/<m>  share i of m of the full Cartesian curvature matrix of XHₙ at
                                                              the census's geometry, by central differences of the energy
                                                              (step 0.01 bohr): every direction in four dimensions
     node four/atom/tools/valencetest.mjs assemble <files…>    the matrix, its gradient, and its eigenvalues with the
                                                              d(d + 1)/2 translations and rotations set apart
   One JSON line per result. */
import { readFileSync } from "node:fs";
import * as G from "../js/gauss.js";
import { hydride, hydrideAtoms, basisFor, directions, valence, minimize1 } from "./census.mjs";
import { minimize2 } from "./molecules.mjs";
import { CENSUS } from "../js/census.js";

const D = 4, HA = 27.211386245988, [mode, zS, part, ...rest] = process.argv.slice(2), Z = +zS, STEP = 0.01;
const shellsOf = (atoms, plus = "") => atoms.flatMap((a, i) => G.shellsFor(a, basisFor(a.Z, D, plus)).map((s) => ({ ...s, atom: i })));
/* UHF and UMP2 for any set of atoms and spin (2S), cores frozen */
function energy(atoms, twoS, guess) {
  const sh = shellsOf(atoms), one = G.oneElectron(sh, atoms, D), ERI = G.twoElectron(sh, D, one.F), n = atoms.reduce((s, a) => s + a.Z, 0);
  const r = G.hartreeFock(atoms, sh, D, { nAlpha: (n + twoS) / 2, nBeta: (n - twoS) / 2, ints: { one, ERI }, guess }), fz = atoms.filter((a) => a.Z > 2).length;
  return { hf: r.E, mp2: n > 1 ? r.E + G.ump2(r, ERI, { frozen: fz }).E2 : r.E, converged: r.converged };
}
const atomsFor = (b, R, p) => [{ Z, at: Array(D).fill(0) }, ...directions(b, D, p).map((u) => ({ Z: 1, at: u.map((x) => x * R) }))];
const shape = (b) => (b === 1 || b === D + 1 ? "fixed" : b === 2 ? "bent" : "pyramid");
/* a fragment XH_b in spin 2S: size (and angle) minimized by UHF in the census's symmetric shape */
function fragment(b, twoS) {
  const E = (R, p) => energy(atomsFor(b, R, p), twoS).hf, R0 = CENSUS[D].find((x) => x.Z === Z)?.R ?? 2.6;
  if (b === 0) return { b, twoS, R: null, param: null, ...energy([{ Z, at: Array(D).fill(0) }], twoS) };
  if (shape(b) === "fixed") { const R = minimize1((x) => E(x, null), R0, 0.08, 4); return { b, twoS, R, param: null, ...energy(atomsFor(b, R, null), twoS) }; }
  const m = minimize2(E, R0, shape(b) === "bent" ? 110 : 80, 0.08, 4, 4, 3, 30); return { b, twoS, R: m.x, param: m.y, ...energy(atomsFor(b, m.x, m.y), twoS) };
}

if (mode === "reactions") {
  const n = valence(Z, D).bonds, H = energy([{ Z: 1, at: Array(D).fill(0) }], 1);
  const Rh = minimize1((x) => energy([{ Z: 1, at: Array(D).fill(0) }, { Z: 1, at: [x, 0, 0, 0] }], 0).hf, 1.4, 0.05, 4), H2 = energy([{ Z: 1, at: Array(D).fill(0) }, { Z: 1, at: [Rh, 0, 0, 0] }], 0);
  const best = (b) => { const p = (Z + b) % 2, out = []; for (const s of b === n ? [p] : [p, p + 2]) out.push(fragment(b, s)); return out.sort((x, y) => x.mp2 - y.mp2); };
  const F = { [n]: best(n), [n - 1]: best(n - 1), [n - 2]: best(n - 2) }, ev = (x) => +(x * HA).toFixed(3), top = (b) => F[b][0];
  console.log(JSON.stringify({ Z, D, n, H2: { R: +Rh.toFixed(4), hf: H2.hf, mp2: H2.mp2 },
    fragments: Object.values(F).flat().map((f) => ({ formula: `XH${f.b}`, twoS: f.twoS, R: f.R && +f.R.toFixed(4), param: f.param && +f.param.toFixed(2), hf: +f.hf.toFixed(6), mp2: +f.mp2.toFixed(6), converged: f.converged })),
    // positive: XHₙ is the lower; each fragment in its lowest spin by UMP2
    toXHn1_H: { hf: ev(top(n - 1).hf + H.hf - top(n).hf), mp2: ev(top(n - 1).mp2 + H.mp2 - top(n).mp2), spinXHn1: top(n - 1).twoS },
    toXHn2_H2: { hf: ev(top(n - 2).hf + H2.hf - top(n).hf), mp2: ev(top(n - 2).mp2 + H2.mp2 - top(n).mp2), spinXHn2: top(n - 2).twoS },
    spinGap_XHn2_eV: F[n - 2].length > 1 ? { hf: ev(F[n - 2].find((f) => f.twoS !== top(n - 2).twoS).hf - top(n - 2).hf), mp2: ev(F[n - 2][1].mp2 - F[n - 2][0].mp2) } : null }));
}

if (mode === "hessian") {
  const m = CENSUS[D].find((x) => x.Z === Z), base = hydrideAtoms(Z, D, m.R, m.param), N = base.length * D, [i0, mm] = part.split("/").map(Number);
  const E = (moves) => hydride(base.map((a, k) => ({ ...a, at: a.at.map((x, c) => x + (moves.get(k * D + c) ?? 0)) })), D).E;
  const E0 = E(new Map());
  for (let i = 0; i < N; i++) { if (i % mm !== i0) continue;
    const ep = E(new Map([[i, STEP]])), em = E(new Map([[i, -STEP]]));
    console.log(JSON.stringify({ Z, i, j: i, E0, g: (ep - em) / (2 * STEP), h: (ep - 2 * E0 + em) / STEP ** 2 }));
    for (let j = i + 1; j < N; j++) {
      const pp = E(new Map([[i, STEP], [j, STEP]])), pm = E(new Map([[i, STEP], [j, -STEP]])), mp = E(new Map([[i, -STEP], [j, STEP]])), mq = E(new Map([[i, -STEP], [j, -STEP]]));
      console.log(JSON.stringify({ Z, i, j, h: (pp - pm - mp + mq) / (4 * STEP * STEP) }));
    } }
}

if (mode === "assemble") {
  const lines = [zS, part, ...rest].filter(Boolean).flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)));
  const Zs = lines[0].Z, m = CENSUS[D].find((x) => x.Z === Zs), atoms = hydrideAtoms(Zs, D, m.R, m.param), N = atoms.length * D, Hm = Array.from({ length: N }, () => new Float64Array(N)), g = new Float64Array(N);
  for (const l of lines) { Hm[l.i][l.j] = Hm[l.j][l.i] = l.h; if (l.g != null) g[l.i] = l.g; }
  const missing = []; for (let i = 0; i < N; i++) for (let j = i; j < N; j++) if (!lines.some((l) => l.i === i && l.j === j)) missing.push([i, j]);
  const e = G.jacobiEigen(Float64Array.from(Hm.flatMap((r) => [...r])), N).values, rigid = (D * (D + 1)) / 2, sorted = e.slice().sort((a, b) => Math.abs(a) - Math.abs(b));
  const zero = sorted.slice(0, rigid), vib = sorted.slice(rigid).sort((a, b) => a - b);
  console.log(JSON.stringify({ Z: Zs, D, atoms: atoms.length, coordinates: N, missing: missing.length, gradientMax: +Math.max(...g.map(Math.abs)).toExponential(2), rigidModes: zero.map((x) => +x.toExponential(2)),
    vibrational: vib.map((x) => +x.toFixed(5)), negative: vib.filter((x) => x < -1e-4).length, lowest: +vib[0].toFixed(5) }));
}
