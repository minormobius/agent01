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

    // Debug endpoint — reports runtime binding and routing state
    if (url.pathname === '/api/debug') {
      const diag: Record<string, any> = {
        timestamp: new Date().toISOString(),
        requestUrl: request.url,
        bindings: {
          DB: typeof env.DB,
          POLL_COORDINATOR: typeof env.POLL_COORDINATOR,
          ASSETS: typeof env.ASSETS,
          FRONTEND_URL: env.FRONTEND_URL,
          ATPROTO_MOCK_MODE: env.ATPROTO_MOCK_MODE,
        },
      };
      // Test D1
      try {
        const result = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        diag.d1 = { ok: true, tables: result.results.map((r: any) => r.name) };
      } catch (e: any) {
        diag.d1 = { ok: false, error: e.message };
      }
      // Test ASSETS
      try {
        if (env.ASSETS) {
          const testReq = new Request(new URL('/', request.url).toString());
          const assetRes = await env.ASSETS.fetch(testReq);
          diag.assets = { ok: true, status: assetRes.status, contentType: assetRes.headers.get('content-type') };
        } else {
          diag.assets = { ok: false, error: 'ASSETS binding is falsy' };
        }
      } catch (e: any) {
        diag.assets = { ok: false, error: e.message };
      }
      // Test ASSETS on a non-existent SPA path
      try {
        if (env.ASSETS) {
          const spaReq = new Request(new URL('/poll/test-debug/vote', request.url).toString());
          const spaRes = await env.ASSETS.fetch(spaReq);
          diag.spaFallback = { ok: true, status: spaRes.status, contentType: spaRes.headers.get('content-type') };
        }
      } catch (e: any) {
        diag.spaFallback = { ok: false, error: e.message };
      }
      return addCorsHeaders(jsonResponse(diag), env);
    }

    // Non-API routes: SPA fallback
    // The platform serves matching static files (/, /assets/*, etc.) directly.
    // The Worker only receives requests for paths with no static file match
    // (e.g. /poll/:id/vote). Fetch /index.html from origin — platform serves
    // it from static assets without re-entering the Worker.
    if (!url.pathname.startsWith('/api/')) {
      try {
        const indexUrl = new URL('/index.html', request.url).toString();
        const indexRes = await fetch(indexUrl);
        return new Response(indexRes.body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      } catch {
        return new Response('<!DOCTYPE html><html><body>SPA fallback error</body></html>', {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        });
      }
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
