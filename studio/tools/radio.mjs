#!/usr/bin/env node
// radio.mjs — Duende Radio in node: lint every station, read a passage as a score, render it to a WAV,
// or replay a moment someone saved from the page ("that bit").
//
//   node studio/tools/radio.mjs                         lint every station (two seeds, 96 bars each)
//   node studio/tools/radio.mjs --station feria --score --bars 16     the passage, bar by bar
//   node studio/tools/radio.mjs --k 25,15,20,45,30,45,30,80 --seed 7 --wav out.wav --bars 24
//   node studio/tools/radio.mjs --clip '<a link or the #clip= code>' --score --wav clip.wav
//   node studio/tools/radio.mjs --composer path/to/old-composer.js    lint another version (A/B)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { lint } from '../radio/lint.js';
import { clipKnobs } from '../radio/clip.js';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; }, has = (k) => args.includes(`--${k}`);
const C = await import(pathToFileURL(resolve(opt('composer', join(root, 'radio/composer.js')))).href);
const { Radio, STATIONS, KNOBS } = C;
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const nm = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const asK = (v) => Object.fromEntries(KNOBS.map((k, i) => [k, v[i]]));

/** Bars from a fresh radio (or a clip: a state and the dials bar by bar). */
async function collect({ seed = 1, knobs, bars = 96, clip = null }) {
  let R, plan = null;
  if (clip) { R = Radio.from(clip.state); plan = clip.knobs; bars = clip.bars; }
  else R = new Radio({ seed });
  const out = [];
  let k = knobs;
  for (let b = 0; b < bars; b++) {
    if (plan) { const e = clipKnobs(clip, b, KNOBS); if (e) k = e; }
    out.push(R.next(k));
  }
  return out;
}

function score(bars) {
  for (const b of bars) {
    const i = b.info, mel = b.notes.filter((n) => n.role === 'mel').map((n) => `${nm(n.midi)}@${(+n.tick).toFixed(1)}`).join(' ');
    const by = (inst) => b.notes.filter((n) => n.inst === inst).length;
    console.log(`${String(i.bar).padStart(4)} ${String(i.inPhrase)} ${i.chord.padEnd(14)} ${i.texture.padEnd(9)} ${i.lead.padEnd(6)} ${String(i.bpm).padStart(3)}bpm  p${String(by(0)).padStart(2)} g${String(by(1)).padStart(2)} | ${mel}`);
  }
}

async function wav(bars, path, sr = 44100) {
  const { RadioStream } = await import('../radio/stream.js');
  const { parseWav } = await import('../cycle/music.js');
  const X = (await WebAssembly.instantiate(await readFile(join(root, 'vendor/pfsynth/pfstream.wasm')), {})).instance.exports;
  const bb = await readFile(join(root, 'vendor/pfsynth/bodies/g34.wav'));
  const s = new RadioStream(X, { sampleRate: sr, body: parseWav(bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength)) });
  let q = 0;
  const lastBar = bars[bars.length - 1];                          // play exactly these bars, then silence
  s.use({ t: bars[0].t, n: 0, next: () => { const b = bars[q] ?? { ...lastBar, t: lastBar.t + (q - bars.length + 1) * lastBar.sec, notes: [] }; q++; return b; } });
  const end = bars[bars.length - 1].t - bars[0].t + bars[bars.length - 1].sec + 2, chunks = [];
  while (s.frame / sr < end) chunks.push(s.render(11).pcm);
  const n = chunks.reduce((a, c) => a + c.length, 0), pcm = new Int16Array(n);
  let o = 0; for (const c of chunks) for (const v of c) pcm[o++] = Math.max(-1, Math.min(1, v)) * 32767;
  const h = Buffer.alloc(44), d = Buffer.from(pcm.buffer);
  h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(d.length, 40);
  await writeFile(path, Buffer.concat([h, d]));
  console.log(`wrote ${path}: ${(n / 2 / sr).toFixed(1)} s`);
}

const fmt = (L) => ['clash', 'seconds', 'crowd', 'parallels', 'leaps', 'unrecovered', 'repeats', 'peaks', 'cadence', 'hand', 'variety'].map((k) => String(L[k]).padStart(k.length > 5 ? k.length : 6)).join(' ');
const head = ['clash', 'seconds', 'crowd', 'parallels', 'leaps', 'unrecovered', 'repeats', 'peaks', 'cadence', 'hand', 'variety'].map((k) => k.padStart(k.length > 5 ? k.length : 6)).join(' ');

let clip = null;
if (opt('clip')) { const { decodeClip } = await import('../radio/clip.js'); clip = await decodeClip(opt('clip')); }
const bars = Number(opt('bars', 96)), seed = Number(opt('seed', 1));
if (clip || opt('station') || opt('k')) {
  const st = opt('station') && STATIONS.find(([n]) => n === opt('station'));
  const knobs = st ? asK(st[1]) : opt('k') ? asK(opt('k').split(',').map((x) => Number(x) / 100)) : undefined;
  const B = await collect({ seed, knobs, bars, clip });
  if (has('score')) score(B);
  console.log(head); console.log(fmt(lint(B)));
  if (opt('wav')) await wav(B, opt('wav'));
} else {
  console.log('station        ' + head);
  const all = [];
  for (const [name, v] of STATIONS) {
    // two seeds, each linted on its own (their clocks both start at zero) and averaged
    const Ls = [lint(await collect({ seed, knobs: asK(v), bars })), lint(await collect({ seed: seed + 1, knobs: asK(v), bars }))];
    const L = Object.fromEntries(Object.keys(Ls[0]).map((k) => [k, +((Ls[0][k] + Ls[1][k]) / 2).toFixed(3)])); all.push(L);
    console.log(name.padEnd(15) + fmt(L));
  }
  const mean = Object.fromEntries(Object.keys(all[0]).map((k) => [k, +(all.reduce((s, L) => s + L[k], 0) / all.length).toFixed(3)]));
  console.log('MEAN'.padEnd(15) + fmt(mean));
}
