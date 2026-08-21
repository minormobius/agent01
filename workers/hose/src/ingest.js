// FirehoseIngest — one Durable Object, one Jetstream connection, N feeds.
//
// The thing SkyFeed had that a stateless evaluator cannot fake: a feed whose
// filters are almost entirely *negative* ("not politics, not porn, not video,
// not a reply, not in this bot list") has no query you can ask the AppView for.
// There is no search term for "everything else". You have to see every post and
// subtract, which means holding the firehose open and deciding at ingest time.
//
// So: one WebSocket to Jetstream, every `app.bsky.feed.post` create run through
// each registered feed's filters as it arrives, and the matches appended to a
// bounded per-feed ring buffer. getFeedSkeleton then just pages the ring.
//
// Cost note, because it is the honest trade: this object is deliberately never
// idle. A 30-second alarm keeps it resident so the socket stays up, and that
// heartbeat is what you are paying for. Everything else here is bounded on
// purpose — buffers, list sizes, replay depth — so the bill cannot surprise.

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
const CHUNK = 400;            // entries per storage key — keeps values well under the 128KB limit
const ALARM_MS = 30_000;      // heartbeat: reconnect check + flush
const DEF_TTL_MS = 5 * 60_000;
const LIST_TTL_MS = 60 * 60_000;
const IDLE_DROP_MS = 7 * 24 * 60 * 60_000;   // a feed nobody has opened in a week stops being ingested
const MAX_REPLAY_US = 5 * 60 * 1_000_000;    // never replay more than 5 minutes on reconnect

const nowMs = () => Date.now();

