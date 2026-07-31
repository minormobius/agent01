// neuro selftest — run before touching this surface:
//   node neuro/neuro.selftest.mjs
//
// The Rust engine has its own tests (`cd neuro/engine-rs && cargo test`), which
// assert the MODEL's claims. This file guards the wiring around it — the things
// that silently rot and that preflight can't see:
//
//   1. the wasm module is present and plausible (deploy-neuro hard-fails without it)
//   2. the page imports exactly the symbols the module actually exports
//   3. the published Table 2 baked into the page matches the paper
//   4. the grammar shown to visitors matches the grammar in the Rust source
//   5. attribution to the original authors is intact on both pages
//   6. no wasm-pack droppings that would break the committed pkg/

import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error("  ✗ " + msg); } };

const read = (p) => readFileSync(join(DIR, p), "utf8");
const page = read("homeostasis/index.html");
const landing = read("index.html");
const model = read("engine-rs/src/model.rs");

// ---- 1. the wasm module ships -------------------------------------------
const WASM = "homeostasis/pkg/homeostasis_bg.wasm";
const GLUE = "homeostasis/pkg/homeostasis.js";
ok(existsSync(join(DIR, WASM)), `${WASM} exists — deploy-neuro hard-fails without it`);
ok(existsSync(join(DIR, GLUE)), `${GLUE} exists`);
if (existsSync(join(DIR, WASM))) {
  const bytes = statSync(join(DIR, WASM)).size;
  ok(bytes > 20_000, `wasm module is ${bytes} bytes — suspiciously small, did the build truncate?`);
  const magic = readFileSync(join(DIR, WASM)).subarray(0, 4);
  ok(magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d,
    "wasm module starts with the \\0asm magic number");
}

// ---- 2. the page imports what the module exports -------------------------
if (existsSync(join(DIR, GLUE))) {
  const glue = read(GLUE);
  const imported = (page.match(/import init,\s*\{([^}]+)\}/) || [, ""])[1]
    .split(",").map((s) => s.trim()).filter(Boolean);
  ok(imported.length > 0, "the page imports named symbols from pkg/");
  for (const sym of imported) {
    ok(new RegExp(`export\\s+(function|class)\\s+${sym}\\b`).test(glue),
      `pkg/ exports '${sym}' — the page imports it`);
  }
  // Methods the page calls on a Reservoir must exist on the generated class.
  const methods = [...page.matchAll(/\b(?:trained|res)\.([a-z_0-9]+)\(/g)].map((m) => m[1]);
  for (const m of new Set(methods)) {
    ok(new RegExp(`^\\s*${m}\\(`, "m").test(glue), `Reservoir.${m}() exists in pkg/`);
  }
}

// ---- 3. the published Table 2 on the page matches the paper --------------
// Falandays, Nguyen & Spivey (2021), Brain Research 1768:147578, Table 2.
const PUBLISHED = [
  [0.099, 0.016, 0.467, 0.319, 0.009, 0.065, 0.173],
  [0.060, 0.061, 0.170, 0.0004, 0.452, 0.213, 0.036],
  [0.049, 0.052, 0.008, 0.199, 0.237, 0.402, 0.038],
  [0.020, 0.107, 0.3173, 0.469, 0.069, 0.010, 0.176],
  [0.057, 0.0546, 0.205, 0.003, 0.402, 0.237, 0.040],
  [0.060, 0.060, 0.002, 0.171, 0.213, 0.452, 0.039],
];
{
  const block = (page.match(/const PUBLISHED = \[([\s\S]*?)\];/) || [, ""])[1];
  const rows = [...block.matchAll(/\[([^\]]+)\]/g)].map((m) =>
    m[1].split(",").map((v) => parseFloat(v)));
  ok(rows.length === 6, `page carries 6 published rows (found ${rows.length})`);
  rows.forEach((row, t) => {
    ok(row.length === 7, `published row ${t} has 7 columns`);
    row.forEach((v, k) => ok(Math.abs(v - PUBLISHED[t][k]) < 1e-9,
      `published[${t}][${k}] is ${PUBLISHED[t][k]} (page says ${v}) — this is the paper's number, don't drift`));
  });
  // The bolded winner in each published row must be the grammatical continuation.
  const expectedWinner = [2, 4, 5, 3, 4, 5];   // walks, dog_o, man_o, bites, dog_o, man_o
  PUBLISHED.forEach((row, t) => {
    const argmax = row.indexOf(Math.max(...row));
    ok(argmax === expectedWinner[t],
      `published row ${t} peaks at token ${expectedWinner[t]}, not ${argmax}`);
  });
}

