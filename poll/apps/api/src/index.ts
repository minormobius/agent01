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

    // Debug: test credential crypto + DO in isolation
    if (url.pathname === '/api/debug/credential') {
      const results: Record<string, any> = {};
      // Test 1: raw crypto
      try {
        const { generateSecret, deriveTokenMessage, issueCredential, deriveNullifier, verifyCredential, makeReceipt } = await import('@anon-polls/shared');
        const secret = generateSecret();
        const tokenMessage = await deriveTokenMessage('test-poll', secret, '2099-01-01T00:00:00Z');
        const signingKey = 'test-key-123';
        const sig = await issueCredential(signingKey, tokenMessage);
        const nullifier = await deriveNullifier(secret, 'test-poll');
        const valid = await verifyCredential(signingKey, tokenMessage, sig);
        const receipt = await makeReceipt('test-poll', tokenMessage, nullifier);
        results.crypto = { ok: true, secret: secret.slice(0, 8) + '...', tokenMessage: tokenMessage.slice(0, 16) + '...', sig: sig.slice(0, 16) + '...', nullifier: nullifier.slice(0, 16) + '...', valid, receipt: receipt.slice(0, 16) + '...' };
      } catch (e: any) {
        results.crypto = { ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 3) };
      }
      // Test 2: list polls in D1
      try {
        const rows = await env.DB.prepare('SELECT id, status, question, opens_at, closes_at FROM polls LIMIT 5').all();
        results.polls = { ok: true, count: rows.results.length, rows: rows.results };
      } catch (e: any) {
        results.polls = { ok: false, error: e.message };
      }
      // Test 3: DO fetch for first poll
      try {
        const rows = await env.DB.prepare('SELECT id FROM polls LIMIT 1').all();
        if (rows.results.length > 0) {
          const pollId = (rows.results[0] as any).id;
          const doStub = getPollDO(env, pollId);
          const doRes = await doStub.fetch(new Request('https://do/poll'));
          const doData = await doRes.json();
          results.durableObject = { ok: true, status: doRes.status, data: doData };
        } else {
          results.durableObject = { ok: true, note: 'no polls exist yet' };
        }
      } catch (e: any) {
        results.durableObject = { ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 3) };
      }
      // Test 4: sessions in D1
      try {
        const rows = await env.DB.prepare('SELECT session_id, did, handle, expires_at FROM sessions LIMIT 5').all();
        results.sessions = { ok: true, count: rows.results.length, rows: rows.results };
      } catch (e: any) {
        results.sessions = { ok: false, error: e.message };
      }
      return addCorsHeaders(jsonResponse(results), env);
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
