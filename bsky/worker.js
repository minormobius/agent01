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

  // 429 carries Retry-After and the quota refills continuously — pass both
  // through so the client can wait exactly as long as it is told to.
  const headers = new Headers();
  for (const h of ['content-type', 'content-length', 'content-range', 'retry-after', 'etag']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
