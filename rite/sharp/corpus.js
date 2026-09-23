// Runtime views over the built data files. Kept apart from engine.js so the
// engine stays pure: it is handed a corpus, it never goes and gets one.
//
// hydrate() runs once per isolate. The derived indexes (word -> position,
// rime -> words, frequency rank) are built here rather than shipped: they cost
// a few milliseconds and would half again the size of mono.json.

import { WordIndex } from './engine.js';

/** Everything from the stressed vowel on, stress marks stripped. Two words with the same rime rhyme. */
export function rimeOfPhones(arpa) {
  const ph = arpa.split(' ');
  const i = ph.findIndex((p) => /\d$/.test(p));
  return (i === -1 ? ph : ph.slice(i)).map((p) => p.replace(/\d$/, '')).join(' ');
}

export function hydrate(mono) {
  const { words, phones, freq, order } = mono;
  const n = words.length;

  const index = new Map();
  for (let i = 0; i < n; i++) index.set(words[i], i);

  const rank = new Array(n);
  for (let r = 0; r < order.length; r++) rank[order[r]] = r;

  const rimes = [];
  const rimeId = new Map();
  const rimeIdx = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = rimeOfPhones(phones[i]);
    let id = rimeId.get(r);
    if (id === undefined) { id = rimes.length; rimes.push(r); rimeId.set(r, id); }
    rimeIdx[i] = id;
  }

  // rime -> word indices, commonest first (order already is)
  const byRime = Object.create(null);
  for (const i of order) (byRime[rimes[rimeIdx[i]]] ||= []).push(i);

  // stress-stripped pronunciation -> word indices, commonest first. Homophones.
  const byPhones = Object.create(null);
  for (const i of order) {
    const key = phones[i].split(' ').map((p) => p.replace(/\d$/, '')).join(' ');
    (byPhones[key] ||= []).push(i);
  }

  return { words, phones, freq, order, rimes, rimeIdx, index, rank, byRime, byPhones, count: n };
}

export function lexiconFrom(text) { return new WordIndex(text); }
