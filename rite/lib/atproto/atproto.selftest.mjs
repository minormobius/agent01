// atproto.selftest.mjs — node rite/lib/atproto/atproto.selftest.mjs
// The sieve every rite tool reads a repo through: it must keep exactly the
// collections asked for, never mistake a like for a post, survive any chunking,
// and reduce a post to what the tools read (media discarded) without changing
// what isProse and the thread builder conclude.
import { readFileSync } from 'node:fs';
import { createSieve, collectionMark } from './car.js';
import { slimPost, isProse, buildThreadChains, analyzeProfile } from './index.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.error('✗ ' + m); } };
const here = new URL('.', import.meta.url).pathname;

ok(readFileSync(here + 'car.js', 'utf8') === readFileSync(here + '../../../packages/atproto/car.js', 'utf8'), 'car.js is a byte-identical copy of packages/atproto/car.js');
ok(collectionMark('app.bsky.feed.post')[0] === 0x72 && collectionMark('app.bsky.feed.repost')[0] === 0x74 && collectionMark('com.example.a.very.long.collection.name')[0] === 0x78, 'marks carry the CBOR text header');

// ── a hand-built CAR (minimal DAG-CBOR) ──────────────────────────────────────
const enc = (v) => {
  const out = [];
  const head = (major, n) => {
    if (n < 24) out.push((major << 5) | n);
    else if (n < 256) out.push((major << 5) | 24, n);
    else if (n < 65536) out.push((major << 5) | 25, n >> 8, n & 255);
    else out.push((major << 5) | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  };
  const go = (x) => {
    if (x === null) out.push(0xf6);
    else if (typeof x === 'number') head(0, x);
    else if (typeof x === 'string') { const b = new TextEncoder().encode(x); head(3, b.length); out.push(...b); }
    else if (x instanceof Uint8Array) { head(2, x.length); out.push(...x); }
    else if (Array.isArray(x)) { head(4, x.length); x.forEach(go); }
    else if (x && x.$cid) { out.push(0xd8, 42); head(2, x.$cid.length + 1); out.push(0, ...x.$cid); }
    else { const ks = Object.keys(x); head(5, ks.length); for (const k of ks) { go(k); go(x[k]); } }
  };
  go(v);
  return Uint8Array.from(out);
};
const cid = (n) => Uint8Array.from([1, 0x71, 0x12, 0x20, ...Array(31).fill(0), n]);
const varint = (n) => { const o = []; while (n >= 128) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const block = (c, body) => [...varint(c.length + body.length), ...c, ...body];
const te = (s) => new TextEncoder().encode(s);
const DID = 'did:plc:me';

const P1 = { $type: 'app.bsky.feed.post', text: 'the first part of a long thought that keeps going', createdAt: '2025-01-01T00:00:00Z',
  facets: [{ index: { byteStart: 4, byteEnd: 9 }, features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:you' }] }] };
const P2 = { $type: 'app.bsky.feed.post', text: 'and the second part, replying to myself', createdAt: '2025-01-01T00:01:00Z',
  reply: { root: { uri: `at://${DID}/app.bsky.feed.post/3aaa`, cid: 'x' }, parent: { uri: `at://${DID}/app.bsky.feed.post/3aaa`, cid: 'x' } } };
const P3 = { $type: 'app.bsky.feed.post', text: 'a photo', createdAt: '2025-01-02T00:00:00Z',
  embed: { $type: 'app.bsky.embed.images', images: [{ alt: 'a very long description of a picture', image: { $type: 'blob', ref: { $cid: cid(77) }, mimeType: 'image/jpeg', size: 123456 }, aspectRatio: { width: 4, height: 3 } }] } };
const P4 = { $type: 'app.bsky.feed.post', text: 'quoting myself', createdAt: '2025-01-03T00:00:00Z',
  embed: { $type: 'app.bsky.embed.record', record: { uri: `at://${DID}/app.bsky.feed.post/3aab`, cid: 'y' } } };
const P5 = { $type: 'app.bsky.feed.post', text: 'read this', createdAt: '2025-01-04T00:00:00Z',
  embed: { $type: 'app.bsky.embed.external', external: { uri: 'https://example.com/a', title: 'A', description: 'about a', thumb: { $type: 'blob', ref: { $cid: cid(78) }, mimeType: 'image/png', size: 9 } } },
  facets: [{ index: { byteStart: 0, byteEnd: 4 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/b' }] }] };
const LIKE = { $type: 'app.bsky.feed.like', subject: { uri: 'at://did:plc:x/app.bsky.feed.post/3zzz', cid: 'bafy' }, createdAt: '2025-01-05T00:00:00Z' };
const REPOST = { $type: 'app.bsky.feed.repost', subject: { uri: 'at://did:plc:x/app.bsky.feed.post/3yyy', cid: 'bafz' }, createdAt: '2025-01-06T00:00:00Z' };
const recs = [['app.bsky.feed.like/3lk1', LIKE, 10], ['app.bsky.feed.post/3aaa', P1, 1], ['3aab', P2, 2, 19], ['3aac', P3, 3, 19], ['3aad', P4, 4, 19], ['3aae', P5, 5, 19],
  ['app.bsky.feed.post/3aaf', P1, 1], ['app.bsky.feed.repost/3rp1', REPOST, 11]];
const mst = { e: recs.map(([k, , n, p = 0]) => ({ k: te(k), p, t: null, v: { $cid: cid(n) } })), l: null };
const header = enc({ version: 1, roots: [] });
const car = Uint8Array.from([...varint(header.length), ...header,
  ...block(cid(1), enc(P1)), ...block(cid(10), enc(LIKE)), ...block(cid(2), enc(P2)), ...block(cid(9), enc(mst)),
  ...block(cid(3), enc(P3)), ...block(cid(4), enc(P4)), ...block(cid(5), enc(P5)), ...block(cid(11), enc(REPOST))]);

const sieve = (want, step = car.length) => { const s = createSieve({ want }); for (let i = 0; i < car.length; i += step) s.push(car.subarray(i, i + step)); return s.finish(); };
const all = sieve({ 'app.bsky.feed.post': slimPost, 'app.bsky.feed.repost': (r) => ({ subject_uri: r.subject.uri }) });
const posts = all.records['app.bsky.feed.post'];
ok(posts.map((p) => p.rkey).join() === '3aaa,3aab,3aac,3aad,3aae,3aaf', 'every post, in rkey order, with prefix-compressed keys rebuilt');
ok(posts[0].value.text === P1.text && posts[5].value.text === P1.text, 'two identical records share one CID and both keep their rkey');
ok(all.records['app.bsky.feed.repost'].length === 1 && all.records['app.bsky.feed.repost'][0].value.subject_uri === REPOST.subject.uri, 'reposts when asked');
ok(!posts.some((p) => p.value.text === undefined) && posts.length === 6, "a like (whose subject.uri contains 'app.bsky.feed.post') is never taken for a post");
ok(all.collections['app.bsky.feed.post'] === 6 && all.collections['app.bsky.feed.like'] === 1, 'every collection is still counted from the MST');
const onlyReposts = sieve({ 'app.bsky.feed.repost': (r) => r.subject.uri });
ok(onlyReposts.records['app.bsky.feed.repost'].length === 1 && !onlyReposts.records['app.bsky.feed.post'], 'asking for reposts alone decodes no posts');
ok(onlyReposts.decoded === 2, `only the MST node and the repost were decoded (${onlyReposts.decoded})`);
const by7 = sieve({ 'app.bsky.feed.post': slimPost }, 7);
ok(JSON.stringify(by7.records) === JSON.stringify(sieve({ 'app.bsky.feed.post': slimPost }).records), 'the same answer in 7-byte chunks as in one piece');

// ── slimPost: what the tools read, media discarded ───────────────────────────
const s3 = slimPost(P3), s4 = slimPost(P4), s5 = slimPost(P5), s2 = slimPost(P2);
ok(JSON.stringify(s3.embed) === '{"$type":"app.bsky.embed.images"}', 'an images embed keeps its $type and loses alt text, blob refs and aspect ratio');
ok(s4.embed.record.uri === P4.embed.record.uri && s2.reply.parent.uri === P2.reply.parent.uri, 'quote and reply targets survive');
ok(s5.embed.external.uri === 'https://example.com/a' && s5.embed.external.title === 'A' && !('thumb' in s5.embed.external), "a link card keeps uri/title/description, not its thumbnail");
ok(s5.facets[0].features[0].uri === 'https://example.com/b' && s5.facets[0].index.byteEnd === 4, "facets keep the byte range and link uri web's anchors need");
const rwm = slimPost({ text: 'x', embed: { $type: 'app.bsky.embed.recordWithMedia', record: { record: { uri: 'at://q' } }, media: { $type: 'app.bsky.embed.images', images: [] } } });
ok(rwm.embed.record.record.uri === 'at://q' && !('media' in rwm.embed), 'recordWithMedia keeps the quoted uri and drops the media');

// isProse and the thread builder read the slim post exactly as the full one
const full = [P1, P2, P3, P4, P5].map((r, i) => ({ uri: `at://${DID}/app.bsky.feed.post/3aa${'abcde'[i]}`, rkey: `3aa${'abcde'[i]}`, record: r }));
const slim = full.map((p) => ({ ...p, record: slimPost(p.record) }));
ok(full.map(isProse).join() === slim.map(isProse).join(), `isProse agrees on every slim post (${slim.map(isProse).join()})`);
ok(JSON.stringify(buildThreadChains(full).map((c) => c.map((p) => p.rkey))) === JSON.stringify(buildThreadChains(slim).map((c) => c.map((p) => p.rkey))), 'thread chains agree (reply and quote links)');
ok(JSON.stringify(analyzeProfile(full, { minChars: 10 }).map((t) => t.text)) === JSON.stringify(analyzeProfile(slim, { minChars: 10 }).map((t) => t.text)), 'composed threads agree');

console.log(fails ? `✗ ${fails} failed, ${passes} passed` : `✓ rite atproto selftest: ${passes} passed`);
process.exit(fails ? 1 : 0);
