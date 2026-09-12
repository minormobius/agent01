#!/usr/bin/env node
// drawing.mjs — an engineering drawing as SVG: three views (third angle),
// hidden lines dashed, overall dimensions, every hole called out with its
// diameter and count. From the exact mesh, no browser needed — the picture a
// reviewer or a machinist reads, next to the numbers the other tools give.
//
//   node agent/drawing.mjs bench/plate.json --out plate.svg
//   node agent/drawing.mjs bench/lift.json  --out lift.svg --t 0.5      # an assembly, posed
//   node agent/drawing.mjs bench/cam.json   --views front,top,iso --no-hidden --width 1200
//
// Prints a summary (views, overall size, callouts) and writes the SVG; --json
// writes the summary too. Exit 1 when the exact build fails.
import fs from 'node:fs';
import path from 'node:path';
import { flatten, solveAngles, modelOf } from '../lib/assembly.js';
import { drawing } from '../lib/drawing.js';
import { readDoc, isAssembly, benchRef, kernels, facesOf, arg, has } from './common.mjs';

const src = process.argv[2]; if (!src) { console.error('usage: node agent/drawing.mjs <part-or-assembly.json> [--out file.svg] [--views front,top,right] [--no-hidden] [--t s] [--width px] [--json]'); process.exit(2); }
const doc = readDoc(src);
const name = path.basename(src, '.json');
const out = arg('--out', `${name}.svg`);
const views = arg('--views', 'front,top,right').split(',').map((s) => s.trim()).filter(Boolean);
const opts = { views, hidden: !has('--no-hidden'), title: name, width: Number(arg('--width', '900')) };
const { engine } = await kernels();

let bodies;
if (!isAssembly(doc)) {
  const r = engine.build(JSON.stringify(doc), { kernel: 'truck' });
  if (!r.ok) { console.error(`✗ exact build failed: ${r.report.error?.op}: ${r.report.error?.msg}`); process.exit(1); }
  bodies = [{ id: name, mesh: r.mesh, faces: r.report.faces }];
} else {
  const t = Number(arg('--t', '0'));
  const { components, mates, drive, partTrees } = await flatten(doc, benchRef, { facesOf });
  const angles = solveAngles(components, mates, drive, t);
  const built = new Map();
  for (const [key, tree] of partTrees) { const r = engine.build(tree, { kernel: 'truck' }); if (!r.ok) { console.error(`✗ ${key}: exact build failed: ${r.report.error?.op}: ${r.report.error?.msg}`); process.exit(1); } built.set(key, r); }
  bodies = components.filter((c) => !c.reference).map((c) => ({ id: c.id, mesh: built.get(c.partKey).mesh, model: modelOf(c, angles), faces: built.get(c.partKey).report.faces }));
  opts.note = `t = ${t} s`;
}
const d = drawing(bodies, opts);
fs.writeFileSync(out, d.svg);
const fmt = (x) => +x.toFixed(3);
console.log(`${out}  ${d.width}×${d.height} px, scale ${d.scale}, ${d.units}, overall ${d.overall.map(fmt).join(' × ')}, ${d.ms.toFixed(0)} ms`);
for (const v of d.views) console.log(`  ${v.name.padEnd(7)} ${fmt(v.width)} × ${fmt(v.height)}  ${v.visible} visible, ${v.hidden} hidden lines${v.callouts ? `, ${v.callouts} holes called out` : ''}`);
const groups = new Map(); for (const h of d.holes) { const k = `${h.diameter.toFixed(4)}|${h.depth.toFixed(3)}`; groups.set(k, (groups.get(k) || 0) + 1); }
for (const [k, n] of groups) { const [dia, depth] = k.split('|').map(Number); console.log(`  ${n}× ⌀${fmt(dia)} depth ${fmt(depth)}`); }
if (has('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ ...d, svg: undefined }, null, 1));
