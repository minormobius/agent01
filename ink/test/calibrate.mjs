// Calibration rig for sim.js DEPOSIT (node only, not shipped behaviour).
//
// The genome box in genome.js is fluoddity's, tuned against a GPU substrate of
// 40k agents splatting into 384^2. We run ~1/50th the agents, so unless each
// one carries proportionally more pigment the field never gets loud enough for
// the sensors to hear and every draw reads "dead". DEPOSIT is that constant.
// Sweep it, and read the verdict mix off the SHARED rubric.
//
//   node ink/test/calibrate.mjs [n] [deposit,deposit,...]

import { randomGenome } from '../js/genome.js';
import { Rand } from '../js/prng.js';
import { probePair } from '../js/probe.js';
import * as sim from '../js/sim.js';

const N = Number(process.argv[2] || 60);
const sweep = (process.argv[3] || '').split(',').filter(Boolean).map(Number);

async function run(dep) {
  // DEPOSIT is a module const; re-import with a cache-buster after rewriting is
  // overkill, so the sweep patches the exported binding through a shim instead.
  sim.__setDeposit(dep);
  const tally = {}; let sumFit = 0, t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const r = new Rand('cal::' + dep + '::' + i);
    const pops = [randomGenome(r.fork('A')), randomGenome(r.fork('B'))];
    const p = probePair(pops, 'cal::' + dep + '::' + i);
    tally[p.verdict] = (tally[p.verdict] || 0) + 1;
    sumFit += p.fit;
  }
  const ms = (Date.now() - t0) / N;
  const alive = (tally.alive || 0) / N;
  console.log(
    String(dep).padStart(6),
    '  alive', (alive * 100).toFixed(0).padStart(3) + '%',
    ' meanfit', (sumFit / N).toFixed(3),
    ' ', (ms).toFixed(0) + 'ms/probe ',
    Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
}

console.log(`n=${N} per deposit value`);
console.log('deposit   alive   meanfit   cost      verdict mix');
for (const d of (sweep.length ? sweep : [sim.DEPOSIT])) await run(d);
