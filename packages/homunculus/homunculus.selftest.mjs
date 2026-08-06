/**
 * Known-answer selftest for the census. No network — the fixture is a
 * hand-counted corpus exercising every category the census separates:
 * substantive prose, a link-only post, a throwaway, a reply to someone else,
 * a self-thread continuation, and a reply whose parent has vanished.
 *
 *   node homunculus.selftest.mjs
 */

import { createHash } from 'node:crypto';
import { census, verdict } from './census.mjs';
import { decodeCbor, readVarint, parseCar, readRepo } from './car.mjs';
import { toRow, LOG_FILE } from './log-prompt.mjs';

const ROWS = [
  // 13 words of prose, top-level. Root of the one self-thread.
  {
    uri: 'at://self/p/1', author: 'did:self', replyParent: null, createdAt: '2025-01-01T00:00:00Z',
    text: 'This is a genuinely substantive post about deployment pipelines and their failure modes',
  },
  // Nothing but a URL — zero prose once stripped.
  {
    uri: 'at://self/p/2', author: 'did:self', replyParent: null, createdAt: '2025-02-01T00:00:00Z',
    text: 'https://example.com/thing',
  },
  // One word. Real utterance, no recoverable voice.
  {
    uri: 'at://self/p/3', author: 'did:self', replyParent: null, createdAt: '2025-03-01T00:00:00Z',
    text: 'lol',
  },
  // The only trainable pair: reply to another person, parent hydrated,
  // 11 words of prose after the leading mention is stripped.
  {
    uri: 'at://self/p/4', author: 'did:self', replyParent: 'at://other/p/9', createdAt: '2026-01-01T00:00:00Z',
    text: '@someone I think the second option is better because it fails loudly',
    parentText: 'Which of these two should we ship?', parentAuthor: 'did:other', parentIsSelf: false,
  },
  // Self-reply: hydrated, but a continued thought rather than a response.
  {
    uri: 'at://self/p/5', author: 'did:self', replyParent: 'at://self/p/1', createdAt: '2025-01-01T00:05:00Z',
    text: 'Continuing the thought: the failure mode nobody plans for is the silent one',
    parentText: 'This is a genuinely substantive post about deployment pipelines and their failure modes',
    parentAuthor: 'did:self', parentIsSelf: true,
  },
  // Parent deleted — must be counted as missing, not silently dropped.
  {
    uri: 'at://self/p/6', author: 'did:self', replyParent: 'at://other/p/gone', createdAt: '2026-02-01T00:00:00Z',
    text: 'Answering a ghost post that no longer exists anywhere', parentMissing: true,
  },
];

