/* W1's ledger: the paper is what text.md and wire4's data give. Fails if a {{token}} has no value, if a value is not
   a number's text, if DRAFT.md or paper.html differ from a fresh build, or if corrupting any one value leaves the
   built text unchanged (the rope paper's negative control).   node kata/papers/w1/test/ledger.selftest.mjs   (< 2 s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url)), r = spawnSync(process.execPath, [path.join(here, "../build.mjs"), "--check"], { encoding: "utf8" });
const { V, fill } = await import(path.join(here, "../values.mjs")), bad = Object.entries(V).filter(([, v]) => /NaN|undefined|Infinity/.test(v)).map(([k]) => k);
const text = fs.readFileSync(path.join(here, "../text.md"), "utf8"), built = fs.readFileSync(path.join(here, "../DRAFT.md"), "utf8"), used = new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
const atext = fs.readFileSync(path.join(here, "../audit.src.md"), "utf8"), abuilt = fs.readFileSync(path.join(here, "../AUDIT.md"), "utf8"), aused = new Set([...atext.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));
const blind = [...used].filter((k) => fill(text, { ...V, [k]: "9.99§" }).out === built).concat([...aused].filter((k) => fill(atext, { ...V, [k]: "9.99§" }).out === abuilt)), unused = Object.keys(V).filter((k) => !used.has(k) && !aused.has(k)), figs = ["growth-beta", "growth-re", "nusselt", "calibration", "ribbon-stations"].filter((f) => !fs.existsSync(path.join(here, "../fig", f + ".svg")));
const ok = r.status === 0 && !bad.length && !blind.length && fill(text).out === built && !figs.length;
console.log(ok ? `ok   the paper is what its source and the data give: ${used.size} named values in the paper and ${aused.size} in the audit sheet filled, none missing, DRAFT.md and paper.html current, and corrupting any one changes the text${unused.length ? ` (defined but unused: ${unused.join(", ")})` : ""}\n\n1/1 checks` : `FAIL ${(r.stderr || "").trim()} bad: ${bad} blind: ${blind} missing figures: ${figs}`);
process.exit(ok ? 0 : 1);
