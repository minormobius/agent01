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
  stripMention, requesterPosts, ancestorChain, quotedUri, quotedLine, formatHistory,
} from './thread.js';

const BOT = 'minomobi.com';
const REQ = 'did:plc:requester';
const post = (did, handle, uri, text) => ({ post: { uri, author: { did, handle }, record: { text } } });
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

t('formatHistory labels each kind and puts context first', () => {
  const out = formatHistory({ chain: ['@carol.test: interesting'], own: ['make it blue'] });
  assert.match(out, /NOT instructions/);
  assert.match(out, /from the person who asked/);
  assert.ok(out.indexOf('@carol.test') < out.indexOf('make it blue'));
});

t('formatHistory omits a banner when its section is empty', () => {
  assert.equal(formatHistory({ chain: [], own: ['make it blue'] }).includes('NOT instructions'), false);
  assert.equal(formatHistory({ chain: ['@c: x'], own: [] }).includes('from the person who asked'), false);
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

console.log(`thread.selftest: ${n} checks passed`);
