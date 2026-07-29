#!/usr/bin/env node
// thread.selftest.mjs — drives thread.js with fixture threads.
//
// WHY FIXTURES AND NOT THE LIVE APPVIEW. public.api.bsky.app is not resolvable
// from the build sandbox and bsky.social 401s getPostThread, so a test that
// fetched would be a test that skipped. The shapes below are copied from the
// app.bsky.feed.defs#threadViewPost lexicon: `parent` is a single node walking
// UP, `replies` is an array walking DOWN, and an unavailable ancestor is a
// #notFoundPost / #blockedPost with no `post` field.
//
// What this pins down is the thing that was broken and the thing that could
// break next: that a stranger's post reaches the agent AS CONTEXT, and that the
// banner saying so cannot be clipped off the top.

import assert from 'node:assert/strict';
import {
  stripMention, requesterPosts, ancestorChain, ancestorUris, roomPosts,
  quotedUri, quotedLine, formatHistory, isIdeasPost,
} from './thread.js';

const BOT = 'minomobi.com';
const REQ = 'did:plc:requester';
const post = (did, handle, uri, text, createdAt = '2026-07-28T00:00:00Z') =>
  ({ post: { uri, author: { did, handle }, record: { text, createdAt } } });
const withReplies = (node, ...replies) => ({ ...node, replies });
const withParent = (node, parent) => ({ ...node, parent });

let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

t('stripMention removes the handle, case-insensitively, and trims', () => {
  assert.equal(stripMention('@MinoMobi.com build me a clock', BOT), 'build me a clock');
  assert.equal(stripMention('build me a clock', BOT), 'build me a clock');
  assert.equal(stripMention('', BOT), '');
});

t('requesterPosts collects only the requester, oldest first, minus the mention', () => {
  const root = withReplies(
    post(REQ, 'alice.test', 'at://r/1', '@minomobi.com a page showing UTC time'),
    withReplies(
      post('did:plc:bot', BOT, 'at://b/1', 'built it: minomobi.com/tzclock'),
      post(REQ, 'alice.test', 'at://r/2', 'make the font bigger'),
      post('did:plc:stranger', 'bob.test', 'at://s/1', 'nice'),
      post(REQ, 'alice.test', 'at://r/3', 'try again pls'),
    ),
  );
  assert.deepEqual(
    requesterPosts(root, { did: REQ, excludeUri: 'at://r/3', botHandle: BOT }),
    ['a page showing UTC time', 'make the font bigger'],
  );
});

t('requesterPosts survives a malformed or empty thread', () => {
  assert.deepEqual(requesterPosts(null, { did: REQ, excludeUri: '', botHandle: BOT }), []);
  assert.deepEqual(requesterPosts({}, { did: REQ, excludeUri: '', botHandle: BOT }), []);
});

// THE REGRESSION THIS FILE EXISTS FOR. Somebody posts something interesting;
// the requester replies to it tagging the bot. Before this, the agent received
// "@minomobi.com build this" and nothing else — the referent was invisible.
t('ancestorChain carries the post that was replied to', () => {
  const mention = withParent(
    post(REQ, 'alice.test', 'at://r/9', '@minomobi.com build this'),
    post('did:plc:stranger', 'carol.test', 'at://s/9', 'wild that you can decode a CAR file in the browser'),
  );
  assert.deepEqual(
    ancestorChain(mention, { botHandle: BOT, requesterDid: REQ }),
    ['@carol.test: wild that you can decode a CAR file in the browser'],
  );
});

