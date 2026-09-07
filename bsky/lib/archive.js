/**
 * Deep history — the user's own key, their own quota, no server of ours.
 *
 * Everything else on this surface needs no account. This is the exception, and
 * it is the exception for a reason worth stating: Jetstream's live tail replays
 * ~36h unauthenticated, but the ARCHIVE behind it is byte-metered and needs a
 * key. That key is the visitor's, minted free at bsky.network/account with
 * their Bluesky login, kept in their localStorage, and sent from their browser
 * straight to Jetstream. It never reaches us — there is no server here for it
 * to reach.
 *
 * "A key in a static page is a published key" is about a key the SITE ships.
 * A key the USER pastes is theirs; b/sleuth already ships this pattern.
 *
 * Four things had to be true for this to work in a browser, all verified
 * 2026-09-05:
 *
 *   1. CORS — the archive answers `access-control-allow-origin: *` with
 *      `Authorization`, `Range` and `If-Range` in allow-headers.
 *   2. A SYNCHRONOUS zstd with DICTIONARY support. Segments are compressed
 *      against a shared dictionary; `fzstd` throws `invalid zstd data` on such
 *      a frame. `@bokuweb/zstd-wasm` does it: `init()` is async once, then
 *      `decompressUsingDict()` returns a Uint8Array synchronously.
 *   3. That dictionary, which `getZstdDictionary` serves as 64 KiB with NO
 *      auth at all.
 *   4. A synchronous sha256 — WebCrypto is async-only and the SDK's `cid`
 *      getter is sync. See ./sha256.js.
 *
 * The SDK ships a browser branch on purpose and names both hooks
 * (`decompressor`, `sha256`); it just declines to choose them for you.
 */

import { Jetstream } from '/lib/vendor/jetstream.browser.js';
import * as zstdWasm from '/lib/vendor/zstd/index.js';
import { sha256 } from '/lib/sha256.js';
import { getKey } from '/lib/apikey.js';

const SERVICE = 'https://jetstream.us-east.bsky.network';
const DICT_URL = `${SERVICE}/xrpc/network.bsky.jetstream.getZstdDictionary`;

// ─── the key ─────────────────────────────────────────────────────

// Storage lives in its own module with no dependencies, because the Me tab must
// be able to save and clear a key even when lib/vendor/ fails to load — which
// is precisely the situation you are in while setting one up. Re-exported here
// so existing callers do not care.
export { getKey, setKey, hasKey, KEY_URL } from '/lib/apikey.js';

// ─── quota ───────────────────────────────────────────────────────

/**
 * Live quota, read off the response headers the archive deliberately exposes
 * via `access-control-expose-headers`. Updated on every archive response.
 * @type {{refillBytes:number, refillSeconds:number, burstBytes:number, spent:number, retryAfter:number|null}}
 */
export const quota = {
  refillBytes: 0, refillSeconds: 0, burstBytes: 0, spent: 0, retryAfter: null,
};

function readQuota(res) {
  const n = (h) => Number(res.headers.get(h)) || 0;
  const refill = n('headwind-quota-refill-bytes');
  if (refill) quota.refillBytes = refill;
  const period = n('headwind-quota-refill-period-seconds');
  if (period) quota.refillSeconds = period;
  const burst = n('headwind-quota-burst-bytes');
  if (burst) quota.burstBytes = burst;
  quota.spent += n('content-length');
  quota.retryAfter = res.status === 429 ? (Number(res.headers.get('retry-after')) || 60) : null;
}

/** A short human summary of the budget, or null when nothing is known yet. */
export function quotaSummary() {
  if (!quota.refillBytes && !quota.spent) return null;
  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  const parts = [`${mb(quota.spent)} downloaded this session`];
  if (quota.refillBytes && quota.refillSeconds) {
    parts.push(`refills ${mb(quota.refillBytes)} / ${Math.round(quota.refillSeconds / 60)} min`);
  }
  if (quota.retryAfter) parts.push(`rate limited — retry in ${quota.retryAfter}s`);
  return parts.join(' · ');
}

