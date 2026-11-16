// The compute queue's planner for ana.mino.mobi's tools (.github/workflows/ana-compute.yml), the sibling of plan.mjs
// (ATOM⁴'s). Reads the queue, refuses anything that isn't `node ana/<widget>/tools/<tool>.mjs <plain words>`, and
// prints the job matrix for GITHUB_OUTPUT. run.mjs (shared) spawns node with the words as arguments: no shell.
//   node .github/compute/ana-plan.mjs [queue]   # default .github/compute/ana.json
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? new URL("./ana.json", import.meta.url).pathname, q = JSON.parse(readFileSync(file, "utf8"));
const fail = (m) => { console.error(`ana-plan: ${m}`); process.exit(1); };
const CMD = /^node ana\/[a-z0-9]+\/tools\/[a-z0-9-]+\.mjs( [A-Za-z0-9._\/=-]+)*$/; // an ana tool and plain words: no shell syntax possible
if (typeof q.run !== "string" || !/^[a-z0-9][a-z0-9-]{2,60}$/.test(q.run)) fail("run: a slug, 3–61 of [a-z0-9-]");
if (typeof q.why !== "string" || q.why.length < 10) fail("why: say what this run is for");
const minutes = q.minutes ?? 330; if (!(minutes >= 1 && minutes <= 340)) fail("minutes: 1–340 (a job is cut at 360)");
if (!Array.isArray(q.groups) || q.groups.length < 1 || q.groups.length > 64) fail("groups: 1–64 of them, one runner each");
const names = new Set();
for (const g of q.groups) {
  if (!/^[a-z0-9][a-z0-9.-]{0,40}$/.test(g.name ?? "") || names.has(g.name)) fail(`group name ${JSON.stringify(g.name)}: unique, [a-z0-9.-]`); names.add(g.name);
  if (!Array.isArray(g.cmds) || g.cmds.length < 1 || g.cmds.length > 4) fail(`${g.name}: 1–4 commands (a runner has 4 cores)`);
  for (const c of g.cmds) if (!CMD.test(c)) fail(`${g.name}: not an ana tool run: ${c}`);
}
const enabled = q.enabled !== false;
console.log(`run=${q.run}`);
console.log(`enabled=${enabled}`);
console.log(`minutes=${minutes}`);
console.log(`matrix=${JSON.stringify(q.groups.map((g) => ({ name: g.name, cmds: g.cmds })))}`);
console.error(`ana-plan: ${q.run}: ${q.groups.length} group(s), ${q.groups.reduce((t, g) => t + g.cmds.length, 0)} command(s), ${minutes} min${enabled ? "" : " (disabled)"}`);
