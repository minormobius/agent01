/* Paper 1's bracket of the pinned law: the 4D table solved under a law 1/r^η other than 1/r, η = 0.5 and 1.5, every
   pair of charges alike (the nucleus −Z/r^η, the clouds through kη, the local exchange of that law's own electron gas),
   everything else as the bake has it. Section 2.3 says only 1/r keeps a shell's l together; this asks what that does to
   the table: which rows and noble gases survive on either side of η = 1.
     node four/atom/tools/etatable.mjs run <eta> <i> <m> [zmax]   elements Z ≡ i (mod m), Z = 1–zmax (100), one after another
     node four/atom/tools/etatable.mjs repair <eta> <i> <m>       the cached elements whose search never settled (E or ion
                                                                  null, or a negative ionization), Z ≡ i (mod m): searched
                                                                  again from every configuration in reach, mixing slower
     node four/atom/tools/etatable.mjs bake                       papers/p1/data/etatable.json from the cache
   Each element is searched as the bake searches (ground(): the aufbau by orbital energies, then one- and two-electron
   moves) and seeded from the real table's configuration and its neighbours' ± one electron, and from the filling order
   of the bare nucleus under the same law. The solver's subshells stop at f (l ≤ 3); under η < 1 a higher l is the more
   bound, so for every element the empty 5g level is solved in its field too, and gIntrudes says it lies below the
   outermost occupied level (then the table there is incomplete, not wrong by the search).
   One JSON line per element; cache $TMPDIR/atom4-etatable/eta<η>-<Z>.json, skipped when present (resumable). */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scf, subshells, configString, potentials, solve, lowerBound } from "../js/atom.js";
import { TABLE } from "../js/table.js";
import { element } from "./bake.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), DIR = path.join(process.env.TMPDIR || tmpdir(), "atom4-etatable");
const SH = subshells(4), T4 = TABLE[4], ZMAX = 100;
const occOf = (config) => { const o = SH.map(() => 0); for (const t of config.split(" ")) { const m = t.match(/^(\d+[a-z])(\d+)$/); o[SH.findIndex((s) => s.name === m[1])] = +m[2]; } return o; };
const okOcc = (o, Z) => o.reduce((t, x) => t + x, 0) === Z && o.every((x, i) => x >= 0 && x <= SH[i].cap);
const solverOf = (eta) => ({ exchange: true, eta });
const fileOf = (eta, Z) => path.join(DIR, `eta${eta}-${Z}.json`);

/* the bare nucleus's levels under the law (one electron, Z = 1: the order doesn't depend on Z), filled in that order */
const BARE = {};
function bareFill(eta, Z) {
  if (!BARE[eta]) { const sh = SH.map(() => 0); const Vs = potentials(1, sh, SH.map(() => null), 4, solverOf(eta));
    BARE[eta] = SH.map((s, i) => ({ i, e: solve(Vs[i], s.l, s.n - s.l - 1, 4, lowerBound(Vs[i], eta)).e })).sort((a, b) => a.e - b.e).map((x) => x.i); }
  const o = SH.map(() => 0); let left = Z; for (const i of BARE[eta]) { const k = Math.min(left, SH[i].cap); o[i] = k; left -= k; if (!left) break; } return o;
}
function seedsFor(eta, Z, extra = []) {
  const seeds = [], add = (o) => { if (okOcc(o, Z) && !seeds.some((x) => x.every((v, i) => v === o[i]))) seeds.push(o); };
  add(bareFill(eta, Z)); add(occOf(T4[Z - 1].config)); for (const o of extra) add(o);
  for (const [Zn, dir] of [[Z - 1, 1], [Z + 1, -1]]) {
    if (Zn < 1 || Zn > T4.length) continue; const base = occOf(T4[Zn - 1].config);
    for (let i = 0; i < SH.length; i++) { const o = base.slice(); o[i] += dir; add(o); }
  }
  return seeds;
}
/* the empty 5g level in an atom's own field (the potential any empty subshell sees), against its outermost occupied one */
function gProbe(eta, Z, occ) {
  const r = scf(Z, occ, 4, { ...solverOf(eta), iters: 200 }); if (!r.converged) return null;
  const empty = SH.findIndex((s, i) => occ[i] === 0), Vs = potentials(Z, occ, r.qs, 4, solverOf(eta)), V = Vs[empty];
  const e5g = solve(V, 4, 0, 4, lowerBound(V, eta)).e, top = Math.max(...SH.map((s, i) => (occ[i] > 0 ? r.es[i] : -Infinity)));
  return { e5g: +e5g.toFixed(5), top: +top.toFixed(5), gIntrudes: e5g < top };
}
function one(eta, Z) {
  const t0 = Date.now(), el = element(Z, 4, seedsFor(eta, Z), solverOf(eta)), { dens, ...rest } = el;
  const g = Number.isFinite(el.E) ? gProbe(eta, Z, occOf(el.config)) : null;
  return { eta, ...rest, g, real: { config: T4[Z - 1].config }, sameConfig: el.config === T4[Z - 1].config, s: (Date.now() - t0) / 1000 };
}