// ─── one-time setup ──────────────────────────────────────────────

let ready = null;

/**
 * Initialise the WASM decoder and fetch the dictionary. Async ONCE; after this
 * every decompress call is synchronous, which is what the SDK requires.
 *
 * @returns {Promise<{decompressor: {decompress: Function}, sha256: Function}>}
 */
export function init() {
  if (ready) return ready;
  ready = (async () => {
    await zstdWasm.init('/lib/vendor/zstd/zstd.wasm');

    const res = await fetch(DICT_URL);          // unauthenticated, 64 KiB
    if (!res.ok) throw new Error(`dictionary fetch failed: ${res.status}`);
    const dict = new Uint8Array(await res.arrayBuffer());

    // One context reused across frames — creating one per block is the easy
    // way to make this slow.
    const dctx = zstdWasm.createDCtx();

    return {
      decompressor: {
        decompress(frame, maxDecodedBytes) {
          const out = zstdWasm.decompressUsingDict(dctx, frame, dict);
          if (maxDecodedBytes && out.length > maxDecodedBytes) {
            throw new Error(`decoded ${out.length} > cap ${maxDecodedBytes}`);
          }
          return out;
        },
      },
      sha256,
    };
  })();
  return ready;
}

// ─── the fetch ───────────────────────────────────────────────────

/**
 * Pull history OLDER than what the live window can reach.
 *
 * Bounded on purpose. The archive is metered in bytes and the meter is the
 * user's, so this stops at `maxEvents` and honours an AbortSignal rather than
 * running until the quota is gone. A 429 ends the run cleanly with
 * `quota.retryAfter` set; the bytes already downloaded are kept.
 *
 * @param {object} opts
 * @param {string[]} opts.dids            accounts to fetch (the filter is applied server-side in the plan)
 * @param {number} [opts.beforeSeq]       exclusive upper bound — usually the oldest seq you already hold
 * @param {number} [opts.afterSeq=0]      lower bound; 0 means the start of the archive
 * @param {number} [opts.maxEvents=5000]  hard stop, so a wide graph cannot drain the quota
 * @param {(post: object) => void} opts.onEvent
 * @param {(n: number) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{events:number, stopped:string}>}
 */
export async function fetchOlder({
  dids, beforeSeq, afterSeq = 0, maxEvents = 5000, onEvent, onProgress, signal,
}) {
  const apiKey = getKey();
  if (!apiKey) throw new Error('no API key — add one to reach past the live window');
  if (!dids?.length) throw new Error('no accounts to fetch');

  const { decompressor, sha256: hash } = await init();

  const jetstream = new Jetstream({
    service: SERVICE,
    apiKey,
    decompressor,
    sha256: hash,
    // `fetchImpl`, NOT `fetch`. The SDK ignores an unknown option silently, so
    // spelling it `fetch` type-checks nowhere and fails invisibly: the wrapper
    // simply never runs. Caught by replay-slug.yml reporting `requests 0`
    // while the download plainly happened — 961 frames decoded.
    fetchImpl: async (input, opts) => {
      const res = await fetch(input, opts);
      try { readQuota(res); } catch { /* headers are advisory */ }
      return res;
    },
  });

  let events = 0;
  let stopped = 'complete';

  try {
    for await (const evt of jetstream.snapshot({
      collections: ['app.bsky.feed.post'],
      kinds: ['commit'],
      dids,
      afterSeq,
      ...(beforeSeq ? { beforeSeq } : {}),
      signal,
    })) {
      const c = commitOf(evt);
      if (!c || c.collection !== 'app.bsky.feed.post') continue;
      if (c.operation === 'delete') continue;
      const record = c.record;
      if (!record || typeof record.text !== 'string') continue;

      onEvent({
        uri: `at://${evt.did}/${c.collection}/${c.rkey}`,
        did: evt.did,
        rkey: c.rkey,
        cid: c.cid,
        seq: evt.seq,
        createdAt: record.createdAt || new Date().toISOString(),
        record,
      });

      if (++events % 250 === 0) onProgress?.(events);
      if (events >= maxEvents) { stopped = `stopped at the ${maxEvents}-event cap`; break; }
    }
  } catch (err) {
    if (signal?.aborted) stopped = 'cancelled';
    else if (quota.retryAfter) stopped = `rate limited — retry in ${quota.retryAfter}s`;
    else throw err;
  }

  onProgress?.(events);
  return { events, stopped };
}