// ---- 4. the grammar the page shows matches the Rust ----------------------
{
  // Rust GRAMMAR, as 7 rows of 7.
  const block = (model.match(/pub const GRAMMAR[^=]*=\s*\[([\s\S]*?)\n\];/) || [, ""])[1];
  const rows = [...block.matchAll(/\[([0-9.,\s]+)\]/g)].map((m) =>
    m[1].split(",").map((v) => parseFloat(v)).filter((v) => !Number.isNaN(v)));
  ok(rows.length === 7, `Rust GRAMMAR has 7 rows (found ${rows.length})`);
  rows.forEach((r, i) => {
    ok(r.length === 7, `GRAMMAR row ${i} has 7 entries`);
    const sum = r.reduce((a, b) => a + b, 0);
    ok(Math.abs(sum - 1) < 1e-9, `GRAMMAR row ${i} sums to 1 (got ${sum})`);
  });
  // The 75/25 asymmetry is the entire experiment; the docs tab states it.
  ok(rows[0] && rows[0][2] === 0.75 && rows[0][3] === 0.25, "man → walks .75 / bites .25");
  ok(rows[1] && rows[1][2] === 0.25 && rows[1][3] === 0.75, "dog → walks .25 / bites .75");
  ok(/75%/.test(page) && /25%/.test(page), "the docs tab still states the 75/25 split");
  // man/dog collide across positions — the claim that position sensitivity is emergent.
  const vecs = (model.match(/const INPUT_VEC[^=]*=\s*\[([\s\S]*?)\n\];/) || [, ""])[1];
  const iv = [...vecs.matchAll(/\[([01.,\s]+)\]/g)].map((m) => m[1].replace(/\s/g, ""));
  ok(iv.length === 7, `INPUT_VEC has 7 rows (found ${iv.length})`);
  ok(iv[0] === iv[5], "man-as-subject and man-as-object are the SAME input vector");
  ok(iv[1] === iv[4], "dog-as-subject and dog-as-object are the SAME input vector");
}

// ---- 5. attribution survives --------------------------------------------
for (const [name, html] of [["homeostasis", page], ["landing", landing]]) {
  ok(/Falandays/.test(html), `${name} page credits Falandays`);
  ok(/10\.1016\/j\.brainres\.2021\.147578/.test(html), `${name} page carries the DOI`);
}
ok(/github\.com\/bfalandays\/HomeostasisModel/.test(page),
  "homeostasis page links the authors' original repository");
ok(/no licence file|no license file/i.test(page),
  "homeostasis page still explains why the original code isn't redistributed");
ok(/Falandays/.test(model), "engine-rs credits the authors in its doc comment");

// ---- 6. no wasm-pack droppings ------------------------------------------
for (const junk of ["homeostasis/pkg/.gitignore", "homeostasis/pkg/package.json"]) {
  ok(!existsSync(join(DIR, junk)),
    `${junk} removed — wasm-pack writes it and it would exclude pkg/ from git`);
}

// ---- 7. the page can't quietly lose a tab -------------------------------
for (const tab of ["watch", "predict", "surprise", "codes", "replicate", "docs"]) {
  ok(new RegExp(`data-tab="${tab}"`).test(page), `tab '${tab}' present`);
  ok(new RegExp(`data-pane="${tab}"`).test(page), `pane '${tab}' present`);
}

if (failures) {
  console.error(`\nneuro selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log("neuro selftest: ok");
