#!/usr/bin/env node
// build.mjs — check and build a tree with nothing but node and the committed
// wasm. This is the first command in the loop; the native Rust CLI does the
// same and more (STEP read-back, diff) but needs a toolchain.
//
//   node agent/build.mjs tree.json                      # exact build (Truck): invariants, face count, errors
//   node agent/build.mjs tree.json --check              # resolve only: params, sketches, ops — no geometry
//   node agent/build.mjs tree.json --faces              # every named face with its geometry
//   node agent/build.mjs tree.json --json report.json --stl out.stl --step out.step
//   node agent/build.mjs tree.json --kernel manifold    # the preview kernel (always builds; polygons; no names)
//   node agent/build.mjs at://did/com.minomobi.cad.part/rkey   # a published file, or bench:<name>
//   node agent/build.mjs asm.json                       # an assembly: every distinct part, then the totals
//
// Exit 0 when the build is ok and watertight, 1 otherwise. A Truck failure on
// a boolean is reported as such (`unsupported` / `boolean union failed`);
// the fix is usually the even-odd region form, then OCCT in the page.
import fs from 'node:fs';
import { flatten } from '../lib/assembly.js';
import { buildManifold } from '../lib/manifold-kernel.js';
import { writeStl, weld, invariants } from '../lib/mesh.js';
import { describe } from '../lib/measure.js';
import { readDoc, isAssembly, benchRef, kernels, arg, has } from './common.mjs';

const src = process.argv[2];
if (!src || src.startsWith('--')) { console.error('usage: build.mjs <tree.json | bench:name | at://…> [--check] [--faces] [--json f] [--stl f] [--step f] [--kernel truck|manifold]'); process.exit(2); }
const doc = src.startsWith('bench:') || src.startsWith('at://') ? await benchRef(src) : readDoc(src);
const kernel = arg('--kernel', 'truck');
const fmt = (x) => (x === null || x === undefined ? '–' : typeof x === 'number' ? +x.toFixed(4) : x);
const { engine, manifold } = await kernels();

function buildOne(tree, label) {
  if (kernel === 'manifold') {
    const t0 = performance.now();
    const r = buildManifold(manifold, engine.resolve(tree));
    const mesh = r.ok ? weld(r.mesh, 1e-5) : null;
    return { ok: r.ok, kernel: 'manifold', ms: performance.now() - t0, invariants: mesh ? invariants(mesh) : null, faces: [], mesh, error: r.error, label };
  }
  const r = engine.build(JSON.stringify(tree), { kernel: 'truck', step: !!arg('--step') });
  return { ok: r.ok, kernel: 'truck', ms: r.ms, invariants: r.ok ? r.report.invariants : null, faces: r.ok ? r.report.faces : [], mesh: r.mesh, step: r.step, error: r.ok ? null : r.report.error, timings: r.report.timings, label };
}
function printInv(inv) {
  if (!inv) return;
  console.log(`  volume ${fmt(inv.volume)}  area ${fmt(inv.area)}  χ ${inv.euler}  watertight ${inv.watertight}  tris ${inv.tris ?? '–'}`);
  if (inv.bbox) console.log(`  bbox [${inv.bbox[0].map(fmt).join(', ')}] → [${inv.bbox[1].map(fmt).join(', ')}]  centroid (${(inv.centroid || []).map(fmt).join(', ')})`);
}
function printFaces(faces) {
  for (const f of faces) { const d = describe(f); console.log(`  ${f.names.join(' ').padEnd(40)} ${d.kind.padEnd(9)} ${d.kind === 'cylinder' ? `⌀ ${fmt(d.diameter)}` : d.kind === 'plane' ? `n (${d.normal.map(fmt).join(', ')})` : ''}  area ${fmt(f.area)}`); }
}

let exit = 0;
if (has('--check')) {
  try {
    const r = engine.resolve(doc);
    console.log(`ok: ${Object.keys(r.params || {}).length} params, ${(r.sketches || []).length} sketches, ${(r.ops || []).length} ops`);
    for (const [k, v] of Object.entries(r.params || {})) console.log(`  ${k} = ${fmt(v)}`);
    for (const op of r.ops || []) console.log(`  ${op.op.padEnd(8)} ${op.id}${op.mode ? ' ' + op.mode : ''}`);
    if (has('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(r, null, 1));
  } catch (e) { console.error(`✗ ${e.op ? e.op + ': ' : ''}${e.message}`); exit = 1; }
  process.exit(exit);
}

if (isAssembly(doc)) {
  const { components, partTrees } = await flatten(doc, benchRef);
  let total = 0; const results = {};
  for (const [key, tree] of partTrees) {
    const r = buildOne(JSON.parse(tree), key);
    results[key] = { ok: r.ok, kernel: r.kernel, ms: r.ms, invariants: r.invariants, error: r.error, faces: r.faces.length };
    if (r.ok) { total += r.invariants.volume; console.log(`✓ ${key}  ${r.kernel} ${r.ms.toFixed(0)} ms  volume ${fmt(r.invariants.volume)}  χ ${r.invariants.euler}  watertight ${r.invariants.watertight}  ${r.faces.length} faces`); if (!r.invariants.watertight) exit = 1; }
    else { console.log(`✗ ${key}  ${r.error?.op || ''}: ${r.error?.msg || 'failed'}${r.error?.unsupported ? ' (unsupported by this kernel)' : ''}`); exit = 1; }
  }
  console.log(`${components.length} components over ${partTrees.size} distinct parts; ${fmt(total)} mm³ of material`);
  if (has('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ components: components.map((c) => ({ id: c.id, part: c.part, partKey: c.partKey })), parts: results }, null, 1));
  process.exit(exit);
}

const r = buildOne(doc, doc.name || 'part');
if (!r.ok) {
  console.log(`✗ ${r.kernel}: ${r.error?.op ? r.error.op + ': ' : ''}${r.error?.msg || 'build failed'}${r.error?.unsupported ? ' (unsupported by this kernel — fillets and the booleans Truck fails need OCCT, in the page)' : ''}`);
  if (has('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ ok: false, kernel: r.kernel, error: r.error }, null, 1));
  process.exit(1);
}
console.log(`✓ ${r.kernel} ${r.ms.toFixed(0)} ms${r.timings ? ` (resolve ${fmt(r.timings.resolve_ms)} build ${fmt(r.timings.build_ms)} mesh ${fmt(r.timings.mesh_ms)})` : ''}  ${r.faces.length} named faces`);
printInv(r.invariants);
if (!r.invariants.watertight) { console.log('  ✗ not watertight'); exit = 1; }
if (has('--faces')) printFaces(r.faces);
if (has('--json')) fs.writeFileSync(arg('--json'), JSON.stringify({ ok: true, kernel: r.kernel, ms: r.ms, timings: r.timings, invariants: r.invariants, faces: r.faces.map((f) => ({ ...f, describe: describe(f) })) }, null, 1));
if (has('--stl')) { fs.writeFileSync(arg('--stl'), writeStl(r.mesh)); console.log(`  wrote ${arg('--stl')}`); }
if (has('--step')) { if (r.step) { fs.writeFileSync(arg('--step'), r.step); console.log(`  wrote ${arg('--step')} (${(r.step.length / 1e3).toFixed(0)} kB)`); } else console.log('  no STEP: only the exact kernel writes it'); }
process.exit(exit);
