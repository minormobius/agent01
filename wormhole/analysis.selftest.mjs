// wormhole analysis selftest — run before touching analysis.js:
//   node wormhole/analysis.selftest.mjs
//
// The paper story engine: each paper is a sequence of genome techniques over one
// shared datastream, ending in a synthesis. Checks determinism, that every
// datastream surfaces, that Results is a multi-technique story (subsections +
// several figures), that a synthesis figure exists, that reported fields the
// narrative needs are present, and that no @-tokens leak or reference a missing
// figure role.

import "./engine.js";
import "./stats.js";
import "./charts.js";
import "./dataset.js";
import "./genome.js";
import "./analysis.js";
const W = globalThis.WORMHOLE;
const A = globalThis.WORMHOLE_ANALYSIS;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

// every datastream surfaces across seeds
const seen = {};
for (let i = 1; i <= 120 && Object.keys(seen).length < 4; i++) { const d = A.run(i + ".f").design; if (!seen[d]) seen[d] = i + ".f"; }
for (const d of ["multivariate", "temporal", "grouped", "cohort"]) ok(seen[d], `datastream '${d}' surfaces`);

for (const id of Object.values(seen)) {
  ok(JSON.stringify(A.run(id)) === JSON.stringify(A.run(id)), `analysis ${id} deterministic`);
}

function figRoles(flow) { return flow.filter(it => it.t === "fig").map(it => it.role); }
function checkAnalysis(id) {
  const a = A.run(id);
  const d = a.design;
  ok(a.frame && a.frame.indexName && a.frame.focal.index, `${d}: frame`);
  for (const k of ["N", "r", "p", "varExplained", "y0", "y1", "kappa", "techniques"]) ok(a.reported[k] !== undefined, `${d}: reported.${k}`);
  ok(a.reported.varExplained >= 0 && a.reported.varExplained <= 100, `${d}: varExplained in [0,100]`);
  // Results is a story: >= 2 technique subsections and >= 2 figures
  const heads = a.resultsFlow.filter(it => it.t === "h3");
  ok(heads.length >= 2, `${d}: Results has >= 2 technique subsections (${heads.length})`);
  const rf = figRoles(a.resultsFlow);
  ok(rf.length >= 2, `${d}: Results has >= 2 figures`);
  ok(a.reported.techniques.length >= 2, `${d}: uses >= 2 techniques`);
  // a synthesis figure in the discussion flow
  const synFigs = figRoles(a.discussionFlow || []);
  ok(synFigs.length >= 1, `${d}: has a synthesis figure`);
  // table
  ok(a.table.cols.length >= 2 && a.table.rows.length >= 1 && a.table.rows.every(row => row.length === a.table.cols.length), `${d}: table well-formed`);
  // all figures are clean SVG with captions + roles unique
  const all = a.resultsFlow.concat(a.discussionFlow || []).filter(it => it.t === "fig");
  ok(all.every(f => f.svg.indexOf("<svg") === 0 && f.svg.indexOf("NaN") < 0), `${d}: figures clean SVG`);
  ok(all.every(f => typeof f.caption === "string" && f.caption.length > 12), `${d}: figures captioned`);
  const roles = all.map(f => f.role);
  ok(new Set(roles).size === roles.length, `${d}: figure roles unique`);
  // every @fig: token in any text references a figure that exists
  const text = a.resultsFlow.concat(a.discussionFlow || [], a.methodsFlow).map(it => it.html || "").join(" ") + a.dataStatement;
  const toks = (text.match(/@fig:([\w:]+)@/g) || []).map(t => t.slice(5, -1));
  const roleSet = new Set(roles);
  ok(toks.every(role => roleSet.has(role)), `${d}: all @fig: tokens resolve`);
}
for (const id of Object.values(seen)) checkAnalysis(id);
// spread across many seeds to catch a broken story combination
for (let i = 1; i <= 40; i++) checkAnalysis(i + ".f");

if (failures === 0) {
  console.log("✓ wormhole analysis selftest passed");
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
