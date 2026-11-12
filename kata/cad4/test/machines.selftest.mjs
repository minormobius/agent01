/* CAD⁴'s machines selftest: the pulley's cupped seat and four-cheeked block; the block and tackle; the room.
   node kata/cad4/test/machines.selftest.mjs   (~25 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const P = Math.PI, off = (a, b) => Math.abs(a / b - 1), pc = (x) => (x * 100).toFixed(2) + "%";

{ // the pulley: a rope's seat has to be a cup
  const T = PARTS.pulley, rest = T.check.map(([a, b]) => K.fit(T, a, b, {}, 18).overlap), way = (k, to, ov = {}) => Math.max(...T.check.filter((c) => c[0] === "rope").map(([a, b]) => K.sweep(T, a, b, [{ ...ov, [k]: 0 }, { ...ov, [k]: to }], 6, 16).worst)) > 0;
  const cup = ["rz", "rw"].every((k) => way(k, 0.6) && way(k, -0.6)), trough = way("rz", 0.6, { open: 0.7, guard: 0 }) && !way("rw", 1.6, { open: 0.7, guard: 0 }), flat = !way("rw", 1.6, { flange: 0, guard: 0 }), guarded = way("rw", 0.8, { flange: 0 }) && way("rw", -0.8, { flange: 0 });
  const spin = Math.max(...[["wheel", "pin"], ["wheel", "block"], ["rope", "wheel"]].map(([a, b]) => K.sweep(T, a, b, "turn", 0, 90, 3, 16).worst));
  ok(rest.every((v) => v === 0) && cup && trough && flat && guarded && spin === 0, "the pulley: nothing touches, and the wheel turns a quarter turn (it has four-fold symmetry) clear of pin, block and rope; in a cupped groove the rope cannot leave along z or w; open the groove along w (our groove) and it walks off through w; with no flange and a block like ours (cheeks across z only) it leaves through w; two more cheeks across w hold it");
}
{ // the block and tackle
  const T = PARTS.tackle, len = (lift) => { const P = T.ropePts.map((q) => q.map((v) => K.num(v, { lift }))); let l = 0; for (let i = 1; i < P.length; i++) l += Math.hypot(...P[i].map((v, k) => v - P[i - 1][k])); return { l, hand: P[P.length - 1][1] }; };
  const a = len(0), b = len(0.6), c = len(1.2), clear = [0, 0.6, 1.2].every((lift) => T.check.every(([x, y]) => K.fit(T, x, y, { lift }, 16).overlap === 0));
  ok(clear && Math.abs(a.l - b.l) < 1e-9 && Math.abs(a.l - c.l) < 1e-9 && Math.abs(a.hand - c.hand - 2.4) < 1e-9, `the block and tackle: raised 1.2, nothing touches on the way, the rope keeps its length (${a.l.toFixed(3)}) and the hand comes down ${(a.hand - c.hand).toFixed(1)}: twice the lift, so half the pull`);
}
{ // the room
  const T = PARTS.room, s0 = K.compile(T, { open: 0 }).sdf, s1 = K.compile(T, { open: 100 }).sdf, swing = Math.max(K.sweep(T, "door", "house", "open", 0, 110, 11, 24).worst, K.sweep(T, "door", "ground", "open", 0, 110, 4, 20).worst);
  ok(swing === 0 && s0(2.24, 1, 0, 0) < 0 && s1(2.24, 1, 0, 0) > 0.2 && s1(2.1, 1, 0, 0) > 0.2 && s1(2.1, 1, 0, 1) < 0 && s1(2.1, 2.3, 0, 0) < 0 && s0(0, 1.3, 1, -1) > 0.5, "the room: the door swings from shut to 110° clear of the wall and the ground; shut, it fills the way out; open, the doorway is air at w = 0 and wall a metre ana of it and above the lintel");
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
