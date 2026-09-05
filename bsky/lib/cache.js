/**
 * The local store — and the reason this AppView is not limited to 36 hours.
 *
 * ── Why caching is the whole trick ──────────────────────────────────────────
 *
 * Jetstream's live tail replays about 36 hours and no further. That is a
 * property of the SERVER, and no client can widen it. But it is a *rolling*
 * window: the 36 hours available today are not the 36 hours available
 * tomorrow. So a client that keeps what it saw accumulates history the network
 * will never serve it again.
 *
 *   day 1, first visit  → 36h of history, cached
 *   day 2, second visit → resume at the last seq; the gap is ~24h, well inside
 *                          the window, so it is filled with no hole. Store now
 *                          holds ~60h.
 *   day 30              → the store holds a month. The server still only ever
 *                          offered 36 hours.
 *
 * The cache is not an optimisation here. It IS the archive, built one visit at
 * a time, and it costs nothing and belongs to the user.
 *
 * ── The rule that makes it work: resume by seq, not by time ────────────────
 *
 * Every Jetstream event carries a monotonic `seq`. Persist the last one you
 * handled. On the next visit:
 *
 *   • seq is stored AND the gap is inside the window → reconnect with
 *     `cursor=<seq>`. Continuous. No hole, no duplicated window.
 *   • no seq, or the gap is older than the window → fall back to
 *     `since=<hours>`. There will be a hole between what you have and what you
 *     get, and `recordGap()` writes it down rather than letting the feed imply
 *     continuity it does not have.
 *
 * Resuming by TIME instead would re-download the whole window on every visit
 * and still leave the same hole. The seq is what makes a return visit cheap.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 *
 * Jetstream delivery is at-least-once and the cursor is INCLUSIVE, so the first
 * event after a resume is always one you already have. Every write here is
 * keyed on the record's `at://` URI, so a duplicate is a no-op rather than a
 * double-render. Do not "optimise" this into an append.
 *
 * ── What is stored ─────────────────────────────────────────────────────────
 *
 *   posts     at:// URI → { uri, did, rkey, seq, createdAt, record }
 *   profiles  did → { ...profile, fetchedAt }   (soft TTL, see PROFILE_TTL_MS)
 *   meta      one row per subscription key → { seq, at, gaps[] }
 *
 * Storage is per-origin and per-browser. It is never uploaded anywhere: there
 * is no server in this design to upload it to.
 */

const DB_NAME = 'bsky-appview';
const DB_VERSION = 1;

/** Posts kept before the oldest are evicted. ~50k posts is a few tens of MB. */
export const MAX_POSTS = 50_000;

/** Profiles go stale quietly — handles and avatars change, but not often. */
export const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How stale a stored cursor may be and still be resumable. Jetstream's window
 * is ~36h; 30 leaves headroom, because being wrong here means a silent clamp to
 * the oldest available event rather than an error.
 */
export const RESUMABLE_HOURS = 30;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (err) { return reject(err); }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('posts')) {
        const posts = db.createObjectStore('posts', { keyPath: 'uri' });
        // createdAt drives the feed order; did drives a profile view.
        posts.createIndex('createdAt', 'createdAt');
        posts.createIndex('did', 'did');
      }
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'did' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/**
 * Is a local store available at all? Private windows, disabled site data and
 * some embedded webviews all say no. Every caller must work without it — the
 * app degrades to a session-only feed, not to an error.
 *
 * @returns {Promise<boolean>}
 */
export async function available() {
  try { await open(); return true; } catch { return false; }
}

// ─── posts ───────────────────────────────────────────────────────

/**
 * Store one post. Keyed on `uri`, so re-delivery is a harmless overwrite.
 *
 * @param {{uri:string, did:string, rkey:string, seq?:number, createdAt?:string, record:object}} post
 */
export async function putPost(post) {
  const db = await open();
  return tx(db, 'posts', 'readwrite', (s) => s.put(post));
}

/**
 * Store many in one transaction. Use this on a replay — one transaction for a
 * thousand posts rather than a thousand transactions.
 *
 * @param {object[]} posts
 */
export async function putPosts(posts) {
  if (!posts.length) return;
  const db = await open();
  return tx(db, 'posts', 'readwrite', (s) => { for (const p of posts) s.put(p); });
}

/** @param {string} uri */
export async function deletePost(uri) {
  const db = await open();
  return tx(db, 'posts', 'readwrite', (s) => s.delete(uri));
}

/**
 * The newest `limit` posts, optionally for one account, newest first. This is
 * what paints the feed instantly on load, before any socket is open.
 *
 * @param {{limit?: number, did?: string, before?: string}} [opts]
 *   `before` is an ISO createdAt for paging further back.
 * @returns {Promise<object[]>}
 */
export async function recentPosts({ limit = 100, did, before } = {}) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction('posts', 'readonly');
    const store = t.objectStore('posts');
    const out = [];

    // Walking the did index for a profile view avoids scanning the whole store.
    const index = did ? store.index('did') : store.index('createdAt');
    const range = did
      ? IDBKeyRange.only(did)
      : (before ? IDBKeyRange.upperBound(before, true) : null);
    // 'prev' = newest first on createdAt. The did index is unordered by time,
    // so those results get sorted below.
    const req = index.openCursor(range, did ? 'next' : 'prev');

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || (!did && out.length >= limit)) {
        if (did) {
          out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
          return resolve(out.slice(0, limit));
        }
        return resolve(out);
      }
      out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

