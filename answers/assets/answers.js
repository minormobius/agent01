// Answers client: OAuth via shared auth.mino.mobi worker, PDS writes via its proxy,
// public reads direct against PDS + Constellation.

export const PUBLIC_API = 'https://public.api.bsky.app';
export const PLC = 'https://plc.directory';
export const CONSTELLATION = 'https://constellation.microcosm.blue';
export const AUTH_URL = 'https://auth.mino.mobi';

export const CURATOR_HANDLE = 'minomobi.bsky.social';
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
const TOKEN_QS = '__auth_session';

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

export async function deriveRkey(uri) {
  const bytes = new TextEncoder().encode(uri);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return base32Encode(new Uint8Array(hash).slice(0, 10)).toLowerCase().replace(/=+$/, '');
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

// ─── OAuth session (via auth.mino.mobi) ──────────────────────────

export function getToken() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')?.token || null; }
  catch { return null; }
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}

function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

/** Consume ?__auth_session= from the URL, hydrate /api/me, cache session. Call once on page load. */
export async function authInit() {
  const url = new URL(location.href);
  const fresh = url.searchParams.get(TOKEN_QS);
  if (fresh) {
    url.searchParams.delete(TOKEN_QS);
    history.replaceState({}, '', url);
    saveSession({ token: fresh });
  }
  const existing = getSession();
  if (!existing?.token) return null;

  // Hydrate identity from /api/me and resolve PDS once per session.
  if (!existing.did || !existing.pds) {
    try {
      const r = await fetch(`${AUTH_URL}/api/me`, {
        headers: { Authorization: `Bearer ${existing.token}` },
      });
      if (!r.ok) { saveSession(null); return null; }
      const me = await r.json();
      const pds = await resolvePds(me.did).catch(() => null);
      const merged = { token: existing.token, did: me.did, handle: me.handle, scope: me.scope, pds };
      saveSession(merged);
      return merged;
    } catch {
      saveSession(null);
      return null;
    }
  }
  return existing;
}

export async function authLogin(handle) {
  const clean = String(handle || '').replace(/^@/, '').trim();
  if (!clean) throw new Error('Handle required');
  const r = await fetch(`${AUTH_URL}/oauth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: clean, origin: location.origin, returnTo: location.href }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `Login failed (${r.status})`);
  }
  const { authUrl } = await r.json();
  location.href = authUrl;
}

export async function authLogout() {
  const t = getToken();
  if (t) {
    try { await fetch(`${AUTH_URL}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${t}` } }); }
    catch {}
  }
  saveSession(null);
}

// ─── Proxied PDS writes (DPoP handled server-side) ───────────────

async function pdsProxy(path, opts = {}) {
  const t = getToken();
  if (!t) throw new Error('Not signed in');
  const headers = { Authorization: `Bearer ${t}`, ...(opts.headers || {}) };
  const r = await fetch(`${AUTH_URL}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body,
  });
  if (r.status === 401) { saveSession(null); throw new Error('Session expired — sign in again'); }
  return r;
}

