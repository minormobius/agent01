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

export async function fetchCarBytes(pds, did, onProgress, opts = {}) {
  const url = `${pds.replace(/\/$/, '')}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
  const res = await fetch(url, opts.signal ? { signal: opts.signal } : undefined);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`getRepo failed (${res.status}) ${body}`.trim());
  }
  const total = parseInt(res.headers.get('content-length') || '0');
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    if (opts.signal?.aborted) {
      try { reader.cancel(); } catch {}
      throw new DOMException('aborted', 'AbortError');
    }
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
export async function pullProfile(handleInput, onProgress, opts = {}) {
  const progress = onProgress || (() => {});
  const checkAbort = () => { if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError'); };
  progress('Loading parser…');
  await ensureWasm();
  checkAbort();
  progress('Resolving handle…');
  const { did, handle } = await resolveHandle(handleInput);
  checkAbort();

  progress(`Resolved @${handle}. Locating PDS…`);
  const pds = await resolvePds(did);
  const pdsHost = (() => { try { return new URL(pds).hostname; } catch { return pds; } })();
  checkAbort();

  progress(`Downloading repo from ${pdsHost}…`, 0);
  const carBytes = await fetchCarBytes(pds, did, (received, total) => {
    const label = total
      ? `Downloading repo: ${fmtBytes(received)} / ${fmtBytes(total)}`
      : `Downloading repo: ${fmtBytes(received)}`;
    progress(label, total ? received / total : null);
  }, opts);

  progress(`Parsing ${fmtBytes(carBytes.length)} CAR…`, 1);
  // Yield once so the spinner repaints before the WASM call blocks the thread.
  await new Promise(r => setTimeout(r, 0));
  checkAbort();
  const ndjson = await parseCar(carBytes, did);

  const posts = [];
  // Optional sibling collections — extracted in the same scan so we don't
  // pay for a second pass over the (potentially 100 MB+) NDJSON.
  const reposts = opts.includeReposts ? [] : null;
  const likes = opts.includeLikes ? [] : null;
  let lineNum = 0;
  for (const line of ndjson.split('\n')) {
    if (!line) continue;
    lineNum++;
    // Fast pre-filter: only JSON-parse lines we already know we want.
    const isPost = line.includes('"app.bsky.feed.post"');
    const isRepost = reposts && line.includes('"app.bsky.feed.repost"');
    const isLike = likes && line.includes('"app.bsky.feed.like"');
    if (!isPost && !isRepost && !isLike) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.collection === 'app.bsky.feed.post') {
        if (!rec.value || typeof rec.value.text !== 'string') continue;
        posts.push({ uri: rec.uri, rkey: rec.rkey, record: rec.value });
      } else if (reposts && rec.collection === 'app.bsky.feed.repost') {
        const s = rec.value?.subject;
        if (!s?.uri) continue;
        reposts.push({
          uri: rec.uri,
          rkey: rec.rkey,
          subject_uri: s.uri,
          subject_cid: s.cid || null,
          createdAt: rec.value.createdAt || '',
        });
      } else if (likes && rec.collection === 'app.bsky.feed.like') {
        const s = rec.value?.subject;
        if (!s?.uri) continue;
        likes.push({
          uri: rec.uri,
          rkey: rec.rkey,
          subject_uri: s.uri,
          subject_cid: s.cid || null,
          createdAt: rec.value.createdAt || '',
        });
      }
    } catch {}
  }
  progress(`Parsed ${posts.length.toLocaleString()} posts${reposts ? ` · ${reposts.length.toLocaleString()} reposts` : ''}${likes ? ` · ${likes.length.toLocaleString()} likes` : ''} (of ${lineNum.toLocaleString()} records).`, 1);
  const out = { did, handle, posts };
  if (reposts) out.reposts = reposts;
  if (likes) out.likes = likes;
  return out;
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
  if (r.embed) {
    // Image / video / external-link / quote-with-media embeds bring content
    // we can't reproduce in a text-only pipeline, so we drop those posts.
    // PURE quote-record embeds we keep — they're the writer continuing or
    // surfacing a prior thought, not a media attachment, and they participate
    // in thread chains as quote-skeins.
    if (r.embed.$type !== 'app.bsky.embed.record') return false;
  }
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
// Microblog text routinely drops terminal punctuation, which makes naive
// terminal-punctuation counting collapse multi-post threads to "1 sentence
// of 200 words" and tank Flesch by hundreds of points. We compensate by
// treating any line break as a soft sentence end: insert a period before
// each unpunctuated newline, then count terminal-punctuation runs as usual.
// This handles dropped periods at post boundaries AND mid-post paragraph
// breaks in one pass.
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

  // Insert a period before any newline that doesn't already follow terminal
  // punctuation, plus one at the end if missing. Then sentences = count of
  // [.!?] runs (with floor 1 for divide-by-zero safety on unusual input).
  const withSoftBreaks = t.replace(/(\S)\s*\n+/g, (_m, ch) => /[.!?]/.test(ch) ? ch + ' ' : ch + '. ');
  const finalText = /[.!?][\s)\]"'`]*$/.test(withSoftBreaks) ? withSoftBreaks : withSoftBreaks + '.';
  const sentences = (finalText.match(/[.!?]+/g) || []).length || 1;

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
    // A post links to a previous self-authored post via either:
    //   1. reply.parent.uri  — standard reply chain
    //   2. embed.record.uri  — quote chain (quote-skein continuations or
    //      mid-thread self-quotes for visibility)
    // Reply takes precedence when both happen on the same post; both link
    // styles contribute to "high-signal prose" in the same way.
    let parentUri = null;
    if (p.record?.reply?.parent?.uri && byUri.has(p.record.reply.parent.uri)) {
      parentUri = p.record.reply.parent.uri;
    } else if (
      p.record?.embed?.$type === 'app.bsky.embed.record' &&
      p.record.embed.record?.uri &&
      byUri.has(p.record.embed.record.uri)
    ) {
      parentUri = p.record.embed.record.uri;
    }
    if (parentUri) {
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
    reading: readingLevel(fullText),
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

// ---- upload flow --------------------------------------------------------
//
// Lets the analytical surfaces (atlas / lexicon / redact) accept a plain-text
// or markdown upload as an alternative to a Bluesky handle. The document is
// split into "sections" — each becomes a synthetic single-post `thread`, and
// the rest of the pipeline (readingLevel, tokenize, etc.) is untouched.
//
// Section heuristic:
//   1. If the text contains markdown H1/H2 headings, split on those.
//   2. Otherwise, blank-line-separated paragraphs grouped into chunks of
//      ≥ minChars characters each (so atlas's distribution charts have
//      multiple data points and redact has long-enough threads to play).

export function uploadProfile(text, filename = 'upload.txt', opts = {}) {
  const sections = splitIntoSections(text, opts);
  const baseHandle = (filename.replace(/\.[^.]+$/, '') || 'upload').slice(0, 64);
  // Strip path separators in case the browser passes a full path.
  const handle = baseHandle.split(/[\\/]/).pop() || 'upload';
  const did = `did:upload:${handle}`;
  const now = new Date().toISOString();
  const posts = sections.map((s, i) => ({
    uri: `upload://${handle}/${i}`,
    rkey: `s${i}`,
    record: {
      text: s,
      createdAt: now,
    },
  }));
  return { did, handle, posts };
}

export function splitIntoSections(text, { minChars = 500 } = {}) {
  const normalized = (text || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  // Heading-based: prefer H1/H2 boundaries when the document has them.
  if (/^#{1,2}\s+\S/m.test(normalized)) {
    return normalized
      .split(/\n(?=#{1,2}\s+\S)/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Paragraph-grouped: collect blank-line-separated paragraphs into sections
  // of at least minChars. Trailing remainder gets attached to the last section
  // (rather than becoming its own short orphan).
  const paras = normalized.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) return [];
  const sections = [];
  let buf = '';
  for (const p of paras) {
    buf += (buf ? '\n\n' : '') + p;
    if (buf.length >= minChars) {
      sections.push(buf);
      buf = '';
    }
  }
  if (buf) {
    if (sections.length === 0) sections.push(buf);
    else sections[sections.length - 1] += '\n\n' + buf;
  }
  return sections;
}
