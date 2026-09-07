/**
 * Jetstream v2 client — the ATProto firehose, filtered server-side, in JSON.
 *
 * Jetstream consumes the network's full firehose from a Relay and does the
 * CBOR/CAR decoding and the filtering, so a browser can hold a slice of the
 * live network over one unauthenticated WebSocket. The `dids` filter takes up
 * to 10,000 accounts — which is the whole reason a personal timeline needs no
 * backend: you subscribe to your follow graph and the server does the fan-out.
 *
 * Usage:
 *   import { JetstreamClient, KIND } from '../../packages/atproto/jetstream.js';
 *
 *   const js = new JetstreamClient({
 *     collections: ['app.bsky.feed.post'],
 *     dids: myFollows,                 // <= 10_000
 *     kinds: [KIND.commit],
 *     onEvent: (e) => render(e),       // e = the decoded `payload`
 *   });
 *   js.connect();
 *
 * v1 vs v2 — this is the upgrade, and it is not cosmetic:
 *   - v1 hosts are `jetstream{1,2}.<region>.bsky.network`, path `/subscribe`,
 *     params `wantedCollections`/`wantedDids`, cursor in unix microseconds,
 *     event shape flat (`{did, time_us, kind, commit:{...}}`).
 *   - v2 hosts are `jetstream.<region>.bsky.network`, path
 *     `/xrpc/network.bsky.jetstream.subscribeEvents`, params
 *     `collections`/`dids`/`kinds`, cursor is `seq`, and every event is an
 *     envelope `{$type:'message', payload:{...}}`.
 *   v1 is legacy. `wave/src/jetstream.ts` and `b/disk` are still on it.
 *
 * HISTORY, for free: the live tail's `cursor` also accepts a unix-MICROSECOND
 * timestamp, which the server recognises by magnitude and translates to the
 * nearest seq. So `since` replays the recent past over the same unauthenticated
 * socket — measured at 3,000 events of 6-hour-old history in 0.7s. The window is
 * finite (see LOOKBACK_HOURS); only history older than that needs the archive,
 * which IS API-keyed and byte-metered and belongs behind a worker route.
 *
 * Verified live 2026-09-05: the subprotocol handshake, the {$type,payload}
 * envelope, seq cursors, deletes arriving without a record, the dids filter,
 * the timestamp cursor, the window boundary, and a 401 from planSnapshot.
 */

/** Public v2 instances. Tried in order; a dead host rotates to the next. */
export const HOSTS = [
  'wss://jetstream.us-east.bsky.network',
  'wss://jetstream.us-west.bsky.network',
];

/** Event kinds. A `collections` filter constrains commits ONLY — identity,
 *  account and sync events flow regardless, by design. Omit `kinds` for all. */
export const KIND = {
  commit: 'commit',
  identity: 'identity',
  account: 'account',
  sync: 'sync',
};

const PATH = '/xrpc/network.bsky.jetstream.subscribeEvents';
const SUBPROTOCOL = 'xrpc.v1.json';

/** Server-enforced filter caps. Exceeding either is rejected BEFORE the
 *  WebSocket upgrade, so we bound the lists rather than discover the cap as a
 *  failed connection. */
export const MAX_COLLECTIONS = 100;
export const MAX_DIDS = 10_000;

/**
 * How far back the live tail will replay, measured 2026-09-05: 12h, 24h, 30h
 * and 36h were all honoured to the minute; 48h, 72h and 168h all came back at
 * ~36.8h.
 *
 * The failure mode is the dangerous part — asking for more than the window
 * CLAMPS SILENTLY to the oldest available event. There is no error, no warning
 * and no flag on the stream, so a client that asks for a week and renders what
 * it gets will quietly show a day and a half and look correct. Anything deeper
 * has to go through the archive (API-keyed, metered).
 */
export const LOOKBACK_HOURS = 36;

