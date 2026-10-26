// The compute queue's planner for four.mino.mobi's tools (.github/workflows/atom4-compute.yml). Reads the queue file, refuses anything that
// isn't an ATOM⁴ tool run, and prints the job matrix for GITHUB_OUTPUT. No shell ever sees a command: run.mjs spawns
// node with the words as arguments.
//   node .github/compute/plan.mjs [queue]   # default .github/compute/atom4.json
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? new URL("./atom4.json", import.meta.url).pathname, q = JSON.parse(readFileSync(file, "utf8"));
const fail = (m) => { console.error(`plan: ${m}`); process.exit(1); };
const CMD = /^node four\/[a-z]+\/tools\/[a-z0-9-]+\.mjs( [A-Za-z0-9._\/=-]+)*$/; // a tool and plain words: no shell syntax possible
if (typeof q.run !== "string" || !/^[a-z0-9][a-z0-9-]{2,60}$/.test(q.run)) fail("run: a slug, 3–61 of [a-z0-9-]");
if (typeof q.why !== "string" || q.why.length < 10) fail("why: say what this run is for");
const minutes = q.minutes ?? 330; if (!(minutes >= 1 && minutes <= 340)) fail("minutes: 1–340 (a job is cut at 360)");
if (!Array.isArray(q.groups) || q.groups.length < 1 || q.groups.length > 64) fail("groups: 1–64 of them, one runner each");
const names = new Set();
for (const g of q.groups) {
  if (!/^[a-z0-9][a-z0-9.-]{0,40}$/.test(g.name ?? "") || names.has(g.name)) fail(`group name ${JSON.stringify(g.name)}: unique, [a-z0-9.-]`); names.add(g.name);
  if (!Array.isArray(g.cmds) || g.cmds.length < 1 || g.cmds.length > 4) fail(`${g.name}: 1–4 commands (a runner has 4 cores)`);
  for (const c of g.cmds) if (!CMD.test(c)) fail(`${g.name}: not an ATOM⁴ tool run: ${c}`);
}
const enabled = q.enabled !== false;
console.log(`run=${q.run}`);
console.log(`enabled=${enabled}`);
console.log(`minutes=${minutes}`);
console.log(`matrix=${JSON.stringify(q.groups.map((g) => ({ name: g.name, cmds: g.cmds })))}`);
console.error(`plan: ${q.run}: ${q.groups.length} group(s), ${q.groups.reduce((t, g) => t + g.cmds.length, 0)} command(s), ${minutes} min${enabled ? "" : " (disabled)"}`);
