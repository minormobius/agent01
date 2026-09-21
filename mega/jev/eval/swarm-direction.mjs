// swarm-direction.mjs — the control the order-parameter table needed all along.
//
//   node mega/jev/eval/swarm-direction.mjs                  # rule + random, free
//   node mega/jev/eval/swarm-direction.mjs --jev --out mega/jev/lab/swarm-direction.json
//
// WHY THIS EXISTS. The gate ranks five arms by dispersal and reports which arm
// each Jev arm lands nearest. But across those five arms dispersal is almost
// exactly a straight line in the mean absolute turn:
//
//     arm         |turn|   dispersal   fit (0.0067 + 0.0553·|turn|)
//     rule         0.713     0.0475      0.0461
//     random       0.597     0.0413      0.0397
//     jev-mimic    0.360     0.0233      0.0266
//     jev-goal     0.323     0.0222      0.0246
//     frozen       0.000     0.0094      0.0067      r = 0.985
//
// So "Jev lands nearest frozen" may be nothing more than "Jev turns gently" —
// a fact about how HARD it steers, not about WHERE. The two are only separable
// with a control that keeps the magnitudes and destroys the direction.
//
// THE CONTROL IS A SIGN SHUFFLE, and the obvious cheaper control is wrong.
// Matching only the MEAN |turn| — turn by a fixed amount, flip a coin for the
// sign — understates every arm, because dispersal depends on the spread of
// |turn| and not only its mean. Measured against a fixed-magnitude null, even
// `random` (which has no direction policy at all, by construction) appears to
// earn 22% excess dispersal at z = 7.9. That is the null being biased, not
// random having a policy. So this replays the arm's OWN per-tick magnitudes
// and flips only the signs: same magnitudes, same spread, direction gone.
import { writeFileSync } from 'node:fs';
import { makeSwarm, senseAll, step, orderOf, ruleDecider, randomDecider, TURN_RUNGS } from '../swarm/swarm.mjs';
import { swarmDoc, swarmQuestions, FRAMINGS, turnFromScore } from '../swarm/ask.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TICKS = Number(arg('ticks', 100));
const N = Number(arg('n', 256));
const REPS = Number(arg('reps', 12));
const OUT = arg('out', null);
const WITH_JEV = process.argv.includes('--jev');
const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const CONF = { n: N, dim: 480, baseBrush: 0.006, baseCount: N };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

/** Run an arm for TICKS, keeping every |turn| it asked for. */
async function record(decide) {
  const sw = makeSwarm(CONF);
  const mags = [];
  for (let t = 1; t <= TICKS; t++) {
    const s = senseAll(sw);
    const turns = await decide(sw, s, t);
    mags.push(turns.map((x) => +Math.abs(x).toFixed(4)));
    step(sw, s, turns);
  }
  const o = orderOf(sw);
  return { mags, dispersal: o.dispersal, nn: o.nnDist, coherence: o.coherence,
    meanAbsTurn: mean(mags.flat()) };
}

/** The same magnitudes, in a fresh simulation, with the sign chosen by a coin. */
function replay(mags, seed) {
  const r = rng(seed);
  const sw = makeSwarm(CONF);
  for (let t = 1; t <= TICKS; t++) {
    const s = senseAll(sw);
    step(sw, s, s.map((_, i) => (r() < 0.5 ? -1 : 1) * mags[t - 1][i]));
  }
  const o = orderOf(sw);
  return o;
}

let calls = 0;
const ask = async (state, questions) => {
  if (calls++) await new Promise((r) => setTimeout(r, 2200));
  const r = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
  const b = await r.json();
  if (!r.ok) throw new Error(`jev ${r.status}: ${JSON.stringify(b).slice(0, 160)}`);
  return b;
};

const arms = [
  ['rule', async (sw, s) => ruleDecider(sw, s)],
  ['random', (() => { const d = randomDecider(99); return async (sw, s) => d(sw, s); })()],
];
if (WITH_JEV) arms.push(['jev-mimic', async (sw, senses) => {
  const reply = await ask(swarmDoc(senses, { note: FRAMINGS.mimic }), swarmQuestions(senses));
  return senses.map((_, i) => turnFromScore(reply.answers[`p${i}`].score, TURN_RUNGS));
}]);

console.log(`${TICKS} ticks, ${N} particles, ${REPS} sign-shuffles per arm\n`);
console.log('arm         |turn|   dispersal   sign-shuffled        excess     z  |  nn      shuffled nn');
const rows = [];
for (const [name, dec] of arms) {
  const R = await record(dec);
  const d = [], nn = [];
  for (let s = 0; s < REPS; s++) { const o = replay(R.mags, 3000 + s); d.push(o.dispersal); nn.push(o.nnDist); }
  const mu = mean(d), s1 = sd(d);
  const row = { name, meanAbsTurn: +R.meanAbsTurn.toFixed(3), dispersal: +R.dispersal.toFixed(5),
    nn: +R.nn.toFixed(5), shuffledDispersal: +mu.toFixed(5), shuffledDispersalSd: +s1.toFixed(5),
    shuffledNn: +mean(nn).toFixed(5), shuffledNnSd: +sd(nn).toFixed(5),
    excessPct: +((R.dispersal / mu - 1) * 100).toFixed(1), z: +((R.dispersal - mu) / s1).toFixed(2), reps: REPS };
  rows.push(row);
  console.log(`${name.padEnd(10)} ${row.meanAbsTurn.toFixed(3)}     ${R.dispersal.toFixed(4)}` +
    `      ${mu.toFixed(4)} ± ${s1.toFixed(4)}   ${String(row.excessPct).padStart(5)}%  ${String(row.z).padStart(5)}` +
    `  |  ${R.nn.toFixed(4)}  ${mean(nn).toFixed(4)} ± ${sd(nn).toFixed(4)}`);
}
console.log(`\nAn arm's excess over its own sign shuffle is what its DIRECTION bought.`);
// Note for anyone diffing against swarm-gate.json: the gate reads its order
// parameters AFTER one extra step (it needs two frames for `fitness2`), so its
// rule dispersal is 0.0475 at tick 101 against 0.0472 here at tick 100. Both
// arms and both shuffles in this script are measured at the same tick, so the
// comparison inside it is exact; the 0.6% is not worth 202 calls to reconcile.
console.log(`${calls} calls.`);
if (OUT) {
  writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), conf: CONF, ticks: TICKS, rows }, null, 1));
  console.log(`wrote ${OUT}`);
}
