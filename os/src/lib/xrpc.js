// XRPC client — all PDS operations go through here
// Handles auth headers, token refresh, pagination

export class XRPCClient {
  constructor(session) {
    this.pdsUrl = session.pdsUrl;
    this.accessJwt = session.accessJwt;
    this.refreshJwt = session.refreshJwt;
    this.did = session.did;
    // OAuth mode (shared auth.mino.mobi session): the browser holds no PDS
    // token. Reads go UNAUTHENTICATED straight to the PDS (repo/sync queries
    // are public); writes route through the auth worker's DPoP-bound /pds/*
    // proxy via the shared AuthClient. Bounded by the granted OAuth scope —
    // arbitrary-collection writes outside it need an app-password session.
    this.authMode = session.authMode || 'pds';
    this.authClient = session.authClient || null;
    this.onSessionRefresh = null;
  }

  async call(nsid, params = {}, { method = 'GET', body = null } = {}) {
    if (this.authMode === 'oauth' && method !== 'GET') {
      return this._oauthProcedure(nsid, body);
    }

    const url = new URL(`/xrpc/${nsid}`, this.pdsUrl);
    if (method === 'GET' && params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const headers = {};
    if (this.accessJwt) headers['Authorization'] = `Bearer ${this.accessJwt}`;
    const opts = { method, headers };

    if (body !== null && method !== 'GET') {
      if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
        headers['Content-Type'] = 'application/octet-stream';
        opts.body = body;
      } else {
        headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }

    let res = await fetch(url.toString(), opts);

    // Token expired — try refresh
    if (res.status === 401 && this.refreshJwt) {
      await this._refresh();
      headers['Authorization'] = `Bearer ${this.accessJwt}`;
      res = await fetch(url.toString(), opts);
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new XRPCError(nsid, res.status, err);
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    if (ct.includes('application/octet-stream')) return res.arrayBuffer();
    return res.text();
  }

  // Paginated iteration — yields each record, handles cursor automatically
  async *paginate(nsid, params = {}, { pageSize = 100 } = {}) {
    let cursor = undefined;
    let total = 0;
    do {
      const res = await this.call(nsid, { ...params, limit: pageSize, cursor });
      const records = res.records || res.blobs || res.repos || [];
      for (const record of records) {
        yield record;
        total++;
      }
      cursor = res.cursor;
    } while (cursor);
    return total;
  }

  async _refresh() {
    const { refreshSession } = await import('../auth/oauth.js');
    const data = await refreshSession(this.pdsUrl, this.refreshJwt);
    this.accessJwt = data.accessJwt;
    this.refreshJwt = data.refreshJwt;
    if (this.onSessionRefresh) this.onSessionRefresh(data);
  }

  // OAuth write path: map the small set of repo procedures the shell uses onto
  // the shared AuthClient's /pds/* proxy. Responses are shaped like the PDS's
  // own, so callers don't care which path served them.
  async _oauthProcedure(nsid, body) {
    const pds = this.authClient?.pds;
    if (!pds) throw new XRPCError(nsid, 401, { error: 'NoSession', message: 'OAuth session missing' });
    try {
      switch (nsid) {
        case 'com.atproto.repo.createRecord':
          return await pds.createRecord(body.collection, body.record);
        case 'com.atproto.repo.putRecord':
          return await pds.putRecord(body.collection, body.rkey, body.record);
        case 'com.atproto.repo.deleteRecord':
          return await pds.deleteRecord(body.collection, body.rkey);
        case 'com.atproto.repo.uploadBlob': {
          const blob = await pds.uploadBlob(body, 'application/octet-stream');
          return { blob };
        }
        default:
          throw new XRPCError(nsid, 403, {
            error: 'AppPasswordRequired',
            message: 'this procedure needs an app-password session (logout, then "use app password instead")',
          });
      }
    } catch (err) {
      if (err instanceof XRPCError) throw err;
      // Scope misses surface here (the proxy refuses writes outside the grant).
      throw new XRPCError(nsid, 403, {
        error: 'ProxyWriteFailed',
        message: `${err.message} — writes outside the OAuth scope need an app-password session`,
      });
    }
  }
}

export class XRPCError extends Error {
  constructor(nsid, status, body) {
    super(`${nsid}: ${status} ${body.error || ''} — ${body.message || ''}`);
    this.nsid = nsid;
    this.status = status;
    this.body = body;
  }
}
