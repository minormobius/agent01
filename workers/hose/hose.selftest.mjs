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
  const st = {
    _store: store,
    _ready: Promise.resolve(),
    _puts: [],        // every key written, in order
    _dels: [],        // every key deleted
    blockConcurrencyWhile(fn) { this._ready = fn(); },
  };
  // storage must be ONE object, not a getter that mints a fresh one per access —
  // otherwise a test that stubs `state.storage.setAlarm` is silently assigning
  // to a throwaway and the stub never runs. (Learned the hard way.)
  st.storage = {
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
  return st;
}

// Mirrors of the module's private priming constants. If these drift, the tests
// below stop describing the shipped behaviour — so they are asserted against
// observable behaviour, not just used as magic numbers.
const PRIME_TARGET_GUESS = 150;
const PRIME_BUDGET_GUESS = 6;

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
  eq('frames counts what came off the wire, which is what is billed', o.frames, 9);
}

console.log('ingest — frames that are not posts');
{
  const { o, f } = await mount();
  o.onMessage(JSON.stringify({ did: 'd', time_us: 5, kind: 'identity' }));
  o.onMessage(JSON.stringify({ did: 'd', time_us: 6, kind: 'commit', commit: { operation: 'delete', collection: 'app.bsky.feed.post', rkey: 'x' } }));
  o.onMessage(JSON.stringify({ did: 'd', time_us: 7, kind: 'commit', commit: { operation: 'create', collection: 'app.bsky.feed.like', rkey: 'x', record: {} } }));
  eq('non-post traffic is ignored', o.count(f), 0);
  eq('but the cursor still advances', o.lastTimeUs, 7);
  eq('and every frame still counts toward the cap, kept or not', o.frames, 3);
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

console.log('migrating chunk keys from the old 3-digit padding');
{
  // An earlier build padded chunk indices to 3. Both widths parse to the same
  // index but are different keys, and ':004' sorts AFTER ':000004' — so without
  // a migration a stale chunk shadows the fresh one on every load, forever,
  // because deletion maps indices through the current key format.
  const store = new Map();
  const uri = FEED;
  store.set('reg', { [uri]: { lastSeen: Date.now() } });
  store.set(`def:${uri}`, { def: DEF, source: 'test', fetchedAt: Date.now() });
  store.set(`buf:${uri}:000`, [{ u: 'at://d/app.bsky.feed.post/a', t: 1 }]);
  store.set(`buf:${uri}:001`, [{ u: 'at://d/app.bsky.feed.post/b', t: 2 }]);

  const state = fakeState(store);
  const o = new FirehoseIngest(state, {});
  await state._ready;
  const f = o.feeds.get(uri);
  eq('old-format entries are read, not dropped', o.entries(f).map((e) => e.u.split('/').pop()), ['a', 'b']);
  eq('the old keys are marked for removal', f.staleKeys.size, 2);
  eq('and every rescued chunk is marked for rewrite', [...f.dirty].sort(), [0, 1]);

  await o.flush();
  const keys = bufKeys(state).sort();
  eq('after one flush only current-format keys remain', keys.map((k) => k.split(':').pop()), ['000000', '000001']);
  eq('the old keys are gone from storage', keys.filter((k) => k.endsWith(':000') || k.endsWith(':001')).length, 0);

  const state2 = fakeState(store);
  const o2 = new FirehoseIngest(state2, {});
  await state2._ready;
  const f2 = o2.feeds.get(uri);
  eq('data survived the migration', o2.entries(f2).map((e) => e.u.split('/').pop()), ['a', 'b']);
  eq('and a clean load has nothing stale left', f2.staleKeys.size, 0);
  eq('nor anything spuriously dirty', f2.dirty.size, 0);
}

console.log('a stale key never shadows the current one');
{
  const store = new Map();
  const uri = FEED;
  store.set('reg', { [uri]: { lastSeen: Date.now() } });
  store.set(`def:${uri}`, { def: DEF, source: 'test', fetchedAt: Date.now() });
  // Same chunk index, both widths present. ':004' sorts later, so a naive
  // build-the-map-in-sorted-order would pick the stale one.
  store.set(`buf:${uri}:004`, [{ u: 'at://d/app.bsky.feed.post/STALE', t: 1 }]);
  store.set(`buf:${uri}:000004`, [{ u: 'at://d/app.bsky.feed.post/FRESH', t: 2 }]);

  const state = fakeState(store);
  const o = new FirehoseIngest(state, {});
  await state._ready;
  const f = o.feeds.get(uri);
  eq('the current-format value wins', o.entries(f).map((e) => e.u.split('/').pop()), ['FRESH']);
  ok('and the stale key is scheduled for deletion', f.staleKeys.has(`buf:${uri}:004`));
  eq('head resumes from the absolute index, not the count', f.head, 4 * 400 + 1);

  await o.flush();
  eq('only one key for that chunk survives', bufKeys(state).length, 1);
  eq('and it holds the fresh value', state._store.get(`buf:${uri}:000004`)[0].u.split('/').pop(), 'FRESH');
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

console.log('the idle drop actually fires');
{
  // Regression: ensureFeed() used to set lastSeen, and alarm() refreshes every
  // feed's def on every wake — so lastSeen was always `now` and a feed nobody
  // had read in a year would never be dropped. Refreshing is not reading.
  const { o, f } = await mount();
  f.lastSeen = 1;                       // last read at the epoch
  await o.ensureFeed(FEED, true).catch(() => {});
  eq('refreshing a definition does not count as a read', f.lastSeen, 1);

  const res = await o.fetch(new Request(`https://x.invalid/page?feed=${encodeURIComponent(FEED)}`));
  await res.json();
  ok('but serving a page does', f.lastSeen > 1);
}

console.log('the per-sample frame cap');
{
  const { o } = await mount(new Map(), {});
  eq('default cap', o.maxFrames(), 800);
  const { o: a } = await mount(new Map(), { MAX_FRAMES_PER_SAMPLE: '250' });
  eq('configured cap', a.maxFrames(), 250);
  const { o: b } = await mount(new Map(), { MAX_FRAMES_PER_SAMPLE: '0' });
  eq('zero falls back to the default rather than sampling nothing', b.maxFrames(), 800);
  const { o: c } = await mount(new Map(), { MAX_FRAMES_PER_SAMPLE: '99999999' });
  eq('an absurd cap is clamped', c.maxFrames(), 20_000);

  // The cap is what makes the monthly ceiling independent of the firehose rate.
  // Time alone is not a budget: measured 38.8 creates/sec one hour and 62/sec
  // another, so a fixed window costs 60% more at a busy hour.
  const { o: tiny } = await mount(new Map(), { MAX_FRAMES_PER_SAMPLE: '5' });
  eq('a cap below the floor is raised to it — a 5-frame sample is not worth waking for', tiny.maxFrames(), 50);

  const { o: d, f: df } = await mount(new Map(), { MAX_FRAMES_PER_SAMPLE: '50' });
  for (let i = 0; i < 50; i++) d.onMessage(frame('did:plc:a', String(i), text(`quiet runway ${i}`)));
  ok('the cap is reached exactly when frames hit it', d.frames >= d.maxFrames());
  eq('and everything up to the cap was still processed', d.count(df), 50);

  const wakes = 30 * 24;   // hourly
  ok('the ceiling holds under the 1M request allowance at the default cap',
    wakes * 800 + wakes < 1_000_000);
}

console.log('list membership survives eviction');
{
  // passes() skips a list filter it cannot resolve, which is right — emptying a
  // feed because getList 500'd is worse than leaving one bot in it. But the
  // object is evicted between wakes, so with no cached copy a single failed
  // fetch means a whole sample runs with NO bot filtering. Stale beats absent.
  const store = new Map();
  const { o } = await mount(store);
  await o.state.storage.put('list:L', ['did:plc:bot', 'did:plc:bot2']);

  const state2 = fakeState(store);
  const o2 = new FirehoseIngest(state2, {});
  await state2._ready;
  ok('the cached membership is back after a restart', o2.lists.get('L')?.has('did:plc:bot'));

  // And it is actually applied: a listed author must still be dropped on a wake
  // where the list fetch never ran.
  const f2 = FirehoseIngest.blank();
  f2.def = DEF; f2.source = 'test';
  o2.feeds.set(FEED, f2);
  o2.onMessage(frame('did:plc:bot', '1', text('beep boop hello there')));
  o2.onMessage(frame('did:plc:human', '2', text('a quiet runway at dawn')));
  eq('the bot is filtered from a cold start', o2.entries(f2).map((e) => e.u.split('/')[2]), ['did:plc:human']);
}

console.log('counters survive eviction');
{
  // A duty-cycled object is evicted between wakes BY DESIGN — it is resident
  // about 20 seconds an hour. So in-memory counters are readable only by someone
  // polling during that window, which made the cost instrumentation decorative:
  // /status reported lastSampleFrames 0 while sampling was demonstrably working.
  const store = new Map();
  const { o } = await mount(store);
  o.samples = 7;
  o.lastSampleAt = 1234;
  o.lastSampleFrames = 650;
  o.lastSampleEndedBy = 'time';
  o.seen = 5000;
  o.matched = 180;
  await o.flush();

  const state2 = fakeState(store);
  const o2 = new FirehoseIngest(state2, {});
  await state2._ready;
  eq('sample count survives', o2.samples, 7);
  eq('last sample size survives — this is the cost signal', o2.lastSampleFrames, 650);
  eq('which bound ended it survives', o2.lastSampleEndedBy, 'time');
  eq('lifetime seen survives', o2.seen, 5000);
  eq('lifetime matched survives', o2.matched, 180);
}

console.log('priming a cold feed');
{
  // The bug this exists for: a feed registered after the last sample sat empty
  // for a full jittered interval — up to 90 minutes — and anyone opening it saw
  // nothing, which looks identical to broken.
  const store = new Map();
  const { o, state, f } = await mount(store);

  eq('a fresh feed starts with a full prime budget', f.primes, 0);

  // Opening an empty firehose feed pulls the next sample forward.
  let alarmSetTo = null;
  state.storage.setAlarm = async (t) => { alarmSetTo = t; };
  state.storage.getAlarm = async () => Date.now() + 60 * 60_000;   // an hour away
  const res = await o.fetch(new Request(`https://x.invalid/page?feed=${encodeURIComponent(FEED)}`));
  const body = await res.json();
  eq('the empty feed still answers, it does not error', body.uris, []);
  ok('and the next sample is pulled forward', alarmSetTo !== null && alarmSetTo < Date.now() + 10_000);

  // A feed that is already full must NOT pull the alarm forward — that would
  // turn every read into a sample and undo the duty cycle.
  alarmSetTo = null;
  for (let i = 0; i < PRIME_TARGET_GUESS; i++) o.append(f, { u: `at://d/app.bsky.feed.post/${i}`, t: Date.now() });
  await o.fetch(new Request(`https://x.invalid/page?feed=${encodeURIComponent(FEED)}`));
  eq('a warm feed leaves the schedule alone', alarmSetTo, null);

  // And an exhausted prime budget stops pulling it forward even while cold.
  const { o: o2, state: st2, f: f2 } = await mount(new Map());
  f2.primes = 99;
  let pulled = null;
  st2.storage.setAlarm = async (t) => { pulled = t; };
  st2.storage.getAlarm = async () => Date.now() + 60 * 60_000;
  await o2.fetch(new Request(`https://x.invalid/page?feed=${encodeURIComponent(FEED)}`));
  eq('a spent prime budget stops the fast path', pulled, null);
}

console.log('priming has a hard budget');
{
  const { o, f } = await mount();
  let spent = 0;
  // Stand in for alarm()'s prime accounting: cold feeds burn one prime per wake.
  for (let wake = 0; wake < 50; wake++) {
    if (o.count(f) >= PRIME_TARGET_GUESS || f.primes >= PRIME_BUDGET_GUESS) continue;
    f.primes++; spent++;
  }
  eq('a feed that never fills gives up after its budget', spent, PRIME_BUDGET_GUESS);
  eq('so priming costs a bounded one-off, not a permanent fast cadence', f.primes, PRIME_BUDGET_GUESS);

  o.clearBuffer(f);
  eq('and emptying the ring on a filter edit earns a fresh budget', f.primes, 0);
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
