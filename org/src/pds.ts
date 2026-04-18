/**
 * Minimal ATProto PDS client — just enough for vault operations.
 *
 * Two modes:
 * 1. Auth-proxied (no service URL): operations go through auth.mino.mobi
 *    which adds DPoP proofs. Used for the logged-in user's writes.
 * 2. Direct (with service URL): plain fetch to a specific PDS. Used for
 *    reading other users' records (no auth needed).
 */

import type { Session } from "./types";

const PUBLIC_API = "https://public.api.bsky.app";
const PLC_DIRECTORY = "https://plc.directory";
const AUTH_URL = "https://auth.mino.mobi";
const SESSION_KEY = "mino_auth_session";

/** Resolve a Bluesky handle to a DID. Uses public API, no auth needed. */
export async function resolveHandle(handle: string): Promise<string> {
  handle = handle.replace(/^@/, "").trim();
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: @${handle}`);
  const { did } = await res.json();
  return did;
}

/** Resolve a DID to a PDS service endpoint. */
export async function resolvePds(did: string): Promise<string> {
  let doc: Record<string, unknown>;
  if (did.startsWith("did:plc:")) {
    const res = await fetch(`${PLC_DIRECTORY}/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else if (did.startsWith("did:web:")) {
    const domain = did.replace("did:web:", "");
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }

  const services = doc.service as Array<{ id: string; serviceEndpoint: string }> | undefined;
  const svc = services?.find((s) => s.id === "#atproto_pds");
  if (!svc) throw new Error(`No PDS found for ${did}`);
  return svc.serviceEndpoint;
}

// --- OAuth helpers ---

function getToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

function saveToken(t: string | null): void {
  if (t) localStorage.setItem(SESSION_KEY, t);
  else localStorage.removeItem(SESSION_KEY);
}

/** Pick up session from OAuth redirect or localStorage. */
export async function authInit(): Promise<Session | null> {
  const url = new URL(location.href);
  const token = url.searchParams.get("__auth_session");
  if (token) {
    saveToken(token);
    url.searchParams.delete("__auth_session");
    history.replaceState({}, "", url);
  }
  const t = getToken();
  if (!t) return null;
  try {
    const r = await fetch(`${AUTH_URL}/api/me`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) { saveToken(null); return null; }
    const user = await r.json();
    return { did: user.did, handle: user.handle, accessJwt: t, refreshJwt: "" };
  } catch { saveToken(null); return null; }
}

