/* The Ludographer — the SELF-TEST report (Rung 0 + 1).
 *
 * Plays every game against itself with agents of different strength and scores
 * it on the measurable aesthetics of a good game (skill / completion /
 * decisiveness / fairness / non-dominance) via LUDO.evaluate (js/selftest.js).
 *
 * Usage:
 *   node games/gen/test/playtest.mjs [N=300] [games=60]      # summary report
 *   node games/gen/test/playtest.mjs --dataset out.json 2000 # emit NN dataset
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of ["prng", "lexicon", "generate", "operational", "features", "sim", "selftest"])
  await import(path.join(here, "../js/" + f + ".js"));
const L = globalThis.LUDO;

// ── dataset mode: features -> quality, for the NN critic ─────────────────────
if (process.argv[2] === "--dataset") {
  const out = process.argv[3] || "quality-dataset.json";
  const N = parseInt(process.argv[4] || "2000", 10);
  const rows = [];
  let names = null;
  const t0 = Date.now();
  for (let n = 1; n <= N; n++) {
    const ev = L.evaluate(n, 40);
    const f = L.features(ev.g);
    if (!names) names = f.names;
    rows.push({ n, x: f.vector, y: ev.quality, flags: ev.flags });
    if (n % 250 === 0) process.stderr.write(`  ${n}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  }
  fs.writeFileSync(out, JSON.stringify({ featureNames: names, rows }));
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
for (let n = 1; n <= N; n++) evals.push(L.evaluate(n, G));
const qs = evals.map(e => e.quality);
const mean = qs.reduce((a, b) => a + b, 0) / qs.length;
const buckets = [0, 0, 0, 0, 0];
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
