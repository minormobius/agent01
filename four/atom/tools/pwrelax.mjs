/* Relaxing a crystal's ions in a fixed cell with js/pw.js: plane-wave SCF, Hellmann–Feynman forces, BFGS. For ranking
   Bl₂Px₃'s candidate cells after they are relaxed, rather than as the ionic model left them. The cell's shape and size stay fixed (no
   stress yet), so a volume is scanned by running this at several scales and fitting E(V) over the relaxed energies.
     node four/atom/tools/pwrelax.mjs <structures.json> <name> <scale> <ecut> <k> [threads] [soft] [fmax] [steps]
       k: as pwcheck's (a number, aX, aXs), or an explicit grid "2x2x1x2" / "2x2x1x2s" (the same grid for two cells
       whose axes nearly match, so that neither gets a sampling advantage)
       fmax: stop when every force is below this (Ha/bohr; default 1e-3, about 0.05 eV/Å); steps: at most this many
   Resumable, for the runner's deadline: after every step the state (positions, energy, gradient, the BFGS inverse
   Hessian) goes to $TMPDIR/atom4-pw/<tag>-relax.json and the converged density to <tag>-relax-rho.f64, which the next
   step (or the rerun) starts its SCF from. Each step prints a JSON line; the end writes <tag>-relaxed.json, a
   crystalref-style structure (scale 1, primitive rows) that pwcheck's crystal and bands read.
   BFGS in Cartesian coordinates, the mean force taken off (it is the cell's drift, zero in exact arithmetic), steps
   capped at 0.2 bohr an atom; a step that raises the energy is halved back and the Hessian reset. */
import { PW, kgrid } from "../js/pw.js";
import { makePool, speciesFrom } from "./pwpool.mjs";
import { PSEUDO_ARGS, invM } from "./pwcheck.mjs";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const HA = 27.211386;
const [file, name, scS, ecS, kS = "1", thS = "1", psS = "", fmaxS = "1e-3", stepsS = "60"] = process.argv.slice(2);
if (!name) { console.error("usage: pwrelax.mjs <structures.json> <name> <scale> <ecut> <k> [threads] [soft] [fmax] [steps]"); process.exit(1); }
const st = JSON.parse(readFileSync(file, "utf8"))[name], sc = +scS, ecut = +ecS, d = st.H.length, threads = +thS, fmaxTol = +fmaxS, maxSteps = +stepsS;
const pset = (d === 3 ? "Al2O3" : "Bl2Px3") + (psS ? `-${psS}` : ""), SA = PSEUDO_ARGS[pset], H0 = st.H, P = st.P ?? H0.map((_, i) => H0.map((_, j) => +(i === j)));
/* the primitive cell and its atoms, as pwcheck builds them */
const Hp = P.map((row) => H0[0].map((_, c) => row.reduce((t, v, b) => t + v * H0[b][c], 0))), Hpi = invM(Hp), atoms = [];
st.s.forEach((f, i) => { const x = H0[0].map((_, c) => f.reduce((t, v, b) => t + v * H0[b][c], 0)), g = x.map((_, j) => x.reduce((t, v, c) => t + v * Hpi[c][j], 0)).map((v) => v - Math.floor(v + 1e-9));
  if (!atoms.some((q) => q.k === st.kinds[i] && q.g.every((v, j) => Math.abs(((v - g[j] + 0.5) % 1 + 1) % 1 - 0.5) < 1e-4))) atoms.push({ k: st.kinds[i], g }); });
const qmax = Math.max(40, 3 * Math.sqrt(2 * ecut)), pseudos = { c: { args: SA.cat, qmax }, a: { args: SA.an, qmax } }, species = speciesFrom(pseudos), H = Hp.map((r) => r.map((v) => v * sc));
const sp = atoms.map((q) => (q.k ? "a" : "c")), na = atoms.length, nelec = sp.reduce((t, s) => t + species[s].Z, 0), nf = atoms.filter((q) => q.k === 0).length / 2;
const em = kS.match(/^(\d+(?:x\d+)+)(s?)$/), km = kS.match(/^a([\d.]+)(s?)$/);
const ns = em ? em[1].split("x").map(Number) : km ? H.map((h) => Math.max(1, Math.ceil(+km[1] / Math.hypot(...h)))) : H.map(() => +kS), shifted = em ? em[2] : km ? km[2] : "";
if (ns.length !== d) throw new Error(`k grid ${kS}: ${ns.length} numbers for ${d} dimensions`);
const kpts = kgrid(H, ns, shifted ? ns.map(() => 0.5) : null), nbands = nelec / 2 + 4;
const dir = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-pw"), tag = `${path.basename(file, ".json")}-${name}-${sc.toFixed(3)}-e${ecut}-k${kS}${psS ? `-${psS}` : ""}`;
const stFile = path.join(dir, `${tag}-relax.json`), rhoFile = path.join(dir, `${tag}-relax-rho.f64`), outFile = path.join(dir, `${tag}-relaxed.json`);
mkdirSync(dir, { recursive: true });

