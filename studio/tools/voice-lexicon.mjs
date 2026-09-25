#!/usr/bin/env node
// voice-lexicon.mjs — cut the CMU Pronouncing Dictionary down to the words the voice says.
//
//   node studio/tools/voice-lexicon.mjs <cmudict.dict> [more words…]
//
// The full dictionary is 3.6 MB; the voice page needs a few hundred words. Writes
// studio/voice/lexicon.json: { word: "HH AH0 L OW1" }. The CMU dictionary is BSD-licensed
// (Carnegie Mellon University); the notice travels with the file.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PARAGRAPH, HARVARD } from '../voice/texts.js';
import { words } from '../lib/chipvoice.js';

const here = dirname(fileURLToPath(import.meta.url));
const [dictPath, ...extra] = process.argv.slice(2);
const want = new Set([...words([PARAGRAPH, ...HARVARD].join(' ')), ...extra.map((w) => w.toLowerCase())]);
// keep anything already in the lexicon, so hand additions survive a rebuild
let old = {};
try { old = JSON.parse(readFileSync(join(here, '..', 'voice', 'lexicon.json'), 'utf8')).words; } catch {}
const out = { ...old };
for (const line of readFileSync(dictPath, 'utf8').split('\n')) {
  const m = line.match(/^([^\s(]+)(\(\d+\))?\s+([^#]+)/);
  if (!m || m[2]) continue;                          // the first pronunciation only
  if (want.has(m[1])) out[m[1]] = m[3].trim();
}
const missing = [...want].filter((w) => !out[w]);
writeFileSync(join(here, '..', 'voice', 'lexicon.json'), JSON.stringify({
  notice: 'Pronunciations from the CMU Pronouncing Dictionary, Copyright (C) 1993-2015 Carnegie Mellon University. BSD-2-Clause.',
  words: Object.fromEntries(Object.entries(out).sort()),
}, null, 0));
console.log(`${Object.keys(out).length} words${missing.length ? `; not in the dictionary: ${missing.join(', ')}` : ''}`);
