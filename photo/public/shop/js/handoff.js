// handoff.js — passing state between two page loads on this origin.
//
// Lives in /shop because shop is the hub every other tool hands a picture TO;
// /bloom imports it from here rather than keeping a second copy.
//
// It carries two things: a picture between `/bloom` and `/shop` in either
// direction (`?seed=<key>`), and `/shop`'s whole session across an OAuth
// redirect (`?resume=<key>` — see `core/session.js`). Both because there is no
// other place to put them:
//
//   a data: URL in the address bar   megabytes of base64 in a location, which
//                                    browsers truncate and history keeps
//   sessionStorage                   strings only, so base64 again, and a
//                                    ~5 MB quota a 12-megapixel photo blows
//   re-picking the file              asking someone to find the same file twice
//                                    after they already chose it
//
// IndexedDB takes structured clones, so a Blob, a Uint8ClampedArray and a
// Float32Array all go in as themselves — no encoding, no realistic ceiling.
//
// ⚠️ **NOTHING HERE IS READ-ONCE, AND THAT IS THE LESSON.**
//
// This started as a baton: written by bloom, deleted by shop as it read. That
// is wrong, and it was wrong twice before the pattern was visible.
//
//   1. The OAuth return URL was built from `location.href`, so it carried the
//      already-consumed `?seed=` forward. Every trip from bloom to shop to a
//      post came back to an empty canvas — not a race, a guaranteed miss.
//   2. Even with that fixed, ⌘R on `/shop/?seed=…` answered "that picture was
//      already collected". A key that lives in the address bar is a key the
//      browser will hand back to you, and refusing it the second time is a
//      trap you set for yourself.
//
// The common cause: **the key is in a URL, and a URL is not a promise to only
// be visited once.** So reads do not delete. Lifetime is bounded by the sweep
// instead — half an hour, cleared on the next write — which costs nothing
// (it is your own picture, in your own browser) and cannot produce a link that
// works once and then lies.

const DB = 'minomobi-handoff';
const STORE = 'seeds';
const STALE_MS = 30 * 60 * 1000;   // half an hour is a generous walk between two tabs

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const tx = (db, mode) => db.transaction(STORE, mode).objectStore(STORE);

const freshKey = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Store any structured-cloneable value, return the key to put in the URL.
 *
 * Rejects rather than resolving on a failed write — a caller that quietly
 * carried on would hand out a key to nothing, which is the failure mode this
 * whole file was rewritten to remove.
 */
export async function keep(value, key = freshKey('k')) {
  const db = await open();
  try {
    await sweep(db);
    await new Promise((resolve, reject) => {
      const req = tx(db, 'readwrite').put({ key, value, at: Date.now() });
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
      req.transaction.onabort = () => reject(req.transaction.error || new Error('write aborted'));
    });
  } finally {
    db.close();
  }
  return key;
}

/** Read. Never consumes — see the warning at the top of this file. */
export async function peek(key) {
  if (!key) return null;
  const db = await open();
  const value = await new Promise((resolve) => {
    const req = tx(db, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => resolve(null);
  });
  db.close();
  return value;
}

/** Store a picture for the other page, with a key that says what it is. */
export const putSeed = (blob) => keep(blob, freshKey('s'));

/** Drop anything nobody came for. */
function sweep(db) {
  return new Promise((resolve) => {
    const store = tx(db, 'readwrite');
    const req = store.getAll();
    req.onsuccess = () => {
      const cutoff = Date.now() - STALE_MS;
      for (const row of req.result || []) if ((row.at || 0) < cutoff) store.delete(row.key);
      resolve();
    };
    req.onerror = resolve;
  });
}
