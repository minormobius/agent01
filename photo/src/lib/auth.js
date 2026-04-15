// ATProto authentication via shared OAuth worker at auth.mino.mobi
// Session managed as Bearer token in localStorage.

const AUTH_URL = 'https://auth.mino.mobi';
const SESSION_KEY = 'mino_auth_session';

let user = null; // { did, handle, scope }

export function getSession() {
  return user;
}

export function isLoggedIn() {
  return user !== null;
}

export function getToken() {
  return localStorage.getItem(SESSION_KEY);
}

function saveToken(t) {
  if (t) localStorage.setItem(SESSION_KEY, t);
  else localStorage.removeItem(SESSION_KEY);
}

// Pick up session from OAuth redirect or localStorage, validate
export async function init() {
  const url = new URL(location.href);
  const token = url.searchParams.get('__auth_session');
  if (token) {
    saveToken(token);
    url.searchParams.delete('__auth_session');
    history.replaceState({}, '', url);
  }
  const t = getToken();
  if (!t) { user = null; return null; }
  try {
    const r = await fetch(`${AUTH_URL}/api/me`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) { saveToken(null); user = null; return null; }
    user = await r.json();
    return user;
  } catch { saveToken(null); user = null; return null; }
}

// Redirect to Bluesky for OAuth
export async function login(handle) {
  const r = await fetch(`${AUTH_URL}/oauth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handle: handle.replace(/^@/, '').trim(),
      origin: location.origin,
      returnTo: location.href,
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || 'Login failed');
  }
  location.href = (await r.json()).authUrl;
}

export function logout() {
  const t = getToken();
  if (t) fetch(`${AUTH_URL}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
  saveToken(null);
  user = null;
}

// Authenticated fetch through auth worker proxy
export async function authFetch(path, options = {}) {
  const t = getToken();
  if (!t) throw new Error('Not logged in');

  const res = await fetch(`${AUTH_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${t}`,
    },
  });

  if (res.status === 401) {
    saveToken(null);
    user = null;
    throw new Error('Session expired — please sign in again');
  }

  return res;
}
