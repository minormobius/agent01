/* Hinton's laws: the walker moves continuously but only ever makes the
   moves the rules make. Every level of both lanes is played through by
   walking it (steering at each cell of the solver's solution, from wherever
   you happen to be in your cell), and must end on the goal in par, its
   discrete state matching the solver's after every move.
     node games/hinton/test/hinton.selftest.mjs   (a few s) */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const here = path.dirname(fileURLToPath(import.meta.url));
const { parse, ACTIONS } = await import(path.join(here, "../../anakata/js/world.js"));
const { Walker, R } = await import(path.join(here, "../js/walker.js"));
const AK = (await import(path.join(here, "../../anakata/js/levels.js"))).LEVELS;
const AB = (await import(path.join(here, "../../anabasis/js/levels.js"))).LEVELS;
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };

{
  let good = true;
  for (const f of fs.readdirSync(path.join(here, "../js"))) {
    const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: fs.readFileSync(path.join(here, "../js", f)), encoding: "utf8" });
    if (r.status !== 0) { good = false; console.error(f, r.stderr); }
  }
  ok(good, "every script in js/ parses");
}

const DT = 1 / 60;
/* walk the walker along a solution; returns { moves, won, agree } */
function play(world, moves) {
  const W = new Walker(world);
  let s = world.start, agree = true, frames = 0;
  const settle = () => { while (W.busy() && frames < 1e5) { W.update(DT); frames++; } };
  for (const ai of moves) {
    const a = ACTIONS[ai], want = world.act(s, a), before = W.moves;
    if (a.kind === "hook") { W.hook(a.d); }
    else for (let g = 0; g < 600 && W.moves === before; g++) { W.move(a.d[0] * 3.2 * DT, a.d[1] * 3.2 * DT); W.update(DT); frames++; }
    settle();
    if (W.moves !== before + 1 || world.key(W.s) !== world.key(want)) agree = false;
    s = want;
    if (!agree) break;
  }
  settle();
  return { moves: W.moves, won: W.won(), agree, W };
}

for (const [lane, levels, allow] of [["anakata", AK, () => true], ["anabasis", AB, (a) => a.kind === "walk"]]) {
  for (const def of levels) {
    const world = parse(def), sol = world.solve(allow), r = play(world, sol.moves);
    ok(r.agree && r.won && r.moves === sol.moves.length, `${lane} · ${def.name}: walked to the goal in par ${sol.moves.length}, every move the solver's`);
  }
}

/* walls stop you R short; you can't leave your cell while you land */
{
  const w = parse({ name: "t", map: `
#####  #####

#####  @.#..`, gravW: true });
  const W = new Walker(w);
  for (let i = 0; i < 200; i++) { W.move(0.05, 0); W.update(DT); }
  ok(w.coords(W.s.p)[0] === 1 && Math.abs(W.P[0] - (2 - R)) < 1e-9, "a wall stops you R short of it");
  for (let i = 0; i < 200; i++) { W.move(0, 0.05); W.update(DT); }
  ok(W.P[1] <= 1 - R + 1e-9, "the edge of the world does too");
  ok(W.moves === 1, "and bumping into things isn't a move");
}
{
  const w = parse({ name: "t", map: `
####  ####

####  ##..

####  @...`, gravW: true });
  const W = new Walker(w);
  let fell = false;
  for (let i = 0; i < 400 && !fell; i++) { W.move(0.05, 0); W.update(DT); if (w.coords(W.s.p)[3] === 1) fell = true; }
  ok(fell && W.busy(), "past the end of the block kata of you, you slip, and fall through w for a while");
  const x = W.P[0];
  for (let i = 0; i < 3; i++) { W.move(0.3, 0); W.update(DT); }
  ok(W.P[0] <= 3 - R + 1e-9 && W.P[0] >= x - 1e-9, "while you land you can move, but not out of your cell");
  let t = 0; while (W.busy() && t < 600) { W.update(DT); t++; }
  ok(!W.busy() && Math.abs(W.P[3] - 1.5) < 1e-9, "and you come to rest in the slice below");
}

console.log(fails ? `\n✗ ${fails} of ${checks} hinton checks failed` : `hinton: ${checks} checks · ${AK.length} anakata and ${AB.length} anabasis levels walked at par\n\n✓ hinton selftest passed`);
process.exit(fails ? 1 : 0);
