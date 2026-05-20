// airchat — voice-first social on ATProto.
//
// Roles:
//   - Recording UX (single-page recorder + feed) served via ASSETS binding.
//   - BFF for app-password auth (session JWTs never reach the browser).
//   - Whisper proxy (audio blob → OpenAI → transcript).
//   - PDS proxy (uploadBlob + createRecord under the user's credentials).
//   - Feed cache (D1 mirror of every whitelisted user's voice records).
//
// Auth model (v1):
//   Browser sends handle + app password to /api/airchat/auth/start.
//   Worker creates a PDS session, stores access/refresh JWTs server-side,
//   issues an opaque session_id as an httpOnly cookie. Every subsequent
//   request reads that cookie to look up the session.
//
// Whitelist:
//   Every WRITE-side route checks `airchat_whitelist`. Reads are public.
//   Anyone could fork the schema and write `com.minomobi.airchat.voice`
//   records to their own PDS — that's ATProto. The whitelist gates
//   our UX + transcription + feed-curation, not the data itself.

import {
  startOAuth, handleOAuthCallback, refreshOAuthSession, dpopFetch,
  OAUTH_CLIENT_ID, OAUTH_REDIRECT_URI,
} from './oauth/flow.js';
import { getClientPublicJWK } from './oauth/keypair.js';

