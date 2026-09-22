// swarm-split.mjs — when does SPLITTING the state beat SHARING it?
//
//   node mega/jev/eval/swarm-split.mjs [--n 256]
//
// This is the comparison the swarm concept was actually about, and the gate
// that ran before it only did half of it.
//
//   (a) SHARED  — one call, a global document listing every particle, N
//                 questions each addressing its own row. Nearly free: breadth
//                 costs almost nothing when the state is sent once.
//   (b) SPLIT   — N calls, each carrying ONLY that particle's own reading.
//                 Costs N x the state, and is what "a swarm of agents" means.
//
// The two are put to the SAME readings at the SAME tick, so nothing differs
// but the arrangement. Determinism makes (b) necessarily a pure function of
// the local slice; the real question is whether (a) DEPARTS from that — i.e.
// whether being able to see all 256 rows changes any decision.
//
// If they agree, the shared arrangement bought nothing and is the right choice
// on cost alone. If they differ, the disagreement localises which slice the
// global view was adding something to.
import { makeSwarm, senseAll, step, ruleDecider, TURN_RUNGS, rungOf } from '../swarm/swarm.mjs';
import { swarmDoc, swarmQuestions, soloDoc, soloQuestion, FRAMINGS, turnFromScore } from '../swarm/ask.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('n', 256));
const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TRANSIENT = new Set([429, 500, 502, 503, 504, 529]);

let retries = 0;
const ask = async (state, questions) => {
  const body = JSON.stringify({ state, questions });
  let last;
  for (let a = 0; a < 5; a++) {
    if (a) { retries++; await sleep(1500 * 2 ** a + Math.random() * 400); }
    try {
      const r = await fetch(ENDPOINT, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body });
      const b = await r.json();
      if (r.ok) return b;
      last = new Error(`jev ${r.status}`);
      if (!TRANSIENT.has(r.status)) throw last;
    } catch (e) { if (/jev \d+/.test(e.message) && !TRANSIENT.has(+e.message.match(/\d+/)[0])) throw e; last = e; }
  }
  throw new Error(`gave up: ${last?.message}`);
};

const pearson = (x, y) => {
  const n = x.length, mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx < 1e-18 || syy < 1e-18 ? NaN : sxy / Math.sqrt(sxx * syy);
};

const sw = makeSwarm({ n: N, dim: 480 });
for (let t = 0; t < 40; t++) { const s = senseAll(sw); step(sw, s, ruleDecider(sw, s)); }
const senses = senseAll(sw);
console.log(`${N} particles, one tick, identical readings put to both arrangements.\n`);

// ---- (a) SHARED -------------------------------------------------------------
const tA = Date.now();
const repA = await ask(swarmDoc(senses, { note: FRAMINGS.mimic }), swarmQuestions(senses));
const msA = Date.now() - tA;
const A = senses.map((_, i) => turnFromScore(repA.answers[`p${i}`].score, TURN_RUNGS));
const confA = senses.map((_, i) => repA.answers[`p${i}`].confidence ?? null);
console.log(`(a) SHARED  1 call   ${msA}ms   ${repA.usage.input_tokens} in / ${repA.usage.output_tokens} out`);

// ---- (b) SPLIT --------------------------------------------------------------
// Paced under the proxy's 30/min per-IP limit, so wall clock here is OUR
// throttle, not the model's. The token cost is the honest comparison.
const tB = Date.now();
const B = [], confB = [];
let tokB = 0;
for (let i = 0; i < senses.length; i++) {
  if (i) await sleep(2100);
  const r = await ask(soloDoc(senses[i].s), soloQuestion());
  B.push(turnFromScore(r.answers.turn.score, TURN_RUNGS));
  confB.push(r.answers.turn.confidence ?? null);
  tokB += r.usage.input_tokens;
  if ((i + 1) % 32 === 0) process.stdout.write(`    ${i + 1}/${senses.length}\r`);
}
const msB = Date.now() - tB;
console.log(`(b) SPLIT   ${senses.length} calls  ${(msB / 1000).toFixed(0)}s   ${tokB} in tokens` +
  `   (${(tokB / repA.usage.input_tokens).toFixed(1)}x the shared arrangement)`);

// ---- the comparison ---------------------------------------------------------
const D = senses.map(({ s }) => s.sig[2] - s.sig[0]);
const same = A.filter((a, i) => rungOf(a) === rungOf(B[i])).length;
const sign = A.filter((a, i) => Math.sign(a) === Math.sign(B[i])).length;
const meanAbs = A.reduce((acc, a, i) => acc + Math.abs(a - B[i]), 0) / A.length;
const follows = (T) => 100 * D.filter((d, i) => Math.sign(T[i]) === -Math.sign(d)).length / D.length;

console.log(`\n  corr(shared, split)            r = ${pearson(A, B).toFixed(3)}`);
console.log(`  same rung                      ${(100 * same / A.length).toFixed(1)}%`);
console.log(`  same sign                      ${(100 * sign / A.length).toFixed(1)}%`);
console.log(`  mean |turn difference|         ${meanAbs.toFixed(3)}  (the ladder spans 2.0)`);
console.log(`\n  follows the trail, shared      ${follows(A).toFixed(1)}%`);
console.log(`  follows the trail, split       ${follows(B).toFixed(1)}%`);
console.log(`  corr with sensor asymmetry, shared  r = ${pearson(D, A).toFixed(3)}`);
console.log(`  corr with sensor asymmetry, split   r = ${pearson(D, B).toFixed(3)}`);
const cA = confA.filter(Number.isFinite), cB = confB.filter(Number.isFinite);
if (cA.length && cB.length) {
  console.log(`\n  mean confidence, shared        ${(cA.reduce((a, b) => a + b, 0) / cA.length).toFixed(3)}`);
  console.log(`  mean confidence, split         ${(cB.reduce((a, b) => a + b, 0) / cB.length).toFixed(3)}`);
}
console.log(`\n${1 + senses.length} calls, ${retries} retries.`);