// ─── a bounded slug, planned before it is paid for ───────────────

const PLAN_URL = `${SERVICE}/xrpc/network.bsky.jetstream.planSnapshot`;
/** Same call through our worker, for readers who have not minted a key yet. */
const WORKER_PLAN_URL = '/api/replay/network.bsky.jetstream.planSnapshot';

/**
 * The SDK's snapshot events are NESTED, and this is not the websocket's shape.
 *
 * Measured off a real archive replay (replay-slug.yml, 2026-09-05):
 *
 *   { did, seq, time, kind: 'commit',
 *     commit: { operation, collection, rkey, rev, cid, record } }
 *
 * Our own live client (`packages/atproto/jetstream.js`) hands the page a FLAT
 * payload — `payload.collection`, `payload.record` — so both `fetchOlder` and
 * `fetchSlug` were written against that and read `evt.collection`, which is
 * always undefined here. Every event was therefore filtered out, silently: the
 * first successful replay downloaded 12.3 MB, decoded 30 frames and 16,234
 * events, and reported zero posts.
 *
 * @returns {{collection: string, operation: string, rkey: string, cid: string, record: object} | null}
 */
function commitOf(evt) {
  if (evt?.kind && evt.kind !== 'commit') return null;
  const c = evt?.commit;
  return c && typeof c === 'object' ? c : null;
}

/**
 * Ask the archive what a window WOULD cost before downloading any of it.
 *
 * This is what makes replay usable rather than theoretical. The planner is an
 * index: given a collection filter and a seq range it returns the segments that
 * contain matching events and, where a block index exists, the *block ranges*
 * inside them — so the size of a job is knowable before a byte of it is bought,
 * instead of discovering it partway through a 252 MB segment.
 *
 * Three API details, each of which costs a confused hour:
 *   - this is **POST**; `listSegments` is **GET**. Each rejects the other verb
 *     with `MethodNotAllowed`.
 *   - the filter parameter is **`collections`**. `wantedCollections` is the
 *     websocket's name for it, is silently ignored here, and returns a full
 *     unfiltered plan with no error at all.
 *   - **planning needs auth** — a direct call with no key is a flat 401. It is
 *     metadata, not data, so it is cheap, but it is not free of a credential.
 *
 * Which is why this has two routes. With the reader's own key it goes straight
 * to Jetstream. WITHOUT one it falls back to our worker's `/api/replay/` proxy,
 * which holds the site's key and is origin-locked — so somebody with no key can
 * still see what a window would cost before deciding whether to go and get one.
 * The plan is a few KB of segment metadata either way; only the DOWNLOAD spends
 * real bytes, and that always uses the reader's own key.
 *
 * @param {{collections?: string[], kinds?: string[], afterSeq?: number, beforeSeq?: number, signal?: AbortSignal}} opts
 */
export async function planCost({
  collections = ['app.bsky.feed.post'], kinds = ['commit'], afterSeq, beforeSeq, signal,
} = {}) {
  const body = { collections, kinds };
  if (afterSeq != null) body.afterSeq = afterSeq;
  if (beforeSeq != null) body.beforeSeq = beforeSeq;

  const headers = { 'Content-Type': 'application/json' };
  const key = getKey();
  const url = key ? PLAN_URL : WORKER_PLAN_URL;
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) throw new Error(`planSnapshot ${res.status}`);
  try { readQuota(res); } catch { /* headers are advisory */ }
  return summarisePlan(await res.json());
}

