/* CAD⁴'s assemblies selftest, the links: the hinge swings clear and binds when it should; linked rings part through
   w; a ring through a sphere, the ring–sphere chain and the tiger chain hold. (Textiles and machines have their own
   files, to keep each under preflight's cap.)   node kata/cad4/test/assemblies.selftest.mjs   (~35 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const P = Math.PI, off = (a, b) => Math.abs(a / b - 1), pc = (x) => (x * 100).toFixed(2) + "%";

{ // the hinge
  const H = PARTS.hinge, at30 = H.check.map(([a, b]) => K.fit(H, a, b)), sw = K.sweep(H, "frame", "door", "open", 0, 150, 10, 20), flat = K.fit(H, "frame", "door", { open: 176 }), fat = K.fit(H, "door", "pin", { gap: -0.04 });
  ok(at30.every((f) => f.overlap === 0 && f.gap > 0.01 && f.gap < 0.09) && sw.worst === 0, `the hinge at 30°: nothing overlaps, gaps ${at30.map((f) => f.gap.toFixed(3)).join(", ")} (0.03 designed, read on a ${at30[0].h.toFixed(3)} grid); swung 0° to 150° the leaves never touch`);
  ok(flat.overlap > 1e-3 && fat.overlap > 1e-4, `and it binds when it should: folded to 176° the leaves share ${flat.overlap.toFixed(3)}; a pin 0.04 too fat shares ${fat.overlap.toFixed(4)} with the door`);
  // the pin is what a 4D hinge needs: the door, turned in x–y, keeps every point of the z–w plane where it was
  const s = K.compile(H), a = s.parts[1].sdf, moved = K.compile(H, { open: 97 }).parts[1].sdf; let fix = 0, mv = 0;
  for (let i = 0; i < 200; i++) { const z = Math.sin(i) * 0.25, w = Math.cos(i * 1.7) * 0.8; fix = Math.max(fix, Math.abs(a(0, 0, z, w) - moved(0, 0, z, w))); mv = Math.max(mv, Math.abs(a(1.2, 0.02, z, w) - moved(1.2, 0.02, z, w))); }
  ok(fix < 1e-12 && mv > 0.1, `the door turns about a plane: on the z–w plane through the pin nothing changes as it opens (${fix.toExponential(1)}), off it everything does`);
}
{ // loops don't link in 4D
  const C = PARTS.chain, through = K.sweep(C, "a", "b", C.path, 6, 24), inSlice = K.sweep(C, "a", "b", "pull", 0, 3, 12, 24), linked = K.fit(C, "a", "b");
  ok(linked.overlap === 0 && linked.gap > 0.3 && inSlice.worst > 1e-3 && through.worst === 0 && through.steps.length === 19, `two linked rings: pulled apart inside the slice they collide (overlap up to ${inSlice.worst.toFixed(3)}); lifted through w, slid and lowered they never touch (${through.steps.length} poses, worst overlap ${through.worst})`);
}
{ // a ring and a sphere do
  const L = PARTS.lock; let free = 0, least = Infinity; const dirs = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]];
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
  while (dirs.length < 20) { const v = [rnd(), rnd(), rnd(), rnd()], l = Math.hypot(...v); if (l > 0.2 && l < 1) dirs.push(v.map((x) => x / l)); }
  for (const v of dirs) { const far = { sx: 3 * v[0], sy: 3 * v[1], sz: 3 * v[2], sw: 3 * v[3] }, s = K.sweep(L, "sphere", "ring", [{ sx: 0, sy: 0, sz: 0, sw: 0 }, far], 20, 24), end = s.steps[s.steps.length - 1].overlap; if (s.worst === 0) free++; if (end === 0) least = Math.min(least, s.worst); }
  ok(free === 0 && K.fit(L, "sphere", "ring").overlap === 0 && least > 1e-4, `a ring threaded through a hollow sphere: untouched where it sits, and all ${dirs.length} straight ways out (the eight axes and twelve at random) pass through the sphere (least overlap on a way that ends clear: ${least.toExponential(1)})`);
}
{ // a chain that is one: tigers, big, small, big
  const T = PARTS.tigers, rest = T.check.map(([a, b]) => K.fit(T, a, b)), dirs = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]];
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1; while (dirs.length < 16) { const v = [rnd(), rnd(), rnd(), rnd()], l = Math.hypot(...v); if (l > 0.2 && l < 1) dirs.push(v.map((x) => x / l)); }
  const free = { a: 0, c: 0 }; for (const end of ["a", "c"]) for (const v of dirs) if (K.sweep(T, "m", end, [{ bx: 0, by: 0, bz: 0, bw: 0 }, { bx: 4.5 * v[0], by: 4.5 * v[1], bz: 4.5 * v[2], bw: 4.5 * v[3] }], 18, 18).worst === 0) free[end]++;
  ok(rest.every((f) => f.overlap === 0) && rest[0].gap > 0.15 && rest[1].gap > 0.15 && free.a === 0 && free.c === 0, `the tiger chain: nothing touches at rest (gaps ${rest[0].gap.toFixed(2)}, ${rest[1].gap.toFixed(2)}), and the middle link cannot leave either end: all ${dirs.length} straight ways out collide, with each end taken alone`);
  const ends = K.sweep(T, "a", "c", "pull", 0, 3, 10, 20), load = K.sweep(T, "m", "c", "pull", 0, 1.2, 10, 20);
  ok(ends.worst === 0 && load.worst > 1e-3, `its ends hold each other only through the middle: alone they slide apart untouched, but pulled, the end runs into the middle link (overlap ${load.worst.toFixed(3)})`);
}
{ // and the other: ring, sphere, ring
  const T = PARTS.links, rest = T.check.map(([a, b]) => K.fit(T, a, b)), dirs = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0], [0, 0, 0, 1], [0, 0, 0, -1]];
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1; while (dirs.length < 16) { const v = [rnd(), rnd(), rnd(), rnd()], l = Math.hypot(...v); if (l > 0.2 && l < 1) dirs.push(v.map((x) => x / l)); }
  let free = 0; for (const end of ["a", "c"]) for (const v of dirs) if (K.sweep(T, "sphere", end, [{ sx: 0, sy: 0, sz: 0, sw: 0 }, { sx: 4 * v[0], sy: 4 * v[1], sz: 4 * v[2], sw: 4 * v[3] }], 18, 20).worst === 0) free++;
  const ends = K.sweep(T, "a", "c", "pull", 0, 2, 6, 20), load = K.sweep(T, "sphere", "c", "pull", 0, 2, 10, 22);
  ok(rest.every((f) => f.overlap === 0) && rest[0].gap > 0.3 && free === 0 && ends.worst === 0 && load.worst > 1e-4, `the ring–sphere chain: nothing touches at rest (gap ${rest[0].gap.toFixed(2)}); the sphere cannot leave either ring (all ${dirs.length} straight ways collide, each ring alone); the rings alone never meet, but a pulled ring bears on the sphere (overlap ${load.worst.toFixed(4)})`);
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
