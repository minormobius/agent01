/* CAD⁴'s kernel selftest: the kernel against closed forms (4-volume and boundary of the ball, tesseract, spherinder,
   cubinder, duocylinder, tiger and ring; second moments; a revolve against the ball it should make), cross-sections (a
   ball's slice, the tesseract's corner-on octahedron, the tiger's two rings; the mesh closed, the STL the right
   length), what must be refused, and the GLSL the same tree compiles to. The library's assemblies have their own:
   assemblies.selftest.mjs.   node kata/cad4/test/cad4.selftest.mjs   (~35 s) */
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
{ // a lattice of copies costs one evaluation and is exact
  const s = K.compile({ op: "array", step: [1, 0, 1, 1], lo: [-1, 0, -1, -1], hi: [1, 0, 1, 1], of: { op: "ball", dim: 4, r: 0.3 } }), m = K.measure(s, 40); let worst = 0, seed = 1; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 5 - 2.5;
  for (let i = 0; i < 3000; i++) { const p = [rnd(), rnd() * 0.3, rnd(), rnd()]; let b = 1e9; for (const a of [-1, 0, 1]) for (const c of [-1, 0, 1]) for (const e of [-1, 0, 1]) b = Math.min(b, Math.hypot(p[0] - a, p[1], p[2] - c, p[3] - e) - 0.3); worst = Math.max(worst, Math.abs(b - s.sdf(...p))); }
  ok(worst < 1e-12 && off(m.volume, 27 * (P * P / 2) * 0.3 ** 4) < 0.02 && /clamp\(floor/.test(s.glsl), `array: 27 balls on a lattice from one ball, the distance equal to brute force over all 27 (worst ${worst.toExponential(0)}), 4-volume ${m.volume.toFixed(3)}`);
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
