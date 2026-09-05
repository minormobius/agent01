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
 * The live tail is unauthenticated and unmetered. HISTORY is not: Jetstream v2
 * also replays the archive over HTTP, but those endpoints need an API key and
 * are metered in bytes — so replay belongs behind a worker route that holds the
 * secret, never in a static page. See docs/APPVIEW-FEASIBILITY.md §3.
 *
 * Verified against the v2 docs and a live 401 from planSnapshot on 2026-09-05.
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

export class JetstreamClient {
  /**
   * @param {object} opts
   * @param {string[]} [opts.collections] NSIDs, or `app.bsky.feed.*` wildcards
   * @param {string[]} [opts.dids]        restrict to these accounts
   * @param {string[]} [opts.kinds]       KIND values; omit for all four
   * @param {number|string} [opts.cursor] resume from this `seq` (inclusive)
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
    if (this.cursor != null) p.set('cursor', String(this.cursor));
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

/** `at://` URI for a commit payload — the natural idempotency key. */
export function eventUri(payload) {
  if (!payload?.did || !payload?.collection || !payload?.rkey) return null;
  return `at://${payload.did}/${payload.collection}/${payload.rkey}`;
}