const LEXICON = 'com.minomobi.airchat.voice';
const PUBLIC_API = 'https://api.bsky.app';
const PLC_DIR = 'https://plc.directory';
const SESSION_TTL_SEC = 60 * 60 * 24 * 14;       // 14 days
const ACCESS_REFRESH_MARGIN_SEC = 5 * 60;        // refresh access token 5 min before expiry
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;        // 16 MB — Whisper hard cap is 25 MB
const MAX_RECORDING_SEC = 90;                    // UX cap; enforced again client-side
const FEED_PAGE = 50;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/airchat/health') {
        return json({
          ok: true,
          service: 'airchat',
          bindings: { db: !!env.DB, assets: !!env.ASSETS, openai: !!env.OPENAI_API_KEY, admin: !!env.ADMIN_KEY },
        });
      }
      if (url.pathname === '/client-metadata.json')                                 return clientMetadata(env);
      if (url.pathname === '/api/airchat/whitelist/check')                          return whitelistCheck(request, env);
      if (url.pathname === '/api/airchat/auth/oauth/start' && request.method === 'POST')   return oauthStart(request, env);
      if (url.pathname === '/api/airchat/auth/oauth/callback' && request.method === 'GET') return oauthCallback(request, env, url);
      if (url.pathname === '/api/airchat/auth/me')                                  return authMe(request, env);
      if (url.pathname === '/api/airchat/auth/logout' && request.method === 'POST') return authLogout(request, env);
      if (url.pathname === '/api/airchat/transcribe' && request.method === 'POST')  return transcribe(request, env);
      if (url.pathname === '/api/airchat/post' && request.method === 'POST')        return postVoice(request, env);
      if (url.pathname === '/api/airchat/feed')                                     return feedList(request, env, url);
      if (url.pathname === '/api/airchat/voice')                                    return voiceGet(request, env, url);

      // Admin (gated by X-Admin-Key header matching ADMIN_KEY secret):
      if (url.pathname === '/api/airchat/admin/whitelist/add' && request.method === 'POST')    return adminWhitelistAdd(request, env);
      if (url.pathname === '/api/airchat/admin/whitelist/remove' && request.method === 'POST') return adminWhitelistRemove(request, env);
      if (url.pathname === '/api/airchat/admin/whitelist/list')                                return adminWhitelistList(request, env);

      if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    } catch (e) {
      console.error('airchat error', e);
      return json({ error: String(e?.message || e) }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---------- helpers ----------

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function readCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookieHeader(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push('Path=/');
  parts.push('HttpOnly');
  parts.push('Secure');
  parts.push('SameSite=Lax');
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join('; ');
}

function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

function nowSec() { return Math.floor(Date.now() / 1000); }

// Whisper returns languages as English full names ("english", "spanish",
// "portuguese"). The lexicon expects BCP-47 codes. Map common ones; for
// everything else return null so the field gets dropped rather than
// risking a PDS lexicon-validation rejection on a non-conforming value.
const WHISPER_TO_BCP47 = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', dutch: 'nl', russian: 'ru', polish: 'pl', turkish: 'tr',
  japanese: 'ja', korean: 'ko', chinese: 'zh', arabic: 'ar', hindi: 'hi',
  ukrainian: 'uk', czech: 'cs', greek: 'el', hebrew: 'he', vietnamese: 'vi',
  thai: 'th', indonesian: 'id', swedish: 'sv', norwegian: 'no', danish: 'da',
  finnish: 'fi', romanian: 'ro', hungarian: 'hu',
};
function normalizeLang(s) {
  if (!s) return null;
  const v = String(s).trim().toLowerCase();
  // Already a 2-3 char BCP-47 code → pass through (loosely)
  if (/^[a-z]{2,3}(-[a-z]{2,8})?$/.test(v)) return v;
  return WHISPER_TO_BCP47[v] || null;
}

// Decode a JWT payload (un-verified) for inspection — used to read `exp`.
function jwtExp(jwt) {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch { return null; }
}

// ---------- identity ----------

async function resolveHandle(handle) {
  const h = String(handle || '').replace(/^@/, '').trim().toLowerCase();
  if (!h) throw new Error('empty handle');
  const res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(h)}`);
  if (!res.ok) throw new Error(`resolveHandle failed (${res.status}) for @${h}`);
  const { did } = await res.json();
  return { did, handle: h };
}

async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`${PLC_DIR}/${did}`);
    if (!res.ok) throw new Error(`PLC lookup failed (${res.status}) for ${did}`);
    doc = await res.json();
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replace(/:/g, '/');
    const res = await fetch(`https://${host}/.well-known/did.json`);
    if (!res.ok) throw new Error(`did:web lookup failed (${res.status}) for ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`unsupported DID method: ${did}`);
  }
  for (const svc of doc.service || []) {
    if (svc.id === '#atproto_pds' || svc.type === 'AtprotoPersonalDataServer') return svc.serviceEndpoint;
  }
  throw new Error(`no PDS endpoint for ${did}`);
}

// ---------- session storage ----------

async function loadSession(env, sessionId) {
  if (!sessionId) return null;
  const row = await env.DB.prepare(
    `SELECT session_id, did, handle, pds_url, access_jwt, refresh_jwt, access_expires_at,
            auth_method, dpop_key_jwk, oauth_scope, created_at
       FROM airchat_sessions WHERE session_id = ?`
  ).bind(sessionId).first();
  return row || null;
}

async function saveSession(env, sess) {
  await env.DB.prepare(
    `INSERT INTO airchat_sessions
       (session_id, did, handle, pds_url, access_jwt, refresh_jwt, access_expires_at,
        auth_method, dpop_key_jwk, oauth_scope, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
     ON CONFLICT(session_id) DO UPDATE SET
       access_jwt = excluded.access_jwt,
       refresh_jwt = excluded.refresh_jwt,
       access_expires_at = excluded.access_expires_at,
       dpop_key_jwk = excluded.dpop_key_jwk,
       last_seen_at = unixepoch()`
  ).bind(
    sess.session_id, sess.did, sess.handle, sess.pds_url,
    sess.access_jwt, sess.refresh_jwt, sess.access_expires_at,
    sess.auth_method || 'app_password',
    sess.dpop_key_jwk || null,
    sess.oauth_scope || null,
    sess.created_at || nowSec()
  ).run();
}

async function deleteSession(env, sessionId) {
  if (!sessionId) return;
  await env.DB.prepare(`DELETE FROM airchat_sessions WHERE session_id = ?`).bind(sessionId).run();
}

// Ensure the session's access JWT is still fresh; refresh via PDS (app-
// password) or OAuth token endpoint (oauth) depending on the auth method.
async function ensureFreshAccess(env, sess) {
  if (!sess) return null;
  const exp = sess.access_expires_at || 0;
  if (exp - nowSec() > ACCESS_REFRESH_MARGIN_SEC) return sess;
  if (sess.auth_method === 'oauth') {
    const next = await refreshOAuthSession(env, sess);
    if (!next) { await deleteSession(env, sess.session_id); return null; }
    sess.access_jwt = next.accessJwt;
    sess.refresh_jwt = next.refreshJwt;
    sess.access_expires_at = next.accessExpiresAt;
    sess.dpop_key_jwk = next.dpopKeyJwk;
    await saveSession(env, sess);
    return sess;
  }
  // app-password path
  const refreshed = await fetch(`${sess.pds_url.replace(/\/$/, '')}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${sess.refresh_jwt}` },
  });
  if (!refreshed.ok) {
    await deleteSession(env, sess.session_id);
    return null;
  }
  const next = await refreshed.json();
  sess.access_jwt = next.accessJwt;
  sess.refresh_jwt = next.refreshJwt;
  sess.access_expires_at = jwtExp(next.accessJwt) || nowSec() + 60 * 60;
  await saveSession(env, sess);
  return sess;
}

async function requireSession(request, env) {
  const sessionId = readCookie(request, 'airchat_sid');
  let sess = await loadSession(env, sessionId);
  sess = await ensureFreshAccess(env, sess);
  if (!sess) {
    const err = new Error('not authenticated');
    err.status = 401;
    throw err;
  }
  return sess;
}

// ---------- whitelist ----------
//
// Two layers:
//   1. airchat_whitelist table — the durable record. Seeded from
//      airchat/whitelist.txt on every deploy. Indexed by DID.
//   2. LIVE_WHITELIST_LISTS — bluesky lists treated as live sources of
//      truth. On every auth check, if a DID isn't in the table, we
//      fetch the list members (cached 5 min per worker isolate) and
//      check membership. A live-list match auto-inserts the DID into
//      the table so future checks are O(1).
//
// Effect: adding someone to the bsky list grants them access in ≤5
// minutes without a redeploy. Removing them from the bsky list does
// NOT auto-revoke — the cached row sticks. For a hard revoke, delete
// the row manually:
//   wrangler d1 execute atpolls-db --remote \
//     --command "DELETE FROM airchat_whitelist WHERE did = '...';"
const LIVE_WHITELIST_LISTS = [
  'at://did:plc:7zre4plmd5jllccww575j6sb/app.bsky.graph.list/3mmcwc5lx7o2p',
];
const LIVE_LIST_CACHE_TTL_MS = 5 * 60 * 1000;
const _liveListCache = new Map();        // listUri → { members: Set<DID>, expires: number }

async function fetchListMembers(uri) {
  const members = new Set();
  let cursor;
  // Safety cap: 10 pages = 1000 members.
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ list: uri, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${PUBLIC_API}/xrpc/app.bsky.graph.getList?${params}`);
    if (!res.ok) break;
    const data = await res.json();
    for (const item of (data.items || [])) {
      if (item.subject?.did) members.add(item.subject.did);
    }
    if (!data.cursor) break;
    cursor = data.cursor;
  }
  return members;
}

