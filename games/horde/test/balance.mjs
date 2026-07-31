/* Balance report for Hold the Line.
 *
 * Plays N seeded runs under three focus policies and prints the difficulty
 * curve: where runs die, how long they last, and how far apart good and bad
 * play end up. Not a pass/fail test — a measurement. Read it after moving any
 * number in js/config.js.
 *
 * Run:  node games/horde/test/balance.mjs [N]
 */
import { loadHorde, playRun, quantile } from "./harness.mjs";

const H = await loadHorde();
const N = parseInt(process.argv[2] || "400", 10);

function bar(n, max, width = 28) {
  const len = max > 0 ? Math.round((n / max) * width) : 0;
  return "█".repeat(len) + "·".repeat(width - len);
}

function summarise(label, results) {
  const waves = results.map((r) => r.diedOn ?? r.run.wave).sort((a, b) => a - b);
  const secs = results.map((r) => r.seconds).sort((a, b) => a - b);
  const caps = results.filter((r) => r.reachedCap).length;
  console.log(
    `  ${label.padEnd(8)} ` +
    `wave p10 ${quantile(waves, 0.1).toFixed(1).padStart(5)} · ` +
    `median ${quantile(waves, 0.5).toFixed(1).padStart(5)} · ` +
    `p90 ${quantile(waves, 0.9).toFixed(1).padStart(5)} · ` +
    `run ${quantile(secs, 0.5).toFixed(0).padStart(4)}s · ` +
    `kills ${(results.reduce((a, r) => a + r.kills, 0) / results.length).toFixed(0).padStart(4)}` +
    (caps ? `  (${caps} hit the ${40}-wave cap)` : "")
  );
  return waves;
}

const seeds = Array.from({ length: N }, (_, i) => `bal-${i}`);

console.log(`\nHold the Line — balance over ${N} seeded runs\n`);
console.log("— where runs end, by focus policy —");
const byPolicy = {};
for (const policy of ["sweep", "panic", "rotate"]) {
  byPolicy[policy] = seeds.map((s) => playRun(H, s, { policy, cards: "survival" }));
  summarise(policy, byPolicy[policy]);
}

console.log("\n— card policy, holding focus at `rotate` —");
for (const cards of ["worst", "greedy", "survival"]) {
  summarise(cards, seeds.map((s) => playRun(H, s, { policy: "rotate", cards })));
}

console.log("\n— death wave histogram (rotate · survival) —");
{
  const waves = byPolicy.rotate.map((r) => r.diedOn ?? r.run.wave);
  const counts = {};
  for (const w of waves) counts[w] = (counts[w] || 0) + 1;
  const keys = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const max = Math.max(...Object.values(counts));
  let cum = 0;
  for (const w of keys) {
    cum += counts[w];
    console.log(
      `  wave ${String(w).padStart(2)}  ${bar(counts[w], max)}  ` +
      `${String(counts[w]).padStart(4)}  (${((cum / waves.length) * 100).toFixed(0).padStart(3)}% dead by here)`
    );
  }
}

console.log("\n— wave pressure, as planned by the director —");
{
  const run = H.newRun("inspect", { quiet: true });
  for (let w = 1; w <= 14; w++) {
    run.wave = w;
    H.buildWave(run, w);
    const byType = {};
    let bodies = 0;
    for (const s of run.spawns) {
      byType[s.type] = (byType[s.type] || 0) + s.clump;
      bodies += s.clump;
    }
    const arcs = new Set(run.spawns.map((s) => s.arc)).size;
    const hp = (H.CONFIG.hpScale(w)).toFixed(2);
    console.log(
      `  w${String(w).padStart(2)}  ${String(bodies).padStart(3)} bodies  ` +
      `${arcs} arcs  hp×${hp}  ` +
      Object.entries(byType).map(([t, n]) => `${t}:${n}`).join(" ")
    );
  }
}

console.log("\n— which cards a greedy player actually ends up with —");
{
  const tally = {};
  for (const r of byPolicy.rotate) for (const id of r.taken) tally[id] = (tally[id] || 0) + 1;
  const total = byPolicy.rotate.reduce((a, r) => a + r.taken.length, 0);
  const rows = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  console.log(`  ${(total / byPolicy.rotate.length).toFixed(1)} cards per run\n`);
  const max = rows.length ? rows[0][1] : 0;
  for (const [id, n] of rows) {
    console.log(`  ${id.padEnd(12)} ${bar(n, max, 20)} ${String(n).padStart(5)}`);
  }
  const never = H.UPGRADES.filter((u) => !tally[u.id]).map((u) => u.id);
  if (never.length) console.log(`\n  never taken: ${never.join(", ")}`);
}

console.log("");
