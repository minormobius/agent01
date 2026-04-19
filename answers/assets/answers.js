// Inline PDS client, session management, and Answers helpers.
// No dependencies, pure fetch + WebCrypto.

export const PUBLIC_API = 'https://public.api.bsky.app';
export const PLC = 'https://plc.directory';
export const CONSTELLATION = 'https://constellation.us-east.host.bsky.network';

export const CURATOR_HANDLE = 'minomobi.com';
export const NS = 'com.minomobi.answers';
export const C = {
  question: `${NS}.question`,
  answer: `${NS}.answer`,
  comment: `${NS}.comment`,
  vote: `${NS}.vote`,
  bestAnswer: `${NS}.bestAnswer`,
  category: `${NS}.category`,
};

const SESSION_KEY = 'answers.session';

// ─── Identity ────────────────────────────────────────────────────

export async function resolveHandle(handle) {
  handle = String(handle || '').replace(/^@/, '').trim();
  if (!handle) throw new Error('Handle required');
  const r = await fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!r.ok) throw new Error(`Could not resolve @${handle}`);
  return (await r.json()).did;
}

export async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const r = await fetch(`${PLC}/${did}`);
    if (!r.ok) throw new Error(`Could not resolve ${did}`);
    doc = await r.json();
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length);
    const r = await fetch(`https://${host}/.well-known/did.json`);
    if (!r.ok) throw new Error(`Could not resolve ${did}`);
    doc = await r.json();
  } else throw new Error(`Unsupported DID method: ${did}`);
  const svc = doc.service?.find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error(`No PDS in DID doc for ${did}`);
  return svc.serviceEndpoint;
}

// ─── TID + deterministic rkey ────────────────────────────────────

export function generateTid() {
  const now = BigInt(Date.now()) * 1000n;
  const clock = BigInt(Math.floor(Math.random() * 1024));
  return ((now << 10n) | clock).toString(36).padStart(13, '0');
}

// Deterministic rkey derived from a subject AT-URI. Used for vote + bestAnswer
// so that re-submitting is idempotent (putRecord rewrites, delete removes).
export async function deriveRkey(uri) {
  const bytes = new TextEncoder().encode(uri);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  // Base32 first 13 bytes, lowercase, strip padding — valid ATProto rkey.
  const b32 = base32Encode(new Uint8Array(hash).slice(0, 10));
  return b32.toLowerCase().replace(/=+$/, '');
}

function base32Encode(bytes) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alpha[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) out += alpha[(value << (5 - bits)) & 0x1f];
  return out;
}

// ─── PDS client ──────────────────────────────────────────────────

export class PdsClient {
  constructor(pds, did = null, accessJwt = null, refreshJwt = null) {
    this.pds = pds;
    this.did = did;
    this.accessJwt = accessJwt;
    this.refreshJwt = refreshJwt;
  }

  async login(identifier, password) {
    const r = await fetch(`${this.pds}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (!r.ok) throw new Error(`Login failed: ${await r.text()}`);
    const s = await r.json();
    this.did = s.did;
    this.accessJwt = s.accessJwt;
    this.refreshJwt = s.refreshJwt;
    return { did: s.did, handle: s.handle };
  }

  _auth() {
    if (!this.accessJwt) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${this.accessJwt}` };
  }

  async putRecord(collection, rkey, record) {
    const body = {
      repo: this.did,
      collection,
      rkey,
      record: { $type: collection, ...record },
    };
    const r = await fetch(`${this.pds}/xrpc/com.atproto.repo.putRecord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._auth() },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`putRecord failed: ${await r.text()}`);
    return r.json();
  }

  async createRecord(collection, record, rkey = null) {
    const body = {
      repo: this.did,
      collection,
      record: { $type: collection, ...record },
    };
    if (rkey) body.rkey = rkey;
    const r = await fetch(`${this.pds}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._auth() },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`createRecord failed: ${await r.text()}`);
    return r.json();
  }

  async deleteRecord(collection, rkey) {
    const r = await fetch(`${this.pds}/xrpc/com.atproto.repo.deleteRecord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this._auth() },
      body: JSON.stringify({ repo: this.did, collection, rkey }),
    });
    if (!r.ok) throw new Error(`deleteRecord failed: ${await r.text()}`);
    return r.json();
  }
}

// ─── Public reads (no auth needed) ───────────────────────────────

export async function getRecord(pds, repo, collection, rkey) {
  const params = new URLSearchParams({ repo, collection, rkey });
  const r = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!r.ok) throw new Error(`getRecord failed: ${r.status}`);
  return r.json();
}

export async function listRecords(pds, repo, collection, { limit = 50, cursor = null } = {}) {
  const params = new URLSearchParams({ repo, collection, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const r = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${params}`);
  if (!r.ok) throw new Error(`listRecords failed: ${r.status}`);
  return r.json();
}

