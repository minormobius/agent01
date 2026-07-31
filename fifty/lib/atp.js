// fifty/lib/atp.js — read-only ATProto/Bluesky client for the tools.
//
// Everything goes through this surface's own worker at /api/*, which proxies to
// an allowlist of atproto hosts. Two reasons: browsers cannot rely on every PDS
// sending CORS headers, and routing through one place means one cache and one
// place to fix when an endpoint moves. No auth anywhere — every call here is a
// public read. Nothing in this file can write to anyone's repo.
//
//   const id   = await ATP.resolve('alice.bsky.social');   // {did, pds, handle}
//   const cols = await ATP.collections(id);                 // ['app.bsky.feed.post', …]
//   const recs = await ATP.records(id, 'app.bsky.feed.post', 100);

const API = '/api';

// ─────────────────────────────────────────────────── low level ──

async function j(url, { timeout = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
    const body = await res.text();
    let data = null;
    try { data = body ? JSON.parse(body) : null; } catch { /* non-JSON */ }
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
      throw new ATPError(msg, res.status, data);
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new ATPError('request timed out', 0, null);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export class ATPError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ATPError';
    this.status = status;
    this.data = data;
  }
}

/** Call an appview XRPC method (public.api.bsky.app). */
export function appview(nsid, params = {}) {
  const q = new URLSearchParams(params);
  return j(`${API}/appview/${nsid}?${q}`);
}

/** Call an XRPC method on a specific PDS host. */
export function pds(host, nsid, params = {}) {
  const q = new URLSearchParams({ ...params, __pds: host });
  return j(`${API}/pds/${nsid}?${q}`);
}

// ────────────────────────────────────────────────────── identity ──

const idCache = new Map();

/**
 * Handle or DID → { did, handle, pds }.
 * `pds` is read from the DID document, so records come from the repo that
 * actually holds them rather than from the appview's copy.
 */
