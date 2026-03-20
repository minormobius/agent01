// ATProto authentication via app passwords
// Uses com.atproto.server.createSession / refreshSession

let session = null;

export function getSession() {
  return session;
}

export function isLoggedIn() {
  return session !== null;
}

export function logout() {
  session = null;
}

export async function login(service, identifier, password) {
  // Normalize service URL
  if (!service.startsWith('https://')) {
    service = `https://${service}`;
  }
  service = service.replace(/\/$/, '');

  const res = await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Login failed: ${res.status}`);
  }

  const data = await res.json();
  session = {
    service,
    did: data.did,
    handle: data.handle,
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
  };

  return session;
}

export async function refreshSession() {
  if (!session?.refreshJwt) throw new Error('No session to refresh');

  const res = await fetch(`${session.service}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.refreshJwt}`,
    },
  });

  if (!res.ok) {
    session = null;
    throw new Error('Session expired, please log in again');
  }

  const data = await res.json();
  session = {
    ...session,
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
    handle: data.handle,
  };

  return session;
}

// Authenticated fetch with auto-refresh on 401
export async function authFetch(url, options = {}) {
  if (!session) throw new Error('Not logged in');

  const doFetch = (jwt) =>
    fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${jwt}`,
      },
    });

  let res = await doFetch(session.accessJwt);

  if (res.status === 401) {
    await refreshSession();
    res = await doFetch(session.accessJwt);
  }

  return res;
}
