/**
 * ATProto authentication routes.
 *
 * POST /api/auth/atproto/start    — authenticate with handle + app password
 * GET  /api/auth/atproto/callback — handle OAuth callback (future)
 * POST /api/auth/logout           — destroy session
 * GET  /api/me                    — get current user
 *
 * Auth strategy: app password verification via the user's PDS.
 * The backend resolves the user's handle → DID → PDS, calls createSession
 * to verify credentials, extracts the verified DID, then discards the
 * PDS access token. We only need identity verification, not ongoing access.
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

function sessionCookie(sessionId: string, request: Request): string {
  const isSecure = new URL(request.url).protocol === 'https:';
  const secure = isSecure ? ' Secure;' : '';
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${SESSION_TTL_HOURS * 3600}`;
}

async function startAuth(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { handle?: string; appPassword?: string };

  if (env.ATPROTO_MOCK_MODE === 'true') {
    const handle = body.handle || 'test.bsky.social';
    const did = `did:plc:mock${handle.replace(/\./g, '')}`;
    const session = await createSession(env, did, handle);

    return jsonResponseWithCookie(
      { success: true, session: { did, handle } },
      200,
      sessionCookie(session.sessionId, request)
    );
  }

  // Real auth: verify identity via app password on user's PDS
  const handle = body.handle;
  const appPassword = body.appPassword;

  if (!handle) {
    return jsonResponse({ error: 'handle is required' }, 400);
  }
  if (!appPassword) {
    return jsonResponse({ error: 'appPassword is required' }, 400);
  }

  try {
    // Step 1: Resolve handle → DID
    const did = await resolveHandle(handle);
    if (!did) {
      return jsonResponse({ error: 'Could not resolve handle' }, 400);
    }

    // Step 2: Resolve DID → PDS URL
    const pdsUrl = await resolvePds(did);
    if (!pdsUrl) {
      return jsonResponse({ error: 'Could not resolve PDS for this account' }, 400);
    }

    // Step 3: Verify credentials via createSession on the user's PDS
    const verified = await verifyCredentials(pdsUrl, handle, appPassword);
    if (!verified) {
      return jsonResponse({ error: 'Invalid handle or app password' }, 401);
    }

    // Step 4: Create local session with the verified DID
    // We discard the PDS access token — we only needed identity proof
    const session = await createSession(env, verified.did, verified.handle);

    return jsonResponseWithCookie(
      { success: true, session: { did: verified.did, handle: verified.handle } },
      200,
      sessionCookie(session.sessionId, request)
    );
  } catch (err: any) {
    console.error('Auth error:', err.message);
    return jsonResponse({ error: 'Authentication failed' }, 500);
  }
}

async function handleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  // Reserved for future OAuth flow
  return jsonResponse({ error: 'OAuth callback not yet implemented. Use app password auth.' }, 501);
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

// --- Session management ---

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

// --- ATProto identity resolution ---

const BSKY_PUBLIC_API = 'https://public.api.bsky.app';

async function resolveHandle(handle: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { did?: string };
    return data.did || null;
  } catch {
    return null;
  }
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    // Try PLC directory first (did:plc:...)
    if (did.startsWith('did:plc:')) {
      const res = await fetch(`https://plc.directory/${did}`);
      if (res.ok) {
        const doc = await res.json() as any;
        const services = doc.service || [];
        const pds = services.find((s: any) => s.id === '#atproto_pds');
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    }

    // Fallback: try did:web resolution
    if (did.startsWith('did:web:')) {
      const domain = did.replace('did:web:', '');
      const res = await fetch(`https://${domain}/.well-known/did.json`);
      if (res.ok) {
        const doc = await res.json() as any;
        const services = doc.service || [];
        const pds = services.find((s: any) => s.id === '#atproto_pds');
        if (pds?.serviceEndpoint) return pds.serviceEndpoint;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function verifyCredentials(
  pdsUrl: string,
  handle: string,
  appPassword: string
): Promise<{ did: string; handle: string } | null> {
  try {
    const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle, password: appPassword }),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      did?: string;
      handle?: string;
      accessJwt?: string;
    };

    if (!data.did) return null;

    // We have a verified DID. Discard the access token — we don't need it.
    return { did: data.did, handle: data.handle || handle };
  } catch {
    return null;
  }
}
