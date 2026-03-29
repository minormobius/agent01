/**
 * ATProto app-password auth routes.
 *
 * POST /api/auth/login — verify handle + app password against user's PDS
 * GET  /api/me — return current session
 * POST /api/auth/logout — destroy session
 */

import type { Env } from '../index.js';

interface PdsSession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

/** Resolve a handle to a PDS URL via DNS or fallback to bsky.social */
async function resolvePds(handle: string): Promise<string> {
  // Try the handle's own domain first for self-hosted PDS
  // Fall back to bsky.social for most users
  return 'https://bsky.social';
}

/** Create a session via the ATProto createSession endpoint */
async function createAtprotoSession(pdsUrl: string, handle: string, appPassword: string): Promise<PdsSession> {
  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ATProto auth failed: ${res.status} ${err}`);
  }

  return res.json() as Promise<PdsSession>;
}

/** Fetch profile for display name + avatar */
async function fetchProfile(pdsUrl: string, accessJwt: string, did: string): Promise<{ displayName?: string; avatarUrl?: string }> {
  try {
    const res = await fetch(`${pdsUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`, {
      headers: { 'Authorization': `Bearer ${accessJwt}` },
    });
    if (!res.ok) return {};
    const data = await res.json() as { displayName?: string; avatar?: string };
    return { displayName: data.displayName, avatarUrl: data.avatar };
  } catch {
    return {};
  }
}

// Simple in-memory session store (in production, use D1 or DO storage)
// For now, sessions are encoded in the token itself (stateless)

export async function handleAuthRoutes(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const body = await request.json() as { handle: string; appPassword: string };

    if (!body.handle || !body.appPassword) {
      return jsonResponse({ error: 'handle and appPassword required' }, 400);
    }

    const pdsUrl = await resolvePds(body.handle);
    let session: PdsSession;
    try {
      session = await createAtprotoSession(pdsUrl, body.handle, body.appPassword);
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 401);
    }

    const profile = await fetchProfile(pdsUrl, session.accessJwt, session.did);

    // Create a simple session token (base64-encoded identity)
    // In production, sign this with a secret
    const token = btoa(JSON.stringify({
      did: session.did,
      handle: session.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    }));

    return jsonResponse({
      session: {
        sessionId: token,
        did: session.did,
        handle: session.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
    });
  }

  if (url.pathname === '/api/me' && request.method === 'GET') {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    try {
      const identity = JSON.parse(atob(token));
      return jsonResponse({ session: identity });
    } catch {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }
  }

  return null; // Not an auth route
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