const n = na * d, dot = (a, b) => a.reduce((t, v, i) => t + v * b[i], 0), K0 = 0.3; // the starting Hessian, K0 Ha/bohr² on every coordinate
let S = existsSync(stFile) ? JSON.parse(readFileSync(stFile, "utf8")) : null;
if (!S) S = { x: atoms.flatMap((q) => H[0].map((_, c) => q.g.reduce((t, v, b) => t + v * H[b][c], 0))), Hinv: null, prev: null, steps: [], done: false };
if (S.done) { console.log(JSON.stringify({ stage: "relaxed", resumed: true, ...S.steps.at(-1) })); process.exit(0); }
const reset = () => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j) / K0));
if (!S.Hinv) S.Hinv = reset();
process.stderr.write(`${name} ×${sc}: ${na} atoms, ${nelec} electrons, k ${ns.join("×")}${shifted ? " shifted" : ""} (${kpts.length}), ${threads} workers, ${S.steps.length} steps done\n`);

const t0 = Date.now();
while (S.steps.length < maxSteps) {
  const at = sp.map((s, i) => ({ sp: s, x: S.x.slice(i * d, i * d + d) })), recipe = { d, H, atoms: at, ecut, nelec, nbands, kpts, pseudos };
  const pool = threads > 1 && kpts.length > 1 ? makePool(recipe, threads) : null, pw = new PW({ ...recipe, species, kpts: pool ? [kpts[0]] : kpts });
  let rho0 = null; if (existsSync(rhoFile)) { const b = readFileSync(rhoFile); rho0 = new Float64Array(b.buffer, b.byteOffset, b.byteLength / 8).slice(); }
  const ts = Date.now(), r = pw.scf({ log: (s) => process.stderr.write(s + "\n"), maxIter: 80, tol: 1e-6, pool, rho0, bandIters: +(process.env.PW_BANDITERS || 6) });
  const F = pw.forces(r.states, r.rho, pool ? pool.nonlocalForces() : null); pool?.close();
  writeFileSync(rhoFile, Buffer.from(r.rho.buffer, r.rho.byteOffset, r.rho.byteLength));
  const mean = Array.from({ length: d }, (_, c) => F.reduce((t, f) => t + f[c], 0) / na), g = F.flatMap((f) => Array.from(f, (v, c) => -(v - mean[c]))), E = r.E.total;
  const fmax = Math.max(...F.map((f) => Math.hypot(...Array.from(f, (v, c) => v - mean[c])))), drift = Math.hypot(...mean);
  const row = { stage: "step", name, scale: sc, i: S.steps.length, E, perFormula_eV: (E / nf) * HA, fmax, drift, s: (Date.now() - ts) / 1000 };
  if (S.prev && E > S.prev.E + 1e-6) { // the step went uphill: halve it back from the last accepted point, start the Hessian over
    S.x = S.prev.x.map((v, i) => v + 0.5 * (S.x[i] - v)); S.Hinv = reset(); S.steps.push({ ...row, rejected: true }); console.log(JSON.stringify({ ...row, rejected: true }));
    writeFileSync(stFile, JSON.stringify(S)); continue; }
  if (S.prev) { const s = S.x.map((v, i) => v - S.prev.x[i]), y = g.map((v, i) => v - S.prev.g[i]), sy = dot(s, y);
    if (sy > 1e-10) { const Hy = S.Hinv.map((rw) => dot(rw, y)), yHy = dot(y, Hy); // BFGS: H ← H + (sy + yHy) ss/sy² − (Hy s + s Hy)/sy
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S.Hinv[i][j] += ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy; }
    else S.Hinv = reset(); }
  let p = S.Hinv.map((rw) => -dot(rw, g)); const big = Math.max(...Array.from({ length: na }, (_, i) => Math.hypot(...p.slice(i * d, i * d + d))));
  if (big > 0.2) p = p.map((v) => (v * 0.2) / big);
  S.steps.push({ ...row, step: Math.min(big, 0.2) }); console.log(JSON.stringify({ ...row, step: +Math.min(big, 0.2).toFixed(4) }));
  if (fmax < fmaxTol) { S.done = true; writeFileSync(stFile, JSON.stringify(S));
    const frac = atoms.map((_, i) => { const x = S.x.slice(i * d, i * d + d), Hi = invM(H); return x.map((_, j) => x.reduce((t, v, c) => t + v * Hi[c][j], 0)).map((v) => +(v - Math.floor(v)).toFixed(8)); });
    const out = { [`${name}-relaxed`]: { H, s: frac, kinds: atoms.map((q) => q.k), from: { file: path.basename(file), name, scale: sc, ecut, k: kS, pset }, E, perFormula_eV: (E / nf) * HA, fmax, steps: S.steps.length } };
    writeFileSync(outFile, JSON.stringify(out)); console.log(JSON.stringify({ stage: "relaxed", name, scale: sc, E, perFormula_eV: (E / nf) * HA, fmax, steps: S.steps.length, firstPerFormula_eV: S.steps[0].perFormula_eV, s: (Date.now() - t0) / 1000 })); break; }
  S.prev = { x: S.x.slice(), g, E }; S.x = S.x.map((v, i) => v + p[i]); writeFileSync(stFile, JSON.stringify(S));
}
if (!S.done) console.log(JSON.stringify({ stage: "unfinished", name, scale: sc, steps: S.steps.length, last: S.steps.at(-1) }));
process.exit(0);
