/* Re-solves paper 1's atoms from the solver and checks them against the paper's data (data/table4.json, table3.json):
   the ground configuration exactly, the total and first ionization energies to 1e-4 hartree.
     node papers/p1/reproduce.mjs                  # a sample: each 4D row's first, second and noble gas, and some of ours
     node papers/p1/reproduce.mjs --z4=50,51 --z3=24
     node papers/p1/reproduce.mjs --all            # every element (hours on one core: the 4D table past ~80 is slow)
   The same function wrote the bake the paper's numbers come from (atom/tools/bake.mjs's element()). 4D elements 88,
   101–103 and 105–107 were baked with a second, seeded search (bake.mjs --repair); a plain re-solve of those may find
   a higher configuration, and is reported as such rather than as a failure of the rest. */
import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { element } from "../../atom/tools/bake.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPAIRED = new Set([88, 101, 102, 103, 105, 106, 107]);
const TOL = 1e-4;

if (!isMainThread) {
  parentPort.on("message", ({ Z, d }) => parentPort.postMessage({ Z, d, el: element(Z, d) }));
} else {
  const data = { 3: JSON.parse(readFileSync(path.join(here, "data/table3.json"), "utf8")), 4: JSON.parse(readFileSync(path.join(here, "data/table4.json"), "utf8")) };
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1]?.split(",").map(Number);
  const all = process.argv.includes("--all");
  const pick = {
    4: all ? data[4].map((r) => r.Z) : arg("z4") ?? (arg("z3") ? [] : [1, 2, 3, 12, 13, 22, 23, 50]),
    3: all ? data[3].map((r) => r.Z) : arg("z3") ?? (arg("z4") ? [] : [2, 10, 11, 18, 24, 29]),
  };
  const jobs = [4, 3].flatMap((d) => pick[d].map((Z) => ({ Z, d }))).sort((a, b) => b.Z - a.Z);
  const t0 = Date.now(), results = [];
  const nw = Math.min(jobs.length, Math.max(1, availableParallelism()));
  await Promise.all(Array.from({ length: nw }, () => new Promise((done) => {
    const w = new Worker(fileURLToPath(import.meta.url));
    const next = () => { const j = jobs.shift(); if (!j) { w.terminate(); done(); } else w.postMessage(j); };
    w.on("message", (m) => { results.push(m); next(); });
    next();
  })));
  results.sort((a, b) => a.d - b.d || a.Z - b.Z);
  let fails = 0, soft = 0;
  for (const { Z, d, el } of results) {
    const ref = data[d].find((r) => r.Z === Z), dE = el.E - ref.E_hartree, dI = el.ion - ref.ion_hartree;
    const good = el.config === ref.config && Math.abs(dE) < TOL && Math.abs(dI) < TOL;
    if (!good && d === 4 && REPAIRED.has(Z)) soft++; else if (!good) fails++;
    console.log(`${good ? "ok  " : d === 4 && REPAIRED.has(Z) ? "seed" : "FAIL"} ${d}D Z=${String(Z).padStart(3)}  ${el.config.padEnd(34)} E ${el.E.toFixed(5).padStart(12)} (Δ ${dE.toExponential(1)})  ion ${el.ion.toFixed(5)} (Δ ${dI.toExponential(1)})${el.config === ref.config ? "" : `  paper: ${ref.config}`}`);
  }
  console.log(`\n${results.length - fails - soft} of ${results.length} reproduced in ${((Date.now() - t0) / 1000).toFixed(0)} s` + (soft ? `; ${soft} need the seeded search (bake.mjs --repair)` : ""));
  process.exit(fails ? 1 : 0);
}
