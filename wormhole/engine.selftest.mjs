// wormhole engine selftest — run before touching engine.js:
//   node wormhole/engine.selftest.mjs
//
// Checks the two things the whole site rests on: (1) DETERMINISM — the same seed
// yields a byte-identical dossier, always (permalinks depend on this); and
// (2) STRUCTURE — every dossier has the fields the page and API expect.

import "./engine.js";
const W = globalThis.WORMHOLE;

let failures = 0;
function ok(cond, msg) { if (!cond) { failures++; console.error("  ✗ " + msg); } }

// ---------- determinism ----------
for (const seed of ["1", "42", "hello", "999999", "wormhole"]) {
  const a = JSON.stringify(W.generate(seed));
  const b = JSON.stringify(W.generate(seed));
  ok(a === b, `seed ${seed} is deterministic`);
}
// default seed
ok(JSON.stringify(W.generate()) === JSON.stringify(W.generate("1")), "empty seed defaults to '1'");

// ---------- distinctness ----------
const names = new Set();
for (let i = 1; i <= 200; i++) names.add(W.generate(i).field.name);
ok(names.size > 30, `200 seeds yield variety (${names.size} distinct field names)`);

// ---------- structure ----------
function checkShape(d) {
  ok(d.seed !== undefined, "has seed");
  ok(typeof d.field.name === "string" && d.field.name.length > 0, "field.name");
  ok(typeof d.field.discipline === "string", "field.discipline");
  ok(typeof d.field.studies === "string", "field.studies");
  ok(d.field.founded >= 1979 && d.field.founded <= 2018, "field.founded in range");

  ok(typeof d.paper.title === "string" && d.paper.title.length > 0, "paper.title");
  ok(Array.isArray(d.paper.authors) && d.paper.authors.length >= 1, "paper.authors");
  ok(d.paper.authors.every(a => a.name && a.affil), "each author has name + affil");
  ok(/^10\.\d+\//.test(d.paper.doi), "paper.doi looks like a DOI");
  ok(d.paper.oa === true, "paper is open access");
  ok(d.paper.journal && d.journals.some(j => j.name === d.paper.journal), "paper journal is one of the field's journals");
  ok(typeof d.paper.abstract === "string" && d.paper.abstract.length > 80, "paper.abstract nontrivial");
  ok(d.paper.citations >= 0, "paper.citations non-negative");

  ok(d.funding.total > 0, "funding.total positive");
  ok(Array.isArray(d.funding.byFunder) && d.funding.byFunder.length >= 2, "funding.byFunder >= 2");
  const sum = d.funding.byFunder.reduce((a, f) => a + f.amount, 0);
  ok(sum === d.funding.total, "funding.total equals sum of funders");
  ok(d.funding.byFunder.every((f, i, arr) => i === 0 || arr[i - 1].amount >= f.amount), "funders sorted by amount desc");
  ok(Array.isArray(d.funding.trend) && d.funding.trend.length > 0, "funding.trend present");

  ok(Array.isArray(d.journals) && d.journals.length >= 3, "journals >= 3");
  ok(d.journals.every(j => j.impact >= 0 && j.impact < 5), "journal impacts are low");
  ok(d.journals.every((j, i, arr) => i === 0 || arr[i - 1].impact >= j.impact), "journals sorted by impact desc");

  const ids = new Set([...d.web.labs.map(l => l.id), ...d.web.theories.map(t => t.id)]);
  ok(d.web.labs.length >= 4, "web has >= 4 labs");
  ok(d.web.theories.length >= 3, "web has >= 3 theories");
  ok(d.web.edges.length > 0, "web has edges");
  ok(d.web.edges.every(e => ids.has(e.from) && ids.has(e.to)), "every edge references real nodes");
  ok(d.web.labs.every(l => l.pi && l.name), "every lab has a PI + name");

  ok(Array.isArray(d.trivia) && d.trivia.length >= 3, "trivia >= 3 lines");
}
for (const seed of ["1", "7", "42", "88", "sundial", "2500"]) checkShape(W.generate(seed));

// ---------- money formatter ----------
ok(W.money(500) === "$500", "money: hundreds");
ok(W.money(42000) === "$42k", "money: thousands");
ok(W.money(3400000) === "$3.4M", "money: millions");

if (failures === 0) {
  console.log("✓ wormhole engine selftest passed");
  process.exit(0);
} else {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
