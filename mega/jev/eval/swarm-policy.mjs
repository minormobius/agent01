// swarm-policy.mjs — does the model have a POLICY, and does the genome?
//
//   node mega/jev/eval/swarm-policy.mjs --ticks 4
//
// This is the diagnostic that decided how the whole experiment reads, and it
// is worth more than the order parameters. The order parameters say the two
// swarms differ. This says WHY: it correlates each decider's turn against the
// one quantity the particle can steer on — the left/right sensor asymmetry the
// document already computed for it.
//
// A consistent sign means a stateable rule ("follow the trail"). A
// near-zero correlation means there is no such rule, which is what an
// arbitrary nonlinear brain looks like from outside.
import { makeSwarm, senseAll, step, ruleDecider, TURN_RUNGS } from '../swarm/swarm.mjs';
import { swarmDoc, swarmQuestions, FRAMINGS, turnFromScore } from '../swarm/ask.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TICKS = Number(arg('ticks', 4));
const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';

const pearson = (x, y) => {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx < 1e-18 || syy < 1e-18 ? NaN : sxy / Math.sqrt(sxx * syy);
};

const ask = async (state, questions) => {
  const r = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
  const b = await r.json();
  if (!r.ok) throw new Error(`jev ${r.status}: ${JSON.stringify(b).slice(0, 160)}`);
  return b;
};

const sw = makeSwarm({ n: 256, dim: 480 });
for (let t = 0; t < 40; t++) { const s = senseAll(sw); step(sw, s, ruleDecider(sw, s)); }

const D = [], J = [], R = [];
for (let k = 0; k < TICKS; k++) {
  const senses = senseAll(sw);
  const rep = await ask(swarmDoc(senses, { note: FRAMINGS.mimic }), swarmQuestions(senses));
  const jt = senses.map((_, i) => turnFromScore(rep.answers[`p${i}`].score, TURN_RUNGS));
  const rt = ruleDecider(sw, senses);
  // DIFF exactly as the document states it: left (sig[2]) minus right (sig[0]).
  senses.forEach(({ s }, i) => { D.push(s.sig[2] - s.sig[0]); J.push(jt[i]); R.push(rt[i]); });
  step(sw, senses, jt);
  if (k < TICKS - 1) await new Promise((r) => setTimeout(r, 2300));
}

// A NEGATIVE turn is "left". DIFF > 0 means more trail to the left. So
// following the trail is sign(turn) === -sign(DIFF).
const follows = (T) => 100 * D.filter((d, i) => Math.sign(T[i]) === -Math.sign(d)).length / D.length;
console.log(`n = ${D.length} particle-decisions over ${TICKS} ticks\n`);
console.log(`  corr(sensor asymmetry, jev turn)    r = ${pearson(D, J).toFixed(3)}`);
console.log(`  corr(sensor asymmetry, rule turn)   r = ${pearson(D, R).toFixed(3)}`);
console.log(`  corr(jev turn, rule turn)           r = ${pearson(J, R).toFixed(3)}`);
console.log(`\n  jev steers TOWARD the stronger side on  ${follows(J).toFixed(1)}%`);
console.log(`  the rule steers toward it on            ${follows(R).toFixed(1)}%`);
console.log(`\nA consistent sign is a stateable policy. A near-zero correlation is what`);
console.log(`an arbitrary nonlinear brain looks like from outside.`);
