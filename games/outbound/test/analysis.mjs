/* Difficulty report for Outbound.
 *
 * Built on packages/pressure-lab, like the rest of the family. What stays here
 * is the part that is only about this game.
 *
 * Outbound differs from The Ratchet in one way that changes what you can even
 * measure: **the crew persist across legs and the fuel refills.** In The
 * Ratchet a route was self-contained, so a route was the unit of tragedy. Here
 * a single fresh leg is nearly always survivable — the wear that kills you was
 * bought three systems ago, on a different leg, by a decision that looked free.
 * So the foresight gap is measured over whole HAULS, not legs. Measuring it per
 * leg reports zero failures and reads like the game is easy; it isn't, it is
 * just slow, and slowness is the point.
 *
 * Run:  node games/outbound/test/analysis.mjs [haulsPerLeg]
 */
import { loadOutbound, playLeg, playHaul, POLICIES } from "./harness.mjs";
import {
  quantile, summary, histogram, bandReport, spread, pool,
  section, warnings, pct, BANDS_NARROW,
} from "../../../packages/pressure-lab/lab.mjs";

const O = await loadOutbound();
const N = parseInt(process.argv[2] || "60", 10);
const LEGS = [1, 2, 3, 4, 5, 6, 8];
const POLS = ["eager", "miser", "thrifty", "careful", "optimal"];

console.log(`\nOutbound — ${N} routes per leg\n`);

console.log(section("the opening choice"));
console.log("  leg  crossings  crew  blind  options  keep it alive        finishable");
console.log("  " + "─".repeat(72));
for (const n of LEGS) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const s = O.buildLeg(`an-${i}`, n, O.START_FUEL, O.MAX_FUEL, null);
    const aboard = {};
    O.alive(s).forEach((c) => { aboard[c.role] = true; });
    const blind = s.stages.filter((st) => !O.HAZARDS[st.kind].needs.some((r) => aboard[r])).length;
    rows.push({ ...O.rate(s), systems: s.stages.length, crew: O.alive(s).length, blind });
  }
  const avg = (k) => (rows.reduce((a, r) => a + r[k], 0) / N).toFixed(1);
  const t = rows.map((r) => r.tightness);
  console.log(
    `  ${String(n).padStart(3)}  ` +
    `${avg("systems").padStart(9)}  ${avg("crew").padStart(4)}  ${avg("blind").padStart(5)}  ` +
    `${avg("legal").padStart(7)}  ` +
    `${pct(quantile(t, 0.1))} ${pct(quantile(t, 0.5))} ${pct(quantile(t, 0.9))}  ` +
    `${pct(rows.filter((r) => r.completable).length / N).padStart(11)}`
  );
}

/* The opening is meant to be forgiving — the squeeze arrives later, when the
   crew is worn and the road is not. Same correction The Ratchet needed: measure
   the narrowest choice along a perfect crossing, not the first one. */
console.log(section("the narrowest choice on a perfect crossing"));
console.log("  leg   min tightness (p10 / median / p90)   routes with a genuine fork");
console.log("  " + "─".repeat(66));
const deepMins = [];   // legs 4+ only — see the band report below
for (const n of LEGS) {
  const mins = [];
  for (let i = 0; i < N; i++) {
    let s = O.buildLeg(`nw-${i}`, n, O.START_FUEL, O.MAX_FUEL, null);
    const memo = O.newMemo();
    let min = 1, guard = 0;
    while (s.phase === "travel" && guard++ < 80) {
      const a = O.analyseChoice(s, memo);
      if (a.legal > 1) min = Math.min(min, a.tightness);
      const good = a.options.filter((o) => o.viable);
      if (!good.length) break;
      const next = O.cloneState(s);
      O.applyAction(next, good[0].action);
      s = next;
    }
    mins.push(min);
  }
  if (n >= 4) deepMins.push(...mins);
  console.log(
    `  ${String(n).padStart(3)}   ` +
    `${pct(quantile(mins, 0.1))} ${pct(quantile(mins, 0.5))} ${pct(quantile(mins, 0.9))}` +
    `${pct(mins.filter((m) => m <= 0.5).length / mins.length).padStart(33)}`
  );
}

/* Narrow bands: a choice here is a handful of options, not Telegraph's ~700.
   Legs 4+ only, for the same reason The Ratchet excludes its gentle openings —
   pooling them would report half the game as asking nothing. */
