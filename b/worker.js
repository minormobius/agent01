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

// ── Gemini 2.5 Flash regex assistant ─────────────────────────────────────────
async function gemini(env, system, user) {
  const u = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(env.GEMINI_API_KEY);
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
  };
  const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('gemini ' + r.status + ': ' + (await r.text()).slice(0, 160));
  const j = await r.json();
  const cand = (j.candidates || [])[0] || {};
  return (cand.content && cand.content.parts) ? cand.content.parts.map((x) => x.text || '').join('') : '';
}

const REGEX_SYSTEM = [
  'You generate ONE JavaScript-compatible regular expression to filter Bluesky posts by their TEXT, for a no-code feed builder.',
  'Reply ONLY with JSON: {"pattern": string, "mode": "include"|"exclude", "label": string, "explain": string}.',
  'pattern: a JS regex body used as new RegExp(pattern, "i") — no surrounding slashes, no flags, backslashes escaped for JSON.',
  'mode: "include" keeps posts whose text matches; "exclude" drops posts whose text matches.',
  'label: 2-5 words. explain: one short sentence.',
  'Prefer word boundaries (\\b) and alternation; cover common synonyms/variants; keep it readable.',
  'Examples:',
  '"posts about coffee" -> {"pattern":"\\\\b(coffee|espresso|latte|cappuccino|cold ?brew|barista)\\\\b","mode":"include","label":"about coffee","explain":"Keeps posts mentioning coffee."}',
  '"posts without websites or links" -> {"pattern":"https?://|www\\\\.|\\\\b[a-z0-9-]+\\\\.(com|net|org|io|co|app|dev|news|xyz|me|gg|sh|ai)\\\\b","mode":"exclude","label":"no links","explain":"Drops posts containing URLs or domains."}',
].join('\n');

async function regexAssistant(request, env) {
  if (!env.GEMINI_API_KEY) return json({ error: 'regex assistant not configured' }, 503);
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const prompt = String((body && body.prompt) || '').slice(0, 500);
  if (!prompt.trim()) return json({ error: 'describe the filter you want' }, 400);
  try {
    const out = await gemini(env, REGEX_SYSTEM, prompt);
    let p; try { p = JSON.parse(out); } catch { return json({ error: 'the model did not return valid JSON' }, 502); }
    try { new RegExp(p.pattern, 'i'); } catch { return json({ error: 'produced an invalid regex' }, 502); }
    return json({
      pattern: String(p.pattern),
      mode: p.mode === 'exclude' ? 'exclude' : 'include',
      label: String(p.label || '').slice(0, 60),
      explain: String(p.explain || '').slice(0, 200),
    });
  } catch (e) { return json({ error: String((e && e.message) || e) }, 502); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (path === '/.well-known/did.json') return json(didDoc());
    if (path === '/xrpc/app.bsky.feed.describeFeedGenerator') return json({ did: SERVICE_DID, feeds: [] });
    if (path === '/xrpc/app.bsky.feed.getFeedSkeleton') return getFeedSkeleton(url, env);
    if (path === '/api/feedgen/regex' && request.method === 'POST') return regexAssistant(request, env);

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
