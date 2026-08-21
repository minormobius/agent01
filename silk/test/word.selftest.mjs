// silk/test/word.selftest.mjs — the lexicon web's reader, engine and data file.
//
// The page has two sources for its chart: the committed data.json, and whatever
// a visitor's own repo produces in a Web Worker. Both come out of engine.mjs, so
// what has to hold is not "the committed file is well-formed" but "this engine
// cannot emit a malformed layout" — for a corpus nobody has seen yet.
//
// So the layout invariants are asserted twice: against the shipped file, and
// against synthetic corpora built here, including a deliberately small and a
// deliberately lopsided one. Plus the privacy property the page promises, and
// the stopword list, which must not fork from rite/lexicon.
//
// Run: node silk/test/word.selftest.mjs

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readCarBytes } from '../word/car.mjs';
import { analyze, tokenize, MIN_POSTS } from '../word/engine.mjs';
import { STOPWORDS } from '../word/stopwords.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORD = join(HERE, '..', 'word');
const ROOT = join(HERE, '..', '..');

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
  const bytes = new Uint8Array([
    ...varint(header.length), ...header,
    ...block({ $type: 'app.bsky.feed.post', text: 'hello there', createdAt: '2024-01-02T03:04:05.000Z', langs: ['en'] }),
    ...block({ $type: 'app.bsky.feed.like', subject: 'nope' }),
    ...block({ $type: 'app.bsky.feed.post', text: 'second', createdAt: '2024-01-03T00:00:00.000Z', reply: { root: { uri: 'at://x' } } }),
  ]);

  const { records, blocks, failed } = readCarBytes(bytes, new Set(['app.bsky.feed.post']));
  ok('reads every block', blocks === 3, `${blocks} blocks`);
  ok('decodes them all', failed === 0);
  ok('keeps only the requested $type', records.length === 2, `${records.length} records`);
  ok('strings survive', records[0].text === 'hello there');
  ok('arrays survive', Array.isArray(records[0].langs) && records[0].langs[0] === 'en');
  ok('nested maps survive', records[1].reply?.root?.uri === 'at://x');
  ok('a like is not a post', !records.some((r) => r.$type === 'app.bsky.feed.like'));

  // A TRUNCATED ARCHIVE MUST NOT THROW. Browsers drop connections; the reader
  // has to stop cleanly at the last whole block rather than take the tab down.
  const cut = bytes.subarray(0, bytes.length - 9);
  let survived = true;
  let partial = null;
  try { partial = readCarBytes(cut, new Set(['app.bsky.feed.post'])); } catch { survived = false; }
  ok('a truncated archive stops cleanly', survived && partial.records.length === 1,
    survived ? `${partial.records.length} of 2 records recovered` : 'it threw');

  // progress must not hand the caller a binding it cannot read yet — this is
  // the exact shape of a bug that took the whole browser build down once
  let sawBlocks = -1;
  readCarBytes(bytes, new Set(['app.bsky.feed.post']), (f, b) => { sawBlocks = b; });
  ok('onProgress is given the block count', sawBlocks === 3, `saw ${sawBlocks}`);
}

// ─── 2. the tokenizer's three fixes ─────────────────────────────────────────

console.log('\nthe tokenizer');
{
  ok('strips pasted links',
    !tokenize('look at bsky.app/profile/someone and https://example.com/x').some((w) => ['bsky', 'app', 'profile', 'example', 'com'].includes(w)),
    tokenize('look at bsky.app/profile/someone and https://example.com/x').join(' ') || '(nothing left)');
  ok('folds a curly apostrophe',
    !tokenize('I don’t think so').includes('don'),
    tokenize('I don’t think so').join(' ') || '(nothing left)');
  // `saying` looked like the obvious probe word here and is itself a stopword
  // in rite/lexicon's list, so the first version of this assertion was wrong
  // about the expected output rather than about the code.
  ok('folds contractions onto stopword stems',
    tokenize("it's what i'm cooking that's true").join(' ') === 'cooking true',
    tokenize("it's what i'm cooking that's true").join(' '));
  ok('keeps a possessive as its stem',
    tokenize("the world's problem").join(' ') === 'world problem',
    tokenize("the world's problem").join(' '));
  ok('drops words under three letters', !tokenize('go to be an ox').length);
}

