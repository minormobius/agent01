/**
 * ATPolls API — Cloudflare Worker entry point
 *
 * Routes requests to handlers, manages CORS, and binds to D1 + Durable Objects.
 * v1.0.1 — RSA blind signatures + ATProto OAuth.
 */

import { PollCoordinator } from './durable-objects/poll-coordinator.js';
import { handlePollRoutes } from './routes/polls.js';
import { handleAuthRoutes } from './routes/auth.js';
import { handleBallotRoutes } from './routes/ballots.js';
import { getClientPublicJWK, getClientSigningKey } from './oauth/keypair.js';
import { discoverAuthServer } from './oauth/discovery.js';

export { PollCoordinator };

export interface Env {
  DB: D1Database;
  POLL_COORDINATOR: DurableObjectNamespace;
  ASSETS: { fetch: typeof fetch };
  FRONTEND_URL: string;
  ATPROTO_MOCK_MODE: string;
  // ATProto service account credentials (secrets)
  ATPROTO_SERVICE_DID?: string;
  ATPROTO_SERVICE_HANDLE?: string;
  ATPROTO_SERVICE_PASSWORD?: string;
  ATPROTO_SERVICE_PDS?: string;
  // RSA private key as JWK JSON string (blind signatures)
  RSA_PRIVATE_KEY_JWK?: string;
  // RSA public key as JWK JSON string (blind signatures)
  RSA_PUBLIC_KEY_JWK?: string;
  // ATProto OAuth (confidential client, private_key_jwt)
  OAUTH_CLIENT_ID?: string;
  OAUTH_SIGNING_PRIVATE_KEY_JWK?: string;
  OAUTH_SIGNING_PUBLIC_KEY_JWK?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS
    if (request.method === 'OPTIONS') {
      return corsResponse(env);
    }

    // Health check
    if (url.pathname === '/api/health') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // Simple ping — absolute minimum to verify Worker routing works
    if (url.pathname === '/api/debug/ping') {
      return jsonResponse({ pong: true, ts: Date.now(), worker: true });
    }

    // Serve client-metadata.json dynamically so we can inject the OAuth public key
    if (url.pathname === '/client-metadata.json') {
      try {
        return await handleClientMetadata(env);
      } catch (e: any) {
        console.error('handleClientMetadata crashed:', e);
        return jsonResponse({ error: 'client-metadata generation failed', detail: e.message }, 500);
      }
    }

    // Debug endpoint: comprehensive OAuth diagnostic (wrapped in try/catch)
    if (url.pathname === '/api/debug/oauth') {
      try {
        return await handleOAuthDebug(env, url);
      } catch (e: any) {
        console.error('handleOAuthDebug crashed:', e);
        return jsonResponse({ error: 'Debug endpoint crashed', detail: e.message, stack: e.stack }, 500);
      }
    }

    // Legacy debug endpoint (kept for compat)
    if (url.pathname === '/api/debug/oauth-keypair') {
      try {
        const jwk = await getClientPublicJWK(env.DB);
        return jsonResponse({ ok: true, kid: (jwk as any).kid, kty: jwk.kty, crv: jwk.crv });
      } catch (e: any) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    // Non-API routes: serve static assets (SPA fallback handled by ASSETS binding)
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      let response: Response | null = null;

      // Route to appropriate handler
      if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/me') {
        response = await handleAuthRoutes(request, env, url);
      } else if (url.pathname.match(/^\/api\/polls\/[^/]+\/ballots/)) {
        response = await handleBallotRoutes(request, env, url);
      } else if (url.pathname.startsWith('/api/polls')) {
        response = await handlePollRoutes(request, env, url);
      }

      if (!response) {
        response = jsonResponse({ error: 'Not found' }, 404);
      }

      // Add CORS headers to all responses
      return addCorsHeaders(response, env);
    } catch (err: any) {
      console.error('Unhandled error:', err);
      return addCorsHeaders(
        jsonResponse({ error: 'Internal server error' }, 500),
        env
      );
    }
  },
};

