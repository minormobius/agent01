/**
 * MMOPaint routes — user-PDS-write edition.
 *
 * Each stroke is a com.minomobi.mmopaint.stroke record on the
 * *contributor's own* PDS. The worker is a thin proxy: it takes the
 * stroke payload, looks up the session, refreshes the user's
 * DPoP-bound OAuth token, then calls com.atproto.repo.createRecord
 * on the user's PDS with the right DPoP nonce dance.
 *
 *   POST /api/mmo/oauth/start    — OAuth with scope=atproto transition:generic
 *                                   (atproto alone can't write — see /api/draw
 *                                   which stays identity-only)
 *   GET  /api/mmo/info           — collection NSID, jetstream filter URL, scope info
 *   POST /api/mmo/strokes        — auth required + transition:generic scope.
 *                                   Writes a record on the contributor's PDS.
 *
 * Live updates: browser subscribes to Jetstream directly, filtered by
 * wantedCollections=com.minomobi.mmopaint.stroke (no wantedDids — strokes
 * live on many PDSes now).
 */

import type { Env } from '../index.js';
import { getSession, getPdsAccessToken } from './auth.js';
import { startOAuth } from '../oauth/flow.js';
import { createDPoPProof } from '../oauth/jwt.js';

const STROKE_COLLECTION = 'com.minomobi.mmopaint.stroke';
const REQUIRED_SCOPE    = 'transition:generic';
const VALID_TOOLS       = new Set(['brush', 'eraser', 'fill']);
const SUBMIT_COOLDOWN_MS = 200;
const MAX_POINTS         = 600;
const DRAW_FRONTEND_ORIGIN = 'https://mino.mobi';

// Per-isolate per-DID cooldown.
const lastSubmitByDid = new Map<string, number>();

export async function handleMmoRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/mmo/')) return null;

  if (url.pathname === '/api/mmo/info' && request.method === 'GET') {
    return mmoInfo(env);
  }
  if (url.pathname === '/api/mmo/oauth/start' && request.method === 'POST') {
    return startMmoOAuth(request, env);
  }
  if (url.pathname === '/api/mmo/strokes' && request.method === 'POST') {
    return submitStroke(request, env);
  }
  // Soft back-compat: old paths return /info shape so the frontend doesn't 500.
  if ((url.pathname === '/api/mmo/canvases/global'
    || url.pathname === '/api/mmo/strokes') && request.method === 'GET') {
    if (url.pathname === '/api/mmo/strokes') {
      // Records are scattered across user PDSes now — there's no single repo
      // to listRecords on. Return empty; the browser fills in from Jetstream.
      return json({ records: [], cursor: null, collection: STROKE_COLLECTION });
    }
    return mmoInfo(env);
  }
  return null;
}

// ---- /info --------------------------------------------------------

