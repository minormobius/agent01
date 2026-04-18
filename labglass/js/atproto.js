// ── ATProto Client for LABGLASS ──
// OAuth via shared auth worker at auth.mino.mobi.
// PDS writes proxied through auth worker (DPoP-bound tokens).
// No SDK — plain fetch.

window.LabATProto = (() => {
  const PUBLIC_API = 'https://public.api.bsky.app';
  const AUTH_URL = 'https://auth.mino.mobi';
  const SESSION_KEY = 'mino_auth_session';
  const NOTEBOOK_COLLECTION = 'com.minomobi.labglass.notebook';
  const CELL_COLLECTION = 'com.minomobi.labglass.cell';

  // Cached user info from /api/me
  let authUser = null; // { did, handle, scope }

  // Identity cache: handle → { did }
  const identityCache = {};

  // ── TID generation (timestamp-based record keys) ──
  const B32_CHARS = '234567abcdefghijklmnopqrstuvwxyz';
  let tidClockId = null;

  function generateTid() {
    if (!tidClockId) {
      tidClockId = Math.floor(Math.random() * 1024);
    }
    const micros = BigInt(Date.now()) * 1000n;
    const tid = (micros << 10n) | BigInt(tidClockId);
    tidClockId = (tidClockId + 1) & 0x3ff;
    let s = '';
    let v = tid;
    for (let i = 0; i < 13; i++) {
      s = B32_CHARS[Number(v & 31n)] + s;
      v >>= 5n;
    }
    return s;
  }

  // ── Auth token management ──

  function getToken() { return localStorage.getItem(SESSION_KEY); }
  function saveToken(t) { if (t) localStorage.setItem(SESSION_KEY, t); else localStorage.removeItem(SESSION_KEY); }

  // Pick up session from OAuth redirect or localStorage, validate with auth worker
  async function init() {
    const url = new URL(location.href);
    const token = url.searchParams.get('__auth_session');
    if (token) {
      saveToken(token);
      url.searchParams.delete('__auth_session');
      history.replaceState({}, '', url);
    }
    const t = getToken();
    if (!t) { authUser = null; return null; }
    try {
      const r = await fetch(`${AUTH_URL}/api/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (!r.ok) { saveToken(null); authUser = null; return null; }
      authUser = await r.json();
      return authUser;
    } catch { saveToken(null); authUser = null; return null; }
  }

  // Redirect to Bluesky for OAuth
  async function login(handle) {
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

  function logout() {
    const t = getToken();
    if (t) fetch(`${AUTH_URL}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
    saveToken(null);
    authUser = null;
  }

  function getSession() {
    return authUser;
  }

  function isLoggedIn() {
    return authUser !== null;
  }

  // ── Identity resolution (read-only, no auth needed) ──

  async function resolveHandle(handle) {
    const res = await fetch(
      `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
    );
    if (!res.ok) throw new Error(`Could not resolve handle: ${handle}`);
    const { did } = await res.json();
    return did;
  }

  async function resolveIdentity(handle) {
    if (identityCache[handle]) return identityCache[handle];
    const did = await resolveHandle(handle);
    identityCache[handle] = { did };
    return { did };
  }

  // ── Authenticated PDS requests (proxied through auth worker) ──

  async function pdsRequest(path, opts) {
    const t = getToken();
    if (!t) throw new Error('Not logged in');
    const headers = { Authorization: `Bearer ${t}`, ...opts?.headers };
    const r = await fetch(`${AUTH_URL}${path}`, { method: opts?.method || 'GET', headers, body: opts?.body });
    if (r.status === 401) { saveToken(null); authUser = null; throw new Error('Session expired — please sign in again'); }
    return r;
  }

  // ── Blob upload ──

  async function uploadBlob(blob) {
    const res = await pdsRequest('/pds/repo/uploadBlob', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Blob upload failed (${res.status})`);
    }
    const data = await res.json();
    return data.blob;
  }

  function getBlobUrl(did, cid) {
    return `${AUTH_URL}/pds/sync/getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
  }

  // ── Record CRUD (writes go through auth worker, reads use public API with PDS fallback) ──

  async function createRecord(collection, record) {
    const rkey = generateTid();
    const res = await pdsRequest('/pds/repo/createRecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, rkey, record }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to create record (${res.status})`);
    }
    return res.json();
  }

  async function putRecord(collection, rkey, record) {
    const res = await pdsRequest('/pds/repo/putRecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, rkey, record }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to put record (${res.status})`);
    }
    return res.json();
  }

  async function deleteRecord(collection, rkey) {
    const res = await pdsRequest('/pds/repo/deleteRecord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, rkey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to delete record (${res.status})`);
    }
    return res.json();
  }

  async function getRecord(did, collection, rkey) {
    const params = `repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
    let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!res.ok) {
      // Fallback: resolve PDS directly
      try {
        const r2 = await fetch(`https://plc.directory/${did}`);
        if (r2.ok) {
          const doc = await r2.json();
          const svc = doc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
          if (svc) res = await fetch(`${svc.serviceEndpoint}/xrpc/com.atproto.repo.getRecord?${params}`);
        }
      } catch { /* fall through */ }
      if (!res.ok) throw new Error(`Record not found (${res.status})`);
    }
    return res.json();
  }

  async function listRecords(did, collection, { limit = 50, cursor, reverse = true } = {}) {
    let params = `repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&limit=${limit}`;
    if (reverse) params += '&reverse=true';
    if (cursor) params += `&cursor=${encodeURIComponent(cursor)}`;
    let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) {
      try {
        const r2 = await fetch(`https://plc.directory/${did}`);
        if (r2.ok) {
          const doc = await r2.json();
          const svc = doc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
          if (svc) res = await fetch(`${svc.serviceEndpoint}/xrpc/com.atproto.repo.listRecords?${params}`);
        }
      } catch { /* fall through */ }
      if (!res.ok) throw new Error(`Failed to list records (${res.status})`);
    }
    return res.json();
  }

  // ── Notebook Operations ──

  async function saveNotebook(title, description, cells, tags = []) {
    if (!authUser) throw new Error('Not logged in');
    const now = new Date().toISOString();

    const cellUris = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const cellRecord = {
        cellType: cell.type,
        source: cell.source,
        name: cell.name || `${cell.type}_${i}`,
        createdAt: now,
        position: i,
      };
      if (cell.textOutput && cell.textOutput.length < 100000) {
        cellRecord.textOutput = cell.textOutput;
      }
      if (cell.figureBlob instanceof Blob) {
        const blobRef = await uploadBlob(cell.figureBlob);
        cellRecord.figureBlob = blobRef;
      }
      const result = await createRecord(CELL_COLLECTION, cellRecord);
      cellUris.push(result.uri);
    }

    const notebookRecord = {
      title,
      description: description || '',
      createdAt: now,
      updatedAt: now,
      visibility: 'public',
      cells: cellUris,
    };
    if (tags.length > 0) notebookRecord.tags = tags;

    const result = await createRecord(NOTEBOOK_COLLECTION, notebookRecord);
    return { uri: result.uri, cid: result.cid, cellUris };
  }

  async function loadNotebook(handleOrDid, rkey) {
    let did;
    if (handleOrDid.startsWith('did:')) {
      did = handleOrDid;
    } else {
      const identity = await resolveIdentity(handleOrDid);
      did = identity.did;
    }

    const nbRecord = await getRecord(did, NOTEBOOK_COLLECTION, rkey);
    const notebook = nbRecord.value;

    const cellPromises = (notebook.cells || []).map(async (uri) => {
      const parts = uri.split('/');
      const cellRkey = parts[parts.length - 1];
      const cellDid = parts[2];
      try {
        const cellRecord = await getRecord(cellDid, CELL_COLLECTION, cellRkey);
        return cellRecord.value;
      } catch (err) {
        console.warn(`Failed to load cell ${uri}:`, err);
        return { cellType: 'markdown', source: `*Cell failed to load: ${uri}*`, name: 'error' };
      }
    });

    const cells = await Promise.all(cellPromises);
    return { notebook, cells, uri: nbRecord.uri, cid: nbRecord.cid };
  }

  async function listNotebooks(handle, { limit = 20, cursor } = {}) {
    const { did } = await resolveIdentity(handle);
    const data = await listRecords(did, NOTEBOOK_COLLECTION, { limit, cursor });
    return {
      notebooks: (data.records || []).map(r => ({
        uri: r.uri,
        cid: r.cid,
        rkey: rkeyFromUri(r.uri),
        ...r.value,
      })),
      cursor: data.cursor,
    };
  }

  async function deleteNotebook(rkey) {
    if (!authUser) throw new Error('Not logged in');

    const nbRecord = await getRecord(authUser.did, NOTEBOOK_COLLECTION, rkey);
    const cellUris = nbRecord.value.cells || [];

    for (const uri of cellUris) {
      const cellRkey = rkeyFromUri(uri);
      try {
        await deleteRecord(CELL_COLLECTION, cellRkey);
      } catch (err) {
        console.warn(`Failed to delete cell ${uri}:`, err);
      }
    }

    await deleteRecord(NOTEBOOK_COLLECTION, rkey);
  }

  // ── Helpers ──

  function rkeyFromUri(uri) {
    return uri.split('/').pop();
  }

  return {
    // Auth
    init,
    login,
    logout,
    getSession,
    isLoggedIn,
    // Identity
    resolveIdentity,
    resolveHandle,
    // Notebook ops
    saveNotebook,
    loadNotebook,
    listNotebooks,
    deleteNotebook,
    // Blobs
    uploadBlob,
    getBlobUrl,
    // Low-level
    createRecord,
    putRecord,
    deleteRecord,
    getRecord,
    listRecords,
    // Constants
    NOTEBOOK_COLLECTION,
    CELL_COLLECTION,
  };
})();
