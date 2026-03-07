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
import { getClientPublicJWK } from './oauth/keypair.js';

export { PollCoordinator };

export interface Env {
  DB: D1Database;
  POLL_COORDINATOR: DurableObjectNamespace;
  ASSETS: Fetcher;
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

    // Serve client-metadata.json dynamically so we can inject the OAuth public key
    if (url.pathname === '/client-metadata.json') {
      return handleClientMetadata(env);
    }

    // Debug endpoint to check if the keypair exists (no secrets exposed)
    if (url.pathname === '/api/debug/oauth-keypair') {
      try {
        const jwk = await getClientPublicJWK(env.DB);
        return jsonResponse({ ok: true, kid: (jwk as any).kid, kty: jwk.kty, crv: jwk.crv });
      } catch (e: any) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    // Non-API routes should not reach the Worker.
    // _routes.json restricts the Worker to /api/* and /client-metadata.json.
    // Pages handles SPA fallback for everything else.
    if (!url.pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'Not found', hint: '_routes.json should prevent this' }, 404);
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

/** Get the Durable Object stub for a given poll ID */
export function getPollDO(env: Env, pollId: string): DurableObjectStub {
  const id = env.POLL_COORDINATOR.idFromName(pollId);
  return env.POLL_COORDINATOR.get(id);
}
