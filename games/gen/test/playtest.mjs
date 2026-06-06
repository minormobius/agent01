/* The Ludographer — the SELF-TEST (Rung 0 + 1).
 *
 * Plays every game against itself with agents of different strength and scores
 * it on the measurable aesthetics of a *good* game (after Cameron Browne's
 * automated game-design battery):
 *
 *   completion   does the game reliably end? (vs. dragging to the turn cap)
 *   skill        does a thinking agent beat a random one? (the single most
 *                important signal — a game where skill ≈ chance is just a raffle)
 *   decisiveness do skilled games resolve, or stalemate into ties?
 *   fairness     is the first player's win-rate near its fair share?
 *   non-dominance is there more than one good action, or one move that wins?
 *
 * Combined into a 0..100 quality score + a verdict. This is the filter that
 * upgrades "coherent" (guaranteed by the grammar) to "actually worth playing",
 * and — in --dataset mode — emits the (static features -> quality) table that
 * the tiny NN critic (Rung 2) will learn from.
 *
 * Usage:
 *   node games/gen/test/playtest.mjs [N=300] [games=60]      # summary report
 *   node games/gen/test/playtest.mjs --dataset out.json 2000 # emit NN dataset
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ["prng", "lexicon", "generate", "features", "operational", "sim"])
  await import(path.join(here, "../js/" + f + ".js"));
const L = globalThis.LUDO;

function clampP(g) { return Math.max(2, Math.min(4, g.players.best)); }

// Evaluate one seed. Returns { quality, flags, raw }.
function evaluate(n, G) {
  const g = L.generate(n);
  const model = L.operational(g);
  const P = clampP(g);
  const rnd = L.agents.random, grd = L.agents.greedy;

  let ended = 0, totalTurns = 0;
  // all-random: completion, length
  for (let i = 0; i < G; i++) {
    const r = L.simulate(model, Array(P).fill(rnd), n + ":r:" + i);
    if (r.ended) ended++; totalTurns += r.turns;
  }
  // skill: one greedy seat (rotated) vs random — does skill win above chance?
  let skillWins = 0, skillGames = 0;
  for (let i = 0; i < G; i++) {
    const seat = i % P;
    const ag = Array(P).fill(rnd); ag[seat] = grd;
    const r = L.simulate(model, ag, n + ":s:" + i);
    skillGames++;
    if (r.winner === seat) skillWins++;
  }
  // all-greedy: decisiveness, first-player fairness, action dominance
  let ties = 0, seat0 = 0, decisive = 0; const actAll = {};
  for (let i = 0; i < G; i++) {
    const r = L.simulate(model, Array(P).fill(grd), n + ":g:" + i);
    if (r.tie) ties++; else { decisive++; if (r.winner === 0) seat0++; }
    for (const k in r.actionCounts) actAll[k] = (actAll[k] || 0) + r.actionCounts[k];
  }

  const completion = ended / G;
  const skillWin = skillWins / skillGames;
  const chance = 1 / P;
  const skill = Math.max(0, (skillWin - chance) / (1 - chance));          // 0..1
  const decisiveness = decisive / G;
  const firstAdv = decisive ? Math.abs(seat0 / decisive - chance) / (1 - chance) : 1; // 0..1 (0=fair)
  const totalActs = Object.values(actAll).reduce((a, b) => a + b, 0) || 1;
  const dominance = Math.max(0, ...Object.values(actAll)) / totalActs;     // share of top action
  const domPenalty = Math.min(1, Math.max(0, (dominance - 0.55) / 0.45));  // only punish >55%
  const avgTurns = totalTurns / G;

  let q = 0;
  q += skill * 45;
  q += completion * 20;
  q += decisiveness * 15;
  q += (1 - firstAdv) * 10;
  q += (1 - domPenalty) * 10;
  if (avgTurns < 6) q -= 8;                 // too short to be a game
  q = Math.max(0, Math.min(100, Math.round(q)));

  const flags = [];
  if (skill < 0.12) flags.push("luck-driven (skill≈chance)");
  if (completion < 0.85) flags.push("rarely ends");
  if (decisiveness < 0.6) flags.push("draw-prone");
  if (firstAdv > 0.5) flags.push("first-player advantage");
  if (domPenalty > 0.4) flags.push("dominant action");
  if (avgTurns < 6) flags.push("too short");

  return { n, g, quality: q, flags,
    raw: { completion, skill: +skill.toFixed(2), decisiveness, firstAdv: +firstAdv.toFixed(2), dominance: +dominance.toFixed(2), avgTurns: +avgTurns.toFixed(1) } };
}

// ── dataset mode: features -> quality, for the NN critic ─────────────────────
if (process.argv[2] === "--dataset") {
  const out = process.argv[3] || "quality-dataset.json";
  const N = parseInt(process.argv[4] || "2000", 10);
  const rows = [];
  let names = null;
  const t0 = Date.now();
  for (let n = 1; n <= N; n++) {
    const ev = evaluate(n, 40);
    const f = L.features(ev.g);
    if (!names) names = f.names;
    rows.push({ n, x: f.vector, y: ev.quality, flags: ev.flags });
    if (n % 250 === 0) process.stderr.write(`  ${n}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  }
  fs.writeFileSync(out, JSON.stringify({ featureNames: names, rows }, null, 0));
  const ys = rows.map(r => r.y);
  console.log(`wrote ${rows.length} rows -> ${out}`);
  console.log(`quality: mean ${(ys.reduce((a, b) => a + b) / ys.length).toFixed(1)}, min ${Math.min(...ys)}, max ${Math.max(...ys)}, dims ${names.length}`);
  process.exit(0);
}

// ── summary mode ─────────────────────────────────────────────────────────────
const N = parseInt(process.argv[2] || "300", 10);
const G = parseInt(process.argv[3] || "60", 10);
const t0 = Date.now();
const evals = [];
for (let n = 1; n <= N; n++) evals.push(evaluate(n, G));
const qs = evals.map(e => e.quality);
const mean = qs.reduce((a, b) => a + b, 0) / qs.length;
const buckets = [0, 0, 0, 0, 0]; // 0-20,20-40,40-60,60-80,80-100
qs.forEach(q => buckets[Math.min(4, Math.floor(q / 20))]++);
const flagCounts = {};
evals.forEach(e => e.flags.forEach(f => flagCounts[f] = (flagCounts[f] || 0) + 1));

console.log(`\nLudographer self-test — ${N} seeds × ${G} games/config (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
console.log(`  quality: mean ${mean.toFixed(1)} / 100`);
console.log(`  histogram  0-20:${buckets[0]}  20-40:${buckets[1]}  40-60:${buckets[2]}  60-80:${buckets[3]}  80-100:${buckets[4]}`);
console.log(`\n  failure modes caught:`);
Object.entries(flagCounts).sort((a, b) => b[1] - a[1]).forEach(([f, c]) => console.log(`    ${String(c).padStart(4)}  ${f}`));

const sorted = evals.slice().sort((a, b) => b.quality - a.quality);
console.log(`\n  top games:`);
sorted.slice(0, 5).forEach(e => console.log(`    ${String(e.quality).padStart(3)}  №${e.n}  "${e.g.title}"  [${e.g.mechIds.join(", ")}] ${JSON.stringify(e.raw)}`));
console.log(`\n  flagged degenerate:`);
sorted.slice(-5).forEach(e => console.log(`    ${String(e.quality).padStart(3)}  №${e.n}  "${e.g.title}"  ${e.flags.join("; ")}`));
