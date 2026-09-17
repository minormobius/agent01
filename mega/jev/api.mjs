// jev/api.mjs — the /jev/api/* routes, mounted by mega/worker.js.
//
// jev is a SUB-SITE of the mega surface (mega.mino.mobi/jev/), not its own
// worker: the mino.mobi zone is at Cloudflare's hard cap of 100 Workers
// custom domains, so a new surface cannot claim its own subdomain. It rides
// mega's worker and mega's domain, the same way /sprite/api and /bees/api do.
//
//   POST /jev/api/ask     { state, questions } -> TypeSafe /v1/systemone
//   GET  /jev/api/health  -> { configured: bool }   (never the key itself)
//
// WHY THIS EXISTS AT ALL: the TypeSafe API key is a paid credential. It lives
// as a Cloudflare secret on the `mega` worker and is read only inside this
// file. It is never sent to the browser, never written into an asset, and
// never echoed in an error — the page calls this handler, this handler calls
// TypeSafe. A demo that put the key in app.js would hand it to every viewer
// with devtools open.
//
// THE PROXY IS DELIBERATELY NARROW. An open pass-through to a metered API is
// somebody else's free API key. So:
//   - POST only, JSON only, same-origin only (no CORS headers are emitted,
//     so a browser on another origin cannot read the response)
//   - the request body is rebuilt from a whitelist: only `state` and
//     `questions` survive, and `model` is forced to MODEL
//   - hard caps on body size and question count, plus a per-IP throttle
// See CLAUDE.md for the limits this does NOT provide.

const MODEL = 'jev-latest';
const UPSTREAM = 'https://api.typesafe.ai/v1/systemone';

// Raised from 64KB / 12 to probe where the SERVICE's limits actually are
// rather than where mine were guessed. These are deliberately generous for
// measurement and get tightened to an informed value once the ceiling is
// known — see CLAUDE.md. The per-IP throttle still bounds the spend.
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_QUESTIONS = 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;

// Backoff for the two statuses the docs say to retry (429 rate limited,
// 529 overloaded). Kept small: the page ticks every 10s, so a retry that
// outlasts the tick is worse than failing over to the stand-in.
const RETRY_LIMIT = 2;
const RETRY_BASE_MS = 350;
const RETRY_MAX_WAIT_MS = 2_000;
const RETRY_JITTER_MS = 200;

// ------------------------------------------------------------ throttling ---
// The key behind this proxy is metered and real, and /api/ask is reachable by
// anyone who knows the URL (CORS only binds browsers; curl ignores it). So
// bound what one caller can spend.
//
// BE HONEST ABOUT WHAT THIS IS: a per-isolate sliding window. Workers isolates
// are per-colo and get recycled, so a determined caller spread across colos
// gets more than RATE_LIMIT. It is a guard against naive hammering and a stuck
// browser tab, NOT a security control. The real fix is a Durable Object or
// KV counter, or a Cloudflare Rate Limiting rule on the zone — noted in
// CLAUDE.md.
//
// The page ticks every 10s (6/min), so 30/min leaves room for several tabs.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_KEYS = 5_000; // bound the map so a spray of IPs can't grow it forever
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;

  if (hits.size > RATE_MAX_KEYS) {
    for (const [k, times] of hits) {
      if (times.length === 0 || times[times.length - 1] < cutoff) hits.delete(k);
    }
    // still too big? it is a spray; drop the oldest wholesale rather than grow
    if (hits.size > RATE_MAX_KEYS) hits.clear();
  }

  const times = (hits.get(ip) || []).filter((t) => t >= cutoff);
  if (times.length >= RATE_LIMIT) {
    hits.set(ip, times);
    return Math.ceil((times[0] + RATE_WINDOW_MS - now) / 1000);
  }
  times.push(now);
  hits.set(ip, times);
  return 0;
}

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra,
    },
  });

// Validate the demo's own request before spending anyone's tokens on it.
// Returns { error } or { body }.
function buildUpstreamBody(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { error: 'body must be a JSON object' };
  }
  const { state, questions } = payload;

  if (state === undefined || state === null) return { error: '`state` is required' };
  if (typeof state !== 'string' && typeof state !== 'object') {
    return { error: '`state` must be a string, object, or array' };
  }
  if (typeof questions !== 'object' || questions === null || Array.isArray(questions)) {
    return { error: '`questions` must be an object keyed by question id' };
  }

  const keys = Object.keys(questions);
  if (keys.length === 0) return { error: '`questions` must not be empty' };
  if (keys.length > MAX_QUESTIONS) {
    return { error: `too many questions (${keys.length} > ${MAX_QUESTIONS})` };
  }

  // Every question must name one of the three documented primitives. This is
  // a guard on OUR side so a malformed demo build fails here with a clear
  // message instead of as an opaque 422 from upstream.
  for (const k of keys) {
    const q = questions[k];
    if (typeof q !== 'object' || q === null) return { error: `question "${k}" must be an object` };
    if (!['choice', 'score', 'noul'].includes(q.type)) {
      return { error: `question "${k}" has unknown type ${JSON.stringify(q.type)} (want choice|score|noul)` };
    }
    // `instructions` may be a string OR a JSON object/array — the API accepts
    // structure here (docs.typesafe.ai/primitives/advanced), and an earlier
    // version of this guard rejected structured instructions with a 422 that
    // the upstream would have accepted. A guard that is stricter than the
    // service it protects is a bug, not caution.
    const ins = q.instructions;
    const hasText = typeof ins === 'string' && ins.trim().length > 0;
    const hasStructure = typeof ins === 'object' && ins !== null
      && (Array.isArray(ins) ? ins.length > 0 : Object.keys(ins).length > 0);
    if (!hasText && !hasStructure) {
      return { error: `question "${k}" needs instructions (a non-empty string, object, or array)` };
    }
  }

  // Whitelist rebuild: nothing else from the caller reaches TypeSafe, and the
  // model is ours to choose, not the caller's.
  return { body: { state, questions, model: MODEL } };
}

