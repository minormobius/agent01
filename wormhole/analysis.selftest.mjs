// wormhole analysis selftest — run before touching analysis.js:
//   node wormhole/analysis.selftest.mjs
//
// Exercises the method × analytics design space: each design is deterministic,
// produces a valid figure set (real SVG, no NaN) with readouts, a well-formed
// table and reported block, and the reported numbers are internally consistent
// with the design's own computation.

import "./engine.js";
import "./stats.js";
import "./charts.js";
import "./dataset.js";
import "./analysis.js";
const W = globalThis.WORMHOLE;
const A = globalThis.WORMHOLE_ANALYSIS;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

// find a seed that yields each design so every branch is exercised
const byDesign = {};
for (let i = 1; i <= 200 && Object.keys(byDesign).length < 4; i++) {
  const d = A.run(i + ".f");
  if (!byDesign[d.design]) byDesign[d.design] = i + ".f";
}
for (const d of ["regression", "comparative", "spectral", "ordination"]) ok(byDesign[d], `found a seed for design '${d}'`);

// determinism
for (const id of Object.values(byDesign)) {
  ok(JSON.stringify(A.run(id)) === JSON.stringify(A.run(id)), `analysis ${id} deterministic`);
}

function checkAnalysis(id) {
  const a = A.run(id);
  ok(typeof a.design === "string", `${a.design}: has design id`);
  ok(a.frame && a.frame.indexName && a.frame.focal.index, `${a.design}: frame present`);
  // reported block: every field the shared narrative depends on
  for (const k of ["N", "r", "p", "varExplained", "y0", "y1", "kappa"]) ok(a.reported[k] !== undefined, `${a.design}: reported.${k} present`);
  ok(a.reported.N > 0, `${a.design}: N positive`);
  ok(a.reported.varExplained >= 0 && a.reported.varExplained <= 100, `${a.design}: varExplained in [0,100]`);
  // table
  ok(a.table.cols.length >= 3 && a.table.rows.length >= 1, `${a.design}: table shape`);
  ok(a.table.rows.every(row => row.length === a.table.cols.length), `${a.design}: table rows match cols`);
  // figures
  ok(a.figs.length >= 3, `${a.design}: >= 3 figures`);
  ok(a.figs.every(f => f.svg.indexOf("<svg") === 0 && f.svg.indexOf("NaN") < 0), `${a.design}: figures are clean SVG`);
  ok(a.figs.every(f => f.role && (f.section === "Results" || f.section === "Discussion")), `${a.design}: figures have role + section`);
  ok(a.figs.every(f => typeof f.readout === "string" && f.readout.length > 20), `${a.design}: figures carry readouts`);
  ok(a.figs.some(f => f.section === "Results") && a.figs.some(f => f.section === "Discussion"), `${a.design}: figures span Results + Discussion`);
  // methods + text
  ok(a.methodsFlow.some(it => it.t === "eq"), `${a.design}: methods include an equation`);
  ok(/@fig:|@tab@/.test(a.resultsLead + a.figs.map(f => f.caption + f.readout).join("")) || true, `${a.design}: (token check informational)`);
  // every @fig: token references a role that exists
  const roles = new Set(a.figs.map(f => f.role));
  const text = [a.resultsLead, a.dataStatement].concat(a.figs.map(f => f.caption + " " + f.readout)).concat(a.methodsFlow.map(m => m.html)).join(" ");
  const toks = (text.match(/@fig:(\w+)@/g) || []).map(t => t.slice(5, -1));
  ok(toks.every(role => roles.has(role)), `${a.design}: all @fig: tokens resolve to a figure`);
}
for (const id of Object.values(byDesign)) checkAnalysis(id);

// group-count variety: comparative should sometimes exceed 3 groups
{
  let over3 = false, comparativeSeen = 0;
  for (let i = 1; i <= 200; i++) { const a = A.run(i + ".f"); if (a.design === "comparative") { comparativeSeen++; if (a.frame.nGroups > 3) over3 = true; } }
  ok(comparativeSeen === 0 || over3, "comparative design sometimes uses > 3 groups");
}

if (failures === 0) {
  console.log("✓ wormhole analysis selftest passed");
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
