/* R1's ledger: every number the draft takes from the bench, recomputed from the baked data files and looked for in
   the draft as printed. A number in DRAFT.md that the data no longer supports fails here.
   node kata/papers/r1/test/ledger.selftest.mjs   (< 1 s)        --print lists the values */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), D = (f) => JSON.parse(fs.readFileSync(path.join(here, "../../../pull/data", f + ".json"), "utf8")), { SPECIES, stats } = await import(path.join(here, "../../../pull/js/bench.js"));
const S = D("samples"), SH = D("sheath"), CA = D("cable"), BR = D("braid"), SE = D("sens"), PR = D("press"), PO = D("poisson"), draft = fs.readFileSync(path.join(here, "../DRAFT.md"), "utf8");
const ref = stats(S.peaks.strand).mean, sp = (id) => { const s = SPECIES.find((q) => q.id === id), t = stats(S.peaks[id]); return { spec: t.mean / ref / s.material, p5: t.p5 / ref / s.material, cv: t.cv, mean: t.mean / ref }; };
const best = (rows) => rows.reduce((a, b) => (b.specific5 > a.specific5 ? b : a)), kind = (k) => best(SH.rows.filter((r) => r.kind === k)), lvl = (n) => { const l = CA.levels[n - 1]; return l.rows.find((r) => r.tau === l.best); };
const br = (n) => best(BR.rows.filter((r) => r.name === n)), se = (n) => SE.rows.filter((r) => r.name === n && r.left <= 1.001).map((r) => r.specific), po = (dnu, st = 0) => PO.rows.find((r) => r.dnu === dnu && r.staple === st);
const f2 = (x) => x.toFixed(2), pc = (x) => (x * 100).toFixed(0) + "%";
/* [what it is, the value as the draft prints it] */
const L = [
  ["pulls per species", String(S.n)],
  ["one strand's spread", pc(sp("strand").cv)],
  ["loose bundle of 13 filaments, per weight", f2(sp("fil4").spec)], ["its spread", pc(sp("fil4").cv)],
  ["4D twisted yarn, strands", f2(sp("y4").mean)],
  ["3D twisted yarn, hard, per weight", f2(sp("y3hard").spec)],
  ["yarn on a ribbon, hard, per weight", f2(sp("rib4hard").spec)],
  ["filaments in a hose (species, τ 0.1), per weight", f2(sp("rope4").spec)], ["its spread", pc(sp("rope4").cv)], ["its 5th percentile per weight", f2(sp("rope4").p5)], ["a strand's 5th percentile", f2(sp("strand").p5)],
  ["best hose, per weight", f2(kind("hose").specific)], ["best hoops, per weight", f2(kind("hoops").specific)], ["best hose with short fibres", f2(kind("hose, short fibres").specific)], ["best hoops with short fibres", f2(kind("hoops, short fibres").specific)],
  ["hose across the dials, low", f2(Math.min(...se("filaments in a hose")))], ["hose across the dials, high", f2(Math.max(...se("filaments in a hose")))],
  ["hoops across the dials, low", f2(Math.min(...se("filaments in hoops")))], ["hoops across the dials, high", f2(Math.max(...se("filaments in hoops")))],
  ["rope, cable, great cable", [1, 2, 3].map((n) => f2(lvl(n).specific)).join(", ")],
  ["seven hoses loose", f2(br("loose 7").specific)], ["maypole", f2(br("maypole").specific)], ["maypole angle", br("maypole").theta + "°"], ["maypole spread", pc(br("maypole").cv)], ["loose-seven spread", pc(br("loose 7").cv)], ["ribbons on a hose", f2(br("served").specific)], ["plait of three", f2(br("plait").specific)],
  ["contracting hose at 0.2", f2(po(0.2).specific)], ["contracting hose at 1", f2(po(1).specific)], ["plain hose in that study", f2(po(0).specific)],
  ["taut skin over the round-vessel formula", f2(PR.factor)], ["skin's tightest hundredth over its mean", PR.skin.find((k) => k.level === 5).peak.toFixed(1)],
  ["hose rope under every version of the squeeze", f2(Math.min(...PR.bench.map((r) => r.specific))) + "–" + f2(Math.max(...PR.bench.map((r) => r.specific)))],
  ["helix law, worst ratio below 20°", f2(Math.min(...PR.helix.filter((h) => h.angle < 20).map((h) => h.ratio)))], ["helix law, ratio above 20°", Math.max(...PR.helix.filter((h) => h.angle > 20).map((h) => h.ratio)).toFixed(1)],
];
if (process.argv.includes("--print")) { for (const [k, v] of L) console.log(v.padEnd(18), k); process.exit(0); }
let fails = 0; for (const [k, v] of L) if (!draft.includes(v)) { fails++; console.log(`FAIL the draft does not print ${v} (${k})`); }
console.log(fails ? `\n${L.length - fails}/${L.length} checks` : `ok   all ${L.length} of the draft's bench numbers are what the baked data gives\n\n1/1 checks`);
process.exit(fails ? 1 : 0);
