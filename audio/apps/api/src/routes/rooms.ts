/**
 * Room management routes.
 *
 * POST /api/rooms         — create a room (requires auth)
 * GET  /api/rooms         — list active rooms
 * GET  /api/rooms/:id     — get room info
 * POST /api/rooms/:id/end — end a room (host only)
 * GET  /api/rooms/:id/ws  — WebSocket upgrade for signaling
 */

import type { Env } from '../index.js';

export async function handleRoomRoutes(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  // POST /api/rooms — create
  if (url.pathname === '/api/rooms' && request.method === 'POST') {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return jsonResponse({ error: 'Auth required' }, 401);

    let identity: { did: string; handle: string };
    try {
      identity = JSON.parse(atob(token));
    } catch {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const body = await request.json() as { title: string; description?: string; maxParticipants?: number };
    if (!body.title) return jsonResponse({ error: 'title required' }, 400);

    // Create a DO instance for this room
    const roomId = env.ROOM_COORDINATOR.newUniqueId();
    const stub = env.ROOM_COORDINATOR.get(roomId);

    const doRes = await stub.fetch(new Request('https://do/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostDid: identity.did,
        hostHandle: identity.handle,
        title: body.title,
        description: body.description,
        maxParticipants: body.maxParticipants ?? 10,
      }),
    }));

    const data = await doRes.json();
    return jsonResponse(data, doRes.status);
  }

  // GET /api/rooms — list (returns rooms from active DOs)
  // Note: In production, you'd maintain an index in D1 or KV.
  // For now, rooms are discovered via the lobby WebSocket or shared links.
  if (url.pathname === '/api/rooms' && request.method === 'GET') {
    // Placeholder — room discovery happens via shared links for now
    return jsonResponse({ rooms: [], note: 'Share room links to invite participants' });
  }

  // Match /api/rooms/:id patterns
  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/.*)?$/);
  if (!roomMatch) return null;

  const roomId = roomMatch[1];
  const subpath = roomMatch[2] || '';

  let stub: DurableObjectStub;
  try {
    const id = env.ROOM_COORDINATOR.idFromString(roomId);
    stub = env.ROOM_COORDINATOR.get(id);
  } catch {
    return jsonResponse({ error: 'Invalid room ID' }, 400);
  }

  // GET /api/rooms/:id — info
  if (subpath === '' && request.method === 'GET') {
    const doRes = await stub.fetch(new Request('https://do/info'));
    const data = await doRes.json();
    return jsonResponse(data, doRes.status);
  }

  // POST /api/rooms/:id/end — end room
  if (subpath === '/end' && request.method === 'POST') {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return jsonResponse({ error: 'Auth required' }, 401);

    let identity: { did: string };
    try {
      identity = JSON.parse(atob(token));
    } catch {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const doRes = await stub.fetch(new Request('https://do/end', {
      method: 'POST',
      headers: { 'X-Caller-DID': identity.did },
    }));
    const data = await doRes.json();
    return jsonResponse(data, doRes.status);
  }

  // WebSocket upgrade /api/rooms/:id/ws
  if (subpath === '/ws') {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return jsonResponse({ error: 'WebSocket upgrade required' }, 426);
    }
    // Forward the WebSocket upgrade to the DO
    return stub.fetch(request);
  }

  return null;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
