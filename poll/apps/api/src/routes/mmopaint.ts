/**
 * MMOPaint routes — PDS-records edition.
 *
 * Pivot away from D1 + Durable Object. Strokes are now records on a
 * service PDS (`com.minomobi.mmopaint.stroke`), keyed by TID. The
 * service account writes on behalf of any authenticated contributor
 * for the public/global canvas; user-owned canvases (later) will
 * write to the contributor's own PDS.
 *
 *   GET  /api/mmo/info                  — service did, collection, jetstream filter URL
 *   POST /api/mmo/strokes               — submit a stroke (auth required); writes a record on the service PDS
 *   GET  /api/mmo/strokes               — list recent strokes (proxies listRecords; saves the client a CORS dance)
 *
 * Live updates: the browser subscribes to Jetstream directly, filtered
 * to wantedCollections=com.minomobi.mmopaint.stroke and wantedDids=<service-did>.
 * Browser also re-applies its own writes when they arrive on the firehose.
 */

import type { Env } from '../index.js';
import { getSession } from './auth.js';
import { PdsPublisher } from '@atpolls/shared';

const STROKE_COLLECTION = 'com.minomobi.mmopaint.stroke';
const VALID_TOOLS = new Set(['brush', 'eraser', 'fill']);
const SUBMIT_COOLDOWN_MS = 200;       // anti-mash per-DID floor
const MAX_POINTS = 600;

// Cheap per-isolate cooldown table (DID -> last submit ms).
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
  if (url.pathname === '/api/mmo/strokes' && request.method === 'POST') {
    return submitStroke(request, env);
  }
  if (url.pathname === '/api/mmo/strokes' && request.method === 'GET') {
    return listStrokes(env, url);
  }
  // Soft back-compat for old paths the frontend may still hit.
  if (url.pathname === '/api/mmo/canvases/global' && request.method === 'GET') {
    return mmoInfo(env);
  }
  return null;
}

// ---- helpers ------------------------------------------------------

function getServicePublisher(env: Env): PdsPublisher | null {
  if (!env.ATPROTO_SERVICE_HANDLE || !env.ATPROTO_SERVICE_PASSWORD || !env.ATPROTO_SERVICE_DID) {
    return null;
  }
  return new PdsPublisher({
    serviceUrl: env.ATPROTO_SERVICE_PDS || 'https://bsky.social',
    handle: env.ATPROTO_SERVICE_HANDLE,
    password: env.ATPROTO_SERVICE_PASSWORD,
    did: env.ATPROTO_SERVICE_DID,
  });
}

// ATProto TID — 13 chars, base32-sortish, monotonic per microsecond + clockid.
const TID_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';
let lastTidUs = 0n;
function generateTid(): string {
  let nowUs = BigInt(Date.now()) * 1000n;
  if (nowUs <= lastTidUs) nowUs = lastTidUs + 1n;
  lastTidUs = nowUs;
  const clockid = BigInt(Math.floor(Math.random() * 1024));
  let v = (nowUs << 10n) | clockid;
  v = v & ((1n << 63n) - 1n);  // top bit clear per spec
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

// ---- routes -------------------------------------------------------

async function mmoInfo(env: Env): Promise<Response> {
  const did = env.ATPROTO_SERVICE_DID || null;
  const handle = env.ATPROTO_SERVICE_HANDLE || null;
  const pds = env.ATPROTO_SERVICE_PDS || 'https://bsky.social';
  // wantedCollections alone is enough — our NSID is custom and there's
  // a single service publisher writing it. Dropped wantedDids because
  // some Jetstream instances trip on URL-encoded colons in the DID.
  const jetstream = `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=${encodeURIComponent(STROKE_COLLECTION)}`;
  return json({
    service_did:    did,
    service_handle: handle,
    service_pds:    pds,
    collection:     STROKE_COLLECTION,
    jetstream_url:  jetstream,
    canvas:         'global',
    width:          1024,
    height:         1024,
    has_service:    !!(env.ATPROTO_SERVICE_HANDLE && env.ATPROTO_SERVICE_PASSWORD && env.ATPROTO_SERVICE_DID),
  });
}

async function submitStroke(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401);

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

  const publisher = getServicePublisher(env);
  if (!publisher) return json({ error: 'service publisher not configured' }, 503);

  const rkey = generateTid();
  const record = {
    $type:             STROKE_COLLECTION,
    canvas,
    contributor:       session.did,
    contributorHandle: session.handle,
    tool,
    color:             color.toLowerCase(),
    size,
    points:            intPoints,
    createdAt:         new Date().toISOString(),
  };

  try {
    const result = await publisher.createRecord(STROKE_COLLECTION, rkey, record);
    return json({
      ok:   true,
      uri:  result.uri,
      cid:  result.cid,
      rkey,
      contributor: session.did,
    });
  } catch (e: any) {
    console.error('[mmo] PDS createRecord failed:', e?.message);
    return json({ error: 'pds write failed', detail: e?.message }, 502);
  }
}

async function listStrokes(env: Env, url: URL): Promise<Response> {
  const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
  const cursor = url.searchParams.get('cursor') || undefined;

  const publisher = getServicePublisher(env);
  if (!publisher) return json({ error: 'service publisher not configured' }, 503);

  try {
    const data = await publisher.listRecords(STROKE_COLLECTION, limit, cursor);
    return json({
      collection:  STROKE_COLLECTION,
      service_did: env.ATPROTO_SERVICE_DID || null,
      records:     data.records,
      cursor:      data.cursor,
    });
  } catch (e: any) {
    console.error('[mmo] PDS listRecords failed:', e?.message);
    return json({ error: 'list failed', detail: e?.message }, 502);
  }
}
