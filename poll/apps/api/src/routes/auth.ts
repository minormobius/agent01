/**
 * ATProto authentication routes.
 *
 * POST /api/auth/atproto/start      — authenticate with handle + app password (legacy)
 * POST /api/auth/oauth/start        — start OAuth flow (preferred)
 * GET  /api/auth/oauth/callback     — handle OAuth callback
 * GET  /api/auth/atproto/callback   — (redirects to oauth/callback for compat)
 * POST /api/auth/refresh            — refresh session
 * POST /api/auth/logout             — destroy session
 * GET  /api/me                      — get current user
 *
 * OAuth is the primary auth method. App passwords are kept for dev/fallback.
 */

import type { Env } from '../index.js';
import { jsonResponse } from '../index.js';
import { startOAuth, handleOAuthCallback, refreshOAuthToken } from '../oauth/flow.js';
import { createDPoPProof, type DPoPKeyPair } from '../oauth/jwt.js';

export interface Session {
  sessionId: string;
  did: string;
  handle: string;
}

const SESSION_COOKIE = 'atpolls_session';
const SESSION_TTL_HOURS = 24;
const REFRESH_TTL_DAYS = 90;

export async function handleAuthRoutes(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  if (url.pathname === '/api/auth/atproto/start' && request.method === 'POST') {
    return startAuth(request, env);
  }
  if (url.pathname === '/api/auth/oauth/start' && request.method === 'POST') {
    return startOAuthRoute(request, env);
  }
  if ((url.pathname === '/api/auth/oauth/callback' || url.pathname === '/api/auth/atproto/callback') && request.method === 'GET') {
    return handleOAuthCallbackRoute(request, env, url);
  }
  if (url.pathname === '/api/auth/refresh' && request.method === 'POST') {
    return refreshSession(request, env);
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
    const refreshToken = await createRefreshToken(env, did, handle);

    return jsonResponseWithCookie(
      { success: true, session: { did, handle }, refreshToken },
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
    // Store PDS refresh token so we can post on the user's behalf later
    const session = await createSession(env, verified.did, verified.handle, pdsUrl, verified.refreshJwt);
    const refreshToken = await createRefreshToken(env, verified.did, verified.handle);

    return jsonResponseWithCookie(
      { success: true, session: { did: verified.did, handle: verified.handle }, refreshToken },
      200,
      sessionCookie(session.sessionId, request)
    );
  } catch (err: any) {
    console.error('Auth error:', err.message);
    return jsonResponse({ error: 'Authentication failed' }, 500);
  }
}

// --- OAuth routes ---

async function startOAuthRoute(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { handle?: string; returnTo?: string };

  if (env.ATPROTO_MOCK_MODE === 'true') {
    // In mock mode, skip OAuth and create session directly
    const handle = body.handle || 'test.bsky.social';
    const did = `did:plc:mock${handle.replace(/\./g, '')}`;
    const session = await createSession(env, did, handle, undefined, undefined, undefined, 'oauth');
    const refreshToken = await createRefreshToken(env, did, handle);
    return jsonResponseWithCookie(
      { success: true, session: { did, handle }, refreshToken },
      200,
      sessionCookie(session.sessionId, request)
    );
  }

  if (!body.handle) {
    return jsonResponse({ error: 'handle is required' }, 400);
  }

  try {
    const result = await startOAuth(env, body.handle, body.returnTo);
    return jsonResponse({ authUrl: result.authUrl });
  } catch (err: any) {
    console.error('OAuth start error:', err.message);
    return jsonResponse({ error: err.message }, 400);
  }
}

async function handleOAuthCallbackRoute(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.ATPROTO_MOCK_MODE === 'true') {
    return jsonResponse({ error: 'OAuth callback not available in mock mode' }, 501);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const iss = url.searchParams.get('iss');
  const error = url.searchParams.get('error');

  if (error) {
    const description = url.searchParams.get('error_description') || error;
    const frontendUrl = env.FRONTEND_URL || '';
    return Response.redirect(`${frontendUrl}/?error=${encodeURIComponent(description)}`, 302);
  }

  if (!code || !state) {
    return jsonResponse({ error: 'Missing code or state parameter' }, 400);
  }

  try {
    const result = await handleOAuthCallback(env, code, state, iss, request);

    // Create session with OAuth tokens
    const session = await createSession(
      env, result.did, result.handle, result.pdsUrl,
      result.oauthRefreshToken, result.dpopKeySerialized, 'oauth'
    );

    // Also create a long-lived refresh token for PWA persistence
    const appRefreshToken = await createRefreshToken(env, result.did, result.handle);

    // Redirect to frontend with session cookie
    const frontendUrl = env.FRONTEND_URL || '';
    const returnTo = result.returnTo || '/';

    // Set cookie and redirect
    const redirectUrl = `${frontendUrl}${returnTo}`;
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
        'Set-Cookie': sessionCookie(session.sessionId, request),
      },
    });

    return response;
  } catch (err: any) {
    console.error('OAuth callback error:', err.message);
    const frontendUrl = env.FRONTEND_URL || '';
    return Response.redirect(`${frontendUrl}/?error=${encodeURIComponent(err.message)}`, 302);
  }
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

