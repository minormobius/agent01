/**
 * Dual-mode ATProto PDS client.
 *
 * Auth-proxied (no service URL): writes go through auth.mino.mobi which
 * adds DPoP proofs. Used for the logged-in user's records.
 *
 * Direct (with service URL): plain fetch to a specific PDS. Used for
 * reading other users' records (no auth needed).
 */

import { authFetch } from './auth';

const PUBLIC_API = 'https://public.api.bsky.app';
const PLC_DIRECTORY = 'https://plc.directory';

/** Cache PDS resolution results to avoid repeated PLC lookups. */
const pdsResolutionCache = new Map<string, string>();

export async function resolveHandle(handle: string): Promise<string> {
  handle = handle.replace(/^@/, '').trim();
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) throw new Error(`Could not resolve handle: @${handle}`);
  const { did } = await res.json();
  return did;
}

export async function resolvePds(did: string): Promise<string> {
  const cached = pdsResolutionCache.get(did);
  if (cached) return cached;

  let doc: Record<string, unknown>;
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
  const services = doc.service as Array<{ id: string; serviceEndpoint: string }> | undefined;
  const svc = services?.find(s => s.id === '#atproto_pds');
  if (!svc) throw new Error(`No PDS found for ${did}`);
  pdsResolutionCache.set(did, svc.serviceEndpoint);
  return svc.serviceEndpoint;
}

export class PdsClient {
  private service: string;
  private useAuthProxy: boolean;
  private userPdsUrl: string | null = null;

  constructor(service?: string) {
    if (service) {
      this.service = service.replace(/\/$/, '');
      if (!this.service.startsWith('http')) this.service = `https://${this.service}`;
      this.useAuthProxy = false;
    } else {
      this.service = '';
      this.useAuthProxy = true;
    }
  }

  setUserPds(url: string): void { this.userPdsUrl = url; }
  getService(): string { return this.userPdsUrl || this.service; }

  async getRecord(collection: string, rkey: string): Promise<Record<string, unknown> | null> {
    if (this.useAuthProxy) {
      const params = new URLSearchParams({ collection, rkey });
      const res = await authFetch(`/pds/repo/getRecord?${params}`);
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(`getRecord failed: ${res.status}`);
      return res.json();
    }
    throw new Error('Direct getRecord requires getRecordFrom with a DID');
  }

  async listRecords(collection: string, limit = 100, cursor?: string): Promise<{
    records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>;
    cursor?: string;
  }> {
    if (this.useAuthProxy) {
      const params = new URLSearchParams({ collection, limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      const res = await authFetch(`/pds/repo/listRecords?${params}`);
      if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
      return res.json();
    }
    throw new Error('Direct listRecords requires listRecordsFrom with a DID');
  }

  async putRecord(collection: string, rkey: string, record: object): Promise<{ uri: string; cid: string }> {
    if (this.useAuthProxy) {
      const res = await authFetch('/pds/repo/putRecord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, rkey, record }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`putRecord failed (${res.status}): ${t}`); }
      return res.json();
    }
    throw new Error('Direct mode does not support writes');
  }

  async createRecord(collection: string, record: object): Promise<{ uri: string; cid: string }> {
    if (this.useAuthProxy) {
      const res = await authFetch('/pds/repo/createRecord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, record }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`createRecord failed (${res.status}): ${t}`); }
      return res.json();
    }
    throw new Error('Direct mode does not support writes');
  }

  async deleteRecord(collection: string, rkey: string): Promise<void> {
    if (this.useAuthProxy) {
      const res = await authFetch('/pds/repo/deleteRecord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, rkey }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(`deleteRecord failed (${res.status}): ${t}`); }
      return;
    }
    throw new Error('Direct mode does not support writes');
  }

  /** Read records from any repo (no auth needed). */
  async listRecordsFrom(did: string, collection: string, limit = 100, cursor?: string): Promise<{
    records: Array<{ uri: string; cid: string; value: Record<string, unknown> }>;
    cursor?: string;
  }> {
    const svc = this.useAuthProxy ? await resolvePds(did) : this.service;
    const params = new URLSearchParams({ repo: did, collection, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    const res = await fetch(`${svc}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) throw new Error(`listRecords failed: ${res.status}`);
    return res.json();
  }

  async getRecordFrom(did: string, collection: string, rkey: string): Promise<Record<string, unknown> | null> {
    const svc = this.useAuthProxy ? await resolvePds(did) : this.service;
    const params = new URLSearchParams({ repo: did, collection, rkey });
    const res = await fetch(`${svc}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`getRecord failed: ${res.status}`);
    return res.json();
  }
}
