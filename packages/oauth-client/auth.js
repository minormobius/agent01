/**
 * Shared OAuth client for mino.mobi sites.
 * Talks to auth.mino.mobi for ATProto OAuth.
 * No dependencies, no build step.
 *
 * Usage:
 *   import { AuthClient } from '../../packages/oauth-client/auth.js';
 *
 *   const auth = new AuthClient();
 *   auth.onAuthChange(user => console.log('Auth:', user));
 *
 *   // Login — redirects to Bluesky
 *   auth.login('alice.bsky.social');
 *
 *   // After redirect back, call init() to pick up the session
 *   await auth.init();
 *
 *   // Check current user
 *   const user = auth.getUser(); // { did, handle, scope } or null
 *
 *   // PDS operations (proxied through auth worker)
 *   await auth.pds.createRecord('com.example.thing', { hello: 'world' });
 *   await auth.pds.putRecord('com.example.thing', 'self', { hello: 'world' });
 *   await auth.pds.deleteRecord('com.example.thing', 'abc123');
 *   const records = await auth.pds.listRecords('com.example.thing');
 *   const blob = await auth.pds.uploadBlob(fileData, 'image/jpeg');
 *
 *   // Logout
 *   await auth.logout();
 */

const DEFAULT_AUTH_URL = 'https://auth.mino.mobi';
const SESSION_KEY = 'mino_auth_session';

export class AuthClient {
  /**
   * @param {string} [authUrl] - Auth worker URL (default: https://auth.mino.mobi)
   */
  constructor(authUrl) {
    this.authUrl = (authUrl || DEFAULT_AUTH_URL).replace(/\/$/, '');
    this._token = null;
    this._user = null;
    this._listeners = [];
    this.pds = new PdsProxy(this);
  }

  // --- Lifecycle ---

  /**
   * Initialize the client. Call on page load.
   * Picks up session token from URL (after OAuth redirect) or localStorage.
   * Validates the session with the auth worker.
   */
  async init() {
    // 1. Check URL for auth callback token
    const urlToken = this._extractTokenFromUrl();
    if (urlToken) {
      this._token = urlToken;
      this._saveToken(urlToken);
      this._cleanUrl();
    } else {
      // 2. Check localStorage
      this._token = this._loadToken();
    }

    // 3. Validate session
    if (this._token) {
      try {
        const user = await this._fetchMe();
        this._user = user;
        this._notify();
      } catch {
        // Session expired or invalid
        this._token = null;
        this._user = null;
        this._removeToken();
        this._notify();
      }
    }

    return this._user;
  }

  // --- Auth actions ---

