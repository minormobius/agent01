/**
 * Known-answer selftest for the census. No network — the fixture is a
 * hand-counted corpus exercising every category the census separates:
 * substantive prose, a link-only post, a throwaway, a reply to someone else,
 * a self-thread continuation, and a reply whose parent has vanished.
 *
 *   node homunculus.selftest.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { census, verdict } from './census.mjs';
import { decodeCbor, readVarint, parseCar, readRepo } from './car.mjs';
import { toRow, LOG_FILE } from './log-prompt.mjs';
import { detectShape, extract } from './chatlog.mjs';
import { distil, provenanceMode, redact, isRecoveryPrompt } from './capture-session.mjs';
import { ingest } from './ingest-prompts.mjs';
import { remoteBranches, inboxOnBranch, branchesWithInbox, readInbox } from './branch-corpus.mjs';
import { rowsFrom } from './collect-branches.mjs';

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


// ─── chat export ingester ────────────────────────────────────────
//
// The export schema is undocumented and unversioned, so the ingester detects
// it. These fixtures are the two plausible layouts — a plain `text` string and
// a `content[]` block list — plus the shapes that must be REFUSED rather than
// silently yielding an empty corpus.

console.log('\nchat export — shape detection');

const flatExport = [
  { uuid: 'c1', name: 'first chat', chat_messages: [
    { sender: 'human', text: 'how do ideas spread', created_at: '2024-10-18T00:00:00Z' },
    { sender: 'assistant', text: 'Ideas spread through networks of people.' },
    { sender: 'human', text: 'go deeper on the network topology part please' },
  ]},
  { uuid: 'c2', name: 'empty stub', chat_messages: [] },
];

const blockExport = { conversations: [
  { uuid: 'c3', title: 'blocks', messages: [
    { role: 'user', content: [{ type: 'text', text: 'build me a homunculus' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Here is the plan.' }] },
  ]},
]};

const flat = detectShape(flatExport);
check('flat: recognised', flat.ok, true);
check('flat: top-level', flat.root, null);
check('flat: messages key', flat.messageKey, 'chat_messages');
check('flat: role key', flat.roleKey, 'sender');
check('flat: text key', flat.textKey, 'text');
check('flat: title key', flat.titleKey, 'name');
check('flat: roles', flat.roles.sort().join(','), 'assistant,human');

const blocks = detectShape(blockExport);
check('blocks: recognised', blocks.ok, true);
check('blocks: nested under', blocks.root, 'conversations');
check('blocks: messages key', blocks.messageKey, 'messages');
check('blocks: role key', blocks.roleKey, 'role');
check('blocks: block key', blocks.blockKey, 'content');

// An empty first conversation must not decide the schema.
check('skips empty stub', detectShape([{ uuid: 'z', chat_messages: [] }, ...flatExport]).messageKey,
  'chat_messages');

console.log('\nchat export — refusals');
check('refuses empty array', detectShape([]).ok, false);
check('refuses null', detectShape(null).ok, false);
check('refuses shapeless', detectShape({ foo: 'bar' }).ok, false);
check('refuses no messages', detectShape([{ uuid: 'a', name: 'x' }]).ok, false);

console.log('\nchat export — extraction');
const tmp = `${tmpdir()}/homunculus-chatlog-selftest.jsonl`;
const { stats } = await extract(flatExport, tmp);
check('conversations counted', stats.conversations, 1);
check('turns extracted', stats.turns, 3);
check('human turns', stats.human, 2);
check('assistant turns', stats.assistant, 1);
check('human words', stats.humanWords, 12);

const rows = readFileSync(tmp, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
check('row keeps role', rows[0].role, 'human');
check('row keeps title', rows[0].title, 'first chat');
check('row indexes turn', rows[2].i, 2);
await extract(blockExport, tmp);
check('normalises user→human',
  JSON.parse(readFileSync(tmp, 'utf8').trim().split('\n')[0]).role, 'human');
rmSync(tmp, { force: true });


// ─── session capture ─────────────────────────────────────────────
//
// The trap: skills and slash commands inject their whole body as a user turn.
// One /update-config load arrived as 15,354 words against 148 the principal
// actually typed. `origin: {kind:'human'}` separates them — where the
// transcript has that field at all.

console.log('\nsession capture — provenance');
const L = (o) => JSON.stringify(o);
const modern = [
  L({ type: 'user', origin: { kind: 'human' }, timestamp: 't1', gitBranch: 'b',
      message: { role: 'user', content: 'download the car instead of paging' } }),
  L({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'text', text: 'Good call, one request.' },
      { type: 'tool_use', name: 'Bash', input: {} }] } }),
  L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
  // A skill body: no origin, enormous, must be dropped.
  L({ type: 'user', message: { role: 'user', content: '# Some Skill\n' + 'word '.repeat(500) } }),
  'not json at all',
  '',
];

check('detects origin mode', provenanceMode(modern.filter(Boolean).map((l) => {
  try { return JSON.parse(l); } catch { return {}; } })), 'origin');
check('detects shape mode', provenanceMode([{ type: 'user' }]), 'shape');

const d = distil(modern);
check('mode applied', d.stats.mode, 'origin');
check('keeps real prompt', d.stats.prompts, 1);
check('drops injected skill', d.stats.injected, 1);
check('drops tool result', d.stats.toolResults, 1);
check('keeps assistant text', d.stats.replies, 1);
check('prompt words', d.stats.promptWords, 6);
check('survives torn line', d.stats.records, 4);
check('assistant drops tool_use',
  d.turns.find((t) => t.role === 'assistant').text, 'Good call, one request.');
check('principal labelled', d.turns[0].role, 'principal');
check('keeps branch', d.turns[0].branch, 'b');

// Older transcripts have no origin anywhere: fall back to content shape
// rather than rejecting every turn.
const legacy = [
  L({ type: 'user', message: { role: 'user', content: 'an older typed prompt here' } }),
  L({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } }),
];
const dl = distil(legacy);
check('legacy falls back', dl.stats.mode, 'shape');
check('legacy keeps prompt', dl.stats.prompts, 1);
check('legacy drops tool result', dl.stats.toolResults, 1);



// ─── secret hygiene ──────────────────────────────────────────────
//
// The recovery briefing carries the passphrase and is pasted into every
// session — landing in the very transcript the export is about to ship.

console.log('\nsecret hygiene');
check('redacts the secret', redact('key is hunter2 ok', 'hunter2'), 'key is [REDACTED-KEY] ok');
check('redacts every copy', redact('a b a', 'a'), '[REDACTED-KEY] b [REDACTED-KEY]');
check('no secret is a no-op', redact('untouched', undefined), 'untouched');
check('empty secret is a no-op', redact('untouched', ''), 'untouched');
check('spots the briefing',
  isRecoveryPrompt('run HOMUNCULUS_KEY=x node ... guardian-angel-homunculus-ijgeel'), true);
check('one marker is not enough', isRecoveryPrompt('please set HOMUNCULUS_KEY'), false);
check('ordinary prompt is safe', isRecoveryPrompt('just download the car'), false);

const leaky = [
  L({ type: 'user', origin: { kind: 'human' },
      message: { role: 'user', content: 'export with HOMUNCULUS_KEY on guardian-angel-homunculus-ijgeel' } }),
  L({ type: 'user', origin: { kind: 'human' },
      message: { role: 'user', content: 'my passphrase is swordfish, use it' } }),
  L({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'text', text: 'Understood, using swordfish.' }] } }),
];
const dr = distil(leaky, { secret: 'swordfish' });
check('briefing dropped', dr.stats.recovery, 1);
check('real prompt kept', dr.stats.prompts, 1);
check('secret gone from prompt', dr.turns[0].text.includes('swordfish'), false);
check('secret gone from reply', dr.turns[1].text.includes('swordfish'), false);
check('redaction marked', dr.turns[0].text.includes('[REDACTED-KEY]'), true);


// ─── hand-collected prompt files ─────────────────────────────────
//
// A pile of files saved off a phone across ~289 sessions will not be uniform.
// The ingester takes the wrapper shape, a bare array, and text/prompt either
// way, and drops the same session saved twice.

console.log('\nprompt ingest');
const inDir = `${tmpdir()}/homunculus-ingest-${process.pid}`;
mkdirSync(inDir, { recursive: true });
writeFileSync(`${inDir}/a.json`, JSON.stringify({ session: 's1', messages: [
  { ts: '2026-01-02T00:00:00Z', text: 'second chronologically but first file' },
  { ts: '2026-01-01T00:00:00Z', text: 'earliest of all' },
  { ts: '2026-01-02T00:00:00Z', text: 'second chronologically but first file' }, // dupe
  { ts: '2026-01-03T00:00:00Z', text: '   ' },                                   // empty
]}));
writeFileSync(`${inDir}/b.json`, JSON.stringify([{ ts: '2026-01-04T00:00:00Z', prompt: 'bare array, prompt key' }]));
writeFileSync(`${inDir}/c.json`, JSON.stringify({ session: 's3', turns: [
  { ts: '2026-01-05T00:00:00Z', role: 'claude', text: 'I will page through the records' },
  { ts: '2026-01-06T00:00:00Z', role: 'me', text: 'just download the car' },
]}));
writeFileSync(`${inDir}/broken.json`, '{ not json');
writeFileSync(`${inDir}/ignored.txt`, 'not a json file');

const outFile = `${inDir}/merged.jsonl`;
const ir = ingest(inDir, outFile);
check('files read', ir.files, 4);
check('sessions counted', ir.sessions, 3);
check('prompts kept', ir.prompts, 4);
check('context turns kept', ir.replies, 1);
check('context words', ir.replyWords, 6);
check('duplicate dropped', ir.duplicates, 1);
check('unreadable named', ir.bad.join(','), 'broken.json');
check('words summed', ir.words, 16); // 5 + 3 + 4 + 4

const merged = readFileSync(outFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
check('sorted by time', merged[0].text, 'earliest of all');
check('bare array session from filename', merged[2].session, 'b');
check('claude role normalised', merged[3].role, 'assistant');
check('me role normalised', merged[4].role, 'principal');
rmSync(inDir, { recursive: true, force: true });


// ─── branch sweep ────────────────────────────────────────────────
//
// The flip-back gate depends on this finding every transcript on every
// branch. A fake git lets the scan be tested without a repo: the safety
// property (no false "all clear") is exactly what must not regress.

console.log('\nbranch sweep');
const fakeRepo = {
  'ls-remote': 'sha1\trefs/heads/claude/feature-a\nsha2\trefs/heads/claude/feature-b\nsha3\trefs/heads/main',
  trees: {
    'claude/feature-a': ['homunculus/inbox/019a.json', 'hoop/index.html'],
    'claude/feature-b': ['hoop/quests.js'],                       // clean
    'main': [],
  },
  files: {
    'claude/feature-a:homunculus/inbox/019a.json':
      JSON.stringify({ session: '019a', turns: [
        { role: 'me', ts: 't1', text: 'download the car' },
        { role: 'claude', ts: 't2', text: 'One request instead of five hundred.' },
      ] }),
  },
};
const fakeGit = (args) => {
  if (args[0] === 'ls-remote') return fakeRepo['ls-remote'];
  if (args[0] === 'ls-tree') {
    const branch = args[3].replace('origin/', '');
    const prefix = args[4];
    return (fakeRepo.trees[branch] ?? []).filter((f) => f.startsWith(prefix)).join('\n');
  }
  if (args[0] === 'show') return fakeRepo.files[args[1].replace('origin/', '')] ?? (() => { throw new Error('missing'); })();
  throw new Error('unexpected git ' + args.join(' '));
};

check('lists remote branches', remoteBranches(fakeGit).length, 3);
check('finds inbox on a branch', inboxOnBranch('claude/feature-a', fakeGit).length, 1);
check('clean branch has none', inboxOnBranch('claude/feature-b', fakeGit).length, 0);
const carrying = branchesWithInbox(fakeGit);
check('only carrying branches listed', carrying.length, 1);
check('names the right branch', carrying[0].branch, 'claude/feature-a');
const read = readInbox('claude/feature-a', fakeGit);
check('reads and parses inbox', read[0].data.session, '019a');

console.log('\ncollect flattening');
const crows = rowsFrom(read[0].data, '019a');
check('both turns flattened', crows.length, 2);
check('me → principal', crows[0].role, 'principal');
check('claude → assistant', crows[1].role, 'assistant');
check('counts words', crows[0].words, 3);
// prompts-only shape still works
check('messages shape', rowsFrom({ messages: [{ text: 'hi there friend' }] }, 'x')[0].role, 'principal');
check('bare array shape', rowsFrom(['just a string'], 'x')[0].text, 'just a string');

console.log(failures ? `\n${failures} failure(s)\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
