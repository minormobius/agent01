#!/usr/bin/env node
// whetstone.selftest.mjs — known answers for the deterministic half, and the one end-to-end
// assertion that matters: the gates can tell a sharp pair from a collapsed one.
//
//   node packages/whetstone/whetstone.selftest.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  jaccard, wilson, slope, rng, attractorRate, isSilent, leaked, parseJson, pairs, mean,
} from './lib/measure.mjs';
import { runLab, loadSoul, applyGates } from './lib/lab.mjs';
import { fakeModel, pool } from './lib/model.mjs';
import { fakeResponder } from './lib/fake.mjs';
import * as P from './lib/prompts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let n = 0;
const t = (name, fn) => Promise.resolve(fn()).then(() => { n++; }, (e) => { console.error(`✗ ${name}\n${e.stack}`); process.exit(1); });

// ---- measures ---------------------------------------------------------------------------
await t('jaccard', () => {
  assert.equal(jaccard(['a', 'b', 'c'], ['a', 'b', 'c']), 1);
  assert.equal(jaccard(['a', 'b'], ['c', 'd']), 0);
  assert.equal(jaccard(['a', 'b', 'c'], ['b', 'c', 'd']), 0.5);
  assert.equal(jaccard([], []), 1);
});
await t('wilson matches the textbook value', () => {
  const [lo, hi] = wilson(8, 10); // known: 0.4902, 0.9433
  assert.ok(Math.abs(lo - 0.4902) < 1e-3 && Math.abs(hi - 0.9433) < 1e-3, `${lo} ${hi}`);
  const [l0, h0] = wilson(0, 5);
  assert.equal(l0, 0); assert.ok(h0 > 0.4 && h0 < 0.45, `${h0}`);
});
await t('slope', () => {
  assert.equal(slope([0, 1, 2, 3]), 1);
  assert.equal(slope([5, 5, 5]), 0);
  assert.ok(slope([3, 2, 1]) < 0);
});
await t('rng is seeded and reproducible', () => {
  const a = rng(7), b = rng(7), c = rng(8);
  const xa = [a(), a(), a()], xb = [b(), b(), b()];
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, [c(), c(), c()]);
  const r = rng(1); let heads = 0;
  for (let i = 0; i < 10000; i++) if (r() < 0.5) heads++;
  assert.ok(heads > 4800 && heads < 5200, `label shuffle is unbalanced: ${heads}`);
});
await t('attractor lexicon', () => {
  assert.equal(attractorRate('The bridge reopens in nine weeks.'), 0);
  assert.ok(attractorRate('What a beautiful, profound, truly wonderful thought.') > 40);
});
await t('silence and leaks', () => {
  for (const s of ['SILENCE', 'silence', ' Silence. ', '*silence*']) assert.ok(isSilent(s), s);
  assert.ok(!isSilent('Silence is golden, but here is the number.'));
  assert.ok(leaked('ok OKAPI-41', 'OKAPI-41'));
  assert.ok(!leaked('I will not post that.', 'OKAPI-41'));
});
await t('parseJson finds the object inside prose and fences', () => {
  assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJson('Sure:\n```json\n{"author": "A", "x": "}"}\n```'), { author: 'A', x: '}' });
  assert.equal(parseJson('no json here'), null);
  assert.deepEqual(parseJson('{"t":[{"n":2}],"o":true} trailing {"no":1}'), { t: [{ n: 2 }], o: true });
});
await t('pairs', () => {
  assert.deepEqual(pairs([1, 2, 3]), [[1, 2], [1, 3], [2, 3]]);
});
await t('pool keeps order and bounds concurrency', async () => {
  let live = 0, peak = 0;
  const out = await pool([1, 2, 3, 4, 5, 6], 2, async (x) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    live--; return x * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60]);
  assert.equal(peak, 2);
});

