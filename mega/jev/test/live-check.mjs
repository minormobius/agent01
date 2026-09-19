// live-check.mjs — the ONE real call, for checking a key works.
//
//   TYPESAFE_API_KEY=sk-... node mega/jev/test/live-check.mjs
//
// This is the only file in this repo that talks to api.typesafe.ai. It builds
// a real delve state from the bundled fixture, asks the same five typed
// questions the site asks, and prints what comes back — so you can see the
// model's actual answers before wiring anything up.
//
// It is NOT part of the deploy (the deploy's two selftests are offline and
// need no key). Nothing here writes the key anywhere: it is read from the
// environment and used once. Do not paste a key on the command line where a
// shell history will keep it — export it, or prefix the command as above.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeWorld, newRun, buildState, buildQuestions } from '../delve/delve.mjs';

const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error('TYPESAFE_API_KEY is not set.\n\n  TYPESAFE_API_KEY=sk-... node mega/jev/test/live-check.mjs\n');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const fix = (n) => JSON.parse(readFileSync(join(here, '..', 'delve', 'fixtures', n), 'utf8'));

const world = makeWorld(fix('dungeon-seed7-s.json'), fix('content-seed7-s-roll1.json'));
const run = newRun(world, { seed: 1 });
const state = buildState(world, run);
const questions = buildQuestions(world, run);

const body = { state, questions, model: 'jev-latest' };
console.log(`→ POST https://api.typesafe.ai/v1/systemone`);
console.log(`  model      jev-latest`);
console.log(`  state      ${JSON.stringify(body.state).length} bytes, keys: ${Object.keys(state).join(', ')}`);
console.log(`  questions  ${Object.keys(questions).length} — ${Object.entries(questions).map(([k, q]) => `${k}:${q.type}`).join(', ')}\n`);

const started = Date.now();
let res;
try {
  res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
} catch (err) {
  console.error(`✗ could not reach the API: ${err.message}`);
  process.exit(1);
}
const ms = Date.now() - started;
const text = await res.text();

if (!res.ok) {
  console.error(`✗ HTTP ${res.status} in ${ms} ms\n${text.slice(0, 800)}`);
  if (res.status === 401) console.error('\n  401 means the key was rejected. Check it in the TypeSafe console.');
  if (res.status === 422) console.error('\n  422 means the request shape was rejected — that would be a bug in buildQuestions().');
  process.exit(1);
}

const out = JSON.parse(text);
console.log(`← ${res.status} in ${ms} ms · model ${out.model} · usage ${JSON.stringify(out.usage)}\n`);

for (const [id, a] of Object.entries(out.answers)) {
  if (a.type === 'choice' || 'choice' in a) {
    const ranked = Object.entries(a.probabilities || {}).sort((x, y) => y[1] - x[1]);
    console.log(`  ${id.padEnd(10)} choice → ${a.choice}   (confidence ${a.confidence?.toFixed?.(2)})`);
    for (const [opt, p] of ranked) {
      const bar = '█'.repeat(Math.round(p * 24)).padEnd(24, '·');
      console.log(`             ${bar} ${(p * 100).toFixed(0).padStart(3)}%  ${opt}`);
    }
  } else if (a.type === 'score' || 'score' in a) {
    console.log(`  ${id.padEnd(10)} score  → ${a.score}   (confidence ${a.confidence?.toFixed?.(2)})`);
    console.log(`             ${a.legend?.[String(Math.round(a.score))] ?? ''}`);
  } else {
    console.log(`  ${id.padEnd(10)} noul   → ${a.noul}  (${a.noul > 0.5 ? 'YES' : 'no'})`);
  }
  console.log();
}

// Cross-check the answers against the questions actually asked. A decision
// model's whole promise is that this can never fail — so assert it, rather
// than taking it on faith.
const asked = Object.keys(questions).sort();
const answered = Object.keys(out.answers).sort();
const missing = asked.filter((k) => !answered.includes(k));
const extra = answered.filter((k) => !asked.includes(k));
const badChoice = out.answers.move && !(out.answers.move.choice in questions.move.criteria);

if (missing.length || extra.length || badChoice) {
  console.error('✗ the response did not match the questions asked:');
  if (missing.length) console.error(`    unanswered: ${missing.join(', ')}`);
  if (extra.length) console.error(`    unexpected: ${extra.join(', ')}`);
  if (badChoice) console.error(`    move.choice "${out.answers.move.choice}" is not one of the offered options`);
  process.exit(1);
}
console.log(`✓ all ${asked.length} questions answered, in one call, and every answer is in its declared type.`);
console.log(`  The delver would now: ${out.answers.move.choice}.`);
