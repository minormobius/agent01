// Everything the ingester has to read from the network that is not the firehose:
// a feed's definition, a list's membership, and (only when a def asks for
// engagement) real like/repost counts for the page about to be served.

const PUB = 'https://public.api.bsky.app/xrpc';

const DEF_COLLECTION = 'com.minomobi.feedgen.def';
const GEN_COLLECTION = 'app.bsky.feed.generator';

export async function resolvePds(did) {
  try {
    let doc;
    if (did.startsWith('did:plc:')) {
      const r = await fetch(`https://plc.directory/${did}`);
      if (!r.ok) return null;
      doc = await r.json();
    } else if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).replace(/:/g, '/');
      const r = await fetch(`https://${host}/.well-known/did.json`);
      if (!r.ok) return null;
      doc = await r.json();
    } else return null;
    const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
    return svc ? svc.serviceEndpoint : null;
  } catch { return null; }
}

async function getRecord(pds, repo, collection, rkey) {
  const u = `${pds}/xrpc/com.atproto.repo.getRecord`
    + `?repo=${encodeURIComponent(repo)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
  const r = await fetch(u);
  if (!r.ok) return null;
  const d = await r.json();
  return d.value || null;
}

// Two ways a feed can be defined, tried in that order:
//
//   1. a native `com.minomobi.feedgen.def` record — what b.mino.mobi/feedgen
//      publishes, sharing the generator's rkey;
//   2. a `skyfeedBuilder` still sitting on the `app.bsky.feed.generator`
//      record — what every feed built in SkyFeed already has.
//
// (2) is the point: a SkyFeed feed moves here by repointing one field on a
// record its owner already controls. Nothing has to be rebuilt to be rehosted.
export async function getFeedDef(did, rkey, fromSkyfeed) {
  const pds = await resolvePds(did);
  if (!pds) return { def: null, source: 'no-pds' };

  const native = await getRecord(pds, did, DEF_COLLECTION, rkey);
  if (native) return { def: native, source: 'feedgen' };

  const gen = await getRecord(pds, did, GEN_COLLECTION, rkey);
  if (gen && gen.skyfeedBuilder) {
    const { def, warnings } = fromSkyfeed(gen);
    if (def) return { def, source: 'skyfeed', warnings };
  }
  return { def: null, source: 'not-found' };
}

// The builder tells people to "paste a bsky.app list URL", so a def can carry
// either form. Normalise before asking the AppView, which only knows at://.
async function resolveListUri(s) {
  const v = String(s || '').trim();
  if (!v || v.startsWith('at://')) return v;
  const m = v.match(/\/profile\/([^/]+)\/lists\/([^/?#]+)/);
  if (!m) return v;
  const actor = decodeURIComponent(m[1]);
  if (actor.startsWith('did:')) return `at://${actor}/app.bsky.graph.list/${m[2]}`;
  const r = await fetch(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
  if (!r.ok) return v;
  return `at://${(await r.json()).did}/app.bsky.graph.list/${m[2]}`;
}

// A list's subject DIDs. Capped: a runaway list should degrade the filter, not
// the ingester. Returns null on failure so the caller can tell "empty list"
// from "could not read the list" — passes() skips the filter on null rather
// than silently emptying somebody's feed.
export async function getListMembers(uri, max = 5000) {
  try {
    const dids = new Set();
    const listUri = await resolveListUri(uri);
    let cursor;
    for (let page = 0; page < 50; page++) {
      const u = new URL(`${PUB}/app.bsky.graph.getList`);
      u.searchParams.set('list', listUri);
      u.searchParams.set('limit', '100');
      if (cursor) u.searchParams.set('cursor', cursor);
      const r = await fetch(u.toString());
      if (!r.ok) return dids.size ? dids : null;
      const d = await r.json();
      for (const item of d.items || []) {
        const did = item.subject && item.subject.did;
        if (did) dids.add(did);
      }
      cursor = d.cursor;
      if (!cursor || dids.size >= max) break;
    }
    return dids;
  } catch { return null; }
}

// Real engagement counts for one page of URIs. Only called when the def
// actually carries a minLikes/minReposts filter — see needsHydration().
export async function hydrate(uris) {
  const out = new Map();
  for (let i = 0; i < uris.length; i += 25) {
    const batch = uris.slice(i, i + 25);
    const u = new URL(`${PUB}/app.bsky.feed.getPosts`);
    for (const uri of batch) u.searchParams.append('uris', uri);
    try {
      const r = await fetch(u.toString());
      if (!r.ok) continue;
      const d = await r.json();
      for (const p of d.posts || []) out.set(p.uri, p);
    } catch { /* a failed page just goes unhydrated */ }
  }
  return out;
}
