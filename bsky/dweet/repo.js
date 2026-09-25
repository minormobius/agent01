/**
 * Reading dweets straight out of a poster's own repo.
 *
 * The firehose is the feed's LIVE half and a poor history: replaying 36h of it
 * for one sparse collection makes the server scan the whole network's traffic
 * for that window, and measured 2026-09-25 the first dweet arrived after 42s.
 * A socket that carries nothing for that long is exactly the kind a carrier,
 * a proxy or a phone's radio kills as idle — and a reconnect with no event
 * received restarts the scan from the same cursor, so a reader on such a
 * network never sees history at all and the dot never settles. That is one
 * way "disconnected" happened.
 *
 * A PDS answers the history question directly: `com.atproto.repo.listRecords`
 * is public, unauthenticated, paged newest-first, and every PDS in the network
 * sends `access-control-allow-origin: *` (checked on a *.host.bsky.network PDS
 * with a bsky.mino.mobi Origin). So a profile is one request, and the feed can
 * paint known posters' recent work in the time it takes to resolve a DID.
 *
 * Every record goes through `dweetFromEvent` — the same validation a firehose
 * event gets — by dressing the listRecords row as a create event. One gate,
 * whatever the transport. `fetch` is injectable so `repo.selftest.mjs` runs
 * the whole path in node against canned responses.
 */
import { dweetFromEvent, NSID } from './event.js';

const PUBLIC_API = 'https://public.api.bsky.app';
const PLC = 'https://plc.directory';

/** Handle, `@handle`, DID, or a bsky.app profile URL → DID. */
export async function resolveDid(input, { fetch: f = fetch } = {}) {
  const raw = String(input || '').trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/bsky\.app\/profile\//, '')
    .split(/[/?#]/)[0];
  if (!raw) throw new Error('no handle');
  if (raw.startsWith('did:')) return raw;
  const res = await f(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(raw)}`);
  if (!res.ok) throw new Error(`could not resolve @${raw}`);
  const { did } = await res.json();
  if (!did) throw new Error(`could not resolve @${raw}`);
  return did;
}

/** DID → { pds, handle } from its DID document. did:plc and did:web. */
export async function resolveIdentity(did, { fetch: f = fetch } = {}) {
  let url;
  if (did.startsWith('did:plc:')) url = `${PLC}/${did}`;
  else if (did.startsWith('did:web:')) url = `https://${did.slice(8)}/.well-known/did.json`;
  else throw new Error(`unsupported DID method: ${did}`);
  const res = await f(url);
  if (!res.ok) throw new Error(`could not resolve ${did}`);
  const doc = await res.json();
  const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`);
  if (!svc?.serviceEndpoint) throw new Error(`${did} names no PDS`);
  const aka = (doc.alsoKnownAs || []).find((a) => a.startsWith('at://'));
  return { pds: svc.serviceEndpoint.replace(/\/$/, ''), handle: aka ? aka.slice(5) : null };
}

/** One listRecords row → a dweet, or null if it would not pass the firehose gate. */
export function dweetFromRow(did, row) {
  const rkey = String(row?.uri || '').split('/').pop();
  return dweetFromEvent({
    did, collection: NSID, rkey, cid: row?.cid, operation: 'create', record: row?.value,
  });
}

/**
 * One page of a poster's dweets, newest first.
 * @returns {Promise<{dweets: object[], cursor: string|null, dropped: number}>}
 */
export async function listDweets(pds, did, { limit = 25, cursor, fetch: f = fetch } = {}) {
  const q = new URLSearchParams({ repo: did, collection: NSID, limit: String(limit) });
  if (cursor) q.set('cursor', cursor);
  const res = await f(`${pds}/xrpc/com.atproto.repo.listRecords?${q}`);
  if (!res.ok) throw new Error(`their PDS answered ${res.status}`);
  const body = await res.json();
  const rows = body.records || [];
  const dweets = rows.map((r) => dweetFromRow(did, r)).filter(Boolean);
  // A full page is the only evidence there may be more. The cursor alone is
  // not: some PDS versions hand one back on the last page too.
  return {
    dweets,
    cursor: rows.length >= limit && body.cursor ? body.cursor : null,
    dropped: rows.length - dweets.length,
  };
}
