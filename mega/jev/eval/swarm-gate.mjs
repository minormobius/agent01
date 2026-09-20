// swarm-gate.mjs — deterministic fluoddity against a Jev swarm, same everything else.
//
//   node mega/jev/eval/swarm-gate.mjs --ticks 100 --out mega/jev/lab/swarm-gate.json
//
// THE CONFIGURATION IS NOT THE OBVIOUS ONE, and the reason is a finding in its
// own right. At 256 particles you can have fluoddity's FIELD measure or
// fluoddity's DYNAMICS, not both:
//
//   dim 128, energy-matched brush : field lands in the healthy band (fill 0.43,
//     "alive"), and every arm is IDENTICAL — sensor asymmetry 1.3%, because the
//     two sensors are 0.006 world units apart, which at dim 128 is 0.38px, so
//     BOTH SENSORS READ THE SAME TEXEL. There is no gradient to steer on and
//     frozen steering scores the same as the rule.
//   dim 480, fluoddity's own brush : sensor asymmetry 6.7%, and the arms
//     separate hard — polarization 0.79 (rule) against 0.11 (random). But the
//     field reads "dead", because 256 particles cannot cover a 480² canvas.
//
// So this runs the second, and reports fluoddity's descriptors anyway, marked
// for what they are. The primary measure is the swarm order parameters, which
// read the particles rather than the picture and work at any count.
import { writeFileSync } from 'node:fs';
import { makeSwarm, senseAll, step, probe, orderOf, ruleDecider, randomDecider,
  frozenDecider, TURN_RUNGS, rungOf } from '../swarm/swarm.mjs';
import { verdict, fitness2, vec, dist } from '../swarm/probe.mjs';
import { swarmDoc, swarmQuestions, FRAMINGS, turnFromScore } from '../swarm/ask.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TICKS = Number(arg('ticks', 100));
const N = Number(arg('n', 256));
const OUT = arg('out', null);
const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const CONF = { n: N, dim: 480, baseBrush: 0.006, baseCount: N };

let calls = 0, retries = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One transient blip must not cost a hundred calls of work.
 *
 * A single upstream timeout killed the first corrected run at tick 1 of the
 * fourth arm, discarding 100 completed calls. The proxy retries 429 and 529;
 * it does not retry a 502 or a dropped connection, and this runner retried
 * nothing at all. A long unattended run needs its own retry — the same lesson
 * the proxy already learned one level down.
 *
 * Only transient classes are retried. A 400 or a 413 will fail again just as
 * fast and retrying it spends the budget twice for nothing.
 */
const TRANSIENT = new Set([429, 500, 502, 503, 504, 529]);
const ask = async (state, questions) => {
  if (calls) await sleep(2200);
  const body = JSON.stringify({ state, questions });
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) { retries++; await sleep(2000 * 2 ** attempt + Math.random() * 500); }
    try {
      const r = await fetch(ENDPOINT, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body });
      const b = await r.json();
      if (r.ok) { calls++; return b; }
      last = new Error(`jev ${r.status}: ${JSON.stringify(b).slice(0, 180)}`);
      if (!TRANSIENT.has(r.status)) throw last;
    } catch (e) {
      if (/jev \d+/.test(e.message) && !/jev (429|500|502|503|504|529)/.test(e.message)) throw e;
      last = e;
    }
  }
  throw new Error(`gave up after 4 attempts: ${last?.message}`);
};

