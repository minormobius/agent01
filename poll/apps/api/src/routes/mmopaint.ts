/**
 * MMOPaint routes.
 *
 *   GET  /api/mmo/canvases                            — list canvases
 *   GET  /api/mmo/canvases/:id                        — get canvas metadata + head
 *   GET  /api/mmo/canvases/:id/strokes?since=&limit=  — paginated stroke replay
 *   GET  /api/mmo/canvases/:id/audit                  — chain head + contributor counts
 *   GET  /api/mmo/canvases/:id/contributors           — whitelist (if any)
 *   POST /api/mmo/canvases                            — create canvas (auth)   [v2]
 *   POST /api/mmo/canvases/:id/contributors           — add to whitelist (owner)
 *   GET  /api/mmo/canvases/:id/ws?session=…           — WebSocket upgrade -> DO
 *
 * The hash chain: each stroke row records prev_hash (the previous
 * stroke's this_hash) and this_hash = SHA-256(
 *   prev_hash || "\n" || seq || "\n" || author_did || "\n" ||
 *   tool || "\n" || color || "\n" || size || "\n" || points_json
 * ). Anyone with the full stroke log can replay & verify.
 */

import type { Env } from '../index.js';
import { getSession } from './auth.js';

const VALID_TOOLS = new Set(['brush', 'eraser', 'fill']);

export async function handleMmoRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/mmo/')) return null;

  if (url.pathname === '/api/mmo/canvases' && request.method === 'GET') {
    return listCanvases(env);
  }
  if (url.pathname === '/api/mmo/canvases' && request.method === 'POST') {
    return createCanvas(request, env);
  }

  const m = url.pathname.match(/^\/api\/mmo\/canvases\/([^/]+)(?:\/(.+))?$/);
  if (!m) return null;
  const canvasId = decodeURIComponent(m[1]);
  const sub      = m[2] || '';

  if (!sub) {
    if (request.method === 'GET') return getCanvas(env, canvasId);
    return null;
  }
  if (sub === 'strokes' && request.method === 'GET')      return getStrokes(env, url, canvasId);
  if (sub === 'audit'   && request.method === 'GET')      return getAudit(env, canvasId);
  if (sub === 'contributors' && request.method === 'GET') return listContributors(env, canvasId);
  if (sub === 'contributors' && request.method === 'POST') return addContributor(request, env, canvasId);
  if (sub === 'ws') return upgradeWebSocket(request, env, url, canvasId);

  return null;
}

// ---- canvas CRUD ------------------------------------------------------

async function listCanvases(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT id, owner_did, owner_handle, name, width, height,
            public_contribute, head_seq, head_hash, stroke_count,
            contributor_count, created_at, updated_at
       FROM mmo_canvases
       ORDER BY updated_at DESC, created_at DESC LIMIT 50`
  ).all();
  return json({ canvases: rows.results || [] });
}

async function getCanvas(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, owner_did, owner_handle, name, width, height,
            public_contribute, head_seq, head_hash, stroke_count,
            contributor_count, created_at, updated_at, record_uri, record_cid
       FROM mmo_canvases WHERE id = ?`
  ).bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  return json(row);
}

async function createCanvas(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }
  const name   = String(body.name || '').trim().slice(0, 64);
  const w      = Math.max(64, Math.min(4096, Number(body.width)  || 1024));
  const h      = Math.max(64, Math.min(4096, Number(body.height) || 1024));
  const pubC   = body.public_contribute === false ? 0 : 1;
  if (!name) return json({ error: 'name is required' }, 400);

  const id = `c-${cryptoRandomId(10)}`;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO mmo_canvases (id, owner_did, owner_handle, name, width, height,
                               public_contribute, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, session.did, session.handle, name, w, h, pubC, now, now).run();

  return json({ id, name, width: w, height: h, public_contribute: pubC,
                owner_did: session.did, owner_handle: session.handle });
}

// ---- audit / replay ---------------------------------------------------

async function getStrokes(env: Env, url: URL, canvasId: string): Promise<Response> {
  const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
  const limit = Math.min(2000, Math.max(1, parseInt(url.searchParams.get('limit') || '500', 10) || 500));

  const rows = await env.DB.prepare(
    `SELECT seq, author_did, author_handle, tool, color, size, points,
            prev_hash, this_hash AS hash, created_at
       FROM mmo_strokes
      WHERE canvas_id = ? AND seq > ?
      ORDER BY seq ASC LIMIT ?`
  ).bind(canvasId, since, limit).all();

  // Inflate points JSON for the client.
  const strokes = (rows.results || []).map((r: any) => ({
    ...r,
    points: safeParseArray(r.points),
  }));

  return json({ canvas_id: canvasId, since, count: strokes.length, strokes });
}

