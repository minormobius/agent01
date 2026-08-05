// palm selftest — run before changing car-stream.js, axes.js or baseline.js:
//   node b/palm/palm.selftest.mjs
//
// Three things here are worth the coverage, because each of them fails SILENTLY
// — wrong numbers, no error:
//
//   THE LIKE TRAP. A like record's subject.uri contains the literal string
//   "app.bsky.feed.post". Sniffing blocks for that substring would count every
//   like as a post, and on a real repo likes outnumber posts three to one — the
//   card would be drawn from a corpus that is 78% not-posts and nothing would
//   look wrong. The reader anchors on the DAG-CBOR length byte (0x72) that can
//   only precede an 18-character string, so the fixture below includes a like
//   built exactly the way a PDS builds one.
//
//   THE CHUNK BOUNDARY. Blocks are split across network chunks arbitrarily. If
//   the carry-over path is wrong, the reader loses whichever records happened to
//   straddle a boundary — a few per cent of the repo, quietly. So the same CAR
//   is read whole and then again in 7-byte chunks, and the results must match.
//
//   THE FIXED BUDGETS. `lexicon` and `echo` are only comparable across accounts
//   because their fit range and trigram count are pinned. Take the pins out and
//   the percentiles silently start measuring who posts the most.

import { createReader, readCar, uvarint, decode } from './car-stream.js';
import { cadence, vigil, lexicon, echo, drift, chorus, polish, AXES, LEX_WORDS, ECHO_TRIGRAMS } from './axes.js';
import { percentile, band, score, BANDS } from './baseline.js';
import { cardText, cardAlt } from './share.js';
import { linkFacets, textLength } from '../coin/compose.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`);

// ── a DAG-CBOR encoder, so the fixtures are built the way a PDS builds them ──
const TE = new TextEncoder();
function head(major, val) {
  if (val < 24) return [(major << 5) | val];
  if (val < 256) return [(major << 5) | 24, val];
  if (val < 65536) return [(major << 5) | 25, val >> 8, val & 255];
  return [(major << 5) | 26, (val >>> 24) & 255, (val >>> 16) & 255, (val >>> 8) & 255, val & 255];
}
function enc(v) {
  if (v === null) return [0xf6];
  if (v === false) return [0xf4];
  if (v === true) return [0xf5];
  if (typeof v === 'number') return v < 0 ? head(1, -1 - v) : head(0, v);
  if (typeof v === 'string') { const b = [...TE.encode(v)]; return [...head(3, b.length), ...b]; }
  if (v instanceof Uint8Array) return [...head(2, v.length), ...v];
  if (Array.isArray(v)) { const o = [...head(4, v.length)]; for (const x of v) o.push(...enc(x)); return o; }
  if (v && v.__cid) { const b = [0, ...v.__cid]; return [0xd8, 0x2a, ...head(2, b.length), ...b]; }
  if (typeof v === 'object') {
    // DAG-CBOR orders map keys by length, then bytewise.
    const keys = Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    const o = [...head(5, keys.length)];
    for (const k of keys) { o.push(...enc(k)); o.push(...enc(v[k])); }
    return o;
  }
  throw new Error('cannot encode ' + typeof v);
}
const cidBytes = (seed) => new Uint8Array([0x01, 0x71, 0x12, 0x20, ...Array.from({ length: 32 }, (_, i) => (seed * 31 + i) & 255)]);
function varintBytes(n) { const o = []; while (n >= 128) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; }
function blockBytes(cid, payload) { const body = [...cid, ...payload]; return [...varintBytes(body.length), ...body]; }

// ── the fixture repo: two posts, one like, one MST node ──────────────────────
const postA = cidBytes(1), postB = cidBytes(2), likeC = cidBytes(3), mst = cidBytes(4), root = cidBytes(5);

const recA = enc({ $type: 'app.bsky.feed.post', text: 'Rain on the window and nothing to do.', createdAt: '2024-03-01T09:00:00.000Z', langs: ['en'] });
const recB = enc({
  $type: 'app.bsky.feed.post', text: 'replying to you', createdAt: '2024-03-01T10:00:00.000Z',
  reply: { parent: { uri: 'at://did:plc:friend/app.bsky.feed.post/zzz', cid: { __cid: postA } }, root: { uri: 'at://did:plc:friend/app.bsky.feed.post/zzz', cid: { __cid: postA } } },
});
// The trap: a like whose subject URI contains "app.bsky.feed.post".
const recC = enc({ $type: 'app.bsky.feed.like', createdAt: '2024-03-01T11:00:00.000Z', subject: { uri: 'at://did:plc:someone/app.bsky.feed.post/3kabcdefghij', cid: { __cid: postA } } });

