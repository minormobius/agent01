/* The 4D Sun analogues' lives, aged (papers/p2 section 4, supplement S1's ageing stage): from evolve.mjs four runs with
   the charge law's plasma (files -lp: screening under the pinned 1/r and the lens vacuum's opacity cutoff), finished or
   cut (checkpoints), the time the centre takes to burn half its hydrogen, and to 10⁻³ where reached.
     node four/fusion/tools/ages4.mjs <dir of evolve-four-*-lp*.json> [run names…]   → papers/p2/data/ages4.json
   Section 3's convention gave every analogue a half-life of 4.6 Gyr (ours'). */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const [dir, ...runs] = process.argv.slice(2), seen = new Set(), stars = [];
const at = (T, x) => { for (let i = 1; i < T.length; i++) if (T[i].Xc <= x && T[i - 1].Xc > x) { const a = T[i - 1], b = T[i]; return a.tGyr + ((b.tGyr - a.tGyr) * (a.Xc - x)) / (a.Xc - b.Xc); } return null; };
// a run's finished file and its checkpoint: take whichever reached further (a run resumed after it once "stopped" leaves
// the old finished file behind, its checkpoint ahead)
const recs = new Map(); for (const f of readdirSync(dir).filter((x) => /^evolve-four-.*-lp(\.ckpt)?\.json$/.test(x))) { const key = f.replace(".ckpt", ""), j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), end = j.track?.at(-1)?.tGyr ?? -1, o = recs.get(key);
  if (!o || end > o.end + 1e-9 || (Math.abs(end - o.end) <= 1e-9 && !f.includes("ckpt"))) recs.set(key, { f, end }); } // a tie: the finished file says how it ended
for (const { f } of recs.values()) {
  const key = f.replace(".ckpt", ""); if (seen.has(key)) continue; seen.add(key);
  const [, G, s, m] = key.match(/^evolve-four-([^-]+e-\d+)-([\d.]+)-([\d.]+)-lp\.json$/) ?? []; if (!G) continue;
  const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), T = j.track; if (!T?.length || T.at(-1).Xc >= 0.7499) continue;
  const X0 = T[0].Xc, half = at(T, X0 / 2), last = T.at(-1);
  // a run that stopped with no solution: how its last Gyr went (the stirred core's peak against its end, the centre's
  // density and temperature over the same span), so the text can say what the solver couldn't follow
  const stall = /no solution/.test(j.stopped ?? "") ? (() => { const W = T.filter((r) => r.tGyr >= last.tGyr - 1), pk = W.reduce((a, b) => (b.qcc > a.qcc ? b : a));
    // and what the centre holds by mass when it stops: hydrogen, helium, and the ash by element (Z from "Z-A")
    const byZ = {}; for (const [k, v] of Object.entries(last.centre ?? {})) { const z = k.split("-")[0]; byZ[z] = (byZ[z] ?? 0) + v; }
    return { qccPeak: +pk.qcc.toFixed(3), qccEnd: +last.qcc.toFixed(3), overGyr: +(last.tGyr - pk.tGyr).toFixed(2), rhoUp: +(last.rhoc / pk.rhoc).toFixed(3), TcDown: +(last.Tc / pk.Tc).toFixed(3), LUp: +(last.L / pk.L).toFixed(3),
      short: half ? 0 : +((last.Xc - X0 / 2) / (X0 / 2)).toFixed(4), centre: Object.fromEntries(Object.entries(byZ).map(([z, v]) => [z, +v.toFixed(4)])) }; })() : undefined;
  stars.push({ G: +G, s: +s, m: +m, half: half && +half.toFixed(2), halfAfter: half ? null : +last.tGyr.toFixed(1), exhaust: at(T, 1e-3) && +at(T, 1e-3).toFixed(1), lastGyr: +last.tGyr.toFixed(1), lastXc: +last.Xc.toFixed(4), Tc0: +(T[0].Tc / 1e6).toFixed(2), state: f.includes("ckpt") ? "cut" : j.stopped ?? "ended", ...(stall ? { stall } : {}) });
}
stars.sort((a, b) => b.G - a.G || a.s - b.s || a.m - b.m);
// the analogues: the star at each (G, s) whose mass is gravity.json's Sun analogue (the mass ladders at G 1e-17 are not)
const SUNS = JSON.parse(readFileSync(new URL("../../papers/p2/data/gravity.json", import.meta.url), "utf8")).runs.filter((r) => r.sun), isAnalogue = (x) => SUNS.some((r) => r.G === x.G && r.s === x.s && Math.abs(x.m / r.sun.m - 1) < 0.01);
// a ladder star's "no solution" stop is kept as stop, not stall: the stall record is the analogues' (section 4's)
for (const x of stars) if (x.stall && !isAnalogue(x)) { x.stop = x.stall; delete x.stall; }
const analogues = stars.filter(isAnalogue), halves = analogues.filter((x) => x.half).map((x) => x.half);
// every Sun analogue gravity.json holds (the four G × eight s, less those with none), and which of them aren't aged here
const GR = JSON.parse(readFileSync(new URL("../../papers/p2/data/gravity.json", import.meta.url), "utf8")).runs.filter((r) => r.sun && [1e-11, 1e-14, 1e-17, 1e-20].includes(r.G));
const notAged = GR.filter((r) => !analogues.some((x) => x.G === r.G && x.s === r.s)).map((r) => `${r.G}/${r.s}`);
const out = { about: "fusion/tools/ages4.mjs: the 4D Sun analogues (and the G 1e-17 s 1.5152 mass ladder) aged with the charge law's plasma; half = Gyr for the centre's hydrogen to halve (null if not yet: then halfAfter is the age reached), exhaust = Gyr to Xc 1e-3. Section 3's convention: 4.6 Gyr.", runs, convention: 4.6,
  summary: { inGravity: GR.length, notAged, analogues: analogues.length, halved: halves.length, halfMin: Math.min(...halves), halfMax: Math.max(...halves), notHalved: analogues.filter((x) => !x.half).map((x) => `${x.G}/${x.s}`) }, stars };
writeFileSync(new URL("../../papers/p2/data/ages4.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary)); for (const x of stars) console.log(`${x.G} ${x.s} ${x.m}: half ${x.half ?? `> ${x.halfAfter}`} Gyr, exhausted ${x.exhaust ?? "-"} (${x.state})`);
