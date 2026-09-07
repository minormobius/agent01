/**
 * bsky.mino.mobi — worker.
 *
 * Almost everything here is static: the AppView runs in the browser, and that
 * includes history — the live tail's timestamp cursor replays the last ~36h
 * unauthenticated, so the page needs nothing from this worker to show a
 * backfilled timeline.
 *
 * This worker is only for history OLDER than that window, and for two
 * independent reasons:
 *
 *   live tail  → WebSocket, no auth, not metered  → the browser does it itself
 *   archive    → HTTP, API key, metered in bytes  → needs a secret holder
 *              → and zstd-compressed, which browsers cannot decode synchronously
 *
 * Until JETSTREAM_API_KEY is set the route answers 503 with a reason rather
 * than pretending. That is not a degraded page: the ~36h window still works.
 */

const JETSTREAM = 'https://jetstream.us-east.bsky.network';

// The archive endpoints this proxy will forward. An allowlist, not a
// pass-through: this worker holds a METERED credential, and every byte a
// stranger pulls through here is spent from our quota.
//
// getSegment is deliberately NOT here. Segments seal at ~256 MB each, so one
// unauthenticated request could drain the quota; until the decoded endpoint
// (which caps its own spend) exists, this proxy is restricted to the two
// metadata calls, whose responses are small JSON plans.
const REPLAY_ROUTES = new Set([
  'network.bsky.jetstream.planSnapshot',
  'network.bsky.jetstream.listSegments',
]);

/**
 * Requests from another site's JavaScript are refused. This is a speed bump,
 * not a wall — `curl` sets any Origin it likes — so it is paired with the
 * getSegment exclusion above rather than relied on alone. Same-origin fetches
 * from our own page send no Origin at all, which is the common case.
 */
function originAllowed(request, url) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === url.host; } catch { return false; }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        replay: Boolean(env.JETSTREAM_API_KEY),
        // `replay` is about the ARCHIVE only. History within the live tail's
        // ~36h window needs nothing from here, so this must not read as "no
        // history" — it says which history.
        lookbackHours: 36,
        archiveRoutes: [...REPLAY_ROUTES],
        note: env.JETSTREAM_API_KEY
          ? 'archive metadata available (plan/list only; segment download not '
            + 'yet exposed). History deeper than the ~36h live window.'
          : 'archive off (JETSTREAM_API_KEY unset). The ~36h live window still '
            + 'replays without it; only deeper history is unavailable.',
      });
    }

    if (url.pathname.startsWith('/api/replay/')) {
      return replay(request, env, url);
    }

    if (url.pathname === '/api/feedgen') {
      return feedgen(request, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function replay(request, env, url) {
  // Allowlist first, key second: what this route WILL proxy is a property of
  // the route, not of whether the secret happens to be set. Checking the key
  // first would report an unknown NSID as "unconfigured" and change its answer
  // the day the secret lands.
  const nsid = url.pathname.slice('/api/replay/'.length);
  if (!REPLAY_ROUTES.has(nsid)) {
    return json({ error: 'unknown_route', message: `not proxied: ${nsid}` }, 404);
  }

  if (!originAllowed(request, url)) {
    return json({ error: 'cross_origin', message: 'this endpoint spends a metered quota' }, 403);
  }

  if (!env.JETSTREAM_API_KEY) {
    return json({
      error: 'replay_unconfigured',
      message:
        'The Jetstream archive needs an API key (metered in bytes) and is ' +
        'only for history deeper than the live tail\'s ~36h window. Inside ' +
        'that window the browser replays directly, no key required. Set ' +
        'JETSTREAM_API_KEY on this worker for anything older.',
    }, 503);
  }

  const target = new URL(`${JETSTREAM}/xrpc/${nsid}`);
  for (const [k, v] of url.searchParams) target.searchParams.append(k, v);

  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      'authorization': `Bearer ${env.JETSTREAM_API_KEY}`,
      'content-type': request.headers.get('content-type') ?? 'application/json',
      // Range matters: a metered download that runs out of quota resumes from
      // a byte offset rather than re-paying for what it already has.
      ...(request.headers.has('range') ? { range: request.headers.get('range') } : {}),
    },
    body: request.method === 'POST' ? await request.text() : undefined,
  });

  // Pass through everything a caller needs to manage its own spend. The
  // Headwind-Quota-* headers are how the archive reports the budget and its
  // refill rate; dropping them (as this did) leaves a client unable to see the
  // quota it is burning. Retry-After pairs with 429, Content-Range with a
  // resumed Range request, WWW-Authenticate with a rejected key.
  const headers = new Headers();
  for (const h of [
    'content-type', 'content-length', 'content-range', 'retry-after', 'etag',
    'accept-ranges', 'www-authenticate', 'x-zstd-dictionary-id',
    'headwind-quota-refill-bytes', 'headwind-quota-refill-period-seconds',
    'headwind-quota-burst-bytes',
  ]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}


