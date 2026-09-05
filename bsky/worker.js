/**
 * bsky.mino.mobi — worker.
 *
 * Almost everything here is static: the AppView runs in the browser. The only
 * server-side surface is the replay proxy, and it exists because of one
 * asymmetry in Jetstream v2:
 *
 *   live tail  → WebSocket, no auth, not metered  → the browser does it itself
 *   replay     → HTTP, API key, metered in bytes  → needs a secret holder
 *
 * A key in a static page is a published key, so the archive calls proxy through
 * here. Until JETSTREAM_API_KEY is set the route answers 503 with a reason
 * rather than pretending — the page degrades to its live-only mode.
 */

const JETSTREAM = 'https://jetstream.us-east.bsky.network';

// The archive endpoints this proxy is willing to forward. An allowlist, not a
// pass-through: this worker holds a metered credential.
const REPLAY_ROUTES = new Set([
  'network.bsky.jetstream.planSnapshot',
  'network.bsky.jetstream.listSegments',
  'network.bsky.jetstream.getSegment',
]);

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
        note: env.JETSTREAM_API_KEY
          ? 'archive replay available'
          : 'live tail only — JETSTREAM_API_KEY unset, so history is unavailable',
      });
    }

    if (url.pathname.startsWith('/api/replay/')) {
      return replay(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

async function replay(request, env, url) {
  if (!env.JETSTREAM_API_KEY) {
    return json({
      error: 'replay_unconfigured',
      message:
        'Jetstream archive replay needs an API key (metered in bytes). ' +
        'Set JETSTREAM_API_KEY on this worker to enable history; the live ' +
        'tail needs no key and works without it.',
    }, 503);
  }

  const nsid = url.pathname.slice('/api/replay/'.length);
  if (!REPLAY_ROUTES.has(nsid)) {
    return json({ error: 'unknown_route', message: `not proxied: ${nsid}` }, 404);
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

  // 429 carries Retry-After and the quota refills continuously — pass both
  // through so the client can wait exactly as long as it is told to.
  const headers = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'retry-after', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
