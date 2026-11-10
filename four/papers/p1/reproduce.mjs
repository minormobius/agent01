/* Re-solves paper 1's atoms and checks them against the paper's data: the ground configuration exactly, the total and
   first ionization energies to 1e-4 hartree. Each 4D row is reproduced by the pipeline that made it:
     - the bake (atom/tools/bake.mjs's element(), the solver with Hund spins) for the elements outside the d and f blocks;
     - the term-corrected search (atom/tools/termtable.mjs: the wider seeded search, every candidate corrected where
       Hund's first rule fails, the ionization corrected on both sides) for the d- and f-block elements 23–42, 51–70 and
       79–130, as termtable-collect.mjs made data/termtable.json, and where the row's ion rearranged (cation_rearranged)
       the ion searched for its own ground state too (termtable.mjs <Z> 4 1), as ions-collect.mjs did.
     node papers/p1/reproduce.mjs                  # a sample: each 4D row's first, second and noble gas, a Hund-corrected
                                                   # element (26: a few minutes), and some of ours
     node papers/p1/reproduce.mjs --z4=26,39,54,55 --z3=24
     node papers/p1/reproduce.mjs --all            # every element (many hours on one core)
     node papers/p1/reproduce.mjs --s1 --z4=26     # supplement S1 (data/table4-hundspin.json): the bake alone, Hund spins,
                                                   # no term correction; 88, 101–103 and 105–107 were baked with a second,
                                                   # seeded search (bake.mjs --repair), so a plain re-solve may land higher
   The term-corrected search needs atom/tools/termtable.mjs and the bake it seeds from, which the tangled mirror doesn't
   carry; there those rows are reported as not reproduced here, never as reproduced. */
import { readFileSync, existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import { execFile } from "node:child_process";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { element } from "../../atom/tools/bake.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), TERMTOOL = path.join(here, "../../atom/tools/termtable.mjs");
const REPAIRED = new Set([88, 101, 102, 103, 105, 106, 107]), TOL = 1e-4, HA = 27.211386245988;
/* the elements termtable-collect.mjs made (data/termtable.json): the 4D d and f blocks */
const TERM = (Z) => (Z >= 23 && Z <= 42) || (Z >= 51 && Z <= 70) || (Z >= 79 && Z <= 130);
const run = (args) => new Promise((ok, no) => execFile(process.execPath, [TERMTOOL, ...args], { maxBuffer: 1 << 26 }, (e, out) => (e ? no(e) : ok(out.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)).at(-1)))));
/* one element by the term-corrected pipeline, rounded as termtable-collect.mjs and ions-collect.mjs round it */
async function termRow(Z, ref) {
  const t = await run([String(Z), "4"]); if (!t || t.unsettled) return null;
  const E = +t.corrected.E.toFixed(5); let ion = t.corrected.ion_eV == null ? null : +(t.corrected.ion_eV / HA).toFixed(5);
  if (ref.cation_rearranged) { const c = await run([String(Z), "4", "1"]); // the ion's own ground state, where the table took it
    if (c && c.corrected) { const full = +((c.corrected.E - E) * HA).toFixed(4); if (ion == null || full < t.corrected.ion_eV - 0.005) ion = +(full / HA).toFixed(5); } }
  return { config: t.corrected.config, E, ion, how: "term" };
}