/** @returns {Promise<number>} how many posts are held */
export async function countPosts() {
  const db = await open();
  return tx(db, 'posts', 'readonly', (s) => s.count());
}

/**
 * Drop the oldest posts once the store exceeds MAX_POSTS. Call it occasionally
 * (after a replay settles), not per event.
 *
 * @param {number} [max=MAX_POSTS]
 * @returns {Promise<number>} how many were evicted
 */
export async function evict(max = MAX_POSTS) {
  const db = await open();
  const total = await countPosts();
  if (total <= max) return 0;
  const excess = total - max;
  return new Promise((resolve, reject) => {
    const t = db.transaction('posts', 'readwrite');
    const req = t.objectStore('posts').index('createdAt').openCursor(null, 'next');
    let removed = 0;
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || removed >= excess) return;
      cursor.delete();
      removed++;
      cursor.continue();
    };
    t.oncomplete = () => resolve(removed);
    t.onerror = () => reject(t.error);
  });
}

// ─── profiles ────────────────────────────────────────────────────

/** @param {object} profile - must carry `did` */
export async function putProfile(profile) {
  const db = await open();
  return tx(db, 'profiles', 'readwrite', (s) => s.put({ ...profile, fetchedAt: Date.now() }));
}

/**
 * A cached profile, or null if absent or past its TTL. Stale is still returned
 * when `allowStale` is set — a slightly old display name beats a raw DID.
 *
 * @param {string} did
 * @param {{allowStale?: boolean}} [opts]
 */
export async function getCachedProfile(did, { allowStale = false } = {}) {
  const db = await open();
  const p = await tx(db, 'profiles', 'readonly', (s) => s.get(did));
  if (!p) return null;
  if (!allowStale && Date.now() - (p.fetchedAt || 0) > PROFILE_TTL_MS) return null;
  return p;
}

// ─── cursors and gaps ────────────────────────────────────────────

/**
 * Remember where the stream got to.
 *
 * @param {string} key - the subscription's identity (see subscriptionKey)
 * @param {number} seq
 */
export async function saveCursor(key, seq) {
  const db = await open();
  const prev = await tx(db, 'meta', 'readonly', (s) => s.get(key));
  return tx(db, 'meta', 'readwrite', (s) =>
    s.put({ ...(prev || { gaps: [] }), key, seq, at: Date.now() }));
}

/**
 * Decide how to reconnect. This is the function that implements the rule at
 * the top of the file, and the only place that decision is made.
 *
 * @param {string} key
 * @param {number} fallbackHours - the `since` depth if resuming is impossible
 * @returns {Promise<{mode:'resume', cursor:number} | {mode:'since', hours:number, reason:string}>}
 */
export async function resumePlan(key, fallbackHours) {
  let row = null;
  try {
    const db = await open();
    row = await tx(db, 'meta', 'readonly', (s) => s.get(key));
  } catch {
    return { mode: 'since', hours: fallbackHours, reason: 'no local store' };
  }
  if (!row || !row.seq) {
    return { mode: 'since', hours: fallbackHours, reason: 'first visit' };
  }
  const ageHours = (Date.now() - (row.at || 0)) / 3_600_000;
  if (ageHours > RESUMABLE_HOURS) {
    return {
      mode: 'since',
      hours: fallbackHours,
      reason: `last seen ${ageHours.toFixed(0)}h ago — past the ~36h window, so there will be a gap`,
    };
  }
  return { mode: 'resume', cursor: row.seq };
}

/**
 * Write down a hole. A feed that silently omits a day looks identical to a
 * quiet day, which is the one thing a history view must never do.
 *
 * @param {string} key
 * @param {{from:number, to:number, reason:string}} gap - ms timestamps
 */
export async function recordGap(key, gap) {
  const db = await open();
  const prev = await tx(db, 'meta', 'readonly', (s) => s.get(key));
  const gaps = [...((prev && prev.gaps) || []), gap].slice(-50);
  return tx(db, 'meta', 'readwrite', (s) => s.put({ ...(prev || {}), key, gaps }));
}

/** @param {string} key @returns {Promise<Array<{from,to,reason}>>} */
export async function getGaps(key) {
  try {
    const db = await open();
    const row = await tx(db, 'meta', 'readonly', (s) => s.get(key));
    return (row && row.gaps) || [];
  } catch { return []; }
}

/**
 * A stable identity for one subscription, so two different follow-graphs do not
 * share a cursor. Order-independent, and short.
 *
 * @param {string[]} dids
 * @returns {string}
 */
export function subscriptionKey(dids) {
  const sorted = [...dids].sort();
  let h = 0x811c9dc5;
  for (const d of sorted) {
    for (let i = 0; i < d.length; i++) {
      h ^= d.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return `sub:${sorted.length}:${(h >>> 0).toString(36)}`;
}

/** Wipe everything. The user's data, so the user gets a button for it. */
export async function clearAll() {
  const db = await open();
  for (const store of ['posts', 'profiles', 'meta']) {
    await tx(db, store, 'readwrite', (s) => s.clear());
  }
}

/**
 * Rough size, when the browser will say. Chrome/Firefox report a whole-origin
 * estimate, not a per-store one, so treat it as an indication.
 *
 * @returns {Promise<{usage:number, quota:number}|null>}
 */
export async function estimate() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage || 0, quota: quota || 0 };
  } catch { return null; }
}
