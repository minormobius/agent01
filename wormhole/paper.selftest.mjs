// wormhole paper-engine selftest — run before touching paper.js:
//   node wormhole/paper.selftest.mjs
//
// Guards the four things the paper subpage rests on:
//   1. DETERMINISM — same id → byte-identical paper.
//   2. FOUNDATIONAL CONSISTENCY — "<seed>.f" matches the dossier's paper card.
//   3. REFERENCE COHERENCE — every reference's cited metadata equals the header
//      you get by opening that reference's id (the click always lands true).
//   4. STRUCTURE — sections, equations, table, refs are all well-formed.

import "./engine.js";
import "./stats.js";
import "./charts.js";
import "./dataset.js";
import "./paper.js";
const W = globalThis.WORMHOLE;
const P = globalThis.WORMHOLE_PAPER;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

// 1. determinism
for (const id of ["1.f", "42.f", "42.r3", "1337.r7", "88.r1"]) {
  ok(JSON.stringify(P.generate(id)) === JSON.stringify(P.generate(id)), `paper ${id} is deterministic`);
}
// id normalisation: bare seed → .f
ok(JSON.stringify(P.generate("42")) === JSON.stringify(P.generate("42.f")), "bare seed normalises to .f");

// 2. foundational consistency with the dossier
for (const seed of ["1", "42", "500", "77"]) {
  const dossier = W.generate(seed).paper;
  const paper = P.generate(seed + ".f");
  ok(paper.header.title === dossier.title, `founder title matches dossier (seed ${seed})`);
  ok(paper.header.doi === dossier.doi, `founder DOI matches dossier (seed ${seed})`);
  ok(paper.header.authors.length === dossier.authors.length, `founder author count matches (seed ${seed})`);
  ok(paper.abstract === dossier.abstract, `founder abstract matches dossier (seed ${seed})`);
  ok(paper.isFoundational === true, `founder flagged foundational (seed ${seed})`);
}

// 3. reference coherence — the citation equals the paper it opens
for (const id of ["1.f", "42.f", "9.r2", "314.r5"]) {
  const paper = P.generate(id);
  ok(paper.references.length >= 12, `${id} has >= 12 references`);
  ok(paper.references.every((r, i) => r.num === i + 1), `${id} references numbered 1..n`);
  ok(!paper.references.some(r => r.id === id), `${id} does not cite itself`);
  const ids = new Set(paper.references.map(r => r.id));
  ok(ids.size === paper.references.length, `${id} references are distinct`);
  // opening each reference yields a header whose title/doi match the citation
  for (const ref of paper.references) {
    const h = P.header(ref.id);
    ok(h.title === ref.title, `ref ${ref.id} title matches its opened header`);
    ok(h.doi === ref.doi, `ref ${ref.id} DOI matches its opened header`);
    ok(P.citeAuthors(h.authors) === ref.authors, `ref ${ref.id} author string matches`);
  }
}

// 4. structure
function checkPaper(p) {
  ok(typeof p.header.title === "string" && p.header.title.length > 0, "has title");
  ok(Array.isArray(p.header.authors) && p.header.authors.length >= 1, "has authors");
  ok(p.header.authors.every(a => a.name && a.affil), "authors have name + affil");
  ok(/^10\.\d+\//.test(p.header.doi), "doi shape");
  ok(typeof p.abstract === "string" && p.abstract.length > 80, "abstract nontrivial");
  ok(Array.isArray(p.sections) && p.sections.length >= 5, "has >= 5 sections");
  ok(p.sections.every(s => s.title && Array.isArray(s.paras) && s.paras.length >= 1), "sections well-formed");
  // at least one equation and exactly one table
  const eqs = p.sections.flatMap(s => s.paras).filter(par => par.eq).length;
  ok(eqs >= 1, "has >= 1 display equation");
  const tables = p.sections.filter(s => s.table).length;
  ok(tables === 1, "has exactly one results table");
  const tbl = p.sections.find(s => s.table).table;
  ok(tbl.cols.length >= 3 && tbl.rows.length >= 1 && tbl.rows.every(row => row.length === tbl.cols.length), "table rows match columns");
  ok(typeof p.acknowledgements === "string" && p.acknowledgements.length > 20, "has acknowledgements");
  // figures: at least 3, each a real SVG with a caption, numbered in order
  const figs = p.sections.flatMap(s => s.figures || []);
  ok(figs.length >= 3, "has >= 3 figures");
  ok(figs.every(f => typeof f.svg === "string" && f.svg.indexOf("<svg") === 0), "each figure is an <svg>");
  ok(figs.every(f => f.svg.indexOf("NaN") < 0), "no NaN in figure SVGs");
  ok(figs.every(f => typeof f.caption === "string" && f.caption.length > 20), "each figure has a caption");
  ok(figs.every((f, i) => f.num === i + 1), "figures numbered 1..n in order");
}
for (const id of ["1.f", "42.f", "42.r9", "7000.r2", "3.r1"]) checkPaper(P.generate(id));

// cross-field references really do reach other fields sometimes
let sawCrossField = false;
for (let i = 1; i <= 30 && !sawCrossField; i++) {
  if (P.generate(i + ".f").references.some(r => !r.sameField)) sawCrossField = true;
}
ok(sawCrossField, "some references are interdisciplinary (cross-field)");

if (failures === 0) {
  console.log("✓ wormhole paper-engine selftest passed");
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
