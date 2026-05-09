// rite/lib/atproto — shared browser-side helpers for ATProto.
//
// Used by rite/redact/ and rite/ask/ (and any future no-build static site
// that lives under rite/). Pure ES module; no build step. Imports the
// vendored Rust→WASM CAR parser from ./wasm/.
//
// Repo-wide packages/ would be the canonical home but the Cloudflare ASSETS
// binding for rite serves only rite/, so cross-project imports break in the
// browser. This rite-local lib fills that gap.
//
// Exports:
//   resolveHandle(rawHandle) -> { did, handle }
//   resolvePds(did)          -> serviceEndpoint
//   fetchCarBytes(pds, did, onProgress) -> Uint8Array
//   parseCar(carBytes, did)  -> NDJSON string (loads WASM lazily)
//   pullProfile(handleInput, onProgress) -> { did, handle, posts: [] }
//   isProse(post), buildThreadChains(posts), composeThread(chain, idx, opts)
//   analyzeProfile(posts, opts) -> threads[] (sorted desc by length)

import init, { parseCarToNdjson } from './wasm/pds_car_parser.js';

const PUBLIC_API = 'https://api.bsky.app';
const PLC_DIR    = 'https://plc.directory';

let wasmReady = false;
async function ensureWasm() {
  if (wasmReady) return;
  // Resolve relative to this module's URL so callers can sit in any depth.
  const wasmUrl = new URL('./wasm/pds_car_parser_bg.wasm', import.meta.url);
  await init(wasmUrl);
  wasmReady = true;
}

// ---- identity ------------------------------------------------------------

export async function resolveHandle(rawHandle) {
  const handle = String(rawHandle || '').replace(/^@/, '').trim().toLowerCase();
  if (!handle) throw new Error('Empty handle.');
  const res = await fetch(
    `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Could not resolve @${handle}. ${body || ''}`.trim());
  }
  const { did } = await res.json();
  return { did, handle };
}

export async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`${PLC_DIR}/${did}`);
    if (!res.ok) throw new Error(`PLC lookup failed (${res.status}) for ${did}`);
    doc = await res.json();
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replace(/:/g, '/');
    const res = await fetch(`https://${host}/.well-known/did.json`);
    if (!res.ok) throw new Error(`did:web lookup failed (${res.status}) for ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }
  for (const svc of doc.service || []) {
    if (svc.id === '#atproto_pds' || svc.type === 'AtprotoPersonalDataServer') {
      return svc.serviceEndpoint;
    }
  }
  throw new Error(`No PDS endpoint in DID document for ${did}`);
}

// ---- CAR fetch + parse ---------------------------------------------------

export async function fetchCarBytes(pds, did, onProgress) {
  const url = `${pds.replace(/\/$/, '')}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`getRepo failed (${res.status}) ${body}`.trim());
  }
  const total = parseInt(res.headers.get('content-length') || '0');
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) onProgress(received, total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

export async function parseCar(carBytes, did) {
  await ensureWasm();
  return parseCarToNdjson(carBytes, did);
}

// One-shot: handle -> { did, handle, posts }. Posts are app.bsky.feed.post
// records only, with shape { uri, rkey, record }.
export async function pullProfile(handleInput, onProgress) {
  const progress = onProgress || (() => {});
  progress('Loading parser…');
  await ensureWasm();
  progress('Resolving handle…');
  const { did, handle } = await resolveHandle(handleInput);

  progress(`Resolved @${handle}. Locating PDS…`);
  const pds = await resolvePds(did);
  const pdsHost = (() => { try { return new URL(pds).hostname; } catch { return pds; } })();

  progress(`Downloading repo from ${pdsHost}…`, 0);
  const carBytes = await fetchCarBytes(pds, did, (received, total) => {
    const label = total
      ? `Downloading repo: ${fmtBytes(received)} / ${fmtBytes(total)}`
      : `Downloading repo: ${fmtBytes(received)}`;
    progress(label, total ? received / total : null);
  });

  progress(`Parsing ${fmtBytes(carBytes.length)} CAR…`, 1);
  // Yield once so the spinner repaints before the WASM call blocks the thread.
  await new Promise(r => setTimeout(r, 0));
  const ndjson = await parseCar(carBytes, did);

  const posts = [];
  let lineNum = 0;
  for (const line of ndjson.split('\n')) {
    if (!line) continue;
    lineNum++;
    if (!line.includes('"app.bsky.feed.post"')) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.collection !== 'app.bsky.feed.post') continue;
      if (!rec.value || typeof rec.value.text !== 'string') continue;
      posts.push({ uri: rec.uri, rkey: rec.rkey, record: rec.value });
    } catch {}
  }
  progress(`Parsed ${posts.length.toLocaleString()} posts (of ${lineNum.toLocaleString()} records).`, 1);
  return { did, handle, posts };
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

// ---- prose filter --------------------------------------------------------

