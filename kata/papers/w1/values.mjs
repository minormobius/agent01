/* W1's values: every number the paper takes from this study's data, by name. text.md carries {{name}} tokens and the
   build fills them from here, so a number in the paper is the data's or it is not there. Numbers quoted from other
   people's work are written in text.md as literals, with their source.
   The instrument's numbers are computed here from wire4/js/anem.js (strip theory; held to strip4.py by its selftest). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nu, wire, misread } from "../../wire4/js/anem.js";
const here = path.dirname(fileURLToPath(import.meta.url)), D = path.join(here, "../../wire4/data"), J = (f) => JSON.parse(fs.readFileSync(path.join(D, f), "utf8"));
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3), f4 = (x) => x.toFixed(4), f0 = (x) => x.toFixed(0), pc = (x) => (100 * x).toFixed(0) + "%", sg = (x) => (x < 0 ? "−" : "+") + Math.abs(x).toFixed(4);
/* thresholds.txt: blocks headed by the mesh, rows "Re R m M C_D c bubble b | growth at each beta" */
export const TH = []; { let mesh = "", nb = -1; for (const l of fs.readFileSync(path.join(D, "thresholds.txt"), "utf8").split("\n")) { if (l.startsWith("{")) { mesh = ++nb + " " + l; continue; } const m = l.match(/^Re (\S+) m (\d) C_D (\S+) bubble (\S+) \| (.*)$/); if (m) TH.push({ mesh, Re: +m[1], m: +m[2], cd: +m[3], bubble: +m[4], g: m[5].trim().split(/\s+/).map(Number) }); } }
const blocks = [...new Set(TH.map((r) => r.mesh))], best = (r) => Math.max(...r.g), row = (b, Re, m = 0) => TH.find((r) => r.mesh === blocks[b] && r.Re === Re && r.m === m);
const cross = (rows) => { rows = rows.slice().sort((a, b) => a.Re - b.Re); for (let i = 1; i < rows.length; i++) { const a = best(rows[i - 1]), b = best(rows[i]); if (a < 0 && b >= 0) return rows[i - 1].Re + ((rows[i].Re - rows[i - 1].Re) * -a) / (b - a); } return NaN; };
const fine = TH.filter((r) => r.mesh === blocks[2]), m1 = TH.filter((r) => r.m === 1);
export const reC = cross(fine), reC1 = cross(m1);
const NS = J("nu-sphere.json").rows, ns = (Re) => NS.find((r) => r.Re === Re), nl = (Re) => J(`nl-${Re}.json`).hist.at(-1);
const heat = (t) => J(`heat-${t}.json`), axisNu = (Re) => { const d = heat(`${Re}-R5`); return d.Q[0][0] / Math.PI; };
const outNu = (Re) => { const d = heat(`${Re}-R5`), st = d.stations, i = st.findIndex((w) => Math.abs(w - 4) < 1e-9); return d.Q[0][i] / Math.PI / Math.cos((0.5 * Math.PI * 4) / 5) / axisNu(Re); };
const uni = (Re) => heat(`uni-${Re}`).H[0][0] / Math.PI / (2 * Math.PI), AN = J("anem.json").rows, an = (Lam, Re) => AN.find((r) => r.Lam === Lam && r.Re === Re);
const tube = (Re) => { const d = J(`tube-${Re}-R5.json`); return d.hist.at(-1).bub[0]; }, shear = (t) => J(`shear-${t}.json`).bub[0], PU = J("pulse-280-R10.json");
const W = (R, Lam, Re, n = 2) => wire({ R, Lam, Re, n }).at(0.5), sens = (R, Lam, Re) => Math.log(W(R, Lam, Re * 1.1).P / W(R, Lam, Re / 1.1).P) / Math.log(1.21), sphSens = (Re) => Math.log(nu(Re * 1.1) / nu(Re / 1.1)) / Math.log(1.21);
/* a cylinder in our world, for the ribbon: Collis & Williams' correlation, quoted (see REFERENCES.md) */
export const cyl = (Re) => 0.24 + 0.56 * Math.pow(Re, 0.45), cylSens = (Re) => (0.56 * 0.45 * Math.pow(Re, 0.45)) / cyl(Re);
const strip = (Lam) => { const r = AN.filter((q) => q.Lam === Lam).map((q) => wire({ R: q.R, Lam, Re: q.Re }).at(0.5).P / q.P); return [Math.min(...r), Math.max(...r)]; };
export const V = {
  reC: f0(reC), reCfine: f1(reC), reC1: f0(reC1), g188: sg(best(fine[0])), g190: sg(best(fine[1])), g192: sg(best(fine[2])), g194: sg(best(fine[3])),
  g190coarse: sg(best(row(0, 190))), g200coarse: sg(best(row(0, 200))), g190mid: sg(best(row(1, 190))), g200mid: sg(best(row(1, 200))), g190big: sg(best(row(3, 190))), g200big: sg(best(row(3, 200))),
  cd100: f3(ns(100).cd), cd200: f3(ns(200).cd), bub200: f2(row(0, 200).bubble),
  nlFat200: f2(nl(200).bub0), nlThin200: f2(nl(200).bubpi), nlFat220: f2(nl(220).bub0), nlThin220: f2(nl(220).bubpi),
  nu25: f2(ns(25).Nu), nu50: f2(ns(50).Nu), nu100: f2(ns(100).Nu), nu150: f2(ns(150).Nu), nu200: f2(ns(200).Nu), nu250: f2(ns(250).Nu), nu1: f2(nu(1)), nu10: f2(nu(10)), nuQuarter: f2(nu(0.25)),
  uni50: f3(uni(50)), uni100: f3(uni(100)), uniErr: (100 * Math.max(Math.abs(uni(50) / ns(50).Nu - 1), Math.abs(uni(100) / ns(100).Nu - 1))).toFixed(1) + "%",
  ax25: f2(axisNu(25)), ax50: f2(axisNu(50)), ax100: f2(axisNu(100)), ax150: f2(axisNu(150)), ax200: f2(axisNu(200)), ax250: f2(axisNu(250)), out200: f2(outNu(200)),
  tube150: f2(tube(150)), tube200: f2(tube(200)), tube250: f2(tube(250)), sh150: f2(shear("150-R5")), sh200: f2(shear("200-R5")), sh250: f2(shear("250-R5")), pulsePeriod: f1(PU.period), pulseLo: f2(Math.min(...PU.bub)), pulseHi: f2(Math.max(...PU.bub)),
  shortWall: pc(1 - an(3000, 100).stream), shortRise: (100 * (an(3000, 250).P / an(3000, 25).P - 1)).toFixed(0) + "%", shortP25: f1(an(3000, 25).P), shortP250: f1(an(3000, 250).P),
  stripLo30: f3(strip(30)[0]), stripLo300: f3(strip(300)[0]), stripLo3000: f4(strip(3000)[0]),
  p025: f2(W(100, 3000, 0.25).P), p1: f2(W(100, 3000, 1).P), p3: f2(W(100, 3000, 3).P), p10: f2(W(100, 3000, 10).P), p25: f2(W(100, 3000, 25).P),
  s1: f2(sens(100, 3000, 1)), s3: f2(sens(100, 3000, 3)), s10: f2(sens(100, 3000, 10)), s25: f2(sens(100, 3000, 25)), stream1: pc(W(100, 3000, 1).stream), stream10: pc(W(100, 3000, 10).stream), stream500: pc(W(250, 3000, 3).stream),
  rise: (100 * (W(100, 3000, 10).P / W(100, 3000, 0.25).P - 1)).toFixed(0) + "%", runaway: f1(wire({ R: 100, Lam: 3000, Re: 10 }).runaway() / W(100, 3000, 10).P),
  plug: f2(misread({ R: 100, Lam: 3000, Re: 3, n: Infinity, tau: 0.5 })), n4: f2(misread({ R: 100, Lam: 3000, Re: 3, n: 4, tau: 0.5 })), plugP: f3(W(100, 3000, 3, Infinity).P / W(100, 3000, 3).P),
  sphS1: f2(sphSens(1)), sphS10: f2(sphSens(10)), cylS1: f2(cylSens(1)), cylS10: f2(cylSens(10)), cyl1: f2(cyl(1)), cyl10: f2(cyl(10)),
};
/* the audit sheet's extra targets */
{ const L = J("ladder-200.json").rows, lg = (m, b) => L.find((r) => r.m === m && r.beta === b).growth, T = J("nu-table.json").rows, tn = (Re) => T.reduce((a, b) => (Math.abs(Math.log(b[0] / Re)) < Math.abs(Math.log(a[0] / Re)) ? b : a));
  for (const b of [0, 1, 1.5, 2, 2.5, 3, 4]) V["aL0_" + String(b).replace(".", "p")] = sg(lg(0, b)); for (const b of [0, 1.5, 2.5]) V["aL1_" + String(b).replace(".", "p")] = sg(lg(1, b));
  for (const Re of [1, 10, 25, 50, 100, 150, 200, 250]) V["aNu" + Re] = f3(ns(Re).Nu); V.aNuLow = f4(nu(0.1)); V.aNuTiny = f4(nu(0.01));
  for (const Re of [0.25, 1, 3, 10, 25]) { const r = W(100, 3000, Re), k = String(Re).replace(".", "p"); V["aP" + k] = f4(r.P); V["aS" + k] = f3(r.stream); }
  V.aP500 = f4(W(250, 3000, 3).P); V.aPshort = f2(W(5, 3000, 100).P); V.aPshortTube = f2(an(3000, 100).P); V.aRun = f3(wire({ R: 100, Lam: 3000, Re: 10 }).runaway()); V.aPlugP = f4(W(100, 3000, 3, Infinity).P); V.aN4P = f4(W(100, 3000, 3, 4).P);
  V.aCd1 = f2(ns(1).cd); V.aCd10 = f3(ns(10).cd); V.aCd50 = f3(ns(50).cd); V.aCd250 = f3(ns(250).cd);
  for (const Re of [25, 50, 100, 150, 200, 250]) V["aTube" + Re] = f2(tube(Re)); for (const [Lam, Re] of [[30, 100], [300, 100], [3000, 25], [3000, 250], [0, 100]]) V[`aAn${Lam}_${Re}`] = f3(an(Lam, Re).P); }
/* audit finding F04: two profiles with the same line average (the developed parabola and a uniform 2/3) read differently */
{ const same = (Re) => 1 - wire({ R: 100, Lam: 3000, Re, U: () => 2 / 3 }).at(0.5).P / W(100, 3000, Re).P; V.same3 = (100 * same(3)).toFixed(1) + "%"; V.same10 = (100 * same(10)).toFixed(1) + "%"; V.annulus = (2 / Math.log(200)).toFixed(2); }
export function fill(text, vals = V) { const missing = []; return { out: text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vals ? vals[k] : (missing.push(k), m))), missing }; }
if (process.argv[1] && process.argv[1].endsWith("values.mjs")) console.log(V);