// Keys share prefixes, so this exercises MST prefix compression.
const K1 = 'app.bsky.feed.like/aaa', K2 = 'app.bsky.feed.post/bbb', K3 = 'app.bsky.feed.post/ccc';
const mstNode = enc({
  e: [
    { p: 0, k: TE.encode(K1), v: { __cid: likeC }, t: null },
    { p: 14, k: TE.encode(K2.slice(14)), v: { __cid: postA }, t: null },
    { p: 19, k: TE.encode(K3.slice(19)), v: { __cid: postB }, t: null },
  ],
  l: null,
});
const commit = enc({ did: 'did:plc:me', rev: '3k', data: { __cid: mst }, version: 3 });

const header = enc({ roots: [{ __cid: root }], version: 1 });
const car = new Uint8Array([
  ...varintBytes(header.length), ...header,
  ...blockBytes(root, commit),
  ...blockBytes(mst, mstNode),
  ...blockBytes(postA, recA),
  ...blockBytes(postB, recB),
  ...blockBytes(likeC, recC),
]);

{
  const out = readCar(car);
  eq(out.posts.length, 2, 'two post records come out of the CAR');
  eq(out.collections['app.bsky.feed.post'], 2, 'the MST tallies two posts');
  eq(out.collections['app.bsky.feed.like'], 1, 'and one like');
  ok(!out.posts.some((p) => p.text === undefined), 'every post kept its text');
  eq(out.posts[0].rkey, 'bbb', 'the rkey is recovered from the MST through prefix compression');
  eq(out.posts[1].rkey, 'ccc', 'and so is the second, which shares 19 bytes with the first');
  eq(out.posts[0].text, 'Rain on the window and nothing to do.', 'text survives the round trip');
  eq(out.posts[1].isReply, true, 'a reply is marked as one');
  eq(out.posts[1].replyTo, 'did:plc:friend', 'and the parent author DID is extracted from the at:// URI');
  eq(out.posts[0].lang, 'en', 'langs[0] is kept');
  // The whole point:
  ok(!out.posts.some((p) => p.text === undefined || String(p.text).includes('at://')), 'the like did not become a post');
}

{
  // Byte-by-byte streaming must produce exactly what one big push produces.
  const whole = readCar(car);
  const r = createReader();
  for (let i = 0; i < car.length; i += 7) r.push(car.slice(i, Math.min(i + 7, car.length)));
  const chunked = r.finish();
  eq(chunked.posts.length, whole.posts.length, 'chunked reading finds the same number of posts');
  eq(JSON.stringify(chunked.posts), JSON.stringify(whole.posts), 'and byte-identical records across chunk boundaries');
  eq(chunked.collections['app.bsky.feed.like'], 1, 'the MST tally survives chunking too');
}

{
  eq(uvarint(new Uint8Array([0x7f]), 0)[0], 127, 'single-byte varint');
  eq(uvarint(new Uint8Array([0x80, 0x01]), 0)[0], 128, 'two-byte varint');
  eq(uvarint(new Uint8Array([0xff, 0xff, 0x03]), 0)[0], 65535, 'three-byte varint');
  eq(uvarint(new Uint8Array([0x80]), 0), null, 'a truncated varint returns null rather than a wrong number');
  eq(decode(new Uint8Array(enc(-7)), 0)[0], -7, 'negative integers decode');
  near(decode(new Uint8Array([0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0]), 0)[0], 1.0, 1e-9, 'float64 decodes');
  // 36 binary bytes (version, codec, hash fn, length, 32-byte digest) — the
  // 0x00 multibase prefix DAG-CBOR wraps them in is stripped, so 72 hex chars.
  eq(decode(new Uint8Array(enc({ __cid: postA })), 0)[0].$link.length, 72, 'a CID decodes to its hex link');
  eq(decode(new Uint8Array(enc({ __cid: postA })), 0)[0].$link.slice(0, 8), '01711220', 'CIDv1 / dag-cbor / sha2-256 / 32 bytes');
}

// ── the readings ─────────────────────────────────────────────────────────────
const at = (iso, extra = {}) => ({ text: 'a post with several ordinary words in it', createdAt: iso, isReply: false, replyTo: null, ...extra });

{
  // A metronome: identical gaps, so sd = 0 and burstiness = -1.
  const t0 = Date.UTC(2024, 0, 1);
  const metronome = Array.from({ length: 200 }, (_, i) => at(new Date(t0 + i * 3600000).toISOString()));
  near(cadence(metronome).raw, 1, 1e-9, 'a perfectly regular poster reads as maximally machine-like on cadence');
  ok(cadence(Array.from({ length: 20 }, (_, i) => at(new Date(t0 + i * 1000).toISOString()))).raw === null,
    'too few posts to judge cadence returns null rather than a guess');
}

