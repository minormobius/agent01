/* Checks for js/pw.js and js/pseudo.js against the radial solver: a pseudo-atom alone in a periodic box.
     node four/atom/tools/pwcheck.mjs atom <d> <Z> <core> <valence> <rc> <L> <ecut> [local]
       e.g. atom 3 10 1s2 2s2,2p6 1.5 10 30 1      our neon
            atom 4 12 1s2 2s2,2p8 2.0 8 12 1       4D element 12
   prints the plane-wave total and levels, the radial pseudo-atom's, and the atom's second moment S (electrons and core):
   in 4D two neutral atoms still meet as −3S²/64r⁵ (the shell theorem fails), so the box's images add the lattice sum
   of that, which this prints too, to be taken off before extrapolating in L.
     node four/atom/tools/pwcheck.mjs crystal <structures.json> <name> <scale> <ecut> [k] [threads] [soft]   → $TMPDIR/atom4-pw/…json
       (threads: k-points shared out to that many workers, tools/pwpool.mjs)
       a crystalref-style structure (H rows, fractional s, kinds 0 cation 1 anion, primitive rows P), scaled; k a number
       per reciprocal vector, or aX / aXs (⌈X/|a_i|⌉, Γ-centred / shifted by half a step) */
import { makePseudo, forPW, solveAny } from "../js/pseudo.js";
import { PW, EXCHANGE, SPHERE } from "../js/pw.js";
import { kernel, hartree, R, N, H } from "../js/atom.js";
import { kgrid } from "../js/pw.js";
import { makePool, speciesFrom } from "./pwpool.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
/* the pseudopotentials the crystal checks use (rc in bohr): our Al and O; 4D's bluminium (element 15, core 1s²2s²2p⁸) and pxygen (10) */
const PSEUDO_ARGS = {
  Al2O3: { cat: { Z: 13, d: 3, core: { "1s": 2, "2s": 2, "2p": 6 }, valence: { "3s": 2, "3p": 1 }, rc: { 0: 2.1, 1: 2.3 }, local: 1 }, an: { Z: 8, d: 3, core: { "1s": 2 }, valence: { "2s": 2, "2p": 4 }, rc: { 0: 1.45, 1: 1.45 }, local: 1 } },
  Bl2Px3: { cat: { Z: 15, d: 4, core: { "1s": 2, "2s": 2, "2p": 8 }, valence: { "3s": 2, "3p": 1 }, rc: { 0: 2.2, 1: 2.4 }, local: 1 }, an: { Z: 10, d: 4, core: { "1s": 2 }, valence: { "2s": 2, "2p": 6 }, rc: { 0: 1.6, 1: 1.6 }, local: 1 } },
  // softer: wider cores, cheaper plane waves; whether rankings survive the softening is what the convergence runs ask
  "Bl2Px3-soft": { cat: { Z: 15, d: 4, core: { "1s": 2, "2s": 2, "2p": 8 }, valence: { "3s": 2, "3p": 1 }, rc: { 0: 2.6, 1: 2.8 }, local: 1 }, an: { Z: 10, d: 4, core: { "1s": 2 }, valence: { "2s": 2, "2p": 6 }, rc: { 0: 1.9, 1: 1.9 }, local: 1 } },
  "Al2O3-soft": { cat: { Z: 13, d: 3, core: { "1s": 2, "2s": 2, "2p": 6 }, valence: { "3s": 2, "3p": 1 }, rc: { 0: 2.5, 1: 2.7 }, local: 1 }, an: { Z: 8, d: 3, core: { "1s": 2 }, valence: { "2s": 2, "2p": 4 }, rc: { 0: 1.75, 1: 1.75 }, local: 1 } },
};
function invM(M) { const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; const v = A[c][c]; A[c] = A[c].map((x) => x / v); for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; A[r] = A[r].map((x, k) => x - f * A[c][k]); } } return A.map((r) => r.slice(n)); }

