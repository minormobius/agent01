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

const SERVICE = 'https://jetstream.us-east.bsky.network';
const DICT_URL = `${SERVICE}/xrpc/network.bsky.jetstream.getZstdDictionary`;
const KEY_STORAGE = 'bsky:jetstream-key';

/** Where a visitor mints their own key. Free; sign in with Bluesky. */
export const KEY_URL = 'https://bsky.network/account';

// ─── the key ─────────────────────────────────────────────────────

/** @returns {string} '' when unset */
export function getKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
}

/** @param {string} key */
export function setKey(key) {
  try {
    const k = key.trim();
    if (k) localStorage.setItem(KEY_STORAGE, k);
    else localStorage.removeItem(KEY_STORAGE);
    return true;
  } catch { return false; }
}

export function hasKey() { return Boolean(getKey()); }

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
      if (evt.collection !== 'app.bsky.feed.post') continue;
      if (evt.operation === 'delete') continue;
      const record = evt.record;
      if (!record || typeof record.text !== 'string') continue;

      onEvent({
        uri: `at://${evt.did}/${evt.collection}/${evt.rkey}`,
        did: evt.did,
        rkey: evt.rkey,
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

  // Enforced here rather than by counting decoded events: this is the only
  // place that sees actual wire bytes.
  const budget = new AbortController();
  const onAbort = () => budget.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let bytes = 0;
  let overBudget = false;

  const jetstream = new Jetstream({
    service: SERVICE,
    apiKey,
    decompressor,
    sha256: hash,
    // `fetchImpl`, not `fetch` — see the note in fetchOlder. Getting this wrong
    // does not throw; it silently disables the byte budget this whole function
    // is built around, which is the worst possible failure for a spending cap.
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

  let scanned = 0;
  let matched = 0;
  let oldestSeq = null;
  let stopped = 'reached the end of the window';

  try {
    for await (const evt of jetstream.snapshot({
      collections, kinds: ['commit'], afterSeq,
      ...(beforeSeq ? { beforeSeq } : {}),
      signal: budget.signal,
    })) {
      if (evt.collection !== 'app.bsky.feed.post') continue;
      if (evt.operation === 'delete') continue;
      const record = evt.record;
      if (!record || typeof record.text !== 'string') continue;

      scanned++;
      if (oldestSeq == null || evt.seq < oldestSeq) oldestSeq = evt.seq;

      const hits = match(record);
      if (hits.length) {
        matched++;
        onMatch({
          uri: `at://${evt.did}/${evt.collection}/${evt.rkey}`,
          did: evt.did, rkey: evt.rkey, seq: evt.seq,
          createdAt: record.createdAt || new Date().toISOString(),
          record, hits,
        }, hits);
      }
      // Progress reports SCANNED, not matched: a selective rule can go a long
      // way between keepers, and a still progress line reads as a hang.
      if (scanned % 2000 === 0) onProgress?.({ scanned, matched, bytes });
    }
  } catch (err) {
    if (overBudget) stopped = `stopped at the ${(budgetBytes / 1048576).toFixed(0)} MB budget`;
    else if (signal?.aborted) stopped = 'cancelled';
    else if (quota.retryAfter) stopped = `rate limited — retry in ${quota.retryAfter}s`;
    else throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  onProgress?.({ scanned, matched, bytes });
  return { scanned, matched, bytes, stopped, oldestSeq };
}
