// handoff.js — passing state between two page loads on this origin.
//
// Lives in /shop because shop is the hub every other tool hands a picture TO;
// /bloom imports it from here rather than keeping a second copy.
//
// It serves two jobs that look the same and are not, and the difference is the
// whole reason this file has the API it has:
//
//   A BATON, read once. `/bloom` sends the picture you liked to `/shop`. When
//   the seed came from a URL that is just `?u=` and this file is not involved.
//   When it came off your disk there is no URL to send, and the alternatives
//   are all worse:
//
//     a data: URL in the address bar   megabytes of base64 in a location, which
//                                      browsers truncate and history keeps
//     sessionStorage                   strings only, so base64 again, and a
//                                      ~5 MB quota a 12-megapixel photo blows
//     re-picking the file in /shop     asking someone to find the same file
//                                      twice after they already chose it
//
//   A RETURN ADDRESS, read after a round trip. `/shop` stashes its whole
//   session before an OAuth redirect and collects it when the authorization
//   server sends the browser back — see `core/session.js`.
//
// ⚠️ **These two must never share a key, and never share a read.** They did:
// the OAuth return URL carried the `?seed=` baton forward, and `takeSeed` had
// already deleted it on the way in. Every trip from /bloom through /shop to a
// post came back to an empty canvas — a guaranteed miss dressed as a stale
// link. So `take` (deletes) and `peek` (does not) are separate functions, and
// which one a caller wants is a decision, not a default.
//
// IndexedDB underneath both, because it takes structured clones: a Blob, a
// Uint8ClampedArray, a Float32Array all go in as themselves with no encoding
// and no realistic ceiling. Anything nobody collected is swept on the next
// write, so an abandoned hand-off cannot accumulate.

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

/** Read without consuming. For a value that may be needed more than once — a
 *  return address survives a reload of the page it returned to. */
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

/** Read and delete. For a baton: a picture that has been handed over has no
 *  business outliving the handover. */
export async function take(key) {
  if (!key) return null;
  const db = await open();
  const value = await new Promise((resolve) => {
    const req = tx(db, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => resolve(null);
  });
  if (value != null) {
    await new Promise((resolve) => {
      const req = tx(db, 'readwrite').delete(key);
      req.onsuccess = resolve;
      req.onerror = resolve;
    });
  }
  db.close();
  return value;
}

/** Throw one away by hand, when the caller knows it is spent. */
export async function drop(key) {
  if (!key) return;
  const db = await open();
  await new Promise((resolve) => {
    const req = tx(db, 'readwrite').delete(key);
    req.onsuccess = resolve;
    req.onerror = resolve;
  });
  db.close();
}

// ─────────────────────────────────────── the picture baton, by its old name ──

/** Store a blob, return the key to put in the URL. */
export const putSeed = (blob, key = freshKey('s')) => keep(blob, key);

/** Collect a blob and delete it. Returns null if the baton was never there. */
export const takeSeed = (key) => take(key);

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
