// palm/store.js — remember a parsed repo so you only pay for it once.
//
// Reading a 90 MB archive takes as long as it takes. Reading it TWICE because
// you refreshed, or because an OAuth redirect bounced you off the page and back,
// is inexcusable — and the sign-in round trip is exactly when it would happen,
// since posting the card requires leaving the page and returning to it. So the
// reduced posts go into IndexedDB keyed by DID, and the second read is instant.
//
// Reduced posts only, never the CAR: `lathe` caps its own archive cache at
// 40,000 posts for the same reason, and this one caps lower because a palm only
// needs enough history to measure, not all of it.
//
// Same 6-hour TTL as lathe's archive cache. Posting a card does not invalidate
// it — one more post out of fifty thousand cannot move a percentile.

const DB = 'palm-repos', STORE = 'repos', VERSION = 1;
const TTL = 6 * 60 * 60 * 1000;
const MAX_POSTS = 60000;

function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** Cached posts for a DID, or null. Never throws — the cache is a nicety. */
export async function load(did) {
  try {
    const db = await idb();
    const hit = await new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(did);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
    if (!hit || (Date.now() - hit.at) > TTL) return null;
    return hit;
  } catch { return null; }
}

export async function save(did, { posts, collections, bytes }) {
  try {
    if (posts.length > MAX_POSTS) return;          // too big to be worth persisting
    const db = await idb();
    await new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite').objectStore(STORE)
        .put({ at: Date.now(), posts, collections, bytes }, did);
      t.onsuccess = () => res(); t.onerror = () => rej(t.error);
    });
  } catch { /* a full or disabled IndexedDB is not an error worth showing */ }
}

export async function forget(did) {
  try {
    const db = await idb();
    await new Promise((res) => {
      const t = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(did);
      t.onsuccess = () => res(); t.onerror = () => res();
    });
  } catch { /* nothing to do */ }
}
