/**
 * ATProto integration layer.
 *
 * Provides a publisher abstraction for writing records to a service-controlled
 * ATProto repo. Includes both a real PDS publisher and a mock for local dev.
 *
 * IMPORTANT: Ballot records are published from the SERVICE repo, not responder repos.
 * Responder identity must never appear in public ballot records.
 */

export interface AtprotoRecord {
  $type: string;
  [key: string]: unknown;
}

export interface PublishResult {
  uri: string;
  cid: string;
}

export interface AtprotoPublisher {
  /** Create a record in the service repo */
  createRecord(collection: string, rkey: string, record: AtprotoRecord): Promise<PublishResult>;
  /** Delete a record from the service repo */
  deleteRecord(collection: string, rkey: string): Promise<void>;
  /** List records of a given type from the service repo */
  listRecords(collection: string, limit?: number, cursor?: string): Promise<{
    records: Array<{ uri: string; cid: string; value: AtprotoRecord }>;
    cursor?: string;
  }>;
}

/**
 * Real PDS publisher that authenticates as the service account.
 */
export class PdsPublisher implements AtprotoPublisher {
  private serviceUrl: string;
  private did: string;
  private accessJwt: string | null = null;
  private refreshJwt: string | null = null;
  private handle: string;
  private password: string;

  constructor(opts: {
    serviceUrl: string;
    handle: string;
    password: string;
    did: string;
  }) {
    this.serviceUrl = opts.serviceUrl;
    this.handle = opts.handle;
    this.password = opts.password;
    this.did = opts.did;
  }

  private async authenticate(): Promise<void> {
    const res = await fetch(`${this.serviceUrl}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: this.handle,
        password: this.password,
      }),
    });
    if (!res.ok) {
      throw new Error(`ATProto auth failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json() as { accessJwt: string; refreshJwt: string; did: string };
    this.accessJwt = data.accessJwt;
    this.refreshJwt = data.refreshJwt;
    this.did = data.did;
  }

  private async getToken(): Promise<string> {
    if (!this.accessJwt) {
      await this.authenticate();
    }
    return this.accessJwt!;
  }

  async createRecord(collection: string, rkey: string, record: AtprotoRecord): Promise<PublishResult> {
    const token = await this.getToken();
    const res = await fetch(`${this.serviceUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        repo: this.did,
        collection,
        rkey,
        record,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401) {
        // Token expired, re-auth and retry once
        await this.authenticate();
        return this.createRecord(collection, rkey, record);
      }
      throw new Error(`createRecord failed: ${res.status} ${text}`);
    }
    const data = await res.json() as { uri: string; cid: string };
    return { uri: data.uri, cid: data.cid };
  }

  async deleteRecord(collection: string, rkey: string): Promise<void> {
    const token = await this.getToken();
    const res = await fetch(`${this.serviceUrl}/xrpc/com.atproto.repo.deleteRecord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        repo: this.did,
        collection,
        rkey,
      }),
    });
    if (!res.ok && res.status !== 401) {
      throw new Error(`deleteRecord failed: ${res.status}`);
    }
  }

  async listRecords(collection: string, limit = 100, cursor?: string): Promise<{
    records: Array<{ uri: string; cid: string; value: AtprotoRecord }>;
    cursor?: string;
  }> {
    const token = await this.getToken();
    const params = new URLSearchParams({
      repo: this.did,
      collection,
      limit: String(limit),
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(
      `${this.serviceUrl}/xrpc/com.atproto.repo.listRecords?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new Error(`listRecords failed: ${res.status}`);
    }
    return res.json() as any;
  }
}

/**
 * Mock publisher for local development.
 * Stores records in memory. No PDS required.
 */
export class MockPublisher implements AtprotoPublisher {
  private records = new Map<string, Map<string, { uri: string; cid: string; value: AtprotoRecord }>>();

  async createRecord(collection: string, rkey: string, record: AtprotoRecord): Promise<PublishResult> {
    if (!this.records.has(collection)) {
      this.records.set(collection, new Map());
    }
    const uri = `at://did:plc:mock/${collection}/${rkey}`;
    const cid = `bafyrei${rkey.slice(0, 32).padEnd(32, '0')}`;
    this.records.get(collection)!.set(rkey, { uri, cid, value: record });
    return { uri, cid };
  }

  async deleteRecord(collection: string, rkey: string): Promise<void> {
    this.records.get(collection)?.delete(rkey);
  }

  async listRecords(collection: string, limit = 100): Promise<{
    records: Array<{ uri: string; cid: string; value: AtprotoRecord }>;
    cursor?: string;
  }> {
    const coll = this.records.get(collection);
    if (!coll) return { records: [] };
    const records = Array.from(coll.values()).slice(0, limit);
    return { records };
  }

  /** Test helper: get all records */
  getAll(): Map<string, Map<string, { uri: string; cid: string; value: AtprotoRecord }>> {
    return this.records;
  }
}
