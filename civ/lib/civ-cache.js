// civ-cache — a tiny localStorage LRU so a run computed in one view is reused by every other
// view, instead of every viewer re-running the (deterministic) simulation. Runs are keyed by
// their normalized request (world · config · seed · ticks · endpoint), so the dashboard, the
// development table, FRED, and the particle playground all share the same cached payload.
//
//   import { cachedFetch } from './lib/civ-cache.js';
//   const { json, cached } = await cachedFetch('/api/civ/run?' + qs);
//
// Determinism makes this sound: same params ⇒ byte-identical chronicle, so a cache hit is
// indistinguishable from a fresh run. Presets resolve to a `config` token server-side, so on
// every miss we ALSO store the payload under its canonical config-form key — that's what lets a
// preset run on the dashboard satisfy a config-form request from another view with no re-run.

const NS = 'civ:cache:';
const IDX = 'civ:cache:idx';
const BUDGET = 4.6 * 1024 * 1024;   // stay under the ~5 MB localStorage quota

function idxGet() { try { return JSON.parse(localStorage.getItem(IDX) || '[]'); } catch { return []; } }
function idxSet(a) { try { localStorage.setItem(IDX, JSON.stringify(a)); } catch { /* ignore */ } }

function normKey(reqUrl, cfg) {
  // pathname + params in a stable order; optionally swap preset → the resolved config token
  const u = new URL(reqUrl, location.origin), p = u.searchParams;
  if (cfg) { p.delete('preset'); p.set('config', cfg); }
  const keys = [...p.keys()].sort(), sp = new URLSearchParams();
  for (const k of keys) sp.set(k, p.get(k));
  return u.pathname + '?' + sp.toString();
}

function read(key) { try { const s = localStorage.getItem(NS + key); return s ? JSON.parse(s) : null; } catch { return null; } }
function touch(key) { const idx = idxGet(), e = idx.find(x => x.key === key); if (e) { e.ts = Date.now(); idxSet(idx); } }
function write(key, str) {
  try {
    let idx = idxGet().filter(e => e.key !== key);
    let total = idx.reduce((a, e) => a + e.size, 0) + str.length;
    idx.sort((a, b) => a.ts - b.ts);                       // LRU: evict oldest first
    while (total > BUDGET && idx.length) { const ev = idx.shift(); try { localStorage.removeItem(NS + ev.key); } catch { /* */ } total -= ev.size; }
    localStorage.setItem(NS + key, str);
    idx.push({ key, size: str.length, ts: Date.now() }); idxSet(idx);
  } catch { /* quota exceeded → best-effort, skip caching */ }
}

// ---- client-side compute -------------------------------------------------------------------
// The sim is deterministic pure JS, so we run it locally in a module Web Worker (bit-identical to
// the edge) — no Cloudflare CPU limit (no 503), no server round-trip, and the user's machine does
// the work. Falls back to the network API if workers/modules aren't supported or the bundle fails.
let _worker = null, _seq = 0; const _pending = new Map();
function worker() {
  if (_worker === false) return null;                 // previously failed → stay on network
  if (_worker) return _worker;
  try {
    const url = new URL('./civ-worker.js', import.meta.url);
    _worker = new Worker(url, { type: 'module' });
    _worker.onmessage = (e) => { const p = _pending.get(e.data.id); if (!p) return; _pending.delete(e.data.id); e.data.ok ? p.resolve(e.data.json) : p.reject(new Error(e.data.error)); };
    _worker.onerror = () => { for (const p of _pending.values()) p.reject(new Error('worker error')); _pending.clear(); _worker = false; };
    return _worker;
  } catch { _worker = false; return null; }
}
function computeLocal(reqUrl) {
  const w = worker(); if (!w) return Promise.reject(new Error('no worker'));
  const u = new URL(reqUrl, location.origin), id = ++_seq;
  return new Promise((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    const to = setTimeout(() => { if (_pending.has(id)) { _pending.delete(id); reject(new Error('compute timeout')); } }, 120000);
    _pending.get(id).resolve = (j) => { clearTimeout(to); resolve(j); };
    w.postMessage({ id, pathname: u.pathname, qs: u.search.slice(1) });
  });
}

export async function cachedFetch(reqUrl, opts = {}) {
  const rk = normKey(reqUrl);
  const hit = read(rk);
  if (hit) { touch(rk); return { json: hit, cached: true, local: false }; }
  // try local compute first (unless disabled); fall back to the network API
  let str = null, json = null, local = false;
  if (opts.local !== false) {
    try { str = await computeLocal(reqUrl); json = JSON.parse(str); local = true; } catch { str = null; }
  }
  if (!json) {
    const r = await fetch(reqUrl);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + ((await r.json().catch(() => ({}))).detail || ''));
    json = await r.json(); try { str = JSON.stringify(json); } catch { str = null; }
  }
  if (str) { write(rk, str); const ck = json && json.config ? normKey(reqUrl, json.config) : rk; if (ck !== rk) write(ck, str); }
  return { json, cached: false, local };
}

// Clear every cached run (exposed for a "force rerun" affordance).
export function clearCache() {
  for (const e of idxGet()) { try { localStorage.removeItem(NS + e.key); } catch { /* */ } }
  idxSet([]);
}
