/* Choice-tightness report for Telegraph.
 *
 * For a perfect-information game the interesting question is not "how long do
 * runs last" but "how narrow is the correct answer". This searches turn one of
 * many generated encounters exhaustively and prints the distribution of
 *
 *     clean lines / total distinct outcomes
 *
 * which is the economy of choice as a number. Near 1.0 and the board is asking
 * nothing — almost anything works. At 0 it is asking the impossible. The band
 * worth shipping is narrow and low.
 *
 * Run:  node games/telegraph/test/analysis.mjs [seedsPerLevel]
 */
import { loadTelegraph, playRun, quantile } from "./harness.mjs";

const T = await loadTelegraph();
const N = parseInt(process.argv[2] || "60", 10);
const LEVELS = [1, 2, 3, 4, 5, 6, 8, 10];

function bar(n, max, width = 24) {
  const len = max > 0 ? Math.round((n / max) * width) : 0;
  return "█".repeat(len) + "·".repeat(width - len);
}
const pct = (x) => (x * 100).toFixed(1).padStart(5) + "%";

console.log(`\nTelegraph — choice tightness, ${N} encounters per level\n`);
console.log("  lvl   outcomes            clean lines        impossible  trivial   turns  enemies");
console.log("  " + "─".repeat(84));

const all = [];
for (const level of LEVELS) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const s = T.buildEncounter(`tight-${i}`, level, T.START_INTEGRITY, T.START_INTEGRITY);
    const a = T.analyseTurn(s);
    rows.push({ ...a, enemies: s.enemies.length, turns: s.maxTurns });
    all.push({ level, ...a });
  }
  const totals = rows.map((r) => r.total).sort((a, b) => a - b);
  const tight = rows.map((r) => r.tightness).sort((a, b) => a - b);
  const impossible = rows.filter((r) => r.clean === 0).length / rows.length;
  const trivial = rows.filter((r) => r.tightness > 0.5).length / rows.length;
  const capped = rows.filter((r) => r.capped).length;

  console.log(
    `  ${String(level).padStart(3)}   ` +
    `${String(Math.round(quantile(totals, 0.5))).padStart(6)} med ` +
    `(${String(Math.round(quantile(totals, 0.9))).padStart(6)} p90)  ` +
    `${pct(quantile(tight, 0.1))} ${pct(quantile(tight, 0.5))} ${pct(quantile(tight, 0.9))}  ` +
    `${pct(impossible)}     ${pct(trivial)}   ` +
    `${String(Math.round(rows.reduce((a, r) => a + r.turns, 0) / rows.length)).padStart(4)}  ` +
    `${String((rows.reduce((a, r) => a + r.enemies, 0) / rows.length).toFixed(1)).padStart(6)}` +
    (capped ? `  ⚠ ${capped} capped` : "")
  );
}

console.log("\n— where turn-one tightness lands overall —");
{
  const buckets = [
    ["impossible  (0 clean)", (r) => r.clean === 0],
    ["brutal    (0–2%)", (r) => r.tightness > 0 && r.tightness <= 0.02],
    ["tight     (2–10%)", (r) => r.tightness > 0.02 && r.tightness <= 0.10],
    ["fair     (10–25%)", (r) => r.tightness > 0.10 && r.tightness <= 0.25],
    ["loose    (25–50%)", (r) => r.tightness > 0.25 && r.tightness <= 0.50],
    ["trivial    (>50%)", (r) => r.tightness > 0.50],
  ];
  const counts = buckets.map(([, f]) => all.filter(f).length);
  const max = Math.max(...counts);
  buckets.forEach(([label], i) => {
    console.log(`  ${label.padEnd(22)} ${bar(counts[i], max)} ${String(counts[i]).padStart(5)}  ${pct(counts[i] / all.length)}`);
  });
}

console.log("\n— how deep the play policies get (30 runs each) —");
{
  const seeds = Array.from({ length: 30 }, (_, i) => `run-${i}`);
  for (const policy of ["idle", "greedy", "optimal"]) {
    const rs = seeds.map((s) => playRun(T, s, { policy, maxLevel: 15 }));
    const lv = rs.map((r) => r.reachedLevel).sort((a, b) => a - b);
    const capped = rs.filter((r) => !r.died).length;
    console.log(
      `  ${policy.padEnd(8)} level p10 ${quantile(lv, 0.1).toFixed(1).padStart(5)} · ` +
      `median ${quantile(lv, 0.5).toFixed(1).padStart(5)} · p90 ${quantile(lv, 0.9).toFixed(1).padStart(5)}` +
      (capped ? `  (${capped}/30 hit the level cap)` : "")
    );
  }
}

console.log("\n— a sample board, turn one —");
{
  const s = T.buildEncounter("tight-0", 4, T.START_INTEGRITY, T.START_INTEGRITY);
  const a = T.analyseTurn(s);
  const GLYPH = { rock: "▓", node: "▒", floor: "·" };
  for (let y = 0; y < s.h; y++) {
    let row = "  ";
    for (let x = 0; x < s.w; x++) {
      const u = T.unitAt(s, x, y), e = T.enemyAt(s, x, y);
      row += (u ? T.UNITS[u.kind].glyph : e ? T.ENEMIES[e.kind].glyph : GLYPH[s.tiles[y * s.w + x]]) + " ";
    }
    console.log(row);
  }
  const f = T.forecast(s);
  console.log(`\n  ${s.enemies.length} enemies, ${s.maxTurns} turns, integrity ${s.integrity}`);
  console.log(`  incoming: ${f.map((h) => `(${h.x},${h.y})${h.hitsNode ? " NODE" : h.hitsUnit ? " unit" : ""}`).join(", ")}`);
  console.log(`  ${a.total} distinct outcomes · ${a.clean} clean · ${a.flawless} flawless · best score ${a.bestScore}`);
}

console.log("");
