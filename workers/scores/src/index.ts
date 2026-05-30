/**
 * mino-scores — generic multi-game leaderboard for mino.mobi.
 *
 * Identity is delegated to the shared auth worker (auth.mino.mobi): the browser
 * signs in there, receives an opaque Bearer session, and sends it to us. Every
 * write is validated by forwarding the Bearer to `auth.mino.mobi/api/me`, which
 * returns `{ did, handle }`. No OAuth machinery lives here — only scores.
 *
 * Any game identified by a slug can use this with NO worker change — that's the
 * point. curve is the first consumer; draw/paint/future games can migrate onto
 * it by pointing their submit/leaderboard calls here.
 *
 *   POST /api/scores/submit   { game, score, meta? }   (Bearer; any Bluesky user)
 *   GET  /api/scores/top?game=&period=&limit=&handle=   (public)
 *   GET  /api/scores/me?game=                           (Bearer; caller's best)
 *   GET  /health
 *
 * Ranking is score DESC, created_at ASC (earliest wins ties). Higher is better;
 * a game that wants lower-is-better submits a negated score.
 */

export interface Env {
  DB: D1Database;
  AUTH_URL?: string;
}

const GAME_RE = /^[a-z][a-z0-9_-]{1,31}$/;
const SUBMIT_COOLDOWN_MS = 5_000;   // anti-mash: 1 submission / 5s / (did, game)
const MAX_DAILY_PER_DID = 200;      // sanity cap per (did, game) / day
const MAX_SCORE_ABS = 1e7;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    try {
      if (url.pathname === '/health') {
        return json({ ok: true, service: 'mino-scores' }, 200, origin);
      }
      if (url.pathname === '/api/scores/top' && request.method === 'GET') {
        return await top(env, url, origin);
      }
      if (url.pathname === '/api/scores/submit' && request.method === 'POST') {
        return await submit(request, env, origin);
      }
      if (url.pathname === '/api/scores/me' && request.method === 'GET') {
        return await myBest(request, env, url, origin);
      }
      return json({ error: 'not found' }, 404, origin);
    } catch (err: any) {
      return json({ error: err?.message || 'internal error' }, 500, origin);
    }
  },
};

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    return u.hostname === 'mino.mobi' || u.hostname.endsWith('.mino.mobi') || u.hostname === 'minomobi.com';
  } catch { return false; }
}

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin! : 'https://mino.mobi',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data: any, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

// Validate a Bearer session against the shared auth worker.
async function validateSession(request: Request, env: Env): Promise<{ did: string; handle: string } | null> {
  const auth = request.headers.get('Authorization') || '';
  if (!/^Bearer\s+/i.test(auth)) return null;
  const base = (env.AUTH_URL || 'https://auth.mino.mobi').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/me`, { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const u = await res.json() as { did?: string; handle?: string };
    if (!u.did) return null;
    return { did: u.did, handle: u.handle || u.did };
  } catch { return null; }
}

async function submit(request: Request, env: Env, origin: string | null): Promise<Response> {
  const session = await validateSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401, origin);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400, origin); }

  const game = String(body.game || '').trim();
  const score = Number(body.score);
  const meta = body.meta != null ? String(body.meta).slice(0, 200) : null;

  if (!GAME_RE.test(game)) return json({ error: 'invalid game' }, 400, origin);
  if (!Number.isFinite(score) || Math.abs(score) > MAX_SCORE_ABS) {
    return json({ error: 'invalid score' }, 400, origin);
  }

  const now = Date.now();
  const recent = await env.DB.prepare(
    `SELECT created_at FROM game_scores WHERE did = ? AND game = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(session.did, game).first<{ created_at: number }>();
  if (recent && now - recent.created_at < SUBMIT_COOLDOWN_MS) {
    return json({ error: 'slow down — a few seconds between submissions' }, 429, origin);
  }
  const today = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM game_scores WHERE did = ? AND game = ? AND created_at >= ?`
  ).bind(session.did, game, now - 86_400_000).first<{ n: number }>();
  if (today && today.n >= MAX_DAILY_PER_DID) {
    return json({ error: 'daily submission limit reached' }, 429, origin);
  }

  const res = await env.DB.prepare(
    `INSERT INTO game_scores (game, did, handle, score, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(game, session.did, session.handle, score, meta, now).run();

  const better = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM game_scores WHERE game = ? AND score > ?`
  ).bind(game, score).first<{ n: number }>();

  return json({
    ok: true,
    id: res.meta?.last_row_id ?? null,
    game, score, meta,
    handle: session.handle, did: session.did,
    rank: (better?.n ?? 0) + 1,
    created_at: now,
  }, 200, origin);
}

async function top(env: Env, url: URL, origin: string | null): Promise<Response> {
  const game = (url.searchParams.get('game') || '').trim();
  if (!GAME_RE.test(game)) return json({ error: 'invalid game' }, 400, origin);

  const period = (url.searchParams.get('period') || 'all').toLowerCase();
  const limitRaw = parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 20));
  const handleFilter = (url.searchParams.get('handle') || '').trim().replace(/^@/, '');

  const cutoff = period === 'today' ? Date.now() - 86_400_000
    : period === 'week' ? Date.now() - 7 * 86_400_000
    : 0;

  const where = ['game = ?', 'created_at >= ?'];
  const params: any[] = [game, cutoff];
  if (handleFilter) { where.push('handle = ?'); params.push(handleFilter); }
  params.push(limit);

  const rows = await env.DB.prepare(
    `SELECT handle, did, score, meta, created_at FROM game_scores
     WHERE ${where.join(' AND ')} ORDER BY score DESC, created_at ASC LIMIT ?`
  ).bind(...params).all();

  return json({
    game, period,
    handle: handleFilter || null,
    count: rows.results?.length || 0,
    scores: rows.results || [],
  }, 200, origin);
}

async function myBest(request: Request, env: Env, url: URL, origin: string | null): Promise<Response> {
  const session = await validateSession(request, env);
  if (!session) return json({ error: 'not authenticated' }, 401, origin);
  const game = (url.searchParams.get('game') || '').trim();
  if (!GAME_RE.test(game)) return json({ error: 'invalid game' }, 400, origin);

  const best = await env.DB.prepare(
    `SELECT score, meta, created_at FROM game_scores
     WHERE did = ? AND game = ? ORDER BY score DESC, created_at ASC LIMIT 1`
  ).bind(session.did, game).first();

  return json({ did: session.did, handle: session.handle, game, best: best || null }, 200, origin);
}
