// lib/jev.js — /api/mood, the only thing on this surface that spends money.
//
// WHAT IT DOES: handle → last ten posts and replies → ONE jev call → a tone
// reading per post. The browser never sees the API key and never gets to
// choose the questions.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS NOT A PROXY
//
// jev's own proxy at mega.mino.mobi/jev/api/ask takes {state, questions} and
// forwards them, which is right for a surface whose whole point is letting you
// watch arbitrary questions get answered. Its comments are blunt about the
// cost: "an open pass-through to a metered API is somebody else's free API
// key", and it spends a throttle, a whitelist rebuild and two size caps
// defending that.
//
// This endpoint does not need defending in the same way, because it takes a
// HANDLE and nothing else. The state and the questions are built here, from
// b/mood/mood.js, and a caller cannot influence either beyond choosing whose
// posts get read. There is no shape of request that makes this endpoint ask
// jev something of the caller's devising. That is a narrower contract than a
// whitelist, and it is free.
//
// What it still needs, because the key is metered and real:
//   - a per-IP throttle (CORS binds browsers; curl ignores it)
//   - a per-handle cache, so ten people opening the same ring cost one call
//   - retries only on the two statuses the docs say to retry
//   - the key in no response, on any path, ever
//
// THE SECOND COPY OF THE KEY. jev's CLAUDE.md says the key "lives in the
// worker, and only in the worker" — and this is a second worker. The
// alternative was calling mega's proxy server-side, which would have spent
// mega's per-IP budget from b's egress and put every visitor to this surface
// in one 30-a-minute bucket. A second Cloudflare secret was the lesser harm;
// it is still never in an asset, never in the browser and never in a response.
// deploy-b.yml writes it from the SAME repo secret mega uses (`jev_key`), so
// there is one credential and two places it is installed, not two credentials.
// ─────────────────────────────────────────────────────────────────────────────

import { appGetSafe, resolveActor } from './closeness.js';
import { N_POSTS, buildState, buildQuestions } from '../mood/mood.js';

const MODEL = 'jev-latest';
const UPSTREAM = 'https://api.typesafe.ai/v1/systemone';
const UPSTREAM_TIMEOUT_MS = 20_000;

// Retry the two statuses the TypeSafe docs name (429 rate limited, 529
// overloaded) and nothing else — a 401 or 422 fails again just as fast and
// retrying it spends the budget twice for the same error.
const RETRY_LIMIT = 2;
const RETRY_BASE_MS = 350;
const RETRY_MAX_WAIT_MS = 2_000;

// One ring is one call, so a person doing this by hand does not need thirty a
// minute. Same honesty as mega's: a per-isolate sliding window is a guard
// against a stuck tab and naive hammering, NOT a security control — isolates
// are per-colo and get recycled.
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_KEYS = 5_000;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now(), cutoff = now - RATE_WINDOW_MS;
  if (hits.size > RATE_MAX_KEYS) {
    for (const [k, t] of hits) if (!t.length || t[t.length - 1] < cutoff) hits.delete(k);
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

// A ring is stable over the minutes somebody spends looking at it, and ten
// people opening the same account should not be ten calls. This is the main
// thing standing between a public toy and a bill.
const CACHE = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 200;

const err = (message, status) => { const e = new Error(message); e.status = status; return e; };

/**
 * The last N posts and replies in the account's own words.
 *
 * Replies are IN — the ask was "posts/replies", and a reply is where tone
 * actually lives; a timeline of standalone posts is somebody's broadcast
 * voice. Reposts are OUT: the text belongs to someone else, and reading a
 * repost as the reposter's mood would attribute a stranger's feelings to them.
 */
async function recentPosts(did, token) {
  const out = [];
  let cursor, pages = 0;
  do {
    let d;
    try {
      d = await appGetSafe('app.bsky.feed.getAuthorFeed',
        { actor: did, limit: 50, filter: 'posts_with_replies', cursor }, token);
    } catch { break; }
    for (const item of (d.feed || [])) {
      const post = item.post;
      if (!post || item.reason) continue;                       // a repost is not their writing
      if (post.author && post.author.did !== did) continue;
      const rec = post.record || {};
      const text = typeof rec.text === 'string' ? rec.text.trim() : '';
      if (!text) continue;                                      // a bare image has no tone to read
      out.push({
        uri: post.uri,
        text: text.slice(0, 300),                               // the protocol's own ceiling
        createdAt: rec.createdAt || post.indexedAt || null,
        isReply: !!rec.reply,
        likes: post.likeCount || 0,
      });
      if (out.length >= N_POSTS) return out;
    }
    cursor = d.cursor; pages++;
  } while (cursor && pages < 3);
  return out;
}

async function askJev(state, questions, key) {
  const body = { state, questions, model: MODEL };
  const started = Date.now();
  let res, text, attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      res = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (e) {
      // Never let the request headers near the message.
      throw err(`the model was unreachable (${String((e && e.message) || e)})`, 502);
    }
    text = await res.text();
    if ((res.status !== 429 && res.status !== 529) || attempts > RETRY_LIMIT) break;
    const stated = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(stated) && stated > 0
      ? Math.min(stated * 1000, RETRY_MAX_WAIT_MS)
      : Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_WAIT_MS);
    await new Promise((r) => setTimeout(r, wait + Math.random() * 200));
  }
  const latency = Date.now() - started;

  if (!res.ok) {
    let detail = text.slice(0, 400);
    try { detail = JSON.stringify(JSON.parse(text)).slice(0, 400); } catch { /* keep the text */ }
    // 401 becomes 502: a bad key here is OUR misconfiguration, not the
    // caller's request being unauthorised.
    throw err(`the model answered ${res.status}: ${detail}`, res.status === 401 ? 502 : res.status);
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw err('the model returned something that was not JSON', 502); }
  return { parsed, latency, attempts, request: body };
}

