// drive.js — a file tree over ATProto records.
//
// A user's CAD data is a flat collection of records in their own repo (their
// PDS); this module makes it look like a filesystem with history. Nothing here
// is specific to a PDS: a *backend* is anything with the five repo calls below,
// and there are four — a Map (node, tests), IndexedDB (the browser's local
// drive), any public PDS read directly over XRPC (no sign-in), and the signed-in
// user's own repo through the shared auth worker.
//
//   com.minomobi.cad.revision   immutable: { tree, parents[], createdAt, message, kernel, invariants }
//   com.minomobi.cad.part       a head:    { path, name, kind, head: {uri, cid}, createdAt, updatedAt }
//
// The filesystem is a *view*: `path` is a field on the head record, directories
// are whatever the paths imply, and history is the parents chain of revisions
// (a strongRef, so a parent may sit in another repo — that is what a fork is).
// The record key of a head is a TID; the path is what a person addresses, the
// URI is what a machine addresses, and both are stable under rename/edit
// respectively.
//
// Backend contract (all async):
//   did
//   getRecord(collection, rkey)            → { uri, cid, value } | null
//   listRecords(collection, limit, cursor) → { records: [{ uri, cid, value }], cursor? }
//   createRecord(collection, record)       → { uri, cid }
//   putRecord(collection, rkey, record)    → { uri, cid }
//   deleteRecord(collection, rkey)
//
// The memory and IndexedDB backends mint cids as `local:<sha256>` — honest
// content hashes, NOT IPLD CIDs. A PDS will not accept a strongRef to one, so
// `push` recreates a local file's revisions on the PDS oldest-first and rewrites
// the refs as it goes; only then do they have real cids.

export const REVISION = 'com.minomobi.cad.revision';
export const PART = 'com.minomobi.cad.part';
export const SCOPE = `atproto repo:${PART} repo:${REVISION}`;

// ── addresses ─────────────────────────────────────────────────────────────
export function parseAtUri(uri) {
  const m = /^at:\/\/([^/]+)(?:\/([^/]+)(?:\/([^/?#]+))?)?/.exec(uri || '');
  if (!m) throw new Error(`not an AT URI: ${uri}`);
  return { did: m[1], collection: m[2] || null, rkey: m[3] || null };
}
export const atUri = (did, collection, rkey) => `at://${did}/${collection}/${rkey}`;

export function normalizePath(p) {
  const segs = String(p || '').split('/').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) throw new Error('empty path');
  for (const s of segs) if (s === '.' || s === '..') throw new Error(`bad path segment: ${s}`);
  return segs.join('/');
}
const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);

// ── floats ────────────────────────────────────────────────────────────────
// ATProto records are DAG-CBOR and the data model has NO floats: a PDS refuses
// `0.5` outright. So every non-integer number in a record is written as its
// shortest decimal string — which is still a valid tree, because the tree
// language reads a numeric string as an expression — and read back as a
// number. Integers pass through; a string that merely looks like a float
// (a user typing "0.5" as an expression) comes back as the number 0.5, which
// the engine evaluates identically.
const FLOAT = /^-?\d+\.\d+(?:e[+-]?\d+)?$/i;
export function encodeFloats(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : String(v);
  if (Array.isArray(v)) return v.map(encodeFloats);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = encodeFloats(v[k]); return o; }
  return v;
}
export function decodeFloats(v) {
  if (typeof v === 'string') return FLOAT.test(v) ? Number(v) : v;
  if (Array.isArray(v)) return v.map(decodeFloats);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = decodeFloats(v[k]); return o; }
  return v;
}
/** A revision record's value as the drive hands it out: floats restored in the tree and the invariants. */
const decodeRevision = (value) => ({ ...value, ...(value.tree !== undefined ? { tree: decodeFloats(value.tree) } : {}), ...(value.invariants ? { invariants: decodeFloats(value.invariants) } : {}) });

