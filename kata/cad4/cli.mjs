#!/usr/bin/env node
/* CAD⁴ from a terminal: the kernel without the page.
     node kata/cad4/cli.mjs measure <tree.json | part> [name=value …]
     node kata/cad4/cli.mjs fit     <tree.json | part> <a> <b> [name=value …]
     node kata/cad4/cli.mjs sweep   <tree.json | part> <a> <b> <param> <from> <to> [steps]
     node kata/cad4/cli.mjs slice   <tree.json | part> <out.stl> [w=0.3] [name=value …]     (the slice x, y, z at that w)
     node kata/cad4/cli.mjs glsl    <tree.json | part>
   A part is a name from js/parts.js (ball, tesseract, …, hinge, chain, lock) or a file holding a feature tree. */
import fs from "node:fs";
import * as K from "./js/kernel.js";
import { PARTS } from "./js/parts.js";
const [cmd, src, ...rest] = process.argv.slice(2);
if (!cmd || !src) { console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].split("\n").slice(1).join("\n")); process.exit(1); }
const tree = PARTS[src] || JSON.parse(fs.readFileSync(src, "utf8")), kv = {}, args = [];
for (const a of rest) { const m = /^(\w+)=(-?[\d.e+-]+)$/.exec(a); if (m) kv[m[1]] = +m[2]; else args.push(a); }
const r = (x) => +x.toFixed(5);
if (cmd === "measure") { const m = K.measure(K.compile(tree, kv)), d = m.dim, planes = {}; for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) planes["xyzw"[i] + "xyzw"[j]] = r(K.inertia(m, i, j));
  console.log(JSON.stringify({ dim: d, volume: r(m.volume), boundary: r(m.boundary), centroid: m.centroid.map(r), inertia: planes, extent: m.bbox.lo.map((v, i) => r(m.bbox.hi[i] - v)), resolution: r(m.h) }, null, 1)); }
else if (cmd === "fit") { const f = K.fit(tree, args[0], args[1], kv); console.log(JSON.stringify({ overlap: r(f.overlap), gap: f.gap === Infinity ? "far" : r(f.gap), resolution: r(f.h) })); process.exitCode = f.overlap > 0 ? 2 : 0; }
else if (cmd === "sweep") { const s = K.sweep(tree, args[0], args[1], args[2], +args[3], +args[4], +(args[5] || 12)); for (const q of s.steps) console.log(`${args[2]} = ${r(q[args[2]])}\toverlap ${r(q.overlap)}`); console.log(`worst ${r(s.worst)}`); process.exitCode = s.worst > 0 ? 2 : 0; }
else if (cmd === "slice") { const { w = 0, ...p } = kv, m = K.mesh(K.slice(K.compile(tree, p), [0, 0, 0, w]), 96); fs.writeFileSync(args[0], K.stl(m)); console.log(`${args[0]}: ${m.count} triangles, volume ${r(m.volume)}, area ${r(m.area)}`); }
else if (cmd === "glsl") console.log(K.compile(tree, kv).glsl);
else { console.error(`unknown command ${cmd}`); process.exit(1); }
