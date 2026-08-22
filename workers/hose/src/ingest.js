// FirehoseIngest — one Durable Object, one Jetstream connection, N feeds.
//
// The thing SkyFeed had that a stateless evaluator cannot fake: a feed whose
// filters are almost entirely *negative* ("not politics, not porn, not video,
// not a reply, not in this bot list") has no query you can ask the AppView for.
// There is no search term for "everything else". You have to see posts and
// subtract, which means reading the firehose and deciding at ingest time.
//
// ── It SAMPLES the firehose; it does not drink all of it ─────────────────────
//
// The first version held the socket open permanently. Measured, that is 38.8
// post-creates/second — 100M messages a month — and a Durable Object that is
// never evicted, which alone consumes ~84% of the account's entire 400,000
// GB-s duration allowance. For an ambient feed that nobody reads exhaustively,
// paying to observe every post on Bluesky is a bad trade.
//
// So the object sleeps. Every SAMPLE_EVERY_MINUTES it wakes, opens Jetstream
// for SAMPLE_SECONDS, keeps what matches, writes, and closes. At the default
// 20s/hour that is 4 hours of connection a month instead of 720, and it lands
// inside the free allowances even under the least favourable reading of how
// inbound WebSocket frames are billed.
//
// What you give up is completeness, deliberately: the feed sees roughly 0.5% of
// the network and still collects ~680 matching posts a day, which is more than
// anyone scrolls. A feed like this is a mood, not an index. If you ever DO need
// completeness, raise SAMPLE_SECONDS and read the arithmetic in CLAUDE.md
// first — the request allowance is the binding constraint, not duration.
//
// ── Writes are incremental ───────────────────────────────────────────────────
//
// The ring is chunked by an ABSOLUTE, monotonic chunk index rather than by
// position in a flat array. That is the whole trick: appending touches exactly
// one storage key, and ageing out a chunk is a delete, not a rewrite. A flat
// array trimmed from the front renumbers every element, so every chunk becomes
// dirty and the whole buffer is rewritten on each flush — which is what this
// used to do, 5 keys every 30 seconds, and which would have been 305 keys every
// 30 seconds had the window ever been widened to a real 24 hours.

import { fromCommit, passes, listUris, MATCHER_VERSION } from '../../../packages/feedgen/match.js';
import { fromSkyfeed } from '../../../packages/feedgen/skyfeed.js';
import { getFeedDef, getListMembers } from './resolve.js';

const JETSTREAM_HOSTS = [
  'jetstream2.us-east.bsky.network',
  'jetstream1.us-east.bsky.network',
  'jetstream2.us-west.bsky.network',
  'jetstream1.us-west.bsky.network',
];

const MAX_PER_FEED = 2000;    // ring capacity; a reader never pages this deep
const CHUNK = 400;            // entries per storage key — keeps values far under the 128KB limit
const IDLE_DROP_MS = 7 * 24 * 60 * 60_000;   // a feed nobody opens in a week stops being ingested
const DEFAULT_SAMPLE_SECONDS = 20;
const DEFAULT_SAMPLE_EVERY_MINUTES = 60;
// A HARD ceiling on frames per sample, independent of how busy Bluesky is.
// Time alone is not a budget: the post firehose measured 38.8 creates/sec at
// one hour and 62/sec at another, so a fixed 20s window silently costs 60% more
// at a busy hour. Whichever bound trips first ends the sample, which means the
// monthly request total has a ceiling that does not depend on any rate estimate
// of mine being right.
const DEFAULT_MAX_FRAMES = 800;

// PRIMING. A newly registered feed has an empty ring and would otherwise wait a
// full jittered interval — up to 90 minutes — for its first content, then show
// one sample's worth. That is an empty feed to anyone who opens it, which is
// indistinguishable from a broken one.
//
// So while a firehose feed is below PRIME_TARGET entries, the object wakes every
// minute instead of every hour, for at most PRIME_SAMPLES wakes. The cap is what
// keeps it honest: a feed whose filters genuinely match almost nothing gives up
// after six tries rather than sampling every minute forever. Whole-lifetime cost
// of priming one feed is PRIME_SAMPLES x MAX_FRAMES ~ 4,800 frames, one-off.
//
// The counter is persisted and reset by clearBuffer(), so editing a feed's
// filters re-primes it — the case where the ring was just emptied on purpose.
const PRIME_TARGET = 150;
const PRIME_SAMPLES = 6;
const PRIME_INTERVAL_MS = 60_000;
// An alarm this far overdue is not pending, it is stuck. See fetch().
const STUCK_ALARM_MS = 5 * 60_000;
// Lists are cached in storage as well as memory. passes() skips a list filter
// whose members it could not resolve — the right call, since silently emptying
// a feed because getList 500'd is worse than briefly leaving a bot in it. But
// the object is evicted between wakes, so without a cached copy a single failed
// fetch means that sample runs with NO bot filtering at all. A stale membership
// list is a far better fallback than none.
// Capped because a DO storage value tops out at 128KB; a larger list still
// works, it just re-fetches every wake as before.
const LIST_PERSIST_MAX = 3000;

