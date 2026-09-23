// compose-gate.mjs — does a CHAIN of typed decisions stay coherent?
//
// The one hypothesis this surface has never tested. Breadth is proven: 1024
// independent questions, 549ms, all correct. This asks the other thing —
// whether a sequence in which each decision changes the state the next question
// is asked against holds together, and whether the self-check behaves the way
// it does on a frozen state.
//
// Controls on the SAME starting points, because a chain can reach a good place
// by luck: GREEDY is the myopic optimum (the ceiling), RANDOM from the same
// legal set is the floor. Jev sees the same enumerated moves all three do.
//
//   node mega/jev/eval/compose-gate.mjs [--chains 8] [--steps 10] [--out path]
import { writeFileSync } from 'node:fs';
import { BRIEFS, DEFAULT_GENES, FAMILIES, legalMoves, moveCriteria, composeDoc,
  runChain, chainStats, greedyPick, randomPick, briefDistance, traits } from '../lab/compose.mjs';

const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const CHAINS = Number(arg('chains', 8));
const STEPS = Number(arg('steps', 10));
const OUT = arg('out', null);
const SPACING_MS = 2300;

const ask = async (state, questions) => {
  const r = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
  const b = await r.json();
  if (!r.ok) throw new Error(`jev ${r.status}: ${JSON.stringify(b).slice(0, 160)}`);
  return b;
};

let calls = 0;
// `--thin` reproduces the FIRST version of this experiment, which is the
// control: prediction-shaped question, six trait deltas per option left for the
// model to combine. The self-check returned p(have) = 0.12 on all 80 edits of
// it, which on four prior datasets means "do not read these answers".
const THIN = process.argv.includes('--thin');

const jevPick = async ({ moves, genes, brief, step, total, history }) => {
  const doc = composeDoc(genes, moves, brief, { step, total, history });
  const criteria = moveCriteria(moves, genes, brief, { computed: !THIN });
  if (calls++) await new Promise((r) => setTimeout(r, SPACING_MS));
  // THE SELF-CHECK MUST QUOTE THE QUESTION IT CHECKS. cross.mjs builds it by
  // interpolating the real instructions and has a test asserting exactly that
  // — and this file hardcoded a different sentence, keeping the PREDICTIVE
  // phrasing ("which edit best serves the brief") after the real question had
  // become determinate. So it was answering a question nobody was asking, and
  // correctly returned p(have) = 0.12 for it while the chain ran at the greedy
  // ceiling. A self-check that can drift from its question measures nothing.
  const editQ = { type: 'choice', criteria,
    instructions: THIN
      ? `Which single edit best moves this quadruped toward the brief: ${brief.label}?`
      : `Which single edit leaves the SMALLEST overall gap to the brief (${brief.label})? Each option states the gap it would produce; lower is closer.` };
  let reply;
  try {
    reply = await ask(doc, {
      edit: editQ,
      // Riding along as everywhere else. What is new is that the state CHANGES
      // under it every step — nothing in four prior datasets says what that does.
      have__edit: { type: 'noul',
        instructions: `Does the state above actually contain the information needed to answer this question: "${editQ.instructions}"`,
        criteria: {
          true: 'The figures needed are present in the state, so the question can be answered from it.',
          false: 'The state does not contain what this question needs — answering it would require information that is not there.',
        } },
    });
  } catch (e) { console.error(`    step ${step}: ${e.message}`); return null; }
  const a = reply.answers?.edit;
  return a?.choice ? { id: a.choice, confidence: a.confidence ?? null,
    have: typeof reply.answers?.have__edit?.noul === 'number' ? reply.answers.have__edit.noul : null } : null;
};

// Starting points spread across the family presets, so no chain begins where
// another does and a single lucky start cannot carry the result.
const starts = [];
const briefKeys = Object.keys(BRIEFS);
const famKeys = Object.keys(FAMILIES);
for (let i = 0; i < CHAINS; i++) {
  starts.push({ brief: briefKeys[i % briefKeys.length], family: famKeys[i % famKeys.length] });
}

