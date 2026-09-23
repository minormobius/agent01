// orbit.selftest.mjs — the parts of /orbit that can be wrong silently.
//
//   node b/orbit/orbit.selftest.mjs
//
// Four things are gated here, and each one is a bug that looks like a working
// game from the outside:
//
//  1. THE LIKE TRAP. A like record contains "app.bsky.feed.post" inside its
//     subject URI. Count those as posts and the matrix fills with replies that
//     were never written, from a scan that looks healthy.
//  2. THE FAIR HAND. Round-robin dealing, no repeats across draws, and a seat
//     with no eligible cards reported rather than silently unguessable.
//  3. THE PERMALINK. A matrix costs thirteen repo downloads; a codec that loses
//     a cell loses the expensive thing, and JSON round-trips look fine until
//     the fragment is too long to paste.
//  4. THE CIRCLE. Quote embeds come in two shapes, and mutual-preference must
//     fall back rather than hand back a four-seat ring.

import { readPairs, sniff, uriDid, quoteUri, mentionDids, createPairReader } from './repo-scan.js';
import {
  wordCount, cardWeight, prepare, dealHand, rngFor, scoreHand, grade, perAuthor,
  ringLayout, MIN_WORDS,
} from './game.js';
import {
  newState, applyRow, cell, pack, unpack, encodeState, decodeState, pairs,
  maxVolume, progress, firstUri, dateRange,
} from './matrix.js';
import { quoteTarget, rank, pickCircle, authorOf } from '../lib/closeness.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

