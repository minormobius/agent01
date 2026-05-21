/**
 * Polygon-drawing game leaderboard routes.
 * Served by the poll worker because it already owns the D1 binding and the
 * OAuth machinery. The draw frontend lives at https://mino.mobi/draw and
 * calls these endpoints cross-origin with Bearer-token auth.
 *
 * OAuth scope: `atproto` only — we just need a verified DID. No write
 * permission to the user's PDS, no read of private records.
 *
 *   POST /api/draw/oauth/start  — start identity-only OAuth, returns authUrl
 *   GET  /api/draw/me           — current session (DID + handle) or null
 *   POST /api/draw/submit       — submit a score (auth required)
 *   GET  /api/draw/leaderboard  — public top-N feed (filter by shape/period)
 */

import type { Env } from '../index.js';
import { startOAuth } from '../oauth/flow.js';
import { getSession } from './auth.js';

const DRAW_FRONTEND_ORIGIN = 'https://mino.mobi';

// Names mirrored from draw/index.html polygonName().
const VALID_SHAPES = new Set([
  'Circle', 'Triangle', 'Quadrilateral', 'Pentagon', 'Hexagon',
  'Heptagon', 'Octagon', 'Nonagon', 'Decagon', 'Hendecagon',
  'Dodecagon', 'Tridecagon', 'Tetradecagon', 'Pentadecagon',
  'Hexadecagon', 'Heptadecagon', 'Octadecagon',
]);

const SUBMIT_COOLDOWN_MS = 5_000;       // anti-mash: 1 submission per 5s per DID
const MAX_DAILY_PER_DID  = 200;         // sanity cap

export async function handleDrawRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  if (!url.pathname.startsWith('/api/draw/')) return null;

  if (url.pathname === '/api/draw/oauth/start' && request.method === 'POST') {
    return startDrawOAuth(request, env);
  }
  if (url.pathname === '/api/draw/me' && request.method === 'GET') {
    return drawMe(request, env);
  }
  if (url.pathname === '/api/draw/submit' && request.method === 'POST') {
    return submitScore(request, env);
  }
  if (url.pathname === '/api/draw/leaderboard' && request.method === 'GET') {
    return leaderboard(request, env, url);
  }
  return null;
}

async function startDrawOAuth(request: Request, env: Env): Promise<Response> {
  let body: { handle?: string; returnTo?: string };
  try { body = await request.json() as any; } catch { body = {}; }

  const handle = (body.handle || '').trim().replace(/^@/, '');
  if (!handle) return json({ error: 'handle is required' }, 400);

  // Caller's returnTo must point back to our draw frontend so we can hand
  // the session ID off in a URL fragment.
  let returnTo = (body.returnTo || `${DRAW_FRONTEND_ORIGIN}/draw`).trim();
  if (!returnTo.startsWith(`${DRAW_FRONTEND_ORIGIN}/`)) {
    returnTo = `${DRAW_FRONTEND_ORIGIN}/draw`;
  }

  if (env.ATPROTO_MOCK_MODE === 'true') {
    // Mock path: skip Bluesky, return a fake authUrl that bounces straight back.
    const fakeSession = `mock-${Date.now().toString(36)}`;
    const did = `did:plc:mock${handle.replace(/\./g, '')}`;
    await env.DB.prepare(
      `INSERT INTO sessions (session_id, did, handle, auth_method, expires_at)
       VALUES (?, ?, ?, 'oauth', datetime('now', '+24 hours'))`
    ).bind(fakeSession, did, handle).run();
    const sep = returnTo.includes('#') ? '&' : '#';
    return json({
      authUrl: `${returnTo}${sep}session=${encodeURIComponent(fakeSession)}&did=${encodeURIComponent(did)}&handle=${encodeURIComponent(handle)}`,
      mock: true,
    });
  }

  try {
    // scope='atproto' — minimum scope, just identity verification, no PDS writes.
    const result = await startOAuth(env, handle, returnTo, 'atproto');
    return json({ authUrl: result.authUrl });
  } catch (err: any) {
    console.error('[draw] OAuth start error:', err.message);
    return json({ error: err.message || 'OAuth start failed' }, 400);
  }
}

async function drawMe(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ did: null, handle: null });
  return json({ did: session.did, handle: session.handle });
}

async function submitScore(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }

  const shape  = String(body.shape  || '');
  const score  = Number(body.score);
  const nSides = Number(body.n_sides ?? body.nSides ?? 0);
  const meta   = body.meta ? String(body.meta).slice(0, 200) : null;

  if (!VALID_SHAPES.has(shape))            return json({ error: 'invalid shape' }, 400);
  if (!Number.isInteger(score) || score < 0 || score > 100)
                                            return json({ error: 'invalid score' }, 400);
  if (!Number.isInteger(nSides) || nSides < 0 || nSides > 18)
                                            return json({ error: 'invalid n_sides' }, 400);
  // Cross-check shape/n_sides consistency.
  if (shape === 'Circle' && nSides !== 0)  return json({ error: 'circle must have n_sides=0' }, 400);
  if (shape !== 'Circle' && nSides < 3)    return json({ error: 'polygons must have n_sides>=3' }, 400);

  const now = Date.now();
  const dayAgo = now - 86_400_000;

  // Cooldown: most recent submission too close in time.
  const recent = await env.DB.prepare(
    `SELECT created_at FROM draw_scores WHERE did = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(session.did).first<{ created_at: number }>();
  if (recent && now - recent.created_at < SUBMIT_COOLDOWN_MS) {
    return json({ error: 'slow down — wait a few seconds between submissions' }, 429);
  }

  // Daily cap.
  const todayCount = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM draw_scores WHERE did = ? AND created_at >= ?`
  ).bind(session.did, dayAgo).first<{ n: number }>();
  if (todayCount && todayCount.n >= MAX_DAILY_PER_DID) {
    return json({ error: 'daily submission limit reached' }, 429);
  }

  const result = await env.DB.prepare(
    `INSERT INTO draw_scores (did, handle, shape, n_sides, score, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(session.did, session.handle, shape, nSides, score, meta, now).run();

  return json({
    ok: true,
    id: result.meta?.last_row_id ?? null,
    handle: session.handle,
    did: session.did,
    shape, n_sides: nSides, score, created_at: now,
  });
}

async function leaderboard(_request: Request, env: Env, url: URL): Promise<Response> {
  const shape  = (url.searchParams.get('shape') || '').trim();
  const period = (url.searchParams.get('period') || 'all').toLowerCase();
  const limitRaw = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit  = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
  const handleFilter = (url.searchParams.get('handle') || '').trim().replace(/^@/, '');

  const cutoff = period === 'today' ? Date.now() - 86_400_000
              : period === 'week'  ? Date.now() - 7 * 86_400_000
              : 0;

  const whereParts: string[] = ['created_at >= ?'];
  const params: any[] = [cutoff];
  if (shape && VALID_SHAPES.has(shape)) { whereParts.push('shape = ?'); params.push(shape); }
  if (handleFilter)                     { whereParts.push('handle = ?'); params.push(handleFilter); }
  params.push(limit);

  const sql = `
    SELECT handle, did, shape, n_sides, score, created_at
    FROM draw_scores
    WHERE ${whereParts.join(' AND ')}
    ORDER BY score DESC, created_at ASC
    LIMIT ?
  `;

  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({
    period,
    shape: shape || null,
    handle: handleFilter || null,
    count: rows.results?.length || 0,
    scores: rows.results || [],
  });
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
