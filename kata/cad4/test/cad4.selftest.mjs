/* CAD⁴'s selftest: the kernel against closed forms (4-volume and boundary of the ball, tesseract, spherinder, cubinder,
   duocylinder, tiger and ring; second moments; a revolve against the ball it should make), cross-sections (a ball's
   slice, the tesseract's corner-on octahedron, the tiger's two rings; the mesh closed, the STL the right length),
   what must be refused, the GLSL the same tree compiles to, and the page's claims about its assemblies: the hinge
   swings clear and binds when folded flat or when the pin is too fat; two linked rings part through w without
   touching and cannot part inside the slice; a ring through a sphere collides on every way out.
   node kata/cad4/test/cad4.selftest.mjs   (~40 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), K = await import(path.join(here, "../js/kernel.js")), { PARTS, ORDER } = await import(path.join(here, "../js/parts.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const P = Math.PI, off = (a, b) => Math.abs(a / b - 1), pc = (x) => (x * 100).toFixed(2) + "%";

{ // closed forms
  const exact = { ball: [P * P / 2, 2 * P * P], tesseract: [1.6 ** 4, 8 * 1.6 ** 3], spherinder: [(4 / 3) * P * 1.6, 4 * P * 1.6 + (8 / 3) * P], cubinder: [P * 2.56, 2 * P * 2.56 + 6.4 * P], duocylinder: [P * P, 4 * P * P],
    tiger: [4 * P * P * 1.1 * 0.9 * P * 0.09, 4 * P * P * 1.1 * 0.9 * 2 * P * 0.3], ring: [2 * P * 1.2 * (4 / 3) * P * 0.027, 2 * P * 1.2 * 4 * P * 0.09] };
  const M = {};
  for (const k of Object.keys(exact)) { const m = (M[k] = K.measure(K.compile(PARTS[k]))), dv = off(m.volume, exact[k][0]), ds = off(m.boundary, exact[k][1]), thin = k === "ring";
    ok(dv < (thin ? 0.02 : 0.005) && ds < (thin ? 0.015 : 0.01) && Math.hypot(...m.centroid) < 1e-6, `${k}: 4-volume ${m.volume.toFixed(4)} (${pc(dv)} off exact), boundary ${m.boundary.toFixed(3)} (${pc(ds)} off), centred`); }
  // second moments: a 4-ball's is V r²/6 along every axis, a tesseract's V a²/12; turning in a plane takes two of them
  const b = M.ball, t = M.tesseract, ib = K.inertia(b, 0, 3), it = K.inertia(t, 1, 2);
  ok(off(ib, b.volume / 3) < 0.005 && off(it, (t.volume * 2.56) / 6) < 0.005 && Math.abs(b.moments[0][3]) < 1e-6, `inertia for turning in a plane: ball ${ib.toFixed(4)} (V r²/3), tesseract ${it.toFixed(4)} (V a²/6)`);
  // the duocylinder turns more easily in a plane of one of its discs than across them? No: both discs have r²/4 an axis, so all six planes agree
  const d = M.duocylinder, six = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].map(([i, j]) => K.inertia(d, i, j));
  ok(Math.max(...six) / Math.min(...six) < 1.01 && off(six[0], d.volume / 2) < 0.006, `a duocylinder of equal discs has the same inertia in all six planes (${six[0].toFixed(3)} = V/2), though it is no ball`);
}
{ // the ladder: a revolved 3-ball is the 4-ball; parameters; a move and a turn change nothing but place
  const rev = K.measure(K.compile({ op: "revolve", axis: 0, of: { op: "ball", dim: 3, r: 1 } })), big = K.measure(K.compile(PARTS.ball, { r: 2 }), 24);
  ok(off(rev.volume, P * P / 2) < 0.005 && off(big.volume, 8 * P * P) < 0.005, `a 3-ball revolved is the 4-ball (${rev.volume.toFixed(4)}); r = 2 has 16 times the 4-volume (${big.volume.toFixed(2)})`);
  const tess = { op: "box", size: [1.6, 1.6, 1.6, 1.6] }, turned = K.measure(K.compile({ op: "move", by: [0.3, 0, -0.2, 0.5], of: { op: "rotate", plane: [0, 3], deg: 33, of: { op: "rotate", plane: [1, 2], deg: 20, of: tess } } }));
  ok(off(turned.volume, 1.6 ** 4) < 0.005 && off(turned.boundary, 8 * 1.6 ** 3) < 0.015 && Math.hypot(turned.centroid[0] - 0.3, turned.centroid[1], turned.centroid[2] + 0.2, turned.centroid[3] - 0.5) < 2e-3, `a tesseract turned in two planes and moved keeps its 4-volume (${pc(off(turned.volume, 1.6 ** 4))}) and boundary (${pc(off(turned.boundary, 8 * 1.6 ** 3))}); its centroid is where it was put`);
  // booleans: a tesseract with a ball taken from a corner region and one drilled through
  const holed = K.measure(K.compile({ op: "cut", of: [{ op: "box", size: [2, 2, 2, 2] }, { op: "ball", dim: 4, r: 0.8 }] })), drilled = K.measure(K.compile({ op: "cut", of: [{ op: "box", size: [2, 2, 2, 2] }, { op: "disc", r: 0.5 }] }));
  ok(off(holed.volume, 16 - (P * P / 2) * 0.8 ** 4) < 0.005 && off(drilled.volume, 16 - P * 0.25 * 4) < 0.005, `cut: a ball out of a tesseract leaves ${holed.volume.toFixed(3)}; a disc drilled through it removes a disc × a square (${drilled.volume.toFixed(3)})`);
}
{ // cross-sections
  const ball = K.compile(PARTS.ball), s = K.slice(ball, [0, 0, 0, 0.6]), m = K.mesh(s, 64), ex = (4 / 3) * P * 0.64 ** 1.5, ms = K.measure(s);
  ok(off(m.volume, ex) < 0.01 && off(ms.volume, ex) < 0.005 && off(m.area, 4 * P * 0.64) < 0.01, `the ball's slice at w = 0.6 is a ball of radius 0.8: mesh ${m.volume.toFixed(4)}, measured ${ms.volume.toFixed(4)}, exact ${ex.toFixed(4)}`);
  // closed: every edge of the mesh is shared by exactly two triangles
  const key = (i) => `${Math.round(m.tri[i] * 1e5)},${Math.round(m.tri[i + 1] * 1e5)},${Math.round(m.tri[i + 2] * 1e5)}`, edges = new Map(); let degenerate = 0;
  for (let t = 0; t < m.count; t++) { const v = [key(9 * t), key(9 * t + 3), key(9 * t + 6)]; if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) { degenerate++; continue; } for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3], k = a < b ? a + "|" + b : b + "|" + a; edges.set(k, (edges.get(k) || 0) + 1); } }
  let open = 0; for (const c of edges.values()) if (c !== 2) open++;
  const stl = K.stl(m);
  ok(open === 0 && stl.length === 84 + 50 * m.count && new DataView(stl.buffer).getUint32(80, true) === m.count, `its mesh is closed (${m.count} triangles, ${open} open edges${degenerate ? ", " + degenerate + " slivers skipped" : ""}) and the STL is ${stl.length} bytes`);
  // the tesseract cut corner-on, through its middle, is a regular octahedron of volume 4a³/3
  const h = 0.5, oct = K.slice(K.compile(PARTS.tesseract), [0, 0, 0, 0], [[h, h, -h, -h], [h, -h, h, -h], [h, -h, -h, h]]), mo = K.measure(oct);
  ok(off(mo.volume, (4 * 1.6 ** 3) / 3) < 0.01 && off(mo.boundary, 2 * Math.sqrt(3) * (1.6 * Math.SQRT2) ** 2) < 0.02, `the tesseract sliced corner-on is an octahedron: volume ${mo.volume.toFixed(3)} (4a³/3 = ${((4 * 1.6 ** 3) / 3).toFixed(3)}), area ${mo.boundary.toFixed(2)}`);
  // the tiger's slice at w = 0 is two separate rings
  const tg = K.slice(K.compile(PARTS.tiger), [0, 0, 0, 0]), mt = K.measure(tg), between = tg.sdf(1.1, 0, 0), inA = tg.sdf(1.1, 0, 0.9), inB = tg.sdf(1.1, 0, -0.9);
  ok(off(mt.volume, 2 * 2 * P * P * 1.1 * 0.09) < 0.02 && between > 0.5 && inA < 0 && inB < 0, `the tiger's slice at w = 0 is two tori (volume ${mt.volume.toFixed(3)} = 2 × 2π²ar²), with clear space between them`);
}
{ // refusals, and the shader
  const bad = (f) => { try { f(); return false; } catch { return true; } };
  ok(bad(() => K.compile({ op: "product", of: [{ op: "ball", dim: 3, r: 1 }, { op: "disc", r: 1 }] })) && bad(() => K.compile({ op: "ball", dim: 4, r: "alert(1)" })) && bad(() => K.compile({ params: { r: 1 }, show: { op: "ball", r: "r+q" } })) && bad(() => K.measure(K.compile({ op: "move", by: [0, 0, 0, 1], of: { op: "disc", r: 1 } }))) && bad(() => K.compile({ op: "teapot" })) && bad(() => K.compile({ show: "nowhere" })),
    "refused: a product past 4D, an expression that isn't arithmetic on parameters, an unknown parameter, measuring an unbounded prism, an unknown op, a missing part");
  let all = true, why = "";
  for (const k of ORDER) { const s = K.compile(PARTS[k]), g = s.glsl, defs = [...g.matchAll(/^float (\w+)\(vec4 p\)/gm)].map((m) => m[1]);
    // every function is defined once and before it is called; uniform indices are integers and in range; no bare integer where a float is due
    const seen = new Set(); for (const line of g.split("\n")) { const d = /^float (\w+)\(vec4 p\) \{(.*)\}$/.exec(line); if (!d) continue; for (const c of d[2].matchAll(/\b(n\d+)\(/g)) if (!seen.has(c[1])) { all = false; why = `${k}: ${d[1]} calls ${c[1]} before it exists`; } if (seen.has(d[1])) { all = false; why = `${k}: ${d[1]} twice`; } seen.add(d[1]); }
    for (const u of g.replace(/^uniform.*$/m, "").matchAll(/uP\[([^\]]*)\]/g)) if (!/^\d+$/.test(u[1]) || +u[1] >= s.order.length) { all = false; why = `${k}: uP[${u[1]}]`; }
    if (/[^\w.\[](\d+)(?![\w.\]\d])(?=\s*[-+*/),;])/.test(g.replace(/uP\[\d+\]/g, "U").replace(/\bn\d+|part\d+|vec\d/g, "F"))) { all = false; why = `${k}: an integer literal`; }
    if (!defs.includes("sdf") || !defs.includes("part0") || s.parts.length !== (Array.isArray(PARTS[k].show) ? PARTS[k].show.length : 1)) { all = false; why = `${k}: no sdf`; }
    if (!s.bbox.lo.every((v) => Math.abs(v) < 1e8) || !(K.measure(s, 10, 2).volume > 0)) { all = false; why = `${k}: unbounded or empty`; } }
  ok(all, `all ${ORDER.length} library parts compile to GLSL with functions in order, parameters as uniforms, floats as floats, and are bounded and solid${why ? " — " + why : ""}`);
}
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
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