async function getAudit(env: Env, canvasId: string): Promise<Response> {
  const head = await env.DB.prepare(
    `SELECT head_seq, head_hash, stroke_count, contributor_count, updated_at, record_uri, record_cid
       FROM mmo_canvases WHERE id = ?`
  ).bind(canvasId).first();
  if (!head) return json({ error: 'not found' }, 404);

  const contribs = await env.DB.prepare(
    `SELECT author_did, author_handle, COUNT(*) AS n, MAX(created_at) AS last_at
       FROM mmo_strokes WHERE canvas_id = ?
       GROUP BY author_did ORDER BY n DESC LIMIT 50`
  ).bind(canvasId).all();

  return json({
    canvas_id: canvasId,
    head_seq: head.head_seq,
    head_hash: head.head_hash,
    stroke_count: head.stroke_count,
    contributors: contribs.results || [],
    published_to_pds: !!head.record_uri,
    record_uri: head.record_uri || null,
  });
}

async function listContributors(env: Env, canvasId: string): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT did, handle, added_at, added_by_did
       FROM mmo_contributors WHERE canvas_id = ?
       ORDER BY added_at ASC`
  ).bind(canvasId).all();
  return json({ canvas_id: canvasId, contributors: rows.results || [] });
}

async function addContributor(request: Request, env: Env, canvasId: string): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401);

  const canvas = await env.DB.prepare(
    `SELECT owner_did FROM mmo_canvases WHERE id = ?`
  ).bind(canvasId).first<{ owner_did: string }>();
  if (!canvas) return json({ error: 'not found' }, 404);
  if (canvas.owner_did !== session.did) return json({ error: 'only the owner can add contributors' }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }
  const did    = String(body.did    || '').trim();
  const handle = String(body.handle || '').trim().replace(/^@/, '');
  if (!did || !did.startsWith('did:')) return json({ error: 'did is required' }, 400);
  if (!handle)                          return json({ error: 'handle is required' }, 400);

  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO mmo_contributors (canvas_id, did, handle, added_at, added_by_did)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(canvasId, did, handle, now, session.did).run();
    await env.DB.prepare(
      `UPDATE mmo_canvases SET contributor_count = contributor_count + 1, updated_at = ?
        WHERE id = ?`
    ).bind(now, canvasId).run();
  } catch (e: any) {
    return json({ error: 'already a contributor or db error', detail: e?.message }, 409);
  }
  return json({ ok: true, did, handle });
}

// ---- WebSocket upgrade ------------------------------------------------

async function upgradeWebSocket(request: Request, env: Env, url: URL, canvasId: string): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket', { status: 426 });
  }
  // Session via query param — Bluesky-OAuth session id, same one the
  // /draw leaderboard uses. (Cookie auth is scoped to poll.mino.mobi
  // and won't be sent on a cross-origin WS handshake from mino.mobi.)
  const sessionId = url.searchParams.get('session');
  if (!sessionId) return new Response('missing session', { status: 401 });

  const session = await env.DB.prepare(
    `SELECT session_id, did, handle FROM sessions
      WHERE session_id = ? AND expires_at > datetime('now') AND did != 'pending'`
  ).bind(sessionId).first<any>();
  if (!session) return new Response('invalid session', { status: 401 });

  // Confirm the canvas exists before routing to the DO (cheaper than
  // spinning up the DO just to 404).
  const canvas = await env.DB.prepare(
    `SELECT id FROM mmo_canvases WHERE id = ?`
  ).bind(canvasId).first();
  if (!canvas) return new Response('canvas not found', { status: 404 });

  const id  = env.MMO_CANVAS.idFromName(canvasId);
  const obj = env.MMO_CANVAS.get(id);

  // Forward to the DO with the session context in headers it can read.
  const forwarded = new Request(request, {
    headers: {
      ...Object.fromEntries(request.headers),
      'X-Session-Did':    session.did,
      'X-Session-Handle': session.handle,
      'X-Canvas-Id':      canvasId,
    },
  });
  return obj.fetch(forwarded);
}

// ---- utils ------------------------------------------------------------

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function safeParseArray(s: any): number[] {
  if (typeof s !== 'string') return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
function cryptoRandomId(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, n);
}