async function getListMembersCached(uri) {
  const cached = _liveListCache.get(uri);
  if (cached && cached.expires > Date.now()) return cached.members;
  try {
    const members = await fetchListMembers(uri);
    _liveListCache.set(uri, { members, expires: Date.now() + LIVE_LIST_CACHE_TTL_MS });
    return members;
  } catch (e) {
    console.error('live list fetch failed', uri, e);
    // Return stale cache if present; better than 5xx for a transient API hiccup.
    return cached?.members || new Set();
  }
}

async function isOnAnyLiveList(did) {
  for (const uri of LIVE_WHITELIST_LISTS) {
    const members = await getListMembersCached(uri);
    if (members.has(did)) return true;
  }
  return false;
}

async function isWhitelisted(env, did) {
  if (!did) return false;
  const row = await env.DB.prepare(`SELECT did FROM airchat_whitelist WHERE did = ?`).bind(did).first();
  if (row) return true;
  if (await isOnAnyLiveList(did)) {
    // Cache the hit so future checks are O(1) and survive worker restarts.
    // INSERT OR IGNORE in case two requests race.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO airchat_whitelist (did, handle, note) VALUES (?, NULL, 'live: bsky list')`
    ).bind(did).run();
    return true;
  }
  return false;
}

async function requireWhitelisted(env, did) {
  if (await isWhitelisted(env, did)) return;
  const err = new Error('not on whitelist');
  err.status = 403;
  throw err;
}

// ---------- auth routes ----------

