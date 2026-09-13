#!/usr/bin/env node
// report.mjs — an assembly report as one self-contained HTML page: the
// assembly in three views, an exploded isometric with numbered balloons, a
// parts list, a drawing of every distinct part, and the assembly steps the
// document already states. Every row links back into the viewer.
//
//   node agent/report.mjs bench/lift.json --out lift.html
//   node agent/report.mjs bench/clock.json --out clock.html --t 0.5 --explode 0.8 --max-parts 12
//   node agent/report.mjs bench/lift.json --json lift.json --no-hidden
//
// Exit 1 when a part cannot be built exactly — a report of a drawing that
// does not exist would be a lie.
import fs from 'node:fs';
import path from 'node:path';
import { flatten, solveAngles, modelOf } from '../lib/assembly.js';
import { assemblyReport } from '../lib/report.js';
import { readDoc, isAssembly, benchRef, kernels, facesOf, arg, has } from './common.mjs';

const src = process.argv[2];
if (!src) { console.error('usage: node agent/report.mjs <assembly.json> [--out file.html] [--t s] [--explode 0.6] [--max-parts 20] [--no-hidden] [--width px] [--site url] [--json file]'); process.exit(2); }
const doc = readDoc(src);
const name = path.basename(src, '.json');
if (!isAssembly(doc)) { console.error(`${src} is a part, not an assembly — a report is about how parts go together. For one part: node agent/drawing.mjs ${src}`); process.exit(2); }
const out = arg('--out', `${name}.html`);
const t = Number(arg('--t', '0'));
const { engine } = await kernels();
const { components, mates, drive, partTrees, fits } = await flatten(doc, benchRef, { facesOf });
const angles = solveAngles(components, mates, drive, t);
const builds = new Map(); const unbuilt = [];
for (const [key, tree] of partTrees) {
  const r = engine.build(tree, { kernel: 'truck' });
  // a part only OCCT can build (a fillet, a boolean Truck refuses) is named on the page, not silently dropped
  if (!r.ok) { const e = r.report.error || {}; console.error(`! ${key}: exact build failed (${e.op}: ${e.msg}) — it will be listed on the report but not drawn`); unbuilt.push({ partKey: key, part: key.split('|')[0], error: `${e.op}: ${e.msg}`, tree }); continue; }
  builds.set(key, { mesh: r.mesh, faces: r.report.faces, invariants: r.report.invariants });
}
if (!builds.size) { console.error('✗ no part of this assembly builds with the exact kernel — nothing to report'); process.exit(1); }
const rep = assemblyReport({
  doc, components, mates, drive, fits, partTrees, builds, angles, modelOf, t,
  title: arg('--title', name), site: arg('--site', 'https://cad.mino.mobi'),
  explode: Number(arg('--explode', '0.6')), hidden: !has('--no-hidden'),
  maxParts: Number(arg('--max-parts', '20')), width: Number(arg('--width', '900')), unbuilt,
});
fs.writeFileSync(out, rep.html);
console.log(`${out}  ${(rep.bytes / 1024).toFixed(0)} kB · ${rep.components} components over ${rep.bom.length} parts · ${rep.overall.map((x) => +x.toFixed(2)).join(' × ')} mm · ${(+rep.volume.toFixed(2))} mm³ · ${rep.sheets} part sheets${rep.truncated ? ` (${rep.truncated} not drawn)` : ''} · ${rep.ms} ms`);
for (const r of rep.bom) console.log(`  ${String(r.item).padStart(2)}. ${r.part.padEnd(24)} ×${String(r.qty).padEnd(3)} ${(+r.volume.toFixed(3)).toString().padStart(10)} mm³  ${r.ids.slice(0, 4).join(' ')}${r.ids.length > 4 ? ' …' : ''}`);
for (const s of rep.steps) console.log(`  step ${s.n}: ${s.id} — ${s.lines.join('; ')}`);
if (has('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ ...rep, html: undefined }, null, 1));
