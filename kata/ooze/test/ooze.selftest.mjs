/* OOZE's selftest. The oracle on the ten: each can be done; each harder than the last; where there's food, it can't
   be done without it. The generator: a seed is a level (the same twice), and what it makes the oracle can do, near the
   difficulty asked for. The game on AMOEBA's engine: a wall stops the cell (it pushes into it and doesn't pass); with
   too little energy it starves; and the bot, flying the oracle's route through the real simulation, wins level 1.
   (All ten were flown once by the bot to confirm them: README.)
     node kata/ooze/test/ooze.selftest.mjs   (~60 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), G = await import(path.join(here, "../js/game.js")), Pl = await import(path.join(here, "../js/play.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };

let prev = -1;
for (const [i, lv] of G.INTRO.entries()) {
  const o = G.oracle(lv), nofood = lv.foods.length ? G.oracle({ ...lv, foods: [] }).solvable : false;
  ok(o.solvable && o.difficulty > prev && !nofood, `${i + 1} ${lv.name}: solvable (difficulty ${o.difficulty}/10, ${o.foodsNeeded} of ${lv.foods.length} food needed, margin ${(o.margin * 100).toFixed(0)}%)${lv.foods.length ? ", impossible without its food" : ""}`);
  prev = o.solvable ? o.difficulty : prev;
}
for (const [seed, diff] of [[11, 0.3], [12, 0.6]]) {
  const a = G.generate(seed, diff), b = G.generate(seed, diff);
  ok(a && JSON.stringify(a.level) === JSON.stringify(b.level) && G.oracle(a.level).solvable && Math.abs(a.oracle.difficulty / 10 - diff) < 0.35, `seed ${seed} at ${diff}: the same level twice, solvable, difficulty ${a ? a.oracle.difficulty : "?"}/10 (${a ? a.level.walls.length : 0} walls, ${a ? a.level.foods.length : 0} food, energy ${a ? a.level.E0 : 0})`);
}
{
  // a wall across the way (every z, every w): the cell pushes into it for 8 s and its membrane never gets through
  const lv = { size: { x: [-2, 8], z: [-3, 3], w: [-3, 3] }, start: [0, 0, 0], goal: { c: [6, 0, 0], r: 0.9 }, walls: [{ lo: [2.2, -3, -3], hi: [2.8, 3, 3] }], foods: [], E0: 100, foodE: 10, eMax: 100 };
  const A = Pl.setup(lv); A.seed = 3; A.steer = { dir: Float64Array.from([1, 0, 0, 0]), s: 1 }; let beyond = -Infinity;
  while (A.t < 8) { Pl.play(A); for (let i = 0; i < A.nv; i++) beyond = Math.max(beyond, A.P[i * 4]); }
  ok(beyond < 2.25 && A.game.state === "playing", `a wall stops it: pushed into a wall at x = 2.2 for 8 s, no part of it past x = ${beyond.toFixed(2)}`);
}
{
  const lv = { ...G.INTRO[0], E0: 1.2 }, A = Pl.setup(lv); A.seed = 4; A.steer = { dir: Float64Array.from([1, 0, 0, 0]), s: 1 };
  while (A.t < 15 && A.game.state === "playing") Pl.play(A);
  ok(A.game.state === "starved", `with too little energy (1.2 for a 6-radius crawl) it starves (at ${A.t.toFixed(1)} s)`);
}
{
  const lv = G.INTRO[0], o = G.oracle(lv), A = Pl.setup(lv); A.seed = 1000;
  while (A.game.state === "playing" && A.t < 40) { Pl.bot(A, o.path); Pl.play(A); }
  ok(A.game.state === "won", `the bot flies level 1 along the oracle's route through the real simulation and wins (${A.t.toFixed(1)} s, ${A.energy.toFixed(1)} energy left of ${lv.E0})`);
}
console.log(`${checks - fails}/${checks} checks`); process.exit(fails ? 1 : 0);
