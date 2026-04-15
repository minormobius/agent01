/**
 * mino-auth — Shared OAuth BFF for *.mino.mobi sites.
 *
 * Handles ATProto OAuth (PKCE + DPoP + PAR + private_key_jwt)
 * and proxies DPoP-bound PDS operations for static frontends.
 */

import { startOAuth, handleOAuthCallback, refreshOAuthToken } from './oauth/flow.js';
import { getClientPublicJWK } from './oauth/keypair.js';
import { createDPoPProof, deserializeDPoPKeyPair } from './oauth/jwt.js';
import { discoverAuthServer } from './oauth/discovery.js';

export interface Env {
  DB: D1Database;
  OAUTH_CLIENT_ID: string;
}

// --- Origin allowlist ---

const ALLOWED_ORIGINS = [
  'https://minomobi.com',
  'https://www.minomobi.com',
  'https://bakery.mino.mobi',
  'https://photo.mino.mobi',
  'https://labglass.minomobi.com',
  'https://zoom.mino.mobi',
  'https://music.mino.mobi',
  'https://sweat.mino.mobi',
  'https://time.mino.mobi',
  'https://phylo.mino.mobi',
  'https://read.mino.mobi',
  'https://cards.mino.mobi',
  'https://noise.mino.mobi',
  'https://flows.mino.mobi',
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Wildcard: any *.mino.mobi
  try {
    const url = new URL(origin);
    return url.hostname.endsWith('.mino.mobi') || url.hostname === 'minomobi.com';
  } catch {
    return false;
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

function errorResponse(message: string, status = 400, origin: string | null = null): Response {
  return jsonResponse({ error: message }, status, origin);
}

// --- Session helpers ---

const SESSION_TTL_DAYS = 30;

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getSessionToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

async function getSession(db: D1Database, token: string): Promise<{
  sessionId: string; did: string; handle: string; pdsUrl: string; oauthScope: string | null;
} | null> {
  const row = await db.prepare(
    `SELECT session_id, did, handle, pds_url, oauth_scope
     FROM sessions WHERE session_id = ? AND expires_at > datetime('now')`
  ).bind(token).first();
  if (!row) return null;
  return {
    sessionId: row.session_id as string,
    did: row.did as string,
    handle: row.handle as string,
    pdsUrl: row.pds_url as string,
    oauthScope: row.oauth_scope as string | null,
  };
}

// --- Get a usable PDS access token for proxied operations ---

async function getPdsAccessToken(env: Env, sessionId: string): Promise<{
  accessToken: string;
  did: string;
  pdsUrl: string;
  dpopKeyPair: { privateKey: CryptoKey; publicJWK: JsonWebKey };
} | null> {
  return refreshOAuthToken(env, sessionId);
}

// --- Router ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin');

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // --- Client metadata (dynamic) ---
      if (path === '/client-metadata.json' && request.method === 'GET') {
        return handleClientMetadata(env);
      }

      // --- OAuth flow ---
      if (path === '/oauth/start' && request.method === 'POST') {
        return handleOAuthStart(request, env, origin);
      }
      if (path === '/oauth/callback' && request.method === 'GET') {
        return handleCallback(request, env);
      }

      // --- Session management ---
      if (path === '/api/me' && request.method === 'GET') {
        return handleGetMe(request, env, origin);
      }
      if (path === '/api/refresh' && request.method === 'POST') {
        return handleRefresh(request, env, origin);
      }
      if (path === '/api/logout' && request.method === 'POST') {
        return handleLogout(request, env, origin);
      }

      // --- PDS proxy ---
      if (path.startsWith('/pds/') && (request.method === 'POST' || request.method === 'GET')) {
        return handlePdsProxy(request, env, path, origin);
      }

      // --- Health ---
      if (path === '/health') {
        return jsonResponse({ ok: true, service: 'mino-auth' });
      }

      return errorResponse('Not found', 404, origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      console.error('Request error:', message);
      return errorResponse(message, 500, origin);
    }
  },
};

// --- Route handlers ---

