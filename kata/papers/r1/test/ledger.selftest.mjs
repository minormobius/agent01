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
const ok = r.status === 0 && !bad.length;
console.log(ok ? `ok   the paper is what text.md and the data give: ${used.size} named values filled, none missing, DRAFT.md and paper.html current\n\n1/1 checks` : `FAIL ${(r.stderr || "").trim().split("\n").pop()}${bad.length ? " · bad values: " + bad.join(", ") : ""}\n\n0/1 checks`);
process.exit(ok ? 0 : 1);
