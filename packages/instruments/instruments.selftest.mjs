#!/usr/bin/env node
// instruments.selftest.mjs — known answers: both instruments sound, fractional MIDI gives the pitch it
// names (the comma pump needs that), a WAV is well formed and reproducible, and bad scores are refused.
//
//   node packages/instruments/instruments.selftest.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderPiano, renderGuitar, renderScore, checkScore, wav, health } from './render.mjs';

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error(`✗ ${name}\n${e.stack}`); process.exit(1); } };
const SR = 44100;

// The strongest component within ±1% of a guess, scanned at 0.01 Hz over a Hann window.
function f0(st, guess, t0, t1) {
  const a = Math.round(t0 * SR), len = Math.round((t1 - t0) * SR), x = new Float64Array(len);
  for (let i = 0; i < len; i++) x[i] = (st[2 * (a + i)] + st[2 * (a + i) + 1]) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (len - 1)));
  let best = 0, bf = 0;
  for (let f = guess * 0.99; f <= guess * 1.01; f += 0.01) {
    let re = 0, im = 0; const w = (2 * Math.PI * f) / SR;
    for (let i = 0; i < len; i += 2) { re += x[i] * Math.cos(w * i); im += x[i] * Math.sin(w * i); }
    if (re * re + im * im > best) { best = re * re + im * im; bf = f; }
  }
  return bf;
}
const cents = (want, got) => 1200 * Math.log2(got / want);

await t('health: one second of each instrument renders sound', async () => {
  const h = await health();
  assert.equal(h.ok, true); assert.equal(h.parts.length, 2);
});

await t('the piano plays fractional MIDI: A4 and a syntonic comma above it, within 1 cent', async () => {
  for (const m of [69, 69 + 12 * Math.log2(81 / 80)]) {
    const st = await renderPiano([{ at: 0, dur: 6, midi: m, velocity: 0.7 }], SR);
    const want = 440 * 2 ** ((m - 69) / 12);
    assert.ok(Math.abs(cents(want, f0(st, want, 1.0, 5.0))) < 1, `midi ${m}`);
  }
});

await t('the guitar plays fractional MIDI too, within 1 cent', async () => {
  for (const m of [57, 57 + 12 * Math.log2(81 / 80)]) {
    const { stereo } = await renderGuitar({ events: [{ at: 0, dur: 1.5, midi: m, velocity: 0.7 }] }, SR);
    const want = 440 * 2 ** ((m - 69) / 12);
    assert.ok(Math.abs(cents(want, f0(stereo, want, 0.3, 1.3))) < 1, `midi ${m}`);
  }
});

await t('a mix is normalised to −1 dBFS, written as a well-formed WAV, and the same score gives the same bytes', async () => {
  const score = { parts: [{ instrument: 'piano', events: [{ at: 0, dur: 0.5, midi: 48 }] }, { instrument: 'guitar', events: [{ at: 0.2, dur: 0.5, midi: 52 }], gain: 0.5 }] };
  const a = await renderScore(score, { rate: 22050 }), b = await renderScore(score, { rate: 22050 });
  let peak = 0; for (const v of a.stereo) peak = Math.max(peak, Math.abs(v));
  assert.ok(Math.abs(peak - 0.89) < 1e-6);
  const w = wav(a.stereo, a.rate), m = wav(a.stereo, a.rate, { mono: true });
  assert.equal(w.toString('ascii', 0, 4), 'RIFF'); assert.equal(w.toString('ascii', 8, 12), 'WAVE');
  assert.equal(w.readUInt16LE(22), 2); assert.equal(w.readUInt32LE(24), 22050); assert.equal(w.readUInt16LE(34), 16);
  assert.equal(w.readUInt32LE(40), w.length - 44); assert.equal(m.readUInt16LE(22), 1); assert.equal(m.length - 44, (w.length - 44) / 2);
  const h = (x) => createHash('sha256').update(x).digest('hex');
  assert.equal(h(w), h(wav(b.stereo, b.rate)), 'reproducible to the byte');
});

await t('bad scores are refused with reasons', () => {
  assert.match(checkScore({}).join(' '), /parts/);
  assert.match(checkScore({ parts: [{ instrument: 'violin', events: [{ at: 0, dur: 1, midi: 60 }] }] }).join(' '), /piano" or "guitar/);
  assert.match(checkScore({ parts: [{ instrument: 'piano', events: [{ at: -1, dur: 0, midi: 200 }] }] }).join(' '), /midi 21–108/);
  assert.match(checkScore({ parts: [{ instrument: 'piano', events: [{ at: 700, dur: 1, midi: 60 }] }] }).join(' '), /limit is 600/);
  assert.match(checkScore({ rate: 8000, parts: [{ instrument: 'piano', events: [{ at: 0, dur: 1, midi: 60 }] }] }).join(' '), /"rate"/);
});

console.log(`instruments selftest: ${n} passed`);
