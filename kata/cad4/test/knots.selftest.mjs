/* CAD⁴'s knots selftest: a trefoil of thread comes undone through the spare direction with nothing touched, and
   cannot without it; the same trefoil as a tube is blocked; a yarn of tubes holds an outer tube every way across.
   node kata/cad4/test/knots.selftest.mjs   (~25 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const T = PARTS.knot, lifted = K.sweep(T, "strand", "rest", T.path, 8, 16).worst, flat = K.sweep(T, "strand", "rest", [{ lift: 0, push: 0 }, { lift: 0, push: 1 }], 10, 16).worst;
ok(["knot", "tubeknot", "tubeyarn"].every((k) => ORDER.includes(k)) && lifted === 0 && flat > 0, "a trefoil of thread: one strand lifted into w, carried through the other's place and set down touches nothing, so the crossing changes and the knot is a loop; pushed through without the lift it collides");
const U = PARTS.tubeknot; ok(K.fit(U, "strand", "rest", {}, 16).overlap === 0 && K.sweep(U, "strand", "rest", [{ push: 0 }, { push: 1 }], 10, 16).worst > 0, "the same trefoil as a tube: built with nothing touching, and the strand pushed at the crossing meets the other (there is no spare direction left to lift into)");
const Y = PARTS.tubeyarn, hit = (v) => K.fit(Y, "one", "others", v, 14).overlap > 0, row = ["ox", "oy", "oz", "ow"].map((k) => (hit({ [k]: -0.3 }) ? "x" : ".") + (hit({ [k]: 0.3 }) ? "x" : ".")).join(" ");
ok(!hit({}) && row === "xx xx xx xx", `a yarn of tubes: six wound round a seventh touch nothing as built, and an outer one pushed 0.3 any way runs into the rest (${row} along x, y, z, w)`);
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
