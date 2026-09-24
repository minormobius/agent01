#!/usr/bin/env node
// studio.selftest.mjs — what can be checked about a piece without eyes or ears.
//
//   node studio/test/studio.selftest.mjs
//
// 1. The borrowed piano is clef's, byte for byte.
// 2. The score is a well-formed performance: sorted, in range, few enough notes.
// 3. The cues the plant grows by happen in the order a plant grows.
// 4. The whole piece renders through the piano: finite, not silent, not
//    clipping, loudest at the bloom — and fast enough to stream.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { instantiate, begin } from '../lib/pfsynth-core.js';
import { events, cues, duration } from '../anthesis/score.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failed++; };

// 1 ---------------------------------------------------------------------------
const ours = await readFile(join(root, 'vendor/pfsynth/pfsynth.wasm'));
const clefs = await readFile(join(root, '..', 'clef/vendor/pfsynth/pfsynth.wasm'));
ok(Buffer.compare(ours, clefs) === 0, `pfsynth.wasm is byte-identical to clef's (${ours.length} bytes)`);

// 2 ---------------------------------------------------------------------------
ok(events.length > 100 && events.length < 32768, `${events.length} notes, under the model's 32768`);
ok(events.every((e, i) => i === 0 || e.at >= events[i - 1].at), 'events are sorted by onset');
ok(events.every((e) => e.midi >= 21 && e.midi <= 108), 'every note is on a piano keyboard');
ok(events.every((e) => e.velocity > 0 && e.velocity <= 1 && e.dur > 0), 'velocities in (0, 1], durations positive');
ok(events.every((e) => Number.isFinite(e.at) && Number.isFinite(e.dur)), 'all times finite');

// 3 ---------------------------------------------------------------------------
const order = [
  ['first drop', cues.drops[0].at], ['crack', cues.crack], ['root', cues.root],
  ['hypocotyl', cues.hypocotyl], ['emerge', cues.emerge], ['cotyledons', cues.cotyledons],
  ['coat falls', cues.coatFalls], ['leaf 1', cues.leaves[0]], ['leaf 6', cues.leaves[5]],
  ['bud', cues.bud], ['lift', cues.lift], ['bloom', cues.bloom],
  ['petal 1', cues.petals[0]], ['petal 8', cues.petals[7]], ['pollen', cues.pollen[0]],
  ['last chord', cues.last], ['end', cues.end],
];
ok(order.every(([, t], i) => i === 0 || t > order[i - 1][1]), `the plant grows in order: ${order.map(([n]) => n).join(' → ')}`);
ok(cues.leaves.length === 6, 'six true leaves, one per bar of the melody');
ok(cues.petals.length === 8 && cues.petals.every((t, i) => i === 0 || t > cues.petals[i - 1]), 'eight cascade notes, rising in time: one per stage of opening');
ok(Math.abs(duration - cues.end) < 1e-9 && duration > 60 && duration < 150, `duration ${duration.toFixed(1)} s`);

// 4 ---------------------------------------------------------------------------
const SR = 22050;   // half rate keeps the test quick; the model is rate-agnostic
const X = await instantiate(ours);
const t0 = performance.now();
const r = begin(X, events, SR);
const parts = [];
let c;
while ((c = r.pull())) parts.push(c);
const wall = (performance.now() - t0) / 1000;
const pcm = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
let at = 0;
for (const p of parts) { pcm.set(p, at); at += p.length; }
const secs = pcm.length / 2 / SR;
let finite = true, peak = 0, hot = 0;
for (const v of pcm) {
  if (!Number.isFinite(v)) finite = false;
  const a = Math.abs(v);
  if (a > peak) peak = a;
  if (a > 0.97) hot++;
}
const rms = (a, b) => {
  let s = 0, n = 0;
  for (let i = Math.floor(a * SR) * 2; i < Math.min(pcm.length, Math.floor(b * SR) * 2); i++) { s += pcm[i] * pcm[i]; n++; }
  return Math.sqrt(s / Math.max(1, n));
};
ok(finite, 'rendered audio is finite');
ok(secs >= duration - 5, `rendered ${secs.toFixed(1)} s, covering the score's ${duration.toFixed(1)} s`);
ok(rms(0, cues.root) > 1e-3, 'the opening is not silent');
ok(hot / pcm.length < 0.001, `under 0.1% of samples in the tanh knee (${(100 * hot / pcm.length).toFixed(4)}%, peak ${peak.toFixed(3)})`);
const bloom = rms(cues.bloom, cues.pollen[0]);
ok(bloom > rms(cues.cotyledons, cues.bud) && bloom > rms(cues.bud, cues.bloom) * 0.95 && bloom > rms(cues.pollen[0], cues.end),
  'the bloom is the loudest section (or level with the bud that leads into it)');
ok(secs / wall > 1.5, `renders at ${(secs / wall).toFixed(1)}x real time at ${SR} Hz (streams if > 1)`);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