/**
 * The counting half of planCost, separated so it can be tested without a
 * network: a plan's cost is entirely a property of its shape.
 *
 * `blocks` is the number of individually addressable downloads (each block
 * range is inclusive at both ends, so `last - first + 1`), and `wholeSegments`
 * is the entries with no block index — the expensive ones, ~252 MB each.
 */
export function summarisePlan(plan) {
  const segments = plan?.segments || [];
  let blocks = 0;
  let wholeSegments = 0;
  for (const s of segments) {
    if (s.mode === 'blocks') for (const r of s.blocks || []) blocks += r.last - r.first + 1;
    else wholeSegments++;
  }
  return {
    segments, blocks, wholeSegments,
    stats: plan?.stats || {},
    tipSeq: plan?.sealedTipSeq,
    plannedThroughSeq: plan?.plannedThroughSeq,
  };
}

/**
 * Replay a SLUG of the archive and keep only what a rule matches.
 *
 * The shape is `b/palm/car-stream.js`'s, for the same reason: never hold the
 * haystack. `snapshot()` is an async generator over decoded events, so each is
 * tested and dropped unless it matches — peak memory is one block plus the
 * keepers, not the window. A 50 MB slug of the post firehose is on the order of
 * a hundred thousand posts and a few hundred matches; buffering it first would
 * be the entire cost of the operation, for nothing.
 *
 * Bounded by BYTES, not events, and the distinction is the point. The meter is
 * the reader's own quota, so the only promise worth making is "this will not
 * spend more than N megabytes". An event cap cannot promise that: events per
 * byte depends entirely on how selective the rule is. Bytes are counted off
 * `Content-Length` as each download lands, and the run aborts on the budget.
 *
 * `dids` is deliberately absent. The follow-graph path is `fetchOlder`; this is
 * for a CONTENT rule, where narrowing by account is precisely the wrong filter
 * — the point is to find people you do not already follow.
 *
 * @param {object} opts
 * @param {(record: object) => string[]} opts.match  match reasons; empty means no
 * @param {(post: object, hits: string[]) => void} opts.onMatch
 * @param {string[]} [opts.collections]
 * @param {number} [opts.beforeSeq]   exclusive upper bound — the oldest seq already held
 * @param {number} [opts.afterSeq=0]
 * @param {number} [opts.budgetBytes] hard stop, default 50 MiB
 * @param {(p: {scanned:number, matched:number, bytes:number}) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 */