async function whitelistCheck(request, env) {
  const url = new URL(request.url);
  // Two call shapes:
  //   ?did=... → public lookup (live-aware: a bsky-list add takes effect ≤5min)
  //   no params → uses current session cookie (UI deciding recorder vs denied)
  let did = url.searchParams.get('did');
  if (!did) {
    const sid = readCookie(request, 'airchat_sid');
    const sess = sid ? await loadSession(env, sid) : null;
    if (!sess) return json({ whitelisted: false, authenticated: false });
    const wl = await isWhitelisted(env, sess.did);
    return json({ whitelisted: wl, authenticated: true, did: sess.did, handle: sess.handle });
  }
  const wl = await isWhitelisted(env, did);
  return json({ whitelisted: wl, did });
}

// App-password auth was removed in favor of OAuth-only. The
// /api/airchat/auth/start route no longer exists. Existing
// app-password sessions in airchat_sessions remain valid until they
// naturally expire; on first refresh failure they're deleted via
// ensureFreshAccess and the user is forced to re-auth via OAuth.

async function authMe(request, env) {
  try {
    const sess = await requireSession(request, env);
    return json({ did: sess.did, handle: sess.handle, pds_url: sess.pds_url });
  } catch (e) {
    return json({ authenticated: false }, e.status || 401);
  }
}

async function authLogout(request, env) {
  const sid = readCookie(request, 'airchat_sid');
  await deleteSession(env, sid);
  return json(
    { ok: true },
    200,
    { 'Set-Cookie': setCookieHeader('airchat_sid', '', { maxAge: 0 }) }
  );
}

// ---------- whisper ----------

async function transcribe(request, env) {
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY not configured' }, 500);
  let sess;
  try { sess = await requireSession(request, env); } catch (e) { return json({ error: e.message }, e.status || 401); }
  try { await requireWhitelisted(env, sess.did); } catch (e) { return json({ error: e.message }, e.status || 403); }

  const ct = request.headers.get('Content-Type') || '';
  const audioBytes = await request.arrayBuffer();
  if (audioBytes.byteLength > MAX_AUDIO_BYTES) {
    return json({ error: `audio too large (${audioBytes.byteLength} > ${MAX_AUDIO_BYTES})` }, 413);
  }
  if (audioBytes.byteLength < 200) {
    return json({ error: 'audio too small / empty' }, 400);
  }

  // OpenAI Whisper expects multipart/form-data with a file field.
  const ext = ct.includes('webm') ? 'webm' : ct.includes('mp4') ? 'mp4' : ct.includes('ogg') ? 'ogg' : ct.includes('wav') ? 'wav' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audioBytes], { type: ct || 'audio/webm' }), `voice.${ext}`);
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');         // brings back detected language + segments

  const t0 = Date.now();
  const wRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!wRes.ok) {
    const body = await wRes.text().catch(() => '');
    return json({ error: `whisper failed (${wRes.status})`, details: body.slice(0, 300) }, 502);
  }
  const data = await wRes.json();
  return json({
    text: data.text || '',
    duration: data.duration || null,
    language: data.language || null,
    time_ms: Date.now() - t0,
    audio_bytes: audioBytes.byteLength,
  });
}

// ---------- post (upload blob + create record + cache) ----------

