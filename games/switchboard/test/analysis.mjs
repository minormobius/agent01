/* Difficulty report for Switchboard.
 *
 * Built on packages/pressure-lab. This is the lab's second consumer and its
 * first REAL-TIME one, which is the interesting test: the lab was written
 * against two turn-based games, so anything here that needs bending is a fact
 * about the library rather than about this game.
 *
 * Run:  node games/switchboard/test/analysis.mjs [shiftsPerLevel]
 */
import { loadSwitchboard, playShift, playRun, POLICIES } from "./harness.mjs";
import {
  quantile, summary, histogram, spread, section, warnings, pct, bar,
} from "../../../packages/pressure-lab/lab.mjs";

const S = await loadSwitchboard();
const N = parseInt(process.argv[2] || "40", 10);
const LEVELS = [1, 2, 3, 4, 6, 8];

console.log(`\nSwitchboard — ${N} shifts per level\n`);

console.log(section("the board"));
console.log("  lvl  calls  secs  load   optimum / on the board    forced to drop");
console.log("  " + "─".repeat(68));
for (const level of LEVELS) {
  const rows = [];
  for (let i = 0; i < N; i++) {
    const sh = S.buildShift(`an-${i}`, level);
    const total = S.totalValue(sh);
    const opt = S.optimum(sh).value;
    const work = sh.jobs.reduce((a, j) => a + j.dur, 0);
    rows.push({
      calls: sh.jobs.length, secs: sh.duration, load: work / sh.duration,
      opt, total, dropFrac: 1 - opt / total,
    });
  }
  const m = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  console.log(
    `  ${String(level).padStart(3)}  ${m((r) => r.calls).toFixed(1).padStart(5)}  ` +
    `${m((r) => r.secs).toFixed(0).padStart(4)}  ${m((r) => r.load).toFixed(2).padStart(4)}   ` +
    `${m((r) => r.opt).toFixed(1).padStart(5)} / ${m((r) => r.total).toFixed(1).padStart(5)}` +
    `${pct(m((r) => r.dropFrac)).padStart(22)}`
  );
}

/* The measure this game exists for. Every other game in the family reports a
   fraction of options or a survival flag; here the shortfall is denominated in
   points, so "how much worse than perfect" is literally a number. */
console.log(section("shortfall from perfect, by policy"));
const seeds = Array.from({ length: 120 }, (_, i) => `sh-${i}`);
const shifts = seeds.map((sd, i) => S.buildShift(sd, 1 + (i % 8)));
const optima = shifts.map((sh) => S.optimum(sh).value);

const byPolicy = {};
for (const name of Object.keys(POLICIES)) {
  byPolicy[name] = shifts.map((sh, i) => optima[i] - playShift(S, sh, name).score);
}
const worstName = Object.keys(byPolicy).reduce((a, b) =>
  (summary(byPolicy[b]).mean > summary(byPolicy[a]).mean ? b : a));
for (const [name, gaps] of Object.entries(byPolicy)) {
  const g = summary(gaps);
  const perfect = gaps.filter((x) => x < 1e-9).length;
  console.log(
    `  ${name.padEnd(11)} mean ${g.mean.toFixed(2).padStart(5)} pts behind · ` +
    `median ${g.p50.toFixed(1).padStart(4)} · worst ${g.max.toFixed(0).padStart(3)}   ` +
    `${bar(perfect, gaps.length, 14)} ${pct(perfect / gaps.length)} perfect`
  );
}

/* `optimal` must score exactly the optimum on every board — it is the same
   solver the player is graded against, so any gap is a bug in one of them. */
{
  const bad = byPolicy.optimal.filter((g) => g > 1e-6).length;
  console.log(`\n  optimal matched the solver on ${shifts.length - bad}/${shifts.length} shifts` +
    (bad ? "  ⚠ THE SOLVER AND THE SIM DISAGREE" : ""));
}

console.log(section("how deep the policies get"));
const depth = spread({
  seeds: Array.from({ length: 40 }, (_, i) => `run-${i}`),
  policies: Object.fromEntries(["newest", "edf", "leastSlack", "density", "optimal"].map((p) => [p, p])),
  play: (seed, p) => playRun(S, seed, p, 10).cleared,
  control: "newest",
  label: "shifts",
});
console.log(depth.text);

console.log(section("where the points go — a losing shift, attributed"));
{
  // Find a shift the heuristic actually loses on — hardcoding a seed picked one
  // it happened to play perfectly, which demonstrates nothing.
  let sh = null, played = null, pm = null;
  for (let i = 0; i < 60; i++) {
    const cand = S.buildShift(`att-${i}`, 4 + (i % 4));
    const out = playShift(S, cand, "leastSlack");
    const rep = S.postShift(cand, out.state.history);
    if (rep.losses.length) { sh = cand; played = out; pm = rep; break; }
  }
  if (!sh) { console.log("  (no losing shift found in 60 — suspicious)"); }
  else {
  console.log(`  least-slack scored ${pm.achieved} of a possible ${pm.optimum}` +
    ` (${pm.losses.length} costly commitment${pm.losses.length === 1 ? "" : "s"})`);
  pm.losses.slice(0, 4).forEach((l) => {
    const j = S.jobById(sh, l.id);
    console.log(`    t=${l.t.toFixed(1)}s  took line ${j.line + 1} (${j.kind}, ${j.dur}s)` +
      `  — cost ${l.cost} pts`);
  });
  if (pm.idleLoss) console.log(`    ${pm.idleLoss} pts lost to standing idle`);
  }
}

console.log(section("commitment length vs shortfall"));
{
  // Is the game actually about the length of what you commit to? If long calls
  // are never a trap, the central tension does not exist.
  const buckets = { "short (<2s)": [], "medium (2-3s)": [], "long (>3s)": [] };
  for (let i = 0; i < 120; i++) {
    const sh = S.buildShift(`cl-${i}`, 3 + (i % 5));
    const played = playShift(S, sh, "leastSlack");
    const pm = S.postShift(sh, played.state.history);
    for (const l of pm.losses) {
      const j = S.jobById(sh, l.id);
      const key = j.dur < 2 ? "short (<2s)" : j.dur <= 3 ? "medium (2-3s)" : "long (>3s)";
      buckets[key].push(l.cost);
    }
  }
  for (const [k, v] of Object.entries(buckets)) {
    const g = v.length ? summary(v) : { mean: 0, n: 0 };
    console.log(`  ${k.padEnd(15)} ${String(v.length).padStart(4)} costly commitments · ` +
      `mean cost ${g.mean ? g.mean.toFixed(2) : "—"} pts`);
  }
}

console.log(warnings(depth));
console.log("");