{
  const t0 = Date.UTC(2024, 0, 1);
  const flat = [];
  for (let h = 0; h < 24; h++) for (let k = 0; k < 3; k++) flat.push(at(new Date(t0 + h * 3600000 + k * 60000).toISOString()));
  near(vigil(flat).raw, 1, 1e-9, 'posting evenly around the clock is entropy 1 — never sleeps');
  eq(vigil(flat).quietHours, 0, 'and has no quiet hours');

  const oneHour = Array.from({ length: 72 }, (_, i) => at(new Date(t0 + 9 * 3600000 + i * 1000).toISOString()));
  near(vigil(oneHour).raw, 0, 1e-9, 'posting in a single hour is entropy 0');
  eq(vigil(oneHour).quietHours, 23, 'and 23 quiet hours');
}

{
  const t0 = Date.UTC(2024, 0, 1);
  const same = Array.from({ length: 800 }, (_, i) => at(new Date(t0 + i * 60000).toISOString(), { text: 'the quick brown fox jumps over' }));
  ok(echo(same).raw > 0.99, 'an account that posts the same sentence forever is nearly all echo');

  let w = 0;
  const distinct = Array.from({ length: 800 }, (_, i) =>
    at(new Date(t0 + i * 60000).toISOString(), { text: Array.from({ length: 8 }, () => 'w' + (w++)).join(' ') }));
  ok(echo(distinct).raw < 0.01, 'an account that never repeats a trigram is nearly no echo');
  // 800 posts x 4 trigrams cannot reach the default budget, so the budget is
  // pinned explicitly here. What matters is that it lands EXACTLY on it: the
  // interleaved passes must fill the budget rather than undershoot when posts
  // are shorter than a single strided pass assumed.
  eq(echo(same, { budget: 2000 }).n, 2000, 'echo stops at exactly its trigram budget, so accounts are comparable');
  eq(echo(same, { budget: 2000 }).short, false, 'and an account that fills the budget is not short');
  ok(echo(same, { budget: 999999 }).short === true, 'while one that cannot is flagged');
}

{
  // Drift: the same writer forever vs one who changes vocabulary completely.
  const t0 = Date.UTC(2024, 0, 1);
  // The vocabularies have to be large: drift drops the 40 commonest words and
  // then needs at least 200 more to compare, so a ten-word toy corpus is
  // correctly refused as unmeasurable rather than scored.
  const pool = (prefix) => Array.from({ length: 600 }, (_, i) => prefix + i);
  const A = pool('harbour'), B = pool('compiler');
  const topic = (bag, i) => ({
    text: Array.from({ length: 10 }, (_, k) => bag[(i * 10 + k) % bag.length]).join(' '),
    createdAt: new Date(t0 + i * 60000).toISOString(), isReply: false, replyTo: null,
  });
  const same2 = Array.from({ length: 1200 }, (_, i) => topic(A, i));
  const changed = Array.from({ length: 1200 }, (_, i) => topic(i < 600 ? A : B, i));
  ok(drift(same2).raw > 0.9, 'a writer who never changes subject reads as unchanging');
  ok(drift(changed).raw < drift(same2).raw, 'and one who moves on reads as having drifted');
  eq(drift(same2.slice(0, 100)).raw, null, 'too little history to judge drift returns null rather than a guess');
}

{
  const t0 = Date.UTC(2024, 0, 1);
  let w = 0;
  const big = Array.from({ length: 6000 }, (_, i) =>
    at(new Date(t0 + i * 60000).toISOString(), { text: Array.from({ length: 10 }, () => 'w' + (w++ % 5000)).join(' ') }));
  const lex = lexicon(big);
  eq(lex.n, LEX_WORDS, 'the Heaps fit stops at exactly its word budget, so beta is fitted over the same range for everyone');
  eq(lex.short, false, 'and a corpus that reaches the budget is not marked short');
  ok(lex.heaps > 0 && lex.heaps <= 1.01, 'the fitted Heaps exponent is in a sane range');
  ok(lexicon(big.slice(0, 40)).short !== false, 'a corpus below the budget is flagged short');
}

{
  const t0 = Date.UTC(2024, 0, 1);
  const broadcast = Array.from({ length: 100 }, (_, i) => at(new Date(t0 + i * 60000).toISOString()));
  near(chorus(broadcast, 'did:plc:me').raw, 1, 1e-9, 'an account that never replies is pure broadcast');

  const talking = Array.from({ length: 100 }, (_, i) =>
    at(new Date(t0 + i * 60000).toISOString(), { isReply: true, replyTo: 'did:plc:other' + (i % 40) }));
  ok(chorus(talking, 'did:plc:me').raw < 0.3, 'an account that only replies, to many people, is not');
  ok(chorus(talking, 'did:plc:me').raw < chorus(broadcast, 'did:plc:me').raw, 'and conversation always reads less machine-like than broadcast');
}