export function isProse(post) {
  const r = post.record;
  if (!r || typeof r.text !== 'string') return false;
  if (r.embed) return false;
  if (r.facets) {
    for (const f of r.facets) {
      for (const feat of (f.features || [])) {
        if (feat.$type === 'app.bsky.richtext.facet#link') return false;
        if (feat.$type === 'app.bsky.richtext.facet#tag')  return false;
      }
    }
  }
  return true;
}

// ---- thread building -----------------------------------------------------

// Deterministic reading-level scoring. No inference; just the standard formulas
// over word/sentence/syllable counts.
//   - Flesch reading-ease:        higher = easier (typical 30 = college, 70 = standard)
//   - Flesch-Kincaid grade level: approximate US grade, e.g. 8.0 = 8th grade
//   - complex_word_ratio:         fraction of words with ≥ 3 syllables
//
// Syllable counting uses the long-standing heuristic (strip silent ed/es/e,
// drop leading y, count vowel-runs). It over-counts acronyms and under-counts
// some -ed-ending words; close enough at the thread level.
export function readingLevel(text) {
  const empty = { words: 0, sentences: 0, syllables: 0, flesch: 0, grade: 0, complex_word_ratio: 0 };
  const t = (text || '').trim();
  if (!t) return empty;
  const wordTokens = t.match(/\S+/g) || [];
  const words = wordTokens.length;
  if (!words) return empty;
  // Sentence-ish: terminal punctuation runs. Threads often end without one,
  // so floor at 1 to avoid divide-by-zero blowing up Flesch.
  const sentences = (t.match(/[.!?]+/g) || []).length || 1;

  let syllables = 0;
  let complex = 0;
  for (const w of wordTokens) {
    const s = countSyllables(w);
    syllables += s;
    if (s >= 3) complex++;
  }

  const wps = words / sentences;
  const spw = syllables / words;
  const flesch = 206.835 - 1.015 * wps - 84.6 * spw;
  const grade  = 0.39 * wps + 11.8 * spw - 15.59;

  return {
    words, sentences, syllables,
    flesch: round1(flesch),
    grade: round1(grade),
    complex_word_ratio: round3(complex / words),
  };
}

function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = stripped.match(/[aeiouy]+/g);
  return m ? m.length : 1;
}

function round1(n) { return Math.round(n * 10) / 10; }
function round3(n) { return Math.round(n * 1000) / 1000; }

// Map a Flesch score to a coarse difficulty tier. Useful for chart coloring.
//   hard    : Flesch < 50  (college and up)
//   medium  : 50 ≤ Flesch < 70  (high school to standard)
//   easy    : Flesch ≥ 70  (broadly accessible)
export function fleschTier(flesch) {
  if (flesch == null || isNaN(flesch)) return 'medium';
  if (flesch < 50) return 'hard';
  if (flesch < 70) return 'medium';
  return 'easy';
}

export function buildThreadChains(posts) {
  const byUri = new Map();
  for (const p of posts) byUri.set(p.uri, p);

  const parentOf = new Map();
  const childrenOf = new Map();
  for (const p of posts) {
    const parentUri = p.record?.reply?.parent?.uri;
    if (parentUri && byUri.has(parentUri)) {
      parentOf.set(p.uri, parentUri);
      const arr = childrenOf.get(parentUri) || [];
      arr.push(p.uri);
      childrenOf.set(parentUri, arr);
    }
  }

  const roots = posts.filter(p => !parentOf.has(p.uri));
  const memo = new Map();
  function longestPathFrom(uri) {
    if (memo.has(uri)) return memo.get(uri);
    const kids = childrenOf.get(uri) || [];
    if (!kids.length) {
      const path = [byUri.get(uri)];
      memo.set(uri, path);
      return path;
    }
    let best = [];
    for (const k of kids) {
      const sub = longestPathFrom(k);
      if (sub.length > best.length) best = sub;
    }
    const path = [byUri.get(uri), ...best];
    memo.set(uri, path);
    return path;
  }
  return roots.map(r => longestPathFrom(r.uri));
}

export function composeThread(chain, idx, { minChars = 300 } = {}) {
  const proseChain = chain.filter(isProse);
  if (!proseChain.length) return null;
  const textBlocks = proseChain.map(p => (p.record.text || '').trim()).filter(Boolean);
  const total = textBlocks.reduce((a, b) => a + b.length, 0);
  if (total < minChars) return null;
  const root = proseChain[0];
  const fullText = textBlocks.join('\n\n');
  return {
    id: `t${idx}`,                            // sortable, ephemeral
    threadId: root.rkey || root.uri,          // stable across re-indexings
    posts: proseChain,
    text: fullText,
    textBlocks,
    totalChars: total,
    postCount: proseChain.length,
    createdAt: root.record.createdAt || '',
    rootUri: root.uri,
    reading: readingLevel(textBlocks.join(' ')),
  };
}

export function analyzeProfile(posts, opts = {}) {
  const chains = buildThreadChains(posts);
  const threads = [];
  let next = 0;
  for (const c of chains) {
    const t = composeThread(c, next, opts);
    if (t) { threads.push(t); next++; }
  }
  threads.sort((a, b) => b.totalChars - a.totalChars);
  threads.forEach((t, i) => t.id = `t${i}`);
  return threads;
}
