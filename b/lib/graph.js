// graph.js — follow-graph reads that do not waste requests.
//
// Shared by /knot and available to anything else here that needs the follow
// graph. Three things it does that the naive path does not:
//
//   LISTRECORDS, NOT GETFOLLOWS. Both page at 100 and neither will go higher —
//   measured, `limit=200` is InvalidRequest on both. But getFollows hydrates a
//   full profile per follow (avatar, description, labels, viewer state) that a
//   graph walk throws away: 957 KB against 464 KB for the same account, and
//   144 ms per request against 58 ms. Over the ~20,000 requests a 1,300-mutual
//   clustering needs, that difference is about half an hour.
//
//   It is also MORE COMPLETE. On minormobius, listRecords returned 1,707 follow
//   records where getFollows returned 1,509 — the AppView silently drops follows
//   to deactivated, deleted and blocked accounts. A graph built from getFollows
//   is quietly missing 12% of its edges.
//
//   PDS RESOLUTION IS CACHED FOREVER. listRecords is a PDS endpoint, so each DID
//   costs one plc.directory lookup first. That would be 1,300 extra requests, so
//   it is cached in IndexedDB with no expiry — a PDS almost never moves, and a
//   wrong one fails loudly rather than silently.
//
//   FOLLOWERS STILL COME FROM THE APPVIEW. Your followers are other people's
//   records, not yours, so there is no repo to read them from. getFollowers is
//   the only route and it pages at 100 like everything else.

const PLC = 'https://plc.directory';
const PUBLIC_API = 'https://public.api.bsky.app/xrpc';

// ── a tiny IndexedDB keyed store ─────────────────────────────────────────────
const DB = 'b-graph', VERSION = 1;
const STORES = { pds: null, follows: 6 * 60 * 60 * 1000 };   // ms TTL, null = forever

function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      for (const name of Object.keys(STORES)) {
        if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name);
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function cacheGet(store, key) {
  try {
    const db = await idb();
    const hit = await new Promise((res, rej) => {
      const t = db.transaction(store, 'readonly').objectStore(store).get(key);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
    if (!hit) return null;
    const ttl = STORES[store];
    if (ttl !== null && (Date.now() - hit.at) > ttl) return null;
    return hit.v;
  } catch { return null; }
}
async function cachePut(store, key, v) {
  try {
    const db = await idb();
    await new Promise((res) => {
      const t = db.transaction(store, 'readwrite').objectStore(store).put({ at: Date.now(), v }, key);
      t.onsuccess = () => res(); t.onerror = () => res();
    });
  } catch { /* the cache is a nicety */ }
}
export async function forgetGraphCache() {
  try {
    const db = await idb();
    for (const name of Object.keys(STORES)) {
      await new Promise((res) => {
        const t = db.transaction(name, 'readwrite').objectStore(name).clear();
        t.onsuccess = () => res(); t.onerror = () => res();
      });
    }
  } catch { /* nothing to clear */ }
}

// ── request plumbing ─────────────────────────────────────────────────────────
export const stats = { requests: 0, bytes: 0, cacheHits: 0 };

async function getJSON(url, { signal, retries = 2 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      if (attempt >= retries) throw e;
      await sleep(300 * (attempt + 1)); continue;
    }
    stats.requests++;
    // 429 and 5xx are worth another go; a 400 never is.
    if (!res.ok) {
      if (attempt >= retries || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        throw new Error(`${res.status} on ${new URL(url).pathname}`);
      }
      await sleep(500 * (attempt + 1)); continue;
    }
    const text = await res.text();
    stats.bytes += text.length;
    return JSON.parse(text);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run `fn` over `items` with a fixed number of workers. Order is not preserved. */
export async function pool(items, concurrency, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// ── identity ─────────────────────────────────────────────────────────────────
/** DID → its PDS host. Cached with no expiry; a PDS move is rare and fails loudly. */
export async function pdsFor(did, opts = {}) {
  const hit = await cacheGet('pds', did);
  if (hit) { stats.cacheHits++; return hit; }
  let doc;
  if (did.startsWith('did:plc:')) doc = await getJSON(`${PLC}/${did}`, opts);
  else if (did.startsWith('did:web:')) doc = await getJSON(`https://${did.slice(8)}/.well-known/did.json`, opts);
  else throw new Error(`unsupported DID method: ${did}`);
  const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error(`no PDS for ${did}`);
  await cachePut('pds', did, svc.serviceEndpoint);
  return svc.serviceEndpoint;
}

// ── the graph ────────────────────────────────────────────────────────────────
/**
 * Every DID `did` follows, straight out of their repo. Cached for 6h.
 * @returns {Promise<string[]>}
 */
export async function followsOf(did, opts = {}) {
  const hit = await cacheGet('follows', did);
  if (hit) { stats.cacheHits++; return hit; }

  const pds = await pdsFor(did, opts);
  const out = [];
  let cursor;
  do {
    const u = `${pds.replace(/\/$/, '')}/xrpc/com.atproto.repo.listRecords`
      + `?repo=${encodeURIComponent(did)}&collection=app.bsky.graph.follow&limit=100`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const j = await getJSON(u, opts);
    for (const r of (j.records || [])) {
      const s = r.value && r.value.subject;
      if (typeof s === 'string') out.push(s);
    }
    cursor = j.cursor;
  } while (cursor);

  await cachePut('follows', did, out);
  return out;
}

/** Everyone who follows `did`. AppView only — these are not your records. */
export async function followersOf(did, { onProgress, ...opts } = {}) {
  const out = [];
  let cursor;
  do {
    const u = `${PUBLIC_API}/app.bsky.graph.getFollowers?actor=${encodeURIComponent(did)}&limit=100`
      + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const j = await getJSON(u, opts);
    for (const f of (j.followers || [])) out.push(f.did);
    cursor = j.cursor;
    if (onProgress) onProgress(out.length);
  } while (cursor);
  return out;
}

/** The accounts you follow who follow you back. */
export async function mutualsOf(did, { onProgress, ...opts } = {}) {
  const [follows, followers] = await Promise.all([
    followsOf(did, opts),
    followersOf(did, { onProgress, ...opts }),
  ]);
  const back = new Set(followers);
  return { mutuals: follows.filter((d) => back.has(d)), follows, followers };
}

/**
 * Relationships between one actor and up to 30 others, in a single request.
 * Cheaper than a full row when the set is small — the crossover is at roughly
 * M = 0.3 x (that account's follow count), so it is the wrong tool above a few
 * hundred and the right one below.
 */
export async function relationships(actor, others, opts = {}) {
  if (others.length > 30) throw new Error('getRelationships takes at most 30 others');
  const qs = others.map((d) => `others=${encodeURIComponent(d)}`).join('&');
  const j = await getJSON(`${PUBLIC_API}/app.bsky.graph.getRelationships?actor=${encodeURIComponent(actor)}&${qs}`, opts);
  return (j.relationships || []).map((r) => ({
    did: r.did, following: !!r.following, followedBy: !!r.followedBy,
  }));
}

/** Display names and avatars, 25 at a time. Decoration — never throws. */
export async function profiles(dids, opts = {}) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const qs = dids.slice(i, i + 25).map((d) => `actors=${encodeURIComponent(d)}`).join('&');
    try {
      const j = await getJSON(`${PUBLIC_API}/app.bsky.actor.getProfiles?${qs}`, opts);
      for (const p of (j.profiles || [])) out.set(p.did, { handle: p.handle, name: p.displayName || '', avatar: p.avatar || '' });
    } catch { /* decoration */ }
  }
  return out;
}
