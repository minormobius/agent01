// board/store.js — where boards live.
//
// Two tiers, always both:
//
//   local   every board is mirrored into localStorage the instant it changes,
//           and dropped media goes into IndexedDB. This is what makes the app
//           usable before you sign in, on a plane, and during the 1.2s the
//           debounce is waiting.
//   PDS     the authoritative copy, one record per board in the author's repo,
//           written through the shared auth worker.
//
// Local is a cache with one exception: a board created signed-out is genuinely
// only local until you sign in, at which point `promoteLocal` stamps it with
// your DID, uploads its pending blobs and writes it up. Boards mint their own
// rkey at birth precisely so that promotion is a fill-in-the-blanks operation
// and never a re-identification.

import { AuthClient } from './vendor/auth.js';
import {
  COLLECTION, toRecord, fromRecord, withIdentity, createBoard, parseAtUri, recordSize, sizeStatus, SIZE_LIMIT,
} from './engine.js';
import { resolvePds } from './media.js';

const LS_DOCS = 'board.docs.v1';
const LS_LAST = 'board.last.v1';
const SAVE_DEBOUNCE_MS = 1200;

/** The narrowest scope that does the job — the consent screen should read like
 *  a description of this app and nothing else. */
export const SCOPE = [
  'atproto',
  `repo:${COLLECTION}`,
  'blob:image/*',
  'blob:audio/*',
  'blob:application/octet-stream',
].join(' ');

// -------------------------------------------------------------- rkeys -----

const TID_CHARS = '234567abcdefghijklmnopqrstuvwxyz';
let tidLast = 0;
let tidClock = 0;

/** A TID, the rkey format ATProto sorts records by. Monotonic within a tab. */
export function generateTid() {
  let now = Date.now() * 1000;
  if (now <= tidLast) now = ++tidLast; else tidLast = now;
  const clock = (tidClock = (tidClock + 1) % 1024);
  let n = BigInt(now) * 1024n + BigInt(clock);
  let s = '';
  for (let i = 0; i < 13; i++) {
    s = TID_CHARS[Number(n % 32n)] + s;
    n /= 32n;
  }
  return s;
}

// ------------------------------------------------------ local mirror ------

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LS_DOCS) || '{}') || {};
  } catch {
    return {};
  }
}

function writeLocal(all) {
  try {
    localStorage.setItem(LS_DOCS, JSON.stringify(all));
    return true;
  } catch {
    return false; // quota — the PDS copy is the one that matters anyway
  }
}

// ------------------------------------------------- pending media (IDB) ----
// Bytes dropped before sign-in. Kept out of localStorage because a couple of
// photos would blow the 5 MB quota and take every board with them.

const DB_NAME = 'board-media';
let dbPromise = null;

function idb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('blobs');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    return undefined;
  });
  return dbPromise;
}

async function idbPut(key, value) {
  const db = await idb();
  if (!db) return false;
  return new Promise((res) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put(value, key);
    tx.oncomplete = () => res(true);
    tx.onerror = () => res(false);
  });
}

async function idbGet(key) {
  const db = await idb();
  if (!db) return null;
  return new Promise((res) => {
    const tx = db.transaction('blobs', 'readonly');
    const r = tx.objectStore('blobs').get(key);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => res(null);
  });
}

async function idbDelete(key) {
  const db = await idb();
  if (!db) return;
  const tx = db.transaction('blobs', 'readwrite');
  tx.objectStore('blobs').delete(key);
}

// --------------------------------------------------------------- store ----

export class BoardStore extends EventTarget {
  constructor() {
    super();
    this.auth = new AuthClient();
    this.user = null;
    this.status = 'local';        // local | saving | saved | error | readonly
    this.detail = '';
    this._timers = new Map();     // rkey → debounce timer
    this._inflight = new Map();   // rkey → promise
    this._dirty = new Map();      // rkey → doc awaiting write
  }

  async init() {
    this.auth.onAuthChange((user) => {
      const wasOut = !this.user;
      this.user = user;
      this._emit('auth', { user });
      if (user && wasOut) this.promoteLocal().catch(() => {});
    });
    try {
      await this.auth.init();
    } catch { /* offline: local tier still works */ }
    this.user = this.auth.getUser();
    return this.user;
  }

  get did() { return this.user?.did || null; }
  get signedIn() { return !!this.user; }

  login(handle) {
    return this.auth.login(handle, { scope: SCOPE });
  }

  logout() {
    return this.auth.logout();
  }

  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  _setStatus(status, detail = '') {
    this.status = status;
    this.detail = detail;
    this._emit('status', { status, detail });
  }

