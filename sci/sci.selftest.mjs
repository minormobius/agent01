// sci selftest — run before touching this surface:
//   node sci/sci.selftest.mjs
//
// The Rust engine has its own tests (`cd sci/engine-rs && cargo test --release`),
// which compare each solver against a closed form. This file guards the wiring
// around them — the things that rot silently and that preflight can't see:
//
//   1. the wasm module ships and is plausible (deploy-sci hard-fails without it)
//   2. the page imports exactly the symbols the module actually exports
//   3. the physical constants the engine uses are the CODATA values
//   4. the citations on the page match the ones in the research scan
//   5. the wing's rule — no uncited mechanism claims, no numbers hard-coded
//      into the page that should be computed
//   6. no wasm-pack droppings that would exclude pkg/ from git

import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error("  ✗ " + msg); } };
const read = (p) => readFileSync(join(DIR, p), "utf8");

const page = read("mri/index.html");
const landing = read("index.html");
const physics = read("engine-rs/src/physics.rs");
const coil = read("engine-rs/src/coil.rs");
const sources = read("research/mri-sources.md");

// ---- 1. the wasm module ships -------------------------------------------
const WASM = "mri/pkg/mri_bg.wasm";
const GLUE = "mri/pkg/mri.js";
ok(existsSync(join(DIR, WASM)), `${WASM} exists — deploy-sci hard-fails without it`);
ok(existsSync(join(DIR, GLUE)), `${GLUE} exists`);
if (existsSync(join(DIR, WASM))) {
  const bytes = statSync(join(DIR, WASM)).size;
  ok(bytes > 15_000, `wasm module is ${bytes} bytes — suspiciously small, did the build truncate?`);
  const magic = readFileSync(join(DIR, WASM)).subarray(0, 4);
  ok(magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d,
    "wasm module starts with the \\0asm magic number");
}

// ---- 2. the page imports what the module exports -------------------------
if (existsSync(join(DIR, GLUE))) {
  const glue = read(GLUE);
  const imported = (page.match(/import init,\s*\{([\s\S]*?)\}\s*from/) || [, ""])[1]
    .split(",").map((s) => s.trim()).filter(Boolean);
  ok(imported.length >= 6, `the page imports named symbols from pkg/ (found ${imported.length})`);
  for (const sym of imported) {
    ok(new RegExp(`export\\s+(function|class)\\s+${sym}\\b`).test(glue),
      `pkg/ exports '${sym}' — the page imports it`);
  }
  // Methods called on an RxCoil must exist on the generated class.
  const methods = [...page.matchAll(/\bcoil\.([a-z_0-9]+)\(/g)].map((m) => m[1]);
  for (const m of new Set(methods)) {
    ok(new RegExp(`^\\s{4}${m}\\(`, "m").test(glue), `RxCoil.${m}() exists in pkg/`);
  }
  // Every RxCoil the page constructs must be freed, or a slider leaks wasm
  // memory on every drag.
  const news = (page.match(/new RxCoil\(\)/g) || []).length;
  const frees = (page.match(/\.free\(\)/g) || []).length;
  ok(news === frees, `every RxCoil is freed (${news} constructed, ${frees} freed)`);
}

// ---- 3. constants are CODATA, not folklore -------------------------------
// If one of these drifts, every number on the page drifts with it silently.
const CODATA = {
  MU0: 1.25663706212e-6,        // vacuum permeability, CODATA 2018
  GAMMA: 2.6752218744e8,        // proton gyromagnetic ratio, rad/s/T
  HBAR: 1.054571817e-34,
  KB: 1.380649e-23,             // exact, SI 2019
};
for (const [name, want] of Object.entries(CODATA)) {
  const m = physics.match(new RegExp(`pub const ${name}: f64 = ([0-9_.e-]+)`));
  ok(!!m, `physics.rs defines ${name}`);
  if (m) {
    const got = parseFloat(m[1].replace(/_/g, ""));
    ok(Math.abs(got - want) / want < 1e-9, `${name} = ${want} (found ${got})`);
  }
}
ok(/T_BODY: f64 = 310\.15/.test(physics), "body temperature is 310.15 K");

// ---- 4. the page's citations are in the research scan --------------------
// The wing's rule is that claims trace to primary sources. A DOI on the page
// that isn't in the scan means a citation nobody checked.
const doisOnPage = [...page.matchAll(/doi\.org\/(10\.[^"'\s<)]+)/g)].map((m) => m[1]);
ok(doisOnPage.length >= 8, `the page cites at least 8 DOIs (found ${doisOnPage.length})`);
for (const doi of new Set(doisOnPage)) {
  const stem = doi.split("/").slice(0, 2).join("/").replace(/[.()]/g, "\\$&");
  ok(new RegExp(stem.slice(0, 28)).test(sources) || sources.includes(doi.slice(0, 24)),
    `DOI ${doi} appears in research/mri-sources.md`);
}
// The four load-bearing sources for part one must be on the page by name.
for (const who of ["Hoult", "Bloch", "Hahn", "Edelstein", "Ocali", "Roemer", "Gruber", "Hanson"]) {
  ok(page.includes(who), `the page credits ${who}`);
}

// ---- 5. the wing's rule ---------------------------------------------------
ok(/traces to a primary source/.test(landing), "the landing page still states the wing's rule");
// Numbers that must be COMPUTED, not typed: if these appear as literals in the
// page's prose they have escaped the engine and can drift away from the physics.
const prose = page.replace(/<script[\s\S]*?<\/script>/g, "");
ok(!/63\.8[0-9]* *MHz/.test(prose), "the Larmor frequency is computed, not hard-coded in prose");
ok(!/4\.69[0-9]* *m/.test(prose), "the wavelength is computed, not hard-coded in prose");
// One exception, deliberately: the 4.9 ppm figure is quoted in prose as an
// anchor. It must match what the engine computes for 1.5 T at body temp.
{
  const { HBAR, GAMMA, KB } = CODATA;
  const p = Math.tanh((HBAR * GAMMA * 1.5) / (2 * KB * 310.15)) * 1e6;
  const quoted = (prose.match(/4\.9 ?× ?10⁻⁶|4\.9e-6/) || [])[0];
  ok(!!quoted, "the page anchors polarisation with the 4.9 ppm figure");
  ok(Math.abs(p - 4.9) < 0.1, `engine computes ${p.toFixed(2)} ppm at 1.5 T — prose says 4.9`);
}
// The √2 optimum is derived in coil.rs and stated on the page; keep them tied.
ok(/√2 · z|√2·z|SQRT_2/.test(coil), "coil.rs derives the √2·z optimum");
ok(/√2 ?· ?z/.test(page), "the page states the √2·z optimum");
ok(/signal-only|Signal only/.test(page) && /signal-only|Signal only/.test(coil),
  "both page and engine flag that the √2 optimum is signal-only, not SNR");

// ---- 6. the page keeps its four sections ---------------------------------
for (const sec of ["not radio waves", "Reciprocity", "actually hears", "magnet is so big"]) {
  ok(page.includes(sec), `section '${sec}' present`);
}
ok(/part one/i.test(page) && /is not written/.test(page),
  "the page still says which half of the instrument it does not cover");

// ---- 7. no wasm-pack droppings -------------------------------------------
for (const junk of ["mri/pkg/.gitignore", "mri/pkg/package.json"]) {
  ok(!existsSync(join(DIR, junk)),
    `${junk} removed — wasm-pack writes it and it would exclude pkg/ from git`);
}

if (failures) {
  console.error(`\nsci selftest: ${failures} failure(s)`);
  process.exit(1);
}
console.log("sci selftest: ok");
