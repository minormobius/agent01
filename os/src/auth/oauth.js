// ATProto identity resolution and session management
// Phase 1: App password auth (direct PDS session)
// Phase 2: OAuth 2.1 with PKCE + DPoP (confidential client via Worker)

const BSKY_PUBLIC_API = 'https://public.api.bsky.app';
const PLC_DIRECTORY = 'https://plc.directory';

export async function resolveIdentity(handle) {
  // Handle → DID
  const res = await fetch(
    `${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: ${handle}`);
  const { did } = await res.json();

  // DID → PDS URL
  const pdsUrl = await resolvePDS(did);

  return { did, handle, pdsUrl };
}

async function resolvePDS(did) {
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`${PLC_DIRECTORY}/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    const doc = await res.json();
    const service = doc.service?.find(s => s.id === '#atproto_pds');
    if (!service) throw new Error('No PDS service in DID document');
    return service.serviceEndpoint;
  } else if (did.startsWith('did:web:')) {
    const domain = did.replace('did:web:', '');
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    if (!res.ok) throw new Error(`Could not resolve did:web: ${did}`);
    const doc = await res.json();
    const service = doc.service?.find(s => s.id === '#atproto_pds');
    if (!service) throw new Error('No PDS service in DID document');
    return service.serviceEndpoint;
  }
  throw new Error(`Unsupported DID method: ${did}`);
}

export async function createSession(pdsUrl, identifier, password) {
  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Authentication failed');
  }
  const data = await res.json();
  return {
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
    did: data.did,
    handle: data.handle,
    pdsUrl
  };
}

export async function refreshSession(pdsUrl, refreshJwt) {
  const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${refreshJwt}` }
  });
  if (!res.ok) throw new Error('Session refresh failed');
  return res.json();
}

// Persistent session — localStorage
const SESSION_KEY = 'pds-shell-session';

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      handle: session.handle,
      did: session.did,
      pdsUrl: session.pdsUrl,
      refreshJwt: session.refreshJwt,
    }));
  } catch { /* storage full or unavailable */ }
}

export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export async function restoreSession() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch { return null; }
  if (!saved?.refreshJwt || !saved?.pdsUrl) return null;

  const data = await refreshSession(saved.pdsUrl, saved.refreshJwt);
  const session = {
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
    did: data.did,
    handle: data.handle,
    pdsUrl: saved.pdsUrl,
  };
  saveSession(session); // persist the new refresh token
  return session;
}
