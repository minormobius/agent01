#!/usr/bin/env node
// measure.mjs — read a part's exact face geometry, or the distance between
// two named faces. Names are the engine's (`plate.end`, `case.cup[3]`,
// `g1.bore[0]`); `--list` prints every face with its kind and size.
//
//   node agent/measure.mjs bench/plate.json --list
//   node agent/measure.mjs bench/plate.json plate.pivot[0][0]                 # diameter
//   node agent/measure.mjs bench/case.json  case.cup[0] case.cup[2]           # plane to plane
//   node agent/measure.mjs bench/plate.json plate.rim[0] plate.pivot[2][0]    # axis to axis
import fs from 'node:fs';
import { measure, describe, faceByName } from '../lib/measure.js';
import { readDoc, kernels, has } from './common.mjs';

const doc = readDoc(process.argv[2]);
const names = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const { engine } = await kernels();
const r = engine.build(JSON.stringify(doc), { kernel: 'truck' });
if (!r.ok) { console.error(`exact build failed: ${r.report.error.op}: ${r.report.error.msg} — measurements need the exact kernel`); process.exit(1); }
const faces = r.report.faces;
const fmt = (x) => (x === null || x === undefined ? '–' : +x.toFixed(4));
if (has('--list') || !names.length) {
  for (const f of faces) { const d = describe(f); console.log(`${f.names.join(' ').padEnd(40)} ${d.kind.padEnd(9)} ${d.kind === 'cylinder' ? `⌀ ${fmt(d.diameter)}` : d.kind === 'plane' ? `n (${d.normal.map(fmt).join(', ')})` : ''}  area ${fmt(f.area)}`); }
  process.exit(0);
}
const A = faceByName(faces, names[0]); if (!A) { console.error(`no face named ${names[0]}`); process.exit(1); }
if (names.length === 1) { console.log(JSON.stringify(describe(A), null, 1)); process.exit(0); }
const B = faceByName(faces, names[1]); if (!B) { console.error(`no face named ${names[1]}`); process.exit(1); }
console.log(JSON.stringify(measure(A, B), null, 1));
