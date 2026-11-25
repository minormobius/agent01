/* The second generation, a first look (the 4D metals route; papers/p2): a Sun analogue built with the first generation's
   metals, against the same star built primordial, all from evolve.mjs four … gen2=<held|rock> Z2=<Z> parts=<seeds,kappa>
   tmax=<Gyr> (the composition's seeds and the opacity's factor each on alone, then both). Per case: the zero-age star (L,
   R, Teff, Tc, the stirred core) over the primordial one's, and how much central hydrogen it burns over the run, over
   the primordial's (its early pace; not yet a life).
     node four/fusion/tools/gen2.mjs <dir of evolve-four-…-to<t>.json>   → papers/p2/data/gen2.json */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const dir = process.argv[2], files = readdirSync(dir).filter((f) => /^evolve-four-.*-lp(-g2\w+-Z[\d.]+-\w+)?-to[\d.]+\.json$/.test(f));
const base = files.find((f) => !f.includes("-g2")); if (!base) throw new Error("gen2: no primordial run (…-lp-to<t>.json) beside the cases");
const read = (f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8")), P = read(base), [, G, s, m] = base.match(/^evolve-four-([^-]+e-\d+)-([\d.]+)-([\d.]+)-lp/);
const zams = (j) => j.track[0], burnt = (j) => j.track[0].Xc - j.track.at(-1).Xc, P0 = zams(P), dP = burnt(P), tEnd = P.track.at(-1).tGyr;
const cases = files.filter((f) => f !== base).map((f) => { const [, mix, Z, parts] = f.match(/-g2(\w+)-Z([\d.]+)-(\w+)-to/), j = read(f), z = zams(j);
  if (Math.abs(j.track.at(-1).tGyr - tEnd) > 1e-6) throw new Error(`gen2: ${f} ran to ${j.track.at(-1).tGyr} Gyr, the primordial to ${tEnd}`);
  return { mix, Z: +Z, seeds: parts.includes("s"), kappa: parts.includes("k"), L: +(z.L / P0.L).toFixed(4), R: +(z.R / P0.R).toFixed(4), Teff: +(z.Teff / P0.Teff).toFixed(4), Tc: +(z.Tc / P0.Tc).toFixed(4), qcc: +z.qcc.toFixed(3), burnt: +(burnt(j) / dP).toFixed(4) }; });
cases.sort((a, b) => a.mix.localeCompare(b.mix) || +b.seeds - +a.seeds || +a.kappa - +b.kappa);
writeFileSync(new URL("../../papers/p2/data/gen2.json", import.meta.url), JSON.stringify({ about: "fusion/tools/gen2.mjs: a second-generation 4D Sun analogue against the primordial one. Ratios to the primordial star at zero age (L, R, Teff, Tc), its stirred core qcc (primordial qcc0), and burnt: the central hydrogen burnt over the run over the primordial's (the early pace). mix held: the analogue's own held ash (ash4.json); rock: elements 13–23 evenly; band: the heavy equilibrium band exploding cores return (nse4.json postDecay, elements 113–125; its mass, with seeds, in the network's inert top species). seeds: the mix in the starting composition; kappa: the mix's opacity factor.", G: +G, s: +s, m: +m, runGyr: tEnd, qcc0: +P0.qcc.toFixed(3), cases }, null, 1));
for (const c of cases) console.log(`${c.mix} ${c.seeds ? "seeds" : ""}${c.seeds && c.kappa ? "+" : ""}${c.kappa ? "opacity" : ""}: L ×${c.L} R ×${c.R} Teff ×${c.Teff} Tc ×${c.Tc} core ${c.qcc} (primordial ${P0.qcc.toFixed(3)}); early burning ×${c.burnt}`);