async function postVoice(request, env) {
  let sess;
  try { sess = await requireSession(request, env); } catch (e) { return json({ error: e.message }, e.status || 401); }
  try { await requireWhitelisted(env, sess.did); } catch (e) { return json({ error: e.message }, e.status || 403); }

  // Multipart: audio file + JSON metadata (text, duration, reply, lang).
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.startsWith('multipart/form-data')) {
    return json({ error: 'expected multipart/form-data with audio + meta' }, 400);
  }
  const form = await request.formData();
  const audio = form.get('audio');
  const metaRaw = form.get('meta');
  if (!(audio instanceof Blob)) return json({ error: 'missing audio' }, 400);
  if (typeof metaRaw !== 'string') return json({ error: 'missing meta' }, 400);
  let meta;
  try { meta = JSON.parse(metaRaw); } catch { return json({ error: 'bad meta json' }, 400); }
  const text = String(meta.text || '').slice(0, 4000);
  if (!text) return json({ error: 'empty transcript' }, 400);
  const duration = Number(meta.duration) || null;
  if (duration && duration > MAX_RECORDING_SEC + 5) return json({ error: 'recording too long' }, 400);
  const lang = Array.isArray(meta.lang) ? meta.lang.slice(0, 3).map(String) : null;
  const reply = (meta.reply && meta.reply.parent && meta.reply.root) ? {
    parent: { uri: String(meta.reply.parent.uri), cid: String(meta.reply.parent.cid) },
    root:   { uri: String(meta.reply.root.uri),   cid: String(meta.reply.root.cid) },
  } : null;

  const audioBytes = await audio.arrayBuffer();
  if (audioBytes.byteLength > MAX_AUDIO_BYTES) {
    return json({ error: `audio too large (${audioBytes.byteLength})` }, 413);
  }
  // Strip codec parameters off the MIME type — PDS lexicon validation
  // can reject "audio/webm;codecs=opus" even though it's a valid HTTP
  // MIME. Keep the base type only.
  const audioMime = (audio.type || 'audio/webm').split(';')[0].trim() || 'audio/webm';

  // 1) uploadBlob → returns { blob: { $type, ref: { $link }, mimeType, size } }
  const uploadUrl = `${sess.pds_url.replace(/\/$/, '')}/xrpc/com.atproto.repo.uploadBlob`;
  const upRes = await pdsAuthCall(sess, 'POST', uploadUrl, { 'Content-Type': audioMime }, audioBytes);
  if (!upRes.ok) {
    const b = await upRes.text().catch(() => '');
    console.error('uploadBlob failed', upRes.status, b);
    return json({ error: `uploadBlob failed (${upRes.status})`, details: b.slice(0, 500) }, 502);
  }
  const uploaded = await upRes.json();
  const audioBlob = uploaded.blob;
  if (!audioBlob?.ref?.$link) {
    return json({ error: 'uploadBlob returned no ref' }, 502);
  }

  // 2) createRecord with our custom lexicon
  const record = {
    $type: LEXICON,
    audio: audioBlob,
    text,
    createdAt: new Date().toISOString(),
  };
  // ATProto records are stored as DAG-CBOR which has no float type — only
  // integers. Round duration to nearest second. Sub-second precision is
  // meaningless for a voice post anyway.
  if (duration) record.duration = Math.max(1, Math.round(duration));
  // Whisper returns language as a full name ("english", "spanish") not a
  // BCP-47 code. Map a few common ones; otherwise drop the field rather
  // than risk a lexicon validation rejection on the PDS side.
  if (lang) {
    const mapped = lang.map(normalizeLang).filter(Boolean);
    if (mapped.length) record.lang = mapped;
  }
  if (reply) record.reply = reply;

  const createUrl = `${sess.pds_url.replace(/\/$/, '')}/xrpc/com.atproto.repo.createRecord`;
  const crRes = await pdsAuthCall(sess, 'POST', createUrl, { 'Content-Type': 'application/json' }, JSON.stringify({
    repo: sess.did,
    collection: LEXICON,
    record,
  }));
  if (!crRes.ok) {
    const b = await crRes.text().catch(() => '');
    console.error('createRecord failed', crRes.status, b, 'record was:', JSON.stringify(record).slice(0, 500));
    return json({ error: `createRecord failed (${crRes.status})`, details: b.slice(0, 500) }, 502);
  }
  const created = await crRes.json();
  const uri = created.uri;
  const cid = created.cid;
  const rkey = uri.split('/').pop();

  // 3) cache in D1 for fast feed reads
  await env.DB.prepare(
    `INSERT OR REPLACE INTO airchat_voices
       (uri, did, rkey, cid, pds_url, audio_cid, audio_mime, audio_size, duration_sec,
        text, reply_root_uri, reply_root_cid, reply_parent_uri, reply_parent_cid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    uri, sess.did, rkey, cid, sess.pds_url,
    audioBlob.ref.$link, audioMime, audioBlob.size || audioBytes.byteLength, duration,
    text,
    reply ? reply.root.uri : null,
    reply ? reply.root.cid : null,
    reply ? reply.parent.uri : null,
    reply ? reply.parent.cid : null,
    record.createdAt
  ).run();

  return json({
    ok: true,
    uri, cid, rkey,
    audio_cid: audioBlob.ref.$link,
    audio_mime: audioMime,
    audio_url: audioUrlFor(sess.pds_url, sess.did, audioBlob.ref.$link),
    duration,
    text,
    created_at: record.createdAt,
  });
}

// ---------- feed (public read) ----------

async function feedList(request, env, url) {
  const did = url.searchParams.get('did');
  const cursor = url.searchParams.get('cursor');
  const limit = Math.min(FEED_PAGE, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10)));
  let rows;
  if (did) {
    rows = await env.DB.prepare(
      `SELECT v.uri, v.did, v.rkey, v.cid, v.pds_url, v.audio_cid, v.audio_mime, v.duration_sec, v.text,
              v.reply_root_uri, v.reply_root_cid, v.reply_parent_uri, v.reply_parent_cid, v.created_at,
              w.handle
         FROM airchat_voices v
         LEFT JOIN airchat_whitelist w ON w.did = v.did
        WHERE v.did = ? ${cursor ? 'AND v.created_at < ?' : ''}
        ORDER BY v.created_at DESC LIMIT ?`
    ).bind(...(cursor ? [did, cursor, limit] : [did, limit])).all();
  } else {
    rows = await env.DB.prepare(
      `SELECT v.uri, v.did, v.rkey, v.cid, v.pds_url, v.audio_cid, v.audio_mime, v.duration_sec, v.text,
              v.reply_root_uri, v.reply_root_cid, v.reply_parent_uri, v.reply_parent_cid, v.created_at,
              w.handle
         FROM airchat_voices v
         INNER JOIN airchat_whitelist w ON w.did = v.did
        ${cursor ? 'WHERE v.created_at < ?' : ''}
        ORDER BY v.created_at DESC LIMIT ?`
    ).bind(...(cursor ? [cursor, limit] : [limit])).all();
  }
  const items = (rows.results || []).map((r) => ({
    uri: r.uri,
    cid: r.cid,
    did: r.did,
    handle: r.handle,
    rkey: r.rkey,
    text: r.text,
    duration: r.duration_sec,
    audio_cid: r.audio_cid,
    audio_mime: r.audio_mime,
    audio_url: audioUrlFor(r.pds_url, r.did, r.audio_cid),
    reply: r.reply_parent_uri ? {
      parent_uri: r.reply_parent_uri, parent_cid: r.reply_parent_cid,
      root_uri: r.reply_root_uri,     root_cid: r.reply_root_cid,
    } : null,
    created_at: r.created_at,
  }));
  const nextCursor = items.length === limit ? items[items.length - 1].created_at : null;
  return json({ items, cursor: nextCursor });
}

async function voiceGet(request, env, url) {
  const uri = url.searchParams.get('uri');
  if (!uri) return json({ error: 'missing uri' }, 400);
  const row = await env.DB.prepare(
    `SELECT v.*, w.handle FROM airchat_voices v
     LEFT JOIN airchat_whitelist w ON w.did = v.did
     WHERE v.uri = ?`
  ).bind(uri).first();
  if (!row) return json({ error: 'not found' }, 404);
  return json({
    uri: row.uri,
    did: row.did,
    handle: row.handle,
    rkey: row.rkey,
    text: row.text,
    duration: row.duration_sec,
    audio_cid: row.audio_cid,
    audio_mime: row.audio_mime,
    audio_url: audioUrlFor(row.did, row.audio_cid),
    created_at: row.created_at,
  });
}

// Build the public sync.getBlob URL for an audio blob. PDS records are
// public, and com.atproto.sync.getBlob is the standard read endpoint —
// no auth needed, CORS allowed on bsky.social and most ATProto PDSes.
function audioUrlFor(pdsUrl, did, cid) {
  if (!pdsUrl || !did || !cid) return null;
  return `${pdsUrl.replace(/\/$/, '')}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
}