export class FirehoseIngest {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.feeds = new Map();      // feedUri -> { def, source, fetchedAt, lastSeen, buf: [{u,t}], dirty }
    this.lists = new Map();      // listUri -> Set<did>
    this.listFetchedAt = new Map();
    this.ws = null;
    this.connecting = false;
    this.lastTimeUs = 0;
    this.seen = 0;
    this.matched = 0;
    this.lastEventAt = 0;
    this.connectedAt = 0;
    this.lastError = null;
    this.state.blockConcurrencyWhile(async () => { await this.load(); });
  }

  // ── persistence ────────────────────────────────────────────────────────────

  async load() {
    const reg = (await this.state.storage.get('reg')) || {};
    for (const [uri, meta] of Object.entries(reg)) {
      const stored = (await this.state.storage.get(`def:${uri}`)) || null;
      const buf = [];
      const chunks = await this.state.storage.list({ prefix: `buf:${uri}:` });
      // Keys are written zero-padded so lexical order is chronological order.
      for (const key of [...chunks.keys()].sort()) buf.push(...(chunks.get(key) || []));
      this.feeds.set(uri, {
        def: stored && stored.def, source: (stored && stored.source) || 'unknown',
        fetchedAt: (stored && stored.fetchedAt) || 0,
        lastSeen: meta.lastSeen || 0, buf, dirty: false,
      });
    }
    this.lastTimeUs = (await this.state.storage.get('cursor')) || 0;
  }

  async flush() {
    const reg = {};
    for (const [uri, f] of this.feeds) {
      reg[uri] = { lastSeen: f.lastSeen };
      if (!f.dirty) continue;
      f.dirty = false;
      const old = await this.state.storage.list({ prefix: `buf:${uri}:` });
      const writes = {};
      for (let i = 0; i * CHUNK < f.buf.length; i++) {
        writes[`buf:${uri}:${String(i).padStart(3, '0')}`] = f.buf.slice(i * CHUNK, (i + 1) * CHUNK);
      }
      const stale = [...old.keys()].filter((k) => !(k in writes));
      if (stale.length) await this.state.storage.delete(stale);
      if (Object.keys(writes).length) await this.state.storage.put(writes);
    }
    await this.state.storage.put('reg', reg);
    if (this.lastTimeUs) await this.state.storage.put('cursor', this.lastTimeUs);
  }

  // ── feed registry ──────────────────────────────────────────────────────────

  async ensureFeed(feedUri, force = false) {
    let f = this.feeds.get(feedUri);
    if (!f) {
      f = { def: null, source: 'pending', fetchedAt: 0, lastSeen: nowMs(), buf: [], dirty: true };
      this.feeds.set(feedUri, f);
    }
    f.lastSeen = nowMs();
    if (!force && f.def && nowMs() - f.fetchedAt < DEF_TTL_MS) return f;

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
      const sig = JSON.stringify(def.filters || []);
      if (f.def && JSON.stringify(f.def.filters || []) !== sig && f.buf.length) {
        f.buf = [];
        f.dirty = true;
      }
      f.def = def;
      await this.state.storage.put(`def:${feedUri}`, { def, source, fetchedAt: f.fetchedAt });
    }
    await this.refreshLists(f);
    return f;
  }

  async refreshLists(f) {
    if (!f.def) return;
    for (const uri of listUris(f.def)) {
      if (nowMs() - (this.listFetchedAt.get(uri) || 0) < LIST_TTL_MS) continue;
      const members = await getListMembers(uri);
      this.listFetchedAt.set(uri, nowMs());
      if (members) this.lists.set(uri, members);   // null = fetch failed; keep the old set
    }
  }

  // Only feeds that actually take the firehose are matched against it; a
  // search/list/author feed is served by b.mino.mobi and has no business here.
  firehoseFeeds() {
    const out = [];
    for (const [uri, f] of this.feeds) {
      if (!f.def) continue;
      if (!(f.def.inputs || []).some((i) => i.type === 'firehose')) continue;
      out.push([uri, f]);
    }
    return out;
  }

  // ── the firehose ───────────────────────────────────────────────────────────

  async connect() {
    if (this.ws || this.connecting) return;
    this.connecting = true;
    try {
      const host = JETSTREAM_HOSTS[Math.floor(nowMs() / 60_000) % JETSTREAM_HOSTS.length];
      const u = new URL(`https://${host}/subscribe`);
      u.searchParams.set('wantedCollections', 'app.bsky.feed.post');
      // Resume where we left off, but never replay more than MAX_REPLAY_US —
      // a cold object should catch up in seconds, not chew through a day.
      const floorUs = (nowMs() * 1000) - MAX_REPLAY_US;
      const cursor = Math.max(this.lastTimeUs || 0, floorUs);
      if (this.lastTimeUs) u.searchParams.set('cursor', String(Math.floor(cursor)));

      const resp = await fetch(u.toString(), { headers: { Upgrade: 'websocket' } });
      const ws = resp.webSocket;
      if (!ws) throw new Error(`jetstream did not upgrade (HTTP ${resp.status})`);
      ws.accept();
      this.ws = ws;
      this.connectedAt = nowMs();
      this.lastError = null;
      ws.addEventListener('message', (ev) => { try { this.onMessage(ev.data); } catch { /* one bad frame is not fatal */ } });
      ws.addEventListener('close', () => { if (this.ws === ws) this.ws = null; });
      ws.addEventListener('error', () => { if (this.ws === ws) this.ws = null; });
    } catch (e) {
      this.lastError = String((e && e.message) || e);
      this.ws = null;
    } finally {
      this.connecting = false;
    }
  }

  onMessage(data) {
    const evt = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data));
    if (evt.time_us && evt.time_us > this.lastTimeUs) this.lastTimeUs = evt.time_us;
    const c = evt.commit;
    if (evt.kind !== 'commit' || !c || c.operation !== 'create') return;
    if (c.collection !== 'app.bsky.feed.post' || !c.record) return;

    this.seen++;
    this.lastEventAt = nowMs();

    const feeds = this.firehoseFeeds();
    if (!feeds.length) return;

    const p = fromCommit(evt.did, c.rkey, c.record);
    const t = nowMs();
    for (const [, f] of feeds) {
      if (!passes(p, f.def.filters, { lists: this.lists })) continue;
      f.buf.push({ u: p.uri, t });
      f.dirty = true;
      this.matched++;
      if (f.buf.length > MAX_PER_FEED) f.buf.splice(0, f.buf.length - MAX_PER_FEED);
    }
  }

  // ── serving ────────────────────────────────────────────────────────────────

  // Newest first, and older than the feed's own firehose window dropped.
  page(f, offset, limit) {
    const input = (f.def && (f.def.inputs || []).find((i) => i.type === 'firehose')) || {};
    const windowMs = Math.max(60, Number(input.seconds) || 86400) * 1000;
    const floor = nowMs() - windowMs;
    const fresh = [];
    for (let i = f.buf.length - 1; i >= 0; i--) {
      if (f.buf[i].t < floor) break;   // buf is chronological, so the rest are older still
      fresh.push(f.buf[i].u);
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
          const chunks = await this.state.storage.list({ prefix: `buf:${uri}:` });
          if (chunks.size) await this.state.storage.delete([...chunks.keys()]);
          continue;
        }
        if (nowMs() - f.fetchedAt > DEF_TTL_MS) await this.ensureFeed(uri, true);
      }
      await this.connect();
      await this.flush();
    } finally {
      await this.state.storage.setAlarm(nowMs() + ALARM_MS);
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    // Any touch re-arms the heartbeat, so a cold object starts ingesting on the
    // first request rather than waiting for a deploy-time kick.
    if ((await this.state.storage.getAlarm()) == null) await this.state.storage.setAlarm(nowMs() + 1000);

    if (url.pathname === '/status') {
      return Response.json({
        ok: true,
        connected: !!this.ws,
        connectedAt: this.connectedAt || null,
        lastEventAt: this.lastEventAt || null,
        seen: this.seen,
        matched: this.matched,
        lastError: this.lastError,
        lists: [...this.lists].map(([uri, s]) => ({ uri, members: s.size })),
        feeds: [...this.feeds].map(([uri, f]) => ({
          uri, source: f.source, buffered: f.buf.length,
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
      await this.connect();
      const { uris, total } = this.page(f, offset, limit);
      return Response.json({ uris, total, source: f.source, def: f.def, buffered: f.buf.length });
    }

    return new Response('not found', { status: 404 });
  }
}