// ── a DAG-CBOR encoder, so the fixture is built the way a PDS builds one ─────
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
    const keys = Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    const o = [...head(5, keys.length)];
    for (const k of keys) { o.push(...enc(k)); o.push(...enc(v[k])); }
    return o;
  }
  throw new Error('cannot encode ' + typeof v);
}
const cidBytes = (s) => new Uint8Array([0x01, 0x71, 0x12, 0x20, ...Array.from({ length: 32 }, (_, i) => (s * 31 + i) & 255)]);
const varintBytes = (n) => { const o = []; while (n >= 128) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const blockBytes = (cid, payload) => { const body = [...cid, ...payload]; return [...varintBytes(body.length), ...body]; };

// ── the fixture repo ─────────────────────────────────────────────────────────
// ME replies to A (twice — the later one must lose), quotes B, mentions C in a
// post that is otherwise about nothing, likes A three times, reposts B once,
// and replies to a stranger who is not in the ring at all.
const ME = 'did:plc:me', A = 'did:plc:alpha', B = 'did:plc:bravo', C = 'did:plc:charlie', X = 'did:plc:stranger';

const cFirst = cidBytes(1), cLate = cidBytes(2), cQuote = cidBytes(3), cMention = cidBytes(4);
const cLike1 = cidBytes(5), cLike2 = cidBytes(6), cLike3 = cidBytes(7), cRepost = cidBytes(8);
const cOutside = cidBytes(9), cMst = cidBytes(10), cRoot = cidBytes(11);

const reply = (did, at, text) => enc({
  $type: 'app.bsky.feed.post', text, createdAt: at,
  reply: { parent: { uri: `at://${did}/app.bsky.feed.post/zzz`, cid: { __cid: cFirst } },
           root: { uri: `at://${did}/app.bsky.feed.post/zzz`, cid: { __cid: cFirst } } },
});
const recFirst = reply(A, '2023-01-05T09:00:00.000Z', 'the first thing I ever said to you');
const recLate = reply(A, '2024-06-05T09:00:00.000Z', 'and this is much later');
const recOutside = reply(X, '2022-01-01T00:00:00.000Z', 'someone outside the ring');
const recQuote = enc({
  $type: 'app.bsky.feed.post', text: 'look at this', createdAt: '2023-03-03T00:00:00.000Z',
  embed: { $type: 'app.bsky.embed.record', record: { uri: `at://${B}/app.bsky.feed.post/qqq`, cid: { __cid: cFirst } } },
});
const recMention = enc({
  $type: 'app.bsky.feed.post', text: 'hello @charlie', createdAt: '2023-04-04T00:00:00.000Z',
  facets: [{ index: { byteStart: 6, byteEnd: 14 }, features: [{ $type: 'app.bsky.richtext.facet#mention', did: C }] }],
});
// The trap, three times over: subject.uri CONTAINS "app.bsky.feed.post".
const like = (did, at) => enc({ $type: 'app.bsky.feed.like', createdAt: at, subject: { uri: `at://${did}/app.bsky.feed.post/3kabcdefghij`, cid: { __cid: cFirst } } });
const recRepost = enc({ $type: 'app.bsky.feed.repost', createdAt: '2023-05-05T00:00:00.000Z', subject: { uri: `at://${B}/app.bsky.feed.post/3krrr`, cid: { __cid: cFirst } } });

// MST keys share prefixes, which is what exercises prefix compression.
const KEYS = [
  ['app.bsky.feed.like/aaa', cLike1], ['app.bsky.feed.like/bbb', cLike2], ['app.bsky.feed.like/ccc', cLike3],
  ['app.bsky.feed.post/first0000000', cFirst], ['app.bsky.feed.post/late00000000', cLate],
  ['app.bsky.feed.post/ment00000000', cMention], ['app.bsky.feed.post/outs00000000', cOutside],
  ['app.bsky.feed.post/quot00000000', cQuote], ['app.bsky.feed.repost/rrr', cRepost],
];
let lastKey = '';
const mstNode = enc({
  e: KEYS.map(([k, cid]) => {
    let p = 0; while (p < k.length && p < lastKey.length && k[p] === lastKey[p]) p++;
    const entry = { p, k: TE.encode(k.slice(p)), v: { __cid: cid }, t: null };
    lastKey = k;
    return entry;
  }),
  l: null,
});
const commit = enc({ did: ME, rev: '3k', data: { __cid: cMst }, version: 3 });
const header = enc({ roots: [{ __cid: cRoot }], version: 1 });
const CAR = new Uint8Array([
  ...varintBytes(header.length), ...header,
  ...blockBytes(cRoot, commit),
  ...blockBytes(cMst, mstNode),
  ...blockBytes(cFirst, recFirst),
  ...blockBytes(cLate, recLate),
  ...blockBytes(cQuote, recQuote),
  ...blockBytes(cMention, recMention),
  ...blockBytes(cOutside, recOutside),
  ...blockBytes(cLike1, like(A, '2023-02-01T00:00:00.000Z')),
  ...blockBytes(cLike2, like(A, '2023-02-02T00:00:00.000Z')),
  ...blockBytes(cLike3, like(B, '2023-02-03T00:00:00.000Z')),
  ...blockBytes(cRepost, recRepost),
]);

console.log('orbit selftest');

// ── 1. the repo scan ─────────────────────────────────────────────────────────
{
  const row = readPairs(CAR, ME, new Set([A, B, C]));

  eq(row.counts[A].reply, 2, 'both replies to A are counted');
  eq(row.counts[A].like, 2, 'two likes of A are counted as likes');
  eq(row.counts[A].quote, 0, 'THE LIKE TRAP: a like of A is never a quote');
  eq(row.counts[A].total, 4, "A's total is two replies plus two likes");
  eq(row.counts[B].quote, 1, 'the quote of B is counted');
  eq(row.counts[B].like, 1, 'the like of B is counted');
  eq(row.counts[B].repost, 1, 'the repost of B is counted');
  eq(row.counts[C].mention, 1, 'the @mention of C is counted');
  eq(row.counts[X], undefined, 'a reply to someone outside the ring is not stored');
  eq(row.posts, 5, 'five post records, not eight — the three likes stay out');

  eq(row.first[A].kind, 'reply', 'first contact with A is a reply');
  eq(row.first[A].createdAt, '2023-01-05T09:00:00.000Z', 'the EARLIER reply wins, not the later one');
  eq(row.first[A].rkey, 'first0000000', 'the rkey comes back off the MST, prefix compression and all');
  eq(row.first[A].uri, `at://${ME}/app.bsky.feed.post/first0000000`, 'the first-contact uri is addressable');
  eq(row.first[B].kind, 'quote', 'with no reply to B, the quote is the first contact, flagged as one');
  eq(row.first[C], undefined, 'a bare @mention is not a first contact');
}

// A post that replies to one person and quotes another must count for BOTH —
// keying first-contact by post rather than by target silently dropped one.
{
  const cBoth = cidBytes(21), cM2 = cidBytes(22), cR2 = cidBytes(23);
  const recBoth = enc({
    $type: 'app.bsky.feed.post', text: 'replying to you about them', createdAt: '2021-07-07T00:00:00.000Z',
    reply: { parent: { uri: `at://${A}/app.bsky.feed.post/zzz`, cid: { __cid: cBoth } }, root: { uri: `at://${A}/app.bsky.feed.post/zzz`, cid: { __cid: cBoth } } },
    embed: { $type: 'app.bsky.embed.recordWithMedia', record: { record: { uri: `at://${B}/app.bsky.feed.post/qqq`, cid: { __cid: cBoth } } }, media: { $type: 'app.bsky.embed.images' } },
  });
  const node = enc({ e: [{ p: 0, k: TE.encode('app.bsky.feed.post/both00000000'), v: { __cid: cBoth }, t: null }], l: null });
  const car = new Uint8Array([
    ...varintBytes(header.length), ...header,
    ...blockBytes(cR2, commit), ...blockBytes(cM2, node), ...blockBytes(cBoth, recBoth),
  ]);
  const row = readPairs(car, ME, new Set([A, B]));
  eq(row.counts[A].reply, 1, 'one post, replying to A');
  eq(row.counts[B].quote, 1, 'the same post, quoting B (recordWithMedia shape)');
  eq(row.first[A].kind, 'reply', 'A gets the reply as first contact');
  eq(row.first[B].kind, 'quote', 'B gets the quote as first contact, from the same post');
  eq(row.first[A].rkey, 'both00000000', 'and both point at the one real record');
}

// Chunk boundaries must not change the answer: the network delivers a 90 MB CAR
// in thousands of arbitrary slices, and a block straddling two of them is the
// normal case, not the edge case.
{
  const whole = readPairs(CAR, ME, new Set([A, B, C]));
  for (const step of [1, 7, 64, 1000]) {
    const r = createPairReader(ME, new Set([A, B, C]));
    for (let i = 0; i < CAR.length; i += step) r.push(CAR.subarray(i, Math.min(i + step, CAR.length)));
    const got = r.finish();
    eq(JSON.stringify(got.counts), JSON.stringify(whole.counts), `chunked at ${step} bytes gives the same counts`);
    eq(got.first[A].rkey, whole.first[A].rkey, `chunked at ${step} bytes still joins the MST`);
  }
}

// The sniff itself, at its edges.
{
  const bytes = (s) => new Uint8Array([...TE.encode(s)]);
  // A CBOR text head is 0x60 | length — 0x72 for an 18-character type string,
  // 0x74 for a 20-character one. That byte IS the anchor.
  const withLen = (s) => new Uint8Array([0x60 | s.length, ...TE.encode(s)]);
  eq(sniff(withLen('app.bsky.feed.post'), 0, 19), 'post', 'a length-anchored post type is found');
  eq(sniff(withLen('app.bsky.feed.like'), 0, 19), 'like', 'a length-anchored like type is found');
  eq(sniff(withLen('app.bsky.feed.repost'), 0, 21), 'repost', 'a length-anchored repost type is found');
  const uri = bytes('at://did:plc:x/app.bsky.feed.post/3kabc');
  eq(sniff(uri, 0, uri.length), null, 'the same string inside a URI is not a record type');
  eq(uriDid('at://did:plc:zz/app.bsky.feed.post/a'), 'did:plc:zz', 'uriDid pulls the repo did');
  eq(uriDid('https://bsky.app/profile/x'), null, 'uriDid refuses anything that is not an at:// uri');
  eq(quoteUri({ embed: { $type: 'app.bsky.embed.record', record: { uri: 'at://d/app.bsky.feed.post/1' } } }), 'at://d/app.bsky.feed.post/1', 'quoteUri reads the plain record embed');
  eq(quoteUri({ embed: { $type: 'app.bsky.embed.record', record: { uri: 'at://d/app.bsky.graph.list/1' } } }), null, 'quoting a LIST is not quoting a post');
  eq(mentionDids({ facets: [{ features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'x' }] }] }).length, 0, 'a link facet is not a mention');
}