function corsResponse(env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env),
  });
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_URL || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

function addCorsHeaders(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(env))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Serve client-metadata.json with the OAuth public key from D1.
 * The keypair is auto-generated on first request — no secrets to configure.
 */
async function handleClientMetadata(env: Env): Promise<Response> {
  const metadata: Record<string, unknown> = {
    client_id: 'https://poll.mino.mobi/client-metadata.json',
    client_name: 'ATPolls',
    client_uri: 'https://poll.mino.mobi',
    redirect_uris: ['https://poll.mino.mobi/api/auth/oauth/callback'],
    scope: 'atproto transition:generic',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true,
    application_type: 'web',
  };

  try {
    const publicJwk = await getClientPublicJWK(env.DB);
    metadata.jwks = { keys: [{ ...publicJwk }] };
  } catch (e) {
    console.error('Failed to get OAuth client public key from D1:', e);
    // On the very first deploy, the migration might not have run yet.
    // Fall back to env secret if available (legacy path).
    if (env.OAUTH_SIGNING_PUBLIC_KEY_JWK) {
      try {
        const publicJwk = JSON.parse(env.OAUTH_SIGNING_PUBLIC_KEY_JWK);
        publicJwk.use = publicJwk.use || 'sig';
        publicJwk.alg = publicJwk.alg || 'ES256';
        metadata.jwks = { keys: [publicJwk] };
      } catch {
        console.error('Legacy OAUTH_SIGNING_PUBLIC_KEY_JWK also failed to parse');
      }
    }
  }

  return new Response(JSON.stringify(metadata, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Comprehensive OAuth debug endpoint.
 * GET /api/debug/oauth — check all prerequisites
 * GET /api/debug/oauth?handle=foo.bsky.social — dry-run discovery for a handle
 */
async function handleOAuthDebug(env: Env, url: URL): Promise<Response> {
  const steps: { step: string; ok: boolean; detail?: any; error?: string }[] = [];

  // 1. Check OAUTH_CLIENT_ID
  const clientId = env.OAUTH_CLIENT_ID || '';
  steps.push({
    step: 'OAUTH_CLIENT_ID env var',
    ok: !!clientId,
    detail: clientId ? clientId : '(not set)',
  });

  // 2. Check D1 keypair
  try {
    const publicJwk = await getClientPublicJWK(env.DB);
    steps.push({
      step: 'D1 keypair (oauth_client_keypair table)',
      ok: true,
      detail: { kty: publicJwk.kty, crv: publicJwk.crv, kid: (publicJwk as any).kid },
    });
  } catch (e: any) {
    steps.push({ step: 'D1 keypair (oauth_client_keypair table)', ok: false, error: e.message });
  }

  // 3. Check signing key can be imported
  try {
    const key = await getClientSigningKey(env.DB);
    steps.push({
      step: 'Import signing key (CryptoKey)',
      ok: true,
      detail: { type: key.type, algorithm: key.algorithm },
    });
  } catch (e: any) {
    steps.push({ step: 'Import signing key (CryptoKey)', ok: false, error: e.message });
  }

  // 4. Check client-metadata.json serves jwks
  try {
    const metaRes = await handleClientMetadata(env);
    const meta = await metaRes.json() as any;
    const hasJwks = !!meta.jwks?.keys?.length;
    steps.push({
      step: 'client-metadata.json includes jwks',
      ok: hasJwks,
      detail: hasJwks
        ? { keyCount: meta.jwks.keys.length, kid: meta.jwks.keys[0]?.kid }
        : 'jwks missing or empty',
    });
  } catch (e: any) {
    steps.push({ step: 'client-metadata.json includes jwks', ok: false, error: e.message });
  }

  // 5. Check FRONTEND_URL
  steps.push({
    step: 'FRONTEND_URL env var',
    ok: !!env.FRONTEND_URL,
    detail: env.FRONTEND_URL || '(not set)',
  });

  // 6. Check redirect_uri matches
  const expectedRedirect = `${env.FRONTEND_URL || ''}/api/auth/oauth/callback`;
  steps.push({
    step: 'redirect_uri',
    ok: !!env.FRONTEND_URL,
    detail: expectedRedirect,
  });

  // 7. If handle provided, do a dry-run discovery
  const handle = url.searchParams.get('handle');
  if (handle) {
    try {
      const resolveRes = await fetch(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
      );
      if (!resolveRes.ok) {
        steps.push({ step: `Resolve handle "${handle}"`, ok: false, error: `HTTP ${resolveRes.status}` });
      } else {
        const { did } = await resolveRes.json() as { did: string };
        steps.push({ step: `Resolve handle "${handle}"`, ok: true, detail: { did } });

        // Resolve PDS
        const plcRes = await fetch(`https://plc.directory/${did}`);
        if (plcRes.ok) {
          const doc = await plcRes.json() as any;
          const pds = doc.service?.find((s: any) => s.id === '#atproto_pds');
          const pdsUrl = pds?.serviceEndpoint;
          steps.push({ step: 'Resolve PDS', ok: !!pdsUrl, detail: { pdsUrl } });

          if (pdsUrl) {
            // Discover auth server
            try {
              const { authServerUrl, metadata } = await discoverAuthServer(pdsUrl);
              steps.push({
                step: 'Discover auth server',
                ok: true,
                detail: {
                  issuer: metadata.issuer,
                  authServerUrl,
                  token_endpoint: metadata.token_endpoint,
                  par_endpoint: metadata.pushed_authorization_request_endpoint,
                  issuer_matches_url: metadata.issuer === authServerUrl,
                },
              });
            } catch (e: any) {
              steps.push({ step: 'Discover auth server', ok: false, error: e.message });
            }
          }
        } else {
          steps.push({ step: 'Resolve PDS', ok: false, error: `PLC directory returned ${plcRes.status}` });
        }
      }
    } catch (e: any) {
      steps.push({ step: `Resolve handle "${handle}"`, ok: false, error: e.message });
    }
  }

  // 8. Check recent oauth_states (for debugging callback issues)
  try {
    const states = await env.DB.prepare(
      `SELECT state, did, auth_server_url, token_endpoint, created_at, expires_at,
              CASE WHEN expires_at > datetime('now') THEN 'active' ELSE 'expired' END as status
       FROM oauth_states ORDER BY created_at DESC LIMIT 5`
    ).all();
    steps.push({
      step: 'Recent oauth_states',
      ok: true,
      detail: (states.results || []).map((r: any) => ({
        state: (r.state as string).slice(0, 8) + '...',
        did: r.did,
        auth_server_url: r.auth_server_url,
        token_endpoint: r.token_endpoint,
        status: r.status,
        created_at: r.created_at,
      })),
    });
  } catch (e: any) {
    steps.push({ step: 'Recent oauth_states', ok: false, error: e.message });
  }

  // 9. Check recent sessions
  try {
    const sessions = await env.DB.prepare(
      `SELECT session_id, did, handle, auth_method, pds_url, created_at, expires_at,
              CASE WHEN expires_at > datetime('now') THEN 'active' ELSE 'expired' END as status
       FROM sessions WHERE did != 'pending' ORDER BY created_at DESC LIMIT 5`
    ).all();
    steps.push({
      step: 'Recent sessions',
      ok: true,
      detail: (sessions.results || []).map((r: any) => ({
        id: (r.session_id as string).slice(0, 8) + '...',
        did: r.did,
        handle: r.handle,
        auth_method: r.auth_method,
        status: r.status,
        created_at: r.created_at,
      })),
    });
  } catch (e: any) {
    steps.push({ step: 'Recent sessions', ok: false, error: e.message });
  }

  const allOk = steps.every(s => s.ok);
  return new Response(JSON.stringify({ allOk, steps }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

/** Get the Durable Object stub for a given poll ID */
export function getPollDO(env: Env, pollId: string): DurableObjectStub {
  const id = env.POLL_COORDINATOR.idFromName(pollId);
  return env.POLL_COORDINATOR.get(id);
}