if (!isMainThread) {
  parentPort.on("message", ({ Z, d }) => { const el = element(Z, d); parentPort.postMessage({ Z, d, el: { config: el.config, E: el.E, ion: el.ion, how: "bake" } }); });
} else {
  const s1 = process.argv.includes("--s1"), all = process.argv.includes("--all");
  const data = { 3: JSON.parse(readFileSync(path.join(here, "data/table3.json"), "utf8")), 4: JSON.parse(readFileSync(path.join(here, s1 ? "data/table4-hundspin.json" : "data/table4.json"), "utf8")) };
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1]?.split(",").map(Number);
  const pick = {
    4: all ? data[4].map((r) => r.Z) : arg("z4") ?? (arg("z3") ? [] : [1, 2, 3, 12, 13, 22, 26, 50]),
    3: all ? data[3].map((r) => r.Z) : arg("z3") ?? (arg("z4") ? [] : [2, 10, 11, 18, 24, 29]),
  };
  const termHere = existsSync(TERMTOOL), byTerm = (j) => !s1 && j.d === 4 && TERM(j.Z);
  const jobs = [4, 3].flatMap((d) => pick[d].map((Z) => ({ Z, d }))).sort((a, b) => b.Z - a.Z), t0 = Date.now(), results = [];
  const bakeJobs = jobs.filter((j) => !byTerm(j)), termJobs = jobs.filter(byTerm);
  const nw = Math.min(bakeJobs.length, Math.max(1, availableParallelism() - Math.min(termJobs.length, 2)));
  const bakeDone = nw ? Promise.all(Array.from({ length: nw }, () => new Promise((done) => {
    const w = new Worker(fileURLToPath(import.meta.url));
    const next = () => { const j = bakeJobs.shift(); if (!j) { w.terminate(); done(); } else w.postMessage(j); };
    w.on("message", (m) => { results.push(m); next(); }); next();
  }))) : Promise.resolve();
  const termDone = (async () => { const queue = termJobs.slice(), lanes = Math.max(1, Math.min(2, queue.length));
    await Promise.all(Array.from({ length: lanes }, async () => { for (let j; (j = queue.shift()); ) {
      if (!termHere) { results.push({ ...j, el: null, skipped: true }); continue; }
      const ref = data[4].find((r) => r.Z === j.Z); results.push({ ...j, el: await termRow(j.Z, ref) }); } })); })();
  await Promise.all([bakeDone, termDone]);
  results.sort((a, b) => a.d - b.d || a.Z - b.Z);
  let fails = 0, soft = 0, skipped = 0;
  for (const { Z, d, el, skipped: sk } of results) {
    const ref = data[d].find((r) => r.Z === Z);
    if (sk) { skipped++; console.log(`--   ${d}D Z=${String(Z).padStart(3)}  term-corrected row: needs atom/tools/termtable.mjs and the bake, not in this copy; not reproduced here`); continue; }
    if (!el) { fails++; console.log(`FAIL ${d}D Z=${String(Z).padStart(3)}  the term-corrected search didn't settle`); continue; }
    const dE = el.E - ref.E_hartree, dI = el.ion - ref.ion_hartree, good = el.config === ref.config && Math.abs(dE) < TOL && Math.abs(dI) < TOL;
    const seeded = s1 && d === 4 && REPAIRED.has(Z);
    if (!good && seeded) soft++; else if (!good) fails++;
    console.log(`${good ? "ok  " : seeded ? "seed" : "FAIL"} ${d}D Z=${String(Z).padStart(3)}  ${(el.how === "term" ? "[term] " : "[bake] ") + el.config.padEnd(34)} E ${el.E.toFixed(5).padStart(12)} (Δ ${dE.toExponential(1)})  ion ${el.ion.toFixed(5)} (Δ ${dI.toExponential(1)})${el.config === ref.config ? "" : `  paper: ${ref.config}`}`);
  }
  const done = results.length - fails - soft - skipped;
  console.log(`\n${done} of ${results.length - skipped} reproduced against ${s1 ? "supplement S1 (data/table4-hundspin.json)" : "the main table (data/table4.json)"} in ${((Date.now() - t0) / 1000).toFixed(0)} s`
    + (soft ? `; ${soft} need the seeded search (bake.mjs --repair)` : "") + (skipped ? `; ${skipped} term-corrected row${skipped > 1 ? "s" : ""} not reproducible in this copy` : ""));
  process.exit(fails ? 1 : 0);
}