// ─── third-party feed generators ─────────────────────────────────

/**
 * Relay for `app.bsky.feed.getFeedSkeleton` on someone else's feed generator.
 *
 * WHY THIS EXISTS, since it is the one place the frontend-only claim bends.
 * A personalised feed — @spacecowboy17's "For You", say — is served by an
 * independent service (`did:web:foryou.club`) that identifies the reader from a
 * short-lived service-auth JWT. The browser can mint that JWT itself: it comes
 * from the reader's OWN PDS via `com.atproto.server.getServiceAuth`, scoped to
 * one audience and one method. What the browser cannot do is *send* it, because
 * feed generators do not answer with CORS headers. Measured 2026-09-05:
 * foryou.club and api.graze.social send none; our own feed.mino.mobi sends
 * `access-control-allow-origin: *`, which is why simcluster works directly.
 *
 * So this is a CORS shim and nothing else. It holds no credential: the
 * Authorization header is the reader's own JWT, passed straight through and
 * never stored or logged. It expires in about a minute and is useless for
 * anything but that feed.
 *
 * The important safety property: **the caller does not choose the host.** It
 * passes an `at://` feed URI; this worker resolves the generator record and the
 * DID document itself and calls only the endpoint that document names. Letting
 * a caller name the target would make this an open proxy.
 */
const BSKY_PUBLIC = 'https://public.api.bsky.app';
const genCache = new Map();          // feed uri -> { endpoint, at }
const GEN_TTL_MS = 30 * 60 * 1000;

async function resolveGenerator(feedUri) {
  const hit = genCache.get(feedUri);
  if (hit && Date.now() - hit.at < GEN_TTL_MS) return hit.endpoint;

  const m = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(feedUri);
  if (!m) throw new Error('not an at:// feed uri');
  const [, repo, collection, rkey] = m;
  if (collection !== 'app.bsky.feed.generator') throw new Error('not a feed generator uri');

  const recRes = await fetch(
    `${BSKY_PUBLIC}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(repo)}`
    + `&collection=${collection}&rkey=${encodeURIComponent(rkey)}`
  );
  if (!recRes.ok) throw new Error(`feed record ${recRes.status}`);
  const serviceDid = (await recRes.json())?.value?.did;
  if (!serviceDid) throw new Error('feed record names no service');

  let doc;
  if (serviceDid.startsWith('did:web:')) {
    const host = serviceDid.slice('did:web:'.length).replace(/:/g, '/');
    doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
  } else if (serviceDid.startsWith('did:plc:')) {
    doc = await (await fetch(`https://plc.directory/${serviceDid}`)).json();
  } else {
    throw new Error(`unsupported did method: ${serviceDid}`);
  }

  const svc = (doc.service || []).find(
    (x) => x.id === '#bsky_fg' || x.type === 'BskyFeedGenerator'
  );
  const endpoint = svc?.serviceEndpoint;
  if (!endpoint || !/^https:\/\//.test(endpoint)) throw new Error('no https feed endpoint');

  genCache.set(feedUri, { endpoint, at: Date.now() });
  return endpoint;
}

async function feedgen(request, url) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'Authorization, Content-Type',
    'access-control-allow-methods': 'GET, OPTIONS',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const feed = url.searchParams.get('feed');
  if (!feed) return json({ error: 'missing feed' }, 400);

  let endpoint;
  try { endpoint = await resolveGenerator(feed); }
  catch (err) { return new Response(JSON.stringify({ error: 'unresolvable_feed', message: err.message }),
    { status: 400, headers: { 'content-type': 'application/json', ...cors } }); }

  const target = new URL(`${endpoint}/xrpc/app.bsky.feed.getFeedSkeleton`);
  target.searchParams.set('feed', feed);
  const limit = url.searchParams.get('limit');
  if (limit) target.searchParams.set('limit', String(Math.min(Number(limit) || 30, 100)));
  const cursor = url.searchParams.get('cursor');
  if (cursor) target.searchParams.set('cursor', cursor);

  // Only the reader's own Authorization is forwarded. Nothing of ours is added,
  // and the header is not read, logged or retained here.
  const headers = {};
  const bearer = request.headers.get('authorization');
  if (bearer) headers.authorization = bearer;

  let upstream;
  try { upstream = await fetch(target, { headers }); }
  catch (err) { return new Response(JSON.stringify({ error: 'upstream_unreachable', message: String(err) }),
    { status: 502, headers: { 'content-type': 'application/json', ...cors } }); }

  const out = new Headers(cors);
  out.set('content-type', upstream.headers.get('content-type') || 'application/json');
  const retry = upstream.headers.get('retry-after');
  if (retry) out.set('retry-after', retry);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