/** Redirect to Bluesky for OAuth. */
export async function authLogin(handle: string): Promise<void> {
  const r = await fetch(`${AUTH_URL}/oauth/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handle: handle.replace(/^@/, "").trim(),
      origin: location.origin,
      returnTo: location.href,
    }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({} as Record<string, string>));
    throw new Error(e.error || "Login failed");
  }
  location.href = (await r.json()).authUrl;
}

/** Clear OAuth session. */
export function authLogout(): void {
  const t = getToken();
  if (t) fetch(`${AUTH_URL}/api/logout`, { method: "POST", headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
  saveToken(null);
}

export class PdsClient {
  private service: string;
  private session: Session | null = null;
  private useAuthProxy: boolean;
  private userPdsUrl: string | null = null;

  /**
   * @param service PDS URL for direct access, or empty/omitted for auth-proxied mode.
   */
  constructor(service?: string) {
    if (service) {
      this.service = service.replace(/\/$/, "");
      if (!this.service.startsWith("http")) {
        this.service = `https://${this.service}`;
      }
      this.useAuthProxy = false;
    } else {
      this.service = AUTH_URL;
      this.useAuthProxy = true;
    }
  }

  /** Authenticate with handle — redirects to Bluesky OAuth. */
  async login(handle: string, _appPassword?: string): Promise<Session> {
    if (this.useAuthProxy) {
      await authLogin(handle);
      // Won't reach here — browser redirects
      throw new Error("Redirecting...");
    }
    // Direct mode: legacy createSession (for reading other PDSes)
    const res = await this.xrpc("com.atproto.server.createSession", {
      identifier: handle,
      password: _appPassword,
    });
    this.session = res as unknown as Session;
    return this.session;
  }

  /** Refresh — no-op in auth-proxied mode (auth worker handles it). */
  async refreshSession(): Promise<void> {
    if (this.useAuthProxy) return; // auth worker manages token refresh
    if (!this.session) throw new Error("No session to refresh");
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.server.refreshSession`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.session.refreshJwt}`,
        },
      }
    );
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    const data = await res.json();
    this.session = { ...this.session, ...data };
  }

  /** Get a single record. Returns null if not found. */
  async getRecord(
    collection: string,
    rkey: string
  ): Promise<Record<string, unknown> | null> {
    if (this.useAuthProxy) {
      const params = new URLSearchParams({ collection, rkey });
      const res = await this.authProxyFetch(`/pds/repo/getRecord?${params}`);
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(`getRecord failed: ${res.status}`);
      return res.json();
    }
    if (!this.session) throw new Error("Not authenticated");
    const params = new URLSearchParams({
      repo: this.session.did,
      collection,
      rkey,
    });
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.getRecord?${params}`,
      { headers: { Authorization: `Bearer ${this.session.accessJwt}` } }
    );
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`getRecord failed: ${res.status}`);
    return res.json();
  }

  /** List records in a collection. */
  async listRecords(
    collection: string,
    limit = 100,
    cursor?: string
  ): Promise<{
    records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>;
    cursor?: string;
  }> {
    if (this.useAuthProxy) {
      const params = new URLSearchParams({ collection, limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      const res = await this.authProxyFetch(`/pds/repo/listRecords?${params}`);
      if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
      return res.json();
    }
    if (!this.session) throw new Error("Not authenticated");
    const params = new URLSearchParams({
      repo: this.session.did,
      collection,
      limit: String(limit),
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.listRecords?${params}`,
      { headers: { Authorization: `Bearer ${this.session.accessJwt}` } }
    );
    if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
    return res.json();
  }

  /** Create or update a record. */
  async putRecord(
    collection: string,
    rkey: string,
    record: object
  ): Promise<{ uri: string; cid: string }> {
    if (this.useAuthProxy) {
      const res = await this.authProxyFetch("/pds/repo/putRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, rkey, record }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`putRecord failed (${res.status}): ${text}`);
      }
      return res.json();
    }
    return this.xrpc("com.atproto.repo.putRecord", {
      repo: this.session!.did,
      collection,
      rkey,
      record,
    }) as Promise<{ uri: string; cid: string }>;
  }

  /** Create a record with an auto-generated rkey (TID). */
  async createRecord(
    collection: string,
    record: object
  ): Promise<{ uri: string; cid: string }> {
    if (this.useAuthProxy) {
      const res = await this.authProxyFetch("/pds/repo/createRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, record }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`createRecord failed (${res.status}): ${text}`);
      }
      return res.json();
    }
    return this.xrpc("com.atproto.repo.createRecord", {
      repo: this.session!.did,
      collection,
      record,
    }) as Promise<{ uri: string; cid: string }>;
  }

  /** Delete a record. */
  async deleteRecord(collection: string, rkey: string): Promise<void> {
    if (this.useAuthProxy) {
      const res = await this.authProxyFetch("/pds/repo/deleteRecord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection, rkey }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`deleteRecord failed (${res.status}): ${text}`);
      }
      return;
    }
    await this.xrpc("com.atproto.repo.deleteRecord", {
      repo: this.session!.did,
      collection,
      rkey,
    });
  }

  /** List records from a specific repo (can be another user's DID). */
  async listRecordsFrom(
    did: string,
    collection: string,
    limit = 100,
    cursor?: string
  ): Promise<{
    records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>;
    cursor?: string;
  }> {
    const params = new URLSearchParams({
      repo: did,
      collection,
      limit: String(limit),
    });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.listRecords?${params}`
    );
    if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
    return res.json();
  }

  /** Get a record from a specific repo (can be another user's DID). */
  async getRecordFrom(
    did: string,
    collection: string,
    rkey: string
  ): Promise<Record<string, unknown> | null> {
    const params = new URLSearchParams({ repo: did, collection, rkey });
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.getRecord?${params}`
    );
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`getRecord failed: ${res.status}`);
    return res.json();
  }

  /** Restore a previously stored session (for durable login). */
  restoreSession(session: Session): void {
    this.session = session;
  }

  /** Upload a blob to the PDS. Returns the blob ref for embedding in records. */
  async uploadBlob(
    data: Uint8Array,
    mimeType: string
  ): Promise<{ ref: { $link: string }; mimeType: string; size: number }> {
    if (this.useAuthProxy) {
      const res = await this.authProxyFetch("/pds/repo/uploadBlob", {
        method: "POST",
        headers: { "Content-Type": mimeType },
        body: data.buffer as ArrayBuffer,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`uploadBlob failed (${res.status}): ${text}`);
      }
      const { blob } = await res.json();
      return blob;
    }
    if (!this.session) throw new Error("Not authenticated");
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.uploadBlob`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.session.accessJwt}`,
          "Content-Type": mimeType,
        },
        body: data.buffer as ArrayBuffer,
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`uploadBlob failed (${res.status}): ${text}`);
    }
    const { blob } = await res.json();
    return blob;
  }

  /** Fetch a blob by DID + CID. */
  async getBlob(did: string, cid: string): Promise<Uint8Array> {
    const params = new URLSearchParams({ did, cid });
    if (this.useAuthProxy) {
      const res = await this.authProxyFetch(`/pds/sync/getBlob?${params}`);
      if (!res.ok) throw new Error(`getBlob failed (${res.status})`);
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.sync.getBlob?${params}`
    );
    if (!res.ok) throw new Error(`getBlob failed (${res.status})`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  /** Get the current session info. */
  getSession(): Session | null {
    return this.session;
  }

  /** Set the user's real PDS URL (for getService in auth-proxied mode). */
  setUserPds(url: string): void {
    this.userPdsUrl = url;
  }

  /** Get the service URL (real PDS if resolved, else raw service). */
  getService(): string {
    return this.userPdsUrl || this.service;
  }

  /** Authenticated fetch through auth.mino.mobi proxy. */
  private async authProxyFetch(path: string, opts: RequestInit = {}): Promise<Response> {
    const t = getToken();
    if (!t) throw new Error("Not logged in");
    const headers = { ...(opts.headers as Record<string, string> || {}), Authorization: `Bearer ${t}` };
    const res = await fetch(`${AUTH_URL}${path}`, { ...opts, headers });
    if (res.status === 401) {
      saveToken(null);
      this.session = null;
      throw new Error("Session expired — please sign in again");
    }
    return res;
  }

  /** Generic XRPC POST call (direct mode only). */
  private async xrpc(
    method: string,
    body: object
  ): Promise<Record<string, unknown>> {
    if (!this.session && !method.includes("createSession")) {
      throw new Error("Not authenticated");
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.session) {
      headers["Authorization"] = `Bearer ${this.session.accessJwt}`;
    }
    const res = await fetch(`${this.service}/xrpc/${method}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let detail = "";
      try {
        const errBody = JSON.parse(text);
        const code = errBody.error || "";
        const msg = errBody.message || "";
        if (code === "RateLimitExceeded") {
          detail = "Rate limited. Wait a moment and try again.";
        } else if (code === "InvalidRequest" || code === "InvalidSwap") {
          detail = `${method.split(".").pop()}: ${code}${msg ? " — " + msg : ""}`;
        } else {
          detail = code ? `${code}: ${msg}` : msg || text;
        }
      } catch {
        detail = text || `HTTP ${res.status}`;
      }
      throw new Error(detail || `XRPC ${method} failed (${res.status})`);
    }
    return res.json();
  }
}