// ── 2. the hand ──────────────────────────────────────────────────────────────
{
  eq(wordCount('one two three'), 3, 'three words');
  eq(wordCount('look https://example.com/a/b here'), 2, 'a bare URL is not a word');
  eq(wordCount('   '), 0, 'whitespace is nothing');
  eq(cardWeight({ text: 'too short' }), 0, `under ${MIN_WORDS} words is never dealt`);
  ok(cardWeight({ words: 40 }) > cardWeight({ words: 10 }) * 2, 'the draw is biased toward wordier posts');
  ok(cardWeight({ words: 300 }) === cardWeight({ words: 60 }), 'the bias saturates, so one wall of text cannot eat the deck');
}

{
  // Twelve seats. One of them posts ten times as much as anyone else; pooled
  // sampling would hand them a third of the hand.
  const dids = Array.from({ length: 12 }, (_, i) => `did:plc:p${i}`);
  const pool = prepare(dids.flatMap((d, i) => Array.from({ length: d === dids[0] ? 400 : 20 }, (_, k) => ({
    uri: `at://${d}/app.bsky.feed.post/${k}`, did: d, text: 'a sentence with quite a few ordinary words in it ' + k,
  }))));
  const rng = rngFor('fair');
  const { hand, absent, exhausted } = dealHand(pool, { count: 20, rng, dids });
  eq(hand.length, 20, 'twenty cards are dealt');
  eq(absent.length, 0, 'every seat can supply a card');
  eq(exhausted, false, 'the pool is not spent');
  const per = {};
  for (const c of hand) per[c.did] = (per[c.did] || 0) + 1;
  const counts = Object.values(per);
  eq(Object.keys(per).length, 12, 'all twelve seats appear in a twenty-card hand');
  ok(Math.max(...counts) - Math.min(...counts) <= 1, 'the loudest account gets no more cards than the quietest (round-robin)');

  // Draw more: no card is ever dealt twice.
  const used = new Set(hand.map((c) => c.uri));
  const more = dealHand(pool, { count: 20, rng, used, dids });
  eq(more.hand.length, 20, 'a second hand is dealt');
  eq(more.hand.filter((c) => used.has(c.uri)).length, 0, 'and repeats nothing from the first');
}