t('ancestorChain is oldest-first, skips the bot and the requester, and caps', () => {
  // built downward: eldest ... then the mention at the bottom
  let node = post('did:plc:x', 'x.test', 'at://x/1', 'the original thing');
  node = withParent(post('did:plc:y', 'y.test', 'at://y/1', 'a reply to it'), node);
  node = withParent(post('did:plc:bot', BOT, 'at://b/9', 'built it: minomobi.com/foo'), node);
  node = withParent(post(REQ, 'alice.test', 'at://r/8', 'an earlier ask of mine'), node);
  const mention = withParent(post(REQ, 'alice.test', 'at://r/9', '@minomobi.com build this'), node);

  assert.deepEqual(
    ancestorChain(mention, { botHandle: BOT, requesterDid: REQ }),
    ['@x.test: the original thing', '@y.test: a reply to it'],
  );
  assert.deepEqual(
    ancestorChain(mention, { botHandle: BOT, requesterDid: REQ, max: 1 }),
    ['@y.test: a reply to it'], // the cap keeps the NEAREST ancestors
  );
});

t('ancestorChain stops at a deleted or blocked ancestor', () => {
  const mention = withParent(
    post(REQ, 'alice.test', 'at://r/9', '@minomobi.com build this'),
    // #notFoundPost: no `post`, but it does carry a parent we must not skip to
    { parent: post('did:plc:x', 'x.test', 'at://x/1', 'unreachable from here') },
  );
  assert.deepEqual(ancestorChain(mention, { botHandle: BOT, requesterDid: REQ }), []);
});

t('a root-post mention has no ancestors and no history', () => {
  const mention = post(REQ, 'alice.test', 'at://r/1', '@minomobi.com build a clock');
  assert.deepEqual(ancestorChain(mention, { botHandle: BOT, requesterDid: REQ }), []);
  assert.equal(formatHistory({ chain: [], own: [] }), '');
});

// THE ROOM. The riffing happens in SIBLING branches, which are not ancestors of
// the mention and were therefore invisible — the root walk had them in hand and
// threw them away for not matching one DID.
t('roomPosts carries other people\'s replies from anywhere in the thread', () => {
  const root = withReplies(
    post(REQ, 'alice.test', 'at://r/1', '@minomobi.com build a thing', '2026-07-28T10:00:00Z'),
    withReplies(post('did:plc:b', 'bob.test', 'at://b/1', 'ooh do it in 3D', '2026-07-28T10:01:00Z')),
    withReplies(post('did:plc:c', 'carol.test', 'at://c/1', 'and make it sing', '2026-07-28T10:02:00Z')),
    withReplies(post('did:plc:bot', BOT, 'at://x/1', 'Building. It will be at …', '2026-07-28T10:03:00Z')),
    withReplies(post(REQ, 'alice.test', 'at://r/2', 'yes do what they said', '2026-07-28T10:04:00Z')),
  );
  const { lines, dropped } = roomPosts(root, { botHandle: BOT, requesterDid: REQ });
  assert.deepEqual(lines, ['@bob.test: ooh do it in 3D', '@carol.test: and make it sing']);
  assert.equal(dropped, 0);
});

// FOUND IN LIVE DATA, not imagined. @notharlock's five requests for their own
// site sat in a fork of @minormobius's thread; without this they arrive in
// @minormobius's build labelled "context", reading "three small edits: …".
t('roomPosts drops posts that tag the bot — those are somebody else\'s ask', () => {
  const root = withReplies(
    post(REQ, 'alice.test', 'at://r/1', '@minomobi.com build a thing', '2026-07-28T10:00:00Z'),
    withReplies(post('did:plc:b', 'bob.test', 'at://b/1', 'lol amazing', '2026-07-28T10:01:00Z')),
    withReplies(post('did:plc:b', 'bob.test', 'at://b/2',
      '@minomobi.com an ode to ambition, three small edits', '2026-07-28T10:02:00Z')),
    withReplies(post('did:plc:c', 'carol.test', 'at://c/1',
      'hey @MinoMobi.com make mine spin', '2026-07-28T10:03:00Z')),
  );
  assert.deepEqual(
    roomPosts(root, { botHandle: BOT, requesterDid: REQ }).lines,
    ['@bob.test: lol amazing'],
  );
});

