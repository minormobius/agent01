// Minimal, dependency-free ATProto *read* helpers for hoop.
//
// The OAuth client (vendor/auth.js) handles all *writes* and reads of the
// signed-in user's own repo through the auth worker proxy. To show a shared,
// collaborative thread we also need to read our crew-mates' repos — which are
// public — so these helpers resolve handle → DID → PDS and list records with
// plain unauthenticated XRPC. Trimmed from packages/atproto/{pds,bsky}.js.

const PUBLIC_API = 'https://public.api.bsky.app';
const PLC_DIRECTORY = 'https://plc.directory';

const _handleCache = new Map(); // handle -> did
const _pdsCache = new Map();    // did -> pds origin
const _profileCache = new Map(); // did -> { handle, avatar, did }

/** Resolve a handle (or pass a did through) to a DID. */
export async function resolveDid(handleOrDid) {
  if (!handleOrDid) return null;
  if (handleOrDid.startsWith('did:')) return handleOrDid;
  const handle = handleOrDid.replace(/^@/, '').toLowerCase();
  if (_handleCache.has(handle)) return _handleCache.get(handle);
  try {
    const r = await fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
    if (!r.ok) return null;
    const { did } = await r.json();
    if (did) _handleCache.set(handle, did);
    return did || null;
  } catch {
    return null;
  }
}

/** Resolve a DID to its PDS service endpoint origin. */
export async function resolvePds(did) {
  if (!did) return null;
  if (_pdsCache.has(did)) return _pdsCache.get(did);
  try {
    let doc;
    if (did.startsWith('did:plc:')) {
      const r = await fetch(`${PLC_DIRECTORY}/${did}`);
      if (!r.ok) return null;
      doc = await r.json();
    } else if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).replace(/:/g, '/');
      const r = await fetch(`https://${host}/.well-known/did.json`);
      if (!r.ok) return null;
      doc = await r.json();
    } else {
      return null;
    }
    const svc = (doc.service || []).find(
      (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
    );
    const endpoint = svc?.serviceEndpoint || null;
    if (endpoint) _pdsCache.set(did, endpoint.replace(/\/$/, ''));
    return endpoint ? endpoint.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/** List every record in a public repo collection (paginated, capped). */
export async function listRepoRecords(handleOrDid, collection, { limit = 100, maxPages = 5 } = {}) {
  const did = await resolveDid(handleOrDid);
  if (!did) return [];
  const pds = await resolvePds(did);
  if (!pds) return [];
  const out = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', did);
    u.searchParams.set('collection', collection);
    u.searchParams.set('limit', String(limit));
    if (cursor) u.searchParams.set('cursor', cursor);
    let data;
    try {
      const r = await fetch(u);
      if (!r.ok) break;
      data = await r.json();
    } catch {
      break;
    }
    for (const rec of data.records || []) out.push({ ...rec, _did: did });
    cursor = data.cursor;
    if (!cursor || !(data.records || []).length) break;
  }
  return out;
}

/** Best-effort {handle, avatar, did} for a DID. Cached. Falls back to the DID. */
export async function profileForDid(did) {
  if (!did) return { handle: 'unknown', avatar: null, did: null };
  if (_profileCache.has(did)) return _profileCache.get(did);
  let prof = { handle: did, avatar: null, did };
  try {
    const r = await fetch(`${PUBLIC_API}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (r.ok) {
      const p = await r.json();
      prof = { handle: p.handle || did, avatar: p.avatar || null, did };
    }
  } catch { /* keep fallback */ }
  _profileCache.set(did, prof);
  return prof;
}

/** Best-effort handle for a DID (for display). Falls back to the DID. */
export async function handleForDid(did) {
  return (await profileForDid(did)).handle;
}