async function pdsProxyJson(path, payload) {
  const r = await pdsProxy(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Request failed (${r.status})`);
  }
  return r.json();
}

export async function pdsCreateRecord(collection, record, rkey) {
  const payload = { collection, record: { $type: collection, ...record } };
  if (rkey) payload.rkey = rkey;
  return pdsProxyJson('/pds/repo/createRecord', payload);
}

export async function pdsPutRecord(collection, rkey, record) {
  return pdsProxyJson('/pds/repo/putRecord', {
    collection, rkey, record: { $type: collection, ...record },
  });
}

export async function pdsDeleteRecord(collection, rkey) {
  return pdsProxyJson('/pds/repo/deleteRecord', { collection, rkey });
}

// ─── Public reads ────────────────────────────────────────────────

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

// ─── Constellation backlinks + record hydration ──────────────────

// Constellation /links returns {did, collection, rkey} per linker — NOT
// the full record. To display anything (vote direction, comment text,
// answer body) we have to fetch the actual record from each author's PDS.

const _pdsCache = {};
export async function pdsFor(did) {
  if (_pdsCache[did]) return _pdsCache[did];
  _pdsCache[did] = resolvePds(did);
  return _pdsCache[did];
}

const _recordCache = {};
export async function fetchRecord(did, collection, rkey) {
  const uri = `at://${did}/${collection}/${rkey}`;
  if (_recordCache[uri]) return _recordCache[uri];
  const pds = await pdsFor(did);
  const r = await getRecord(pds, did, collection, rkey);
  const wrapped = { uri, cid: r.cid, value: r.value };
  _recordCache[uri] = wrapped;
  return wrapped;
}

export function invalidateRecord(uri) { delete _recordCache[uri]; }

export async function getBacklinks(target, collection, path, { limit = 50, cursor = null } = {}) {
  const params = new URLSearchParams({ target, collection, path, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const r = await fetch(`${CONSTELLATION}/links?${params}`);
  if (!r.ok) return { total: 0, linking_records: [], cursor: null };
  const j = await r.json();
  return { total: j.total || 0, linking_records: j.linking_records || [], cursor: j.cursor || null };
}

/** Fast path for counts only (no record values). */
export async function countBacklinks(target, collection, path) {
  const params = new URLSearchParams({ target, collection, path });
  const r = await fetch(`${CONSTELLATION}/links/count?${params}`);
  if (!r.ok) return 0;
  return (await r.json()).total || 0;
}

/** Backlinks hydrated to {uri, cid, value} via per-PDS getRecord calls. */
export async function getBacklinksFull(target, collection, path, opts = {}) {
  const bl = await getBacklinks(target, collection, path, opts);
  const records = await Promise.all(
    (bl.linking_records || []).map((b) =>
      fetchRecord(b.did, b.collection, b.rkey).catch(() => null)
    )
  );
  return { records: records.filter(Boolean), cursor: bl.cursor || null, total: bl.total };
}

// ─── Category tree (from curator account) ────────────────────────

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
  _categoryCache = { roots, byRkey };
  return _categoryCache;
}

// ─── Handle typeahead (Bluesky search) ───────────────────────────

export async function searchActors(query, limit = 8) {
  const q = String(query || '').replace(/^@/, '').trim();
  if (q.length < 2) return [];
  try {
    const r = await fetch(
      `${PUBLIC_API}/xrpc/app.bsky.actor.searchActorsTypeahead?q=${encodeURIComponent(q)}&limit=${limit}`
    );
    if (!r.ok) return [];
    const j = await r.json();
    return j.actors || [];
  } catch { return []; }
}

/** Attach a typeahead dropdown to an <input> for Bluesky handles.
 *  Renders a styled list below the input; click or arrow+enter to select. */
export function attachHandleTypeahead(input) {
  if (!input || input.dataset.typeaheadAttached) return;
  input.dataset.typeaheadAttached = '1';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocapitalize', 'none');
  input.setAttribute('spellcheck', 'false');

  // Wrap the input so the dropdown can position relative to it.
  const wrap = document.createElement('div');
  wrap.style.position = 'relative';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const dd = document.createElement('div');
  dd.className = 'typeahead';
  dd.hidden = true;
  wrap.appendChild(dd);

  let timer = null;
  let activeIdx = -1;
  let lastResults = [];

  function render(results) {
    lastResults = results;
    activeIdx = -1;
    if (!results.length) { dd.hidden = true; return; }
    dd.innerHTML = results.map((a, i) => {
      const dn = a.displayName ? `<span class="ta-name">${escapeHtml(a.displayName)}</span>` : '';
      const av = a.avatar ? `<img class="ta-av" src="${escapeHtml(a.avatar)}" alt="" />` : '<span class="ta-av ta-av-blank"></span>';
      return `<div class="ta-row" data-i="${i}">${av}<div><div class="ta-handle">@${escapeHtml(a.handle)}</div>${dn}</div></div>`;
    }).join('');
    dd.hidden = false;
    dd.querySelectorAll('.ta-row').forEach((row) => {
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        select(parseInt(row.dataset.i, 10));
      });
    });
  }

  function select(idx) {
    const a = lastResults[idx];
    if (!a) return;
    input.value = a.handle;
    dd.hidden = true;
  }

  function highlight(idx) {
    activeIdx = idx;
    dd.querySelectorAll('.ta-row').forEach((r, i) => r.classList.toggle('active', i === idx));
  }

  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const results = await searchActors(input.value, 6);
      render(results);
    }, 180);
  });

  input.addEventListener('keydown', (e) => {
    if (dd.hidden || !lastResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight((activeIdx + 1) % lastResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight((activeIdx - 1 + lastResults.length) % lastResults.length);
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      select(activeIdx);
    } else if (e.key === 'Escape') {
      dd.hidden = true;
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => { dd.hidden = true; }, 150);
  });
  input.addEventListener('focus', () => {
    if (lastResults.length) dd.hidden = false;
  });
}

// ─── Helpers ─────────────────────────────────────────────────────

export function nowIso() { return new Date().toISOString(); }
export function strongRef(record) { return { uri: record.uri, cid: record.cid }; }

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
