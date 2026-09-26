#!/usr/bin/env node
// render.mjs — render a studio piece's score through the piano, in node.
//
//   node studio/tools/render.mjs anthesis              # stats: speed, level, clipping
//   node studio/tools/render.mjs anthesis --wav out.wav
//
// There is no audio in the sandbox this was written in, so this is how the
// music is checked: loudness per section, peaks against the tanh knee, and how
// much faster than real time it renders (which decides how long a listener
// waits before the piece can start).

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { instantiate, begin } from '../lib/pfsynth-core.js';

const here = dirname(fileURLToPath(import.meta.url));
const piece = process.argv[2] || 'anthesis';
const wavAt = process.argv.indexOf('--wav');
const SR = 44100;

const S0 = await import(join(here, '..', piece, 'score.js'));
const { cues, duration } = S0;
// A piece with a band plays the piano part on pfsynth and the rest on lib/band.js.
const events = S0.pianoEvents ?? S0.events;
const X = await instantiate(await readFile(join(here, '..', 'vendor/pfsynth/pfsynth.wasm')));

const t0 = performance.now();
const r = begin(X, events, SR);
const chunks = [];
let c;
while ((c = r.pull())) chunks.push(c);
const wall = (performance.now() - t0) / 1000;
const frames = r.frames;
let pcm = new Float32Array(frames * 2);
let at = 0;
for (const ch of chunks) { pcm.set(ch, at); at += ch.length; }

let secs = frames / SR;
if (S0.bandEvents) {
  const { renderBand, mix } = await import('../lib/band.js');
  const tb = performance.now();
  const n = Math.ceil(duration * SR);
  const band = renderBand(S0.bandEvents, SR, { seconds: duration, wet: S0.wet, slap: S0.slap, vocal: S0.vocal ? S0.vocal(SR) : null });
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n && i * 2 < pcm.length; i++) { L[i] = pcm[2 * i]; R[i] = pcm[2 * i + 1]; }
  mix(L, R, band);
  pcm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { pcm[2 * i] = L[i]; pcm[2 * i + 1] = R[i]; }
  secs = n / SR;
  console.log(`band: ${S0.bandEvents.length} events rendered in ${((performance.now() - tb) / 1000).toFixed(1)} s`);
}
let peak = 0, over9 = 0, nan = 0;
for (const v of pcm) {
  if (!Number.isFinite(v)) nan++;
  const a = Math.abs(v);
  if (a > peak) peak = a;
  if (a > 0.9) over9++;
}
const rms = (a, b) => {
  const i0 = Math.floor(a * SR) * 2, i1 = Math.min(pcm.length, Math.floor(b * SR) * 2);
  let s = 0;
  for (let i = i0; i < i1; i++) s += pcm[i] * pcm[i];
  return 20 * Math.log10(Math.sqrt(s / Math.max(1, i1 - i0)) + 1e-12);
};
const pk = (a, b) => {
  let p = 0;
  for (let i = Math.floor(a * SR) * 2; i < Math.min(pcm.length, b * SR * 2); i++) p = Math.max(p, Math.abs(pcm[i]));
  return 20 * Math.log10(p + 1e-12);
};

console.log(`${piece}: ${events.length} notes, score ${duration.toFixed(1)} s, rendered ${secs.toFixed(1)} s in ${wall.toFixed(1)} s = ${(secs / wall).toFixed(2)}x real time`);
console.log(`peak ${peak.toFixed(3)} (${(20 * Math.log10(peak)).toFixed(1)} dBFS), ${(100 * over9 / pcm.length).toFixed(3)}% of samples past 0.9, non-finite ${nan}`);
// Sections come from the score's own notation, so every piece reports alike.
const S = await import(join(here, '..', piece, 'score.js'));
const secs0 = S.notation.sections.map(([bar, name]) => [name, S.sec((bar - 1) * (S.BEATS_PER_BAR || 4))]);
const marks = secs0.map(([name, a], k) => [name, a, secs0[k + 1]?.[1] ?? secs]);
for (const [name, a, b] of marks) {
  console.log(`  ${name.padEnd(12)} ${a.toFixed(1).padStart(5)}–${b.toFixed(1).padEnd(5)}  rms ${rms(a, b).toFixed(1).padStart(6)} dB  peak ${pk(a, b).toFixed(1).padStart(6)} dB`);
}

if (wavAt > 0) {
  const out = process.argv[wavAt + 1];
  const outFrames = pcm.length / 2;
  const buf = Buffer.alloc(44 + outFrames * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + outFrames * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(outFrames * 4, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2);
  await writeFile(out, buf);
  console.log(`wrote ${out}`);
}
