// hose — hose.mino.mobi
//
// A Bluesky feed-generator service whose input is the firehose itself. It is
// the other half of b.mino.mobi/feedgen: that surface builds and serves feeds
// you can express as a *query* (a search, a list, an author), and this one
// serves the feeds you can only express as a *subtraction* — everything on the
// network, minus what you don't want.
//
// A feed's definition is read from its owner's PDS, either as the native
// `com.minomobi.feedgen.def` record or straight off a SkyFeed-era
// `skyfeedBuilder`, so a feed built in a dead tool moves here by editing one
// field on a record its owner already has.

import { FirehoseIngest } from './src/ingest.js';
import { needsHydration, fromPostView, passes } from '../../packages/feedgen/match.js';
import { fromSkyfeed, parseFeedRef } from '../../packages/feedgen/skyfeed.js';
import { resolvePds, hydrate } from './src/resolve.js';

const HOST = 'hose.mino.mobi';
const SERVICE_DID = `did:web:${HOST}`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const ingest = (env) => env.INGEST.get(env.INGEST.idFromName('main'));
const ask = (env, path) => ingest(env).fetch(new Request(`https://ingest.invalid${path}`));

function didDoc() {
  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: SERVICE_DID,
    service: [{ id: '#bsky_fg', type: 'BskyFeedGenerator', serviceEndpoint: `https://${HOST}` }],
  };
}

async function getFeedSkeleton(url, env) {
  const feed = url.searchParams.get('feed') || '';
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10) || 30));
  const offset = Math.max(0, parseInt(url.searchParams.get('cursor') || '0', 10) || 0);
  if (!/^at:\/\/[^/]+\/app\.bsky\.feed\.generator\/[^/]+$/.test(feed)) return json({ feed: [] });

  const r = await ask(env, `/page?feed=${encodeURIComponent(feed)}&offset=${offset}&limit=${limit}`);
  const page = await r.json();
  let uris = page.uris || [];

  // An engagement filter can only be decided once real counts exist, so it runs
  // here rather than at ingest — over this page only. That means a page can come
  // back shorter than `limit`; the cursor still advances by `limit`, so paging
  // stays correct and a thinned page just looks like a quiet stretch of feed.
  if (page.def && needsHydration(page.def) && uris.length) {
    const posts = await hydrate(uris);
    uris = uris.filter((u) => {
      const p = posts.get(u);
      return p ? passes(fromPostView(p), page.def.filters, {}) : false;
    });
  }

  const out = { feed: uris.map((u) => ({ post: u })) };
  if (offset + limit < (page.total || 0)) out.cursor = String(offset + limit);
  return json(out);
}

// Convert a live SkyFeed feed to a feedgen definition without publishing
// anything — so you can see exactly what the port produces, and what it
// dropped, before you point a real record at this service.
async function importSkyfeed(url) {
  const ref = parseFeedRef(url.searchParams.get('feed') || '');
  if (!ref) return json({ error: 'pass ?feed= an at:// generator URI or a bsky.app feed URL' }, 400);
  const did = ref.repo.startsWith('did:') ? ref.repo : null;
  if (!did) return json({ error: 'resolve the handle to a DID first' }, 400);
  const pds = await resolvePds(did);
  if (!pds) return json({ error: `could not resolve a PDS for ${did}` }, 502);
  const r = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord`
    + `?repo=${encodeURIComponent(did)}&collection=app.bsky.feed.generator&rkey=${encodeURIComponent(ref.rkey)}`);
  if (!r.ok) return json({ error: `no such feed record (HTTP ${r.status})` }, 404);
  const rec = (await r.json()).value;
  const { def, warnings } = fromSkyfeed(rec);
  if (!def) return json({ error: warnings[0] || 'not a SkyFeed feed', warnings }, 422);
  return json({ def, warnings, serviceDid: SERVICE_DID, currentServiceDid: rec.did || null });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (path === '/.well-known/did.json') return json(didDoc());
    if (path === '/xrpc/app.bsky.feed.getFeedSkeleton') return getFeedSkeleton(url, env);

    if (path === '/xrpc/app.bsky.feed.describeFeedGenerator') {
      const s = await (await ask(env, '/status')).json();
      return json({ did: SERVICE_DID, feeds: s.feeds.filter((f) => f.firehose).map((f) => ({ uri: f.uri })) });
    }

    if (path === '/api/import') return importSkyfeed(url);
    if (path === '/status') return json(await (await ask(env, '/status')).json());

    if (path === '/health' || path === '/api/health') {
      const s = await (await ask(env, '/status')).json();
      const fresh = s.lastEventAt && (Date.now() - s.lastEventAt) < 60_000;
      return json({
        ok: !!(s.connected && fresh), connected: s.connected, lastEventAt: s.lastEventAt,
        seen: s.seen, matched: s.matched, feeds: s.feeds.length, lastError: s.lastError,
      }, s.connected && fresh ? 200 : 503);
    }

    return json({ error: 'not found', service: SERVICE_DID }, 404);
  },

  // The object re-arms its own 30s alarm, so this is only a backstop: if the
  // alarm chain is ever broken the next cron tick restarts it.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(ask(env, '/status'));
  },
};

export { FirehoseIngest };
