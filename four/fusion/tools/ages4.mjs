/* The 4D Sun analogues' lives, aged (papers/p2 section 4, supplement S1's ageing stage): from evolve.mjs four runs with
   the charge law's plasma (files -lp: screening under the pinned 1/r and the lens vacuum's opacity cutoff), finished or
   cut (checkpoints), the time the centre takes to burn half its hydrogen, and to 10⁻³ where reached.
     node four/fusion/tools/ages4.mjs <dir of evolve-four-*-lp*.json> [run names…]   → papers/p2/data/ages4.json
   Section 3's convention gave every analogue a half-life of 4.6 Gyr (ours'). */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const [dir, ...runs] = process.argv.slice(2), seen = new Set(), stars = [];
const at = (T, x) => { for (let i = 1; i < T.length; i++) if (T[i].Xc <= x && T[i - 1].Xc > x) { const a = T[i - 1], b = T[i]; return a.tGyr + ((b.tGyr - a.tGyr) * (a.Xc - x)) / (a.Xc - b.Xc); } return null; };
for (const f of readdirSync(dir).filter((x) => /^evolve-four-.*-lp(\.ckpt)?\.json$/.test(x)).sort((a, b) => a.includes("ckpt") - b.includes("ckpt"))) {
  const key = f.replace(".ckpt", ""); if (seen.has(key)) continue; seen.add(key);
  const [, G, s, m] = key.match(/^evolve-four-([^-]+e-\d+)-([\d.]+)-([\d.]+)-lp\.json$/) ?? []; if (!G) continue;
  const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), T = j.track; if (!T?.length || T.at(-1).Xc >= 0.7499) continue;
  const X0 = T[0].Xc, half = at(T, X0 / 2), last = T.at(-1);
  stars.push({ G: +G, s: +s, m: +m, half: half && +half.toFixed(2), halfAfter: half ? null : +last.tGyr.toFixed(1), exhaust: at(T, 1e-3) && +at(T, 1e-3).toFixed(1), lastGyr: +last.tGyr.toFixed(1), lastXc: +last.Xc.toFixed(4), Tc0: +(T[0].Tc / 1e6).toFixed(2), state: f.includes("ckpt") ? "cut" : j.stopped ?? "ended" });
}
stars.sort((a, b) => b.G - a.G || a.s - b.s || a.m - b.m);
const analogues = stars.filter((x) => !(x.G === 1e-17 && x.s === 1.5152 && Math.abs(x.m - 0.7812) > 0.01)), halves = analogues.filter((x) => x.half).map((x) => x.half);
const out = { about: "fusion/tools/ages4.mjs: the 4D Sun analogues (and the G 1e-17 s 1.5152 mass ladder) aged with the charge law's plasma; half = Gyr for the centre's hydrogen to halve (null if not yet: then halfAfter is the age reached), exhaust = Gyr to Xc 1e-3. Section 3's convention: 4.6 Gyr.", runs, convention: 4.6,
  summary: { analogues: analogues.length, halved: halves.length, halfMin: Math.min(...halves), halfMax: Math.max(...halves), notHalved: analogues.filter((x) => !x.half).map((x) => `${x.G}/${x.s}`) }, stars };
writeFileSync(new URL("../../papers/p2/data/ages4.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary)); for (const x of stars) console.log(`${x.G} ${x.s} ${x.m}: half ${x.half ?? `> ${x.halfAfter}`} Gyr, exhausted ${x.exhaust ?? "-"} (${x.state})`);