async function createSession(
  env: Env, did: string, handle: string,
  pdsUrl?: string, refreshToken?: string,
  dpopKeyJwk?: string, authMethod?: string,
): Promise<Session> {
  const sessionId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sessions (session_id, did, handle, pds_url, refresh_token, dpop_key_jwk, auth_method, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+24 hours'))`
  ).bind(
    sessionId, did, handle,
    pdsUrl || null, refreshToken || null,
    dpopKeyJwk || null, authMethod || 'app_password',
  ).run();

  return { sessionId, did, handle };
}

// --- Refresh tokens (long-lived, for PWA persistent auth) ---

async function createRefreshToken(env: Env, did: string, handle: string): Promise<string> {
  const token = crypto.randomUUID() + '-' + crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO sessions (session_id, did, handle, created_at, expires_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now', '+${REFRESH_TTL_DAYS} days'))`
  ).bind('refresh:' + token, did, handle).run();
  return token;
}

async function refreshSession(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { refreshToken?: string };
  const token = body.refreshToken;
  if (!token) {
    return jsonResponse({ error: 'refreshToken is required' }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT did, handle FROM sessions
     WHERE session_id = ? AND expires_at > datetime('now')`
  ).bind('refresh:' + token).first();

  if (!row) {
    return jsonResponse({ error: 'Invalid or expired refresh token' }, 401);
  }

  const did = row.did as string;
  const handle = row.handle as string;

  // Create a fresh short-lived session
  const session = await createSession(env, did, handle);

  return jsonResponseWithCookie(
    { success: true, session: { did, handle } },
    200,
    sessionCookie(session.sessionId, request)
  );
}

/**
 * PDS auth result. For OAuth sessions, includes DPoP key for creating proofs.
 */
export interface PdsAuth {
  accessJwt: string;
  did: string;
  pdsUrl: string;
  authMethod: 'oauth' | 'app-password';
  dpopKeyPair?: DPoPKeyPair;
}

/**
 * Get a fresh PDS access token for the session's user.
 * Handles both app-password sessions (PDS refresh) and OAuth sessions (DPoP token refresh).
 */
export async function getPdsAccessToken(
  request: Request, env: Env
): Promise<PdsAuth | null> {
  const sessionId = getSessionId(request) ||
    request.headers.get('Authorization')?.replace('Bearer ', '') || null;
  if (!sessionId) return null;

  const row = await env.DB.prepare(
    `SELECT did, pds_url, refresh_token, auth_method FROM sessions
     WHERE session_id = ? AND expires_at > datetime('now') AND did != 'pending'`
  ).bind(sessionId).first();

  if (!row || !row.pds_url || !row.refresh_token) return null;

  const authMethod = row.auth_method as string | null;

  // OAuth sessions: refresh via OAuth token endpoint with DPoP
  if (authMethod === 'oauth') {
    const result = await refreshOAuthToken(env, sessionId);
    if (!result) return null;
    return {
      accessJwt: result.accessToken,
      did: result.did,
      pdsUrl: result.pdsUrl,
      authMethod: 'oauth',
      dpopKeyPair: result.dpopKeyPair,
    };
  }

  // App-password sessions: refresh via PDS directly
  const pdsUrl = row.pds_url as string;
  const refreshJwt = row.refresh_token as string;

  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${refreshJwt}` },
  });

  if (!res.ok) return null;

  const data = await res.json() as { accessJwt?: string; did?: string; refreshJwt?: string };
  if (!data.accessJwt || !data.did) return null;

  // Store the new refresh token if rotated
  if (data.refreshJwt && data.refreshJwt !== refreshJwt) {
    await env.DB.prepare(
      'UPDATE sessions SET refresh_token = ? WHERE session_id = ?'
    ).bind(data.refreshJwt, sessionId).run();
  }

  return { accessJwt: data.accessJwt, did: data.did, pdsUrl, authMethod: 'app-password' };
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
): Promise<{ did: string; handle: string; refreshJwt: string } | null> {
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
      refreshJwt?: string;
    };

    if (!data.did || !data.refreshJwt) return null;

    // Store the PDS refresh token (long-lived, ~90 days) for features
    // like posting polls to Bluesky. Access token is discarded — we
    // refresh on demand when write access is needed.
    return { did: data.did, handle: data.handle || handle, refreshJwt: data.refreshJwt };
  } catch {
    return null;
  }
}
