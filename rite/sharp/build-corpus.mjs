// node rite/sharp/build-corpus.mjs [--out rite/sharp/data]
//
// Builds the three data files /sharp runs on. NOT part of preflight: it needs
// the network (CMUdict) and the result is committed. Re-run it only to refresh
// the corpus — same inputs give byte-identical output.
//
//   data/taken.txt   every word English has claimed, sorted, one per line,
//                    with its true syllable count where CMUdict knows it.
//                    ~243k entries. Read by the worker through a binary-search
//                    index, never parsed into a Set.
//   data/mono.json   the real single-syllable words, with phonetic rimes and
//                    frequencies. Powers DRAW, the rhyme lists, and neighbours.
//   data/phono.json  the phonotactic model: what English monosyllables are
//                    made of and how often. Powers MINT and the scores.
//
// Sources, all free to use and credited on the page:
//   CMUdict      cmusphinx/cmudict           pronunciations + syllable counts
//   ENABLE1      words/dict/enable1.txt      the word list (public domain)
//   SUBTLEX-US   rite/lexicon/data/baseline.json  frequencies

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { segment, render, nucleusKey, rimeKey, buildModel, plausibility } from './engine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const CMUDICT_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';

const args = process.argv.slice(2);
const outDir = path.resolve(REPO, argOf('--out') || 'rite/sharp/data');
const cacheFile = argOf('--cmudict');

function argOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

async function loadCmudict() {
  if (cacheFile) return fs.readFileSync(cacheFile, 'utf8');
  const local = path.join(outDir, '.cmudict.cache');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  process.stderr.write(`fetching ${CMUDICT_URL}\n`);
  const res = await fetch(CMUDICT_URL);
  if (!res.ok) throw new Error(`cmudict fetch failed: ${res.status}`);
  return res.text();
}

// ---------- read the sources ----------

const cmuText = await loadCmudict();
const phonesOf = new Map();          // word -> ARPABET phones of its first pronunciation
const syllOf = new Map();            // word -> syllable count (first pronunciation)
for (const line of cmuText.split('\n')) {
  const m = line.match(/^(\S+)\s+(.*?)\s*(?:#.*)?$/);
  if (!m) continue;
  const word = m[1].replace(/\(\d+\)$/, '');
  if (!/^[a-z']+$/.test(word)) continue;
  if (phonesOf.has(word)) continue;  // first pronunciation wins, deterministically
  const phones = m[2].trim().split(/\s+/).filter(Boolean);
  if (!phones.length) continue;
  phonesOf.set(word, phones);
  syllOf.set(word, phones.filter((p) => /\d$/.test(p)).length);
}

const enable = fs.readFileSync(path.join(REPO, 'words/dict/enable1.txt'), 'utf8')
  .split('\n').map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z']+$/.test(s));

const subtlex = JSON.parse(fs.readFileSync(path.join(REPO, 'rite/lexicon/data/baseline.json'), 'utf8'));
const freqOf = new Map();
for (const [w, f] of Object.entries(subtlex)) {
  if (/^[a-z']+$/.test(w)) freqOf.set(w, f);
}

// ---------- taken.txt: everything English has claimed ----------

// Each line is `word` TAB `<syllables><kinds>`, where kinds names the lists
// that claim it: e = ENABLE1, f = SUBTLEX-US, c = CMUdict. A word only CMUdict
// has is nearly always a proper name, and /sharp says so rather than calling it
// a dictionary word.
const enableSet = new Set(enable);
const taken = new Set([...enable, ...freqOf.keys(), ...phonesOf.keys()]);
const takenSorted = [...taken].sort();
const takenText = takenSorted.map((w) => {
  const kinds = (enableSet.has(w) ? 'e' : '') + (freqOf.has(w) ? 'f' : '') + (phonesOf.has(w) ? 'c' : '');
  const syl = syllOf.has(w) ? String(syllOf.get(w)) : '';
  return `${w}\t${syl}${kinds}`;
}).join('\n') + '\n';

// ---------- mono.json: the real single-syllable words ----------
//
// A word qualifies if CMUdict says one syllable AND a dictionary lists it.
// ENABLE1 is the dictionary, because it is the one source here with no proper
// nouns in it: SUBTLEX would hand us `paul`, `york` and `scott`. The handful of
// real words ENABLE1 omits (single letters) are added back by name.

const ENABLE_MISSES = ['a', 'i'];
const monoWords = [];
for (const [w, n] of syllOf) {
  if (n !== 1) continue;
  if (!/^[a-z]+$/.test(w)) continue;
  if (!(enableSet.has(w) || ENABLE_MISSES.includes(w))) continue;
  monoWords.push(w);
}
monoWords.sort();

const freq = monoWords.map((w) => Math.round((freqOf.get(w) || 0) * 100));
const order = monoWords.map((_, i) => i).sort((a, b) => (freq[b] - freq[a]) || (monoWords[a] < monoWords[b] ? -1 : 1));

const mono = {
  $source: 'CMUdict one-syllable entries ∩ ENABLE1; pronunciations from CMUdict, frequencies from SUBTLEX-US',
  $fields: {
    words: 'real single-syllable English words, sorted',
    phones: 'ARPABET pronunciation with stress, per word (CMUdict, first pronunciation)',
    freq: 'SUBTLEX-US frequency per million × 100, integer; 0 = not in SUBTLEX',
    order: 'word indices sorted commonest first — the obscurity dial walks this',
  },
  count: monoWords.length,
  words: monoWords,
  phones: monoWords.map((w) => phonesOf.get(w).join(' ')),
  freq,
  order,
};

// ---------- phono.json: the model ----------

const model = buildModel(monoWords.map((w) => ({ word: w, phones: phonesOf.get(w) })));

// Calibration: the real corpus's own log-probabilities, sorted. A minted word's
// score is its percentile against this — 50 means "as ordinary as the median
// real monosyllable".
const lps = [];
for (const w of monoWords) {
  const seg = segment(w);
  if (!seg || render(seg) !== w) continue;
  lps.push(plausibility({ ...model, calibration: null }, seg).logp);
}
lps.sort((a, b) => a - b);
const STEPS = 200;
model.calibration = Array.from({ length: STEPS }, (_, i) =>
  Math.round(lps[Math.min(lps.length - 1, Math.floor((i / STEPS) * lps.length))] * 1000) / 1000);
model.$source = 'built by rite/sharp/build-corpus.mjs from the words in mono.json';

// ---------- write ----------

fs.mkdirSync(outDir, { recursive: true });
const write = (name, body) => {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, body);
  return `${name.padEnd(12)} ${(body.length / 1024).toFixed(0).padStart(6)} KB`;
};

console.log(write('taken.txt', takenText), `  ${takenSorted.length} words, ${syllOf.size} with a known syllable count`);
console.log(write('mono.json', JSON.stringify(mono)), `  ${monoWords.length} single-syllable words`);
console.log(write('phono.json', JSON.stringify(model)),
  `  ${Object.keys(model.onsets).length} onsets, ${Object.keys(model.nuclei).length} nuclei, ${Object.keys(model.codas).length} codas`);
console.log(`segmentation: ${model.total} modelled, ${model.skipped} skipped (${(model.skipped / (model.total + model.skipped) * 100).toFixed(2)}%)`);
