/**
 * ATProto OAuth authentication routes.
 *
 * POST /api/auth/atproto/start    — initiate OAuth flow
 * GET  /api/auth/atproto/callback — handle OAuth callback
 * POST /api/auth/logout           — destroy session
 * GET  /api/me                    — get current user
 *
 * In mock mode, provides a simplified auth flow for local development.
 */

import type { Env } from '../index.js';
import { jsonResponse } from '../index.js';

export interface Session {
  sessionId: string;
  did: string;
  handle: string;
}

const SESSION_COOKIE = 'anon_polls_session';
const SESSION_TTL_HOURS = 24;

export async function handleAuthRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  if (url.pathname === '/api/auth/atproto/start' && request.method === 'POST') {
    return startAuth(request, env);
  }
  if (url.pathname === '/api/auth/atproto/callback' && request.method === 'GET') {
    return handleCallback(request, env, url);
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    return logout(request, env);
  }
  if (url.pathname === '/api/me' && request.method === 'GET') {
    return getMe(request, env);
  }
  return null;
}

function jsonResponseWithCookie(data: any, status: number, cookie: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
}

function sessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_HOURS * 3600}`;
}

async function startAuth(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { handle?: string };

  if (env.ATPROTO_MOCK_MODE === 'true') {
    const handle = body.handle || 'test.bsky.social';
    const did = `did:plc:mock${handle.replace(/\./g, '')}`;
    const session = await createSession(env, did, handle);

    return jsonResponseWithCookie(
      { success: true, session: { did, handle } },
      200,
      sessionCookie(session.sessionId)
    );
  }

  const handle = body.handle;
  if (!handle) {
    return jsonResponse({ error: 'handle is required' }, 400);
  }

  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomUUID() + crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO sessions (session_id, did, handle, access_token, pds_url, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+1 hour'))`
  ).bind(state, 'pending', handle, codeVerifier, '').run();

  const authUrl = `https://bsky.social/oauth/authorize?client_id=${env.ATPROTO_CLIENT_ID}&redirect_uri=${encodeURIComponent(env.FRONTEND_URL + '/auth/callback')}&state=${state}&code_challenge=${codeVerifier}&response_type=code&scope=atproto`;

  return jsonResponse({ authUrl, state });
}

async function handleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return jsonResponse({ error: 'Missing code or state' }, 400);
  }

  if (env.ATPROTO_MOCK_MODE === 'true') {
    const pending = await env.DB.prepare(
      'SELECT * FROM sessions WHERE session_id = ?'
    ).bind(state).first();

    if (!pending) {
      return jsonResponse({ error: 'Invalid state' }, 400);
    }

    const did = `did:plc:mock${(pending.handle as string).replace(/\./g, '')}`;
    const session = await createSession(env, did, pending.handle as string);

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${env.FRONTEND_URL}/?auth=success`,
        'Set-Cookie': sessionCookie(session.sessionId),
      },
    });
  }

  return jsonResponse({ error: 'Real OAuth not yet configured' }, 501);
}

async function logout(request: Request, env: Env): Promise<Response> {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(sessionId).run();
  }
  return jsonResponseWithCookie(
    { success: true },
    200,
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Max-Age=0`
  );
}

async function getMe(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }
  return jsonResponse({ did: session.did, handle: session.handle });
}

export async function getSession(request: Request, env: Env): Promise<Session | null> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return lookupSession(env, token);
  }

  const sessionId = getSessionId(request);
  if (!sessionId) return null;
  return lookupSession(env, sessionId);
}

function getSessionId(request: Request): string | null {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

async function lookupSession(env: Env, sessionId: string): Promise<Session | null> {
  const row = await env.DB.prepare(
    `SELECT session_id, did, handle FROM sessions
     WHERE session_id = ? AND expires_at > datetime('now') AND did != 'pending'`
  ).bind(sessionId).first();

  if (!row) return null;
  return {
    sessionId: row.session_id as string,
    did: row.did as string,
    handle: row.handle as string,
  };
}

async function createSession(env: Env, did: string, handle: string): Promise<Session> {
  const sessionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sessions (session_id, did, handle, created_at, expires_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now', '+24 hours'))`
  ).bind(sessionId, did, handle).run();

  return { sessionId, did, handle };
}
