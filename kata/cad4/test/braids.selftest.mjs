/* CAD⁴'s braids selftest: a plait of hoses holds in every direction; the same plait in flat ribbons slides off along
   the ribbons' width and comes apart.   node kata/cad4/test/braids.selftest.mjs   (~40 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const hit = (T, legs) => K.sweep(T, "third", "others", legs, 8, 14).worst > 0, row = (T) => ["ox", "oy", "oz", "ow"].map((k) => (hit(T, [{ [k]: 0 }, { [k]: -1.6 }]) ? "x" : ".") + (hit(T, [{ [k]: 0 }, { [k]: 1.6 }]) ? "x" : ".")).join(" ");
const H = PARTS.hosebraid, R = PARTS.ribbonbraid;
ok(ORDER.includes("hosebraid") && ORDER.includes("ribbonbraid") && [H, R].every((T) => T.check.every(([a, b]) => K.fit(T, a, b, {}, 14).overlap === 0)), "both plaits are built with nothing touching");
const h = row(H); ok(h === "xx xx xx xx", `the hose braid: one hose cannot be moved off the other two in any direction (${h} along x, y, z, w)`);
const r = row(R); ok(r === "xx xx .. xx", `the ribbon braid: held in x, y and along its length, free along the ribbons' width (${r})`);
ok(!hit(R, [{ oz: 0, ox: 0 }, { oz: 1.3, ox: 0 }, { oz: 1.3, ox: 0.9 }]) && !hit(R, [{ oz: 0, ox: 0, width: 0.15 }, { oz: 0.5, ox: 0, width: 0.15 }, { oz: 0.5, ox: 0.9, width: 0.15 }]), "the ribbon braid comes apart untouched: slide one ribbon past the others' edges (1.3 at width 0.5, 0.5 at width 0.15) and lift it away");
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