const bands = bandReport(deepMins, { bands: BANDS_NARROW });
console.log(section("where the narrowest choice lands, legs 4+"));
console.log(bands.text);

console.log(section("how far the policies get"));
const seeds = Array.from({ length: 60 }, (_, i) => `haul-${i}`);
const depth = spread({
  seeds,
  policies: Object.fromEntries(POLS.map((p) => [p, p])),
  play: (seed, policyName) => playHaul(O, seed, policyName, 12).legs,
  control: "miser",
  label: "legs",
});
console.log(depth.text);

/* What each policy spends. The two resources fail differently, and a spread
   that only reported depth would hide which one each bot ran out of. */
console.log(section("what it costs them"));
console.log("  policy    legs   people buried   died of");
console.log("  " + "─".repeat(52));
for (const p of POLS) {
  const runs = seeds.map((s) => playHaul(O, s, p, 12));
  const legs = runs.map((r) => r.legs);
  const buried = runs.map((r) => r.buried);
  // Re-fly the losing leg to see which resource actually ran out.
  let dry = 0, alone = 0;
  for (const seed of seeds.slice(0, 30)) {
    let s = O.newGame(seed), guard = 0;
    while (guard++ < 20) {
      const out = playLeg(O, s, p, O.newMemo());
      if (out.phase !== "arrived") {
        if (out.fuel <= 0) dry++; else alone++;
        break;
      }
      s = O.nextLeg(out.state);
    }
  }
  console.log(`  ${p.padEnd(9)} ${quantile(legs.slice().sort((a, b) => a - b), 0.5).toFixed(1).padStart(4)}   ` +
    `${(buried.reduce((a, b) => a + b, 0) / buried.length).toFixed(1).padStart(13)}   ` +
    `${pct(dry / (dry + alone || 1))} stranded, ${pct(alone / (dry + alone || 1))} out of hands`);
}

/* The number this game exists for: how many systems a haul keeps flying after
   it has already become unwinnable. Measured over hauls, for the reason in the
   header — a fresh leg is survivable, an eighth leg with a worn crew is not. */
console.log(section("FORESIGHT — crossings driven after the run was already lost"));
const byPolicy = {};
for (const p of ["eager", "miser", "thrifty", "careful"]) {
  const gaps = [];
  for (let i = 0; i < 150; i++) {
    const r = playHaul(O, `fs-${i}`, p, 12);
    gaps.push(...r.foresights);
  }
  byPolicy[p] = gaps;
  const g = summary(gaps);
  console.log(`  ${p.padEnd(8)} ${String(gaps.length).padStart(3)} wrecked hauls · ` +
    `median ${g.p50.toFixed(1)} systems · p90 ${g.p90.toFixed(1)} · max ${g.max}`);
}

const realistic = pool(byPolicy, ["eager", "thrifty", "careful"],
  "miser fails by running the cells flat with a clean crew, so its gap is near-0 by construction");
console.log("\n  " + realistic.note);
console.log(histogram(realistic.values, {
  label: (k) => (k === 0 ? "died on the fatal move" : `${k} crossing${k > 1 ? "s" : ""} later`),
}));

console.log(section("a sample route"));
{
  const s = O.buildLeg("an-3", 4, O.START_FUEL, O.MAX_FUEL, null);
  console.log(`  seed an-3, leg 4 · cells ${s.fuel}/${s.maxFuel}`);
  console.log(`  crew: ${O.alive(s).map((c) => `${c.name} (${O.ROLES[c.role].name.toLowerCase()})`).join(", ")}\n`);
  const aboard = {};
  O.alive(s).forEach((c) => { aboard[c.role] = true; });
  s.stages.forEach((st, i) => {
    const h = O.HAZARDS[st.kind];
    const who = h.needs.filter((r) => aboard[r]);
    console.log(`   ${String(i + 1).padStart(2)}. ${st.place.padEnd(18)} ${h.name.padEnd(17)} burn ${st.toll}  ` +
      (who.length ? `send ${who.join(" or ")}` : "NOBODY ABOARD CAN") +
      (st.reward ? `   ⟶ ${st.reward.kind === "fuel" ? `salvage ${st.reward.amount}` : `${st.reward.name} signs on`}` : ""));
  });
  const a = O.rate(s);
  console.log(`\n  opening: ${a.viable} of ${a.legal} options keep this haul finishable`);
}

const w = warnings(bands, depth);
if (w) console.log(w);
console.log("");
