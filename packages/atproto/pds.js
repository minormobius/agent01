/**
 * Shared ATProto PDS client — resolves identities, manages sessions,
 * reads/writes records. No dependencies, pure fetch + WebCrypto.
 *
 * Usage (browser or Worker):
 *   import { resolveHandle, resolvePds, PdsClient } from '../../packages/atproto/pds.js';
 *
 *   const did = await resolveHandle('alice.bsky.social');
 *   const pds = await resolvePds(did);
 *   const client = new PdsClient(pds);
 *   await client.login('alice.bsky.social', 'app-password');
 *   await client.putRecord('com.example.thing', 'self', { hello: 'world' });
 */

const PUBLIC_API = 'https://public.api.bsky.app';
const PLC_DIRECTORY = 'https://plc.directory';

// ─── Identity Resolution ─────────────────────────────────────────

/** Resolve a Bluesky handle to a DID. Uses public API, no auth needed. */
export async function resolveHandle(handle) {
  handle = handle.replace(/^@/, '').trim();
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: @${handle}`);
  const { did } = await res.json();
  return did;
}

/** Resolve a DID to a PDS service endpoint. Supports did:plc and did:web. */
export async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`${PLC_DIRECTORY}/${did}`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else if (did.startsWith('did:web:')) {
    const domain = did.replace('did:web:', '');
    const res = await fetch(`https://${domain}/.well-known/did.json`);
    if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }

  const svc = doc.service?.find((s) => s.id === '#atproto_pds');
  if (!svc) throw new Error(`No PDS found for ${did}`);
  return svc.serviceEndpoint;
}

// ─── TID Generation ──────────────────────────────────────────────

/** Generate an ATProto TID (timestamp-based record key). */
export function generateTid() {
  const now = BigInt(Date.now()) * 1000n; // microseconds
  const clockId = BigInt(Math.floor(Math.random() * 1024)); // 10 random bits
  const tid = (now << 10n) | clockId;
  return tid.toString(36).padStart(13, '0');
}

// ─── PDS Client ──────────────────────────────────────────────────

export class PdsClient {
  /** @param {string} service - PDS URL (e.g. https://bsky.social) */
  constructor(service) {
    this.service = service.replace(/\/$/, '');
    if (!this.service.startsWith('http')) {
      this.service = `https://${this.service}`;
    }
    /** @type {{ did: string, handle: string, accessJwt: string, refreshJwt: string } | null} */
    this.session = null;
  }

  /** Authenticate with handle + app password. */
  async login(handle, appPassword) {
    const res = await this._xrpc('com.atproto.server.createSession', {
      identifier: handle,
      password: appPassword,
    });
    this.session = res;
    return this.session;
  }

  /** Refresh an expired access token. */
  async refreshSession() {
    if (!this.session) throw new Error('No session to refresh');
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.server.refreshSession`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.session.refreshJwt}` },
      }
    );
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    const data = await res.json();
    this.session = { ...this.session, ...data };
  }

  /** Restore a previously stored session (for durable login). */
  restoreSession(session) {
    this.session = session;
  }

  /** Get the current session info. */
  getSession() {
    return this.session;
  }

  /** Get the service URL. */
  getService() {
    return this.service;
  }

  // ─── Record Operations ───────────────────────────────────────

  /** Get a single record. Returns null if not found. */
  async getRecord(collection, rkey) {
    if (!this.session) throw new Error('Not authenticated');
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

  /** Get a record from a specific repo (can be another user's DID). */
  async getRecordFrom(did, collection, rkey) {
    const params = new URLSearchParams({ repo: did, collection, rkey });
    const headers = {};
    if (this.session) headers['Authorization'] = `Bearer ${this.session.accessJwt}`;
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.getRecord?${params}`,
      { headers }
    );
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`getRecord failed: ${res.status}`);
    return res.json();
  }

  /** List records in a collection. */
  async listRecords(collection, limit = 100, cursor) {
    if (!this.session) throw new Error('Not authenticated');
    const params = new URLSearchParams({
      repo: this.session.did,
      collection,
      limit: String(limit),
    });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.listRecords?${params}`,
      { headers: { Authorization: `Bearer ${this.session.accessJwt}` } }
    );
    if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
    return res.json();
  }

  /** List records from a specific repo (can be another user's DID). */
  async listRecordsFrom(did, collection, limit = 100, cursor) {
    const params = new URLSearchParams({
      repo: did,
      collection,
      limit: String(limit),
    });
    if (cursor) params.set('cursor', cursor);
    const headers = {};
    if (this.session) headers['Authorization'] = `Bearer ${this.session.accessJwt}`;
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.listRecords?${params}`,
      { headers }
    );
    if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
    return res.json();
  }

  /** Create or update a record at a specific rkey. */
  async putRecord(collection, rkey, record) {
    return this._xrpc('com.atproto.repo.putRecord', {
      repo: this.session.did,
      collection,
      rkey,
      record,
    });
  }

  /** Create a record with an auto-generated rkey (TID). */
  async createRecord(collection, record) {
    return this._xrpc('com.atproto.repo.createRecord', {
      repo: this.session.did,
      collection,
      record,
    });
  }

  /** Delete a record. */
  async deleteRecord(collection, rkey) {
    await this._xrpc('com.atproto.repo.deleteRecord', {
      repo: this.session.did,
      collection,
      rkey,
    });
  }

  // ─── Blob Operations ─────────────────────────────────────────

  /** Upload a blob to the PDS. Returns the blob ref for embedding in records. */
  async uploadBlob(data, mimeType) {
    if (!this.session) throw new Error('Not authenticated');
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.repo.uploadBlob`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.session.accessJwt}`,
          'Content-Type': mimeType,
        },
        body: data instanceof ArrayBuffer ? data : data.buffer,
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`uploadBlob failed (${res.status}): ${text}`);
    }
    const { blob } = await res.json();
    return blob;
  }

  /** Fetch a blob by DID + CID. Works cross-PDS for public blobs. */
  async getBlob(did, cid) {
    const params = new URLSearchParams({ did, cid });
    const headers = {};
    if (this.session) headers['Authorization'] = `Bearer ${this.session.accessJwt}`;
    const res = await fetch(
      `${this.service}/xrpc/com.atproto.sync.getBlob?${params}`,
      { headers }
    );
    if (!res.ok) throw new Error(`getBlob failed (${res.status})`);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // ─── Internal ─────────────────────────────────────────────────

  /** Generic XRPC POST call with auth and structured error handling. */
  async _xrpc(method, body) {
    if (!this.session && !method.includes('createSession')) {
      throw new Error('Not authenticated');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (this.session) {
      headers['Authorization'] = `Bearer ${this.session.accessJwt}`;
    }
    const res = await fetch(`${this.service}/xrpc/${method}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let detail = '';
      try {
        const err = JSON.parse(text);
        const code = err.error || '';
        const msg = err.message || '';
        if (code === 'AuthFactorTokenRequired') {
          detail = 'Two-factor auth is enabled. Use an app password instead.';
        } else if (code === 'RateLimitExceeded') {
          detail = 'Rate limited. Wait a moment and try again.';
        } else if (msg.includes('Invalid identifier or password')) {
          detail = 'Invalid handle or app password.';
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