export async function fetchSlug({
  match, onMatch, collections = ['app.bsky.feed.post'],
  beforeSeq, afterSeq = 0, budgetBytes = 50 * 1024 * 1024,
  onProgress, signal,
}) {
  if (typeof match !== 'function') throw new Error('fetchSlug needs a match function');
  const apiKey = getKey();
  if (!apiKey) throw new Error('no API key — add one to reach past the live window');

  const { decompressor, sha256: hash } = await init();

  /**
   * Walk BLOCK-INDEXED segments, newest first.
   *
   * Verified against the live archive (replay-slug.yml, 2026-09-05): 50.3 MB
   * bought 130 block requests, 127 zstd frames (49.8 -> 181.7 MB), 58,994 posts
   * scanned in 6.6s, 85 matches. What makes that possible is only touching
   * segments the planner can serve as BLOCKS.
   *
   * A `segment`-mode entry is a ~262 MB ATOMIC download — a byte budget cannot
   * subdivide it, so a 50 MB cap simply aborts once Content-Length arrives and
   * nothing decodes at all (measured: 262 MB counted, 0 frames, 0 events). And
   * one wide afterSeq/beforeSeq spanning several indexed segments drags in the
   * un-indexed ones between them. So each indexed segment gets its own bounded
   * snapshot and the budget is carried across them.
   */
  const { segments } = await planCost({ collections, signal });
  const indexed = segments
    .filter((seg) => seg.mode === 'blocks' && (seg.blocks || []).length)
    .filter((seg) => (beforeSeq ? seg.maxSeq < beforeSeq : true) && seg.maxSeq > afterSeq)
    .sort((a, b) => b.maxSeq - a.maxSeq);

  if (!indexed.length) {
    return { scanned: 0, matched: 0, bytes: 0, oldestSeq: null,
             stopped: 'no block-indexed segment left in this range' };
  }

  let bytes = 0;
  let scanned = 0;
  let matched = 0;
  let oldestSeq = null;
  let stopped = 'ran out of block-indexed segments';
  const seen = new Set();

  for (const seg of indexed) {
    if (bytes >= budgetBytes) { stopped = `stopped at the ${(budgetBytes / 1048576).toFixed(0)} MB budget`; break; }
    if (signal?.aborted) { stopped = 'cancelled'; break; }

    const budget = new AbortController();
    const onAbort = () => budget.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let overBudget = false;

    const jetstream = new Jetstream({
      service: SERVICE,
      apiKey,
      decompressor,
      sha256: hash,
      // The SDK prefetches this much BEFORE yielding a single event. A buffer
      // larger than the budget means the abort lands mid-prefetch and nothing
      // is ever emitted — measured: 12.3 MB downloaded, 27 frames decoded,
      // zero events. A spending cap that guarantees you get nothing for your
      // money is worse than no cap.
      snapshotBufferBytes: Math.max(1 << 20, Math.floor(budgetBytes / 8)),
      blockConcurrency: 2,
      // `fetchImpl`, NOT `fetch`. An unknown option is ignored silently, so the
      // wrapper never runs and the byte budget below simply does not exist.
      fetchImpl: async (input, opts) => {
        const res = await fetch(input, opts);
        try { readQuota(res); } catch { /* advisory */ }
        const len = Number(res.headers.get('content-length') || 0);
        if (len) {
          bytes += len;
          if (bytes >= budgetBytes && !overBudget) { overBudget = true; budget.abort(); }
        }
        return res;
      },
    });

    try {
      for await (const evt of jetstream.snapshot({
        collections, kinds: ['commit'],
        afterSeq: Math.max(afterSeq, seg.minSeq - 1),
        beforeSeq: seg.maxSeq,
        signal: budget.signal,
      })) {
        const c = commitOf(evt);
        if (!c || c.collection !== 'app.bsky.feed.post') continue;
        if (c.operation === 'delete') continue;
        const record = c.record;
        if (!record || typeof record.text !== 'string') continue;

        scanned++;
        if (oldestSeq == null || evt.seq < oldestSeq) oldestSeq = evt.seq;

        const hits = match(record);
        if (!hits.length) {
          if (scanned % 2000 === 0) onProgress?.({ scanned, matched, bytes });
          continue;
        }
        // Dedup by at:// URI: delivery is at-least-once, and mirror accounts
        // post the same paper verbatim — a live run returned the same bioRxiv
        // preprint twice from two different DIDs.
        const uri = `at://${evt.did}/${c.collection}/${c.rkey}`;
        if (seen.has(uri)) continue;
        seen.add(uri);
        matched++;
        onMatch({
          // The cid is carried because liking or reposting a replayed post
          // needs it — dropping it silently breaks those buttons.
          uri, did: evt.did, rkey: c.rkey, cid: c.cid, seq: evt.seq,
          createdAt: record.createdAt || new Date().toISOString(),
          record, hits,
        }, hits);
        if (scanned % 2000 === 0) onProgress?.({ scanned, matched, bytes });
      }
    } catch (err) {
      if (overBudget) { stopped = `stopped at the ${(budgetBytes / 1048576).toFixed(0)} MB budget`; break; }
      if (signal?.aborted) { stopped = 'cancelled'; break; }
      if (quota.retryAfter) { stopped = `rate limited — retry in ${quota.retryAfter}s`; break; }
      // One bad segment is not a failed slug.
      stopped = `segment ${seg.name}: ${err?.message || err}`;
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  onProgress?.({ scanned, matched, bytes });
  return { scanned, matched, bytes, stopped, oldestSeq };
}