  // ------------------------------------------------------------ index ----

  /** Every board this user has, newest first. Local drafts are folded in. */
  async list() {
    const local = readLocal();
    const byRkey = new Map();

    for (const [rkey, doc] of Object.entries(local)) {
      byRkey.set(rkey, {
        rkey,
        title: doc.title || 'Untitled board',
        updatedAt: doc.updatedAt || doc.createdAt || null,
        count: (doc.items || []).length,
        parent: doc.parent || null,
        local: !doc.did,
      });
    }

    if (this.signedIn) {
      try {
        let cursor;
        do {
          const page = await this.auth.pds.listRecords(COLLECTION, 100, cursor);
          for (const rec of page.records || []) {
            const rkey = parseAtUri(rec.uri)?.rkey;
            if (!rkey) continue;
            byRkey.set(rkey, {
              rkey,
              title: rec.value?.title || 'Untitled board',
              updatedAt: rec.value?.updatedAt || rec.value?.createdAt || null,
              count: (rec.value?.items || []).length,
              parent: rec.value?.parent || null,
              local: false,
            });
          }
          cursor = page.cursor;
        } while (cursor);
      } catch (e) {
        this._emit('warn', { message: `Could not list boards: ${e.message}` });
      }
    }

    return [...byRkey.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  // ------------------------------------------------------------- load ----

  /** Load one of the signed-in user's boards (PDS first, local mirror second). */
  async load(rkey) {
    if (this.signedIn) {
      try {
        const res = await this.auth.pds.getRecord(COLLECTION, rkey);
        if (res?.value) {
          const doc = fromRecord(res.value, { did: this.did, rkey, cid: res.cid });
          this._mirror(doc);
          return doc;
        }
      } catch (e) {
        this._emit('warn', { message: `Falling back to the local copy: ${e.message}` });
      }
    }
    const local = readLocal()[rkey];
    if (local) return this._rehydrate(local);
    return null;
  }

  /** Read anyone's board straight off their PDS. No auth, no appview. */
  async loadForeign(did, rkey) {
    const pds = await resolvePds(did);
    if (!pds) throw new Error(`Could not find the PDS for ${did}`);
    const params = new URLSearchParams({ repo: did, collection: COLLECTION, rkey });
    const r = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!r.ok) throw new Error(r.status === 400 ? 'No such board' : `PDS said ${r.status}`);
    const j = await r.json();
    return fromRecord(j.value, { did, rkey, cid: j.cid });
  }

  /** A board's doc, wherever it lives — used to follow a portal. */
  async loadUri(uri) {
    const parts = parseAtUri(uri);
    if (!parts) return null;
    if (this.did && parts.did === this.did) return this.load(parts.rkey);
    return this.loadForeign(parts.did, parts.rkey);
  }

  _rehydrate(raw) {
    // Local docs are stored as docs, not records, so this is mostly a copy —
    // but run it through createBoard so a doc written by an older build picks
    // up any fields added since.
    const base = createBoard({
      rkey: raw.rkey, did: raw.did, title: raw.title,
      parent: raw.parent, parentRkey: raw.parentRkey, createdAt: raw.createdAt,
    });
    return { ...base, ...raw, items: raw.items || [], edges: raw.edges || [] };
  }

  // ------------------------------------------------------------- save ----

  /** Mirror locally now; write to the PDS after the dust settles. */
  save(doc, { immediate = false } = {}) {
    if (!doc?.rkey) return;
    if (doc.readonly) return;
    this._mirror(doc);
    this._dirty.set(doc.rkey, doc);

    if (!this.signedIn) {
      this._setStatus('local', 'saved on this device');
      return;
    }

    const bytes = recordSize(doc);
    if (sizeStatus(bytes) === 'over') {
      this._setStatus('error', `This board is ${Math.round(bytes / 1024)} KB — too big for one record. Nest part of it into a child board.`);
      return;
    }

    clearTimeout(this._timers.get(doc.rkey));
    if (immediate) return this._flush(doc.rkey);
    this._setStatus('saving');
    this._timers.set(doc.rkey, setTimeout(() => this._flush(doc.rkey), SAVE_DEBOUNCE_MS));
    return undefined;
  }

  /** Write every pending board now. Used on navigation and page hide. */
  async flushAll() {
    await Promise.all([...this._dirty.keys()].map((rkey) => this._flush(rkey)));
  }

  async _flush(rkey) {
    const doc = this._dirty.get(rkey);
    if (!doc || !this.signedIn) return;
    if (this._inflight.has(rkey)) return this._inflight.get(rkey);

    const p = (async () => {
      try {
        this._setStatus('saving');
        const now = new Date().toISOString();
        const record = toRecord(withIdentity(doc, this.did), now);
        const res = await this.auth.pds.putRecord(COLLECTION, rkey, record);
        // Only clear the dirty flag if nothing changed while we were writing.
        if (this._dirty.get(rkey) === doc) this._dirty.delete(rkey);
        doc.cid = res?.cid || doc.cid;
        doc.updatedAt = now;
        this._mirror(doc);
        this._setStatus('saved');
        this._emit('saved', { rkey, cid: doc.cid });
      } catch (e) {
        this._setStatus('error', e.message || 'Save failed');
      } finally {
        this._inflight.delete(rkey);
      }
    })();
    this._inflight.set(rkey, p);
    return p;
  }

  _mirror(doc) {
    const all = readLocal();
    all[doc.rkey] = {
      rkey: doc.rkey, did: doc.did || null, uri: doc.uri || null, title: doc.title,
      parent: doc.parent || null, parentRkey: doc.parentRkey || null,
      createdAt: doc.createdAt, updatedAt: doc.updatedAt,
      background: doc.background, camera: doc.camera, tags: doc.tags || [],
      items: doc.items, edges: doc.edges,
    };
    if (!writeLocal(all)) this._emit('warn', { message: 'Local storage is full — this device will not keep an offline copy.' });
    try { localStorage.setItem(LS_LAST, doc.rkey); } catch { /* non-fatal */ }
  }

  lastOpened() {
    try { return localStorage.getItem(LS_LAST); } catch { return null; }
  }

  async remove(rkey) {
    const all = readLocal();
    delete all[rkey];
    writeLocal(all);
    this._dirty.delete(rkey);
    if (this.signedIn) {
      try {
        await this.auth.pds.deleteRecord(COLLECTION, rkey);
      } catch (e) {
        this._emit('warn', { message: `Deleted locally, but the PDS said: ${e.message}` });
      }
    }
  }

  // ------------------------------------------------------------ blobs ----

  /**
   * Upload bytes and return a blob ref. Signed out, the bytes are parked in
   * IndexedDB under a local key and the item is marked `pending` — the item
   * renders from the local copy and is withheld from the record until the
   * upload happens at sign-in.
   */
  async putMedia(data, mimeType) {
    if (this.signedIn) {
      const blob = await this.auth.pds.uploadBlob(data, mimeType);
      return { blob, pending: null, url: URL.createObjectURL(new Blob([data], { type: mimeType })) };
    }
    const key = `pending:${generateTid()}`;
    await idbPut(key, { data, mimeType });
    return { blob: null, pending: key, url: URL.createObjectURL(new Blob([data], { type: mimeType })) };
  }

  /** An object URL for media that has not been uploaded yet. */
  async pendingUrl(key) {
    const entry = await idbGet(key);
    if (!entry) return null;
    return URL.createObjectURL(new Blob([entry.data], { type: entry.mimeType }));
  }

  // -------------------------------------------------------- promotion ----

  /**
   * Sign-in housekeeping: stamp local boards with the new DID, upload anything
   * that was waiting in IndexedDB, write everything up. Runs once per sign-in,
   * best effort — a failure leaves the local copy exactly as it was.
   */
  async promoteLocal() {
    if (!this.signedIn) return { boards: 0, blobs: 0 };
    const all = readLocal();
    const orphans = Object.values(all).filter((d) => !d.did);
    let blobs = 0;

    for (const raw of orphans) {
      const doc = withIdentity(this._rehydrate(raw), this.did);
      for (const item of doc.items) {
        if (!item.pending) continue;
        const entry = await idbGet(item.pending);
        if (!entry) continue;
        try {
          const ref = await this.auth.pds.uploadBlob(entry.data, entry.mimeType);
          if (item.kind === 'image') item.image = ref;
          else if (item.kind === 'audio') item.audio = ref;
          else item.file = ref;
          await idbDelete(item.pending);
          item.pending = null;
          blobs++;
        } catch { /* leave it pending; the next sign-in will try again */ }
      }
      this._mirror(doc);
      this._dirty.set(doc.rkey, doc);
      await this._flush(doc.rkey);
    }

    if (orphans.length) this._emit('promoted', { boards: orphans.length, blobs });
    return { boards: orphans.length, blobs };
  }

  /** Bytes this board would occupy as a record, and whether that is a problem. */
  budget(doc) {
    const bytes = recordSize(doc);
    return { bytes, status: sizeStatus(bytes), limit: SIZE_LIMIT };
  }
}
