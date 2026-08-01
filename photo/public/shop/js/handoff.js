// handoff.js — passing a picture between two pages on this origin.
//
// Lives in /shop because shop is the hub every other tool hands a picture TO;
// /bloom imports it from here rather than keeping a second copy.
//
// `/bloom` sends the picture you liked to `/shop`. When the seed came from a
// URL that is just `?u=` and this file is not involved. When it came off your
// disk there is no URL to send, and the alternatives are all worse:
//
//   a data: URL in the address bar   megabytes of base64 in a location, which
//                                    browsers truncate and history keeps
//   sessionStorage                   strings only, so base64 again, and a ~5 MB
//                                    quota a 12-megapixel photograph blows
//   re-picking the file in /shop     asking someone to find the same file twice
//                                    after they already chose it
//
// IndexedDB takes the Blob itself, with no encoding and no realistic ceiling.
// The entry is deleted the moment it is read: this is a baton, not a store, and
// a picture that has been handed over has no business outliving the handover.
// Anything the reader never collected is swept on the next write, so a hand-off
// that is abandoned midway cannot accumulate.

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

/** Store a blob, return the key to put in the URL. */
export async function putSeed(blob, key = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`) {
  const db = await open();
  await sweep(db);
  await new Promise((resolve, reject) => {
    const req = tx(db, 'readwrite').put({ key, blob, at: Date.now() });
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  db.close();
  return key;
}

/** Collect a blob and delete it. Returns null if the baton was never there. */
export async function takeSeed(key) {
  if (!key) return null;
  const db = await open();
  const blob = await new Promise((resolve) => {
    const req = tx(db, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => resolve(null);
  });
  if (blob) {
    await new Promise((resolve) => {
      const req = tx(db, 'readwrite').delete(key);
      req.onsuccess = resolve;
      req.onerror = resolve;
    });
  }
  db.close();
  return blob;
}

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
