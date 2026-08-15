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
const kpage = read("mri/kspace/index.html");
const cpage = read("mri/contrast/index.html");
const landing = read("index.html");
const physics = read("engine-rs/src/physics.rs");
const coil = read("engine-rs/src/coil.rs");
const encode = read("engine-rs/src/encode.rs");
const contrast = read("engine-rs/src/contrast.rs");
const phantom = read("engine-rs/src/phantom.rs");
const sources = read("research/mri-sources.md");

const PAGES = [["mri", page], ["mri/kspace", kpage], ["mri/contrast", cpage]];

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
  for (const [name, html] of PAGES) {
    const imported = (html.match(/import init,\s*\{([\s\S]*?)\}\s*from/) || [, ""])[1]
      .split(",").map((s) => s.trim()).filter(Boolean);
    ok(imported.length >= 2, `${name} imports named symbols from pkg/ (found ${imported.length})`);
    for (const sym of imported) {
      ok(new RegExp(`export\\s+(function|class)\\s+${sym}\\b`).test(glue),
        `pkg/ exports '${sym}' — ${name} imports it`);
    }
  }
  // Methods called on the wasm classes must exist on the generated bindings.
  const methods = [
    ...page.matchAll(/\bcoil\.([a-z_0-9]+)\(/g),
    ...kpage.matchAll(/\b(?:im|brush|sw|ep)\.([a-z_0-9]+)\(/g),
    ...cpage.matchAll(/\bimager\.([a-z_0-9]+)\(/g),
  ].map((m) => m[1]);
  for (const m of new Set(methods)) {
    ok(new RegExp(`^\\s{4}${m}\\(`, "m").test(glue), `pkg/ binds a .${m}() method`);
  }
  // Every RxCoil the sensor page constructs must be freed — it makes a new one
  // on every slider frame, so a leak there is unbounded. (The k-space page's
  // Imagers are made once and live for the page, so they are not freed.)
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
for (const [name, html] of PAGES) {
  const dois = [...html.matchAll(/doi\.org\/(10\.[^"'\s<)]+)/g)].map((m) => m[1]);
  ok(dois.length >= 6, `${name} cites at least 6 DOIs (found ${dois.length})`);
  for (const doi of new Set(dois)) {
    ok(sources.includes(doi), `${name} cites ${doi} — it must be catalogued in research/mri-sources.md`);
  }
}
// The load-bearing sources must be on their page by name.
for (const who of ["Hoult", "Bloch", "Hahn", "Edelstein", "Ocali", "Roemer", "Gruber", "Hanson"]) {
  ok(page.includes(who), `the sensor page credits ${who}`);
}
for (const who of ["Lauterbur", "Mansfield", "Twieg", "Ljunggren", "Shepp", "Guerquin-Kern",
                   "Pruessmann", "Griswold"]) {
  ok(kpage.includes(who), `the k-space page credits ${who}`);
}
for (const who of ["Stanisz", "Ernst", "Bloch", "Damadian", "Zavala Bojorquez", "Hennig"]) {
  ok(cpage.includes(who), `the contrast page credits ${who}`);
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

// ---- 6. each page keeps its sections, and says where it stops ------------
for (const sec of ["not radio waves", "Reciprocity", "actually hears", "magnet is so big"]) {
  ok(page.includes(sec), `sensor page section '${sec}' present`);
}
for (const sec of ["Frequency becomes position", "Drive it yourself", "the edges are the detail",
                   "folds onto itself", "not just whether", "speed costs"]) {
  ok(kpage.includes(sec), `k-space page section '${sec}' present`);
}
for (const sec of ["A tissue is three numbers", "any brightness you like",
                   "Contrast is not signal", "closed forms worth knowing"]) {
  ok(cpage.includes(sec), `contrast page section '${sec}' present`);
}
// Every page states its own scope honestly, and part one hands off to part two
// rather than still claiming the encoding half is unwritten.
for (const [name, html] of PAGES) {
  ok(/<div class="scope">/.test(html), `${name} carries a scope box`);
}
ok(/part one/i.test(page) && /\/mri\/kspace\//.test(page),
  "the sensor page links on to part two");
ok(!/the encoding half is not written/.test(page) && !/pages are not built/.test(page),
  "the sensor page no longer claims the encoding half is unwritten");
ok(/\/mri\/contrast\//.test(kpage), "the k-space page links on to part three");
ok(!/Contrast[^.]*is a third part, and is not written/.test(kpage),
  "the k-space page no longer claims contrast is unwritten");
ok(/not written|omission/.test(cpage), "the contrast page still says what it leaves out");

// ---- 6c. the tissue table on the page is the paper's --------------------
// Stanisz et al. 2005 Table 1, "This study", 3 T. The page renders these from
// the engine, so this checks the ENGINE's copy — the same numbers the tests
// assert, kept here so a change has to survive two independent lists.
{
  // Parse the literals rather than pattern-matching formatted numbers, so that
  // 1.820 and 1.82 are the same value here as they are to the compiler.
  const rows = [...contrast.matchAll(
    /name: "([^"]+)",\s*t1: ([0-9.]+),\s*t2: ([0-9.]+),\s*t1_sd: ([0-9.]+),\s*t2_sd: ([0-9.]+)/g)]
    .map((m) => [m[1], +m[2], +m[3], +m[4], +m[5]]);
  const want = [
    ["white matter", 1084, 69, 45, 3],
    ["grey matter", 1820, 99, 114, 7],
    ["muscle", 1412, 50, 13, 4],
    ["blood", 1932, 275, 85, 50],
    ["liver", 812, 42, 64, 3],
    ["cartilage", 1168, 27, 18, 3],
  ];
  ok(rows.length === want.length, `contrast.rs carries ${want.length} tissues (found ${rows.length})`);
  for (const [name, t1, t2, t1sd, t2sd] of want) {
    const r = rows.find((x) => x[0] === name);
    ok(!!r, `contrast.rs carries ${name}`);
    if (!r) continue;
    const near = (got, ms) => Math.abs(got * 1000 - ms) < 1e-6;
    ok(near(r[1], t1) && near(r[2], t2) && near(r[3], t1sd) && near(r[4], t2sd),
      `${name}: Stanisz 2005 gives T1 ${t1} ± ${t1sd}, T2 ${t2} ± ${t2sd} ms ` +
      `(found ${r[1] * 1000} ± ${r[3] * 1000}, ${r[2] * 1000} ± ${r[4] * 1000})`);
  }
}
ok(/in vitro/.test(contrast) && /in vitro/i.test(cpage),
  "both engine and page flag that those are in-vitro measurements");
ok(/1470/.test(contrast) && /1470/.test(cpage),
  "both flag the 24% literature disagreement on grey-matter T1");
ok(/pd: 1\.0/.test(contrast) && /proton density/.test(cpage),
  "both state that proton density is set to 1 and not measured by that table");
// Every closed form on the page is validated against a Bloch simulation.
ok(/bloch_spgr/.test(read("engine-rs/src/tests.rs")) &&
   /Bloch simulation/.test(cpage),
  "the page's claim that the equations are Bloch-validated is backed by the tests");

// ---- 6b. the encoding claims are tied to the engine ----------------------
// Every formula the k-space page quotes must be the one the engine implements.
ok(/Δf · N · esp|Δf · N · echo-spacing/.test(kpage) && /epi_shift_pixels/.test(encode),
  "the EPI shift formula appears on the page and in the engine");
ok(/FOV = 1\/Δk/.test(kpage) && /FOV = 1\/Δk/.test(encode),
  "FOV = 1/Δk stated on the page and in the engine");
ok(/Δx = 1\/2k_max/.test(kpage) && /1\/2k_max/.test(encode),
  "the resolution relation stated on the page and in the engine");
// The page's claim that it avoids the inverse crime is only true because
// phantom.rs evaluates k-space analytically. Tie the two together.
ok(!/inverse crime/i.test(kpage) || /inverse crime/i.test(phantom),
  "if the page invokes the inverse crime, phantom.rs is where it is avoided");
ok(/closed form/.test(kpage) && /closed form|analytic/i.test(phantom),
  "page and engine agree that k-space is evaluated in closed form");
ok(/Shepp/.test(phantom) && /Toft/.test(phantom),
  "phantom.rs carries both the original and the contrast-boosted Shepp–Logan, and says which is which");

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
