// Selftest for the TRAINED reef model against the same JS engine golem runs.
// Run: node reef/js/model.selftest.mjs
//
// 1. The exported blob has the exact firmware-architecture parameter count.
// 2. Golden parity: the JS engine reproduces the PyTorch trainer's mean
//    belief logits after 20 deterministic ticks (proves the codec order and
//    the axis mapping survived the torch -> JS round trip).
// 3. Held-out classification in JS: specimens the trainer never saw, run with
//    the stochastic protocol — accuracy must match the eval report's ballpark.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NCA, NC, decodeB64f32, splitWeights, mulberry32 } from '../../golem/js/nca.js';
import { generate, SPECIES } from './species.js';
import { WEIGHTS_B64, REEF_SPECIES } from '../model/weights-reef.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, '../model/golden-reef.json'), 'utf8'));
const evalReport = JSON.parse(readFileSync(join(here, '../model/eval.json'), 'utf8'));

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

const blob = decodeB64f32(WEIGHTS_B64);
check('weight float count', blob.length === 25983, `${blob.length}`);
check('species vocabulary matches generator', JSON.stringify(REEF_SPECIES) === JSON.stringify(SPECIES));
const weights = splitWeights(blob);

// corpus index -> (species, seed): the corpus is species-major, 140 seeds each
const PER = 140;
const specOf = (i) => [Math.floor(i / PER), i % PER];

// 2 — golden parity (deterministic, fire always)
for (const g of golden) {
  const [sp, seed] = specOf(g.index);
  const nca = new NCA(weights);
  nca.setStructure(generate(sp, seed));
  check(`golden #${g.index} (${SPECIES[sp]}:${seed}) live cells`, nca.live.length === g.liveCells,
    `${nca.live.length} vs ${g.liveCells}`);
  for (let s = 0; s < g.steps; s++) nca.step(1.01, () => 0);
  const mean = new Float64Array(NC);
  for (const cell of nca.live) {
    const lg = nca.logits(cell);
    for (let k = 0; k < NC; k++) mean[k] += lg[k];
  }
  for (let k = 0; k < NC; k++) mean[k] /= nca.live.length;
  let maxDev = 0;
  for (let k = 0; k < NC; k++) maxDev = Math.max(maxDev, Math.abs(mean[k] - g.meanLogits[k]));
  check(`golden #${g.index} mean logits`, maxDev < 0.02, `max dev ${maxDev.toExponential(2)}`);
}

// 3 — held-out accuracy in the JS engine (seeds >= 120 were never trained on)
const rand = mulberry32(77);
let accSum = 0, majorityOK = 0, n = 0;
for (let sp = 0; sp < SPECIES.length; sp++) {
  for (const seed of [125, 133]) {
    const nca = new NCA(weights);
    nca.setStructure(generate(sp, seed));
    for (let s = 0; s < 90; s++) nca.step(0.5, rand);
    let correct = 0;
    const votes = new Float64Array(NC);
    for (const cell of nca.live) {
      const v = nca.vote(cell);
      votes[v]++;
      if (v === sp) correct++;
    }
    accSum += correct / nca.live.length;
    if (votes.indexOf(Math.max(...votes)) === sp) majorityOK++;
    n++;
  }
}
const meanAcc = accSum / n;
check(`held-out cell accuracy in JS (${n} specimens)`, meanAcc > 0.75,
  `${meanAcc.toFixed(3)} (torch eval: ${evalReport.cell_acc.toFixed(3)})`);
check('held-out majority in JS', majorityOK >= n - 2,
  `${majorityOK}/${n} (torch eval majority: ${evalReport.majority_acc})`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good');
process.exit(failures ? 1 : 0);