// ── tids and local cids ───────────────────────────────────────────────────
let lastTid = 0n;
export function tid() {
  let now = BigInt(Date.now()) * 1000n;
  if (now <= lastTid) now = lastTid + 1n;
  lastTid = now;
  const v = (now << 10n) | BigInt(Math.floor(Math.random() * 1024));
  const A = '234567abcdefghijklmnopqrstuvwxyz'; let s = ''; let x = v;
  for (let i = 0; i < 13; i++) { s = A[Number(x & 31n)] + s; x >>= 5n; }
  return s;
}
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
async function localCid(record) {
  const bytes = new TextEncoder().encode(canonical(record));
  const h = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return 'local:' + [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── backends ──────────────────────────────────────────────────────────────

/** A repo in memory. `persist(records)` (optional) is called after every write with
 *  the full record map, so a node CLI can keep it in a JSON file. */
export class MemoryBackend {
  constructor(did = 'did:local', { records, persist } = {}) {
    this.did = did; this.kind = 'memory'; this.persist = persist;
    this.records = new Map(Object.entries(records || {})); // `${collection}/${rkey}` → { uri, cid, value }
  }
  key(c, r) { return `${c}/${r}`; }
  async getRecord(c, r) { return this.records.get(this.key(c, r)) || null; }
  async listRecords(c, limit = 100, cursor) {
    const all = [...this.records.values()].filter((x) => x.uri.startsWith(`at://${this.did}/${c}/`)).sort((a, b) => (a.uri < b.uri ? 1 : -1));
    const start = cursor ? Number(cursor) : 0; const page = all.slice(start, start + limit);
    return { records: page, cursor: start + limit < all.length ? String(start + limit) : undefined };
  }
  async createRecord(c, value) { return this.putRecord(c, tid(), value); }
  async putRecord(c, r, value) {
    const cid = await localCid(value); const uri = atUri(this.did, c, r);
    this.records.set(this.key(c, r), { uri, cid, value });
    await this.persist?.(Object.fromEntries(this.records));
    return { uri, cid };
  }
  async deleteRecord(c, r) { this.records.delete(this.key(c, r)); await this.persist?.(Object.fromEntries(this.records)); }
}

/** The browser's local drive: one IndexedDB object store, same shape as memory. */
export class LocalBackend extends MemoryBackend {
  static async open(name = 'cad-drive', did = 'did:local') {
    const idb = globalThis.indexedDB;
    if (!idb) return new MemoryBackend(did);
    const db = await new Promise((res, rej) => { const q = idb.open(name, 1); q.onupgradeneeded = () => q.result.createObjectStore('records'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    const entries = await new Promise((res, rej) => {
      const out = {}; const s = db.transaction('records', 'readonly').objectStore('records');
      s.openCursor().onsuccess = (e) => { const c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      s.transaction.onerror = () => rej(s.transaction.error);
    });
    const b = new LocalBackend(did, { records: entries });
    b.kind = 'local';
    b.persist = (all) => new Promise((res, rej) => {
      const t = db.transaction('records', 'readwrite'); const s = t.objectStore('records');
      s.clear(); for (const [k, v] of Object.entries(all)) s.put(v, k);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
    return b;
  }
}

/** Any repo, read directly from its PDS over public XRPC. No sign-in. */
export class PublicBackend {
  constructor(did, pds, { fetch: f } = {}) { this.did = did; this.pds = pds.replace(/\/$/, ''); this.kind = 'public'; this.readonly = true; this.fetch = f || globalThis.fetch.bind(globalThis); }
  async xrpc(method, params) {
    const u = new URL(`${this.pds}/xrpc/${method}`); for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
    const res = await this.fetch(u); if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) throw new Error(`${method} ${res.status}`); return res.json();
  }
  async getRecord(c, r) { return this.xrpc('com.atproto.repo.getRecord', { repo: this.did, collection: c, rkey: r }); }
  async listRecords(c, limit = 100, cursor) { return (await this.xrpc('com.atproto.repo.listRecords', { repo: this.did, collection: c, limit: String(limit), cursor })) || { records: [] }; }
  async createRecord() { throw new Error('read-only: sign in to write to a PDS'); }
  async putRecord() { throw new Error('read-only: sign in to write to a PDS'); }
  async deleteRecord() { throw new Error('read-only: sign in to write to a PDS'); }
}

/** The signed-in user's own repo, through the shared auth worker (packages/oauth-client). */
export class AuthBackend {
  constructor(auth) { this.auth = auth; this.did = auth.getUser()?.did; this.kind = 'pds'; if (!this.did) throw new Error('not signed in'); }
  getRecord(c, r) { return this.auth.pds.getRecord(c, r); }
  listRecords(c, limit, cursor) { return this.auth.pds.listRecords(c, limit, cursor); }
  createRecord(c, v) { return this.auth.pds.createRecord(c, v); }
  putRecord(c, r, v) { return this.auth.pds.putRecord(c, r, v); }
  deleteRecord(c, r) { return this.auth.pds.deleteRecord(c, r); }
}

// ── identity, without importing packages/atproto (a static site cannot) ───
export async function resolveHandle(handle, f = globalThis.fetch) {
  const res = await f(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle.replace(/^@/, ''))}`);
  if (!res.ok) throw new Error(`could not resolve @${handle}`); return (await res.json()).did;
}
export async function resolvePds(did, f = globalThis.fetch) {
  const url = did.startsWith('did:plc:') ? `https://plc.directory/${did}` : did.startsWith('did:web:') ? `https://${did.slice(8)}/.well-known/did.json` : null;
  if (!url) throw new Error(`unsupported DID: ${did}`);
  const res = await f(url); if (!res.ok) throw new Error(`could not resolve ${did}`);
  const svc = (await res.json()).service?.find((s) => s.id === '#atproto_pds'); if (!svc) throw new Error(`no PDS for ${did}`);
  return svc.serviceEndpoint;
}

// ── the drive ─────────────────────────────────────────────────────────────
export class Drive {
  /**
   * @param backend the repo this drive writes to (and reads its files from)
   * @param opts.repos  did → backend, for records that live in other repos (parents, forks)
   * @param opts.pdsOf  async did → PDS url, used to open a PublicBackend for an unknown did (default: plc.directory)
   */
  constructor(backend, { repos = {}, pdsOf = resolvePds, fetch: f } = {}) {
    this.backend = backend; this.did = backend.did; this.repos = new Map(Object.entries(repos)); this.pdsOf = pdsOf; this.fetch = f;
    this.repos.set(this.did, backend);
  }
  async repo(did) {
    if (!this.repos.has(did)) this.repos.set(did, new PublicBackend(did, await this.pdsOf(did), { fetch: this.fetch }));
    return this.repos.get(did);
  }
  async fetchRecord(uri) { const { did, collection, rkey } = parseAtUri(uri); return (await this.repo(did)).getRecord(collection, rkey); }

  /** Every head in the repo, sorted by path. `prefix` narrows to a directory. */
  async list(prefix = '') {
    const out = []; let cursor;
    do { const page = await this.backend.listRecords(PART, 100, cursor); for (const r of page.records) if (r.value?.$type === PART) out.push(this.entry(r)); cursor = page.cursor; } while (cursor);
    const p = prefix ? normalizePath(prefix) + '/' : '';
    return out.filter((e) => e.path.startsWith(p)).sort((a, b) => (a.path < b.path ? -1 : 1));
  }
  entry(r) { const v = r.value; return { path: v.path, name: v.name || nameOf(v.path), kind: v.kind || 'part', uri: r.uri, cid: r.cid, rkey: parseAtUri(r.uri).rkey, head: v.head, createdAt: v.createdAt, updatedAt: v.updatedAt, description: v.description }; }

  /** The same list as a nested directory: { dirs: { name: {…} }, files: [entry] }. */
  async tree(prefix = '') {
    const root = { dirs: {}, files: [] };
    for (const e of await this.list(prefix)) {
      const segs = e.path.split('/'); let node = root;
      for (const s of segs.slice(0, -1)) node = node.dirs[s] ??= { dirs: {}, files: [] };
      node.files.push(e);
    }
    return root;
  }

  async find(path) { path = normalizePath(path); return (await this.list()).find((e) => e.path === path) || null; }

  /** A file by path or AT URI: its head entry and the revision it points at (tree inline). */
  async get(ref) {
    let entry;
    if (String(ref).startsWith('at://')) { const r = await this.fetchRecord(ref); if (!r) return null; entry = this.entry(r); }
    else { entry = await this.find(ref); if (!entry) return null; }
    const rev = await this.fetchRecord(entry.head.uri);
    if (!rev) throw new Error(`head revision missing: ${entry.head.uri}`);
    return { ...entry, revision: { uri: rev.uri, cid: rev.cid, ...decodeRevision(rev.value) } };
  }
  /** The tree inside any revision URI (a pinned version), floats restored. */
  async treeAt(uri) { const r = await this.fetchRecord(uri); if (!r?.value?.tree) throw new Error(`no tree at ${uri}`); return decodeFloats(r.value.tree); }

  /** Save a tree at a path: a new immutable revision whose parent is the current head, then the head moves.
   *  `parents` overrides the parent list (a fork or an import passes the source revision). */
  async put(path, tree, { message, kind, description, parents, kernel, invariants, forkedFrom } = {}) {
    path = normalizePath(path);
    const existing = await this.find(path);
    const revision = { $type: REVISION, tree: encodeFloats(tree), parents: parents ?? (existing ? [existing.head] : []), createdAt: new Date().toISOString() };
    if (message) revision.message = message; if (kernel) revision.kernel = kernel; if (invariants) revision.invariants = encodeFloats(invariants); if (forkedFrom) revision.forkedFrom = forkedFrom;
    const ref = await this.backend.createRecord(REVISION, revision);
    const head = { uri: ref.uri, cid: ref.cid };
    const now = revision.createdAt;
    const value = { $type: PART, path, name: nameOf(path), kind: kind || (Array.isArray(tree?.components) ? 'assembly' : 'part'), head, createdAt: existing?.createdAt || now, updatedAt: now };
    if (description ?? existing?.description) value.description = description ?? existing.description;
    const r = existing ? await this.backend.putRecord(PART, existing.rkey, value) : await this.backend.createRecord(PART, value);
    return { ...this.entry({ ...r, value }), revision: { ...head, ...decodeRevision(revision) } };
  }

  /** Move a file. The head record is updated in place, so its URI survives. */
  async rename(from, to) {
    const e = await this.find(from); if (!e) throw new Error(`no file at ${from}`);
    to = normalizePath(to); if (await this.find(to)) throw new Error(`${to} exists`);
    const r = await this.backend.getRecord(PART, e.rkey);
    const value = { ...r.value, path: to, name: nameOf(to), updatedAt: new Date().toISOString() };
    return this.entry({ ...(await this.backend.putRecord(PART, e.rkey, value)), value });
  }

  /** Delete the head. Revisions stay: they may be someone else's parents. */
  async remove(path) { const e = await this.find(path); if (!e) throw new Error(`no file at ${path}`); await this.backend.deleteRecord(PART, e.rkey); return e; }

  /** The mainline history of a file (first parent at each step), newest first. Crosses repos. */
  async history(ref, { limit = 50 } = {}) {
    const f = await this.get(ref); if (!f) return [];
    const out = []; let uri = f.head.uri; const seen = new Set();
    while (uri && out.length < limit && !seen.has(uri)) {
      seen.add(uri);
      const r = await this.fetchRecord(uri); if (!r) { out.push({ uri, missing: true }); break; }
      const { tree, ...meta } = decodeRevision(r.value);
      out.push({ uri: r.uri, cid: r.cid, did: parseAtUri(r.uri).did, ...meta, tree });
      uri = r.value.parents?.[0]?.uri;
    }
    return out;
  }

  /** Fork any file (by path in this drive, or an AT URI in any repo) to a path here. The new
   *  file's first revision has the source revision as its parent, so history crosses the repo boundary. */
  async fork(ref, toPath, { message } = {}) {
    const src = await this.get(ref); if (!src) throw new Error(`no file at ${ref}`);
    const parent = { uri: src.revision.uri, cid: src.revision.cid };
    // a local cid cannot be referenced from a PDS; keep the lineage in a way a PDS accepts
    const parents = this.backend.kind === 'pds' && parent.cid.startsWith('local:') ? [] : [parent];
    return this.put(toPath, src.revision.tree, { message: message || `fork of ${src.uri}`, kind: src.kind, description: src.description, parents, forkedFrom: src.uri });
  }

  /** Copy a file and its history from this drive into another (typically local → the signed-in PDS).
   *  Revisions are recreated oldest-first, so refs minted here (`local:` cids) become real ones there;
   *  revisions that already live in a real repo are referenced, not copied. */
  async push(path, target, { message } = {}) {
    const chain = (await this.history(path, { limit: 1000 })).reverse();
    const map = new Map(); let parentRef = null;
    for (const rev of chain) {
      if (rev.missing) continue;
      if (rev.did !== this.did || !rev.cid.startsWith('local:')) { parentRef = { uri: rev.uri, cid: rev.cid }; continue; }
      const value = { $type: REVISION, tree: encodeFloats(rev.tree), parents: parentRef ? [parentRef] : [], createdAt: rev.createdAt };
      for (const k of ['message', 'kernel', 'invariants']) if (rev[k] !== undefined) value[k] = encodeFloats(rev[k]);
      const ref = await target.backend.createRecord(REVISION, value);
      map.set(rev.uri, ref); parentRef = { uri: ref.uri, cid: ref.cid };
    }
    const src = await this.get(path);
    const existing = await target.find(path);
    const value = { $type: PART, path: src.path, name: src.name, kind: src.kind, head: parentRef, createdAt: existing?.createdAt || src.createdAt, updatedAt: new Date().toISOString() };
    if (src.description) value.description = src.description;
    const r = existing ? await target.backend.putRecord(PART, existing.rkey, value) : await target.backend.createRecord(PART, value);
    return { ...target.entry({ ...r, value }), revisions: map.size, message };
  }
}
