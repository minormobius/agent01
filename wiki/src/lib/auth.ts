// OAuth via shared auth worker at auth.mino.mobi

const AUTH_URL = 'https://auth.mino.mobi';
const SESSION_KEY = 'mino_auth_session';

export interface AuthUser {
  did: string;
  handle: string;
}

function getToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

function saveToken(t: string | null): void {
  if (t) localStorage.setItem(SESSION_KEY, t);
  else localStorage.removeItem(SESSION_KEY);
}

/** Pick up session from OAuth redirect or localStorage. */
export async function authInit(): Promise<AuthUser | null> {
  const url = new URL(location.href);
  const token = url.searchParams.get('__auth_session');
  if (token) {
    saveToken(token);
    url.searchParams.delete('__auth_session');
    history.replaceState({}, '', url);
  }
  const t = getToken();
  if (!t) return null;
  try {
    const r = await fetch(`${AUTH_URL}/api/me`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) { saveToken(null); return null; }
    return await r.json();
  } catch { saveToken(null); return null; }
}

/** Redirect to Bluesky for OAuth. */
export async function authLogin(handle: string): Promise<void> {
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
    const e = await r.json().catch(() => ({} as Record<string, string>));
    throw new Error(e.error || 'Login failed');
  }
  location.href = (await r.json()).authUrl;
}

/** Clear OAuth session. */
export function authLogout(): void {
  const t = getToken();
  if (t) fetch(`${AUTH_URL}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
  saveToken(null);
}

/** Authenticated fetch through auth worker proxy. */
export async function authFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const t = getToken();
  if (!t) throw new Error('Not logged in');
  const headers = { ...(opts.headers as Record<string, string> || {}), Authorization: `Bearer ${t}` };
  const res = await fetch(`${AUTH_URL}${path}`, { ...opts, headers });
  if (res.status === 401) {
    saveToken(null);
    throw new Error('Session expired — please sign in again');
  }
  return res;
}
