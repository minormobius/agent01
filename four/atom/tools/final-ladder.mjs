// Writes .github/compute/atom4.json for the final main-sequence rerun: the 49 4D -lp ladder stars (exact masses from the
// cached tracks) and ours' seven OPAL tracks, all grav=1 and ledoux=0.02 (Ledoux at the mixing; PI 2026-11-25), tag=v3
// (fresh files). Ours also khmin=0.1. 4 commands a group. evolve4-26 (Schwarzschild, tag v2 / ours v2k) was this
// generator's earlier form (git history); it stays as the boundary criterion's comparison set.
import { readFileSync, writeFileSync } from "node:fs";
const S = process.argv[2], run = process.argv[3], out = process.argv[4];
const four = readFileSync(`${S}/stars.txt`, "utf8").trim().split("\n").map((l) => l.split(" ")).map(([G, s, m]) => `node four/atom/tools/evolve.mjs four ${G} ${s} ${(+m).toPrecision(10).replace(/0+$/, "").replace(/\.$/, "")} grav=1 ledoux=0.02 tag=v3`);
const ours = ["0.6", "0.8", "1", "1.25", "1.6", "2", "3"].map((m) => `node four/atom/tools/evolve.mjs ours ${m} X0=0.7068 Z=0.0143 kap=opal alpha=1.61 settle=1e6 grav=1 khmin=0.1 ledoux=0.02 tag=v3`);
const cmds = [...ours, ...four], groups = []; for (let i = 0; i < cmds.length; i += 4) groups.push({ name: `${run.replace("evolve4-", "ev")}-${String(groups.length).padStart(2, "0")}`, cmds: cmds.slice(i, i + 4) });
writeFileSync(out, JSON.stringify({ run, why: "The final main-sequence rerun, on Ledoux (PI 2026-11-25): the 49 4D ladder stars and ours' seven OPAL tracks, grav=1, the stirred core taking only layers within 0.02 in hydrogen of its mean (a core no longer regrows into the gradient it left), ε_grav re-solved off where it fails a step, resumes under KHMIN, ours at khmin=0.1. Tagged v3, fresh files; each command resumes its own checkpoint on later legs.", minutes: 330, groups }, null, 1) + "\n");
console.log(cmds.length, "commands in", groups.length, "groups");
