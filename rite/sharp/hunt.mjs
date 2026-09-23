// node rite/sharp/hunt.mjs [--count 200] [--style native] [--tlds com,dev,xyz]
//                          [--seed x] [--min 3] [--max 7] [--score 55]
//                          [--pool 2000] [--distinct 10] [--delay 250]
//                          [--words a,b,c] [--hacks] [--json]
//
// Mint monosyllables, then ask the registries which of them nobody has taken.
// The same engine and the same RDAP reader the worker uses — this is a CLI over
// them, not a second implementation, so what it reports and what /sharp reports
// cannot drift.
//
// Needs the network. Be considerate: it queries real registries, and the
// defaults (16 TLDs a batch, 5 at a time, one host at a time) are there for
// their sake, not yours.
//
// --score is the reason --pool exists. The words worth owning are the ones that
// read as English, and those are exactly the ones already registered — so a
// useful hunt mints a large POOL, keeps only the top of it, and spends its
// queries there. Filtering before asking is both a better search and a smaller
// load on somebody else's registry.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mint, countSyllables } from './engine.js';
import { hydrate, lexiconFrom } from './corpus.js';
import { domainHacks } from './tld.js';
import { checkMany } from './rdap.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const D = (f) => path.join(HERE, 'data', f);
const args = process.argv.slice(2);
const arg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const flag = (f) => args.includes(f);

const model = JSON.parse(fs.readFileSync(D('phono.json'), 'utf8'));
const corpus = hydrate(JSON.parse(fs.readFileSync(D('mono.json'), 'utf8')));
const lexicon = lexiconFrom(fs.readFileSync(D('taken.txt'), 'utf8'));
const tldData = JSON.parse(fs.readFileSync(D('tlds.json'), 'utf8'));
const data = { tldSet: new Set(tldData.tlds), rdap: tldData.rdap };

const count = Number(arg('--count', 120));
const pool = Number(arg('--pool', 0));
const minScore = Number(arg('--score', 0));
const distinct = Number(arg('--distinct', 0));
const delayMs = Number(arg('--delay', 0));
const given = (arg('--words', '') || '').split(',').map((x) => x.trim()).filter(Boolean);
const style = arg('--style', 'native');
const seed = arg('--seed', String(Date.now()));
const minLen = Number(arg('--min', 3));
const maxLen = Number(arg('--max', 7));
const tlds = arg('--tlds', 'com').split(',').map((s) => s.trim()).filter(Boolean);

// Mint the pool in chunks: the engine caps a single call at 500.
const CHUNK = 500;
const want = Math.max(count, pool);
let minted = [], chunk = 0;
const seen = new Set();
while (minted.length < want && chunk < 40) {
  const b = mint({ seed: `${seed}#${chunk++}`, count: CHUNK, style, minLen, maxLen, distinct, model, lexicon, corpus });
  for (const w of b.words) if (!seen.has(w.word)) { seen.add(w.word); minted.push(w); }
  if (!b.count) break;
}
const batch = { seed };
const byWord = new Map(minted.map((w) => [w.word, w]));
const words = given.length
  ? given.map((g) => byWord.get(g) || { word: g, score: null, say: null, rhymes: [], homophones: [] })
  : minted
  .filter((w) => (w.score ?? 0) >= minScore)
  .sort((a, b) => (b.score - a.score) || (a.word.length - b.word.length))
  .slice(0, count);

if (!flag('--json')) {
  console.error(`minted ${minted.length} unclaimed monosyllables (seed ${seed}, style ${style}, ${minLen}-${maxLen} letters)`);
  console.error(`${words.length} scored >= ${minScore}; checking ${tlds.join(', ')} …`);
}

const rows = [];
for (const w of words) {
  const results = await checkMany(tlds.map((t) => [w.word, t]), data, { maxTlds: tlds.length, delayMs, retries: 3 });
  rows.push({ word: w, results });
  if (!flag('--json')) {
    const mark = { free: '·', taken: 'X', unverifiable: '?', unknown: '!', invalid: '-' };
    process.stderr.write(`\r  ${rows.length}/${words.length}  ${w.word.padEnd(9)}${results.map((r) => mark[r.verdict]).join('')}   `);
  }
}
if (!flag('--json')) process.stderr.write('\n');

// A candidate is only interesting if every TLD asked about came back free.
const clean = rows.filter((r) => r.results.length && r.results.every((x) => x.verdict === 'free'));
clean.sort((a, b) => (b.word.score - a.word.score) || (a.word.word.length - b.word.word.length));

if (flag('--json')) {
  console.log(JSON.stringify({ seed: batch.seed, style, tlds, checked: rows.length, clean: clean.length, rows: clean }, null, 1));
} else {
  const tally = {};
  for (const r of rows) for (const x of r.results) tally[x.verdict] = (tally[x.verdict] || 0) + 1;
  console.log(`\n${rows.length} words × ${tlds.length} TLD(s) = ${rows.length * tlds.length} queries:`,
    Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', '));
  console.log(`${clean.length} words free across every TLD asked\n`);
  for (const r of clean.slice(0, 40)) {
    const w = r.word;
    const hacks = flag('--hacks') ? domainHacks(w.word, data.tldSet).map((h) => h.domain) : [];
    console.log(
      `  ${w.word.padEnd(10)} ${String(w.score).padStart(3)}/100  /${w.say ? w.say.ipa : '?'}/`.padEnd(38) +
      ` rhymes ${(w.rhymes || []).slice(0, 4).join(' ') || '—'}` +
      (w.homophones?.length ? `  [sounds like ${w.homophones[0]}]` : '') +
      (hacks.length ? `  hack: ${hacks.join(' ')}` : ''));
  }
}
