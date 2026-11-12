/* CAD⁴'s textiles selftest: a thread weaves with ribbons and not with threads; cloth of sheets; a bundle holds in a
   sphere-hoop and not in a ring; the rope and its sheath.   node kata/cad4/test/textiles.selftest.mjs   (~30 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const P = Math.PI, off = (a, b) => Math.abs(a / b - 1), pc = (x) => (x * 100).toFixed(2) + "%";

{ // what catches on what: thread and ribbon, rods and hoops
  const way = (T, part, k, to) => Math.max(...T.check.filter((c) => c[0] === part).map(([a, b]) => K.sweep(T, a, b, [{ [k]: 0 }, { [k]: to }], 16, 20).worst)) > 0;
  const W = PARTS.weave, bound = ["tz", "tw"].every((k) => way(W, "thread", k, 2.2) && way(W, "thread", k, -2.2)), slides = ["tx", "ty"].every((k) => !way(W, "thread", k, 2.2) && !way(W, "thread", k, -2.2));
  const round = (T) => K.sweep(T, "thread", "ribbons", [{ ty: 0, tw: 0 }, { ty: 0.5, tw: 0 }, { ty: 0.5, tw: 2 }], 12, 20).worst, narrow = { ...W, params: { ...W.params, width: 0.15 } };
  ok(K.fit(W, "thread", "ribbons").overlap === 0 && bound && slides && round(W) > 0 && round(narrow) === 0, `the weave: a thread over, under, over three ribbons cannot move along w or z, and slides freely along the ribbons (x, y); stepped 0.5 aside it is still caught by a ribbon 1.6 wide, and walks free past one 0.15 wide (threads don't weave with threads)`);
  const H = PARTS.hoop, R = PARTS.ringed, side = (T) => ["ox", "oy", "oz"].map((k) => (way(T, "rod", k, 3) ? "x" : ".") + (way(T, "rod", k, -3) ? "x" : ".")).join(" ");
  ok(side(H) === "xx xx xx" && !way(H, "rod", "ow", 3) && side(R) === "xx xx .." && K.fit(H, "rod", "hoop").overlap === 0, `a bundle of rods: in a sphere-hoop the outer rod cannot leave sideways (${side(H)} along x, y, z) and slides only along its length; in a ring it walks out along z (${side(R)})`);
  // the wire is an exact distance: a straight one is a capsule (spherinder with round ends)
  const cap = K.measure(K.compile({ op: "wire", r: 0.3, pts: [[0, 0, 0, -1], [0, 0, 0, 1]] })), ex = (4 / 3) * P * 0.027 * 2 + (P * P / 2) * 0.0081;
  ok(off(cap.volume, ex) < 0.02, `wire: a straight run of radius 0.3 and length 2 has the 4-volume of a 3-ball swept plus a 4-ball of ends (${cap.volume.toFixed(4)} against ${ex.toFixed(4)})`);
}
{ // 4D cloth: sheets woven on sheets
  const T = PARTS.cloth, way = (k, to) => Math.max(...T.check.map(([a, b]) => K.sweep(T, a, b, [{ [k]: 0 }, { [k]: to }], 16, 20).worst)) > 0;
  const held = ["sy", "sz", "sw"].every((k) => way(k, 3.2) && way(k, -3.2)), slides = !way("sx", 3.2) && !way("sx", -3.2), rest = [["sheet", "warp"], ["sheet", "weft"], ["warp", "weft"]].map(([a, b]) => K.fit(T, a, b).overlap);
  ok(rest.every((v) => v === 0) && held && slides, "the cloth: two families of crimped sheets, chequered over and under along their crossing lines, touch nowhere; a sheet cannot leave along y, z or w, and slides only along x, the direction every sheet runs");
  const w3 = K.measure(K.compile({ op: "wire", dim: 3, r: 0.25, pts: [[0, 0, -1], [0, 0, 1]] })), ex3 = P * 0.0625 * 2 + (4 / 3) * P * 0.015625;
  ok(w3.dim === 3 && off(w3.volume, ex3) < 0.01, `a wire may be 3D, to be extruded into a sheet: a straight one is a capsule (${w3.volume.toFixed(4)} against ${ex3.toFixed(4)})`);
}
{ // the rope: a bundle in a sheath woven of sphere-hoops and bands
  const T = PARTS.rope, rest = T.check.map(([a, b]) => K.fit(T, a, b, {}, 18).overlap), way = (k, to) => Math.max(...T.check.filter((c) => c[0] === "fibre").map(([a, b]) => K.sweep(T, a, b, [{ [k]: 0 }, { [k]: to }], 10, 16).worst)) > 0;
  const side = ["ox", "oy", "oz"].every((k) => way(k, 1.5) && way(k, -1.5)), along = !way("ow", 3) && !way("ow", -3);
  const S = { ...T, params: { ...T.params, hx: 0, hy: 0, hw: 0 }, parts: { ...T.parts, moved: { op: "move", by: ["hx", "hy", 0, "hw"], of: "hoops" } } }, sheath = [["hx", 0.2, 2], ["hy", 0.2, 2], ["hw", 0.8, 4]].every(([k, to, n]) => K.sweep(S, "moved", "bands", [{ [k]: 0 }, { [k]: to }], n, 16).worst > 0);
  ok(rest.every((v) => v === 0) && side && along && sheath, "the rope: nothing touches at rest; a fibre cannot leave the sheath sideways (x, y, z, both ways) and slides only along the rope; the hoops cannot move along or across the bands they are woven with");
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
