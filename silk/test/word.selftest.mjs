// silk/test/word.selftest.mjs — the lexicon web's data file, and the reader
// that produced it.
//
// This exists because the chart is entirely a function of one generated JSON
// blob. A silent regression in build.mjs does not throw; it draws a slightly
// wrong picture that nobody can tell from a right one. So the invariants that
// the layout actually relies on are asserted here, plus the one privacy
// property the surface promises.
//
// Run: node silk/test/word.selftest.mjs

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readCar } from '../word/car.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEX = join(HERE, '..', 'word');

let checks = 0;
let failures = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  if (cond) { console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); return; }
  failures++;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

// ─── 1. the CAR + DAG-CBOR reader, against a hand-built file ────────────────

console.log('\nthe CAR reader');
{
  // minimal DAG-CBOR encoder, only what the fixture needs
  const enc = new TextEncoder();
  const head = (major, n) => {
    if (n < 24) return [major << 5 | n];
    if (n < 256) return [major << 5 | 24, n];
    if (n < 65536) return [major << 5 | 25, n >> 8, n & 255];
    return [major << 5 | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  };
  const cbor = (v) => {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return head(0, v);
    if (typeof v === 'string') { const b = [...enc.encode(v)]; return [...head(3, b.length), ...b]; }
    if (Array.isArray(v)) return [...head(4, v.length), ...v.flatMap(cbor)];
    if (v === true) return [7 << 5 | 21];
    if (v === false) return [7 << 5 | 20];
    if (v === null) return [7 << 5 | 22];
    const keys = Object.keys(v);
    return [...head(5, keys.length), ...keys.flatMap((k) => [...cbor(k), ...cbor(v[k])])];
  };
  const varint = (n) => { const o = []; while (n >= 0x80) { o.push((n & 0x7f) | 0x80); n >>>= 7; } o.push(n); return o; };
  const CID = [0x01, 0x71, 0x12, 0x20, ...Array.from({ length: 32 }, (_, i) => i)];
  const block = (obj) => { const b = cbor(obj); const body = [...CID, ...b]; return [...varint(body.length), ...body]; };

  const header = cbor({ version: 1, roots: [] });
  const bytes = Buffer.from([
    ...varint(header.length), ...header,
    ...block({ $type: 'app.bsky.feed.post', text: 'hello there', createdAt: '2024-01-02T03:04:05.000Z', langs: ['en'] }),
    ...block({ $type: 'app.bsky.feed.like', subject: 'nope' }),
    ...block({ $type: 'app.bsky.feed.post', text: 'second', createdAt: '2024-01-03T00:00:00.000Z', reply: { root: { uri: 'at://x' } } }),
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'silk-car-'));
  const path = join(dir, 'fixture.car');
  writeFileSync(path, bytes);

  const { records, blocks, failed } = readCar(path, new Set(['app.bsky.feed.post']));
  ok('reads every block', blocks === 3, `${blocks} blocks`);
  ok('decodes them all', failed === 0);
  ok('keeps only the requested $type', records.length === 2, `${records.length} records`);
  ok('strings survive', records[0].text === 'hello there', JSON.stringify(records[0].text));
  ok('arrays survive', Array.isArray(records[0].langs) && records[0].langs[0] === 'en');
  ok('nested maps survive', records[1].reply?.root?.uri === 'at://x');
  ok('a like is not a post', !records.some((r) => r.$type === 'app.bsky.feed.like'));
}

// ─── 2. the built data file ─────────────────────────────────────────────────

const dataPath = join(LEX, 'data.json');
if (!existsSync(dataPath)) {
  console.log('\n  ✗ silk/word/data.json is missing — run build.mjs\n');
  process.exit(1);
}
const d = JSON.parse(readFileSync(dataPath, 'utf8'));
const { w, c, f, m, s, i: idx, d: df } = d.cols;

console.log('\nthe data file');
{
  ok('every column is the same length',
    [c, f, m, s, idx, df].every((col) => col.length === w.length),
    `${w.length} rows`);
  ok('row count matches the declared type count', w.length === d.types, `${w.length} vs ${d.types}`);
  ok('counts sum to the declared token count',
    c.reduce((a, x) => a + x, 0) === d.tokens, `${c.reduce((a, x) => a + x, 0)} vs ${d.tokens}`);

  let mono = true;
  for (let k = 1; k < c.length; k++) if (c[k] > c[k - 1]) { mono = false; break; }
  ok('rows are in descending count order', mono);

  ok('the hapax count is right',
    c.filter((x) => x === 1).length === d.hapax, `${d.hapax}`);
  ok('no word is used zero times', c.every((x) => x >= 1));
  ok('document frequency never exceeds token count', df.every((x, k) => x <= c[k]));
}

console.log('\nthe layout invariants');
{
  // Every word must land in a real wedge, and the within-wedge index must be a
  // permutation — the client turns it straight into an angle by dividing by
  // sectorCounts, so a gap or a duplicate is a pile of words on one bearing.
  ok('every wedge index is in range', s.every((x) => x >= 0 && x < d.K));
  const seen = Array.from({ length: d.K }, () => new Set());
  const tally = new Array(d.K).fill(0);
  for (let k = 0; k < s.length; k++) { seen[s[k]].add(idx[k]); tally[s[k]]++; }
  ok('sectorCounts matches the rows', tally.every((n, k) => n === d.sectorCounts[k]),
    tally.join(',') + ' vs ' + d.sectorCounts.join(','));
  const perm = tally.every((n, k) => seen[k].size === n
    && Math.min(...seen[k]) === (n ? 0 : Infinity)
    && Math.max(...seen[k]) === (n ? n - 1 : -Infinity));
  ok('within-wedge indices are a 0..n-1 permutation', perm);
  ok('the wedges partition the vocabulary',
    tally.reduce((a, x) => a + x, 0) === w.length);
  ok('the hub is a declared wedge', d.general >= 0 && d.general < d.K);
  ok('the ring order lists every wedge once',
    new Set(d.order).size === d.K && d.order.length === d.K);

  // the hub must actually be the general vocabulary, or the layout's premise
  // (few types, enormous mass, put them in the middle) is simply false
  const mass = new Array(d.K).fill(0);
  const types = new Array(d.K).fill(0);
  for (let k = 0; k < s.length; k++) { mass[s[k]] += c[k]; types[s[k]]++; }
  const ratio = mass.map((x, k) => (types[k] ? x / types[k] : 0));
  const best = ratio.indexOf(Math.max(...ratio));
  ok('the hub is the densest wedge by tokens per type', best === d.general,
    `hub ${ratio[d.general].toFixed(0)} tokens/type vs next ${Math.max(...ratio.filter((_, k) => k !== d.general)).toFixed(0)}`);
}

console.log('\ndates');
{
  ok('first-seen is never negative', f.every((x) => x >= 0));
  ok('first-seen is inside the span', f.every((x) => x <= d.days));
  ok('the mean date is never before the first', m.every((x, k) => x >= f[k] - 1),
    `${m.filter((x, k) => x < f[k] - 1).length} violations`);
  ok('months are ordered and complete',
    d.months.every((x, k) => k === 0 || x[0] > d.months[k - 1][0]), `${d.months.length} months`);
  // against postsWithWords, not posts: a post of pure emoji is a post but
  // contributes no token, and the monthly series is built from the tokenised set
  const monthly = d.months.reduce((a, x) => a + x[1], 0);
  ok('monthly posts sum exactly to the tokenised corpus',
    monthly === d.postsWithWords, `${monthly} vs ${d.postsWithWords} (of ${d.posts} posts)`);
  ok('and the untokenised remainder is small',
    d.posts - d.postsWithWords < d.posts * 0.1,
    `${d.posts - d.postsWithWords} posts had no content word`);
}

// ─── 3. the promise on the page ─────────────────────────────────────────────

console.log('\nno prose escaped the build');
{
  // The page states, in as many words, that no post text is shipped. The
  // tokenizer only ever emits [a-z'] runs, so anything with a space, a digit or
  // a sentence-length string in the word column means a raw field got through.
  const spaced = w.filter((x) => /\s/.test(x));
  ok('no word contains whitespace', spaced.length === 0, spaced.slice(0, 3).join(' | '));
  const shape = w.filter((x) => !/^[a-z']+$/.test(x));
  ok('every word is a lowercase token', shape.length === 0, shape.slice(0, 5).join(' | '));
  // NOT a length check. `ooooooookoooo…` is 105 characters and is one token a
  // human actually typed; a 40-character bound flagged it as a leak. What
  // distinguishes a leaked sentence from a long keysmash is whitespace and
  // punctuation, both already asserted above. This one only catches a field
  // that is not a token at all.
  const longest = w.reduce((a, x) => (x.length > a.length ? x : a), '');
  ok('the longest entry is still a single token', /^[a-z']+$/.test(longest),
    `${longest.length} chars: ${longest.slice(0, 24)}…`);
  const blob = JSON.stringify(d);
  ok('the file carries no at:// URIs', !blob.includes('at://'));
  ok('the file carries no http links', !/https?:\/\//.test(blob.replace(/"did":"[^"]*"/, '')));
}

console.log('');
if (failures) { console.log(`✗ word selftest: ${failures}/${checks} failing\n`); process.exit(1); }
console.log(`✓ word selftest passed (${checks} checks)\n`);
