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
const G = globalThis.WORMHOLE_GENOME;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

// every datastream surfaces across seeds
const seen = {};
for (let i = 1; i <= 400 && Object.keys(seen).length < A.streams.length; i++) { const d = A.plan(i + ".f").design; if (!seen[d]) seen[d] = i + ".f"; }
for (const d of A.streams) ok(seen[d], `datastream '${d}' surfaces`);

// ---- story shape varies, and plan() agrees with run() ----
{
  const shapes = {}, lens = {};
  for (let i = 1; i <= 200; i++) { const p = A.plan(i + ".f"); shapes[p.shape] = (shapes[p.shape] || 0) + 1; lens[p.steps.length] = (lens[p.steps.length] || 0) + 1; }
  for (const s of ["letter", "article", "monograph"]) ok(shapes[s] > 0, `shape '${s}' surfaces (${shapes[s] || 0}/200)`);
  ok(Object.keys(lens).length >= 4, `story length varies (${Object.keys(lens).sort().join(",")} steps)`);
  // plan is cheap + consistent with the built paper
  for (const id of ["3.f", "11.f", "29.f", "57.f"]) {
    const p = A.plan(id), rr = A.run(id);
    ok(p.design === rr.design && p.shape === rr.shape, `${id}: plan design/shape matches run`);
    ok(JSON.stringify(p.techniques) === JSON.stringify(rr.reported.techniques), `${id}: plan techniques match run`);
  }
  // letters carry no synthesis; article/monograph do
  let sawLetter = false, sawSynth = false;
  for (let i = 1; i <= 60; i++) {
    const rr = A.run(i + ".f");
    const nSyn = (rr.discussionFlow || []).filter(it => it.t === "fig").length;
    if (rr.shape === "letter") { sawLetter = true; ok(nSyn === 0, `letter ${i}.f has no synthesis figure`); }
    else { if (nSyn > 0) sawSynth = true; ok(nSyn === 1, `${rr.shape} ${i}.f has exactly one synthesis figure`); }
  }
  ok(sawLetter, "letters occur in the first 60 seeds");
  ok(sawSynth, "synthesis figures occur in the first 60 seeds");
}

// ---- the genome bridge ----
{
  const paperTechs = A.paperTechniques();
  const allTechs = G.TECHNIQUES.map(t => t.id);
  ok(paperTechs.every(t => allTechs.indexOf(t) >= 0), "every paper technique is a real genome technique");
  // the bridge is complete: every genome technique is reachable from some paper
  const unreached = allTechs.filter(t => paperTechs.indexOf(t) < 0);
  ok(unreached.length === 0, `every genome technique reaches a paper (unreached: ${unreached.join(", ") || "none"})`);
  // each paper-capable technique resolves to an actual paper that uses it
  for (const t of paperTechs) {
    const pid = A.findPaperUsing(t, 400);
    ok(pid !== null, `bridge finds a paper using '${t}'`);
    if (pid) ok(A.plan(pid).techniques.indexOf(t) >= 0, `bridge target ${pid} really uses '${t}'`);
  }
  // genome-only techniques honestly return null
  const only = G.TECHNIQUES.map(t => t.id).filter(t => paperTechs.indexOf(t) < 0);
  for (const t of only) ok(A.findPaperUsing(t, 120) === null, `genome-only '${t}' reports no paper`);
}

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
  // Results is a story: one subsection per technique, each with >= 1 figure
  const heads = a.resultsFlow.filter(it => it.t === "h3");
  ok(heads.length === a.reported.techniques.length, `${d}/${a.shape}: one subsection per technique (${heads.length})`);
  ok(heads.every(h => h.tid), `${d}/${a.shape}: every subsection carries its genome technique id`);
  const rf = figRoles(a.resultsFlow);
  ok(rf.length >= heads.length, `${d}/${a.shape}: at least one figure per technique`);
  // shape governs how many techniques and whether a synthesis is present
  const shapeDef = A.SHAPES[a.shape];
  ok(shapeDef, `${d}: shape '${a.shape}' is a declared shape`);
  ok(a.reported.techniques.length >= shapeDef.min && a.reported.techniques.length <= shapeDef.max, `${d}/${a.shape}: technique count within the shape's range`);
  const synFigs = figRoles(a.discussionFlow || []);
  ok(synFigs.length === (shapeDef.synthesis ? 1 : 0), `${d}/${a.shape}: synthesis presence matches the shape`);
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
