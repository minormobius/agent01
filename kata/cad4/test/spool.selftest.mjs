/* CAD⁴'s spool selftest: nine turns wound in a raster on a disc-times-square barrel. With its frame of four cheeks the
   winding is stopped every way; with the flange away it slides off along either axle direction.
   node kata/cad4/test/spool.selftest.mjs   (~25 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const T = PARTS.spool, hit = (v) => K.fit(T, "rope", "body", v, 14).overlap > 0, row = (v) => ["rx", "ry", "rz", "rw"].map((k) => (hit({ ...v, [k]: -0.7 }) ? "x" : ".") + (hit({ ...v, [k]: 0.7 }) ? "x" : ".")).join(" ");
const on = row({ flange: 1 }); ok(ORDER.includes("spool") && !hit({}) && on === "xx xx xx xx", `the spool: nine turns touch nothing as wound, and pushed 0.7 any way they run into barrel or flange (${on} along x, y, z, w)`);
const offZ = K.sweep(T, "rope", "body", [{ flange: 0, rz: 0 }, { flange: 0, rz: 1.4 }], 7, 14).worst, offW = K.sweep(T, "rope", "body", [{ flange: 0, rw: 0 }, { flange: 0, rw: 1.4 }], 7, 14).worst, stay = hit({ flange: 0, rx: 0.7 }) && hit({ flange: 0, ry: 0.7 });
ok(offZ === 0 && offW === 0 && stay, "with the flange away the winding slides 1.4 off the barrel along z, and along w, touching nothing; it still cannot leave across the barrel (x, y)");
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
