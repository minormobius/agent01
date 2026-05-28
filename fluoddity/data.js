// Shared ATProto + Constellation helpers for the garden surfaces.
// (The gallery index keeps its own inline copy for now; new surfaces import this.)

export const COLLECTION = 'com.minomobi.fluoddity.organism';
export const ANCHOR = 'did:web:g.mino.mobi';
// Expeditions — one record per breeder run, an aggregate trajectory through
// phase space. Anchored under a separate field name so Constellation enumerates
// them independently from organisms even though they share the anchor DID.
export const EXPEDITION_COLLECTION = 'com.minomobi.fluoddity.expedition';
export const EXPEDITION_PATH = '.forest';
const CONSTELLATION = 'https://constellation.microcosm.blue';
const BSKY = 'https://public.api.bsky.app';

const pdsCache = {}, profCache = {};

export function parseAtUri(uri) { const p = String(uri).replace(/^at:\/\//, '').split('/'); return { did: p[0], collection: p[1], rkey: p[2] }; }
export function parseConfig(value) { let c = value && value.config; if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = null; } } return c; }

export async function resolvePds(did) {
  if (pdsCache[did] !== undefined) return pdsCache[did];
  let doc = null;
  try {
    if (did.startsWith('did:web:')) {
      const host = decodeURIComponent(did.slice(8)).split(':')[0];
      doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
    } else {
      doc = await (await fetch(`https://plc.directory/${encodeURIComponent(did)}`)).json();
    }
  } catch { /* unresolvable */ }
  const svc = doc && (doc.service || []).find(s => s.id.endsWith('atproto_pds') || s.type === 'AtprotoPersonalDataServer');
  pdsCache[did] = (svc && svc.serviceEndpoint) || null;
  return pdsCache[did];
}

export async function getRecord(did, rkey, collection = COLLECTION) {
  const pds = await resolvePds(did);
  if (!pds) throw new Error('no PDS');
  const r = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${collection}&rkey=${encodeURIComponent(rkey)}`);
  if (!r.ok) throw new Error('getRecord ' + r.status);
  return r.json();
}

export async function getProfile(actor) {
  if (profCache[actor] !== undefined) return profCache[actor];
  try { const r = await fetch(`${BSKY}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`); profCache[actor] = r.ok ? await r.json() : null; }
  catch { profCache[actor] = null; }
  return profCache[actor];
}

export async function links(target, path, limit = 100, cursor = null, collection = COLLECTION) {
  const params = new URLSearchParams({ target, collection, path, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const r = await fetch(`${CONSTELLATION}/links?${params}`);
  if (!r.ok) return { linking_records: [], cursor: null, total: 0 };
  const j = await r.json();
  return { linking_records: j.linking_records || [], cursor: j.cursor || null, total: j.total || 0 };
}

// Enumerate every record under an anchor via Constellation, hydrating from each
// author's PDS. Defaults to the organism gallery; pass {collection, path} to
// enumerate expeditions or any future companion collection.
export async function enumerateAll(onProgress, opts = {}) {
  const collection = opts.collection || COLLECTION;
  const path = opts.path || '.gallery';
  const all = [];
  let cursor = null, total = 0;
  do {
    const res = await links(ANCHOR, path, 100, cursor, collection);
    cursor = res.cursor; total = res.total || total;
    const list = res.linking_records.slice();
    const CONC = 8;
    await Promise.all(Array.from({ length: CONC }, async () => {
      while (list.length) {
        const lr = list.shift();
        try { all.push(await getRecord(lr.did, lr.rkey, collection)); } catch { /* skip unreadable */ }
        if (onProgress) onProgress(all.length, total);
      }
    }));
  } while (cursor && all.length < 2000);
  return all;
}