  /**
   * Start OAuth login. Redirects the browser to Bluesky for authorization.
   * @param {string} handle - Bluesky handle (e.g. 'alice.bsky.social')
   * @param {object} [opts]
   * @param {string} [opts.returnTo] - URL to return to after auth (default: current page)
   * @param {string} [opts.scope] - OAuth scope (default: 'atproto transition:generic')
   */
  async login(handle, opts) {
    const returnTo = opts?.returnTo || window.location.href;
    const origin = window.location.origin;

    const res = await fetch(`${this.authUrl}/oauth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: handle.replace(/^@/, '').trim(),
        origin,
        returnTo,
        scope: opts?.scope,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || 'Login failed');
    }

    const { authUrl } = await res.json();
    window.location.href = authUrl;
  }

  /**
   * Log out. Destroys the session on the auth worker and clears local state.
   */
  async logout() {
    if (this._token) {
      try {
        await fetch(`${this.authUrl}/api/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this._token}` },
        });
      } catch { /* best effort */ }
    }
    this._token = null;
    this._user = null;
    this._removeToken();
    this._notify();
  }

  // --- State ---

  /** Get the current authenticated user, or null. */
  getUser() {
    return this._user;
  }

  /** Get the raw session token (for manual API calls). */
  getToken() {
    return this._token;
  }

  /** Whether a user is currently logged in. */
  isLoggedIn() {
    return this._user !== null;
  }

  /**
   * Register a callback for auth state changes.
   * @param {function} fn - Called with (user) on login/logout
   * @returns {function} Unsubscribe function
   */
  onAuthChange(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((f) => f !== fn);
    };
  }

  // --- Internal ---

  _notify() {
    for (const fn of this._listeners) {
      try { fn(this._user); } catch { /* swallow */ }
    }
  }

  _extractTokenFromUrl() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('__auth_session');
    return token || null;
  }

  _cleanUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('__auth_session');
    window.history.replaceState({}, '', url.toString());
  }

  _saveToken(token) {
    try { localStorage.setItem(SESSION_KEY, token); } catch { /* no-op */ }
  }

  _loadToken() {
    try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
  }

  _removeToken() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* no-op */ }
  }

  async _fetchMe() {
    const res = await fetch(`${this.authUrl}/api/me`, {
      headers: { Authorization: `Bearer ${this._token}` },
    });
    if (!res.ok) throw new Error('Session invalid');
    return res.json();
  }

  /**
   * Make an authenticated request to the auth worker.
   * @param {string} path
   * @param {object} [opts]
   */
  async _request(path, opts) {
    const headers = { ...opts?.headers };
    if (this._token) headers['Authorization'] = `Bearer ${this._token}`;

    const res = await fetch(`${this.authUrl}${path}`, {
      method: opts?.method || 'GET',
      headers,
      body: opts?.body,
    });

    if (res.status === 401) {
      // Session expired
      this._token = null;
      this._user = null;
      this._removeToken();
      this._notify();
      throw new Error('Session expired — please log in again');
    }

    return res;
  }
}

// --- PDS Proxy ---

/**
 * PDS operations proxied through auth.mino.mobi.
 * API mirrors packages/atproto/pds.js PdsClient, but all calls go
 * through the auth worker which adds DPoP proofs.
 */
class PdsProxy {
  /** @param {AuthClient} auth */
  constructor(auth) {
    this._auth = auth;
  }

  /** Create a record with an auto-generated rkey. */
  async createRecord(collection, record) {
    const res = await this._auth._request('/pds/repo/createRecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, record }),
    });
    if (!res.ok) throw await this._error(res, 'createRecord');
    return res.json();
  }

  /** Create or update a record at a specific rkey. */
  async putRecord(collection, rkey, record) {
    const res = await this._auth._request('/pds/repo/putRecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, rkey, record }),
    });
    if (!res.ok) throw await this._error(res, 'putRecord');
    return res.json();
  }

  /** Delete a record. */
  async deleteRecord(collection, rkey) {
    const res = await this._auth._request('/pds/repo/deleteRecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, rkey }),
    });
    if (!res.ok) throw await this._error(res, 'deleteRecord');
    return res.json();
  }

  /** Get a single record. Returns null if not found. */
  async getRecord(collection, rkey) {
    const params = new URLSearchParams({ collection, rkey });
    const res = await this._auth._request(`/pds/repo/getRecord?${params}`);
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw await this._error(res, 'getRecord');
    return res.json();
  }

  /** List records in a collection. */
  async listRecords(collection, limit = 100, cursor) {
    const params = new URLSearchParams({ collection, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const res = await this._auth._request(`/pds/repo/listRecords?${params}`);
    if (!res.ok) throw await this._error(res, 'listRecords');
    return res.json();
  }

  /** Upload a blob. Returns the blob ref for embedding in records. */
  async uploadBlob(data, mimeType) {
    const body = data instanceof ArrayBuffer ? data : data.buffer || data;
    const res = await this._auth._request('/pds/repo/uploadBlob', {
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body,
    });
    if (!res.ok) throw await this._error(res, 'uploadBlob');
    const result = await res.json();
    return result.blob;
  }

  /** Fetch a blob by DID + CID. */
  async getBlob(did, cid) {
    const params = new URLSearchParams({ did, cid });
    const res = await this._auth._request(`/pds/sync/getBlob?${params}`);
    if (!res.ok) throw await this._error(res, 'getBlob');
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  async _error(res, method) {
    const text = await res.text().catch(() => '');
    let detail = '';
    try {
      const err = JSON.parse(text);
      detail = err.error || err.message || text;
    } catch {
      detail = text || `HTTP ${res.status}`;
    }
    return new Error(`${method} failed: ${detail}`);
  }
}
