#!/usr/bin/env node
// voice.mjs — render the chip voice's test set and ask Whisper what it heard.
//
//   node studio/tools/voice.mjs [--out dir] [--model base.en] [--only paragraph|harvard] [--no-asr]
//
// Needs faster-whisper importable by python3 (set VOICE_PYLIB to a --target install).
// Prints each sentence, what Whisper heard, and the word error rate; writes the WAVs to --out
// so a person can listen too. The Harvard sentences are the honest score: unpredictable words.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { speak, wav, VOICE } from '../lib/chipvoice.js';
import { PARAGRAPH_SENTENCES, HARVARD, PARAGRAPH } from '../voice/texts.js';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const out = arg('--out', '/tmp/chipvoice'), model = arg('--model', 'base.en'), only = arg('--only', null);
mkdirSync(out, { recursive: true });
// --set rate=1.2 --set f0=130: try a voice without editing it
argv.forEach((a, i) => { if (a === '--set') { const [k, v] = argv[i + 1].split('='); VOICE[k] = Number(v); } });
const lex = JSON.parse(readFileSync(join(here, '..', 'voice', 'lexicon.json'), 'utf8')).words;

const set = [
  ...(only === 'harvard' ? [] : PARAGRAPH_SENTENCES.map((t, i) => ({ id: `p${i + 1}`, t }))),
  ...(only === 'paragraph' ? [] : HARVARD.map((t, i) => ({ id: `h${i + 1}`, t }))),
];
for (const s of set) { const { audio, rate } = speak(s.t, lex); writeFileSync(join(out, `${s.id}.wav`), wav(audio, rate)); s.sec = audio.length / rate; }
{ const { audio, rate } = speak(PARAGRAPH, lex, { rate: 22050 }); writeFileSync(join(out, 'paragraph.wav'), wav(audio, rate)); }
console.log(`rendered ${set.length} sentences to ${out} (voice: f0 ${VOICE.f0} Hz, scale ${VOICE.scale})`);
if (argv.includes('--no-asr')) process.exit(0);

const norm = (s) => s.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean);
/** Word error rate: word-level edit distance over the reference's length. */
export function wer(ref, hyp) {
  const r = norm(ref), h = norm(hyp), d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...new Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { errors: d[r.length][h.length], words: r.length };
}
/** Character error rate: the same over letters (spaces kept), smoother than words on near misses. */
function cer(ref, hyp) {
  const r = norm(ref).join(' '), h = norm(hyp).join(' ');
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) { const cur = [i]; for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)); prev = cur; }
  return { errors: prev[h.length], chars: r.length };
}
const env = { ...process.env, PYTHONPATH: [process.env.VOICE_PYLIB, process.env.PYTHONPATH].filter(Boolean).join(':') };
const lines = execFileSync('python3', [join(here, 'voice_asr.py'), '--model', model, ...set.map((s) => join(out, `${s.id}.wav`))], { env, maxBuffer: 1 << 24 }).toString().trim().split('\n').map((l) => JSON.parse(l));
const tally = { p: [0, 0, 0, 0], h: [0, 0, 0, 0] };
for (const [i, s] of set.entries()) {
  const heard = lines[i].text, w = wer(s.t, heard), g = tally[s.id[0]];
  const c = cer(s.t, heard);
  g[0] += w.errors; g[1] += w.words; g[2] += c.errors; g[3] += c.chars;
  console.log(`${s.id.padEnd(4)} ${(100 * w.errors / w.words).toFixed(0).padStart(3)}%  ${s.t}\n                heard: ${heard}`);
}
// --report: what the page shows, sentence by sentence (studio/voice/report.json)
if (argv.includes('--report')) {
  const pct = (a, b) => +(100 * a / b).toFixed(1);
  writeFileSync(join(here, '..', 'voice', 'report.json'), JSON.stringify({
    judge: `whisper ${model} (faster-whisper, int8, beam 5, no prompt, each sentence alone)`,
    date: new Date().toISOString().slice(0, 10),
    voice: { ...VOICE },
    paragraph: { wer: pct(tally.p[0], tally.p[1]), cer: pct(tally.p[2], tally.p[3]) },
    harvard: { wer: pct(tally.h[0], tally.h[1]), cer: pct(tally.h[2], tally.h[3]) },
    sentences: set.map((s, i) => ({ id: s.id, text: s.t, heard: lines[i].text, wer: pct(wer(s.t, lines[i].text).errors, wer(s.t, lines[i].text).words) })),
  }, null, 1));
}
for (const [k, name] of [['p', 'paragraph'], ['h', 'harvard']]) if (tally[k][1]) console.log(`${name}: WER ${(100 * tally[k][0] / tally[k][1]).toFixed(1)}% (${tally[k][0]}/${tally[k][1]} words), CER ${(100 * tally[k][2] / tally[k][3]).toFixed(1)}%, whisper ${model}`);
