/* R1's ledger: the paper is what its source and the data give. text.md's {{tokens}} are filled from values.mjs, which
   reads the baked data files; this fails if a token has no value, or if DRAFT.md or paper.html on disk differ from a
   fresh build (someone edited them by hand, or re-ran a study and did not rebuild).
   node kata/papers/r1/test/ledger.selftest.mjs   (< 2 s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url)), r = spawnSync(process.execPath, [path.join(here, "../build.mjs"), "--check"], { encoding: "utf8" });
const { V } = await import(path.join(here, "../values.mjs")), text = fs.readFileSync(path.join(here, "../text.md"), "utf8"), used = new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])), bad = Object.entries(V).filter(([, v]) => /NaN|undefined|Infinity/.test(v)).map(([k]) => k);
/* the negative control the audit asked for: corrupt one value at a time and the built text must change. A test that
   only looked for digits somewhere in the page passed a table cell altered from 1.13 to 9.99 */
const { fill } = await import(path.join(here, "../values.mjs")), built = fs.readFileSync(path.join(here, "../DRAFT.md"), "utf8"), blind = [...used].filter((k) => fill(text, { ...V, [k]: "9.99§" }).out === built);
const ok = r.status === 0 && !bad.length && !blind.length && fill(text).out === built;
console.log(ok ? `ok   the paper is what text.md and the data give: ${used.size} named values filled, none missing, DRAFT.md and paper.html current, and corrupting any one of them changes the text\n\n1/1 checks` : `FAIL ${(r.stderr || "").trim().split("\n").pop()}${bad.length ? " · bad values: " + bad.join(", ") : ""}${blind.length ? " · corrupting these changes nothing: " + blind.join(", ") : ""}\n\n0/1 checks`);
process.exit(ok ? 0 : 1);
