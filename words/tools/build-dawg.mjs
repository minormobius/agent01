#!/usr/bin/env node
// Compile a word list into the binary DAWG the site ships.
//
//   node words/tools/build-dawg.mjs [source.txt] [out.dawg]
//
// Defaults to words/dict/enable1.txt -> words/dict/lexicon.dawg, and writes
// dict/lexicon.json beside it with the numbers the About page quotes.
//
// The output is COMMITTED. This is not a deploy step: a deploy that rebuilt the
// lexicon would put the AI's behaviour at the mercy of whatever the word list
// looked like that morning, and every stored game replays its bot moves against
// the lexicon of the day it was played. Re-run this by hand when the list
// changes, commit the binary, and the change is a reviewable diff in the
// numbers below.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDawg, Dawg } from '../engine/dawg.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DICT = join(HERE, '..', 'dict');

const src = resolve(process.argv[2] || join(DICT, 'enable1.txt'));
const out = resolve(process.argv[3] || join(DICT, 'lexicon.dawg'));

/** Playable words only: A-Z, at least two letters, no longer than the board. */
export function normalize(text) {
  const seen = new Set();
  for (const raw of text.split('\n')) {
    const w = raw.trim().toUpperCase();
    if (w.length < 2 || w.length > 15) continue;
    if (!/^[A-Z]+$/.test(w)) continue;
    seen.add(w);
  }
  return [...seen].sort();
}

const words = normalize(readFileSync(src, 'utf8'));
if (!words.length) {
  console.error(`no usable words in ${src}`);
  process.exit(1);
}

const { buffer, stats } = buildDawg(words);
writeFileSync(out, buffer);

// Prove the artefact round-trips before anyone commits it.
const dawg = new Dawg(readFileSync(out));
const byLength = {};
for (const w of words) byLength[w.length] = (byLength[w.length] || 0) + 1;
let checked = 0;
for (const w of words) {
  if (!dawg.has(w)) throw new Error(`round-trip failed: ${w} is missing from the built DAWG`);
  checked++;
}
for (const nope of ['QQQQ', 'ZXZX', 'AAAAAAAA', 'WORDSWITHFRIEND']) {
  if (dawg.has(nope)) throw new Error(`round-trip failed: ${nope} should not be a word`);
}

const meta = {
  source: 'ENABLE (Enhanced North American Benchmark Lexicon), public domain',
  words: stats.words,
  edges: stats.edges,
  nodes: stats.nodes,
  bytes: stats.bytes,
  longest: words.reduce((m, w) => Math.max(m, w.length), 0),
  byLength,
};
writeFileSync(join(DICT, 'lexicon.json'), JSON.stringify(meta, null, 2) + '\n');

console.log(`${src} -> ${out}`);
console.log(`  ${stats.words.toLocaleString()} words, ${stats.nodes.toLocaleString()} nodes, ${stats.edges.toLocaleString()} edges`);
console.log(`  ${(stats.bytes / 1024).toFixed(0)} KiB (${(stats.bytes / stats.words).toFixed(1)} bytes/word)`);
console.log(`  round-tripped all ${checked.toLocaleString()} words`);
