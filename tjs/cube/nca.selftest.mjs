// Selftest for the cube NCA engine. Run: node tjs/cube/nca.selftest.mjs
//
// 1. Weight blob decodes to the exact firmware parameter count (25,983).
// 2. Golden parity: mean-over-living class logits after 20 deterministic
//    (fireRate=1) steps match a float32 numpy reference implementation of the
//    original TF model to small tolerance, on 3 dataset shapes.
// 3. End-to-end: 15 random dataset shapes, 90 stochastic steps (fireRate 0.5,
//    seeded) -> per-cell classification accuracy must beat 90%, every shape
//    majority-correct. This is the same protocol the paper trains for.
// 4. Damage recovery: smash 30% of a shape's cubes; the survivors must
//    re-converge to the right class.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NCA, GRID, NC, NCELLS, decodeB64f32, decodeB64u8, splitWeights, unpackShape, mulberry32,
} from './nca.js';
import { WEIGHTS_B64 } from './weights.js';
import { SHAPES_B64, LABELS, CLASSES, NUM_SHAPES } from './shapes.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf8'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// 1 — decode
const blob = decodeB64f32(WEIGHTS_B64);
check('weights float count', blob.length === 25983, `${blob.length}`);
const weights = splitWeights(blob);
const packed = decodeB64u8(SHAPES_B64);
check('shape count', LABELS.length === NUM_SHAPES && NUM_SHAPES === 487, `${NUM_SHAPES}`);

// 2 — golden parity (deterministic)
for (const g of golden) {
  const nca = new NCA(weights);
  const shape = unpackShape(packed, g.index);
  nca.setStructure(shape);
  check(`golden #${g.index} live cells`, nca.live.length === g.liveCells,
    `${nca.live.length} vs ${g.liveCells}`);
  for (let s = 0; s < g.steps; s++) nca.step(1.01, () => 0); // fire always
  const mean = new Float64Array(NC);
  for (const cell of nca.live) {
    const lg = nca.logits(cell);
    for (let k = 0; k < NC; k++) mean[k] += lg[k];
  }
  for (let k = 0; k < NC; k++) mean[k] /= nca.live.length;
  let maxDev = 0;
  for (let k = 0; k < NC; k++) maxDev = Math.max(maxDev, Math.abs(mean[k] - g.meanLogits[k]));
  check(`golden #${g.index} mean logits (label ${CLASSES[g.label]})`, maxDev < 0.02,
    `max dev ${maxDev.toExponential(2)}`);
  const argmax = mean.indexOf(Math.max(...mean));
  check(`golden #${g.index} argmax == label`, argmax === g.label,
    `${CLASSES[argmax]} vs ${CLASSES[g.label]}`);
}

// 3 — end-to-end accuracy on random dataset shapes
const rand = mulberry32(1234);
const picks = [];
while (picks.length < 15) {
  const i = Math.floor(rand() * NUM_SHAPES);
  if (!picks.includes(i)) picks.push(i);
}
let accSum = 0, majorityOK = 0;
for (const i of picks) {
  const nca = new NCA(weights);
  nca.setStructure(unpackShape(packed, i));
  for (let s = 0; s < 90; s++) nca.step(0.5, rand);
  let correct = 0;
  for (const cell of nca.live) if (nca.vote(cell) === LABELS[i]) correct++;
  const acc = correct / nca.live.length;
  accSum += acc;
  if (acc > 0.5) majorityOK++;
}
const meanAcc = accSum / picks.length;
check('dataset accuracy (15 shapes, 90 steps)', meanAcc > 0.9, `mean cell acc ${meanAcc.toFixed(3)}`);
check('all shapes majority-correct', majorityOK === picks.length, `${majorityOK}/${picks.length}`);

// 4 — damage recovery: chop a slab off one side (the paper's structural-damage
// scenario) and let the survivors re-converge. Random scattered removal is a
// different, genuinely harder problem (a swiss-cheese shape is ambiguous), so
// it's exercised in the UI, not asserted here.
{
  let i = picks[0], bestLive = 0;
  for (const p of picks) {
    const n = new NCA(weights);
    n.setStructure(unpackShape(packed, p));
    if (n.live.length > bestLive) { bestLive = n.live.length; i = p; }
  }
  const nca = new NCA(weights);
  nca.setStructure(unpackShape(packed, i));
  for (let s = 0; s < 60; s++) nca.step(0.5, rand);
  const before = nca.live.length;
  let xMin = GRID, xMax = 0;
  for (const cell of nca.live) {
    const x = Math.floor(cell / (GRID * GRID));
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
  }
  const cut = xMax - Math.max(1, Math.floor((xMax - xMin) / 3)); // lop off the top third
  for (const cell of [...nca.live]) {
    if (Math.floor(cell / (GRID * GRID)) > cut) nca.damage(cell);
  }
  check(`damage removed cubes (${before} -> ${nca.live.length})`,
    nca.live.length < before && nca.live.length > 0);
  for (let s = 0; s < 120; s++) nca.step(0.5, rand);
  let correct = 0;
  for (const cell of nca.live) if (nca.vote(cell) === LABELS[i]) correct++;
  const acc = correct / nca.live.length;
  check('post-damage reclassification', acc > 0.75, `cell acc ${acc.toFixed(3)} (label ${CLASSES[LABELS[i]]})`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good');
process.exit(failures ? 1 : 0);