{
  // A seat with nothing postable must be REPORTED, not silently unguessable.
  const dids = ['did:plc:a', 'did:plc:b', 'did:plc:mute'];
  const pool = prepare([
    { uri: 'at://a/1', did: 'did:plc:a', text: 'plenty of words here to make a real card' },
    { uri: 'at://b/1', did: 'did:plc:b', text: 'also plenty of words here for a card' },
    { uri: 'at://m/1', did: 'did:plc:mute', text: 'lol' },
  ]);
  const { hand, absent } = dealHand(pool, { count: 10, rng: rngFor('mute'), dids });
  eq(absent.join(), 'did:plc:mute', 'the seat with only a two-word post is reported absent');
  eq(hand.every((c) => c.did !== 'did:plc:mute'), true, 'and never appears in the hand');
}

{
  // The same seed deals the same hand, forever.
  const dids = ['d1', 'd2', 'd3'];
  const pool = prepare(dids.flatMap((d) => Array.from({ length: 30 }, (_, k) => ({ uri: `${d}/${k}`, did: d, text: `words words words words words ${k}` }))));
  const a = dealHand(pool, { count: 9, rng: rngFor('seed-42'), dids }).hand.map((c) => c.uri).join();
  const b = dealHand(pool, { count: 9, rng: rngFor('seed-42'), dids }).hand.map((c) => c.uri).join();
  const c = dealHand(pool, { count: 9, rng: rngFor('seed-43'), dids }).hand.map((c) => c.uri).join();
  eq(a, b, 'a named seed is a permanent hand');
  ok(a !== c, 'a different seed is a different hand');
}

