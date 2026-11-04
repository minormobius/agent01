/* Paper 1's counterfactual table: every 4D element solved again with the shell theorem forced on (the clouds' pull as
   if each sat at the centre, the 3D kernel), everything else as the bake has it. It separates what the table owes to
   the charge law (no shell theorem) from what it owes to the geometry (the 4D kinetic operator, shells of 2(l + 1)²).
     node four/atom/tools/lawtable.mjs shell <i> <m>    elements with Z ≡ i (mod m), Z = 1–140, one after another
     node four/atom/tools/lawtable.mjs repair <i> <m>   the cached elements whose search never settled (E or ion null), Z ≡ i
                                                        (mod m): searched again more widely, mixing slower, longer (cache updated)
     node four/atom/tools/lawtable.mjs bake             papers/p1/data/shelltable.json from the cache (all 140 needed)
   Each element is searched as the bake searched it, then seeded from the real table's configurations (its own and its
   neighbours' ± one electron, as bake.mjs --repair does), so the counterfactual isn't handicapped by a worse search.
   Then the other way round: the real law re-solved in the counterfactual's configuration, which checks that the
   table's own configuration is still the lower one (lawAtShell above the table's E, or a flag).
   Prints one JSON line per element; cache $TMPDIR/atom4-lawtable/shell-<Z>.json, skipped when present (resumable). */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scf, subshells, configString } from "../js/atom.js";
import { TABLE } from "../js/table.js";
import { element, SOLVER } from "./bake.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), DIR = path.join(process.env.TMPDIR || tmpdir(), "atom4-lawtable");
const SH = subshells(4), T4 = TABLE[4];
const occOf = (config) => { const o = SH.map(() => 0); for (const t of config.split(" ")) { const m = t.match(/^(\d+[a-z])(\d+)$/); o[SH.findIndex((s) => s.name === m[1])] = +m[2]; } return o; };
const LAWS = { shell: { ...SOLVER, shellTheorem: true } };

/* the real table's configuration for Z, and its neighbours' with one electron added or taken wherever it fits */
function seedsFor(Z) {
  const seeds = [], add = (o) => { if (o.reduce((t, x) => t + x, 0) === Z && o.every((x, i) => x >= 0 && x <= SH[i].cap) && !seeds.some((x) => x.every((v, i) => v === o[i]))) seeds.push(o); };
  add(occOf(T4[Z - 1].config));
  for (const [Zn, dir] of [[Z - 1, 1], [Z + 1, -1]]) {
    if (Zn < 1 || Zn > T4.length) continue; const base = occOf(T4[Zn - 1].config);
    for (let i = 0; i < SH.length; i++) { const o = base.slice(); o[i] += dir; add(o); }
  }
  return seeds;
}

function one(law, Z) {
  const t0 = Date.now(), solver = LAWS[law], el = element(Z, 4, seedsFor(Z), solver), { dens, ...rest } = el, real = T4[Z - 1];
  // the real law in the counterfactual's configuration: is the table's own still lower?
  let lawAtShell = null;
  if (el.config !== real.config) { const r = scf(Z, occOf(el.config), 4, { iters: 160, ...SOLVER }); lawAtShell = r.converged ? +r.E.toFixed(5) : null; }
  return { law, ...rest, real: { config: real.config, E: real.E, ion: real.ion, top: real.top }, sameConfig: el.config === real.config, lawAtShell, tableStillLower: lawAtShell === null || lawAtShell > real.E - 1e-6, s: (Date.now() - t0) / 1000 };
}

/* an element whose search never settled (E null: no candidate's field converged in ground()'s budgets): searched again
   from every configuration in reach (the real table's for Z and its neighbours ± one electron, the unsettled filling,
   and the counterfactual's own neighbours ± one), each solved from scratch with mixing 0.15 for up to 1500 iterations;
   the lowest settled one kept, then its ion the same way, and the real law re-solved in it as before */
