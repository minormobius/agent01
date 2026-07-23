// wormhole genome selftest — run before touching genome.js:
//   node wormhole/genome.selftest.mjs
//
// The genome is the grammar of the graph pack. This checks every technique is
// deterministic, references defined data/answer types, and builds a valid figure
// set (real SVG, no NaN) with a finding — plus that the exposed (data × answer)
// matrix is well-formed and every technique lands in at least one cell.

import "./stats.js";
import "./charts.js";
import "./genome.js";
const G = globalThis.WORMHOLE_GENOME;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

const dtKeys = new Set(Object.keys(G.DATA_TYPES));
const atKeys = new Set(Object.keys(G.ANSWER_TYPES));
ok(G.TECHNIQUES.length >= 10, `has >= 10 techniques (${G.TECHNIQUES.length})`);

for (const t of G.TECHNIQUES) {
  ok(t.data.every(d => dtKeys.has(d)), `${t.id}: data types are defined`);
  ok(t.answer.every(a => atKeys.has(a)), `${t.id}: answer types are defined`);
  ok(Array.isArray(t.charts) && t.charts.length >= 1, `${t.id}: lists charts`);
  // determinism
  ok(JSON.stringify(G.run(t.id, 3)) === JSON.stringify(G.run(t.id, 3)), `${t.id}: deterministic`);
  // figures across a few seeds
  for (const seed of [1, 7, 42]) {
    const rr = G.run(t.id, seed);
    ok(rr.figures.length >= 2, `${t.id}#${seed}: >= 2 figures`);
    ok(rr.figures.every(f => typeof f.svg === "string" && f.svg.indexOf("<svg") === 0), `${t.id}#${seed}: figures are SVG`);
    ok(rr.figures.every(f => f.svg.indexOf("NaN") < 0), `${t.id}#${seed}: no NaN in SVG`);
    ok(rr.figures.every(f => typeof f.caption === "string" && f.caption.length > 10), `${t.id}#${seed}: figures captioned`);
    ok(typeof rr.finding === "string" && rr.finding.length > 20, `${t.id}#${seed}: has a finding`);
    ok(rr.reported && Object.keys(rr.reported).length >= 1, `${t.id}#${seed}: has reported values`);
  }
}

// the exposed matrix
const m = G.matrix();
ok(m.length === dtKeys.size, "matrix has one row per data type");
ok(m.every(row => row.cells.length === atKeys.size), "matrix has one cell per answer type");
const placed = new Set();
m.forEach(row => row.cells.forEach(c => c.techniques.forEach(id => placed.add(id))));
ok(G.ids().every(id => placed.has(id)), "every technique appears in at least one matrix cell");

// unknown id falls back gracefully
ok(G.run("nonexistent", 1).figures.length >= 2, "unknown id falls back to a valid technique");

if (failures === 0) {
  console.log("✓ wormhole genome selftest passed");
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
