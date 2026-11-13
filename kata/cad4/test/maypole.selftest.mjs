/* CAD⁴'s maypole selftest: six hoses braided round a hose pole. No dancer's hose can be moved off, and the pole cannot
   be pulled out sideways.   node kata/cad4/test/maypole.selftest.mjs   (~20 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const T = PARTS.maypole, hit = (a, b, k, to) => K.fit(T, a, b, { [k]: to }, 12).overlap > 0, row = (keys, pairs) => keys.map((k) => [-0.3, 0.3].map((to) => (pairs.some(([a, b]) => hit(a, b, k, to)) ? "x" : ".")).join("")).join(" ");
ok(ORDER.includes("maypole") && T.check.every(([a, b]) => K.fit(T, a, b, {}, 12).overlap === 0), "the maypole is built with nothing touching: a hose pole, three hoses one way round it and three the other");
const d = row(["ox", "oy", "oz"], [["dancer", "others"], ["dancer", "pole"]]); ok(d === "xx xx xx", `a dancer's hose pushed 0.3 across the braid runs into it (${d} along x, y, z)`);
const p = row(["px", "py", "pz"], [["pole", "others"]]); ok(p === "xx xx xx", `the pole pushed 0.3 sideways runs into the braid (${p} along x, y, z)`);
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
