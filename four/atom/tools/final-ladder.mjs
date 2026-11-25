// Writes .github/compute/atom4.json for the final main-sequence rerun: the 49 4D -lp ladder stars (exact masses from the
// cached tracks) and ours' seven OPAL tracks, all grav=1, tag=v2 (fresh files, no old checkpoint resumed). 4 commands a group.
// Ours: khmin=0.1 and tag=v2k (leg 1 ran them without khmin and left failed -tv2 checkpoints; see four/CLAUDE.md).
import { readFileSync, writeFileSync } from "node:fs";
const S = process.argv[2], run = process.argv[3], out = process.argv[4];
const four = readFileSync(`${S}/stars.txt`, "utf8").trim().split("\n").map((l) => l.split(" ")).map(([G, s, m]) => `node four/atom/tools/evolve.mjs four ${G} ${s} ${(+m).toPrecision(10).replace(/0+$/, "").replace(/\.$/, "")} grav=1 tag=v2`);
const ours = ["0.6", "0.8", "1", "1.25", "1.6", "2", "3"].map((m) => `node four/atom/tools/evolve.mjs ours ${m} X0=0.7068 Z=0.0143 kap=opal alpha=1.61 settle=1e6 grav=1 khmin=0.1 tag=v2k`);
const cmds = [...ours, ...four], groups = []; for (let i = 0; i < cmds.length; i += 4) groups.push({ name: `${run.replace("evolve4-", "ev")}-${String(groups.length).padStart(2, "0")}`, cmds: cmds.slice(i, i + 4) });
writeFileSync(out, JSON.stringify({ run, why: "The final main-sequence rerun (PI 2026-11-24: grav correction on, all fixes applied): the 49 4D ladder stars and ours' seven OPAL tracks, on the current code — pinned gravity's quadrature fix, the stirred-core zone model (structure and zone burn on one picture), the zero-age meeting-point fallback, the energy books judged absolutely (balmax), ε_grav on (grav=1). Tagged v2 so every star starts fresh rather than resuming an old checkpoint. Each command resumes its own -tv2 checkpoint on later legs.", minutes: 330, groups }, null, 1) + "\n");
console.log(cmds.length, "commands in", groups.length, "groups");
