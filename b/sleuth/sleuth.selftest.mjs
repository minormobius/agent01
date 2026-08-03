// sleuth selftest — run before changing b/sleuth/posts.js or b/sleuth/dossier.js:
//   node b/sleuth/sleuth.selftest.mjs
//
// // Came across from photo, where this tool used to live.
//
// The search is TF-IDF computed in the tab — no embeddings, no key, no server —
// so the ranking IS the product. `the` appearing in two of three documents and
// `quick` in one must put the rare term's document first; if it does not, this
// is a substring match wearing a search's clothes.
//
// `bucketByQuarter` is the dossier's spine: everything the model is asked about
// a person's arc is framed by which quarter their posts fall in.

import { TextIndex } from './posts.js';
import { bucketByQuarter } from './dossier.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  \u2717 ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

{
  // TextIndex — Sleuth's search.
  const index = new TextIndex();
  index.build([
    { text: 'the quick brown fox jumps', rkey: 'a' },
    { text: 'a lazy dog sleeps all day', rkey: 'b' },
    { text: 'the fox and the dog', rkey: 'c' },
  ]);
  eq(index.size, 3, 'the index holds every doc');
  const hits = index.search('fox');
  eq(hits.length, 2, 'search finds both documents mentioning the term');
  eq(index.search('nonexistentterm').length, 0, 'a missing term finds nothing');
  eq(index.search('').length, 0, 'an empty query finds nothing');
  // "the" is in 2 of 3 docs and "quick" in 1, so IDF must rank the rare term's
  // document first — otherwise the search is just a substring match.
  const ranked = index.search('the quick');
  eq(ranked[0].doc.rkey, 'a', 'IDF ranks the document with the rarer term first');
  eq(index.search('FOX').length, 2, 'search is case-insensitive');
  eq(index.search('http://example.com fox').length, 2, 'URLs are stripped from queries');

  // dossier.js — temporal bucketing.
  const buckets = bucketByQuarter([
    { createdAt: '2026-01-15', text: 'a' },
    { createdAt: '2026-02-20', text: 'b' },
    { createdAt: '2026-07-04', text: 'c' },
    { createdAt: '', text: 'undated' },
  ]);
  eq(buckets.length, 2, 'posts fall into their quarters');
  eq(buckets[0].period, '2026-Q1', 'quarters are labelled and sorted chronologically');
  eq(buckets[0].posts.length, 2, 'and hold their posts');
  eq(buckets[1].period, '2026-Q3', 'July is Q3');
  eq(bucketByQuarter([]).length, 0, 'no posts, no buckets');
}

if (failures) {
  console.error(`\n\u2717 sleuth selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('\u2713 sleuth selftest passed — the TF-IDF ranking, and the temporal buckets the dossier is built on');
