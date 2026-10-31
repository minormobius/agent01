// node rite/spooky/build-data.mjs [--cmudict path] [--eval]
//
// Builds the two data files /spooky runs on. NOT part of preflight: it needs
// the network (CMUdict) and the result is committed. Same inputs give
// byte-identical output.
//
//   data/g2p.json      the letter-to-sound model (see phones.js): how a name
//                      the dictionary has never seen is probably said.
//   data/spooks.json   the spooky vocabulary, each word with its phones.
//
// --eval holds out every 20th word, trains on the rest and reports how often
// the model gets a held-out word exactly right and how many phones it misses.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHONES, encode, WINDOWS, contextKey, pronounce } from './phones.js';
import { SPOOKS } from './spooks.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CMUDICT_URL = 'https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict';
const args = process.argv.slice(2);
const argOf = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

async function loadCmudict() {
  const file = argOf('--cmudict');
  if (file) return fs.readFileSync(file, 'utf8');
  process.stderr.write(`fetching ${CMUDICT_URL}\n`);
  const res = await fetch(CMUDICT_URL);
  if (!res.ok) throw new Error(`cmudict fetch failed: ${res.status}`);
  return res.text();
}

const dict = new Map();                 // word -> encoded phones (first pronunciation)
for (const line of (await loadCmudict()).split('\n')) {
  const m = line.match(/^([a-z]+)(?:\(\d+\))?\s+(.*?)\s*(?:#.*)?$/);
  if (!m || dict.has(m[1])) continue;
  dict.set(m[1], encode(m[2].split(/\s+/)));
}
process.stderr.write(`cmudict: ${dict.size} words\n`);

// ---------- alignment ----------
//
// Each letter emits nothing, one phone or two. EM over every word's possible
// alignments learns how likely each letter is to emit each thing; Viterbi then
// picks one alignment per word to train the context table on.

function align(words) {
  const p = new Map();                  // `${letter}${emission}` -> probability
  const get = (c, e) => p.get(c + e) ?? (e.length === 0 ? 0.1 : e.length === 1 ? 0.85 / 39 : 0.05 / 1521);
  const each = (word, ph, visit) => {
    const n = word.length, m = ph.length;
    const fw = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    const bw = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    fw[0][0] = 1; bw[n][m] = 1;
    for (let i = 0; i < n; i++) for (let j = 0; j <= m; j++) {
      if (!fw[i][j]) continue;
      for (let k = 0; k <= 2 && j + k <= m; k++) fw[i + 1][j + k] += fw[i][j] * get(word[i], ph.slice(j, j + k));
    }
    for (let i = n - 1; i >= 0; i--) for (let j = m; j >= 0; j--) {
      let s = 0;
      for (let k = 0; k <= 2 && j + k <= m; k++) s += get(word[i], ph.slice(j, j + k)) * bw[i + 1][j + k];
      bw[i][j] = s;
    }
    const z = fw[n][m];
    if (z > 0) visit(fw, bw, z);
  };
  for (let iter = 0; iter < 6; iter++) {
    const counts = new Map(), totals = new Map();
    for (const [word, ph] of words) each(word, ph, (fw, bw, z) => {
      for (let i = 0; i < word.length; i++) for (let j = 0; j <= ph.length; j++) {
        if (!fw[i][j]) continue;
        for (let k = 0; k <= 2 && j + k <= ph.length; k++) {
          const e = ph.slice(j, j + k);
          const c = fw[i][j] * get(word[i], e) * bw[i + 1][j + k] / z;
          if (c < 1e-9) continue;
          counts.set(word[i] + e, (counts.get(word[i] + e) || 0) + c);
          totals.set(word[i], (totals.get(word[i]) || 0) + c);
        }
      }
    });
    p.clear();
    for (const [key, c] of counts) p.set(key, c / totals.get(key[0]));
  }
  // Viterbi: the single best alignment of each word.
  const out = [];
  for (const [word, ph] of words) {
    const n = word.length, m = ph.length;
    const best = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(-Infinity));
    const back = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
    best[0][0] = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j <= m; j++) {
      if (best[i][j] === -Infinity) continue;
      for (let k = 0; k <= 2 && j + k <= m; k++) {
        const pr = p.get(word[i] + ph.slice(j, j + k));
        if (!pr) continue;
        const s = best[i][j] + Math.log(pr);
        if (s > best[i + 1][j + k]) { best[i + 1][j + k] = s; back[i + 1][j + k] = k; }
      }
    }
    if (best[n][m] === -Infinity) continue;
    const emit = new Array(n);
    for (let i = n, j = m; i > 0; i--) { const k = back[i][j]; emit[i - 1] = ph.slice(j - k, j); j -= k; }
    out.push([word, emit]);
  }
  return out;
}

