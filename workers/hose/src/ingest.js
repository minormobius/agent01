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

import { fromCommit, passes, listUris } from '../../../packages/feedgen/match.js';
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
const MAX_REPLAY_US = 60 * 1_000_000;        // never replay more than a minute on reconnect

const DEFAULT_SAMPLE_SECONDS = 20;
const DEFAULT_SAMPLE_EVERY_MINUTES = 60;

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

  // Jittered, so the feed is not permanently a portrait of whatever the network
  // is doing at one fixed offset past the hour. Averages the configured
  // interval over 0.5x–1.5x.
  nextDelayMs() { return Math.round(this.intervalMs() * (0.5 + Math.random())); }

  // ── the chunked ring ───────────────────────────────────────────────────────

  static blank() {
    return { def: null, source: 'pending', fetchedAt: 0, lastSeen: nowMs(),
             chunks: new Map(), head: 0, dirty: new Set(), gone: new Set(), warnings: [] };
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

      const listed = await this.state.storage.list({ prefix: `buf:${uri}:` });
      for (const key of [...listed.keys()].sort()) {
        const ci = parseInt(key.slice(key.lastIndexOf(':') + 1), 10);
        if (Number.isFinite(ci)) f.chunks.set(ci, listed.get(key) || []);
      }
      // An older config may have left more chunks than we now retain.
      while (f.chunks.size > maxChunks()) {
        const oldest = Math.min(...f.chunks.keys());
        f.chunks.delete(oldest);
        f.gone.add(oldest);
      }
      const idx = [...f.chunks.keys()];
      f.head = idx.length ? Math.max(...idx) * CHUNK + f.chunks.get(Math.max(...idx)).length : 0;
      this.feeds.set(uri, f);
    }
    this.lastTimeUs = (await this.state.storage.get('cursor')) || 0;
  }

  // Writes ONLY the chunks that changed, and deletes the ones that aged out.
  // In steady state that is a single key per flush.
  async flush() {
    const reg = {};
    for (const [uri, f] of this.feeds) {
      reg[uri] = { lastSeen: f.lastSeen };
      if (f.gone.size) {
        await this.state.storage.delete([...f.gone].map((i) => chunkKey(uri, i)));
        f.gone.clear();
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
  }

  // ── feed registry ──────────────────────────────────────────────────────────

  async ensureFeed(feedUri, refresh = false) {
    let f = this.feeds.get(feedUri);
    if (!f) { f = FirehoseIngest.blank(); this.feeds.set(feedUri, f); }
    f.lastSeen = nowMs();
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
      if (members) this.lists.set(uri, members);   // null = fetch failed; keep the old set
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
      // A short replay smooths the seam between samples. It is capped hard: a
      // long replay would defeat the entire point of sampling by delivering the
      // messages we just declined to pay for.
      if (this.lastTimeUs) {
        const floorUs = (nowMs() * 1000) - MAX_REPLAY_US;
        u.searchParams.set('cursor', String(Math.floor(Math.max(this.lastTimeUs, floorUs))));
      }

      const resp = await fetch(u.toString(), { headers: { Upgrade: 'websocket' } });
      const ws = resp.webSocket;
      if (!ws) throw new Error(`jetstream did not upgrade (HTTP ${resp.status})`);
      ws.accept();
      this.ws = ws;
      this.lastError = null;
      this.samples++;
      this.lastSampleAt = nowMs();

      const done = new Promise((resolve) => {
        const stop = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => { try { ws.close(1000, 'sample complete'); } catch { /* already gone */ } resolve(); }, this.sampleMs());
        ws.addEventListener('message', (ev) => { try { this.onMessage(ev.data); } catch { /* one bad frame is not fatal */ } });
        ws.addEventListener('close', stop);
        ws.addEventListener('error', stop);
      });
      await done;
    } catch (e) {
      this.lastError = String((e && e.message) || e);
    } finally {
      try { if (this.ws) this.ws.close(1000, 'done'); } catch { /* already gone */ }
      this.ws = null;
    }
  }

  onMessage(data) {
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
    try {
      for (const uri of (this.env.SEED_FEEDS || '').split(/[\s,]+/).filter(Boolean)) {
        if (!this.feeds.has(uri)) await this.ensureFeed(uri);
      }
      for (const [uri, f] of [...this.feeds]) {
        if (nowMs() - f.lastSeen > IDLE_DROP_MS) {
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
      await this.flush();
    } finally {
      await this.state.storage.setAlarm(nowMs() + this.nextDelayMs());
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    // Any touch re-arms the heartbeat, so a cold object starts sampling without
    // waiting for the cron backstop. It does NOT open the firehose: reading a
    // feed must never trigger ingestion, or a popular feed would undo the duty
    // cycle by itself.
    if ((await this.state.storage.getAlarm()) == null) await this.state.storage.setAlarm(nowMs() + 1000);

    if (url.pathname === '/status') {
      return Response.json({
        ok: true,
        sampling: { seconds: this.sampleMs() / 1000, everyMinutes: this.intervalMs() / 60_000 },
        samples: this.samples,
        lastSampleAt: this.lastSampleAt || null,
        connected: !!this.ws,
        seen: this.seen,
        matched: this.matched,
        lastError: this.lastError,
        lists: [...this.lists].map(([uri, s]) => ({ uri, members: s.size })),
        feeds: [...this.feeds].map(([uri, f]) => ({
          uri, source: f.source, buffered: this.count(f), chunks: f.chunks.size,
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
      if (!f.def) return Response.json({ uris: [], total: 0, source: f.source, def: null });
      const { uris, total } = this.page(f, offset, limit);
      return Response.json({ uris, total, source: f.source, def: f.def, buffered: this.count(f) });
    }

    return new Response('not found', { status: 404 });
  }
}
