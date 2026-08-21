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
import { readCarBytes, createCarParser } from '../word/car.mjs';
import { analyze, analyzeCollected, createCollector, tokenize, MIN_POSTS, POST_TYPE, POST_FIELDS } from '../word/engine.mjs';
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

// ─── a hand-built CAR ───────────────────────────────────────────────────────
//
// Enough of a DAG-CBOR writer to make a real archive out of plain objects, so
// the reader can be checked against bytes rather than against itself.

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
const carOf = (objs) => {
  const header = cbor({ version: 1, roots: [] });
  return new Uint8Array([...varint(header.length), ...header, ...objs.flatMap(block)]);
};

// ─── 1. the CAR + DAG-CBOR reader, against a hand-built file ────────────────

console.log('\nthe CAR reader');
{
  const bytes = carOf([
    { $type: 'app.bsky.feed.post', text: 'hello there', createdAt: '2024-01-02T03:04:05.000Z', langs: ['en'] },
    { $type: 'app.bsky.feed.like', subject: 'nope' },
    { $type: 'app.bsky.feed.post', text: 'second', createdAt: '2024-01-03T00:00:00.000Z', reply: { root: { uri: 'at://x' } } },
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

// ─── 1b. the incremental parser ─────────────────────────────────────────────
//
// The streaming reader is what keeps a big repo from killing the tab, and the
// way a streaming reader goes wrong is at a chunk boundary: a varint split
// across two pushes, a block that spans three. So it is checked at every
// pathological chunk size against the whole-buffer reader, which is the thing
// whose output is already known to be right.

console.log('\nthe incremental parser');
{
  // Long, varied text so blocks are bigger than the small chunk sizes below and
  // some of them span three pushes.
  const posts = [];
  for (let i = 0; i < 90; i++) {
    posts.push({
      $type: 'app.bsky.feed.post',
      text: `river stone ${'lantern '.repeat(1 + (i % 11))}bramble number ${i}`,
      createdAt: new Date(Date.UTC(2024, 0, 1 + (i % 300), i % 24)).toISOString(),
      langs: ['en'],
      facets: [{ index: { byteStart: i, byteEnd: i + 4 }, features: [{ tag: 'noise' }] }],
      ...(i % 5 === 0 ? { reply: { root: { uri: `at://thread/${i % 7}` } } } : {}),
    });
    if (i % 9 === 0) posts.push({ $type: 'app.bsky.feed.like', subject: `at://x/${i}` });
    if (i % 13 === 0) posts.push({ e: [{ k: 'app.bsky.feed.post/3k', p: 0 }], l: null });   // an MST-ish node
  }
  const bytes = carOf(posts);
  const WANT = new Set([POST_TYPE]);
  const whole = readCarBytes(bytes, WANT).records;

  const run = (size, keep = null) => {
    const got = [];
    const parser = createCarParser({ wantTypes: WANT, keep, onRecord: (r) => got.push(r) });
    for (let p = 0; p < bytes.length; p += size) parser.push(bytes.subarray(p, Math.min(bytes.length, p + size)));
    return { got, stats: parser.end() };
  };

  const sizes = [1, 2, 3, 5, 7, 13, 64, 511, 4096, bytes.length * 2];
  let allMatch = true;
  let worst = '';
  for (const size of sizes) {
    const { got } = run(size);
    const same = got.length === whole.length
      && got.every((r, i) => JSON.stringify(r) === JSON.stringify(whole[i]));
    if (!same) { allMatch = false; worst = `${size} B chunks gave ${got.length} of ${whole.length}`; }
  }
  ok(`chunked at ${sizes.length} sizes down to one byte, identical every time`,
    allMatch && whole.length > 60, allMatch ? `${whole.length} records` : worst);

  const { stats } = run(64);
  ok('it holds nothing once the stream ends', stats.leftover === 0);
  ok('it counted every block', stats.blocks === posts.length, `${stats.blocks} of ${posts.length}`);
  ok('nothing failed to decode', stats.failed === 0);

  // `keep` must lose the fields nobody reads and no others
  const kept = run(1024, POST_FIELDS).got;
  const fields = new Set(kept.flatMap((r) => Object.keys(r)));
  ok('keep drops facets and langs', !fields.has('facets') && !fields.has('langs'),
    [...fields].join(','));
  ok('keep keeps what the engine reads',
    kept.every((r) => r.text && r.createdAt) && kept.some((r) => r.reply?.root?.uri));
  ok('keep changes nothing about which records match', kept.length === whole.length);

  // A stream cut mid-block stops at the last whole one rather than throwing
  const cutParser = createCarParser({ wantTypes: WANT, keep: POST_FIELDS, onRecord: () => {} });
  let survived = true;
  try {
    for (let p = 0; p < bytes.length - 40; p += 97) cutParser.push(bytes.subarray(p, Math.min(bytes.length - 40, p + 97)));
  } catch { survived = false; }
  const cut = cutParser.end();
  ok('a stream that stops mid-block stops cleanly', survived && cut.records >= whole.length - 2,
    survived ? `${cut.records} of ${whole.length}` : 'it threw');

  // THE CONTRACT: the streaming caller and the array caller must produce the
  // same file. This is the one that would catch the two paths drifting.
  const collector = createCollector();
  const streamParser = createCarParser({ wantTypes: WANT, keep: POST_FIELDS, onRecord: (r) => collector.add(r) });
  for (let p = 0; p < bytes.length; p += 333) streamParser.push(bytes.subarray(p, Math.min(bytes.length, p + 333)));
  streamParser.end();
  const viaStream = analyzeCollected(collector, { handle: 'x', did: 'did:plc:x', K: 4 });
  const viaArray = analyze(whole, { handle: 'x', did: 'did:plc:x', K: 4 });
  ok('streamed and buffered inputs give the same data file',
    JSON.stringify(viaStream) === JSON.stringify(viaArray));
  ok('the collector counted the posts', collector.posts === whole.length, `${collector.posts}`);
  // interning must be exact: every id in the flat stream names a word, and
  // every word is named by some id. A leak either way is silent data loss.
  const seen = new Set();
  for (let i = 0; i < collector.tokens; i++) seen.add(collector.flat[i]);
  ok('the words are interned exactly once each',
    collector.tokens > 0 && seen.size === collector.words.length
    && [...seen].every((i) => typeof collector.words[i] === 'string'),
    `${collector.tokens} tokens → ${collector.words.length} types`);
  ok('the flat stream is one range per post, in order',
    collector.off[0] === 0 && collector.off[collector.withWords] === collector.tokens
    && Array.from({ length: collector.withWords }, (_, i) => collector.off[i] <= collector.off[i + 1]).every(Boolean));
}

// ─── 1c. the two ways in agree ──────────────────────────────────────────────
//
// The worker can take posts from one big CAR or from pages of listRecords, and
// the second exists because the first costs about 120 MB of browser memory
// whatever the parser does — measured, an 80 MB response costs that much just
// to receive. Two acquisition paths is a licence for two different pictures, so
// the property that keeps them honest is asserted here: same collector, same
// engine, and posts are sorted by timestamp, so arrival order does not survive
// into the answer.

console.log('\nthe archive and the pages agree');
{
  const posts = [];
  for (let i = 0; i < 120; i++) {
    posts.push({
      $type: 'app.bsky.feed.post',
      text: `orchard tide ${'kestrel '.repeat(1 + (i % 7))}wire ${'brine '.repeat(i % 4)}`,
      // distinct to the millisecond, which is what makes the sort total
      createdAt: new Date(Date.UTC(2024, 0, 1, 0, 0, 0, 0) + i * 997).toISOString(),
      ...(i % 6 === 0 ? { reply: { root: { uri: `at://thread/${i % 5}` } } } : {}),
    });
  }

  const fromRecords = (list) => {
    const c = createCollector();
    for (const r of list) c.add(r);
    return analyzeCollected(c, { handle: 'x', did: 'did:plc:x', K: 4 });
  };

  // the archive order is the MST's, which is by rkey — near enough to reversed
  const viaArchive = fromRecords(readCarBytes(carOf(posts), new Set([POST_TYPE])).records);
  // listRecords hands back newest first, in pages
  const paged = [];
  const rev = posts.slice().reverse();
  for (let i = 0; i < rev.length; i += 25) paged.push(...rev.slice(i, i + 25));
  const viaPages = fromRecords(paged);

  ok('a different arrival order gives the same data file',
    JSON.stringify(viaArchive) === JSON.stringify(viaPages));

  // and the thing that makes that true, stated on its own so it cannot rot
  const shuffled = posts.slice();
  let seed = 7;
  for (let i = shuffled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  ok('so does any order at all, while timestamps are distinct',
    JSON.stringify(fromRecords(shuffled)) === JSON.stringify(viaArchive));
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
