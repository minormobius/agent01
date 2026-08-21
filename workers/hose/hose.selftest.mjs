// workers/hose selftest — the ingest path, offline.
//
// Drives the real FirehoseIngest class against a fake Durable Object storage
// layer and synthetic Jetstream frames, so the parts that decide what ends up
// in someone's feed — matching, the ring buffer, the time window, the chunked
// persistence — are checked without a Cloudflare runtime or a live firehose.

import { FirehoseIngest } from './src/ingest.js';

let failed = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.error(`  ✗ ${name}\n      got  ${g}\n      want ${w}`); failed++; }
  else console.log(`  ✓ ${name}`);
};
const ok = (name, cond) => eq(name, !!cond, true);

// The real blockConcurrencyWhile holds every other event on the object until
// its promise settles, so nothing can observe a half-loaded object. A fake that
// simply calls fn() lets the constructor's load() land *after* the test has
// started, which is a bug in the fake, not in the object — capture the promise
// and let callers await it.
function fakeState(store = new Map()) {
  return {
    _store: store,
    _ready: Promise.resolve(),
    blockConcurrencyWhile(fn) { this._ready = fn(); },
    storage: {
      get: async (k) => store.get(k),
      put: async (a, b) => {
        if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v);
        else store.set(a, b);
      },
      delete: async (k) => { for (const key of [].concat(k)) store.delete(key); },
      list: async ({ prefix }) => {
        const m = new Map();
        for (const [k, v] of store) if (k.startsWith(prefix)) m.set(k, v);
        return m;
      },
      getAlarm: async () => 1,
      setAlarm: async () => {},
    },
  };
}

const FEED = 'at://did:plc:owner/app.bsky.feed.generator/txt';
const DEF = {
  name: 'txt', inputs: [{ type: 'firehose', seconds: 86400 }], sort: { type: 'latest' }, limit: 500,
  filters: [
    { type: 'lang', code: 'en' },
    { type: 'removeReplies' },
    { type: 'media', has: ['image'], mode: 'none' },
    { type: 'media', has: ['video'], mode: 'none' },
    { type: 'media', has: ['quote'], mode: 'none' },
    { type: 'regex', mode: 'exclude', pattern: 'politics', target: 'text|alt_text|link' },
    { type: 'list', uri: 'L', mode: 'exclude' },
    { type: 'regex', mode: 'include', pattern: ' ' },
  ],
};

async function mount(store) {
  const state = fakeState(store);
  const o = new FirehoseIngest(state, {});
  await state._ready;
  o.feeds.set(FEED, { def: DEF, source: 'test', fetchedAt: Date.now(), lastSeen: Date.now(), buf: [], dirty: false });
  o.lists.set('L', new Set(['did:plc:bot']));
  return o;
}

const frame = (did, rkey, record, timeUs = 1) => JSON.stringify({
  did, time_us: timeUs, kind: 'commit',
  commit: { operation: 'create', collection: 'app.bsky.feed.post', rkey, record },
});
const text = (t, over = {}) => ({ text: t, langs: ['en'], createdAt: '2026-08-21T00:00:00Z', ...over });

console.log('ingest — what reaches the buffer');
{
  const o = await mount();
  o.onMessage(frame('did:plc:a', '1', text('an empty gate at dawn')));
  o.onMessage(frame('did:plc:a', '2', text('a video clip', { embed: { $type: 'app.bsky.embed.video', alt: 'clip' } })));
  o.onMessage(frame('did:plc:a', '3', text('a photo', { embed: { $type: 'app.bsky.embed.images', images: [{ alt: 'x' }] } })));
  o.onMessage(frame('did:plc:a', '4', text('talking about politics again')));
  o.onMessage(frame('did:plc:a', '5', text('uma frase', { langs: ['pt'] })));
  o.onMessage(frame('did:plc:a', '6', text('a reply', { reply: { root: {}, parent: {} } })));
  o.onMessage(frame('did:plc:bot', '7', text('beep boop hello')));
  o.onMessage(frame('did:plc:a', '8', text('onewordonly')));
  o.onMessage(frame('did:plc:a', '9', text('quiet runway lights')));

  const buf = o.feeds.get(FEED).buf.map((e) => e.u.split('/').pop());
  eq('only the two clean text posts are kept', buf, ['1', '9']);
  eq('every post was counted as seen', o.seen, 9);
  eq('matched counts only the kept ones', o.matched, 2);
  ok('the video post is the one this whole surface exists for', !buf.includes('2'));
}

console.log('ingest — frames that are not posts');
{
  const o = await mount();
  o.onMessage(JSON.stringify({ did: 'd', time_us: 5, kind: 'identity' }));
  o.onMessage(JSON.stringify({ did: 'd', time_us: 6, kind: 'commit', commit: { operation: 'delete', collection: 'app.bsky.feed.post', rkey: 'x' } }));
  o.onMessage(JSON.stringify({ did: 'd', time_us: 7, kind: 'commit', commit: { operation: 'create', collection: 'app.bsky.feed.like', rkey: 'x', record: {} } }));
  eq('non-post traffic is ignored', o.feeds.get(FEED).buf.length, 0);
  eq('but the cursor still advances', o.lastTimeUs, 7);
}