/** Run one arm for TICKS, recording the trajectory. `decide` may be async. */
async function runArm(name, decide) {
  const sw = makeSwarm(CONF);
  const traj = [], agree = { sign: 0, rung: 0, n: 0 }, scores = [];
  for (let t = 1; t <= TICKS; t++) {
    const senses = senseAll(sw);
    const det = ruleDecider(sw, senses);
    const turns = await decide(sw, senses, t);
    for (let i = 0; i < turns.length; i++) {
      agree.n++;
      if (Math.sign(turns[i]) === Math.sign(det[i])) agree.sign++;
      if (rungOf(turns[i]) === rungOf(det[i])) agree.rung++;
      scores.push(turns[i]);
    }
    step(sw, senses, turns);
    if (t % 10 === 0 || t === TICKS) {
      const v = probe(sw), o = orderOf(sw);
      traj.push({ t, pol: +o.polarization.toFixed(4), mill: +o.milling.toFixed(4),
        nn: +o.nnDist.toFixed(4), speed: +o.meanSpeed.toFixed(5),
        dispersal: +o.dispersal.toFixed(5), coherence: +o.coherence.toFixed(4),
        spread: +o.spread.toFixed(5),
        fill: +v.fill.toFixed(4), struct: +v.struct.toFixed(3), verdict: verdict(v, false) });
    }
  }
  const v1 = probe(sw);
  const s = senseAll(sw); step(s.length ? sw : sw, s, await decide(sw, s, TICKS + 1));
  const v2 = probe(sw);
  const o = orderOf(sw);
  const meanAbs = scores.reduce((a, b) => a + Math.abs(b), 0) / scores.length;
  return { name, traj, order: o, v1, v2, fitness2: fitness2(v1, v2), verdict: verdict(v2, false),
    vec: vec(v2), meanAbsTurn: +meanAbs.toFixed(3),
    agreeSign: +(agree.sign / agree.n).toFixed(4), agreeRung: +(agree.rung / agree.n).toFixed(4),
    distinctTurns: new Set(scores.map((x) => x.toFixed(3))).size };
}

const jevArm = (framing) => async (sw, senses) => {
  const reply = await ask(swarmDoc(senses, { note: FRAMINGS[framing] }), swarmQuestions(senses));
  return senses.map((_, i) => {
    const a = reply.answers?.[`p${i}`];
    if (typeof a?.score !== 'number') throw new Error(`no answer for p${i}`);
    return turnFromScore(a.score, TURN_RUNGS);
  });
};

const arms = [];
console.log(`${TICKS} ticks, ${N} particles, dim ${CONF.dim}\n`);
for (const [name, dec] of [
  ['rule', async (sw, s) => ruleDecider(sw, s)],
  ['random', (() => { const d = randomDecider(99); return async (sw, s) => d(sw, s); })()],
  ['frozen', async (sw, s) => frozenDecider(sw, s)],
  ['jev-mimic', jevArm('mimic')],
  ['jev-goal', jevArm('goal')],
]) {
  const t0 = Date.now();
  const a = await runArm(name, dec);
  arms.push(a);
  console.log(`${name.padEnd(10)} dispersal ${a.order.dispersal.toFixed(4)}  coherence ${a.order.coherence.toFixed(3)}` +
    `  nn ${a.order.nnDist.toFixed(4)}  |  ${a.verdict.padEnd(7)} fill ${a.v2.fill.toFixed(3)}` +
    `  |  agree(sign) ${(100 * a.agreeSign).toFixed(1)}%  |turn| ${a.meanAbsTurn}` +
    `  distinct ${a.distinctTurns}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// Which arm is each Jev arm nearest, in fluoddity's own phenotype space?
const by = Object.fromEntries(arms.map((a) => [a.name, a]));
console.log('\nphenotype distance (fluoddity vec), lower is more alike:');
for (const j of ['jev-mimic', 'jev-goal']) {
  const row = ['rule', 'random', 'frozen'].map((k) => `${k} ${dist(by[j].vec, by[k].vec).toFixed(3)}`);
  console.log(`  ${j.padEnd(10)} ${row.join('   ')}`);
}
console.log('\norder-parameter distance (dispersal, cohort coherence, nn):');
const ovec = (a) => [a.order.dispersal * 10, a.order.coherence, a.order.nnDist * 10];
for (const j of ['jev-mimic', 'jev-goal']) {
  const row = ['rule', 'random', 'frozen'].map((k) => `${k} ${dist(ovec(by[j]), ovec(by[k])).toFixed(3)}`);
  console.log(`  ${j.padEnd(10)} ${row.join('   ')}`);
}
console.log(`\n${calls} calls, ${retries} retries.`);
if (OUT) { writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), conf: CONF, ticks: TICKS, arms }, null, 1));
  console.log(`wrote ${OUT}`); }