export async function resolveAtUri(uri) {
  // at://did-or-handle/collection/rkey  →  { repo, collection, rkey }
  const m = uri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid AT-URI: ${uri}`);
  let [, repo, collection, rkey] = m;
  if (!repo.startsWith('did:')) repo = await resolveHandle(repo);
  return { did: repo, collection, rkey };
}

export async function fetchByAtUri(uri) {
  const { did, collection, rkey } = await resolveAtUri(uri);
  const pds = await resolvePds(did);
  const rec = await getRecord(pds, did, collection, rkey);
  return { ...rec, did, pds };
}

// ─── Constellation backlinks (discovery) ─────────────────────────
// Returns records of `collection` whose `path` (e.g. ".question.uri")
// points at the given subject URI. Used to find answers to a question,
// comments on an answer, and votes/bestAnswer on anything.

export async function getBacklinks(target, collection, path, { limit = 50, cursor = null } = {}) {
  const params = new URLSearchParams({ target, collection, path, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const r = await fetch(`${CONSTELLATION}/links?${params}`);
  if (!r.ok) return { linking_records: [], cursor: null };
  const j = await r.json();
  return { linking_records: j.linking_records || [], cursor: j.cursor || null };
}

// ─── Session storage ─────────────────────────────────────────────

export function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}
export function clearSession() { localStorage.removeItem(SESSION_KEY); }

export async function restoreClient() {
  const s = loadSession();
  if (!s) return null;
  return new PdsClient(s.pds, s.did, s.accessJwt, s.refreshJwt);
}

export async function loginAndStore(handle, password) {
  const did = await resolveHandle(handle);
  const pds = await resolvePds(did);
  const c = new PdsClient(pds);
  const { did: d, handle: h } = await c.login(handle, password);
  saveSession({
    did: d,
    handle: h || handle,
    pds,
    accessJwt: c.accessJwt,
    refreshJwt: c.refreshJwt,
  });
  return c;
}

// ─── Category tree (curator account) ─────────────────────────────

let _categoryCache = null;
export async function fetchCategories() {
  if (_categoryCache) return _categoryCache;
  const did = await resolveHandle(CURATOR_HANDLE);
  const pds = await resolvePds(did);
  const all = [];
  let cursor = null;
  do {
    const page = await listRecords(pds, did, C.category, { limit: 100, cursor });
    all.push(...(page.records || []));
    cursor = page.cursor;
  } while (cursor);

  // Build a tree keyed by rkey (dotted slug)
  const byRkey = {};
  for (const r of all) {
    const rkey = r.uri.split('/').pop();
    byRkey[rkey] = {
      rkey,
      uri: r.uri,
      cid: r.cid,
      name: r.value.name,
      slug: r.value.slug,
      description: r.value.description || '',
      parentUri: r.value.parent?.uri || null,
      children: [],
    };
  }
  const roots = [];
  for (const node of Object.values(byRkey)) {
    if (node.parentUri) {
      const parent = Object.values(byRkey).find((n) => n.uri === node.parentUri);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  _categoryCache = { roots, byRkey, byUri: Object.fromEntries(all.map((r) => [r.uri, byRkey[r.uri.split('/').pop()]])) };
  return _categoryCache;
}

// ─── Helpers ─────────────────────────────────────────────────────

export function nowIso() {
  return new Date().toISOString();
}

export function strongRef(record) {
  return { uri: record.uri, cid: record.cid };
}

export function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function linkify(s) {
  return escapeHtml(s).replace(/\bhttps?:\/\/\S+/g, (u) =>
    `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}

export function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
