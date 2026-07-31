/* Difficulty report for The Ratchet.
 *
 * Built on packages/pressure-lab, which owns the parts every game in this
 * family needs — policy spreads, tightness bands, distributions, and the
 * warnings for the traps all three games fell into. What stays here is the only
 * part that is actually about this game: what "correct" means (does any future
 * still complete the road) and the FORESIGHT gap, which is the number this game
 * exists for.
 *
 * Run:  node games/ratchet/test/analysis.mjs [routesPerLevel]
 */
import { loadRatchet, playRoute, playRun, POLICIES } from "./harness.mjs";
import {
  quantile, summary, histogram, bandReport, spread, pool,
  section, warnings, pct, BANDS_NARROW,
} from "../../../packages/pressure-lab/lab.mjs";

const R = await loadRatchet();
const N = parseInt(process.argv[2] || "60", 10);
const LEVELS = [1, 2, 3, 4, 5, 6, 8];

console.log(`\nThe Ratchet — ${N} routes per level\n`);

console.log(section("the opening choice"));
console.log("  lvl  stages  kit  options  keep it alive        completable");
console.log("  " + "─".repeat(62));
for (const level of LEVELS) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const s = R.buildRoute(`an-${i}`, level, R.START_SUPPLY, R.MAX_SUPPLY);
    rows.push({ ...R.rate(s), stages: s.stages.length, kit: R.kitTotal(s.kit) });
  }
  const t = rows.map((r) => r.tightness);
  console.log(
    `  ${String(level).padStart(3)}  ` +
    `${(rows.reduce((a, r) => a + r.stages, 0) / N).toFixed(1).padStart(6)}  ` +
    `${(rows.reduce((a, r) => a + r.kit, 0) / N).toFixed(1).padStart(3)}  ` +
    `${(rows.reduce((a, r) => a + r.legal, 0) / N).toFixed(1).padStart(7)}  ` +
    `${pct(quantile(t, 0.1))} ${pct(quantile(t, 0.5))} ${pct(quantile(t, 0.9))}  ` +
    `${pct(rows.filter((r) => r.completable).length / N).padStart(12)}`
  );
}

/* A route's OPENING is meant to be forgiving; the squeeze is supposed to arrive
   later, when the kit is thin and the road is not. Measuring the first choice
   said every road was trivial, which was true and useless. The honest measure
   is the narrowest choice along a perfect crossing. */
console.log(section("the narrowest choice on a perfect crossing"));
console.log("  lvl   min tightness (p10 / median / p90)   routes with a genuine fork");
console.log("  " + "─".repeat(66));
const allMins = [];
const deepMins = [];   // levels 4+ only — see the band report below
for (const level of LEVELS) {
  const mins = [];
  for (let i = 0; i < N; i++) {
    let s = R.buildRoute(`nw-${i}`, level, R.START_SUPPLY, R.MAX_SUPPLY);
    const memo = R.newMemo();
    let min = 1, guard = 0;
    while (s.phase === "travel" && guard++ < 60) {
      const a = R.analyseChoice(s, memo);
      if (a.legal > 1) min = Math.min(min, a.tightness);
      const good = a.options.filter((o) => o.viable);
      if (!good.length) break;
      const next = R.cloneState(s);
      R.applyAction(next, good[0].action);
      s = next;
    }
    mins.push(min);
  }
  allMins.push(...mins);
  if (level >= 4) deepMins.push(...mins);
  console.log(
    `  ${String(level).padStart(3)}   ` +
    `${pct(quantile(mins, 0.1))} ${pct(quantile(mins, 0.5))} ${pct(quantile(mins, 0.9))}` +
    `${pct(mins.filter((m) => m <= 0.5).length / mins.length).padStart(34)}`
  );
}

/* Narrow bands, because a choice here has ~5 options and not Telegraph's ~700 —
   at five options the smallest non-zero tightness is 20% and every wide band
   below "fair" is unreachable.

   And levels 4+ only. Routes 1-3 are deliberately gentle, so pooling them with
   deep routes reports half the game as asking nothing — which is the exact
   "pooling incomparable populations" trap this library warns about, committed
   against itself. */
const bands = bandReport(deepMins, { bands: BANDS_NARROW });
console.log(section("where the narrowest choice lands, routes 4+"));
console.log(bands.text);

console.log(section("how far the policies get"));
const seeds = Array.from({ length: 60 }, (_, i) => `run-${i}`);
const depth = spread({
  seeds,
  policies: Object.fromEntries(["hoarder", "eager", "thrifty", "optimal"].map((p) => [p, p])),
  play: (seed, policyName) => playRun(R, seed, policyName, 12).routes,
  control: "hoarder",
  label: "routes",
});
console.log(depth.text);

/* The number this game exists for: how many stages a run keeps going after it
   has already become unwinnable. */
console.log(section("FORESIGHT — stages walked after the run was already lost"));
const byPolicy = {};
for (const policy of ["hoarder", "eager", "thrifty"]) {
  const gaps = [];
  for (let i = 0; i < 220; i++) {
    const level = 1 + (i % 7);
    const s = R.buildRoute(`fs-${i}`, level, R.START_SUPPLY, R.MAX_SUPPLY);
    const out = playRoute(R, s, policy, R.newMemo());
    if (out.foresight !== null) gaps.push(out.foresight);
  }
  byPolicy[policy] = gaps;
  const g = summary(gaps);
  console.log(`  ${policy.padEnd(8)} ${String(gaps.length).padStart(3)} failed runs · ` +
    `median ${g.p50.toFixed(1)} stages · p90 ${g.p90.toFixed(1)} · max ${g.max}`);
}

const realistic = pool(byPolicy, ["eager", "thrifty"],
  "hoarder fails by running dry, so its gap is 0 by construction");
console.log("\n  " + realistic.note);
console.log(histogram(realistic.values, {
  label: (k) => (k === 0 ? "died on the fatal move" : `${k} stage${k > 1 ? "s" : ""} later`),
}));

console.log(section("a sample route"));
{
  const s = R.buildRoute("an-3", 4, R.START_SUPPLY, R.MAX_SUPPLY);
  console.log(`  seed an-3, route 4 · supply ${s.supply}/${s.maxSupply} · ` +
    `kit ${R.kitList(s.kit).map((t) => R.TOOLS[t].name).join(", ")}`);
  s.stages.forEach((st, i) => {
    const o = R.OBSTACLES[st.kind];
    console.log(`   ${String(i + 1).padStart(2)}. ${o.name.padEnd(16)} toll ${st.toll}  ` +
      `solved by ${o.accepts.map((t) => R.TOOLS[t].name).join(" or ")}` +
      (st.reward ? `   ⟶ cache: ${R.TOOLS[st.reward].name}` : ""));
  });
  const a = R.rate(s);
  console.log(`\n  opening: ${a.viable} of ${a.legal} options keep this route completable`);
}

const w = warnings(bands, depth);
if (w) console.log(w);
console.log("");
