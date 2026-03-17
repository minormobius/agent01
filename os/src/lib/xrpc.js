// XRPC client — all PDS operations go through here
// Handles auth headers, token refresh, pagination

export class XRPCClient {
  constructor(session) {
    this.pdsUrl = session.pdsUrl;
    this.accessJwt = session.accessJwt;
    this.refreshJwt = session.refreshJwt;
    this.did = session.did;
    this.onSessionRefresh = null;
  }

  async call(nsid, params = {}, { method = 'GET', body = null } = {}) {
    const url = new URL(`/xrpc/${nsid}`, this.pdsUrl);
    if (method === 'GET' && params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const headers = { 'Authorization': `Bearer ${this.accessJwt}` };
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
}

export class XRPCError extends Error {
  constructor(nsid, status, body) {
    super(`${nsid}: ${status} ${body.error || ''} — ${body.message || ''}`);
    this.nsid = nsid;
    this.status = status;
    this.body = body;
  }
}