export const REPAIR = { mix: 0.15, iters: 1500 };
const settled = (r) => r.E !== null && Number.isFinite(r.E) && r.ion !== null && Number.isFinite(r.ion) && r.ion >= 0;
function repair(row) {
  const eta = row.eta, Z = row.Z, t0 = Date.now(), extra = [occOf(row.config)];
  for (const [Zn, dir] of [[Z - 1, 1], [Z + 1, -1]]) { const f = fileOf(eta, Zn); if (!existsSync(f)) continue; const nb = JSON.parse(readFileSync(f, "utf8")); if (!settled(nb)) continue;
    const base = occOf(nb.config); for (let i = 0; i < SH.length; i++) { const o = base.slice(); o[i] += dir; extra.push(o); } }
  const seeds = seedsFor(eta, Z, extra); let best = null;
  for (const o of seeds) { const r = scf(Z, o, 4, { ...solverOf(eta), ...REPAIR }); if (r.converged && (!best || r.E < best.r.E - 1e-6)) best = { r, o }; }
  if (!best) return { ...row, repair: { ...REPAIR, candidates: seeds.length, settled: false, s: (Date.now() - t0) / 1000 } };
  const { r: gs, o: occ } = best, live = SH.map((s, i) => i).filter((i) => occ[i] > 0), cand = live.slice().sort((x, y) => gs.es[y] - gs.es[x]).slice(0, 3);
  let ion = null;
  for (const i of cand) { const oi = occ.slice(); oi[i]--; const r = scf(Z, oi, 4, { ...solverOf(eta), ...REPAIR, start: gs.qs }); if (r.converged && (!ion || r.E - gs.E < ion.v)) ion = { v: r.E - gs.E, i }; }
  const config = configString(occ, 4);
  return { ...row, config, E: +gs.E.toFixed(5), ion: ion ? +ion.v.toFixed(5) : null, top: ion ? SH[ion.i].name : null, g: gProbe(eta, Z, occ), sameConfig: config === T4[Z - 1].config,
    repair: { ...REPAIR, candidates: seeds.length, settled: true, ionSettled: !!ion, s: (Date.now() - t0) / 1000 } };
}

const [cmd, a, b, c, d] = process.argv.slice(2);
mkdirSync(DIR, { recursive: true });
if (cmd === "run" || cmd === "repair") {
  const eta = +a, i = +b, m = +c, zmax = +(d || ZMAX);
  if (!(eta > 0 && eta < 2) || !(m > 0) || !(i >= 0 && i < m)) { console.error("usage: etatable.mjs run|repair <eta> <i> <m> [zmax]"); process.exit(2); }
  for (let Z = 1; Z <= zmax; Z++) {
    if (Z % m !== i) continue; const f = fileOf(eta, Z);
    if (cmd === "run") { if (existsSync(f)) continue; const row = one(eta, Z); writeFileSync(f, JSON.stringify(row)); console.log(JSON.stringify(row)); }
    else { if (!existsSync(f)) continue; const row = JSON.parse(readFileSync(f, "utf8")); if (settled(row)) continue; const fixed = repair(row); writeFileSync(f, JSON.stringify(fixed)); console.log(JSON.stringify(fixed)); }
  }
} else if (cmd === "bake") {
  const rows = readdirSync(DIR).filter((f) => /^eta[\d.]+-\d+\.json$/.test(f)).map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8"))).sort((x, y) => x.eta - y.eta || x.Z - y.Z);
  const out = path.join(here, "../../papers/p1/data/etatable.json");
  writeFileSync(out, JSON.stringify({ about: "Generated by four/atom/tools/etatable.mjs bake: the 4D table solved under a law 1/r^η, η = 0.5 and 1.5 (paper 1's bracket of the pinned law). Do not edit. g: the empty 5g level in the atom's field against its outermost occupied level (the solver stops at f).", rows }, null, 1) + "\n");
  for (const eta of [...new Set(rows.map((r) => r.eta))]) { const rs = rows.filter((r) => r.eta === eta); console.log(`η = ${eta}: ${rs.length} elements, ${rs.filter(settled).length} settled, ${rs.filter((r) => r.g?.gIntrudes).length} with 5g below the outermost level`); }
} else { console.error("usage: etatable.mjs run|repair <eta> <i> <m> [zmax] | bake"); process.exit(2); }