async function handleAsk(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Throttle before doing anything that costs money.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const retryAfter = rateLimited(ip);
  if (retryAfter) {
    return json(
      { error: 'rate_limited', detail: `more than ${RATE_LIMIT} calls in a minute from this address`, retry_after_s: retryAfter },
      429,
      { 'retry-after': String(retryAfter) },
    );
  }

  if (!env.TYPESAFE_API_KEY) {
    return json({
      error: 'no_api_key',
      detail:
        'TYPESAFE_API_KEY is not configured on this worker. Run `wrangler secret put TYPESAFE_API_KEY` (or set the TYPESAFE_API_KEY GitHub secret and redeploy). The page falls back to its offline stand-in until then.',
    }, 503);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: `request too large (${raw.length} > ${MAX_BODY_BYTES} bytes)` }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'body is not valid JSON' }, 400);
  }

  const built = buildUpstreamBody(payload);
  if (built.error) return json({ error: built.error }, 422);

  const started = Date.now();
  let upstream;
  let text;
  let attempts = 0;

  // RETRY 429 AND 529 WITH BACKOFF, which is what the TypeSafe docs ask for
  // and what a demo ticking every ten seconds actually needs: a single
  // `529 system_overloaded` (hit for real on 2026-09-17) would otherwise drop
  // the page out of live mode for that tick and show an error to the room.
  // Only these two statuses are retried — a 401 or a 422 will fail again just
  // as fast, and retrying them would just spend the budget twice.
  for (;;) {
    attempts += 1;
    try {
      upstream = await fetch(UPSTREAM, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (err) {
      // Network/timeout. Never include the request headers in the message.
      return json({ error: 'upstream_unreachable', detail: String(err?.message || err), attempts }, 502);
    }

    text = await upstream.text();
    const retryable = upstream.status === 429 || upstream.status === 529;
    if (!retryable || attempts > RETRY_LIMIT) break;

    // Honour Retry-After when the service names a delay, else back off
    // exponentially with jitter so a roomful of tabs does not resynchronise.
    const stated = Number(upstream.headers.get('retry-after'));
    const wait = Number.isFinite(stated) && stated > 0
      ? Math.min(stated * 1000, RETRY_MAX_WAIT_MS)
      : Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_WAIT_MS);
    await new Promise((r) => setTimeout(r, wait + Math.random() * RETRY_JITTER_MS));
  }

  const elapsed = Date.now() - started;

  if (!upstream.ok) {
    // Surface the upstream status so the page can say something true about
    // WHY (401 bad key, 422 malformed question, 429 rate limited, 529 busy).
    let detail = text.slice(0, 600);
    try { detail = JSON.parse(text); } catch { /* keep the text */ }
    return json({ error: 'upstream_error', status: upstream.status, detail, latency_ms: elapsed, attempts },
      upstream.status === 401 ? 502 : upstream.status);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: 'upstream returned non-JSON', latency_ms: elapsed }, 502);
  }

  // Stamp provenance + latency so the UI can prove which answers are real.
  parsed.source = 'typesafe';
  parsed.latency_ms = elapsed;
  if (attempts > 1) parsed.attempts = attempts;
  return json(parsed);
}

/**
 * Handle a /jev/api/* request.
 *
 * Returns a Response when the path is ours, or `null` when it is not — so
 * mega/worker.js can fall through to the asset store without this module
 * needing to know anything about the rest of the surface.
 */
export async function handleJevApi(request, env, pathname) {
  if (pathname === '/jev/api/ask') return handleAsk(request, env);

  if (pathname === '/jev/api/health') {
    return json({
      ok: true,
      // A boolean. Never the key, never a prefix of it, never its length.
      configured: Boolean(env.TYPESAFE_API_KEY),
      model: MODEL,
      max_questions: MAX_QUESTIONS,
    });
  }

  return null;
}

// exported for the selftest
export { MODEL, MAX_QUESTIONS, MAX_BODY_BYTES, RATE_LIMIT, UPSTREAM };
