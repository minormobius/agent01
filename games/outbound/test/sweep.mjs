/* Parameter sweep for Outbound.
 *
 * This exists because I tuned this game by feel four times and made it worse
 * three of them. Raising the fuel budget to make burning a real option raised
 * the share of decisions with no wrong answer from 35% to 65%; the "obvious"
 * fix of a cheap layover quietly deleted the irreversibility the whole game is
 * about. Neither was visible without measuring, and both looked like
 * improvements while I was making them.
 *
 * So: walk the space, and report for each setting the two numbers that actually
 * matter — how often a decision has a wrong answer, and whether the spread
 * between careless and careful play survives.
 *
 * Run:  node games/outbound/test/sweep.mjs [hauls]
 */
import { loadOutbound, playHaul } from "./harness.mjs";
import { quantile, section, pct, BANDS_NARROW, bandReport } from "../../../packages/pressure-lab/lab.mjs";

const O = await loadOutbound();
const N = parseInt(process.argv[2] || "16", 10);
const BASE = { ...O.CFG };

/* One candidate setting, scored. `free` is the headline: the share of hauls
   where a perfect crossing never once had to avoid a wrong answer. */
function score(patch) {
  Object.assign(O.CFG, BASE, patch);
  const mins = [];
  for (const leg of [2, 4, 6, 8]) {
    for (let i = 0; i < N; i++) {
      const s = O.buildLeg(`sw-${leg}-${i}`, leg, O.CFG.startFuel, O.CFG.maxFuel, null);
      mins.push(O.narrowest(s));
    }
  }
  const seeds = Array.from({ length: 24 }, (_, i) => `sw-${i}`);
  const legsOf = (p) => {
    const xs = seeds.map((s) => playHaul(O, s, p, 10).legs).sort((a, b) => a - b);
    return quantile(xs, 0.5);
  };
  const eager = legsOf("eager"), careful = legsOf("careful"), miser = legsOf("miser");
  const buried = seeds.reduce((a, s) => a + playHaul(O, s, "careful", 10).buried, 0) / seeds.length;
  return {
    free: mins.filter((m) => m > 0.75).length / mins.length,
    narrow: mins.filter((m) => m <= 0.5).length / mins.length,
    mins, eager, careful, miser, buried,
    // The mechanic is alive only if careful play beats careless play AND
    // careless play still gets somewhere. A setting where everything dies at
    // leg 1 is "hard", not good.
    gap: careful - eager,
  };
}

const AXES = {
  maxStrain: [2, 3, 4],
  crewSize: [4, 5, 6],
  refuelPerLeg: [3, 5, 6, 8],
  baseStages: [5, 7, 9],
  restCost: [2, 3, 4],
};

console.log(`\nOutbound — parameter sweep, ${N} hauls per leg per setting\n`);
console.log("  'free' = decisions with no wrong answer (want LOW)");
console.log("  'gap'  = careful minus eager, in legs (want POSITIVE)\n");

for (const [axis, values] of Object.entries(AXES)) {
  console.log(section(`${axis}  (base ${BASE[axis]})`));
  console.log("    value   free   narrow   eager  careful  miser   gap   buried");
  console.log("    " + "─".repeat(60));
  for (const v of values) {
    const r = score({ [axis]: v });
    console.log(
      `  ${String(v).padStart(7)}  ${pct(r.free)}  ${pct(r.narrow)}   ` +
      `${r.eager.toFixed(1).padStart(5)}  ${r.careful.toFixed(1).padStart(7)}  ${r.miser.toFixed(1).padStart(5)}  ` +
      `${(r.gap >= 0 ? "+" : "") + r.gap.toFixed(1)}`.padStart(6) +
      `  ${r.buried.toFixed(1).padStart(6)}`
    );
  }
}

Object.assign(O.CFG, BASE);
const base = score({});
console.log(section("the current setting, in full"));
console.log(bandReport(base.mins, { bands: BANDS_NARROW }).text);
console.log(`  eager ${base.eager.toFixed(1)} · careful ${base.careful.toFixed(1)} · ` +
  `miser ${base.miser.toFixed(1)} legs · careful play buries ${base.buried.toFixed(1)} people\n`);
