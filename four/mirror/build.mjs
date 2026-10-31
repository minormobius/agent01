/* Stages the tangled mirror of four.mino.mobi's solvers (tangled.org/morphyxmino.bsky.social/four, MIT): the no-DOM
   modules at their own paths (so their imports work unchanged), a known-answer test assembled from the site's
   selftest blocks that check methods rather than baked data, its one fixture, the README and the licence.
     node four/mirror/build.mjs <outdir>        # stage into outdir (it must not exist, or be empty)
     node four/mirror/build.mjs --check         # stage into a temp dir and run its test there
   The workflow .github/workflows/mirror-four-tangled.yml runs this, runs the staged test, and pushes. */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url)), FOUR = path.join(here, "..");
/* what ships: every solver module, none that reads baked data, and the 4D viewer (tile.js, for a browser) */
export const MODULES = ["kernel", "atom", "gauss", "md", "landscape", "ffmodel", "gas", "forces", "polytopes", "turning", "geometry", "stars", "orbits", "nebula", "fields", "nuclear", "brink", "bbn", "burning", "dirac", "gscale", "tile"].map((m) => `atom/js/${m}.js`).concat(["lumen/js/optics.js"]);
/* the selftest's blocks that check a method against known answers without the site's baked data (by number) */
export const BLOCKS = [1, 2, 3, 9, 10, 11, 12, 13, 21, 33, 35, 36, 37, 38, 43, 51, 52, 53, 54, 55];

export function stage(out) {
  mkdirSync(out, { recursive: true }); if (readdirSync(out).length) throw new Error(`${out} isn't empty`);
  for (const m of MODULES) { mkdirSync(path.join(out, path.dirname(m)), { recursive: true }); copyFileSync(path.join(FOUR, m), path.join(out, m)); }
  // every relative import must land inside the mirror
  for (const m of MODULES) for (const [, imp] of readFileSync(path.join(FOUR, m), "utf8").matchAll(/from "(\.[^"]+)"/g)) {
    const target = path.normalize(path.join(path.dirname(m), imp)); if (!MODULES.includes(target)) throw new Error(`${m} imports ${imp}, which the mirror doesn't carry`);
  }
  // the known-answer test: the selftest's own blocks, with a preamble that loads only what the mirror has
  const src = readFileSync(path.join(FOUR, "atom/test/atom4.selftest.mjs"), "utf8"), lines = src.split("\n");
  const starts = []; lines.forEach((l, i) => { const m = l.match(/^\/\* (\d+) · /); if (m) starts.push([+m[1], i]); });
  const end = lines.findIndex((l) => l.startsWith("console.log(fails ?"));
  const spans = BLOCKS.map((n) => { const k = starts.findIndex(([b]) => b === n); if (k < 0) throw new Error(`selftest block ${n} is gone`); return [starts[k][1], k + 1 < starts.length ? starts[k + 1][1] : end]; });
  const blocks = spans.map(([a, b]) => lines.slice(a, b).join("\n"));
  // helper functions the blocks call, defined at the top level outside them
  const helpers = lines.filter((l, i) => /^function [A-Za-z0-9_]+\(/.test(l) && !spans.some(([a, b]) => i >= a && i < b)).join("\n");
  const test = `/* The known-answer test for four.mino.mobi's solvers: each method against closed forms, published values or brute
   force, in our world and in four dimensions. Assembled from the site's selftest (its blocks ${BLOCKS.join(", ")}), which
   also checks the site's baked results; this part needs nothing but node.
     node atom/test/methods.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const A = await import(path.join(here, "../js/atom.js"));
const F = await import(path.join(here, "../js/fields.js"));
const G = await import(path.join(here, "../js/polytopes.js"));
const RT = await import(path.join(here, "../js/turning.js"));
const TL = await import(path.join(here, "../js/tile.js"));
const FF = await import(path.join(here, "../js/forces.js"));
const OPT = await import(path.join(here, "../../lumen/js/optics.js"));
const fs = await import("node:fs");
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("✓ " + msg.split(":")[0]); };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const t0 = Date.now();
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const normal = (rnd) => () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd());
${helpers}

${blocks.join("\n")}
console.log(fails ? \`\\n✗ \${fails} of \${checks} checks failed\` : \`\\n✓ \${checks} checks in \${((Date.now() - t0) / 1000).toFixed(0)} s\`);
process.exit(fails ? 1 : 0);
`;
  mkdirSync(path.join(out, "atom/test/fixtures"), { recursive: true });
  writeFileSync(path.join(out, "atom/test/methods.selftest.mjs"), test);
  copyFileSync(path.join(FOUR, "atom/test/fixtures/nist-spce-1.txt"), path.join(out, "atom/test/fixtures/nist-spce-1.txt"));
  for (const f of ["README.md", "LICENSE"]) copyFileSync(path.join(here, f), path.join(out, f));
  writeFileSync(path.join(out, "package.json"), JSON.stringify({ name: "four", private: true, type: "module", license: "MIT", description: "Solvers for any number of dimensions, from four.mino.mobi", scripts: { test: "node atom/test/methods.selftest.mjs" } }, null, 2) + "\n");
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === "--check") { const out = stage(path.join(mkdtempSync(path.join(tmpdir(), "four-mirror-")), "four")); execFileSync("node", [path.join(out, "atom/test/methods.selftest.mjs")], { stdio: "inherit", cwd: out }); console.log(`staged and checked in ${out}`); }
  else if (arg) { stage(path.resolve(arg)); console.log(`staged ${MODULES.length} modules into ${arg}`); }
  else { console.log("usage: build.mjs <outdir> | --check"); process.exit(1); }
}