console.log('\nthe stopword list has not forked from rite/lexicon');
{
  const src = readFileSync(join(ROOT, 'rite', 'lexicon', 'lexicons.js'), 'utf8');
  const theirs = new Set(src.match(/STOPWORDS\s*=\s*new Set\(\s*`([\s\S]*?)`/)[1].split(/\s+/).filter(Boolean));
  const missing = [...theirs].filter((w) => !STOPWORDS.has(w));
  const extra = [...STOPWORDS].filter((w) => !theirs.has(w));
  ok('same size', STOPWORDS.size === theirs.size, `${STOPWORDS.size} vs ${theirs.size}`);
  ok('nothing missing', missing.length === 0, missing.slice(0, 6).join(' '));
  ok('nothing added', extra.length === 0, extra.slice(0, 6).join(' '));
  if (missing.length || extra.length) console.log('     → run: node silk/word/build.mjs --sync-stopwords');
}

// ─── 3. the invariants the client depends on ────────────────────────────────
//
// Factored out because they have to hold for a corpus nobody has seen, not just
// for the one committed here. The client turns `i` straight into a bearing by
// dividing by sectorCounts, so a gap or a duplicate is a pile of words on one
// angle; and it turns `s` straight into a wedge lookup, so an out-of-range value
// is a word drawn at the centre of the picture.

function layoutInvariants(d, label) {
  const { w, c, f, m, s, i: idx, d: df } = d.cols;
  ok(`${label}: columns are aligned`,
    [c, f, m, s, idx, df].every((col) => col.length === w.length), `${w.length} rows`);
  ok(`${label}: row count matches types`, w.length === d.types);
  ok(`${label}: counts sum to tokens`, c.reduce((a, x) => a + x, 0) === d.tokens);

  let mono = true;
  for (let k = 1; k < c.length; k++) if (c[k] > c[k - 1]) { mono = false; break; }
  ok(`${label}: rows descend by count`, mono);
  ok(`${label}: no word is used zero times`, c.every((x) => x >= 1));
  ok(`${label}: doc frequency never exceeds count`, df.every((x, k) => x <= c[k]));
  ok(`${label}: hapax count is right`, c.filter((x) => x === 1).length === d.hapax);

  ok(`${label}: every wedge index is in range`, s.every((x) => x >= 0 && x < d.K));
  const seen = Array.from({ length: d.K }, () => new Set());
  const tally = new Array(d.K).fill(0);
  for (let k = 0; k < s.length; k++) { seen[s[k]].add(idx[k]); tally[s[k]]++; }
  ok(`${label}: sectorCounts matches the rows`, tally.every((n, k) => n === d.sectorCounts[k]));
  ok(`${label}: within-wedge indices are a 0..n-1 permutation`,
    tally.every((n, k) => seen[k].size === n
      && (n === 0 || (Math.min(...seen[k]) === 0 && Math.max(...seen[k]) === n - 1))));
  ok(`${label}: wedges partition the vocabulary`, tally.reduce((a, x) => a + x, 0) === w.length);
  ok(`${label}: the hub is a declared wedge`, d.general >= 0 && d.general < d.K);
  ok(`${label}: ring order lists every wedge once`,
    new Set(d.order).size === d.K && d.order.length === d.K);
  ok(`${label}: sectors[] covers the ring`,
    d.sectors.length === d.K && d.sectors.every((x) => x.label.length > 0));

  ok(`${label}: first-seen is inside the span`, f.every((x) => x >= 0 && x <= d.days));
  ok(`${label}: the mean date is never before the first`, m.every((x, k) => x >= f[k] - 1));
  ok(`${label}: months are ordered`, d.months.every((x, k) => k === 0 || x[0] > d.months[k - 1][0]));
  ok(`${label}: monthly posts sum to the tokenised corpus`,
    d.months.reduce((a, x) => a + x[1], 0) === d.postsWithWords);
  ok(`${label}: heaps ends at the full corpus`,
    d.heaps.length > 1 && d.heaps[d.heaps.length - 1][0] === d.tokens);

  // the layout's premise: the hub is the general vocabulary, few types and
  // enormous mass, which is why it gets the free zone instead of a wedge
  const mass = new Array(d.K).fill(0);
  const types = new Array(d.K).fill(0);
  for (let k = 0; k < s.length; k++) { mass[s[k]] += c[k]; types[s[k]]++; }
  const ratio = mass.map((x, k) => (types[k] ? x / types[k] : 0));
  ok(`${label}: the hub is the densest wedge by tokens per type`,
    ratio.indexOf(Math.max(...ratio)) === d.general,
    `${ratio[d.general].toFixed(0)} tokens/type`);
}

function noProse(d, label) {
  const w = d.cols.w;
  ok(`${label}: no word contains whitespace`, w.every((x) => !/\s/.test(x)));
  ok(`${label}: every word is a lowercase token`, w.every((x) => /^[a-z']+$/.test(x)));
  const blob = JSON.stringify(d);
  ok(`${label}: no at:// URIs`, !blob.includes('at://'));
  ok(`${label}: no http links`, !/https?:\/\//.test(blob.replace(/"did":"[^"]*"/, '')));
}

// ─── 4. the shipped file ────────────────────────────────────────────────────

console.log('\nthe shipped data file');
const dataPath = join(WORD, 'data.json');
if (!existsSync(dataPath)) {
  console.log('\n  ✗ silk/word/data.json is missing — run build.mjs\n');
  process.exit(1);
}
const shipped = JSON.parse(readFileSync(dataPath, 'utf8'));
layoutInvariants(shipped, 'shipped');
noProse(shipped, 'shipped');

// ─── 5. the engine, on corpora nobody has seen ──────────────────────────────
//
// A visitor's repo is the case that cannot be tested against a fixture, so it is
// tested against generated ones. The generator is seeded, which also lets the
// determinism check be exact.

function corpus({ posts, seed = 7, topics = 5, vocab = 40, drift = false }) {
  let st = seed >>> 0;
  const rnd = () => { st = (Math.imul(st, 1103515245) + 12345) & 0x7fffffff; return st / 0x7fffffff; };
  const common = ['really', 'think', 'thing', 'people', 'because', 'something'];
  // PURE LETTERS. The first version of this generator emitted `t0w5`, and the
  // tokenizer — correctly — throws away anything with a digit in it, so the
  // whole synthetic corpus reduced to a single word type and every assertion
  // below passed vacuously.
  const syl = ['ka', 'lo', 'mi', 'ru', 'ta', 'ven', 'sor', 'bel', 'nix', 'dro', 'fal', 'ghi'];
  const banks = Array.from({ length: topics }, (_, t) =>
    Array.from({ length: vocab }, (_, i) =>
      syl[t % syl.length] + syl[(i * 7 + t) % syl.length] + syl[(i * 3 + 5) % syl.length] + (i > 11 ? syl[i % syl.length] : '')));
  const out = [];
  const start = Date.UTC(2024, 0, 1);
  for (let p = 0; p < posts; p++) {
    // topics drift over time when asked, so first/mean dates are not uniform
    const t = drift
      ? Math.min(topics - 1, Math.floor((p / posts) * topics * 1.4 + rnd() * 0.7))
      : Math.floor(rnd() * topics);
    const bank = banks[t];
    const words = [];
    const n = 3 + Math.floor(rnd() * 8);
    for (let i = 0; i < n; i++) {
      words.push(rnd() < 0.3
        ? common[Math.floor(rnd() * common.length)]
        : bank[Math.floor(Math.pow(rnd(), 2) * bank.length)]);
    }
    if (rnd() < 0.15) words.push('zz' + syl[p % syl.length] + syl[(p >> 3) % syl.length] + syl[(p >> 6) % syl.length] + (p % 97));
    out.push({
      $type: 'app.bsky.feed.post',
      text: words.join(' '),
      createdAt: new Date(start + p * 3600000 * (1 + rnd())).toISOString(),
      ...(rnd() < 0.4 ? { reply: { root: { uri: `at://r/${p % 40}` } } } : {}),
    });
  }
  return out;
}

console.log('\nthe engine on a generated corpus');
{
  const recs = corpus({ posts: 4000, drift: true });
  const a = analyze(recs, { handle: 'a.test', K: 12 });
  layoutInvariants(a, 'generated');
  noProse(a, 'generated');

  const b = analyze(recs, { handle: 'a.test', K: 12 });
  ok('generated: the engine is deterministic',
    JSON.stringify({ ...a, built: '' }) === JSON.stringify({ ...b, built: '' }));
  ok('generated: the tail did not all land in the hub',
    a.sectors.filter((s) => s.k !== a.general).every((s) => s.types > 1),
    a.sectors.map((s) => s.types).join(','));
}

console.log('\nthe engine on a barely-viable corpus');
{
  // Only just over the floor, and a vocabulary too small for twelve wedges.
  // The K clamp has to bite here rather than emitting empty wedges the client
  // would then try to give an angular span to.
  const a = analyze(corpus({ posts: 120, topics: 3, vocab: 12, seed: 3 }), { handle: 'b.test', K: 12 });
  layoutInvariants(a, 'small');
  ok('small: K was clamped below the request', a.K < 12, `K = ${a.K}`);
  ok('small: no wedge is empty', a.sectorCounts.every((n) => n > 0), a.sectorCounts.join(','));
}

console.log('\nthe engine refuses what it cannot do');
{
  let code = null;
  try { analyze(corpus({ posts: 10 }), { handle: 'c.test' }); } catch (e) { code = e.code; }
  ok('a tiny account is refused, not mangled', code === 'TOO_SMALL', `code ${code}`);
  ok('the floor is stated', MIN_POSTS >= 20 && MIN_POSTS <= 200, `${MIN_POSTS} posts`);

  let code2 = null;
  try { analyze([], { handle: 'd.test' }); } catch (e) { code2 = e.code; }
  ok('an empty repo is refused, not mangled', code2 === 'TOO_SMALL');
}

console.log('');
if (failures) { console.log(`✗ word selftest: ${failures}/${checks} failing\n`); process.exit(1); }
console.log(`✓ word selftest passed (${checks} checks)\n`);