const results = [];
for (const [i, s] of starts.entries()) {
  const brief = BRIEFS[s.brief];
  const genes = { ...DEFAULT_GENES, ...FAMILIES[s.family] };
  process.stdout.write(`chain ${i + 1}/${starts.length}  ${s.family} -> ${s.brief}  `);
  const jev = await runChain({ genes, brief, steps: STEPS, pick: jevPick });
  const grd = await runChain({ genes, brief, steps: STEPS, pick: greedyPick });
  const rnd = await runChain({ genes, brief, steps: STEPS, pick: randomPick(i * 977 + 13) });
  const S = { jev: chainStats(jev), greedy: chainStats(grd), random: chainStats(rnd) };
  console.log(`start ${jev.start.toFixed(3)}  jev ${jev.end.toFixed(3)}  greedy ${grd.end.toFixed(3)}  random ${rnd.end.toFixed(3)}`);
  results.push({ ...s, start: jev.start, jev: { end: jev.end, ...S.jev, trace: jev.trace },
    greedy: { end: grd.end, ...S.greedy }, random: { end: rnd.end, ...S.random } });
}

// ------------------------------------------------------------- report ----
const ok = results.filter((r) => r.jev && r.jev.steps > 0);
const m = (f) => ok.reduce((s, r) => s + f(r), 0) / (ok.length || 1);
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—');
console.log(`\n${ok.length} chains, ${STEPS} edits each, ${calls} calls\n`);
console.log(`${'arm'.padEnd(9)}${'mean start'.padStart(12)}${'mean end'.padStart(11)}${'improved'.padStart(11)}${'mean regret'.padStart(13)}${'took worst'.padStart(12)}`);
for (const [name, key] of [['Jev', 'jev'], ['greedy', 'greedy'], ['random', 'random']]) {
  console.log(`${name.padEnd(9)}${m((r) => r.start).toFixed(3).padStart(12)}${m((r) => r[key].end).toFixed(3).padStart(11)}` +
    `${(m((r) => r[key].improvedPct).toFixed(1) + '%').padStart(11)}${m((r) => r[key].meanRegret).toFixed(3).padStart(13)}` +
    `${m((r) => r[key].tookWorst).toFixed(2).padStart(12)}`);
}
const beatRandom = ok.filter((r) => r.jev.end < r.random.end).length;
const matchGreedy = ok.filter((r) => r.jev.end <= r.greedy.end * 1.05).length;
console.log(`\nJev beat the random control on ${beatRandom}/${ok.length} chains (${pct(beatRandom, ok.length)})`);
console.log(`Jev within 5% of the greedy ceiling on ${matchGreedy}/${ok.length} (${pct(matchGreedy, ok.length)})`);

// THE NEW QUESTION: does the self-check drift as the state changes underneath?
const all = ok.flatMap((r) => r.jev.trace.filter((t) => t.step >= 0 && !t.refused));
if (all.length) {
  console.log('\nDOES THE SELF-CHECK DRIFT AS THE CHAIN PROGRESSES?');
  console.log(`${'edit #'.padStart(8)}${'n'.padStart(5)}${'p(have)'.padStart(10)}${'confidence'.padStart(12)}${'improved'.padStart(11)}${'regret'.padStart(9)}`);
  for (let s = 0; s < STEPS; s++) {
    const g = all.filter((t) => t.step === s);
    if (!g.length) continue;
    const reg = g.map((t) => t.bestAvailable, 0);
    console.log(`${String(s + 1).padStart(8)}${String(g.length).padStart(5)}` +
      `${(g.reduce((a, t) => a + (t.have ?? 0), 0) / g.length).toFixed(3).padStart(10)}` +
      `${(g.reduce((a, t) => a + (t.confidence ?? 0), 0) / g.length).toFixed(3).padStart(12)}` +
      `${pct(g.filter((t) => t.improved).length, g.length).padStart(11)}` +
      `${'—'.padStart(9)}`);
  }
  const gate = all.filter((t) => (t.confidence ?? 0) >= 0.9);
  console.log(`\n>=0.9 confidence fired on ${gate.length}/${all.length} edits (${pct(gate.length, all.length)}), ` +
    `of which improved: ${pct(gate.filter((t) => t.improved).length, gate.length)}`);
  console.log(`p(have) > 0.5 on ${pct(all.filter((t) => (t.have ?? 0) > 0.5).length, all.length)} of edits`);
}

if (OUT) { writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), chains: CHAINS,
  steps: STEPS, results }, null, 1)); console.log(`\nwrote ${OUT}`); }