const nowMs = () => Date.now();
const chunkKey = (uri, i) => `buf:${uri}:${String(i).padStart(6, '0')}`;
const maxChunks = () => Math.ceil(MAX_PER_FEED / CHUNK) + 1;

export class FirehoseIngest {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.feeds = new Map();      // feedUri -> { def, source, fetchedAt, lastSeen, chunks:Map, head, dirty:Set, gone:Set }
    this.lists = new Map();      // listUri -> Set<did>
    this.ws = null;
    this.lastTimeUs = 0;
    this.seen = 0;
    this.matched = 0;
    this.samples = 0;
    this.lastSampleAt = 0;
    this.frames = 0;            // frames in the CURRENT sample — what billing counts
    this.lastSampleFrames = 0;
    this.lastSampleEndedBy = null;
    this.lastError = null;
    this.state.blockConcurrencyWhile(async () => { await this.load(); });
  }

  sampleMs() {
    const n = Number(this.env.SAMPLE_SECONDS);
    return Math.min(60, Math.max(2, Number.isFinite(n) && n > 0 ? n : DEFAULT_SAMPLE_SECONDS)) * 1000;
  }

  intervalMs() {
    const n = Number(this.env.SAMPLE_EVERY_MINUTES);
    return Math.min(360, Math.max(1, Number.isFinite(n) && n > 0 ? n : DEFAULT_SAMPLE_EVERY_MINUTES)) * 60_000;
  }

  maxFrames() {
    const n = Number(this.env.MAX_FRAMES_PER_SAMPLE);
    return Math.min(20_000, Math.max(50, Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_FRAMES));
  }

  // Jittered, so the feed is not permanently a portrait of whatever the network
  // is doing at one fixed offset past the hour. Averages the configured
  // interval over 0.5x–1.5x.
  nextDelayMs() { return Math.round(this.intervalMs() * (0.5 + Math.random())); }

  // ── the chunked ring ───────────────────────────────────────────────────────

  static blank() {
    return { def: null, source: 'pending', fetchedAt: 0, lastSeen: nowMs(),
             chunks: new Map(), head: 0, dirty: new Set(),
             gone: new Set(),      // chunk INDICES to delete (mapped through chunkKey)
             staleKeys: new Set(), // raw key strings to delete — see the migration in load()
             primes: 0,            // consecutive fast wakes spent filling this feed
             warnings: [] };
  }

  append(f, entry) {
    const ci = Math.floor(f.head / CHUNK);
    let c = f.chunks.get(ci);
    if (!c) { c = []; f.chunks.set(ci, c); }
    c.push(entry);
    f.head++;
    f.dirty.add(ci);
    while (f.chunks.size > maxChunks()) {
      const oldest = Math.min(...f.chunks.keys());
      f.chunks.delete(oldest);
      f.dirty.delete(oldest);
      f.gone.add(oldest);       // a delete, not a rewrite
    }
  }

  entries(f) {
    const out = [];
    for (const i of [...f.chunks.keys()].sort((a, b) => a - b)) out.push(...f.chunks.get(i));
    return out;
  }

  count(f) {
    let n = 0;
    for (const c of f.chunks.values()) n += c.length;
    return n;
  }

  clearBuffer(f) {
    for (const i of f.chunks.keys()) f.gone.add(i);
    f.chunks.clear();
    f.dirty.clear();
    f.primes = 0;   // an emptied ring earns a fresh prime budget
    // head is deliberately NOT reset: chunk indices must stay monotonic, or a
    // new chunk 0 would collide with the key we just scheduled for deletion.
  }

  // ── persistence ────────────────────────────────────────────────────────────

  async load() {
    const reg = (await this.state.storage.get('reg')) || {};
    for (const [uri, meta] of Object.entries(reg)) {
      const stored = (await this.state.storage.get(`def:${uri}`)) || null;
      const f = FirehoseIngest.blank();
      f.def = stored && stored.def;
      f.source = (stored && stored.source) || 'unknown';
      f.fetchedAt = (stored && stored.fetchedAt) || 0;
      f.lastSeen = meta.lastSeen || 0;
      f.primes = meta.primes || 0;

      // Chunk keys are `buf:<feed>:<index padded to 6>`. An earlier build padded
      // to 3, and both parse to the same index while being DIFFERENT keys — so a
      // stale `:004` would shadow a fresh `:000004` on every load (it sorts
      // later) and could never be deleted, since deletion maps indices through
      // chunkKey(). Read any width, prefer the current one, and schedule the
      // rest for removal.
      const listed = await this.state.storage.list({ prefix: `buf:${uri}:` });
      const chosen = new Map();   // chunkIdx -> { entries, current }
      for (const key of listed.keys()) {
        const suffix = key.slice(key.lastIndexOf(':') + 1);
        const ci = parseInt(suffix, 10);
        if (!Number.isFinite(ci)) { f.staleKeys.add(key); continue; }
        const current = suffix.length === 6;
        if (!current) f.staleKeys.add(key);
        const prev = chosen.get(ci);
        if (!prev || (current && !prev.current)) chosen.set(ci, { entries: listed.get(key) || [], current });
      }
      for (const ci of [...chosen.keys()].sort((a, b) => a - b)) f.chunks.set(ci, chosen.get(ci).entries);
      // Anything rescued from an old-format key has to be rewritten under the
      // current one, or the next flush would leave it only in the doomed key.
      if (f.staleKeys.size) for (const ci of f.chunks.keys()) f.dirty.add(ci);
      // An older config may have left more chunks than we now retain.
      while (f.chunks.size > maxChunks()) {
        const oldest = Math.min(...f.chunks.keys());
        f.chunks.delete(oldest);
        f.gone.add(oldest);
      }
      const idx = [...f.chunks.keys()];
      f.head = idx.length ? Math.max(...idx) * CHUNK + f.chunks.get(Math.max(...idx)).length : 0;

      // INVARIANT REPAIR: an empty ring with a spent prime budget is a state the
      // code cannot reach. The budget is only spent while filling, and the two
      // things that empty a ring — clearBuffer() on a filter edit, and the
      // MATCHER_VERSION purge — both reset it. Seeing the pair means a reset was
      // lost, which is exactly what happened when the purge reset `primes` in
      // memory and nothing wrote it. Left alone the feed is stranded: empty,
      // with no budget to refill, and only the hourly cadence to dig out with.
      if (f.chunks.size === 0 && f.primes > 0) f.primes = 0;

      this.feeds.set(uri, f);
    }
    // A buffer is only meaningful under the rules that filled it. clearBuffer()
    // already handles a filter EDIT, but a matcher bug fix changes what passes
    // without touching any feed's filters — so nothing noticed, and posts the
    // old code should never have admitted stayed served after the fix shipped.
    // Purging here is the only way a code change can reach an existing ring.
    const storedVersion = await this.state.storage.get('matcherVersion');
    if (storedVersion !== MATCHER_VERSION) {
      for (const [uri, f] of this.feeds) {
        const listed = await this.state.storage.list({ prefix: `buf:${uri}:` });
        if (listed.size) await this.state.storage.delete([...listed.keys()]);
        f.chunks.clear(); f.dirty.clear(); f.gone.clear(); f.staleKeys.clear();
        f.primes = 0;   // and re-prime, so the purged feed refills in minutes
      }
      // The buffer deletes above are direct storage writes and commit with this
      // invocation, but `primes` lives in `reg` — which only flush() writes, and
      // load() is not followed by one. Without this the ring is purged while the
      // prime budget stays spent, so the feed empties and never refills.
      const reg2 = {};
      for (const [uri, f] of this.feeds) reg2[uri] = { lastSeen: f.lastSeen, primes: f.primes };
      await this.state.storage.put('reg', reg2);
      await this.state.storage.put('matcherVersion', MATCHER_VERSION);
    }

    this.lastTimeUs = (await this.state.storage.get('cursor')) || 0;
    const cachedLists = await this.state.storage.list({ prefix: 'list:' });
    for (const key of cachedLists.keys()) {
      const dids = cachedLists.get(key);
      if (Array.isArray(dids)) this.lists.set(key.slice('list:'.length), new Set(dids));
    }
    const stats = (await this.state.storage.get('stats')) || {};
    this.samples = stats.samples || 0;
    this.lastSampleAt = stats.lastSampleAt || 0;
    this.lastSampleFrames = stats.lastSampleFrames || 0;
    this.lastSampleEndedBy = stats.lastSampleEndedBy || null;
    this.seen = stats.seen || 0;
    this.matched = stats.matched || 0;
    this.lastError = stats.lastError || null;
  }

  // Writes ONLY the chunks that changed, and deletes the ones that aged out.
  // In steady state that is a single key per flush.
  async flush() {
    const reg = {};
    for (const [uri, f] of this.feeds) {
      reg[uri] = { lastSeen: f.lastSeen, primes: f.primes };
      const doomed = [...f.gone].map((i) => chunkKey(uri, i));
      // Deletes run BEFORE writes, so a key that is both doomed and dirty ends
      // up correctly written rather than correctly deleted.
      for (const k of f.staleKeys) if (!doomed.includes(k)) doomed.push(k);
      if (doomed.length) {
        await this.state.storage.delete(doomed);
        f.gone.clear();
        f.staleKeys.clear();
      }
      if (f.dirty.size) {
        const writes = {};
        for (const i of f.dirty) if (f.chunks.has(i)) writes[chunkKey(uri, i)] = f.chunks.get(i);
        if (Object.keys(writes).length) await this.state.storage.put(writes);
        f.dirty.clear();
      }
    }
    await this.state.storage.put('reg', reg);
    if (this.lastTimeUs) await this.state.storage.put('cursor', this.lastTimeUs);
    // These counters are the ONLY way to see which bound is binding and what the
    // thing actually costs. In memory they are worthless here: a duty-cycled
    // object is evicted between wakes by design, so it is resident ~20s an hour
    // and everything resets. Persist them or the instrumentation is decorative.
    await this.state.storage.put('stats', {
      samples: this.samples, lastSampleAt: this.lastSampleAt,
      lastSampleFrames: this.lastSampleFrames, lastSampleEndedBy: this.lastSampleEndedBy,
      seen: this.seen, matched: this.matched, lastError: this.lastError,
    });
  }

  // ── feed registry ──────────────────────────────────────────────────────────

  // NOTE: this deliberately does NOT touch lastSeen. The alarm refreshes every
  // feed's definition on every wake, so if refreshing counted as activity then
  // lastSeen would always be `now` and the idle drop below could never fire —
  // which is exactly what it did until this was noticed. lastSeen means "last
  // time somebody READ this feed", and only /page sets it.
  async ensureFeed(feedUri, refresh = false) {
    let f = this.feeds.get(feedUri);
    if (!f) { f = FirehoseIngest.blank(); this.feeds.set(feedUri, f); }
    if (!refresh && f.def) return f;

    const m = feedUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/);
    if (!m) { f.source = 'bad-uri'; return f; }
    const { def, source, warnings } = await getFeedDef(m[1], m[2], fromSkyfeed);
    f.fetchedAt = nowMs();
    f.source = source;
    f.warnings = warnings || [];
    // Keep serving the previous definition if the fetch failed — a PDS blip
    // should not blank a feed.
    if (def) {
      // A buffer is only meaningful under the filters that built it. When the
      // owner edits their feed, everything already ingested was admitted by the
      // old rules, so it goes — otherwise adding "no video" would leave a day
      // of video sitting in the feed, which is the exact complaint.
      if (f.def && JSON.stringify(f.def.filters || []) !== JSON.stringify(def.filters || [])) this.clearBuffer(f);
      f.def = def;
      await this.state.storage.put(`def:${feedUri}`, { def, source, fetchedAt: f.fetchedAt });
    }
    await this.refreshLists(f);
    return f;
  }

  async refreshLists(f) {
    if (!f.def) return;
    for (const uri of listUris(f.def)) {
      const members = await getListMembers(uri);
      if (!members) continue;                      // fetch failed; keep whatever we had
      this.lists.set(uri, members);
      if (members.size <= LIST_PERSIST_MAX) {
        await this.state.storage.put(`list:${uri}`, [...members]);
      }
    }
  }

  // Only feeds that actually take the firehose are matched against it; a
  // search/list/author feed is served by b.mino.mobi and has no business here.
  firehoseFeeds() {
    const out = [];
    for (const [uri, f] of this.feeds) {
      if (f.def && (f.def.inputs || []).some((i) => i.type === 'firehose')) out.push([uri, f]);
    }
    return out;
  }

  // ── one sample of the firehose ─────────────────────────────────────────────

  async sample() {
    if (!this.firehoseFeeds().length) return;   // nothing to ingest for; stay asleep
    try {
      const host = JETSTREAM_HOSTS[this.samples % JETSTREAM_HOSTS.length];
      const u = new URL(`https://${host}/subscribe`);
      u.searchParams.set('wantedCollections', 'app.bsky.feed.post');
      // NO cursor: the sample starts live, deliberately.
      //
      // This used to replay the last 60 seconds to "smooth the seam between
      // samples", which was thinking left over from streaming. Under a duty
      // cycle there is no seam — the object is skipping 59 minutes on purpose —
      // so a replay just buys 60 extra seconds of backlog per sample at exactly
      // the cost the duty cycle exists to avoid. Measured on the live deploy:
      // a 20-second sample ingested 4,994 messages, about 129 seconds' worth,
      // roughly 4x its budget.

      const resp = await fetch(u.toString(), { headers: { Upgrade: 'websocket' } });
      const ws = resp.webSocket;
      if (!ws) throw new Error(`jetstream did not upgrade (HTTP ${resp.status})`);
      ws.accept();
      this.ws = ws;
      this.lastError = null;
      this.samples++;
      this.lastSampleAt = nowMs();
      this.frames = 0;

      const cap = this.maxFrames();
      await new Promise((resolve) => {
        let settled = false;
        const finish = (why) => {
          if (settled) return;
          settled = true;
          this.lastSampleEndedBy = why;
          clearTimeout(timer);
          try { ws.close(1000, 'sample complete'); } catch { /* already gone */ }
          resolve();
        };
        const timer = setTimeout(() => finish('time'), this.sampleMs());
        ws.addEventListener('message', (ev) => {
          try { this.onMessage(ev.data); } catch { /* one bad frame is not fatal */ }
          if (this.frames >= cap) finish('frames');
        });
        ws.addEventListener('close', () => finish('closed'));
        ws.addEventListener('error', () => finish('error'));
      });
      this.lastSampleFrames = this.frames;
    } catch (e) {
      this.lastError = String((e && e.message) || e);
    } finally {
      try { if (this.ws) this.ws.close(1000, 'done'); } catch { /* already gone */ }
      this.ws = null;
    }
  }

  onMessage(data) {
    // Counted before any filtering: billing counts frames off the wire, not the
    // ones we find interesting.
    this.frames++;
    const evt = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    if (evt.time_us && evt.time_us > this.lastTimeUs) this.lastTimeUs = evt.time_us;
    const c = evt.commit;
    if (evt.kind !== 'commit' || !c || c.operation !== 'create') return;
    if (c.collection !== 'app.bsky.feed.post' || !c.record) return;

    this.seen++;
    const feeds = this.firehoseFeeds();
    if (!feeds.length) return;

    const p = fromCommit(evt.did, c.rkey, c.record);
    const t = nowMs();
    for (const [, f] of feeds) {
      if (!passes(p, f.def.filters, { lists: this.lists })) continue;
      this.append(f, { u: p.uri, t });
      this.matched++;
    }
  }

  // ── serving ────────────────────────────────────────────────────────────────

  // Newest first, and older than the feed's own firehose window dropped.
  page(f, offset, limit) {
    const input = (f.def && (f.def.inputs || []).find((i) => i.type === 'firehose')) || {};
    const windowMs = Math.max(60, Number(input.seconds) || 86400) * 1000;
    const floor = nowMs() - windowMs;
    const all = this.entries(f);
    const fresh = [];
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].t < floor) break;   // chronological, so the rest are older still
      fresh.push(all[i].u);
    }
    return { uris: fresh.slice(offset, offset + limit), total: fresh.length };
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  async alarm() {
    let nextDelay = this.nextDelayMs();
    try {
      const seeded = new Set((this.env.SEED_FEEDS || '').split(/[\s,]+/).filter(Boolean));
      for (const uri of seeded) {
        if (!this.feeds.has(uri)) await this.ensureFeed(uri);
      }
      for (const [uri, f] of [...this.feeds]) {
        // A seeded feed is configured on purpose — it is warmed BEFORE anyone
        // opens it, so "nobody has read it" is its normal state, not neglect.
        if (!seeded.has(uri) && nowMs() - f.lastSeen > IDLE_DROP_MS) {
          this.feeds.delete(uri);
          await this.state.storage.delete(`def:${uri}`);
          const listed = await this.state.storage.list({ prefix: `buf:${uri}:` });
          if (listed.size) await this.state.storage.delete([...listed.keys()]);
          continue;
        }
        // Once per wake — so a filter edit is live within one sample interval.
        await this.ensureFeed(uri, true);
      }
      await this.sample();

      // Anything still cold gets another fast wake, up to its prime budget.
      let priming = false;
      for (const [, f] of this.firehoseFeeds()) {
        if (this.count(f) >= PRIME_TARGET || f.primes >= PRIME_SAMPLES) continue;
        f.primes++;
        priming = true;
      }
      this.priming = priming;
      await this.flush();
      nextDelay = priming ? PRIME_INTERVAL_MS : this.nextDelayMs();
    } finally {
      await this.state.storage.setAlarm(nowMs() + nextDelay);
    }
  }

  // Pull the next sample forward. Used when somebody opens a feed that has
  // nothing to show — waiting up to 90 minutes to find that out is the whole
  // cold-start problem. Bounded by the caller's prime budget, so a feed that
  // matches nothing cannot turn every read into a sample.
  async wakeSoon() {
    const soon = nowMs() + 2000;
    const alarm = await this.state.storage.getAlarm();
    if (alarm == null || alarm > soon) await this.state.storage.setAlarm(soon);
  }

  async fetch(request) {
    const url = new URL(request.url);
    // Any touch re-arms the heartbeat, so a cold object starts sampling without
    // waiting for the cron backstop. It does NOT open the firehose: reading a
    // feed must never trigger ingestion, or a popular feed would undo the duty
    // cycle by itself.
    //
    // Re-arming on `null` ALONE is not enough, and that killed the service for
    // an hour. An alarm can be left set to a time in the past — a failed
    // invocation rolls back its writes, a deploy can orphan a pending alarm —
    // and then getAlarm() returns non-null forever, this branch never fires, and
    // nothing ever wakes the object again. Every read looked healthy while the
    // ingester was simply dead. Treat an overdue alarm as no alarm.
    const alarm = await this.state.storage.getAlarm();
    if (alarm == null || alarm < nowMs() - STUCK_ALARM_MS) {
      await this.state.storage.setAlarm(nowMs() + 1000);
    }

    if (url.pathname === '/status') {
      const pending = await this.state.storage.getAlarm();
      return Response.json({
        ok: true,
        nextAlarmAt: pending,
        alarmOverdueMs: pending == null ? null : Math.max(0, nowMs() - pending),
        sampling: { seconds: this.sampleMs() / 1000, everyMinutes: this.intervalMs() / 60_000, maxFrames: this.maxFrames() },
        samples: this.samples,
        priming: !!this.priming,
        lastSampleAt: this.lastSampleAt || null,
        lastSampleFrames: this.lastSampleFrames,
        lastSampleEndedBy: this.lastSampleEndedBy,
        connected: !!this.ws,
        seen: this.seen,
        matched: this.matched,
        lastError: this.lastError,
        lists: [...this.lists].map(([uri, s]) => ({ uri, members: s.size })),
        feeds: [...this.feeds].map(([uri, f]) => ({
          uri, source: f.source, buffered: this.count(f), chunks: f.chunks.size, primes: f.primes,
          firehose: !!(f.def && (f.def.inputs || []).some((i) => i.type === 'firehose')),
          filters: f.def ? (f.def.filters || []).length : 0,
          warnings: f.warnings || [],
        })),
      });
    }

    if (url.pathname === '/page') {
      const feedUri = url.searchParams.get('feed') || '';
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10) || 30));
      const f = await this.ensureFeed(feedUri);
      f.lastSeen = nowMs();   // the one place a feed counts as read
      if (!f.def) return Response.json({ uris: [], total: 0, source: f.source, def: null });
      const isFirehose = (f.def.inputs || []).some((i) => i.type === 'firehose');
      if (isFirehose && this.count(f) === 0 && f.primes < PRIME_SAMPLES) await this.wakeSoon();
      const { uris, total } = this.page(f, offset, limit);
      return Response.json({ uris, total, source: f.source, def: f.def, buffered: this.count(f) });
    }

    return new Response('not found', { status: 404 });
  }
}
