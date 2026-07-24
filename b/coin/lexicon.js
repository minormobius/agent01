// coin/lexicon.js — your personal vocabulary, every word you have ever posted.
//
// This is what makes "contains a word you have never used before" possible, and
// the shape of it is the whole trick: the expensive part happens ONCE. Download
// your repository as a CAR, walk every post you have ever written, reduce it to a
// set of words, and cache that set. After that the rule is a Set lookup — free on
// every keystroke, no network, no per-check latency.
//
// The set is kept in IndexedDB per DID, and words you post are folded in
// immediately, so the moment you spend a word it stops counting as new. That
// matters: without it you could post the same "new" word ten times.

const CAR_DB = 'coin-lexicon', STORE = 'repos';
const TTL = 7 * 24 * 60 * 60 * 1000;     // a week; new posts are folded in live
const MIN_LEN = 3;                        // 1–2 letter tokens are noise, not vocabulary

export function lexWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.-]+/g, ' ')
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w.length >= MIN_LEN);
}

// ── storage ──────────────────────────────────────────────────────────────────
function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(CAR_DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function get(did) {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(did);
      t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
    });
  } catch { return null; }
}
async function put(did, value) {
  try {
    const db = await idb();
    await new Promise((res, rej) => {
      const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, did);
      t.onsuccess = () => res(); t.onerror = () => rej(t.error);
    });
  } catch { /* cache is a nicety */ }
}

// ── the CAR parser (staged into /lib/atproto at deploy; module-relative) ────
let _parser = null;
function loadParser() {
  if (_parser) return _parser;
  _parser = (async () => {
    const mod = await import('../lib/atproto/wasm/pds_car_parser.js');
    const url = new URL('../lib/atproto/wasm/pds_car_parser_bg.wasm', import.meta.url);
    let bytes;
    if (url.protocol === 'file:') {
      const { readFile } = await import('node:fs/promises');   // node only
      bytes = await readFile(url);
    } else bytes = await (await fetch(url)).arrayBuffer();
    await mod.default({ module_or_path: bytes });
    return mod.parseCarToNdjson;
  })();
  return _parser;
}
async function resolvePds(did) {
  const r = await fetch(did.startsWith('did:plc:')
    ? `https://plc.directory/${did}`
    : `https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`);
  if (!r.ok) throw new Error('could not resolve your PDS');
  const doc = await r.json();
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds');
  if (!svc) throw new Error('no PDS in your DID document');
  return svc.serviceEndpoint;
}
const fmt = (n) => (n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

/**
 * Your vocabulary. Cached; pass {force:true} to rebuild.
 * @returns {Promise<{words: Set<string>, posts: number, at: number, cached: boolean}>}
 */
export async function getLexicon(did, onStage, opts = {}) {
  if (!opts.force) {
    const hit = await get(did);
    if (hit && (Date.now() - hit.at) < TTL) {
      return { words: new Set(hit.words), posts: hit.posts, at: hit.at, cached: true };
    }
  }
  const parse = await loadParser();
  const pds = await resolvePds(did);
  if (onStage) onStage('downloading everything you have ever posted…');

  const res = await fetch(`${pds.replace(/\/$/, '')}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`);
  if (!res.ok) throw new Error(`could not read your repo (${res.status})`);
  const total = parseInt(res.headers.get('content-length') || '0', 10);
  const reader = res.body.getReader();
  const chunks = []; let n = 0, tick = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); n += value.length;
    if (onStage && n - tick > 262144) { tick = n; onStage(`downloading your repo… ${fmt(n)}${total ? ' / ' + fmt(total) : ''}`); }
  }
  const bytes = new Uint8Array(n);
  let off = 0; for (const c of chunks) { bytes.set(c, off); off += c.length; }

  if (onStage) onStage(`reading ${fmt(n)} of history…`);
  await new Promise((r) => setTimeout(r, 0));            // let the status paint
  const ndjson = parse(bytes, did);

  const words = new Set();
  let posts = 0;
  for (const line of ndjson.split('\n')) {
    if (!line || !line.includes('"app.bsky.feed.post"')) continue;
    let rec; try { rec = JSON.parse(line); } catch { continue; }
    if (rec.collection !== 'app.bsky.feed.post') continue;
    const t = rec.value && rec.value.text;
    if (typeof t !== 'string') continue;
    posts++;
    for (const w of lexWords(t)) words.add(w);
  }
  const at = Date.now();
  await put(did, { at, posts, words: [...words] });
  if (onStage) onStage(`${words.size.toLocaleString()} distinct words across ${posts.toLocaleString()} posts`);
  return { words, posts, at, cached: false };
}

/** Fold newly-posted words in, so a word stops being new the moment you spend it. */
export async function addWords(did, texts) {
  const hit = await get(did);
  if (!hit) return;
  const set = new Set(hit.words);
  let added = 0;
  for (const t of texts) for (const w of lexWords(t)) if (!set.has(w)) { set.add(w); added++; }
  if (!added) return;
  await put(did, { at: hit.at, posts: hit.posts + texts.length, words: [...set] });
}

/** Wipe the cached vocabulary (used by "rebuild"). */
export async function forget(did) {
  try {
    const db = await idb();
    await new Promise((res) => {
      const t = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(did);
      t.onsuccess = () => res(); t.onerror = () => res();
    });
  } catch { /* no-op */ }
}