const spec = (s) => Object.fromEntries(s.split(",").map((t) => { const m = t.match(/^(\d[spdf])(\d+)$/); return [m[1], +m[2]]; }));
const [cmd, ...a] = process.argv.slice(2);
if (cmd === "atom") {
  const [dS, ZS, coreS, valS, rcS, LS, ecS, locS = "1"] = a, d = +dS, Z = +ZS, core = spec(coreS), val = spec(valS), rc = +rcS, L = +LS, ecut = +ecS, local = +locS;
  const ps = makePseudo({ Z, d, core, valence: val, rc: { 0: rc, 1: rc, 2: rc }, local }), sh = ps.ae.sh;
  const occ = {}; for (const [n, o] of Object.entries(val)) occ[sh.find((s) => s.name === n).l] = o;
  // the radial pseudo-atom, semilocal, self-consistent: energy and the valence density's second moment
  const vx = (rho) => -(1 + 1 / d) * EXCHANGE[d] * Math.pow(Math.max(rho, 0), 1 / d), K = kernel(d); let Q = new Float64Array(N), st = {};
  for (let it = 0; it < 300; it++) { const VH = hartree(K, Q), rho = Float64Array.from(Q, (q, j) => q / (H * R[j] * SPHERE[d] * R[j] ** (d - 1))), Qn = new Float64Array(N);
    for (const [l, o] of Object.entries(occ)) { const V = Float64Array.from(ps.chans[l].Vion, (v, j) => v + VH[j] + vx(rho[j])), s = solveAny(V, +l, 0, d); st[l] = { ...s, V }; for (let j = 0; j < N; j++) Qn[j] += o * s.u[j] ** 2 * R[j] * H; }
    Q = Float64Array.from(Q, (q, j) => 0.6 * q + 0.4 * Qn[j]); }
  const VH = hartree(K, Q), rho = Float64Array.from(Q, (q, j) => q / (H * R[j] * SPHERE[d] * R[j] ** (d - 1))); let Erad = 0, EH = 0, Ex = 0, Vxr = 0, Sv = 0;
  for (const [l, o] of Object.entries(occ)) Erad += o * st[l].e;
  for (let j = 0; j < N; j++) { EH += 0.5 * Q[j] * VH[j]; Ex += Q[j] * -EXCHANGE[d] * Math.pow(Math.max(rho[j], 0), 1 / d); Vxr += Q[j] * vx(rho[j]); Sv += Q[j] * R[j] * R[j]; }
  Erad += -EH + Ex - Vxr;
  const Stot = Sv + ps.S; // the neutral atom's cloud: valence electrons and core electrons about the nucleus
  // the images' −3S²/64r⁵ over the hypercubic (or cubic) lattice of side L, direct to 30 L with the continuum past it
  let img = 0; if (d === 4) { const M = 30; for (let i = -M; i <= M; i++) for (let j = -M; j <= M; j++) for (let k = -M; k <= M; k++) for (let l = -M; l <= M; l++) { const r2 = i * i + j * j + k * k + l * l; if (!r2 || r2 > M * M) continue; img += 1 / (r2 * r2 * Math.sqrt(r2)); }
    img = 0.5 * (-3 * Stot * Stot / 64) * (img / L ** 5 + (SPHERE[4] / (M * L) / L ** 4)); }
  const t0 = Date.now(), Hc = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? L : 0)));
  const pw = new PW({ d, H: Hc, atoms: [{ x: new Array(d).fill(0), sp: "X" }], species: { X: forPW(ps, { qmax: Math.max(40, 3 * Math.sqrt(2 * ecut)) }) }, ecut, nelec: Object.values(val).reduce((t, v) => t + v, 0), nbands: Object.entries(occ).reduce((t, [l]) => t + (d === 3 ? 2 * l + 1 : (+l + 1) ** 2), 0) });
  const r = pw.scf({ log: (s) => process.stderr.write(s + "\n"), maxIter: 40, tol: 2e-6 });
  console.log(JSON.stringify({ d, Z, L, ecut, rc, grid: pw.dims, npw: pw.basis[0].n, E: r.E.total, eps: r.states[0].e, Erad, epsRad: Object.fromEntries(Object.entries(st).map(([l, s]) => [l, s.e])), Stot, image: img, parts: r.E, s: (Date.now() - t0) / 1000 }));
} else if (cmd === "crystal") {
  // a structure from a crystalref-style file (H rows, fractional s, kinds 0 cation 1 anion, primitive rows P), scaled
  // k: a number (n per reciprocal vector), or aX / aXs: n_i = ⌈X/|a_i|⌉, Γ-centred or shifted by half a step (folds in pairs)
  const [file, name, scS, ecS, kS = "1", thS, psS] = a, st = JSON.parse(readFileSync(file, "utf8"))[name], sc = +scS, ecut = +ecS, d = st.H.length, nk = kS;
  const pset = (d === 3 ? "Al2O3" : "Bl2Px3") + (psS ? `-${psS}` : ""), SA = PSEUDO_ARGS[pset], threads = +(thS || process.env.PW_THREADS || 1), H0 = st.H, P = st.P ?? H0.map((_, i) => H0.map((_, j) => +(i === j)));
  const Hp = P.map((row) => H0[0].map((_, c) => row.reduce((t, v, b) => t + v * H0[b][c], 0))), Hpi = invM(Hp), atoms = [];
  st.s.forEach((f, i) => { const x = H0[0].map((_, c) => f.reduce((t, v, b) => t + v * H0[b][c], 0)), g = x.map((_, j) => x.reduce((t, v, c) => t + v * Hpi[c][j], 0)).map((v) => v - Math.floor(v + 1e-9));
    if (!atoms.some((q) => q.k === st.kinds[i] && q.g.every((v, j) => Math.abs(((v - g[j] + 0.5) % 1 + 1) % 1 - 0.5) < 1e-4))) atoms.push({ k: st.kinds[i], g }); });
  const qmax = Math.max(40, 3 * Math.sqrt(2 * ecut)), pseudos = { c: { args: SA.cat, qmax }, a: { args: SA.an, qmax } }, H = Hp.map((r) => r.map((v) => v * sc)), species = speciesFrom(pseudos);
  const at = atoms.map((q) => ({ sp: q.k ? "a" : "c", x: H[0].map((_, c) => q.g.reduce((t, v, b) => t + v * H[b][c], 0)) })), nelec = at.reduce((t, q) => t + species[q.sp].Z, 0), nf = atoms.filter((q) => q.k === 0).length / 2;
  const km = String(nk).match(/^a([\d.]+)(s?)$/), ns = km ? H.map((h) => Math.max(1, Math.ceil(+km[1] / Math.hypot(...h)))) : H.map(() => +nk), shift = km && km[2] ? ns.map(() => 0.5) : null;
  const t0 = Date.now(), kpts = kgrid(H, ns, shift), nbands = nelec / 2 + 4, pool = threads > 1 && kpts.length > 1 ? makePool({ d, H, atoms: at, ecut, nelec, nbands, kpts, pseudos }, threads) : null;
  const pw = new PW({ d, H, atoms: at, species, ecut, nelec, nbands, kpts: pool ? [kpts[0]] : kpts });
  process.stderr.write(`${name} ×${sc}: ${at.length} atoms, ${nelec} electrons, grid ${pw.dims.join("×")}, ${pw.basis[0].n} PW at the first of ${kpts.length} k${pool ? `, ${pool.nw} workers` : ""}\n`);
  const r = pw.scf({ log: (s) => process.stderr.write(s + "\n"), maxIter: 60, tol: 1e-5, pool, bandIters: +(process.env.PW_BANDITERS || 6) });
  pool?.close();
  const occ = nelec / 2, vb = Math.max(...pw.eigs.map((e) => e[occ - 1])), cb = Math.min(...pw.eigs.map((e) => e[occ]));
  const res = { file: path.basename(file), name, scale: sc, ecut, nk, ns, nkpts: kpts.length, threads, pset, atoms: at.length, nf, E: r.E.total, perFormula_eV: (r.E.total / nf) * 27.211386, gap_eV: (cb - vb) * 27.211386, parts: r.E, s: (Date.now() - t0) / 1000 };
  const dir = path.join(process.env.TMPDIR || os.tmpdir(), "atom4-pw"); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${path.basename(file, ".json")}-${name}-${sc.toFixed(3)}-e${ecut}-k${nk}${psS ? `-${psS}` : ""}.json`), JSON.stringify(res)); console.log(JSON.stringify(res));
} else console.error("usage: pwcheck.mjs atom <d> <Z> <core> <valence> <rc> <L> <ecut> [local] | crystal <file> <name> <scale> <ecut> [k]");
