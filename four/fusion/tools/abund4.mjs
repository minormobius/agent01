/* What the first 4D stars give back, element by element, beside our Sun's metals: the data behind
   four.mino.mobi/abundance/. From
     · papers/p2/data/yields4.json (yields4.mjs): the net yield p and its make-up at every strength and declared choice
       (unburnt ash by element; the explosions' rock row by the ash element that burnt to it, `rockBy`; their iron);
     · nuclei.mjs heavy (atom/js/nucleidata.js): what each ash element makes fusing with itself (`rows[].per[].end`, one
       product per liquid drop), and equilibrium's end, the most tightly bound nucleus of each drop (`peaks`);
     · papers/p2/data/solar.json (solar.mjs): Asplund et al. 2009's solar mixture as mass fractions.
   Declared here, and said on the page:
     · an ash element burnt to the rock row becomes heavy's product of it fusing with itself, shared equally over the
       drops' products; an element heavy has no row for takes its nearest row's products moved by twice the difference
       in Z (a tie, both: between rows, element 15; past them, elements below 8, counted as `extrapolated`);
     · "iron", the share burnt to equilibrium, is spread as papers/p2/data/nse4.json's `postDecay` (nse4.mjs: 4D nuclear
       statistical equilibrium on the Minnesota drop at s 1.5152, the network's force at our strength, at the exploding
       core's density and a declared freeze-out, each mass number then β-decayed to its stable charge: 80% within
       elements ~116–122). It had sat on one nucleus, the drop's most bound (element 137, mass 274): equilibrium makes a
       band, and proton-rich. No equilibrium was computed at the other strengths, where it is a small share (≤ 12% of p
       from s 1.6 up); the same band is used there. The liquid drop's reach is the larger uncertainty (dropcheck.json:
       the N = Z peak at A 192–356 over the surface thickness).
     node four/fusion/tools/abund4.mjs   → four/abundance/data.js */
import { readFileSync, writeFileSync } from "node:fs";
import { NUCLEI } from "../../atom/js/nucleidata.js";
const J = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const Y = J("../../papers/p2/data/yields4.json"), SUN = J("../../papers/p2/data/solar.json"), H = NUCLEI.heavy, NSE = J("../../papers/p2/data/nse4.json");

// each ash element's rock-row products: { product Z: share }
const rowOf = {}; for (const r of H.rows) { const n = {}; for (const p of r.per) n[p.end.Z] = (n[p.end.Z] ?? 0) + 1 / r.per.length; rowOf[r.Z] = n; }
const zs = Object.keys(rowOf).map(Number);
const productsOf = (Z) => { if (rowOf[Z]) return rowOf[Z]; const d = Math.min(...zs.map((z) => Math.abs(z - Z))), near = zs.filter((z) => Math.abs(z - Z) === d), out = {};
  for (const z of near) for (const [pz, v] of Object.entries(rowOf[z])) { const q = +pz + 2 * (Z - z); out[q] = (out[q] ?? 0) + v / near.length; } return out; };
const peak = H.peaks.find((p) => p.f === "MN" && Math.abs(p.s - 1.5152) < 1e-6), PEAK = { Z: peak.Z, A: peak.A, perNucleon: +peak.ba.toFixed(2), range: [Math.min(...H.peaks.map((p) => p.Z)), Math.max(...H.peaks.map((p) => p.Z))],
  drops: H.peaks.map((p) => ({ force: p.f, s: p.s, Z: p.Z, A: p.A })),
  // where the equilibrium share ends up (nse4.json): by element after decay, and the band before and after
  spread: NSE.postDecay, band: { before: [Math.min(...NSE.runs.map((r) => r.band80[0])), Math.max(...NSE.runs.map((r) => r.band80[1]))], after: [Math.min(...NSE.runs.map((r) => r.afterDecay.band80[0])), Math.max(...NSE.runs.map((r) => r.afterDecay.band80[1]))] },
  meanZ: +(NSE.runs.reduce((t, r) => t + r.afterDecay.meanZ, 0) / NSE.runs.length).toFixed(1), massRange: NSE.massRange, decayMeV: +(NSE.runs.reduce((t, r) => t + r.decayMeVperNucleon, 0) / NSE.runs.length).toFixed(2) };

const yields = Y.yields.map((y) => { const by = {}, add = (z, v) => { if (v > 0) by[z] = (by[z] ?? 0) + v; };
  for (const [k, v] of Object.entries(y.mix)) if (/^\d+$/.test(k)) add(+k, v);
  const rb = y.rockBy ?? {}, rbt = Object.values(rb).reduce((t, v) => t + v, 0), rock = y.mix.rock ?? 0;
  for (const [src, v] of Object.entries(rb)) for (const [pz, sh] of Object.entries(productsOf(+src))) add(+pz, rbt > 0 ? (rock * v * sh) / rbt : 0);
  for (const [z, sh] of Object.entries(PEAK.spread)) add(+z, (y.mix.iron ?? 0) * sh);
  const tot = Object.values(by).reduce((t, v) => t + v, 0), ex = Object.entries(rb).filter(([z]) => +z < Math.min(...zs) || +z > Math.max(...zs)).reduce((t, [, v]) => t + v, 0); // past heavy's rows, not between them
  return { s: y.s, alpha: y.alpha, g: y.g, w: y.w, f: y.f, tg: y.tg, p: y.p, groups: { ash: +(1 - (y.mix.rock ?? 0) - (y.mix.iron ?? 0)).toFixed(4), rock: +(rock).toFixed(4), peak: +(y.mix.iron ?? 0).toFixed(4), extrapolated: +(rbt > 0 ? (rock * ex) / rbt : 0).toFixed(4) },
    by: Object.fromEntries(Object.entries(by).sort((a, b) => a[0] - b[0]).map(([z, v]) => [z, +(v / tot).toFixed(5)])),
    ash: Object.fromEntries(Object.entries(y.mix).filter(([k]) => /^\d+$/.test(k)).map(([z, v]) => [z, +(v / tot).toFixed(5)])) }; });
const sun = SUN.elements.filter((e) => e.Z >= 3).map((e) => [e.Z, e.ofZ]);
const products = Object.fromEntries([...new Set(Y.yields.flatMap((y) => Object.keys(y.rockBy ?? {})))].map(Number).sort((a, b) => a - b).map((z) => [z, Object.fromEntries(Object.entries(productsOf(z)).map(([k, v]) => [k, +v.toFixed(3)]))]));
const data = { about: "generated by four/fusion/tools/abund4.mjs from papers/p2/data/yields4.json, nse4.json, solar.json and nucleidata.js (heavy); do not edit",
  G: Y.G ?? 1e-17, peak: PEAK, nse: { drop: NSE.drop, rhoIgnition: NSE.rhoIgnition, f: NSE.f, T: NSE.T }, products, rows: zs, sun: { bulk: SUN.bulk, ofZ: Object.fromEntries(sun) }, yields };
const js = `// ${data.about}\nexport const ABUND = ${JSON.stringify(data)};\n`;
writeFileSync(new URL("../../abundance/data.js", import.meta.url), js);
const mid = yields.find((y) => y.s === 1.5152 && y.alpha === 2.35 && y.g === 1.25 && y.w === 0.03 && y.f === 100 && y.tg === 10);
const top = Object.entries(mid.by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([z, v]) => `${z} ${(100 * v).toFixed(1)}%`);
console.log(`${yields.length} choices, ${(js.length / 1024).toFixed(0)} kB; rock-row products ${JSON.stringify(products)}; s 1.5152 middle: p ${mid.p}, ${top.join(", ")}`);
