/**
 * Anonymous Polls API — Cloudflare Worker entry point.
 *
 * Routes requests to handlers, manages CORS, and binds to D1 + Durable Objects.
 */

import { PollCoordinator } from './durable-objects/poll-coordinator.js';
import { handlePollRoutes } from './routes/polls.js';
import { handleAuthRoutes } from './routes/auth.js';
import { handleBallotRoutes } from './routes/ballots.js';

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
  // HMAC signing key for credentials
  CREDENTIAL_SIGNING_KEY?: string;
  // ATProto OAuth
  ATPROTO_CLIENT_ID?: string;
  ATPROTO_CLIENT_SECRET?: string;
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

    // Non-API routes should not reach the Worker.
    // _routes.json restricts the Worker to /api/* only.
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
        jsonResponse({ error: 'Internal server error', message: err.message }, 500),
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

/** Get the Durable Object stub for a given poll ID */
export function getPollDO(env: Env, pollId: string): DurableObjectStub {
  const id = env.POLL_COORDINATOR.idFromName(pollId);
  return env.POLL_COORDINATOR.get(id);
}