// ---------- admin ----------

function requireAdmin(request, env) {
  const key = request.headers.get('X-Admin-Key');
  if (!env.ADMIN_KEY) { const e = new Error('admin disabled'); e.status = 503; throw e; }
  if (key !== env.ADMIN_KEY) { const e = new Error('forbidden'); e.status = 403; throw e; }
}

async function adminWhitelistAdd(request, env) {
  try { requireAdmin(request, env); } catch (e) { return json({ error: e.message }, e.status || 403); }
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { did, handle, note } = body || {};
  if (!did || !did.startsWith('did:')) return json({ error: 'missing or bad did' }, 400);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO airchat_whitelist (did, handle, added_at, added_by, note)
     VALUES (?, ?, unixepoch(), ?, ?)`
  ).bind(did, handle || null, body.added_by || 'admin', note || null).run();
  return json({ ok: true, did, handle });
}

async function adminWhitelistRemove(request, env) {
  try { requireAdmin(request, env); } catch (e) { return json({ error: e.message }, e.status || 403); }
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const did = body?.did;
  if (!did) return json({ error: 'missing did' }, 400);
  await env.DB.prepare(`DELETE FROM airchat_whitelist WHERE did = ?`).bind(did).run();
  return json({ ok: true, did });
}

async function adminWhitelistList(request, env) {
  try { requireAdmin(request, env); } catch (e) { return json({ error: e.message }, e.status || 403); }
  const { results } = await env.DB.prepare(
    `SELECT did, handle, added_at, added_by, note FROM airchat_whitelist ORDER BY added_at DESC`
  ).all();
  return json({ whitelist: results || [] });
}

// ---------- PDS request dispatch (Bearer for app-password, DPoP for OAuth) ----------

async function pdsAuthCall(sess, method, url, headers, body) {
  if (sess.auth_method === 'oauth') {
    return dpopFetch(sess, method, url, headers, body);
  }
  return fetch(url, {
    method,
    headers: { ...headers, 'Authorization': `Bearer ${sess.access_jwt}` },
    body,
  });
}

// ---------- OAuth routes ----------

async function clientMetadata(env) {
  // ATProto OAuth identifies clients by the URL of this very document.
  // We embed the public key so the auth server can verify our
  // private_key_jwt client assertions. Key auto-generates on first
  // request via getClientPublicJWK (which seeds airchat_oauth_keypair).
  // Scope MUST match what flow.js requests at PAR time. Granular scopes:
  //   atproto                          — base identity
  //   repo:com.minomobi.airchat.voice  — write our voice records only
  //   blob:audio/*                     — upload audio blobs only
  // No `transition:generic`. Token can't touch app.bsky.* records or
  // anything else outside our lexicon.
  const metadata = {
    client_id: OAUTH_CLIENT_ID,
    client_name: 'yapchat',
    client_uri: 'https://airchat.mino.mobi',
    redirect_uris: [OAUTH_REDIRECT_URI],
    scope: 'atproto repo:com.minomobi.airchat.voice blob:audio/*',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true,
    application_type: 'web',
  };
  try {
    const publicJwk = await getClientPublicJWK(env.DB);
    metadata.jwks = { keys: [publicJwk] };
  } catch (e) {
    console.error('client-metadata: keypair fetch failed', e);
  }
  return new Response(JSON.stringify(metadata, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function oauthStart(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const handle = String(body?.handle || '').replace(/^@/, '').trim();
  if (!handle) return json({ error: 'missing handle' }, 400);
  const returnTo = typeof body?.return_to === 'string' ? body.return_to : null;
  try {
    const { authUrl, state } = await startOAuth(env, handle, returnTo);
    return json({ ok: true, auth_url: authUrl, state });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 400);
  }
}

async function oauthCallback(request, env, url) {
  // Auth server redirects the user agent here with ?code=&state=&iss=.
  // We exchange the code for tokens (server-to-server), establish the
  // session cookie, then 302 the user back to '/' (or returnTo).
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');
  if (errParam) {
    return new Response(`OAuth error: ${errParam} — ${url.searchParams.get('error_description') || ''}`, { status: 400 });
  }
  if (!code || !state) return new Response('missing code or state', { status: 400 });

  let result;
  try {
    result = await handleOAuthCallback(env, code, state);
  } catch (e) {
    return new Response('OAuth callback failed: ' + (e?.message || e), { status: 400 });
  }

  // Whitelist gate is enforced at /api/airchat/whitelist/check on bootstrap
  // and on every write route (transcribe, post). We always set the session
  // here regardless — non-whitelisted users land on the denied stage but
  // can still browse the feed. Live-list resolution (bsky-list add → ≤5min
  // access) happens via isWhitelisted() at check time.

  const session_id = randomHex(32);
  await saveSession(env, {
    session_id,
    did: result.did,
    handle: result.handle,
    pds_url: result.pdsUrl,
    access_jwt: result.accessJwt,
    refresh_jwt: result.refreshJwt,
    access_expires_at: result.accessExpiresAt,
    auth_method: 'oauth',
    dpop_key_jwk: result.dpopKeyJwk,
    oauth_scope: result.scope,
    created_at: nowSec(),
  });

  const redirect = result.returnTo || '/';
  return new Response(null, {
    status: 302,
    headers: {
      'Location': redirect,
      'Set-Cookie': setCookieHeader('airchat_sid', session_id, { maxAge: SESSION_TTL_SEC }),
    },
  });
}