// ── 3. the score ─────────────────────────────────────────────────────────────
{
  // Difficulty is set by the size of the ring, so the grade reads lift, not %.
  const answers = (n, right) => Array.from({ length: n }, (_, i) => ({ did: 'd' + (i % 4), correct: i < right }));
  const small = scoreHand(answers(20, 10), 4);     // 50% against a 4-seat ring
  const big = scoreHand(answers(20, 10), 20);      // 50% against a 20-seat ring
  eq(small.pct, big.pct, 'both hands are 50%');
  ok(big.lift > small.lift, 'but 50% against twenty seats beats 50% against four');
  eq(grade(scoreHand(answers(20, 20), 12)).grade, 'A+', 'a perfect hand is an A+');
  eq(grade(scoreHand(answers(12, 1), 12)).grade, 'F', 'chance is an F');
  eq(scoreHand([], 12).lift, 0, 'an empty hand does not divide by zero');
  eq(scoreHand(answers(10, 10), 1).lift, 0, 'a one-seat ring has no lift to give');

  const pa = perAuthor([{ did: 'a', correct: true }, { did: 'a', correct: true }, { did: 'b', correct: false }]);
  eq(pa[0].did, 'a', 'the author you always get is first');
  eq(pa[0].pct, 1, 'and reads 100%');
  eq(pa[1].seen, 1, 'the other was seen once');
}

{
  const ring = ringLayout(12);
  eq(ring.length, 12, 'twelve seats');
  ok(Math.abs(ring[0].x) < 1e-9 && ring[0].y < 0, 'the closest account sits at twelve o\'clock');
  ok(ring[0].r < ring[11].r, 'closeness pulls a seat inward');
  ok(ring[0].scale > ring[11].scale, 'and makes it larger');
  eq(ringLayout(1).length, 1, 'a one-seat ring does not divide by zero');
}

// ── 4. the matrix and its permalink ──────────────────────────────────────────
const RING = [
  { did: A, handle: 'alpha.bsky.social' },
  { did: B, handle: 'bravo.bsky.social' },
  { did: C, handle: 'charlie.bsky.social' },
];

{
  const st = newState({ did: ME, handle: 'me.bsky.social' }, RING);
  eq(st.people.length, 4, 'the seed is row zero and the ring follows');
  eq(progress(st).done, 0, 'nothing is read yet');
  applyRow(st, readPairs(CAR, ME, new Set([A, B, C])));
  eq(progress(st).done, 1, 'one row read');
  eq(cell(st, 0, 1).counts.total, 4, 'row zero, column one is the ME→A cell');
  eq(cell(st, 1, 0), null, 'the other direction is still blank — that row is unread');
  eq(firstUri(st, 0, 1), `at://${ME}/app.bsky.feed.post/first0000000`, 'the first-contact post is addressable from the matrix');
  eq(maxVolume(st), 4, 'the heat scale comes off the busiest cell');
  ok(dateRange(st).lo === Date.parse('2023-01-05T09:00:00.000Z'), 'the date range starts at the earliest first contact');

  // A second row, so a pair has both directions and reciprocity is meaningful.
  applyRow(st, {
    did: A,
    counts: { [ME]: { reply: 9, quote: 0, repost: 0, like: 1, mention: 0, total: 10 } },
    first: { [ME]: { kind: 'reply', rkey: 'aaa00000000', createdAt: '2023-01-06T09:00:00.000Z', text: 'answering you' } },
  });
  const pr = pairs(st);
  eq(pr.length, 1, 'only the pair with both rows read is reported');
  eq(pr[0].opener, 0, 'the seed spoke first');
  ok(Math.abs(pr[0].lead - 1) < 0.01, 'by one day');
  ok(pr[0].balance < 0, 'and A has since done most of the talking');
}

{
  // Round trip, including the one lossy thing (post text) being lossy on purpose.
  const st = newState({ did: ME, handle: 'me.bsky.social' }, RING);
  applyRow(st, readPairs(CAR, ME, new Set([A, B, C])));
  const back = unpack(pack(st));
  eq(back.people.length, st.people.length, 'the people survive');
  eq(JSON.stringify(back.cells['0,1'].counts), JSON.stringify(st.cells['0,1'].counts), 'the counts survive exactly');
  eq(back.cells['0,1'].first.rkey, 'first0000000', 'the rkey survives');
  eq(back.cells['0,1'].first.createdAt, '2023-01-05T09:00:00.000Z', 'the date survives to the minute');
  eq(back.cells['0,1'].first.text, '', 'the text does NOT — it is re-fetched, so a deleted post reads as deleted');
  eq(back.rows.join(), st.rows.join(), 'which rows were actually read survives');
}

