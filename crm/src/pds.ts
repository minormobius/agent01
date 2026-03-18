/**
 * Minimal ATProto PDS client — just enough for vault operations.
 *
 * Uses XRPC (HTTP + JSON) directly. No SDK dependency.
 */

import type { Session } from "./types";

const PUBLIC_API = "https://public.api.bsky.app";
const PLC_DIRECTORY = "https://plc.directory";

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

export class PdsClient {
  private service: string;
  private session: Session | null = null;

  constructor(service: string) {
    // Normalize: ensure https, strip trailing slash
    this.service = service.replace(/\/$/, "");
    if (!this.service.startsWith("http")) {
      this.service = `https://${this.service}`;
    }
  }

  /** Authenticate with handle + app password. */
  async login(handle: string, appPassword: string): Promise<Session> {
    const res = await this.xrpc("com.atproto.server.createSession", {
      identifier: handle,
      password: appPassword,
    });
    this.session = res as unknown as Session;
    return this.session;
  }

  /** Refresh an expired access token. */
  async refreshSession(): Promise<void> {
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
    return this.xrpc("com.atproto.repo.createRecord", {
      repo: this.session!.did,
      collection,
      record,
    }) as Promise<{ uri: string; cid: string }>;
  }

  /** Delete a record. */
  async deleteRecord(collection: string, rkey: string): Promise<void> {
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
    const headers: Record<string, string> = {};
    if (this.session) {
      headers["Authorization"] = `Bearer ${this.session.accessJwt}`;
    }
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.listRecords?${params}`,
      { headers }
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
    const headers: Record<string, string> = {};
    if (this.session) {
      headers["Authorization"] = `Bearer ${this.session.accessJwt}`;
    }
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.getRecord?${params}`,
      { headers }
    );
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`getRecord failed: ${res.status}`);
    return res.json();
  }

  /** Get the current session info. */
  getSession(): Session | null {
    return this.session;
  }

  /** Get the service URL. */
  getService(): string {
    return this.service;
  }

  /** Generic XRPC POST call. */
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
        // ATProto errors have { error: "ErrorCode", message: "..." }
        const code = errBody.error || "";
        const msg = errBody.message || "";
        if (code === "AuthFactorTokenRequired") {
          detail = "Two-factor authentication is enabled. App passwords bypass 2FA — generate one in Bluesky Settings > App Passwords.";
        } else if (code === "AccountTakedown" || code === "AccountDeactivated") {
          detail = `Account is ${code === "AccountTakedown" ? "taken down" : "deactivated"}.`;
        } else if (code === "RateLimitExceeded") {
          detail = "Rate limited. Wait a moment and try again.";
        } else if (msg.includes("Invalid identifier or password")) {
          detail = "Invalid handle or app password. Check your credentials.";
        } else if (code === "InvalidRequest" || code === "InvalidSwap") {
          // PDS rejected the record write — show exactly what happened
          detail = `${method.split(".").pop()}: ${code}${msg ? " — " + msg : ""}`;
        } else {
          // Always show the error code — the message alone is often useless
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
