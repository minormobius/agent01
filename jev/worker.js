// jev worker — static assets + the ONE server-side route this demo needs.
//
//   POST /api/ask     { state, questions } -> TypeSafe /v1/systemone
//   GET  /api/health  -> { configured: bool }   (never the key itself)
//
// WHY THIS WORKER EXISTS AT ALL: the TypeSafe API key is a paid credential.
// It lives here as a Cloudflare secret (`wrangler secret put TYPESAFE_API_KEY`)
// and is read only inside this file. It is never sent to the browser, never
// written into an asset, and never echoed in an error — the page calls this
// worker, this worker calls TypeSafe. A demo that put the key in app.js
// would be handing it to every viewer with devtools open.
//
// THE PROXY IS DELIBERATELY NARROW. An open pass-through to a metered API is
// somebody else's free API key. So:
//   - POST only, JSON only, same-origin only (no CORS headers are emitted,
//     so a browser on another origin cannot read the response)
//   - the request body is rebuilt from a whitelist: only `state` and
//     `questions` survive, and `model` is forced to MODEL
//   - hard caps on body size and question count
// See CLAUDE.md for the limits this does NOT provide (per-caller rate limits
// need KV or a Durable Object; this surface has neither).

const MODEL = 'jev-latest';
const UPSTREAM = 'https://api.typesafe.ai/v1/systemone';

const MAX_BODY_BYTES = 64 * 1024; // a delve state is ~2-4KB; 64K is generous
const MAX_QUESTIONS = 12; // the demo asks 5
const UPSTREAM_TIMEOUT_MS = 20_000;

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
    if (typeof q.instructions !== 'string' || !q.instructions.trim()) {
      return { error: `question "${k}" needs instructions` };
    }
  }

  // Whitelist rebuild: nothing else from the caller reaches TypeSafe, and the
  // model is ours to choose, not the caller's.
  return { body: { state, questions, model: MODEL } };
}

async function handleAsk(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

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
    return json({ error: 'upstream_unreachable', detail: String(err?.message || err) }, 502);
  }

  const elapsed = Date.now() - started;
  const text = await upstream.text();

  if (!upstream.ok) {
    // Surface the upstream status so the page can say something true about
    // WHY (401 bad key, 422 malformed question, 429 rate limited, 529 busy).
    let detail = text.slice(0, 600);
    try { detail = JSON.parse(text); } catch { /* keep the text */ }
    return json({ error: 'upstream_error', status: upstream.status, detail, latency_ms: elapsed },
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
  return json(parsed);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ask') return handleAsk(request, env);

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        // A boolean. Never the key, never a prefix of it, never its length.
        configured: Boolean(env.TYPESAFE_API_KEY),
        model: MODEL,
        max_questions: MAX_QUESTIONS,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