{
  const t0 = Date.UTC(2024, 0, 1);
  const tidy = Array.from({ length: 100 }, (_, i) => at(new Date(t0 + i * 60000).toISOString(), { text: 'The rain arrived before the forecast did — as it usually does.' }));
  const scruffy = Array.from({ length: 100 }, (_, i) => at(new Date(t0 + i * 60000).toISOString(), { text: 'lol yeah idk its fine i guess sooo whatever' }));
  ok(polish(tidy).raw > polish(scruffy).raw, 'immaculate prose reads more machine-like than internet register');
  ok(polish(tidy).raw > 0.9, 'and the tidy end scores near the top');
  ok(polish(scruffy).raw < 0.35, 'while the scruffy end scores near the bottom');
}

// ── the comparison ───────────────────────────────────────────────────────────
{
  const table = Array.from({ length: 101 }, (_, i) => i / 100);
  eq(percentile(0.5, table), 50, 'a value at the middle of the table is the 50th percentile');
  eq(percentile(-1, table), 0, 'below the table clamps to 0');
  eq(percentile(99, table), 100, 'above the table clamps to 100');
  eq(percentile(null, table), null, 'an unmeasurable axis has no percentile');

  eq(band(0).name, 'Wholly Pan', 'the animal end of the dial');
  eq(band(100).name, 'The Loom', 'and the machine end');
  ok(band(50).name === 'Ordinary Primate', 'the middle is the middle');

  // A soft axis must not drag the composite: it is not comparable to the pool.
  const fake = {
    meta: { posts: 1000 },
    axes: {
      cadence: { raw: 0.5 }, vigil: { raw: 0.5 }, lexicon: { raw: 0.5 },
      polish: { raw: 0.5 }, drift: { raw: 0.5, short: true }, chorus: { raw: 0.5 },
    },
  };
  const quantiles = Object.fromEntries(['cadence', 'vigil', 'lexicon', 'polish', 'drift', 'chorus']
    .map((k) => [k, Array.from({ length: 101 }, (_, i) => i / 100)]));
  const s = score(fake, { n: 42, quantiles });
  eq(s.measured, 5, 'a short axis is excluded from the composite');
  eq(s.total, 6, 'but still reported as one of the six');
  eq(s.composite, 50, 'and the composite is the mean of what was comparable');
  eq(s.axes.find((a) => a.key === 'drift').soft, true, 'the short axis is marked soft for the card to draw hollow');
}

// ── the shared card ──────────────────────────────────────────────────────────
// The post has to fit 300 GRAPHEMES, and the two things that must never be lost
// to that budget are the link back and the "not a detector" caveat. A silently
// truncated disclaimer is the one failure here that would actually matter.
{
  const mk = (composite, pool) => ({
    composite, pool, band: BANDS.find((b) => composite <= b.max),
    axes: AXES.map((a) => ({ label: a.label, gloss: a.gloss, pct: 87.5 })),
  });

  for (const handle of ['a.bsky.social', 'minormobius.bsky.social', 'a-very-long-handle-indeed.example.social']) {
    for (const n of [500, 49891, 1234567]) {
      const t = cardText(mk(43, 84), handle, n);
      ok(textLength(t) <= 300, `the card post fits 300 graphemes (${handle}, ${n} posts — got ${textLength(t)})`);
      ok(t.includes('b.mino.mobi/palm/?u='), `and always keeps the link back (${handle})`);
    }
  }

  const t = cardText(mk(43, 84), 'minormobius.bsky.social', 49891);
  ok(t.includes('not an AI detector'), 'the caveat survives at a realistic length');
  const f = linkFacets(t);
  eq(f.length, 1, 'the link back gets exactly one facet');
  eq(new TextEncoder().encode(t).slice(f[0].index.byteStart, f[0].index.byteEnd).length,
    new TextEncoder().encode(f[0].features[0].uri).length,
    'and its byte offsets select exactly the URL — facets are byte-indexed, not character-indexed');

  const alt = cardAlt(mk(43, 84), 'minormobius.bsky.social');
  ok(alt.includes('percentile'), 'the alt text gives the numbers as percentiles');
  ok(alt.includes('not a probability'), 'and carries the same caveat as the page, for anyone who cannot see the card');
  ok(AXES.every((a) => alt.includes(a.label)), 'and names every spoke');
}

if (failures) {
  console.error(`\n✗ palm selftest FAILED — ${failures} assertion(s)\n`);
  process.exit(1);
}
console.log('✓ palm selftest passed — CAR streaming (like trap, chunk boundaries, MST prefix compression), the six readings, the percentile comparison, and the shared card\'s grapheme budget and link facets');
