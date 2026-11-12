/* HOUSE's selftest: the walker in CAD⁴'s room. You stand on the floor; a wall stops you; the closed door stops you and
   the open one lets you out; the doorway is a hole in three directions, so a metre ana of it the same walk meets wall;
   you can only get to the direction you can't see by turning into it, after which you walk there like anywhere else;
   the table holds you up; and the room has no other way out (a blind walk in every ground direction ends inside or
   through the door or a window sill too high to step over).   node kata/house/test/house.selftest.mjs   (~3 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), { compile } = await import(path.join(here, "../../cad4/js/kernel.js")), { PARTS } = await import(path.join(here, "../../cad4/js/parts.js")), Wk = await import(path.join(here, "../js/walk.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const world = (open) => compile(PARTS.room, { open }).sdf, dt = 1 / 60;
const walk = (f, from, inp, secs, prep) => { const W = Wk.makeWalker(from); if (prep) prep(W); for (let t = 0; t < 1.5; t += dt) Wk.step(W, f, {}, dt); for (let t = 0; t < secs; t += dt) Wk.step(W, f, inp, dt); return W; };
{
  const shut = world(0), open = world(100);
  const rest = walk(shut, [0.6, 0.5, 0.6, -0.6], {}, 0.5);
  ok(Math.abs(rest.p[1]) < 0.03 && rest.grounded && Math.hypot(rest.p[0] - 0.6, rest.p[2] - 0.6, rest.p[3] + 0.6) < 1e-6, `dropped into the room you land on the floor and stay put (height ${rest.p[1].toFixed(3)})`);
  const wall = walk(shut, [0, 0, 1.2, 0], { move: [1, 0, 0] }, 4), door0 = walk(shut, [0, 0, 0, 0], { move: [1, 0, 0] }, 4), door1 = walk(open, [0, 0, 0, 0], { move: [1, 0, 0] }, 2);
  ok(wall.p[0] < 1.75 && wall.p[0] > 1.5 && door0.p[0] < 2.2 && door1.p[0] > 4 && Math.abs(door1.p[1]) < 0.03, `walking ahead: the wall stops you at x = ${wall.p[0].toFixed(2)}, the shut door at ${door0.p[0].toFixed(2)}, and through the open one you are outside at ${door1.p[0].toFixed(2)}`);
  const beside = walk(open, [0, 0, 0, 1.1], { move: [1, 0, 0] }, 4), edge = walk(open, [0, 0, 0, 0.2], { move: [1, 0, 0] }, 2), jamb = walk(open, [0, 0, 0, 0.45], { move: [1, 0, 0] }, 2);
  ok(beside.p[0] < 1.75 && Math.abs(beside.p[3] - 1.1) < 0.02 && edge.p[0] > 4 && jamb.p[0] < 2.2, `the doorway is a hole in three directions: the same walk from 1.1 ana of it meets wall (x = ${beside.p[0].toFixed(2)}), from 0.2 ana it passes, from 0.45 your shoulder catches the jamb`);
  const blind = walk(shut, [0, 0, 0, 0], { move: [1, 1, 0] }, 3);
  ok(Math.abs(blind.p[3]) < 1e-9, "walking ahead and sideways never moves you along the direction you can't see");
  const turned = walk(shut, [0, 0, 0, 0], { move: [1, 0, 0] }, 3, (W) => Wk.step(W, shut, { into: [Math.PI / 2, 0] }, dt));
  ok(turned.p[3] > 1.5 && turned.p[3] < 1.75 && Math.abs(turned.p[0]) < 0.05 && Math.abs(turned.F[3] - 1) < 1e-6 && Math.abs(Math.abs(turned.N[0]) - 1) < 1e-6, `turn a quarter into it and ahead is ana: you walk to the ana wall (w = ${turned.p[3].toFixed(2)}), and what you can't see now is x`);
  const up = walk(shut, [-0.9, 1, -0.7, 0.6], {}, 1);
  ok(Math.abs(up.p[1] - 0.78) < 0.03 && up.grounded, `the table holds you (standing at ${up.p[1].toFixed(2)})`);
  // no other way out: walk blind from the middle in 26 ground directions with the door shut
  let out = 0, n = 0; for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) { if (!a && !b && !c) continue; n++; const W = Wk.makeWalker([0.5, 0, 0.4, -0.5]); W.F = [a, 0, b, c]; const l = Math.hypot(a, b, c); W.F = W.F.map((v) => v / l); for (let t = 0; t < 6; t += dt) { W.p[0] += W.F[0] * Wk.SPEED * dt; W.p[2] += W.F[2] * Wk.SPEED * dt; W.p[3] += W.F[3] * Wk.SPEED * dt; Wk.step(W, shut, {}, dt); } if (Math.max(Math.abs(W.p[0]), Math.abs(W.p[2]), Math.abs(W.p[3])) > 2.05) out++; }
  ok(out === 0, `with the door shut there is no way out on foot: ${n} straight walks from inside, in every ground direction, all end inside`);
  const sq = Wk.makeWalker(); Wk.step(sq, shut, { look: [0.3, 0], into: [0.2, -0.4] }, dt); Wk.square(sq);
  ok([sq.F, sq.R, sq.N].every((v) => v.filter((x) => Math.abs(x) === 1).length === 1 && v.filter((x) => x === 0).length === 3) && Math.abs(sq.F[0]) + Math.abs(sq.R[0]) + Math.abs(sq.N[0]) === 1, "squaring up puts your three directions back on the room's axes");
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
