/* Difficulty report for The Ratchet.
 *
 * Two things are measured, and the second is the one that matters.
 *
 *   1. Tightness — what fraction of the options in front of you keep the route
 *      completable. The same metric Telegraph reports, one decision at a time.
 *   2. FORESIGHT — how many stages a run keeps going after it has already
 *      become unwinnable. This is the number this game exists for. If it is
 *      zero, the game is just a resource meter that empties; if it is large,
 *      the fatal choice is genuinely remote from its consequence.
 *
 * Run:  node games/ratchet/test/analysis.mjs [routesPerLevel]
 */
import { loadRatchet, playRoute, playRun, quantile, POLICIES } from "./harness.mjs";

const R = await loadRatchet();
const N = parseInt(process.argv[2] || "60", 10);
const LEVELS = [1, 2, 3, 4, 5, 6, 8];

const bar = (n, max, w = 22) => "█".repeat(max > 0 ? Math.round((n / max) * w) : 0).padEnd(w, "·");
const pct = (x) => (x * 100).toFixed(0).padStart(4) + "%";

console.log(`\nThe Ratchet — ${N} routes per level\n`);

console.log("— the opening choice —");
console.log("  lvl  stages  kit  options  keep it alive        completable  trivial");
console.log("  " + "─".repeat(72));
for (const level of LEVELS) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const s = R.buildRoute(`an-${i}`, level, R.START_SUPPLY, R.MAX_SUPPLY);
    rows.push({ ...R.rate(s), stages: s.stages.length, kit: R.kitTotal(s.kit) });
  }
  const t = rows.map((r) => r.tightness).sort((a, b) => a - b);
  console.log(
    `  ${String(level).padStart(3)}  ` +
    `${(rows.reduce((a, r) => a + r.stages, 0) / N).toFixed(1).padStart(6)}  ` +
    `${(rows.reduce((a, r) => a + r.kit, 0) / N).toFixed(1).padStart(3)}  ` +
    `${(rows.reduce((a, r) => a + r.legal, 0) / N).toFixed(1).padStart(7)}  ` +
    `${pct(quantile(t, 0.1))} ${pct(quantile(t, 0.5))} ${pct(quantile(t, 0.9))}  ` +
    `${pct(rows.filter((r) => r.completable).length / N).padStart(11)}  ` +
    `${pct(rows.filter((r) => r.tightness > 0.9).length / N)}`
  );
}

/* The opening of a route is meant to be forgiving; the squeeze arrives later,
   when the kit is thin and the road is not. So the honest measure of whether a
   route ever asks a question is the NARROWEST choice along a perfect crossing,
   not the first one. */
console.log("\n— the narrowest choice on a perfect crossing —");
console.log("  lvl   min tightness (p10 / median / p90)   routes with a genuine fork");
console.log("  " + "─".repeat(66));
for (const level of LEVELS) {
  const mins = [];
  let forky = 0;
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
    if (min <= 0.5) forky++;
  }
  mins.sort((a, b) => a - b);
  console.log(
    `  ${String(level).padStart(3)}   ` +
    `${pct(quantile(mins, 0.1))} ${pct(quantile(mins, 0.5))} ${pct(quantile(mins, 0.9))}` +
    `${pct(forky / N).padStart(34)}`
  );
}

console.log("\n— how far the policies get (60 runs each) —");
for (const policy of ["hoarder", "eager", "thrifty", "optimal"]) {
  const rs = Array.from({ length: 60 }, (_, i) => playRun(R, `run-${i}`, policy, 12));
  const routes = rs.map((r) => r.routes).sort((a, b) => a - b);
  const capped = rs.filter((r) => r.capped).length;
  console.log(
    `  ${policy.padEnd(8)} routes p10 ${quantile(routes, 0.1).toFixed(1).padStart(4)} · ` +
    `median ${quantile(routes, 0.5).toFixed(1).padStart(4)} · p90 ${quantile(routes, 0.9).toFixed(1).padStart(4)}` +
    (capped ? `  (${capped}/60 hit the cap)` : "")
  );
}

console.log("\n— FORESIGHT: stages walked after the run was already lost —");
{
  const all = {};
  for (const policy of ["hoarder", "eager", "thrifty"]) {
    const gaps = [];
    for (let i = 0; i < 220; i++) {
      const level = 1 + (i % 7);
      const s = R.buildRoute(`fs-${i}`, level, R.START_SUPPLY, R.MAX_SUPPLY);
      const out = playRoute(R, s, policy, R.newMemo());
      if (out.foresight !== null) gaps.push(out.foresight);
    }
    all[policy] = gaps;
    const sorted = gaps.slice().sort((a, b) => a - b);
    console.log(
      `  ${policy.padEnd(8)} ${String(gaps.length).padStart(3)} failed runs · ` +
      `median ${quantile(sorted, 0.5).toFixed(1)} stages · ` +
      `p90 ${quantile(sorted, 0.9).toFixed(1)} · max ${Math.max(0, ...gaps)}`
    );
  }
  /* Pooling `hoarder` in here would be misleading: it fails by running the
     supply to zero, so its fatal move and its death are the same move by
     construction, and it drowns the histogram in zeroes. The distribution worth
     looking at is the one for policies that fail the way a person does — by
     spending something they turn out to need later. */
  const pooled = [].concat(all.eager, all.thrifty);
  console.log("\n  (eager + thrifty only — hoarder fails by running dry, so its gap is 0 by construction)");
  const hist = {};
  pooled.forEach((g) => { hist[g] = (hist[g] || 0) + 1; });
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  const max = Math.max(...Object.values(hist));
  console.log("");
  for (const k of keys) {
    const label = k === 0 ? "died on the fatal move" : `${k} stage${k > 1 ? "s" : ""} later`;
    console.log(`  ${label.padEnd(24)} ${bar(hist[k], max)} ${String(hist[k]).padStart(4)}  ${pct(hist[k] / pooled.length)}`);
  }
}

console.log("\n— a sample route —");
{
  const s = R.buildRoute("an-3", 4, R.START_SUPPLY, R.MAX_SUPPLY);
  console.log(`  seed an-3, route 4 · supply ${s.supply}/${s.maxSupply} · kit ${R.kitList(s.kit).map((t) => R.TOOLS[t].name).join(", ")}`);
  s.stages.forEach((st, i) => {
    const o = R.OBSTACLES[st.kind];
    console.log(`   ${String(i + 1).padStart(2)}. ${o.name.padEnd(16)} toll ${st.toll}  ` +
      `solved by ${o.accepts.map((t) => R.TOOLS[t].name).join(" or ")}` +
      (st.reward ? `   ⟶ cache: ${R.TOOLS[st.reward].name}` : ""));
  });
  const a = R.rate(s);
  console.log(`\n  opening: ${a.viable} of ${a.legal} options keep this route completable`);
}

console.log("");