const EXPECTED = {
  posts: 6,
  substantive: 4,       // p1, p4, p5, p6
  linkOnly: 1,          // p2
  totalWords: 47,       // 13 + 0 + 1 + 11 + 13 + 9
  medianWords: 10,      // sorted [0,1,9,11,13,13]
  meanWords: 7.8,
  replies: 3,           // p4, p5, p6
  hydrated: 2,          // p4, p5
  parentsMissing: 1,    // p6
  pairs: 1,             // p4 only — p5 is a self-reply
  pairWords: 11,
  selfThreads: 1,       // p1 → p5
  longestThread: 2,
  longestThreadWords: 26,
  threadWords: 26,
};

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(20)} ${actual}${ok ? '' : ` (expected ${expected})`}`);
};

console.log('\nhomunculus census — known answers');
const c = census(ROWS);
for (const [key, want] of Object.entries(EXPECTED)) check(key, c[key], want);

console.log('\nderived');
const years = Object.fromEntries(c.perYear);
check('2025 posts', years['2025'], 4);
check('2026 posts', years['2026'], 2);
check('vocab non-empty', c.vocab > 0, true);
check('tokens estimated', c.estTokens > 0, true);

console.log('\nverdict thresholds');
const tiny = verdict(c).join(' ');
check('flags tiny corpus', tiny.includes('Too small to finetune'), true);
check('flags thin dialogue', tiny.includes('voice mimicry only'), true);
check('flags no long form', tiny.includes('cannot train essay generation'), true);
check('flags prose-poor', tiny.includes('teach it to post links'), false); // 4/6 carry prose

const big = verdict({ ...c, estTokens: 5_000_000, pairs: 20_000, longestThreadWords: 900, substantive: 6 }).join(' ');
check('scales up verdict', big.includes('serious LoRA'), true);
check('weights dialogue up', big.includes('Weight it up'), true);

// ─── CAR / DAG-CBOR ──────────────────────────────────────────────
//
// The reader is a hand-rolled binary parser, so it gets known-answer tests on
// the primitives and a full round trip through a CAR built here with real
// sha2-256 CIDs. The encoder below exists only to make fixtures — production
// code never writes CBOR.

const hex = (s) => new Uint8Array(s.match(/../g).map((b) => parseInt(b, 16)));

console.log('\ncbor primitives');
const cbor = (h) => decodeCbor(hex(h), 0)[0];
check('varint 1 byte', readVarint(hex('7f'), 0)[0], 127);
check('varint 2 byte', readVarint(hex('8001'), 0)[0], 128);
check('varint 3 byte', readVarint(hex('ffff03'), 0)[0], 65535);
check('uint tiny', cbor('0a'), 10);
check('uint8', cbor('1864'), 100);
check('uint16', cbor('1903e8'), 1000);
check('uint32', cbor('1a000f4240'), 1000000);
check('negative', cbor('20'), -1);
check('negative 8-bit', cbor('3863'), -100);
check('true', cbor('f5'), true);
check('false', cbor('f4'), false);
check('null', cbor('f6'), null);
check('text', cbor('6449455446'), 'IETF');
check('empty text', cbor('60'), '');
check('bytes', [...cbor('43010203')].join(','), '1,2,3');
check('array', cbor('83010203').join(','), '1,2,3');
check('nested map', cbor('a26161016162820203').a, 1);
check('float64', cbor('fb3ff199999999999a'), 1.1);

// ── fixture encoder ──
function head(major, arg) {
  if (arg < 24) return [(major << 5) | arg];
  if (arg < 0x100) return [(major << 5) | 24, arg];
  if (arg < 0x10000) return [(major << 5) | 25, arg >> 8, arg & 0xff];
  return [(major << 5) | 26, (arg >>> 24) & 0xff, (arg >>> 16) & 0xff, (arg >>> 8) & 0xff, arg & 0xff];
}

function enc(v) {
  if (v === null) return [0xf6];
  if (typeof v === 'number') return head(0, v);
  if (typeof v === 'string') {
    const b = [...Buffer.from(v, 'utf8')];
    return [...head(3, b.length), ...b];
  }
  if (v instanceof Uint8Array) return [...head(2, v.length), ...v];
  if (Array.isArray(v)) return [...head(4, v.length), ...v.flatMap(enc)];
  if (v.__cid) {
    const wrapped = new Uint8Array([0, ...v.__cid]);
    return [0xd8, 0x2a, ...head(2, wrapped.length), ...wrapped];
  }
  const keys = Object.keys(v);
  return [...head(5, keys.length), ...keys.flatMap((k) => [...enc(k), ...enc(v[k])])];
}

/** Block bytes → CIDv1 dag-cbor sha2-256, as raw multihash-prefixed bytes. */
const cidOf = (bytes) =>
  new Uint8Array([0x01, 0x71, 0x12, 0x20, ...createHash('sha256').update(Buffer.from(bytes)).digest()]);

function varint(n) {
  const out = [];
  while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n);
  return out;
}

console.log('\ncar round trip');

const DID = 'did:plc:testtesttesttesttesttest';
const postA = enc({ $type: 'app.bsky.feed.post', text: 'first', createdAt: '2023-04-13T18:54:51.120Z' });
const postB = enc({ $type: 'app.bsky.feed.post', text: 'second', createdAt: '2023-04-14T00:00:00.000Z' });
const cidA = cidOf(postA);
const cidB = cidOf(postB);

// Two entries sharing the 19-char "app.bsky.feed.post/" prefix, so the
// second exercises prefix decompression rather than a literal key.
const PREFIX = 'app.bsky.feed.post/';
const mst = enc({
  l: null,
  e: [
    { p: 0, k: new Uint8Array(Buffer.from(`${PREFIX}aaa`, 'utf8')), v: { __cid: cidA }, t: null },
    { p: PREFIX.length, k: new Uint8Array(Buffer.from('bbb', 'utf8')), v: { __cid: cidB }, t: null },
  ],
});
const mstCid = cidOf(mst);

const commit = enc({ did: DID, version: 3, data: { __cid: mstCid }, rev: 'testrev', prev: null });
const commitCid = cidOf(commit);

const header = enc({ version: 1, roots: [{ __cid: commitCid }] });
const frame = (cid, data) => [...varint(cid.length + data.length), ...cid, ...data];
const car = new Uint8Array([
  ...varint(header.length), ...header,
  ...frame(commitCid, commit),
  ...frame(mstCid, mst),
  ...frame(cidA, postA),
  ...frame(cidB, postB),
]);

const parsed = parseCar(car);
check('car blocks', parsed.blocks.size, 4);
check('car roots', parsed.roots.length, 1);

const repo = readRepo(car);
check('commit did', repo.did, DID);
check('commit rev', repo.rev, 'testrev');
check('records found', repo.total, 2);
const found = repo.collections.get('app.bsky.feed.post') ?? [];
check('posts collection', found.length, 2);
check('rkey literal', found[0]?.rkey, 'aaa');
check('rkey prefix-decompressed', found[1]?.rkey, 'bbb');
check('record text a', found[0]?.value.text, 'first');
check('record text b', found[1]?.value.text, 'second');

// ─── prompt logger ───────────────────────────────────────────────
//
// The hook must never throw — a logging failure that interrupts the user's
// turn is far worse than a missing line — so toRow has to survive whatever
// arrives on stdin.

console.log('\nprompt logger');
const TS = '2026-08-06T00:00:00.000Z';
const row = toRow({ session_id: 'sess_1', prompt: '  build me a homunculus  ' }, TS);
check('keeps prompt verbatim', row.prompt, '  build me a homunculus  ');
check('counts words', row.words, 4);
check('counts chars', row.chars, 25);
check('keeps session', row.session, 'sess_1');
check('stamps time', row.ts, TS);
check('resolves branch', typeof row.branch === 'string' || row.branch === null, true);

check('empty payload survives', toRow({}, TS).prompt, '');
check('empty payload zero words', toRow({}, TS).words, 0);
check('null payload survives', toRow(null, TS).prompt, '');
check('undefined payload survives', toRow(undefined, TS).prompt, '');
check('non-string prompt survives', toRow({ prompt: 42 }, TS).prompt, '');
check('whitespace-only is zero words', toRow({ prompt: '   \n  ' }, TS).words, 0);
check('log path is under log/', LOG_FILE.endsWith('/log/prompts.jsonl'), true);

console.log(failures ? `\n${failures} failure(s)\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
