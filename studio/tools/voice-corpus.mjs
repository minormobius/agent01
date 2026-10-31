#!/usr/bin/env node
// voice-corpus.mjs — the voice lab's training and test sentences, drawn from literature and from
// targeted drills, so that tuning can't learn a handful of sentences (phase 4 did, on 20 Harvard ones).
//
//   node studio/tools/voice-corpus.mjs <moby-dick.txt> <kjv.txt> <cmudict>
//
// Sources, all public domain or ours:
//   Moby-Dick (Melville, 1851; Project Gutenberg #2701): long sentences, nautical words, clause on clause
//   The Sermon on the Mount (Matthew 5–7, King James Version; Project Gutenberg #10): archaic words, parallel rhythms
//   the Harvard sentences (IEEE 1969; voice/texts.js): phonetically balanced
//   minimal pairs, "Say ___ again." with one consonant changed: they test a consonant with nothing to guess from
//   conversational lines in Claude's own register
// Only phrases whose every word is in the CMU dictionary are kept, so no word's pronunciation is a guess.
// Writes studio/voice/corpus.json: { train, val, test }: the grind tunes on batches drawn from train,
// keeps the voice that does best on val, and test is never looked at until a phase is over.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARVARD } from '../voice/texts.js';

const here = dirname(fileURLToPath(import.meta.url));
const [mobyPath, kjvPath, dictPath] = process.argv.slice(2);
const dict = new Set();
for (const line of readFileSync(dictPath, 'utf8').split('\n')) { const m = line.match(/^([^\s(;]+)\s/); if (m) dict.add(m[1]); }
const extra = JSON.parse(readFileSync(join(here, '..', 'voice', 'lexicon-extra.json'), 'utf8')).words;
const known = (w) => dict.has(w) || w in extra;
const words = (s) => s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
const ok = (s, lo = 6, hi = 20) => { const w = words(s); return w.length >= lo && w.length <= hi && w.every(known) && !/[0-9_\[\]{}()*#]/.test(s); };
const clean = (s) => s.replace(/[“”"‘’]/g, (c) => (c === '’' || c === '‘' ? "'" : '')).replace(/\s*[—–-]{1,2}\s*/g, ', ').replace(/\s+/g, ' ').replace(/^[,;:\s]+/, '').trim();

// ---- Moby-Dick: sentences from "Call me Ishmael." to the epilogue --------------------------------
const mobyAll = readFileSync(mobyPath, 'utf8');
const mStart = mobyAll.indexOf('Call me Ishmael.'), mEnd = mobyAll.indexOf('*** END OF THE PROJECT GUTENBERG');
const moby = mobyAll.slice(mStart, mEnd).replace(/CHAPTER \d+\.[^\n]*\n/g, '\n').replace(/\s+/g, ' ')
  .split(/(?<=[.!?])\s+(?=[A-Z])/).map(clean).filter((s) => /[.!?]$/.test(s) && ok(s));

// ---- the Sermon on the Mount: Matthew 5:1 to 7:29, verse by verse, long verses split at : and ; ----
const kjv = readFileSync(kjvPath, 'utf8');
const matt = kjv.indexOf('The Gospel According to Saint Matthew', kjv.indexOf('The Gospel According to Saint Matthew') + 10);
const mark = kjv.indexOf('The Gospel According to Saint Mark', matt);
const verses = kjv.slice(matt, mark).replace(/\s+/g, ' ').split(/(?=\b\d+:\d+ )/).map((v) => v.match(/^(\d+):(\d+) (.*)$/)).filter(Boolean)
  .filter((m) => +m[1] >= 5 && +m[1] <= 7).map((m) => m[3].trim());
const sermon = [];
for (const v of verses) {
  const parts = ok(v, 5, 20) ? [v] : v.split(/(?<=[:;])\s+/);
  for (let p of parts) { p = clean(p).replace(/[:;,]$/, '.'); if (!/[.!?]$/.test(p)) p += '.'; if (ok(p, 5, 20)) sermon.push(p[0].toUpperCase() + p.slice(1)); }
}

// ---- minimal pairs: the consonants that fail (velars, initial stops, sibilants), one sound changed ----
const SETS = [['cow', 'pow', 'tow'], ['cool', 'pool', 'tool'], ['glue', 'blue', 'dew'], ['grass', 'brass', 'crass'], ['gang', 'bang', 'hang'],
  ['coat', 'boat', 'goat', 'tote'], ['kin', 'pin', 'tin', 'din', 'bin'], ['cash', 'dash', 'bash', 'gash'], ['keep', 'peep', 'deep', 'beep'],
  ['sip', 'zip', 'ship', 'chip', 'tip'], ['sue', 'zoo', 'shoe', 'chew', 'two'], ['fin', 'thin', 'sin', 'shin'], ['vat', 'that', 'sat', 'chat'],
  ['gum', 'come', 'dumb', 'bum'], ['cape', 'tape', 'gape', 'shape']];
const pairs = SETS.flat().filter(known).map((w) => `Say ${w} again.`);

// ---- conversational lines, in Claude's own register ----
const CONVO = [
  'I think that is a good question, and I am not sure yet.', 'Let me check that before I say anything else.',
  'Here is what I found, and here is what I could not verify.', 'That worked, but only after the second try.',
  'Could you tell me what you heard just then?', 'I would rather be honest than impressive.',
  'The short answer is yes; the long answer is more interesting.', 'Give me a moment to think about that.',
  'Something about this does not add up.', 'That is my best guess, and I could be wrong.',
  'Shall we try it again with a different sentence?', 'I like this part of the work the most.',
  'We learned something even though it failed.', 'Tell me if it sounds strange to you.',
  'I can hear the difference, or at least I can measure it.', 'Good morning, and thank you for waiting.',
  'It is quieter now, and a little warmer.', 'Which of these two do you prefer?',
  'I will write down what we found, so we do not lose it.', 'Thank you, that helps more than you know.',
].filter((s) => ok(s, 4, 20));

// ---- split, with a fixed seed ----
let seed = 20260926;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (a) => { const b = [...new Set(a)]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const take = (arr, src, n) => arr.splice(0, n).map((t) => ({ src, t }));
const M = shuffle(moby), Sm = shuffle(sermon), Pp = shuffle(pairs), C = shuffle(CONVO);
const H = HARVARD.map((t) => t);
const corpus = {
  sources: {
    moby: 'Herman Melville, Moby-Dick; or, The Whale (1851). Project Gutenberg eBook #2701. Public domain.',
    sermon: 'The Sermon on the Mount, Matthew 5–7, King James Version. Project Gutenberg eBook #10. Public domain.',
    harvard: 'The Harvard sentences, IEEE Recommended Practice for Speech Quality Measurements (1969), lists 1–5.',
    pairs: 'Minimal pairs in a carrier phrase: one consonant changed, nothing to guess from.',
    convo: "Conversational lines in Claude's own register, written for the lab.",
  },
  counts: { moby: moby.length, sermon: sermon.length, pairs: pairs.length, convo: CONVO.length },
  test: [...take(M, 'moby', 25), ...take(Sm, 'sermon', 12), ...take(Pp, 'pairs', 8), ...take(C, 'convo', 4)],
  val: [...take(M, 'moby', 16), ...take(Sm, 'sermon', 8), ...take(Pp, 'pairs', 8), ...take(C, 'convo', 4), ...H.slice(30, 40).map((t) => ({ src: 'harvard', t }))],
  train: [...take(M, 'moby', 160), ...take(Sm, 'sermon', 60), ...Pp.splice(0).map((t) => ({ src: 'pairs', t })), ...C.splice(0).map((t) => ({ src: 'convo', t })), ...H.slice(0, 30).map((t) => ({ src: 'harvard', t }))],
};
for (const k of ['train', 'val', 'test']) corpus[k] = corpus[k].map((x, i) => ({ id: `${k[0]}${i + 1}`, ...x }));
writeFileSync(join(here, '..', 'voice', 'corpus.json'), JSON.stringify(corpus, null, 1));
const by = (k) => Object.entries(corpus[k].reduce((a, x) => ((a[x.src] = (a[x.src] || 0) + 1), a), {})).map(([s, n]) => `${s} ${n}`).join(', ');
console.log(`found: moby ${moby.length}, sermon ${sermon.length}, pairs ${pairs.length}, convo ${CONVO.length}`);
for (const k of ['train', 'val', 'test']) console.log(`${k}: ${corpus[k].length} (${by(k)})`);
console.log('e.g.', corpus.train.filter((x) => x.src === 'moby').slice(0, 2).map((x) => x.t), corpus.train.filter((x) => x.src === 'sermon').slice(0, 2).map((x) => x.t));
