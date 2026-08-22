// workers/hose selftest — the ingest path, offline.
//
// Drives the real FirehoseIngest class against a fake Durable Object storage
// layer and synthetic Jetstream frames, so the parts that decide what ends up
// in someone's feed — matching, the chunked ring, the time window, and how many
// storage keys a flush actually touches — are checked without a Cloudflare
// runtime or a live firehose.
//
// The write-amplification tests are load-bearing rather than decorative: this
// object used to rewrite its entire buffer every flush, and nothing failed when
// it did. Only a test that counts keys catches that.

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
    _puts: [],        // every key written, in order
    _dels: [],        // every key deleted
    blockConcurrencyWhile(fn) { this._ready = fn(); },
    get storage() {
      const st = this;
      return {
        get: async (k) => store.get(k),
        put: async (a, b) => {
          if (typeof a === 'object' && a !== null) {
            for (const [k, v] of Object.entries(a)) { store.set(k, v); st._puts.push(k); }
          } else { store.set(a, b); st._puts.push(a); }
        },
        delete: async (k) => { for (const key of [].concat(k)) { store.delete(key); st._dels.push(key); } },
        list: async ({ prefix }) => {
          const m = new Map();
          for (const [k, v] of store) if (k.startsWith(prefix)) m.set(k, v);
          return m;
        },
        getAlarm: async () => 1,
        setAlarm: async () => {},
      };
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

async function mount(store, env = {}) {
  const state = fakeState(store);
  const o = new FirehoseIngest(state, env);
  await state._ready;
  const f = FirehoseIngest.blank();
  f.def = DEF; f.source = 'test'; f.fetchedAt = Date.now();
  o.feeds.set(FEED, f);
  o.lists.set('L', new Set(['did:plc:bot']));
  return { o, state, f };
}

const frame = (did, rkey, record, timeUs = 1) => JSON.stringify({
  did, time_us: timeUs, kind: 'commit',
  commit: { operation: 'create', collection: 'app.bsky.feed.post', rkey, record },
});
const text = (t, over = {}) => ({ text: t, langs: ['en'], createdAt: '2026-08-21T00:00:00Z', ...over });
const bufKeys = (state) => [...state._store.keys()].filter((k) => k.startsWith('buf:'));
const putBufKeys = (state) => state._puts.filter((k) => k.startsWith('buf:'));

console.log('ingest — what reaches the buffer');
{
  const { o, f } = await mount();
  o.onMessage(frame('did:plc:a', '1', text('an empty gate at dawn')));
  o.onMessage(frame('did:plc:a', '2', text('a video clip', { embed: { $type: 'app.bsky.embed.video', alt: 'clip' } })));
  o.onMessage(frame('did:plc:a', '3', text('a photo', { embed: { $type: 'app.bsky.embed.images', images: [{ alt: 'x' }] } })));
  o.onMessage(frame('did:plc:a', '4', text('talking about politics again')));
  o.onMessage(frame('did:plc:a', '5', text('uma frase', { langs: ['pt'] })));
  o.onMessage(frame('did:plc:a', '6', text('a reply', { reply: { root: {}, parent: {} } })));
  o.onMessage(frame('did:plc:bot', '7', text('beep boop hello')));
  o.onMessage(frame('did:plc:a', '8', text('onewordonly')));
  o.onMessage(frame('did:plc:a', '9', text('quiet runway lights')));

  eq('only the two clean text posts are kept', o.entries(f).map((e) => e.u.split('/').pop()), ['1', '9']);
  eq('every post was counted as seen', o.seen, 9);
  eq('matched counts only the kept ones', o.matched, 2);
}

console.log('ingest — frames that are not posts');
{
  const { o, f } = await mount();
  o.onMessage(JSON.stringify({ did: 'd', time_us: 5, kind: 'identity' }));
  o.onMessage(JSON.stringify({ did: 'd', time_us: 6, kind: 'commit', commit: { operation: 'delete', collection: 'app.bsky.feed.post', rkey: 'x' } }));
  o.onMessage(JSON.stringify({ did: 'd', time_us: 7, kind: 'commit', commit: { operation: 'create', collection: 'app.bsky.feed.like', rkey: 'x', record: {} } }));
  eq('non-post traffic is ignored', o.count(f), 0);
  eq('but the cursor still advances', o.lastTimeUs, 7);
}

console.log('ingest — a feed that does not take the firehose');
{
  const { o, f } = await mount();
  f.def = { ...DEF, inputs: [{ type: 'search', q: 'planes' }] };
  o.onMessage(frame('did:plc:a', '1', text('an empty gate at dawn')));
  eq('search feeds are left to b.mino.mobi', o.count(f), 0);
}

console.log('the chunked ring');
{
  const { o, f } = await mount();
  for (let i = 0; i < 2401; i++) o.append(f, { u: `at://d/app.bsky.feed.post/${i}`, t: 1000 + i });
  eq('chunk count is capped', f.chunks.size, 6);
  ok('entry count stays within one chunk of the target', o.count(f) > 2000 && o.count(f) <= 2400);
  eq('the oldest chunk was evicted, not renumbered', Math.min(...f.chunks.keys()), 1);
  eq('eviction is scheduled as a delete', [...f.gone], [0]);
  eq('the newest entry survives', o.entries(f).pop().u.split('/').pop(), '2400');
  eq('entries come back in append order', o.entries(f)[0].u.split('/').pop(), '400');
}

console.log('writes are incremental — the whole point of the rewrite');
{
  const { o, state, f } = await mount();
  for (let i = 0; i < 900; i++) o.append(f, { u: `at://d/app.bsky.feed.post/${i}`, t: 1000 + i });
  await o.flush();
  eq('first flush writes the three chunks it filled', putBufKeys(state).length, 3);
  eq('and they are keyed by absolute chunk index', bufKeys(state).sort().map((k) => k.split(':').pop()), ['000000', '000001', '000002']);

  state._puts.length = 0;
  o.append(f, { u: 'at://d/app.bsky.feed.post/new', t: 9999 });
  await o.flush();
  eq('appending one entry rewrites ONE key, not the whole buffer', putBufKeys(state).length, 1);
  eq('and it is the chunk that changed', putBufKeys(state)[0].split(':').pop(), '000002');

  // head is 901 here, and chunk 2 spans 800..1199 — so 200 more entries stay
  // inside the open chunk and one key is the right answer.
  state._puts.length = 0;
  for (let i = 0; i < 200; i++) o.append(f, { u: `at://d/app.bsky.feed.post/x${i}`, t: 20000 + i });
  await o.flush();
  eq('appends inside the open chunk still touch one key', putBufKeys(state).length, 1);

  // Now genuinely cross: head 1101 -> 1301 spans chunk 2 and opens chunk 3.
  state._puts.length = 0;
  for (let i = 0; i < 200; i++) o.append(f, { u: `at://d/app.bsky.feed.post/y${i}`, t: 30000 + i });
  await o.flush();
  eq('crossing a boundary touches exactly the two chunks involved',
    putBufKeys(state).sort().map((k) => k.split(':').pop()), ['000002', '000003']);

  state._puts.length = 0; state._dels.length = 0;
  await o.flush();
  eq('a flush with nothing new writes no buffer keys at all', putBufKeys(state).length, 0);
}

console.log('ageing out is a delete, not a rewrite');
{
  const { o, state, f } = await mount();
  for (let i = 0; i < 2400; i++) o.append(f, { u: `at://d/app.bsky.feed.post/${i}`, t: 1000 + i });
  await o.flush();
  state._puts.length = 0; state._dels.length = 0;
  o.append(f, { u: 'at://d/app.bsky.feed.post/tip', t: 99999 });   // opens chunk 6, evicts chunk 0
  await o.flush();
  eq('the evicted chunk is deleted', state._dels.filter((k) => k.startsWith('buf:')).length, 1);
  eq('and only the new chunk is written', putBufKeys(state).length, 1);
  ok('the deleted key is gone from storage', !bufKeys(state).includes('buf:' + FEED + ':000000'));
}

console.log('persistence — round trip through absolute chunk keys');
{
  const store = new Map();
  const { o, state, f } = await mount(store);
  for (let i = 0; i < 900; i++) o.append(f, { u: `at://d/app.bsky.feed.post/${i}`, t: 1000 + i });
  o.lastTimeUs = 42;
  await o.flush();
  ok('no chunk approaches the 128KB value limit', bufKeys(state).every((k) => JSON.stringify(store.get(k)).length < 100_000));

  const state2 = fakeState(store);
  const o2 = new FirehoseIngest(state2, {});
  await state2._ready;                 // exactly what the real runtime guarantees
  const f2 = o2.feeds.get(FEED);
  eq('every entry came back', o2.count(f2), 900);
  eq('in the same order', o2.entries(f2).map((e) => e.u), o.entries(f).map((e) => e.u));
  eq('head resumes at the right absolute position', f2.head, 900);
  eq('the cursor survived', o2.lastTimeUs, 42);

  // Appending after a reload must not collide with a key already on disk.
  state2._puts.length = 0;
  o2.append(f2, { u: 'at://d/app.bsky.feed.post/after', t: 5 });
  await o2.flush();
  eq('the append lands in the chunk that was still open', putBufKeys(state2), ['buf:' + FEED + ':000002']);
}

console.log('paging — newest first, inside the window');
{
  const { o, f } = await mount();
  const now = Date.now();
  o.append(f, { u: 'at://d/app.bsky.feed.post/old', t: now - 40 * 60 * 60 * 1000 });
  o.append(f, { u: 'at://d/app.bsky.feed.post/a', t: now - 3000 });
  o.append(f, { u: 'at://d/app.bsky.feed.post/b', t: now - 2000 });
  o.append(f, { u: 'at://d/app.bsky.feed.post/c', t: now - 1000 });
  eq('newest first', o.page(f, 0, 10).uris.map((u) => u.split('/').pop()), ['c', 'b', 'a']);
  eq('total excludes the stale entry', o.page(f, 0, 10).total, 3);
  eq('offset pages', o.page(f, 1, 1).uris.map((u) => u.split('/').pop()), ['b']);
  eq('offset past the end is empty, not an error', o.page(f, 99, 10).uris, []);
}

console.log('a filter edit invalidates what the old filters admitted');
{
  const { o, state, f } = await mount();
  for (let i = 0; i < 500; i++) o.append(f, { u: `at://d/app.bsky.feed.post/${i}`, t: 1000 + i });
  await o.flush();
  const headBefore = f.head;
  o.clearBuffer(f);
  eq('the buffer is cleared so the new rules actually apply', o.count(f), 0);
  eq('head does NOT reset — a reused chunk 0 would collide with the pending delete', f.head, headBefore);
  await o.flush();
  eq('every old chunk key was deleted from storage', bufKeys(state).length, 0);
  o.append(f, { u: 'at://d/app.bsky.feed.post/fresh', t: 1 });
  await o.flush();
  eq('the next append opens a chunk above the deleted ones', bufKeys(state), ['buf:' + FEED + ':000001']);
}

console.log('the duty cycle is configurable and clamped');
{
  const { o } = await mount(new Map(), {});
  eq('default sample window', o.sampleMs(), 20_000);
  eq('default interval', o.intervalMs(), 60 * 60_000);

  const { o: o2 } = await mount(new Map(), { SAMPLE_SECONDS: '5', SAMPLE_EVERY_MINUTES: '15' });
  eq('configured sample window', o2.sampleMs(), 5_000);
  eq('configured interval', o2.intervalMs(), 15 * 60_000);

  const { o: o3 } = await mount(new Map(), { SAMPLE_SECONDS: '9999', SAMPLE_EVERY_MINUTES: '0' });
  eq('an absurd sample window is clamped to a minute', o3.sampleMs(), 60_000);
  eq('a zero interval falls back to the default rather than hammering', o3.intervalMs(), 60 * 60_000);
  const { o: o3b } = await mount(new Map(), { SAMPLE_EVERY_MINUTES: '99999' });
  eq('an absurd interval is clamped to 6h', o3b.intervalMs(), 360 * 60_000);

  const { o: o4 } = await mount(new Map(), { SAMPLE_SECONDS: 'banana' });
  eq('garbage falls back to the default', o4.sampleMs(), 20_000);

  const { o: o5 } = await mount(new Map(), {});
  const delays = Array.from({ length: 200 }, () => o5.nextDelayMs());
  ok('jitter stays within 0.5x–1.5x of the interval',
    delays.every((d) => d >= 30 * 60_000 && d <= 90 * 60_000));
  ok('jitter actually varies', new Set(delays).size > 100);
}

console.log(failed ? `\nFAILED (${failed})` : '\nhose: all checks passed');
process.exit(failed ? 1 : 0);