async function mmoInfo(_env: Env): Promise<Response> {
  // wantedCollections alone — strokes live on many PDSes now.
  const jetstream = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${encodeURIComponent(STROKE_COLLECTION)}`;
  return json({
    collection:        STROKE_COLLECTION,
    required_scope:    REQUIRED_SCOPE,
    jetstream_url:     jetstream,
    canvas:            'global',
    width:             1024,
    height:            1024,
  });
}

// ---- /oauth/start — request transition:generic scope --------------

async function startMmoOAuth(request: Request, env: Env): Promise<Response> {
  let body: { handle?: string; returnTo?: string };
  try { body = await request.json() as any; } catch { body = {}; }

  const handle = (body.handle || '').trim().replace(/^@/, '');
  if (!handle) return json({ error: 'handle is required' }, 400);

  let returnTo = (body.returnTo || `${DRAW_FRONTEND_ORIGIN}/mmo`).trim();
  if (!returnTo.startsWith(`${DRAW_FRONTEND_ORIGIN}/`)) {
    returnTo = `${DRAW_FRONTEND_ORIGIN}/mmo`;
  }

  if (env.ATPROTO_MOCK_MODE === 'true') {
    const fakeSession = `mock-${Date.now().toString(36)}`;
    const did = `did:plc:mock${handle.replace(/\./g, '')}`;
    await env.DB.prepare(
      `INSERT INTO sessions (session_id, did, handle, auth_method, oauth_scope, expires_at)
       VALUES (?, ?, ?, 'oauth', 'atproto transition:generic', datetime('now', '+24 hours'))`
    ).bind(fakeSession, did, handle).run();
    const sep = returnTo.includes('#') ? '&' : '#';
    return json({
      authUrl: `${returnTo}${sep}session=${encodeURIComponent(fakeSession)}&did=${encodeURIComponent(did)}&handle=${encodeURIComponent(handle)}`,
      mock: true,
    });
  }

  try {
    // Key difference from /api/draw/oauth/start: we ask for write scope.
    const result = await startOAuth(env, handle, returnTo, 'atproto transition:generic');
    return json({ authUrl: result.authUrl });
  } catch (err: any) {
    console.error('[mmo] OAuth start error:', err.message);
    return json({ error: err.message || 'OAuth start failed' }, 400);
  }
}

// ---- /strokes — write to user's PDS -------------------------------

async function submitStroke(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401);

  // Scope gate — atproto alone isn't enough to write to the user's repo.
  const scope = session.oauthScope || '';
  if (!scope.split(/\s+/).includes(REQUIRED_SCOPE)) {
    return json({
      error: 'session lacks write scope — sign in again to grant transition:generic',
      scope,
      required: REQUIRED_SCOPE,
    }, 403);
  }

  // Per-DID cooldown.
  const now = Date.now();
  const last = lastSubmitByDid.get(session.did) || 0;
  if (now - last < SUBMIT_COOLDOWN_MS) {
    return json({ error: 'slow down' }, 429);
  }
  lastSubmitByDid.set(session.did, now);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }

  const canvas = String(body.canvas || 'global').slice(0, 64);
  const tool   = String(body.tool || '');
  const color  = String(body.color || '');
  const size   = Number(body.size);
  const points = Array.isArray(body.points) ? body.points : null;

  if (!VALID_TOOLS.has(tool))                          return json({ error: 'invalid tool' }, 400);
  if (!/^#[0-9a-fA-F]{6}$/.test(color))                return json({ error: 'invalid color' }, 400);
  if (!Number.isInteger(size) || size < 1 || size > 80) return json({ error: 'invalid size' }, 400);
  if (!points || points.length < 2 || points.length % 2 !== 0)
                                                       return json({ error: 'invalid points' }, 400);
  if (points.length / 2 > MAX_POINTS)                  return json({ error: 'too many points' }, 400);

  const intPoints = (points as number[]).map((v) => Math.round(Number(v) || 0));

  // Get a fresh PDS access token for the user's session. Handles both
  // OAuth-DPoP and app-password sessions.
  const pdsAuth = await getPdsAccessToken(request, env);
  if (!pdsAuth) {
    return json({ error: 'could not refresh PDS token — try signing in again' }, 401);
  }

  const rkey = generateTid();
  const record = {
    $type:             STROKE_COLLECTION,
    canvas,
    tool,
    color:             color.toLowerCase(),
    size,
    points:            intPoints,
    createdAt:         new Date().toISOString(),
  };

  const createUrl = `${pdsAuth.pdsUrl}/xrpc/com.atproto.repo.createRecord`;
  const reqBody   = JSON.stringify({
    repo:       pdsAuth.did,
    collection: STROKE_COLLECTION,
    rkey,
    record,
  });

  let res: Response;
  try {
    if (pdsAuth.authMethod === 'oauth' && pdsAuth.dpopKeyPair) {
      let dpop = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', createUrl, undefined, pdsAuth.accessJwt);
      res = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `DPoP ${pdsAuth.accessJwt}`,
          'DPoP': dpop,
        },
        body: reqBody,
      });
      // Retry once with the DPoP-Nonce the PDS hands us.
      if (res.status === 401 || res.status === 400) {
        const nonce = res.headers.get('DPoP-Nonce');
        if (nonce) {
          dpop = await createDPoPProof(pdsAuth.dpopKeyPair, 'POST', createUrl, nonce, pdsAuth.accessJwt);
          res = await fetch(createUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `DPoP ${pdsAuth.accessJwt}`,
              'DPoP': dpop,
            },
            body: reqBody,
          });
        }
      }
    } else {
      res = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pdsAuth.accessJwt}`,
        },
        body: reqBody,
      });
    }
  } catch (e: any) {
    console.error('[mmo] PDS createRecord network error:', e?.message);
    return json({ error: 'pds network error', detail: e?.message }, 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[mmo] PDS createRecord failed:', res.status, text);
    return json({ error: 'pds write failed', status: res.status, detail: text.slice(0, 300) }, 502);
  }

  const data = await res.json() as { uri: string; cid: string };
  return json({
    ok:        true,
    uri:       data.uri,
    cid:       data.cid,
    rkey,
    repo:      pdsAuth.did,
    handle:    session.handle,
  });
}

// ---- utils --------------------------------------------------------

// ATProto TID: 13-char base32 of (microseconds<<10 | clockid), top bit clear.
const TID_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';
let lastTidUs = 0n;
function generateTid(): string {
  let nowUs = BigInt(Date.now()) * 1000n;
  if (nowUs <= lastTidUs) nowUs = lastTidUs + 1n;
  lastTidUs = nowUs;
  const clockid = BigInt(Math.floor(Math.random() * 1024));
  let v = (nowUs << 10n) | clockid;
  v = v & ((1n << 63n) - 1n);
  let s = '';
  for (let i = 0; i < 13; i++) {
    s = TID_ALPHABET[Number(v & 31n)] + s;
    v >>= 5n;
  }
  return s;
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
