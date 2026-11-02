/* Bakes js/table.js: every element's ground configuration, total and orbital energies, first ionization energy and
   radial density, in 3D (the check against our own table) and 4D. Slow (minutes), so it runs here, not in the page.
     node four/atom/tools/bake.mjs            # writes js/table.js; the selftest recomputes a sample of it */
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ground, scf, subshells, R, N, H, configString } from "../js/atom.js";
import { isNoble } from "../js/periodic.js";

/* the official solver: Hartree plus local exchange (each electron's own share out, spins by Hund's rule) */
export const SOLVER = { exchange: true };

// 4D to 78 as baked; ATOM4_ZMAX4=140 bakes further (the extended table, until it is committed with its js/table.js)
export const ZMAX = { 3: 36, 4: +(process.env.ATOM4_ZMAX4 || 78) };
const RPLOT = Float64Array.from({ length: 121 }, (_, i) => 0.02 * Math.pow(10, i / 40)); // 0.02 … 20 bohr

/* one element, everything the page shows */
export function element(Z, d) {
  const g = ground(Z, d, SOLVER), sh = subshells(d);
  const live = sh.map((s, i) => i).filter((i) => g.occ[i] > 0);
  // the first ionization energy: the ion's own ground state (it relaxes: ΔSCF, not Koopmans), taking the electron
  // from whichever of the three least-bound subshells leaves the ion lowest
  const cand = live.slice().sort((a, b) => g.es[b] - g.es[a]).slice(0, 3);
  let ion = Infinity, top = cand[0];
  if (Z === 1) ion = -g.E;
  else for (const i of cand) { const occ = g.occ.slice(); occ[i]--; const e = scf(Z, occ, d, { iters: 60, start: g.qs, ...SOLVER }).E - g.E; if (e < ion) { ion = e; top = i; } }
  const orb = live.map((i) => {
    let rm = 0, r2 = 0; for (let j = 0; j < N; j++) { rm += g.qs[i][j] * R[j]; r2 += g.qs[i][j] * R[j] * R[j]; }
    return { s: sh[i].name, o: g.occ[i], e: +g.es[i].toFixed(5), r: +rm.toFixed(4), r2: +r2.toFixed(4) };
  });
  // the radial density: electrons per bohr, Σ occ q / dr, sampled on RPLOT
  const dens = Array.from(RPLOT, (r) => {
    const x = Math.log(r / R[0]) / H, j = Math.min(N - 2, Math.max(0, Math.floor(x))), f = x - j;
    let s = 0; for (const i of live) s += g.occ[i] * (g.qs[i][j] * (1 - f) + g.qs[i][j + 1] * f);
    return +(s / (H * r)).toPrecision(3);
  });
  return { Z, config: configString(g.occ, d), E: +g.E.toFixed(5), ion: +ion.toFixed(5), top: sh[top].name, orb, dens };
}

/* the noble gases again, with the clouds' pull computed as if the shell theorem held: what the failure of the shell
   theorem does to how hard an atom holds its outermost electron */
export function counterfactual(el, d) {
  const sh = subshells(d), occ = sh.map((s) => (el.orb.find((o) => o.s === s.name) || { o: 0 }).o), i = sh.findIndex((s) => s.name === el.top);
  const g = scf(el.Z, occ, d, { iters: 60, shellTheorem: true, ...SOLVER }), ionOcc = occ.slice(); ionOcc[i]--;
  return { Z: el.Z, ion: +(scf(el.Z, ionOcc, d, { iters: 60, start: g.qs, shellTheorem: true, ...SOLVER }).E - g.E).toFixed(5) };
}

/* on the runner: --zmax4=N (the 4D cap), --cache (each element saved to $TMPDIR/atom4-table as it finishes, and skipped
   if already there), --shard i/m (elements with Z ≡ i mod m), --assemble (js/table.js from the cache, once complete) */
const ARG = (k) => process.argv.find((a) => a.startsWith(`--${k}`)), CACHE_DIR = path.join(process.env.TMPDIR || tmpdir(), "atom4-table");
if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  if (ARG("zmax4=")) ZMAX[4] = +ARG("zmax4=").split("=")[1];
  const useCache = !!ARG("cache") || !!ARG("assemble"), shard = (ARG("shard=") ?? "").split("=")[1], [si, sm] = shard ? shard.split("/").map(Number) : [0, 1];
  if (useCache) mkdirSync(CACHE_DIR, { recursive: true });
  const cached = (d, Z) => path.join(CACHE_DIR, `${d}-${Z}.json`);
  const jobs = []; for (const d of [3, 4]) for (let Z = 1; Z <= ZMAX[d]; Z++) if (Z % sm === si && !(useCache && existsSync(cached(d, Z)))) jobs.push({ Z, d });
  if (ARG("assemble")) jobs.length = 0;
  jobs.sort((a, b) => b.Z - a.Z); // the heavy ones first, so the pool finishes together
  const out = { 3: [], 4: [] }, t0 = Date.now();
  const nw = Math.max(1, availableParallelism());
  await Promise.all(Array.from({ length: nw }, () => new Promise((done) => {
    const w = new Worker(new URL(import.meta.url), { workerData: true });
    const next = () => { const j = jobs.shift(); if (!j) { w.terminate(); done(); } else w.postMessage(j); };
    w.on("message", (m) => { out[m.d][m.Z - 1] = m.el; if (useCache) writeFileSync(cached(m.d, m.Z), JSON.stringify(m.el)); process.stderr.write(`${m.d}D ${m.Z} ${m.el.config} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`); next(); });
    next();
  })));
  if (useCache) { // the table from the cache: every element must be there
    for (const d of [3, 4]) for (let Z = 1; Z <= ZMAX[d]; Z++) if (!out[d][Z - 1] && existsSync(cached(d, Z))) out[d][Z - 1] = JSON.parse(readFileSync(cached(d, Z), "utf8"));
    const missing = [3, 4].flatMap((d) => Array.from({ length: ZMAX[d] }, (_, i) => (out[d][i] ? null : `${d}D ${i + 1}`)).filter(Boolean));
    if (missing.length) { console.log(`cached; ${missing.length} elements still to do (${missing.slice(0, 8).join(", ")}…)`); process.exit(0); }
  }
  const cf = out[4].filter((el) => isNoble(el, 4)).map((el) => counterfactual(el, 4));
  const body = `/* Generated by tools/bake.mjs from js/atom.js (Hartree + local exchange); do not edit. RPLOT: the radii (bohr) the densities are sampled at. */\n` +
    `export const RPLOT = ${JSON.stringify(Array.from(RPLOT, (r) => +r.toPrecision(4)))};\n` +
    `export const TABLE = {\n  3: ${JSON.stringify(out[3])},\n  4: ${JSON.stringify(out[4])}\n};\n` +
    `/* 4D's noble gases' first ionization energies (hartree) if the shell theorem held */\nexport const SHELL_COUNTERFACTUAL = ${JSON.stringify(cf)};\n`;
  writeFileSync(new URL("../js/table.js", import.meta.url), body);
  console.log(`baked ${out[3].length} + ${out[4].length} elements in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else if (!isMainThread && workerData) {
  parentPort.on("message", ({ Z, d }) => parentPort.postMessage({ Z, d, el: element(Z, d) }));
}
