#!/usr/bin/env node
// measure.mjs — read a part's exact face geometry, or the distance between
// two named faces. Names are the engine's (`plate.end`, `case.cup[3]`,
// `g1.bore[0]`); `--list` prints every face with its kind and size.
//
//   node agent/measure.mjs bench/plate.json --list
//   node agent/measure.mjs bench/plate.json plate.pivot[0][0]                 # diameter
//   node agent/measure.mjs bench/case.json  case.cup[0] case.cup[2]           # plane to plane
//   node agent/measure.mjs bench/plate.json plate.rim[0] plate.pivot[2][0]    # axis to axis
//
// On an ASSEMBLY, names are `component.face` (`finger-r.pad`, `arm.pivot[0]`)
// and --t poses it first, so the distance between two parts' faces at an
// instant is one command — the kinematics measured directly:
//   node agent/measure.mjs bench/lift.json nut.end platform.start --t 0.5
import fs from 'node:fs';
import { measure, describe, faceByName, faceWorld } from '../lib/measure.js';
import { flatten, solveAngles, modelOf, findFace } from '../lib/assembly.js';
import { readDoc, isAssembly, benchRef, kernels, facesOf, arg, has } from './common.mjs';

const doc = readDoc(process.argv[2]);
const names = process.argv.slice(3).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
const { engine } = await kernels();
const fmt = (x) => (x === null || x === undefined ? '–' : +x.toFixed(4));
if (isAssembly(doc)) {
  const t = Number(arg('--t', '0'));
  const { components, mates, drive, partTrees } = await flatten(doc, benchRef, { facesOf });
  const angles = solveAngles(components, mates, drive, t);
  const posed = async (ref) => {
    const dotAt = ref.replace(/^@/, '').indexOf('.'); if (dotAt <= 0) throw new Error(`${ref}: name a face as component.face`);
    const id = ref.replace(/^@/, '').slice(0, dotAt), name = ref.replace(/^@/, '').slice(dotAt + 1);
    const c = components.find((x) => x.id === id); if (!c) throw new Error(`no component ${id}; components: ${components.map((x) => x.id).join(', ')}`);
    const faces = await facesOf(c.partKey, partTrees.get(c.partKey));
    const f = findFace(faces, name); if (!f) throw new Error(`${id} has no face named ${name}; it has ${faces.slice(0, 20).map((x) => x.names[0]).join(', ')}${faces.length > 20 ? ', …' : ''}`);
    return faceWorld(f, modelOf(c, angles));
  };
  try {
    if (has('--list') || !names.length) { for (const c of components) { const faces = await facesOf(c.partKey, partTrees.get(c.partKey)); console.log(`${c.id}  (${c.part}, ${faces.length} faces): ${faces.map((f) => f.names[0]).slice(0, 30).join(' ')}${faces.length > 30 ? ' …' : ''}`); } process.exit(0); }
    const A = await posed(names[0]);
    if (names.length === 1) { console.log(JSON.stringify({ t, ...describe(A), centroid: A.centroid }, null, 1)); process.exit(0); }
    const B = await posed(names[1]);
    console.log(JSON.stringify({ t, ...measure(A, B) }, null, 1)); process.exit(0);
  } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
const r = engine.build(JSON.stringify(doc), { kernel: 'truck' });
if (!r.ok) { console.error(`exact build failed: ${r.report.error.op}: ${r.report.error.msg} — measurements need the exact kernel`); process.exit(1); }
const faces = r.report.faces;
if (has('--list') || !names.length) {
  for (const f of faces) { const d = describe(f); console.log(`${f.names.join(' ').padEnd(40)} ${d.kind.padEnd(9)} ${d.kind === 'cylinder' ? `⌀ ${fmt(d.diameter)}` : d.kind === 'plane' ? `n (${d.normal.map(fmt).join(', ')})` : ''}  area ${fmt(f.area)}`); }
  process.exit(0);
}
const A = faceByName(faces, names[0]); if (!A) { console.error(`no face named ${names[0]}`); process.exit(1); }
if (names.length === 1) { console.log(JSON.stringify(describe(A), null, 1)); process.exit(0); }
const B = faceByName(faces, names[1]); if (!B) { console.error(`no face named ${names[1]}`); process.exit(1); }
console.log(JSON.stringify(measure(A, B), null, 1));
