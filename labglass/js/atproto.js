// ── ATProto Client for LABGLASS ──
// Handles authentication, identity resolution, and notebook CRUD on PDS.
// No SDK — plain fetch. Credentials live in sessionStorage only.

window.LabATProto = (() => {
  const PUBLIC_API = 'https://public.api.bsky.app';
  const NOTEBOOK_COLLECTION = 'com.minomobi.labglass.notebook';
  const CELL_COLLECTION = 'com.minomobi.labglass.cell';

  // Session state (in-memory only; persisted to sessionStorage)
  let session = null;

  // Identity cache: handle → { did, pds }
  const identityCache = {};

  // ── TID generation (timestamp-based record keys) ──
  // ATProto TIDs: base32-sortable, microsecond timestamp + random clock ID
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

  // ── Identity resolution ──

  async function resolveHandle(handle) {
    const res = await fetch(
      `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
    );
    if (!res.ok) throw new Error(`Could not resolve handle: ${handle}`);
    const { did } = await res.json();
    return did;
  }

  async function resolvePDS(did) {
    let doc;
    if (did.startsWith('did:plc:')) {
      const res = await fetch(`https://plc.directory/${did}`);
      if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
      doc = await res.json();
    } else if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).replaceAll(':', '/');
      const res = await fetch(`https://${host}/.well-known/did.json`);
      if (!res.ok) throw new Error(`Could not resolve DID: ${did}`);
      doc = await res.json();
    } else {
      throw new Error(`Unsupported DID method: ${did}`);
    }
    const svc = doc.service?.find(s => s.type === 'AtprotoPersonalDataServer');
    if (!svc) throw new Error('No PDS endpoint in DID document');
    return svc.serviceEndpoint;
  }

  async function resolveIdentity(handle) {
    if (identityCache[handle]) return identityCache[handle];
    const did = await resolveHandle(handle);
    const pds = await resolvePDS(did);
    identityCache[handle] = { did, pds };
    return { did, pds };
  }

  // ── Authentication ──

  async function login(handle, appPassword) {
    const { did, pds } = await resolveIdentity(handle);
    const res = await fetch(`${pds}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: did, password: appPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Login failed (${res.status})`);
    }
    const data = await res.json();
    session = {
      did: data.did,
      handle: data.handle,
      pds,
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
    };
    sessionStorage.setItem('labglass_session', JSON.stringify(session));
    return session;
  }

  async function refreshSession() {
    if (!session?.refreshJwt) throw new Error('No session to refresh');
    const res = await fetch(`${session.pds}/xrpc/com.atproto.server.refreshSession`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.refreshJwt}` },
    });
    if (!res.ok) {
      logout();
      throw new Error('Session expired — please log in again');
    }
    const data = await res.json();
    session.accessJwt = data.accessJwt;
    session.refreshJwt = data.refreshJwt;
    sessionStorage.setItem('labglass_session', JSON.stringify(session));
    return session;
  }

  function logout() {
    session = null;
    sessionStorage.removeItem('labglass_session');
  }

  function restoreSession() {
    const stored = sessionStorage.getItem('labglass_session');
    if (stored) {
      try {
        session = JSON.parse(stored);
      } catch {
        sessionStorage.removeItem('labglass_session');
      }
    }
    return session;
  }

  function getSession() {
    return session;
  }

  function isLoggedIn() {
    return session !== null;
  }

  // ── Authenticated fetch with auto-refresh ──

  async function authFetch(url, opts = {}) {
    if (!session) throw new Error('Not logged in');
    opts.headers = { ...opts.headers, 'Authorization': `Bearer ${session.accessJwt}` };
    let res = await fetch(url, opts);
    if (res.status === 401) {
      await refreshSession();
      opts.headers['Authorization'] = `Bearer ${session.accessJwt}`;
      res = await fetch(url, opts);
    }
    return res;
  }

  // ── Blob upload ──

  async function uploadBlob(blob) {
    if (!session) throw new Error('Not logged in');
    const res = await authFetch(`${session.pds}/xrpc/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Blob upload failed (${res.status})`);
    }
    const data = await res.json();
    return data.blob; // BlobRef: { ref: { $link: cid }, mimeType, size }
  }

  function getBlobUrl(did, cid, pds) {
    const endpoint = pds || session?.pds;
    if (!endpoint) throw new Error('No PDS endpoint');
    return `${endpoint}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
  }

  // ── Record CRUD ──

  async function createRecord(collection, record) {
    const rkey = generateTid();
    const res = await authFetch(`${session.pds}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: session.did,
        collection,
        rkey,
        record,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to create record (${res.status})`);
    }
    return res.json();
  }

  async function putRecord(collection, rkey, record) {
    const res = await authFetch(`${session.pds}/xrpc/com.atproto.repo.putRecord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: session.did,
        collection,
        rkey,
        record,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to put record (${res.status})`);
    }
    return res.json();
  }

  async function deleteRecord(collection, rkey) {
    const res = await authFetch(`${session.pds}/xrpc/com.atproto.repo.deleteRecord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo: session.did,
        collection,
        rkey,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to delete record (${res.status})`);
    }
    return res.json();
  }

  async function getRecord(did, collection, rkey) {
    const pds = await getPDSForDid(did);
    const params = `repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`;
    let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!res.ok) {
      res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${params}`);
      if (!res.ok) throw new Error(`Record not found (${res.status})`);
    }
    return res.json();
  }

  async function listRecords(did, collection, { limit = 50, cursor, reverse = true } = {}) {
    const pds = await getPDSForDid(did);
    let params = `repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&limit=${limit}`;
    if (reverse) params += '&reverse=true';
    if (cursor) params += `&cursor=${encodeURIComponent(cursor)}`;
    let res = await fetch(`${PUBLIC_API}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!res.ok) {
      res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`);
      if (!res.ok) throw new Error(`Failed to list records (${res.status})`);
    }
    return res.json();
  }

  async function getPDSForDid(did) {
    // Check if we already know it from a cached identity
    for (const key of Object.keys(identityCache)) {
      if (identityCache[key].did === did) return identityCache[key].pds;
    }
    // If it's the logged-in user
    if (session?.did === did) return session.pds;
    // Otherwise resolve
    return resolvePDS(did);
  }

  // ── Notebook Operations ──

  // Save current notebook to PDS. Creates cell records first, then the notebook envelope.
  async function saveNotebook(title, description, cells, tags = []) {
    if (!session) throw new Error('Not logged in');
    const now = new Date().toISOString();

    // Create cell records
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
      // Include text output if present and small enough
      if (cell.textOutput && cell.textOutput.length < 100000) {
        cellRecord.textOutput = cell.textOutput;
      }
      // Upload figure blob if present (Blob or File object from canvas capture)
      if (cell.figureBlob instanceof Blob) {
        const blobRef = await uploadBlob(cell.figureBlob);
        cellRecord.figureBlob = blobRef;
      }
      const result = await createRecord(CELL_COLLECTION, cellRecord);
      cellUris.push(result.uri);
    }

    // Create notebook envelope
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

  // Load a notebook from any user's PDS.
  // Returns { notebook, cells } where cells are in display order.
  async function loadNotebook(handleOrDid, rkey) {
    let did;
    if (handleOrDid.startsWith('did:')) {
      did = handleOrDid;
    } else {
      const identity = await resolveIdentity(handleOrDid);
      did = identity.did;
    }

    // Fetch notebook record
    const nbRecord = await getRecord(did, NOTEBOOK_COLLECTION, rkey);
    const notebook = nbRecord.value;

    // Fetch all cell records in parallel
    const cellPromises = (notebook.cells || []).map(async (uri) => {
      const parts = uri.split('/');
      const cellRkey = parts[parts.length - 1];
      const cellDid = parts[2]; // at://did:plc:xxx/collection/rkey
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

  // List notebooks from a user's PDS.
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

  // Delete a notebook and its cells from the logged-in user's PDS.
  async function deleteNotebook(rkey) {
    if (!session) throw new Error('Not logged in');

    // First fetch the notebook to get cell URIs
    const nbRecord = await getRecord(session.did, NOTEBOOK_COLLECTION, rkey);
    const cellUris = nbRecord.value.cells || [];

    // Delete all cells
    for (const uri of cellUris) {
      const cellRkey = rkeyFromUri(uri);
      try {
        await deleteRecord(CELL_COLLECTION, cellRkey);
      } catch (err) {
        console.warn(`Failed to delete cell ${uri}:`, err);
      }
    }

    // Delete the notebook envelope
    await deleteRecord(NOTEBOOK_COLLECTION, rkey);
  }

  // ── Helpers ──

  function rkeyFromUri(uri) {
    return uri.split('/').pop();
  }

  return {
    // Auth
    login,
    logout,
    restoreSession,
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
