/* CAD⁴'s maypole selftest: six hoses braided round a hose pole. No dancer's hose can be moved off, and the pole cannot
   be pulled out sideways. Ribbons on the same pole stay wound on it but slide clear of each other.   node kata/cad4/test/maypole.selftest.mjs   (~20 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const T = PARTS.maypole, hit = (a, b, k, to) => K.fit(T, a, b, { [k]: to }, 12).overlap > 0, row = (keys, pairs) => keys.map((k) => [-0.3, 0.3].map((to) => (pairs.some(([a, b]) => hit(a, b, k, to)) ? "x" : ".")).join("")).join(" ");
ok(ORDER.includes("maypole") && T.check.every(([a, b]) => K.fit(T, a, b, {}, 12).overlap === 0), "the maypole is built with nothing touching: a hose pole, three hoses one way round it and three the other");
const d = row(["ox", "oy", "oz"], [["dancer", "others"], ["dancer", "pole"]]); ok(d === "xx xx xx", `a dancer's hose pushed 0.3 across the braid runs into it (${d} along x, y, z)`);
const p = row(["px", "py", "pz"], [["pole", "others"]]); ok(p === "xx xx xx", `the pole pushed 0.3 sideways runs into the braid (${p} along x, y, z)`);
{ // ribbons on a hose: the wrap is held, the over-and-under is not
  const R = PARTS.ribbonpole, f = (a, b, v) => K.fit(R, a, b, v, 12).overlap > 0;
  const wrap = [["ox", 0.3], ["ox", -0.3], ["oy", 0.3], ["oy", -0.3], ["oz", 0.3], ["oz", -0.3]].every(([k, to]) => f("ribbon", "pole", { [k]: to }));
  ok(R.check.every(([a, b]) => !f(a, b, {})) && wrap, "ribbons on a hose: nothing touches as built, and a ribbon pushed 0.3 any way across (x, y, z, both ways) runs into the pole it is wound on");
  const slide = K.sweep(R, "ribbon", "others", [{ round: 0 }, { round: 150 }], 8, 12).worst === 0 && K.fit(R, "ribbon", "pole", { round: 150 }, 12).overlap === 0;
  const there = [{ ox: -0.26, oz: 0.15 }, { ox: 0.26, oz: -0.15 }, { oy: 0.3 }, { oy: -0.3 }].every((v) => f("ribbon", "pole", { round: 150, ...v }) && !f("ribbon", "others", { round: 150, ...v }));
  ok(slide && there, "and the ribbons are not braided to each other: one slides 150° round the pole past the others' edges touching nothing, and there it is clear of them and still held by the pole");
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
