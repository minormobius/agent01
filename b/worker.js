// b worker — serves the atmosphere site (static assets) AND acts as the feedgen
// feed-generator service. b.mino.mobi is the feed service DID (did:web), so it
// answers /.well-known/did.json + /xrpc/app.bsky.feed.getFeedSkeleton by reading
// a user's feed definition record from their PDS and running the shared evaluator.
// Stateless: feeds live entirely on ATProto, no database.
import { evaluate } from './feedgen/pipeline.js';

const FEED_HOST = 'b.mino.mobi';
const SERVICE_DID = `did:web:${FEED_HOST}`;
const DEF_COLLECTION = 'com.minomobi.feedgen.def';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Service session for authed search (the public AppView 403s search). Uses the
// repo's morphyx service account (BLUESKY_MORPHYX_* worker secrets, injected by
// deploy-b.yml from the GH secrets). Degrades cleanly if unset.
let _svc = null;
async function serviceToken(env) {
  const handle = env.BLUESKY_MORPHYX_HANDLE || env.FEEDGEN_BSKY_HANDLE;
  const pass = env.BLUESKY_MORPHYX_APP_PASSWORD || env.FEEDGEN_BSKY_APP_PASSWORD;
  if (!handle || !pass) return null;
  if (_svc && _svc.exp > Date.now()) return _svc.token;
  try {
    const r = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password: pass }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    _svc = { token: d.accessJwt, exp: Date.now() + 60 * 60 * 1000 }; // refresh ~hourly
    return _svc.token;
  } catch { return null; }
}

function didDoc() {
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: SERVICE_DID,
    service: [{ id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: `https://${FEED_HOST}` }],
  };
}

// Resolve a repo DID to its PDS endpoint.
async function resolvePds(did) {
  try {
    let doc;
    if (did.startsWith('did:plc:')) {
      const r = await fetch(`https://plc.directory/${did}`); if (!r.ok) return null; doc = await r.json();
    } else if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).replace(/:/g, '/');
      const r = await fetch(`https://${host}/.well-known/did.json`); if (!r.ok) return null; doc = await r.json();
    } else return null;
    const svc = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
    return svc ? svc.serviceEndpoint : null;
  } catch { return null; }
}

async function getDef(did, rkey) {
  const pds = await resolvePds(did);
  if (!pds) return null;
  const u = `${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${DEF_COLLECTION}&rkey=${encodeURIComponent(rkey)}`;
  const r = await fetch(u);
  if (!r.ok) return null;
  const d = await r.json();
  return d.value || null;
}

// Per-feed ranked-uri cache (per isolate). One gather per feed per minute keeps
// Bluesky's API happy no matter how many people open/scroll the feed; the cursor
// just pages through the cached list.
const FEED_CACHE = new Map();
const CACHE_TTL = 60 * 1000;
const CACHE_MAX = 300;

async function rankedUris(feed, did, rkey, env) {
  const hit = FEED_CACHE.get(feed);
  if (hit && (Date.now() - hit.at) < CACHE_TTL) return hit.uris;
  const def = await getDef(did, rkey);
  let uris = [];
  if (def) {
    try {
      const { posts } = await evaluate({ ...def, limit: Math.min(def.limit || 500, 1000) }, { searchToken: await serviceToken(env) });
      uris = posts.map((p) => p.uri);
    } catch { uris = []; }
  }
  if (FEED_CACHE.size >= CACHE_MAX) FEED_CACHE.delete(FEED_CACHE.keys().next().value);
  FEED_CACHE.set(feed, { at: Date.now(), uris });
  return uris;
}

async function getFeedSkeleton(url, env) {
  const feed = url.searchParams.get('feed') || '';
  const pageLimit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10) || 30, 100);
  const offset = parseInt(url.searchParams.get('cursor') || '0', 10) || 0;
  const m = feed.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.generator\/([^/]+)$/);
  if (!m) return json({ feed: [] });
  const uris = await rankedUris(feed, m[1], m[2], env);
  const page = uris.slice(offset, offset + pageLimit);
  const out = { feed: page.map((u) => ({ post: u })) };
  const next = offset + pageLimit;
  if (next < uris.length) out.cursor = String(next);
  return json(out);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (path === '/.well-known/did.json') return json(didDoc());
    if (path === '/xrpc/app.bsky.feed.describeFeedGenerator') return json({ did: SERVICE_DID, feeds: [] });
    if (path === '/xrpc/app.bsky.feed.getFeedSkeleton') return getFeedSkeleton(url, env);

    // Builder preview — evaluate a posted definition (so search works via the
    // service token without exposing it to the browser).
    if (path === '/api/feedgen/preview' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const def = body && body.def;
      if (!def) return json({ error: 'no def' }, 400);
      // Preview caps at 100 for speed; the published feed uses the real limit.
      try { return json(await evaluate({ ...def, limit: Math.min(def.limit || 100, 100) }, { searchToken: await serviceToken(env) })); }
      catch (e) { return json({ posts: [], errors: [String((e && e.message) || e)], candidateCount: 0 }); }
    }

    // Everything else → the static atmosphere site.
    return env.ASSETS.fetch(request);
  },
};