export class JetstreamClient {
  /**
   * @param {object} opts
   * @param {string[]} [opts.collections] NSIDs, or `app.bsky.feed.*` wildcards
   * @param {string[]} [opts.dids]        restrict to these accounts
   * @param {string[]} [opts.kinds]       KIND values; omit for all four
   * @param {number|string} [opts.cursor] resume from this `seq` (inclusive)
   * @param {number|Date} [opts.since] start this far in the past instead of at
   *   the tip: a Date, or hours as a number. Capped at LOOKBACK_HOURS, because
   *   the server clamps silently past it and a caller should know which it got.
   *   Ignored once `cursor` is set — a reconnect resumes by seq, it does not
   *   replay the window again.
   * @param {(payload: object) => void} opts.onEvent  receives the decoded payload
   * @param {(host: string) => void} [opts.onConnect]
   * @param {(reason: string) => void} [opts.onDisconnect]
   * @param {(err: Error) => void} [opts.onError]
   * @param {string[]} [opts.hosts] override the host list
   */
  constructor(opts) {
    this.opts = opts;
    this.hosts = opts.hosts?.length ? opts.hosts : HOSTS;
    this.hostIndex = 0;
    this.ws = null;
    this.closed = false;
    this.backoff = 1000;
    this.timer = null;
    /** Last `seq` handed to onEvent — persist this to resume after a reload. */
    this.cursor = opts.cursor ?? null;
    /** Requested backfill depth in hours, clamped to what the server will serve. */
    this.sinceHours = clampSince(opts.since);
  }

  get host() { return this.hosts[this.hostIndex % this.hosts.length]; }

  url() {
    const p = new URLSearchParams();
    for (const c of (this.opts.collections ?? []).slice(0, MAX_COLLECTIONS)) {
      p.append('collections', c);
    }
    for (const d of (this.opts.dids ?? []).slice(0, MAX_DIDS)) {
      p.append('dids', d);
    }
    for (const k of this.opts.kinds ?? []) p.append('kinds', k);
    // The cursor is inclusive and delivery is at-least-once, so handlers must
    // be idempotent — key on each record's at:// URI.
    if (this.cursor != null) {
      // A seq we have actually seen always wins: after a drop we resume where
      // we stopped rather than replaying the whole window again.
      p.set('cursor', String(this.cursor));
    } else if (this.sinceHours) {
      // Microseconds. The server tells this from a seq by magnitude.
      p.set('cursor', String((Date.now() - this.sinceHours * 3600_000) * 1000));
    }
    return `${this.host}${PATH}?${p}`;
  }

  connect() {
    this.closed = false;
    let ws;
    try {
      ws = new WebSocket(this.url(), SUBPROTOCOL);
    } catch (err) {
      this.opts.onError?.(err);
      return this.rotateAndRetry();
    }
    this.ws = ws;

    ws.onopen = () => {
      this.backoff = 1000;
      this.opts.onConnect?.(this.host);
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      const payload = msg?.payload;
      if (!payload) return;
      if (typeof payload.seq === 'number') this.cursor = payload.seq;
      try { this.opts.onEvent(payload); }
      catch (err) { this.opts.onError?.(err); }
    };

    ws.onerror = () => { try { ws.close(); } catch { /* already gone */ } };

    ws.onclose = (e) => {
      this.opts.onDisconnect?.(e?.reason || 'closed');
      // A close before we ever opened usually means a rejected filter or a
      // dead host — rotate. A close after a good session is just a drop.
      if (!this.closed) this.rotateAndRetry();
    };
  }

  rotateAndRetry() {
    if (this.closed) return;
    this.hostIndex++;
    const jitter = Math.random() * 400;
    this.timer = setTimeout(() => this.connect(), this.backoff + jitter);
    this.backoff = Math.min(this.backoff * 2, 30_000);
  }

  /** Change the filter without losing the cursor. Reconnects. */
  setFilter({ collections, dids, kinds }) {
    if (collections) this.opts.collections = collections;
    if (dids) this.opts.dids = dids;
    if (kinds) this.opts.kinds = kinds;
    if (this.ws) { this.closed = true; try { this.ws.close(); } catch {} }
    this.closed = false;
    this.connect();
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    try { this.ws?.close(); } catch { /* already gone */ }
    this.ws = null;
  }
}

/**
 * Normalise `since` to hours, capped at the window. Returns 0 for "start at the
 * tip". Exported so a caller can show the user what it will actually get rather
 * than what they asked for.
 *
 * @param {number|Date|undefined} since
 * @returns {number} hours, 0 to LOOKBACK_HOURS
 */
export function clampSince(since) {
  if (since == null) return 0;
  const hours = since instanceof Date
    ? (Date.now() - since.getTime()) / 3600_000
    : Number(since);
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.min(hours, LOOKBACK_HOURS);
}

/** `at://` URI for a commit payload — the natural idempotency key. */
export function eventUri(payload) {
  if (!payload?.did || !payload?.collection || !payload?.rkey) return null;
  return `at://${payload.did}/${payload.collection}/${payload.rkey}`;
}