{
  // The size gate. A full 13x13 matrix has to fit in something a person can
  // paste, or the permalink is a feature that only works on small circles.
  const dids = Array.from({ length: 13 }, (_, i) => ({ did: `did:plc:abcdefghijklmnopqrstuvw${i}`, handle: `person${i}.bsky.social` }));
  const st = newState(dids[0], dids.slice(1));
  for (let i = 0; i < 13; i++) {
    const counts = {}, first = {};
    for (let j = 0; j < 13; j++) {
      if (i === j) continue;
      counts[dids[j].did] = { reply: 40 + j, quote: 3, repost: 7, like: 210 + i, mention: 1, total: 261 + i + j };
      first[dids[j].did] = { kind: 'reply', rkey: `3kabcd${i}${j}wxyz`, createdAt: `2023-0${1 + (i % 9)}-1${j % 9}T12:34:00.000Z`, text: 'x'.repeat(280) };
    }
    applyRow(st, { did: dids[i].did, counts, first });
  }
  eq(Object.keys(st.cells).length, 156, 'a full 13-seat matrix is 156 directed cells');
  const payload = await encodeState(st);
  ok(payload.length < 3000, `a full matrix fragment is pasteable (${payload.length} chars; measured 1,942)`);
  const back = await decodeState(payload);
  eq(back.people.length, 13, 'and decodes to the same people');
  eq(Object.keys(back.cells).length, 156, 'with every cell intact');
  eq(back.cells['0,1'].counts.like, 210, 'and the right numbers in them');
  eq(back.cells['12,0'].first.rkey, '3kabcd120wxyz', 'and the right rkeys');
  eq(back.rows.length, 13, 'and every row marked read');
  let threw = false;
  try { await decodeState('not-a-real-payload'); } catch { threw = true; }
  eq(threw, true, 'garbage in the fragment throws rather than rendering a lie');
}

// ── 5. the circle ────────────────────────────────────────────────────────────
{
  eq(authorOf('at://did:plc:q/app.bsky.feed.post/1'), 'did:plc:q', 'authorOf reads the repo did');
  eq(quoteTarget({ embed: { $type: 'app.bsky.embed.record', record: { uri: 'at://d/app.bsky.feed.post/1' } } }), 'at://d/app.bsky.feed.post/1', 'plain record embed');
  eq(quoteTarget({ embed: { $type: 'app.bsky.embed.recordWithMedia', record: { record: { uri: 'at://d/app.bsky.feed.post/2' } } } }), 'at://d/app.bsky.feed.post/2', 'recordWithMedia embed');
  eq(quoteTarget({ embed: { $type: 'app.bsky.embed.images' } }), null, 'an image embed quotes nobody');

  const counts = new Map([
    ['d:a', { did: 'd:a', like: 1, repost: 0, reply: 0, quote: 0, score: 5 }],
    ['d:b', { did: 'd:b', like: 9, repost: 0, reply: 0, quote: 0, score: 5 }],
    ['d:c', { did: 'd:c', like: 0, repost: 0, reply: 3, quote: 0, score: 9 }],
  ]);
  eq(rank(counts).map((c) => c.did).join(), 'd:c,d:b,d:a', 'score first, then the cheap interactions, deterministically');

  const ranked = rank(counts);
  eq(pickCircle(ranked, new Set(['d:a']), 2).map((c) => c.did).join(), 'd:a,d:c', 'a mutual outranks a closer non-mutual');
  eq(pickCircle(ranked, new Set(['d:a']), 2)[1].mutual, false, 'and the seat it could not fill is labelled honestly');
  eq(pickCircle(ranked, new Set(), 3).length, 3, 'with no mutuals at all the ring still fills');
  eq(pickCircle(ranked, new Set(['d:a', 'd:b', 'd:c']), 2).map((c) => c.did).join(), 'd:c,d:b', 'all mutual means plain rank order');
}

if (failures) { console.error(`\n✗ ${failures} failure(s)`); process.exit(1); }
console.log('✓ orbit selftest passed');
