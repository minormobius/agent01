/* R1's values: every number the paper takes from a baked data file, by name. The text (text.md) carries {{name}}
   tokens and the build fills them from here, so a number in the paper is the data's or it is not there.
   Parameters of the methods (33 beads, 110 steps, …) are read from the code's own records where it keeps them. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPECIES, stats } from "../../pull/js/bench.js";
const here = path.dirname(fileURLToPath(import.meta.url)), J = (f) => JSON.parse(fs.readFileSync(path.join(here, "../..", f), "utf8"));
const S = J("pull/data/samples.json"), SH = J("pull/data/sheath.json"), CA = J("pull/data/cable.json"), BR = J("pull/data/braid.json"), SE = J("pull/data/sens.json"), PR = J("pull/data/press.json"), PO = J("pull/data/poisson.json"), GA = J("pull/data/gauge.json"), TW = J("twist/data/twist.json"), HO = J("twist/data/hosed.json"), WA = J("twist/data/walls.json");
const f2 = (x) => x.toFixed(2), f1 = (x) => x.toFixed(1), f0 = (x) => x.toFixed(0), pc = (x) => (x * 100).toFixed(0) + "%";
const ref = stats(S.peaks.strand).mean, sp = (id) => { const s = SPECIES.find((q) => q.id === id), t = stats(S.peaks[id]); return { spec: t.mean / ref / s.material, p5: t.p5 / ref / s.material, cv: t.cv, mean: t.mean / ref }; };
const best = (rows) => rows.reduce((a, b) => (b.specific5 > a.specific5 ? b : a)), kind = (k) => best(SH.rows.filter((r) => r.kind === k)), lvl = (n) => { const l = CA.levels[n - 1]; return l.rows.find((r) => r.tau === l.best); };
const br = (n) => best(BR.rows.filter((r) => r.name === n)), se = (n) => SE.rows.filter((r) => r.name === n && r.left <= 1.001).map((r) => r.specific), po = (dnu, st = 0) => PO.rows.find((r) => r.dnu === dnu && r.staple === st);
const g = (S_, m) => { const r = GA.gauge.find((q) => q.S === S_ && q.m === m), hose = Math.max(r.hose01.specific, r.hose02.specific); return { loose: r.loose.specific, hoops: r.hoops.specific, hose, ratio: hose / r.loose.specific }; }, GS = [[24, 5], [48, 5], [96, 5], [192, 5], [96, 10], [96, 20]].map(([a, b]) => g(a, b));
const mem = (name) => { const r = GA.member.find((q) => q.name.startsWith(name)); return Math.max(r.tau01, r.tau02); };
const hmin = (t) => Math.min(...HO.hosed.filter((r) => r.turns === t).map((r) => r.energy)), free = (t) => HO.free.find((r) => r.turns === t).energy, wall = (w, t) => WA.rows.filter((r) => r.wall === w && r.turns === t).map((r) => r.energy), rng = (v, f = f1) => (f(Math.min(...v)) === f(Math.max(...v)) ? f(v[0]) : `${f(Math.min(...v))} to ${f(Math.max(...v))}`);
export const V = {
  pulls: String(S.n), nSheath: String(SH.n), nSens: String(SE.n), nGauge: String(GA.n), nBraid: String(BR.n), nCable: String(CA.n),
  strandCv: pc(sp("strand").cv), strandP5: f2(sp("strand").p5), loose: f2(sp("fil4").spec), looseCv: pc(sp("fil4").cv), y4: f2(sp("y4").mean), y3hard: f2(sp("y3hard").spec), ribhard: f2(sp("rib4hard").spec),
  rope: f2(sp("rope4").spec), ropeCv: pc(sp("rope4").cv), ropeP5: f2(sp("rope4").p5),
  hoseBest: f2(kind("hose").specific), hoopsBest: f2(kind("hoops").specific), hoseShort: f2(kind("hose, short fibres").specific), hoopsShort: f2(kind("hoops, short fibres").specific),
  dialLo: f2(Math.min(...se("filaments in a hose"))), dialHi: f2(Math.max(...se("filaments in a hose"))), hoopsDialLo: f2(Math.min(...se("filaments in hoops"))), hoopsDialHi: f2(Math.max(...se("filaments in hoops"))),
  cable1: f2(lvl(1).specific), cable2: f2(lvl(2).specific), cable3: f2(lvl(3).specific),
  loose7: f2(br("loose 7").specific), loose7Cv: pc(br("loose 7").cv), maypole: f2(br("maypole").specific), maypoleCv: pc(br("maypole").cv), maypoleAngle: br("maypole").theta + "°", served: f2(br("served").specific), plait: f2(br("plait").specific),
  po0: f2(po(0).specific), po02: f2(po(0.2).specific), po1: f2(po(1).specific),
  skin: f2(PR.factor), skinPeak: f1(PR.skin.find((k) => k.level === 5).peak), pressLo: f2(Math.min(...PR.bench.map((r) => r.specific))), pressHi: f2(Math.max(...PR.bench.map((r) => r.specific))),
  helixLow: f2(Math.min(...PR.helix.filter((h) => h.angle < 20).map((h) => h.ratio))), helixHigh: f1(Math.max(...PR.helix.filter((h) => h.angle > 20).map((h) => h.ratio))),
  /* the gauge and the scatter: against a strand, and against the same filaments loose */
  g24: f2(GS[0].hose), g48: f2(GS[1].hose), g96: f2(GS[2].hose), g192: f2(GS[3].hose), gm10: f2(GS[4].hose), gm20: f2(GS[5].hose),
  l24: f2(GS[0].loose), l48: f2(GS[1].loose), l96: f2(GS[2].loose), l192: f2(GS[3].loose), lm10: f2(GS[4].loose), lm20: f2(GS[5].loose),
  h24: f2(GS[0].hoops), h48: f2(GS[1].hoops), h96: f2(GS[2].hoops), h192: f2(GS[3].hoops), hm10: f2(GS[4].hoops), hm20: f2(GS[5].hoops),
  r24: f2(GS[0].ratio), r48: f2(GS[1].ratio), r96: f2(GS[2].ratio), r192: f2(GS[3].ratio), rm10: f2(GS[4].ratio), rm20: f2(GS[5].ratio),
  hoseMin: f2(Math.min(...GS.map((q) => q.hose))), hoseMax: f2(Math.max(...GS.map((q) => q.hose))), ratioMin: f1(Math.min(...GS.map((q) => q.ratio))), ratioMax: f1(Math.max(...GS.map((q) => q.ratio))),
  memBuilt: f2(mem("as built")), memSize: f2(mem("with a size")), memVm: f2(mem("axial strength × 0.866")), memHalf: f2(mem("axial strength halved")), memGrip: f2(mem("gripping")),
  /* twist */
  untwisted: f1(TW.ends.find((e) => e.d === 4 && e.turns === 0).energy), after2: f1(TW.ends.find((e) => e.d === 4 && e.turns === 2).energy), ribbonLo: String(TW.ribbon[TW.ribbon.findIndex((r) => Math.abs(r.wound) > 1) - 1].tape), ribbonHi: String(TW.ribbon[TW.ribbon.findIndex((r) => Math.abs(r.wound) > 1)].tape),
  wEven: rng([...wall(0.2, 0), ...wall(0.2, 2)]), wOdd: rng([...wall(0.2, 1), ...wall(0.2, 3)]), wlEven: rng([...wall(0.215, 0), ...wall(0.215, 2)]), wlOdd: rng([...wall(0.215, 1), ...wall(0.215, 3)]),
  wtEven: rng([...wall(0.19, 0), ...wall(0.19, 2)], f0), wtOdd: rng([...wall(0.19, 1), ...wall(0.19, 3)], f0), free13: f1(free(0)), freeHalf: rng([free(0.5), free(1.5), free(2.5), free(3.5)]),
  q0: f0(hmin(0)), q025: f0(hmin(0.25)), q05: f0(hmin(0.5)), q075: f0(hmin(0.75)), q1: f0(hmin(1)), q125: f0(hmin(1.25)), q15: f0(hmin(1.5)), q175: f0(hmin(1.75)), q2: f0(hmin(2)), q3: f0(hmin(3)), q4: f0(hmin(4)),
  nSeeds: String(new Set(HO.hosed.map((r) => r.seed)).size), nWallSeeds: String(new Set(WA.rows.map((r) => r.seed)).size),
  beads: String(TW.defaults.beads), ks: String(TW.defaults.ks), kc: String(TW.defaults.kc), yarnSteps: TW.steps.toLocaleString("en").replace(/,/g, " "), benchSteps: String(S.run.steps), benchStrain: (S.run.strain * 100).toFixed(1) + "%",
};
export const fill = (text) => { const missing = new Set(); const out = text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in V ? V[k] : (missing.add(k), m))); return { out, missing: [...missing] }; };