// ---------- the context table ----------

function train(aligned) {
  const counts = new Map();             // context key -> Map(emission -> count)
  for (const [word, emit] of aligned) for (let i = 0; i < word.length; i++)
    for (let level = 0; level < WINDOWS.length; level++) {
      const key = contextKey(word, i, level);
      let m = counts.get(key);
      if (!m) counts.set(key, (m = new Map()));
      m.set(emit[i], (m.get(emit[i]) || 0) + 1);
    }
  const argmax = (m) => { let b = null, bc = -1; for (const [e, c] of m) if (c > bc || (c === bc && e < b)) { b = e; bc = c; } return b; };
  const total = (m) => { let n = 0; for (const c of m.values()) n += c; return n; };
  const parentKey = (key) => {
    // The context one level smaller: drop the outermost letter WINDOWS removed.
    const level = +key[0], [l, r] = WINDOWS[level], [pl, pr] = WINDOWS[level - 1];
    const body = key.slice(1), open = body.indexOf('[');
    const left = body.slice(0, open), mid = body.slice(open, open + 3), right = body.slice(open + 3);
    return (level - 1) + left.slice(l - pl) + mid + right.slice(0, pr);
  };
  const table = {};
  const keys = [...counts.keys()].sort();
  for (const key of keys) {
    const m = counts.get(key), level = +key[0], best = argmax(m);
    if (level === 0) { table[key] = best; continue; }
    // Keep it only where it overrules what the smaller context would say. A
    // context seen once stays too: most of what it memorises is names, and a
    // name the dictionary knows should come back as the dictionary says it.
    let pk = parentKey(key), said;
    while (said === undefined) { said = table[pk]; if (said === undefined) pk = parentKey(pk); }
    if (best !== said) table[key] = best;
  }
  return table;
}

function edit(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const all = [...dict.entries()].filter(([w, p]) => w.length >= 2 && p.length >= 1);

if (args.includes('--eval')) {
  const trainSet = all.filter((_, i) => i % 20), test = all.filter((_, i) => i % 20 === 0);
  const model = { table: train(align(trainSet)) };
  let exact = 0, errs = 0, len = 0;
  for (const [w, p] of test) {
    const got = encode(pronounce(model, w));
    if (got === p) exact++;
    errs += edit(got, p); len += p.length;
  }
  console.log(`held-out ${test.length}: ${(100 * exact / test.length).toFixed(1)}% words exact, ` +
    `${(100 * errs / len).toFixed(1)}% phone error rate, table ${Object.keys(model.table).length} contexts`);
  process.exit(0);
}

const table = train(align(all));
const g2p = { phones: PHONES.join(' '), windows: WINDOWS, table };
fs.writeFileSync(path.join(HERE, 'data/g2p.json'), JSON.stringify(g2p));

// The spooky words: CMUdict's pronunciation where it has one, the model's
// where it does not (a few coinages), and a hand-given one where both fail.
const model = { table };
const spooks = SPOOKS.map((s) => {
  const said = s.say ? encode(s.say.split(' ')) : s.w.split(/[\s-]/).map((part) => dict.get(part.toLowerCase()) ?? encode(pronounce(model, part))).join('');
  return { ...s, say: undefined, ph: said };
});
fs.writeFileSync(path.join(HERE, 'data/spooks.json'), JSON.stringify(spooks));
process.stderr.write(`wrote g2p.json (${Object.keys(table).length} contexts), spooks.json (${spooks.length} words)\n`);
