/* What the aged first generation has made (the 4D metals route, step two; papers/p2): for each 4D Sun analogue aged with
   the charge law's plasma (evolve.mjs four … -lp, finished or cut, the further record of each as ages4.mjs takes it),
   its last kept profile (41 shells in q, every species above 10⁻³ by mass) integrated over the star's mass, element by
   element: the share of the star's mass that is hydrogen, helium and each element made (isotopes summed), and the
   stirred core's own make-up. What a star returns to the gas, by winds or by its end, is the next step; this is what it
   holds when the run ends.
     node four/fusion/tools/ash4.mjs <dir of evolve-four-*-lp*.json>   → papers/p2/data/ash4.json */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const dir = process.argv[2], recs = new Map();
for (const f of readdirSync(dir).filter((x) => /^evolve-four-.*-lp(\.ckpt)?\.json$/.test(x))) { const key = f.replace(".ckpt", ""), j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), end = j.track?.at(-1)?.tGyr ?? -1, o = recs.get(key);
  if (!o || end > o.end + 1e-9 || (Math.abs(end - o.end) <= 1e-9 && !f.includes("ckpt"))) recs.set(key, { f, j, end }); }
const byZ = (row) => { const o = {}; for (const [k, v] of Object.entries(row)) { const m = k.match(/^(\d+)-\d+$/); if (m) o[m[1]] = (o[m[1]] ?? 0) + v; } return o; };
const stars = [];
for (const [key, { f, j }] of recs) {
  const [, G, s, m] = key.match(/^evolve-four-([^-]+e-\d+)-([\d.]+)-([\d.]+)-lp\.json$/) ?? []; if (!G) continue;
  const P = j.profiles?.at(-1), T = j.track; if (!P || !T?.length || T.at(-1).Xc >= 0.7499) continue;
  const rows = P.rows, Z = new Set(rows.flatMap((r) => Object.keys(byZ(r)))), made = {};
  for (const z of Z) { let s2 = 0; for (let i = 1; i < rows.length; i++) { const a = byZ(rows[i - 1])[z] ?? 0, b = byZ(rows[i])[z] ?? 0; s2 += 0.5 * (a + b) * (rows[i].q - rows[i - 1].q); } made[z] = +s2.toFixed(5); }
  const core = rows.filter((r) => r.stir === 1 && r.q < 0.6), qcc = core.length ? core.at(-1).q : 0, c0 = byZ(rows[0]);
  const heavy = Object.entries(made).filter(([z]) => +z >= 3).sort((a, b) => b[1] - a[1]);
  stars.push({ G: +G, s: +s, m: +m, tGyr: +P.tGyr.toFixed(2), runEndGyr: +T.at(-1).tGyr.toFixed(2), Xc: +T.at(-1).Xc.toFixed(4), state: f.includes("ckpt") ? "cut" : j.stopped,
    made, heavyShare: +heavy.reduce((t, [, v]) => t + v, 0).toFixed(5), lead: heavy.slice(0, 3).map(([z, v]) => [+z, v]), qcc: +qcc.toFixed(3), centre: Object.fromEntries(Object.entries(c0).map(([z, v]) => [z, +v.toFixed(4)])) });
}
stars.sort((a, b) => b.G - a.G || a.s - b.s || a.m - b.m);
// the analogues: the star at each (G, s) whose mass is gravity.json's Sun analogue (the mass ladders at G 1e-17 are not)
const SUNS = JSON.parse(readFileSync(new URL("../../papers/p2/data/gravity.json", import.meta.url), "utf8")).runs.filter((r) => r.sun), isAnalogue = (x) => SUNS.some((r) => r.G === x.G && r.s === x.s && Math.abs(x.m / r.sun.m - 1) < 0.01);
const analogues = stars.filter(isAnalogue), byS = {};
for (const x of analogues) (byS[x.s] ??= []).push({ G: x.G, heavyShare: x.heavyShare, lead: x.lead, tGyr: x.tGyr, Xc: x.Xc });
writeFileSync(new URL("../../papers/p2/data/ash4.json", import.meta.url), JSON.stringify({ about: "fusion/tools/ash4.mjs: what each aged 4D analogue (and the G 1e-17 s 1.5152 ladder) holds at its last kept profile, element by element as shares of the star's mass (made: Z → share; heavyShare: elements ≥ 3 together; lead: the three largest), the stirred core's extent qcc and the centre's make-up by element. Profiles are kept at 90%, 80%, … 10%, 1% of the centre's hydrogen and at the run's end; a cut run's last profile can lag its track's end (tGyr against runEndGyr).", byS, stars }, null, 1));
for (const x of stars) console.log(`G ${x.G} s ${x.s} m ${x.m}: at ${x.tGyr} Gyr (run to ${x.runEndGyr}, Xc ${x.Xc}): elements ≥ 3 ${(100 * x.heavyShare).toFixed(2)}% of the star — ${x.lead.map(([z, v]) => `${z}: ${(100 * v).toFixed(2)}%`).join(", ")}; core q ${x.qcc}`);