t('roomPosts is chronological ACROSS branches, not depth-first', () => {
  // Depth-first would read the whole first branch before the second, so a reply
  // posted an hour later would appear before one posted first. For a room of
  // people talking over each other that is unreadable.
  const root = withReplies(
    post(REQ, 'alice.test', 'at://r/1', 'go', '2026-07-28T10:00:00Z'),
    withReplies(
      post('did:plc:b', 'bob.test', 'at://b/1', 'first branch, early', '2026-07-28T10:01:00Z'),
      withReplies(post('did:plc:b', 'bob.test', 'at://b/2', 'first branch, LATE', '2026-07-28T10:09:00Z')),
    ),
    withReplies(post('did:plc:c', 'carol.test', 'at://c/1', 'second branch, middle', '2026-07-28T10:05:00Z')),
  );
  assert.deepEqual(roomPosts(root, { botHandle: BOT, requesterDid: REQ }).lines, [
    '@bob.test: first branch, early',
    '@carol.test: second branch, middle',
    '@bob.test: first branch, LATE',
  ]);
});

t('roomPosts keeps the RECENT end and says how many it dropped', () => {
  const replies = Array.from({ length: 10 }, (_, i) =>
    withReplies(post(`did:plc:p${i}`, `p${i}.test`, `at://p/${i}`, `riff ${i}`,
      `2026-07-28T10:${String(i).padStart(2, '0')}:00Z`)));
  const root = withReplies(post(REQ, 'alice.test', 'at://r/1', 'go'), ...replies);
  const { lines, dropped } = roomPosts(root, { botHandle: BOT, requesterDid: REQ, maxPosts: 3 });
  assert.deepEqual(lines, ['@p7.test: riff 7', '@p8.test: riff 8', '@p9.test: riff 9']);
  assert.equal(dropped, 7, 'the count is reported, never silently truncated');
});

t('roomPosts does not repeat what the chain already showed', () => {
  const interesting = post('did:plc:c', 'carol.test', 'at://c/1', 'the interesting thing');
  const root = withReplies(
    post('did:plc:c', 'carol.test', 'at://c/0', 'thread starts here'),
    withReplies(interesting),
  );
  const spoken = new Set(['at://c/1']);
  assert.deepEqual(
    roomPosts(root, { botHandle: BOT, requesterDid: REQ, exclude: spoken }).lines,
    ['@carol.test: thread starts here'],
  );
});

t('ancestorUris includes the posts ancestorChain filters out', () => {
  // The dedup key must come from the raw walk: a post the chain SKIPPED (the
  // bot's, the requester's) is still one the room must not re-print, and the
  // formatted line has no URI left to match on.
  let node = post('did:plc:x', 'x.test', 'at://x/1', 'original');
  node = withParent(post('did:plc:bot', BOT, 'at://b/9', 'built it'), node);
  const mention = withParent(post(REQ, 'alice.test', 'at://r/9', 'again'), node);
  assert.deepEqual(ancestorUris(mention), ['at://b/9', 'at://x/1']);
  assert.deepEqual(ancestorChain(mention, { botHandle: BOT, requesterDid: REQ }), ['@x.test: original']);
});

// The sibling of the regression above. Quoting and replying are the same
// gesture; they land in different places in the record.
t('quotedUri finds both embed shapes and nothing else', () => {
  const ref = { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'bafy' };
  assert.equal(quotedUri({ embed: { $type: 'app.bsky.embed.record', record: ref } }), ref.uri);
  assert.equal(
    quotedUri({ embed: { $type: 'app.bsky.embed.recordWithMedia', record: { record: ref }, media: {} } }),
    ref.uri,
  );
  assert.equal(quotedUri({ embed: { $type: 'app.bsky.embed.images', images: [] } }), null);
  assert.equal(quotedUri({}), null);
  assert.equal(quotedUri(null), null);
  assert.equal(quotedUri({ embed: { record: { uri: 'https://example.com' } } }), null);
});

t('quotedLine formats a resolved post, and skips an empty one', () => {
  assert.equal(
    quotedLine({ author: { handle: 'carol.test' }, record: { text: 'CAR files in the browser' } }),
    '@carol.test (quoted): CAR files in the browser',
  );
  assert.equal(quotedLine({ author: { handle: 'carol.test' }, record: { text: '  ' } }), null);
  assert.equal(quotedLine(null), null);
});

