#!/usr/bin/env node
// export.mjs — printable files. A part gives one STL; an assembly gives one
// STL per distinct part (parameter overrides included) plus a posed STL of
// the whole thing, so a printer gets parts and a viewer gets the assembly.
//
//   node agent/export.mjs bench/gear.json  --out /tmp/out
//   node agent/export.mjs bench/clock.json --out /tmp/out [--t 0] [--kernel truck|manifold]
//
// The exact kernel (Truck) is used when it can build the part; otherwise
// Manifold's mesh, which is what the printer sees anyway.
import fs from 'node:fs';
import path from 'node:path';
import { flatten, solveAngles, modelOf, xform } from '../lib/assembly.js';
import { buildManifold } from '../lib/manifold-kernel.js';
import { writeStl } from '../lib/mesh.js';
import { readDoc, isAssembly, benchRef, kernels, facesOf, arg } from './common.mjs';

const doc = readDoc(process.argv[2]);
const out = arg('--out', '/tmp/cad-export'); fs.mkdirSync(out, { recursive: true });
const prefer = arg('--kernel', 'truck');
const { engine, manifold } = await kernels();

function buildMesh(treeText, label) {
  if (prefer === 'truck') { const r = engine.build(treeText, { kernel: 'truck' }); if (r.ok && r.report.invariants.watertight) return { mesh: r.mesh, kernel: 'truck' }; }
  const r = buildManifold(manifold, engine.resolve(treeText));
  if (!r.ok) throw new Error(`${label}: ${r.error.msg}`);
  return { mesh: r.mesh, kernel: 'manifold' };
}
const safe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, '_');
if (!isAssembly(doc)) {
  const name = safe(path.basename(process.argv[2], '.json'));
  const { mesh, kernel } = buildMesh(JSON.stringify(doc), name);
  fs.writeFileSync(path.join(out, `${name}.stl`), writeStl(mesh));
  console.log(`${name}.stl  ${mesh.idx.length / 3} triangles  (${kernel})`);
} else {
  const t = Number(arg('--t', '0'));
  const { components, mates, drive, partTrees } = await flatten(doc, benchRef, { facesOf });
  const meshes = new Map();
  for (const [key, tree] of partTrees) {
    const { mesh, kernel } = buildMesh(tree, key);
    meshes.set(key, mesh);
    const file = `${safe(key)}.stl`;
    fs.writeFileSync(path.join(out, file), writeStl(mesh));
    console.log(`${file}  ${mesh.idx.length / 3} triangles  (${kernel})  used by ${components.filter((c) => c.partKey === key).map((c) => c.id).join(', ')}`);
  }
  // the posed assembly as one STL
  const angles = solveAngles(components, mates, drive, t);
  const pos = [], idx = [];
  for (const c of components) {
    if (c.reference) continue; // construction geometry stays out of the export
    const m = meshes.get(c.partKey); if (!m) continue;
    const model = modelOf(c, angles); const base = pos.length / 3;
    for (let i = 0; i < m.pos.length; i += 3) pos.push(...xform(model, [m.pos[i], m.pos[i + 1], m.pos[i + 2]]));
    for (const i of m.idx) idx.push(base + i);
  }
  const name = safe(doc.name || path.basename(process.argv[2], '.json'));
  fs.writeFileSync(path.join(out, `${name}-assembly.stl`), writeStl({ pos: Float32Array.from(pos), idx: Uint32Array.from(idx) }));
  console.log(`${name}-assembly.stl  posed at t=${t}s  ${idx.length / 3} triangles`);
}