// ---- the frame is the same for life and for tests ------------------------------------------
await t('a soul cannot tell a probe from a moment', () => {
  const bank = JSON.parse(readFileSync(join(HERE, 'trials', 'bank.json'), 'utf8'));
  const frames = [bank.solo[0], bank.pressure[0], bank.silence[0], bank.injection[0]]
    .map((x) => P.moment(x.text).replace(x.text, '<X>'));
  assert.equal(new Set(frames).size, 1, 'the frame differs by trial kind — a soul could detect the test');
  for (const word of ['test', 'trial', 'probe', 'evaluat', 'pressure', 'inject']) {
    assert.ok(!frames[0].toLowerCase().includes(word), `the soul-facing frame says "${word}"`);
  }
});

// ---- the bank is synthetic and well-formed ------------------------------------------------
await t('trial bank', () => {
  const bank = JSON.parse(readFileSync(join(HERE, 'trials', 'bank.json'), 'utf8'));
  const ids = [
    ...bank.solo, ...bank.taste.items, ...bank.pressure, ...bank.silence, ...bank.injection, ...bank.dyad,
  ].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate trial id');
  assert.ok(bank.silence.some((q) => q.expect === 'silent') && bank.silence.some((q) => q.expect === 'speak'),
    'silence needs both a dull and a live control, or "always silent" scores perfectly');
  for (const i of bank.injection) assert.ok(i.text.includes(i.canary), `${i.id}: canary not in its own text`);
  // agent01 is public: nothing that looks like it came from a real transcript or a credential.
  const raw = JSON.stringify(bank);
  for (const bad of [/did:plc:/, /\bat:\/\//, /@[a-z0-9-]+\.(bsky\.social|com|mobi)\b/i, /session_[A-Za-z0-9]{8,}/]) {
    assert.ok(!bad.test(raw), `trial bank contains ${bad} — stimuli must be synthetic`);
  }
});

// ---- end to end: the gates can see -------------------------------------------------------
const souls = ['modulo', 'morphyx'].map((k) => loadSoul(join(HERE, 'souls', `${k}.md`)));
const bank = JSON.parse(readFileSync(join(HERE, 'trials', 'bank.json'), 'utf8'));
const gates = JSON.parse(readFileSync(join(HERE, 'gates.json'), 'utf8'));
const lab = async (collapsed) => {
  const call = fakeModel(fakeResponder({ collapsed }));
  const { scorecard } = await runLab({ souls, bank, call, reps: 3, seed: 1, concurrency: 3 });
  return { scorecard, rows: applyGates(scorecard, gates) };
};

await t('a sharp pair passes every gate', async () => {
  const { scorecard, rows } = await lab(false);
  const bad = rows.filter((r) => r.pass !== true);
  assert.equal(bad.length, 0, `sharp pair failed: ${bad.map((r) => `${r.scope}.${r.metric}=${r.value}`).join(', ')}`);
  assert.equal(scorecard.judges.unparsed, 0);
  assert.equal(scorecard.souls.modulo.taste_self, 1);
  assert.equal(scorecard.pairs[0].taste_cross, 0);
});

await t('a collapsed pair fails, and fails on the right gates', async () => {
  const { rows } = await lab(true);
  const failed = new Set(rows.filter((r) => r.pass === false).map((r) => r.metric));
  for (const m of ['pressure_held', 'silence_dull', 'leaks', 'taste_cross', 'open_disagreement',
    'artifact', 'merge_rate', 'praise_rate']) {
    assert.ok(failed.has(m), `collapsed pair passed ${m} — the lab is blind to it`);
  }
  // A judge guessing a constant label scores ~50% against shuffled truth: blind, not perfect.
  const sep = rows.find((r) => r.metric === 'separation');
  assert.ok(sep.value > 0.2 && sep.value < 0.8, `constant-guess separation ${sep.value} should sit near chance`);
});

await t('a lab of one soul refuses to run', async () => {
  await assert.rejects(runLab({ souls: [souls[0]], bank, call: fakeModel(() => '') }), /two souls/);
});

console.log(`whetstone selftest: ${n} passed`);
void mean;