export const REPAIR = { mix: 0.15, iters: 1500 };
function repair(row) {
  const solver = LAWS[row.law], t0 = Date.now(), Z = row.Z, seeds = seedsFor(Z);
  const add = (o) => { if (o.reduce((t, x) => t + x, 0) === Z && o.every((x, i) => x >= 0 && x <= SH[i].cap) && !seeds.some((x) => x.every((v, i) => v === o[i]))) seeds.push(o); };
  add(occOf(row.config));
  for (const [Zn, dir] of [[Z - 1, 1], [Z + 1, -1]]) {
    const f = path.join(DIR, `${row.law}-${Zn}.json`); if (!existsSync(f)) continue;
    const nb = JSON.parse(readFileSync(f, "utf8")); if (nb.E === null) continue;
    const base = occOf(nb.config); for (let i = 0; i < SH.length; i++) { const o = base.slice(); o[i] += dir; add(o); }
  }
  let best = null;
  for (const o of seeds) { const g = scf(Z, o, 4, { ...solver, ...REPAIR }); if (g.converged && (!best || g.E < best.g.E - 1e-6)) best = { g, o }; }
  if (!best) return { ...row, repair: { ...REPAIR, candidates: seeds.length, settled: false, s: (Date.now() - t0) / 1000 } };
  const { g, o: occ } = best, live = SH.map((s, i) => i).filter((i) => occ[i] > 0), cand = live.slice().sort((x, y) => g.es[y] - g.es[x]).slice(0, 3);
  let ion = null;
  for (const i of cand) { const oi = occ.slice(); oi[i]--; const r = scf(Z, oi, 4, { ...solver, ...REPAIR, start: g.qs }); if (r.converged && (!ion || r.E - g.E < ion.v)) ion = { v: r.E - g.E, i }; }
  const config = configString(occ, 4), real = T4[Z - 1];
  let lawAtShell = null;
  if (config !== real.config) { const r = scf(Z, occ, 4, { ...SOLVER, ...REPAIR }); lawAtShell = r.converged ? +r.E.toFixed(5) : null; }
  return { ...row, config, E: +g.E.toFixed(5), ion: ion ? +ion.v.toFixed(5) : null, top: ion ? SH[ion.i].name : null, sameConfig: config === real.config, lawAtShell,
    tableStillLower: lawAtShell === null || lawAtShell > real.E - 1e-6, repair: { ...REPAIR, candidates: seeds.length, settled: true, ionSettled: !!ion, s: (Date.now() - t0) / 1000 } };
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "bake") {
  const rows = []; for (let Z = 1; Z <= T4.length; Z++) { const f = path.join(DIR, `shell-${Z}.json`); if (!existsSync(f)) { console.error(`missing ${f}`); process.exit(1); } rows.push(JSON.parse(readFileSync(f, "utf8"))); }
  const out = path.join(here, "../../papers/p1/data/shelltable.json");
  writeFileSync(out, JSON.stringify({ about: "Generated by four/atom/tools/lawtable.mjs bake: the 4D table solved with the shell theorem forced on (paper 1's counterfactual). Do not edit.", rows }, null, 1) + "\n");
  const settled = rows.filter((r) => r.E !== null && !(r.ion !== null && r.ion < 0)); // a negative ionization means the search missed a lower configuration
  console.log(`wrote ${out}: ${settled.length} of ${rows.length} settled, ${settled.filter((r) => !r.sameConfig).length} of those differ`);
} else if (cmd === "repair") {
  const i = +a, m = +b;
  for (let Z = T4.length; Z >= 1; Z--) {
    if (Z % m !== i % m) continue;
    const f = path.join(DIR, `shell-${Z}.json`); if (!existsSync(f)) continue;
    const row = JSON.parse(readFileSync(f, "utf8")); if (row.E !== null && row.E !== undefined && row.ion !== null) continue;
    const r = repair(row); writeFileSync(f, JSON.stringify(r)); console.log(JSON.stringify(r));
  }
} else if (LAWS[cmd]) {
  const i = +a, m = +b; mkdirSync(DIR, { recursive: true });
  for (let Z = T4.length; Z >= 1; Z--) {
    if (Z % m !== i % m) continue;
    const f = path.join(DIR, `${cmd}-${Z}.json`); if (existsSync(f)) { console.log(readFileSync(f, "utf8")); continue; }
    const r = one(cmd, Z); writeFileSync(f, JSON.stringify(r)); console.log(JSON.stringify(r));
  }
} else { console.log("usage: lawtable.mjs shell <i> <m> | repair <i> <m> | bake"); process.exit(1); }
