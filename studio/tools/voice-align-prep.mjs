#!/usr/bin/env node
// voice-align-prep.mjs — for each reference recording, render the formant voice saying the same
// text and record, frame by frame (5 ms), which phoneme and which word it is saying. That frame
// map is what tools/voice_measure.py warps onto the recording to find its phonemes.
//
//   node studio/tools/voice-align-prep.mjs <reference dir> <out dir>
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phonemize, timing, tracks, renderFormant, wav, VOICE } from '../lib/chipvoice.js';

const here = dirname(fileURLToPath(import.meta.url));
const [refDir, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const lex = JSON.parse(readFileSync(join(here, '..', 'voice', 'lexicon.json'), 'utf8')).words;
let n = 0;
for (const f of readdirSync(refDir).filter((f) => f.endsWith('.json'))) {
  const id = f.replace('.json', ''), { text } = JSON.parse(readFileSync(join(refDir, f), 'utf8'));
  const ph = phonemize(text, lex), tm = timing(ph, VOICE), tr = tracks(tm, VOICE);
  writeFileSync(join(out, `${id}.wav`), wav(renderFormant(tr, { rate: 16000, voice: VOICE }), 16000));
  writeFileSync(join(out, `${id}.frames.json`), JSON.stringify({
    text,
    phones: tm.map((x) => (x.pause ? { pause: true } : { p: x.p, stress: x.stress, word: x.word, w: x.w })),
    frames: tr.map((t) => t.seg),
  }));
  n++;
}
console.log(`${n} utterances prepared in ${out}`);