export async function mood(params, env, token, ip) {
  const handleRaw = params.get('handle');
  if (!handleRaw) throw err('handle required', 400);
  if (!env.TYPESAFE_API_KEY) {
    throw err('the mood ring is not configured on this worker — TYPESAFE_API_KEY is unset, so there is no model to ask.', 503);
  }

  // resolveActor throws the raw `HTTP 400` the identity endpoint returns for a
  // handle that does not exist, which is not a sentence anyone can act on.
  let did;
  try {
    did = await resolveActor(handleRaw);
  } catch (e) {
    throw err(`couldn't find @${String(handleRaw).replace(/^@/, '')} on Bluesky`, 404);
  }

  const hit = CACHE.get(did);
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.data, cached: true };

  // Throttle only what would actually cost money — a cache hit is free, so it
  // is served above this line.
  const retryAfter = rateLimited(ip || 'unknown');
  if (retryAfter) throw err(`more than ${RATE_LIMIT} rings a minute from this address — try again in ${retryAfter}s`, 429);

  const [profiles, posts] = await Promise.all([
    appGetSafe('app.bsky.actor.getProfiles', { actors: [did] }, token).catch(() => ({ profiles: [] })),
    recentPosts(did, token),
  ]);
  const profile = (profiles.profiles || [])[0] || {};
  if (!posts.length) throw err('no posts or replies with any text in them — there is nothing to read a mood off.', 404);

  const who = { handle: profile.handle || handleRaw.replace(/^@/, ''), displayName: profile.displayName || '' };
  const state = buildState(posts, who);
  const questions = buildQuestions(posts);
  const { parsed, latency, attempts, request } = await askJev(state, questions, env.TYPESAFE_API_KEY);

  const data = {
    profile: {
      did,
      handle: profile.handle || who.handle,
      displayName: profile.displayName || '',
      avatar: profile.avatar || null,
      description: profile.description || '',
    },
    posts,
    answers: parsed.answers || {},
    // The raw exchange, verbatim, because this is a jev demo and showing the
    // working is the point. The key rode in a header that is not in here.
    jev: { model: parsed.model || MODEL, request, response: parsed },
    usage: parsed.usage || null,
    latency_ms: latency,
    attempts,
    cached: false,
  };

  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(did, { at: Date.now(), data });
  return data;
}

/** Is there a model to ask? A boolean — never the key, its length or a prefix. */
export function health(env) {
  return { ok: true, configured: Boolean(env.TYPESAFE_API_KEY), model: MODEL, posts: N_POSTS };
}

export { MODEL, RATE_LIMIT, CACHE_TTL };