export async function resolve(input) {
  const key = String(input || '').trim().replace(/^@/, '').toLowerCase();
  if (!key) throw new ATPError('no handle given', 0, null);
  if (idCache.has(key)) return idCache.get(key);

  const p = (async () => {
    let did = key;
    if (!key.startsWith('did:')) {
      const r = await appview('com.atproto.identity.resolveHandle', { handle: key });
      did = r.did;
    }
    const doc = await j(`${API}/did/${encodeURIComponent(did)}`);
    const svc = (doc.service || []).find(
      (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
    );
    const host = svc ? String(svc.serviceEndpoint).replace(/\/+$/, '') : 'https://bsky.social';
    const handle = (doc.alsoKnownAs || [])
      .map((a) => String(a).replace(/^at:\/\//, ''))
      .find(Boolean) || (key.startsWith('did:') ? did : key);
    return { did, handle, pds: host, doc };
  })();

  idCache.set(key, p);
  try {
    const v = await p;
    idCache.set(v.did, Promise.resolve(v));
    return v;
  } catch (e) {
    idCache.delete(key);
    throw e;
  }
}

/** The public Bluesky profile for a DID or handle. */
export async function profile(actor) {
  return appview('app.bsky.actor.getProfile', { actor });
}

/** Profiles in bulk, batched at the API's limit of 25. Returns Map<did, profile>. */
export async function profiles(actors) {
  const out = new Map();
  for (let i = 0; i < actors.length; i += 25) {
    const batch = actors.slice(i, i + 25);
    const q = new URLSearchParams();
    for (const a of batch) q.append('actors', a);
    try {
      const r = await j(`${API}/appview/app.bsky.actor.getProfiles?${q}`);
      for (const p of r.profiles || []) out.set(p.did, p);
    } catch { /* a bad actor in the batch shouldn't sink the rest */ }
  }
  return out;
}

// ─────────────────────────────────────────────────────── repos ──

/** Every collection NSID present in a repo. */
export async function collections(id) {
  const who = typeof id === 'string' ? await resolve(id) : id;
  const r = await pds(who.pds, 'com.atproto.repo.describeRepo', { repo: who.did });
  return r.collections || [];
}

/**
 * List records from a collection, paging until `limit` or exhaustion.
 * Returns the raw records: [{ uri, cid, value }].
 */
export async function records(id, collection, limit = 100, { reverse = false } = {}) {
  const who = typeof id === 'string' ? await resolve(id) : id;
  const out = [];
  let cursor;
  while (out.length < limit) {
    const params = {
      repo: who.did,
      collection,
      limit: String(Math.min(100, limit - out.length)),
    };
    if (cursor) params.cursor = cursor;
    if (reverse) params.reverse = 'true';
    const r = await pds(who.pds, 'com.atproto.repo.listRecords', params);
    const batch = r.records || [];
    out.push(...batch);
    cursor = r.cursor;
    if (!cursor || batch.length === 0) break;
  }
  return out.slice(0, limit);
}

/** A single record by at:// URI, or by (id, collection, rkey). */
export async function record(id, collection, rkey) {
  const who = typeof id === 'string' ? await resolve(id) : id;
  return pds(who.pds, 'com.atproto.repo.getRecord', { repo: who.did, collection, rkey });
}

// ──────────────────────────────────────────────────── social ──

/** Author feed, paged. `filter` defaults to top-level posts. */
export async function authorFeed(actor, limit = 100, filter = 'posts_no_replies') {
  const out = [];
  let cursor;
  while (out.length < limit) {
    const params = { actor, limit: String(Math.min(100, limit - out.length)), filter };
    if (cursor) params.cursor = cursor;
    const r = await appview('app.bsky.feed.getAuthorFeed', params);
    const batch = r.feed || [];
    out.push(...batch);
    cursor = r.cursor;
    if (!cursor || batch.length === 0) break;
  }
  return out.slice(0, limit);
}

/** Everyone an actor follows. */
export async function follows(actor, limit = 1000) {
  const out = [];
  let cursor;
  while (out.length < limit) {
    const params = { actor, limit: '100' };
    if (cursor) params.cursor = cursor;
    const r = await appview('app.bsky.graph.getFollows', params);
    const batch = r.follows || [];
    out.push(...batch);
    cursor = r.cursor;
    if (!cursor || batch.length === 0) break;
  }
  return out.slice(0, limit);
}

/** A whole post thread (used to reconstruct self-threads). */
export function thread(uri, depth = 30) {
  return appview('app.bsky.feed.getPostThread', { uri, depth: String(depth), parentHeight: '0' });
}

// ──────────────────────────────────────────────────── helpers ──

/** at://did/collection/rkey → { did, collection, rkey } */
export function parseUri(uri) {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(String(uri || ''));
  return m ? { did: m[1], collection: m[2], rkey: m[3] } : null;
}

/** at:// post URI → the bsky.app permalink for it. */
export function webUrl(uri, handle) {
  const p = parseUri(uri);
  if (!p) return '#';
  const who = handle || p.did;
  if (p.collection === 'app.bsky.feed.post') return `https://bsky.app/profile/${who}/post/${p.rkey}`;
  return `https://bsky.app/profile/${who}`;
}

/** Sortable, roughly-monotonic record key, the way PDS implementations mint them. */
export function tid() {
  const chars = '234567abcdefghijklmnopqrstuvwxyz';
  let n = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  n = (n << 10n) | BigInt(Math.floor(Math.random() * 1024));
  let s = '';
  for (let i = 0; i < 13; i++) { s = chars[Number(n & 31n)] + s; n >>= 5n; }
  return s;
}

// A convenience global so tool pages can use this without module plumbing.
export const ATP = {
  ATPError, appview, pds, resolve, profile, profiles, collections,
  records, record, authorFeed, follows, thread, parseUri, webUrl, tid,
};
if (typeof window !== 'undefined') window.ATP = ATP;
export default ATP;