async function handleClientMetadata(env: Env): Promise<Response> {
  const publicJWK = await getClientPublicJWK(env.DB);
  const clientId = env.OAUTH_CLIENT_ID || 'https://auth.mino.mobi/client-metadata.json';

  const metadata = {
    client_id: clientId,
    client_name: 'mino.mobi',
    client_uri: 'https://minomobi.com',
    redirect_uris: ['https://auth.mino.mobi/oauth/callback'],
    scope: 'atproto transition:generic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true,
    application_type: 'web',
    jwks: {
      keys: [publicJWK],
    },
  };

  return new Response(JSON.stringify(metadata, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function handleOAuthStart(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await request.json() as { handle?: string; origin?: string; returnTo?: string; scope?: string };
  const handle = body.handle;
  if (!handle) return errorResponse('handle is required', 400, origin);

  // Origin from request body (the site initiating login) or from Origin header
  const requestOrigin = body.origin || origin;
  if (!requestOrigin || !isAllowedOrigin(requestOrigin)) {
    return errorResponse('Origin not allowed', 403, origin);
  }

  const result = await startOAuth(env, handle, requestOrigin, body.returnTo, body.scope);
  return jsonResponse(result, 200, origin);
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    const desc = url.searchParams.get('error_description') || error;
    // Redirect back with error
    return new Response(`OAuth error: ${desc}`, { status: 400 });
  }

  if (!code || !state) {
    return new Response('Missing code or state', { status: 400 });
  }

  const result = await handleOAuthCallback(env, code, state);

  // Create session
  const sessionToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (session_id, did, handle, pds_url, refresh_token, dpop_key_jwk, auth_method, oauth_scope, origin, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'oauth', ?, ?, datetime('now'), ?)`
  ).bind(
    sessionToken,
    result.did,
    result.handle,
    result.pdsUrl,
    result.oauthRefreshToken,
    result.dpopKeySerialized,
    result.scope,
    result.origin,
    expiresAt,
  ).run();

  // Redirect back to the originating site with the session token
  // The client library will pick up the token from the URL hash
  const returnUrl = result.returnTo || result.origin;
  const separator = returnUrl.includes('?') ? '&' : '?';
  const redirectUrl = `${returnUrl}${separator}__auth_session=${encodeURIComponent(sessionToken)}`;

  return Response.redirect(redirectUrl, 302);
}

async function handleGetMe(request: Request, env: Env, origin: string | null): Promise<Response> {
  const token = getSessionToken(request);
  if (!token) return errorResponse('Not authenticated', 401, origin);

  const session = await getSession(env.DB, token);
  if (!session) return errorResponse('Session expired', 401, origin);

  return jsonResponse({
    did: session.did,
    handle: session.handle,
    scope: session.oauthScope,
  }, 200, origin);
}

async function handleRefresh(request: Request, env: Env, origin: string | null): Promise<Response> {
  const token = getSessionToken(request);
  if (!token) return errorResponse('Not authenticated', 401, origin);

  const session = await getSession(env.DB, token);
  if (!session) return errorResponse('Session expired', 401, origin);

  // Touch the session expiry
  const newExpiry = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `UPDATE sessions SET expires_at = ? WHERE session_id = ?`
  ).bind(newExpiry, token).run();

  return jsonResponse({
    did: session.did,
    handle: session.handle,
    scope: session.oauthScope,
  }, 200, origin);
}

async function handleLogout(request: Request, env: Env, origin: string | null): Promise<Response> {
  const token = getSessionToken(request);
  if (!token) return jsonResponse({ ok: true }, 200, origin);

  await env.DB.prepare('DELETE FROM sessions WHERE session_id = ?').bind(token).run();
  return jsonResponse({ ok: true }, 200, origin);
}

// --- PDS Proxy ---

async function handlePdsProxy(
  request: Request,
  env: Env,
  path: string,
  origin: string | null,
): Promise<Response> {
  const token = getSessionToken(request);
  if (!token) return errorResponse('Not authenticated', 401, origin);

  // Map proxy paths to XRPC methods
  const proxyRoutes: Record<string, { xrpc: string; method: string; needsAuth: boolean }> = {
    '/pds/repo/createRecord':  { xrpc: 'com.atproto.repo.createRecord', method: 'POST', needsAuth: true },
    '/pds/repo/putRecord':     { xrpc: 'com.atproto.repo.putRecord', method: 'POST', needsAuth: true },
    '/pds/repo/deleteRecord':  { xrpc: 'com.atproto.repo.deleteRecord', method: 'POST', needsAuth: true },
    '/pds/repo/getRecord':     { xrpc: 'com.atproto.repo.getRecord', method: 'GET', needsAuth: true },
    '/pds/repo/listRecords':   { xrpc: 'com.atproto.repo.listRecords', method: 'GET', needsAuth: true },
    '/pds/repo/uploadBlob':    { xrpc: 'com.atproto.repo.uploadBlob', method: 'POST', needsAuth: true },
    '/pds/sync/getBlob':       { xrpc: 'com.atproto.sync.getBlob', method: 'GET', needsAuth: true },
  };

  const route = proxyRoutes[path];
  if (!route) return errorResponse('Unknown PDS operation', 404, origin);

  // Get a fresh access token + DPoP key
  const auth = await getPdsAccessToken(env, token);
  if (!auth) return errorResponse('Could not get PDS access token — session may need re-login', 401, origin);

  const pdsXrpcUrl = `${auth.pdsUrl}/xrpc/${route.xrpc}`;

  // Build DPoP proof for this specific PDS request
  const dpopProof = await createDPoPProof(
    auth.dpopKeyPair, route.method, pdsXrpcUrl, undefined, auth.accessToken
  );

  // Build the proxied request
  const pdsHeaders: Record<string, string> = {
    Authorization: `DPoP ${auth.accessToken}`,
    DPoP: dpopProof,
  };

  let pdsBody: BodyInit | null = null;

  if (route.method === 'POST') {
    if (route.xrpc === 'com.atproto.repo.uploadBlob') {
      // Blob upload: pass through raw body + content-type
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
      pdsHeaders['Content-Type'] = contentType;
      pdsBody = await request.arrayBuffer();
    } else {
      // JSON body: read from client, inject repo=did if missing
      const clientBody = await request.json() as Record<string, unknown>;
      if (!clientBody.repo) clientBody.repo = auth.did;
      pdsHeaders['Content-Type'] = 'application/json';
      pdsBody = JSON.stringify(clientBody);
    }
  }

  let pdsUrl = pdsXrpcUrl;
  if (route.method === 'GET') {
    // Forward query params from the client request
    const clientUrl = new URL(request.url);
    const params = new URLSearchParams(clientUrl.search);
    // Inject repo=did if it's a repo-scoped read and repo isn't set
    if (!params.has('repo')) params.set('repo', auth.did);
    pdsUrl = `${pdsXrpcUrl}?${params.toString()}`;
  }

  // Make the proxied request to the user's PDS
  let pdsRes = await fetch(pdsUrl, {
    method: route.method,
    headers: pdsHeaders,
    body: pdsBody,
  });

  // Handle DPoP nonce requirement from PDS
  if (pdsRes.status === 401) {
    const nonce = pdsRes.headers.get('DPoP-Nonce');
    if (nonce) {
      const retryProof = await createDPoPProof(
        auth.dpopKeyPair, route.method, pdsXrpcUrl, nonce, auth.accessToken
      );
      pdsHeaders['DPoP'] = retryProof;
      pdsRes = await fetch(pdsUrl, {
        method: route.method,
        headers: pdsHeaders,
        body: route.method === 'POST' ? pdsBody : undefined,
      });
    }
  }

  // Return PDS response to the client
  const responseHeaders: Record<string, string> = {
    ...corsHeaders(origin),
  };

  const contentType = pdsRes.headers.get('Content-Type');
  if (contentType) responseHeaders['Content-Type'] = contentType;

  return new Response(pdsRes.body, {
    status: pdsRes.status,
    headers: responseHeaders,
  });
}
