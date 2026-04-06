/**
 * Audio Rooms API — Cloudflare Worker entry point.
 *
 * Routes requests to handlers, manages CORS, and binds to Durable Objects.
 * Signaling-only server — audio flows peer-to-peer via WebRTC.
 */

import { RoomCoordinator } from './durable-objects/room-coordinator.js';
import { handleAuthRoutes } from './routes/auth.js';
import { handleRoomRoutes } from './routes/rooms.js';

export { RoomCoordinator };

export interface Env {
  ROOM_COORDINATOR: DurableObjectNamespace;
  ASSETS: { fetch: typeof fetch };
  FRONTEND_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e: any) {
      console.error('WORKER CRASH:', e);
      return new Response(JSON.stringify({
        error: 'Internal server error',
        message: e.message,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return corsResponse(env);
  }

  // Health check
  if (url.pathname === '/api/health') {
    return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // Auth routes
  const authRes = await handleAuthRoutes(request, url, env);
  if (authRes) return addCors(authRes, env);

  // Room routes
  const roomRes = await handleRoomRoutes(request, url, env);
  if (roomRes) return addCors(roomRes, env);

  // Fallback to static assets
  if (env.ASSETS) {
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      // Fall through to 404
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

function corsResponse(env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env),
  });
}

function addCors(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(env))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