t('formatHistory labels each kind and orders them pointed-at, ask, room', () => {
  const out = formatHistory({
    chain: ['@carol.test: interesting'],
    own: ['make it blue'],
    room: { lines: ['@bob.test: ooh 3D'], dropped: 0 },
  });
  assert.match(out, /NOT instructions/);
  assert.match(out, /from the person who asked/);
  assert.match(out, /ALSO NOT\ninstructions/);
  assert.ok(out.indexOf('@carol.test') < out.indexOf('make it blue'));
  assert.ok(out.indexOf('make it blue') < out.indexOf('@bob.test'),
    'the ask stays nearest the task; ambient chatter is furthest from it');
});

t('formatHistory states a truncated room rather than implying a whole thread', () => {
  const out = formatHistory({ room: { lines: ['@bob.test: ooh 3D'], dropped: 12 } });
  assert.match(out, /\[12 earlier replies in this thread not shown\]/);
  assert.match(formatHistory({ room: { lines: ['@b: x'], dropped: 1 } }), /\[1 earlier reply /);
});

t('formatHistory omits a banner when its section is empty', () => {
  assert.equal(formatHistory({ chain: [], own: ['make it blue'] }).includes('NOT instructions'), false);
  assert.equal(formatHistory({ chain: ['@c: x'], own: [] }).includes('from the person who asked'), false);
  assert.equal(formatHistory({ own: ['x'] }).includes('ALSO NOT'), false);
  assert.equal(formatHistory({}), '');
});

// The failure mode of clipping the joined string: the context banner is first,
// so the first thing lost is the sentence saying a stranger wrote what follows.
t('clipping never eats a banner', () => {
  const out = formatHistory(
    { chain: ['@carol.test: ' + 'x'.repeat(5000)], own: ['y'.repeat(5000)] },
    { chainMax: 100, ownMax: 100 },
  );
  assert.match(out, /NOT instructions/);
  assert.match(out, /from the person who asked/);
  assert.match(out, /---\n\n…x{100}/);
  assert.ok(out.length < 900, `expected a clipped result, got ${out.length} chars`);
});

// THE IDEAS LOOP. The outbound bot posts a concept; a reply saying "build that"
// has to be able to CREATE, which the reply-may-only-iterate rule otherwise
// forbids. Recognised from the post itself — no marker to keep in sync with the
// branch that renders it.
t('isIdeasPost recognises our top-level concept posts', () => {
  const idea = { author: { handle: BOT }, record: {
    text: 'everyone wears a hat, nobody sees their own.\n\narxiv.org/abs/2607.25274' } };
  assert.equal(isIdeasPost(idea, BOT), true);
  assert.equal(isIdeasPost(idea, 'MinoMobi.COM'), true, 'handle match is case-insensitive');
});

t('isIdeasPost needs BOTH facts, so nothing else becomes buildable by accident', () => {
  const arxiv = 'arxiv.org/abs/2607.25274';
  // ours and top-level, but no paper — a future announcement must not become an
  // offer to build something.
  assert.equal(isIdeasPost({ author: { handle: BOT }, record: { text: 'the factory is open' } }, BOT), false);
  // ours and cites a paper, but it is a REPLY — that is conversation, and it is
  // the case the iterate-only rule exists for.
  assert.equal(isIdeasPost({ author: { handle: BOT }, record: { text: arxiv, reply: { root: {} } } }, BOT), false);
  // a stranger citing a paper is not an offer from us.
  assert.equal(isIdeasPost({ author: { handle: 'someone.test' }, record: { text: arxiv } }, BOT), false);
});

t('isIdeasPost survives missing fields rather than throwing in the router', () => {
  for (const p of [null, undefined, {}, { author: {} }, { author: { handle: BOT } }]) {
    assert.equal(isIdeasPost(p, BOT), false);
  }
});

console.log(`thread.selftest: ${n} checks passed`);