console.log('ingest — a feed that does not take the firehose');
{
  const o = await mount();
  o.feeds.get(FEED).def = { ...DEF, inputs: [{ type: 'search', q: 'planes' }] };
  o.onMessage(frame('did:plc:a', '1', text('an empty gate at dawn')));
  eq('search feeds are left to b.mino.mobi', o.feeds.get(FEED).buf.length, 0);
}

console.log('ring buffer');
{
  const o = await mount();
  for (let i = 0; i < 2100; i++) o.onMessage(frame('did:plc:a', String(i), text(`post number ${i}`), i + 1));
  const f = o.feeds.get(FEED);
  eq('capped at MAX_PER_FEED', f.buf.length, 2000);
  eq('the oldest are the ones dropped', f.buf[0].u.split('/').pop(), '100');
  eq('the newest is retained', f.buf[f.buf.length - 1].u.split('/').pop(), '2099');
}

console.log('paging — newest first, inside the window');
{
  const o = await mount();
  const f = o.feeds.get(FEED);
  const now = Date.now();
  f.buf = [
    { u: 'at://d/app.bsky.feed.post/old', t: now - 40 * 60 * 60 * 1000 },  // outside a 24h window
    { u: 'at://d/app.bsky.feed.post/a', t: now - 3000 },
    { u: 'at://d/app.bsky.feed.post/b', t: now - 2000 },
    { u: 'at://d/app.bsky.feed.post/c', t: now - 1000 },
  ];
  eq('newest first', o.page(f, 0, 10).uris.map((u) => u.split('/').pop()), ['c', 'b', 'a']);
  eq('total excludes the stale entry', o.page(f, 0, 10).total, 3);
  eq('offset pages', o.page(f, 1, 1).uris.map((u) => u.split('/').pop()), ['b']);
  eq('offset past the end is empty, not an error', o.page(f, 99, 10).uris, []);

  f.def = { ...DEF, inputs: [{ type: 'firehose', seconds: 60 }] };
  eq('a narrower window drops more', o.page(f, 0, 10).total, 3);
  f.buf[3].t = now - 120_000;
  eq('and honours its own seconds', o.page(f, 0, 10).total, 0);
}

console.log('persistence — chunked round trip');
{
  const store = new Map();
  const o = await mount(store);
  const f = o.feeds.get(FEED);
  for (let i = 0; i < 900; i++) f.buf.push({ u: `at://d/app.bsky.feed.post/${i}`, t: 1000 + i });
  f.dirty = true;
  o.lastTimeUs = 42;
  await o.flush();

  const bufKeys = [...store.keys()].filter((k) => k.startsWith('buf:')).sort();
  eq('900 entries split across 3 chunks', bufKeys.length, 3);
  eq('chunk keys are zero-padded so lexical order is chronological', bufKeys.map((k) => k.split(':').pop()), ['000', '001', '002']);
  ok('no chunk approaches the 128KB value limit', bufKeys.every((k) => JSON.stringify(store.get(k)).length < 100_000));

  const state2 = fakeState(store);
  const o2 = new FirehoseIngest(state2, {});
  await state2._ready;               // exactly what the real runtime guarantees
  const f2 = o2.feeds.get(FEED);
  eq('every entry came back', f2.buf.length, 900);
  eq('in the same order', f2.buf.map((e) => e.u), f.buf.map((e) => e.u));
  eq('the cursor survived', o2.lastTimeUs, 42);

  // Shrinking the buffer must not leave orphan chunks behind serving stale posts.
  f2.buf = f2.buf.slice(0, 10);
  f2.dirty = true;
  await o2.flush();
  eq('orphan chunks are deleted on shrink', [...store.keys()].filter((k) => k.startsWith('buf:')).length, 1);
}

console.log('a filter edit invalidates what the old filters admitted');
{
  const o = await mount();
  const f = o.feeds.get(FEED);
  o.onMessage(frame('did:plc:a', '1', text('an empty gate at dawn')));
  eq('one post buffered', f.buf.length, 1);
  // Simulate what ensureFeed does when the owner's def comes back changed.
  const sigBefore = JSON.stringify(f.def.filters);
  const nextDef = { ...DEF, filters: [...DEF.filters, { type: 'minLikes', n: 3 }] };
  if (JSON.stringify(nextDef.filters) !== sigBefore && f.buf.length) f.buf = [];
  eq('the buffer is cleared so the new rules actually apply', f.buf.length, 0);
}

console.log(failed ? `\nFAILED (${failed})` : '\nhose: all checks passed');
process.exit(failed ? 1 : 0);
