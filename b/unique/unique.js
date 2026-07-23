// /api/unique/* — "hapax" finder. For a Bluesky handle, harvests every bigram
// and trigram from their own posts, keeps only the ones they used EXACTLY ONCE
// (the free pre-filter — a phrase they repeated themselves is already ≥2 uses on
// the network, so it can never be globally unique), then verifies each survivor
// against Bluesky full-text search to surface the phrases used exactly once on
// the whole platform. Read-only public data, no auth on the caller's side.
//
// Two endpoints, so the browser can orchestrate + paginate + cancel:
//   POST /api/unique/scan   {handle, mode?}  -> candidate n-grams (JSON)
//   POST /api/unique/search {candidates,did?} -> per-phrase verdicts (NDJSON stream)
//
// Why the split:  scan is repo-fetch + pure text crunch (fast, edge-local);
// search is the slow part (one network query per phrase), fanned out in parallel
// with the authed service token (the public AppView 403s search) and streamed
// back so results land as they're found instead of after the whole batch.

const PUB = 'https://public.api.bsky.app/xrpc'; // unauthed AppView reads
const APP = 'https://api.bsky.app/xrpc';        // authed AppView reads (Bearer)

const MAX_POST_PAGES = 40;   // ≤ 4000 most-recent posts scanned (bounds subrequests)
const SCAN_CAP = 2500;       // cap candidate list returned (top-scored first)
const SEARCH_MAX = 100;      // cap candidates verified per /search request
const SEARCH_CONC = 6;       // parallel search fan-out
const SEARCH_LIMIT = 15;     // posts fetched per phrase (enough to verify + spot dupes)

// Stopwords — grams made only of these carry no signal and are almost never
// unique; we drop all-stopword grams and rank the rest by content.
const STOP = new Set(('a an and are as at be been but by for from had has have he her his i in ' +
  'is it its me my no not of on or our so that the their them then they this to up us was we were ' +
  'what when who will with you your just like get got out about into over more all can do if im dont ' +
  'youre they re ve ll s t m d re').split(/\s+/));

// ── identity ─────────────────────────────────────────────────────────────────
async function jget(url, headers) {
  const r = await fetch(url, headers ? { headers } : undefined);
  if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.status = r.status; throw e; }
  return r.json();
}
async function resolveActor(actor) {
  const a = (actor || '').trim().replace(/^@/, '').replace(/^at:\/\//, '')
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, '').split('/')[0];
  if (!a) { const e = new Error('empty handle'); e.status = 400; throw e; }
  if (a.startsWith('did:')) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) { const e = new Error(`couldn't resolve “${a}”`); e.status = 404; throw e; }
  return d.did;
}
async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) doc = await jget(`https://plc.directory/${did}`);
  else if (did.startsWith('did:web:')) doc = await jget(`https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`);
  else { const e = new Error('unsupported DID method'); e.status = 400; throw e; }
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds');
  if (!svc) { const e = new Error('no PDS in DID doc'); e.status = 502; throw e; }
  return svc.serviceEndpoint;
}

// ── text → tokens → n-grams ────────────────────────────────────────────────────
// Lowercase, drop URLs / @handles / #-marks, split on any non-letter/number run.
// This mirrors how Bluesky's search tokenizes, so a gram we build here is the
// same string we later verify inside a returned post's text.
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.-]+/g, ' ')
    .replace(/[#]/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
// Boundary-aware tokenizer. Splits text into SEGMENTS at "hard breaks" — newlines
// and sentence/clause punctuation (. ! ? ; : , … quotes brackets en/em-dash slash |).
// Words either side of such a break aren't a real contiguous phrase, so we never
// form an n-gram across one. Intra-word marks (hyphen, apostrophe) stay SOFT — they
// split the token like tokenize() does but don't break the segment, so "well-known"
// and "don't" behave identically to the flat tokenizer. Returns an array of token
// arrays, one per segment.
const HARD_BREAK = /[.!?;:,…"“”«»()[\]{}\n\r–—|/\\*~•·]/u;
function tokenizeSegments(text) {
  const clean = String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.-]+/g, ' ')
    .replace(/[#]/g, ' ');
  const segs = [];
  let cur = [], word = '';
  const endWord = () => { if (word) { cur.push(word); word = ''; } };
  const endSeg = () => { endWord(); if (cur.length) { segs.push(cur); cur = []; } };
  for (const ch of clean) {
    if (/[\p{L}\p{N}]/u.test(ch)) word += ch;
    else { endWord(); if (HARD_BREAK.test(ch)) endSeg(); }
  }
  endSeg();
  return segs;
}
// Emit the bigrams/trigrams of one post as {gram -> ++count} into c2/c3. When
// `cross` is false (the default) grams never span a punctuation/newline break.
function harvestGrams(text, c2, c3, want2, want3, cross) {
  const segments = cross ? [tokenize(text)] : tokenizeSegments(text);
  for (const seg of segments) {
    if (want2) for (let i = 0; i + 1 < seg.length; i++) { const g = seg[i] + ' ' + seg[i + 1]; c2.set(g, (c2.get(g) || 0) + 1); }
    if (want3) for (let i = 0; i + 2 < seg.length; i++) { const g = seg[i] + ' ' + seg[i + 1] + ' ' + seg[i + 2]; c3.set(g, (c3.get(g) || 0) + 1); }
  }
}
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v || ''));
// A gram's "interest" score: prefer content words and length, so when we cap the
// search we spend it on the phrases most likely to be genuinely distinctive.
function score(toks) {
  let s = 0, content = 0;
  for (const t of toks) {
    if (STOP.has(t)) { s += 0.15; }
    else { content++; s += Math.min(t.length, 12) / 4 + 1; }
  }
  return content === 0 ? -1 : s + content; // all-stopword => -1 (dropped)
}

// ── scan: harvest the exactly-once bigrams/trigrams ────────────────────────────
export async function scan(params, env) {
  const handleRaw = params.get('handle');
  const modeRaw = (params.get('mode') || 'both').toLowerCase();
  const want2 = modeRaw !== 'trigram', want3 = modeRaw !== 'bigram';
  // crossPunct=true restores the old flat behavior (n-grams may span sentence /
  // line breaks). Default false: only contiguous phrases, no punctuation/newline
  // straddlers — the filter people asked for.
  const cross = truthy(params.get('crossPunct'));

  const did = await resolveActor(handleRaw);
  const pds = await resolvePds(did);

  const c2 = new Map(), c3 = new Map(); // gram -> count in this repo
  let cursor = '', pages = 0, posts = 0;
  for (; pages < MAX_POST_PAGES; pages++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', did);
    u.searchParams.set('collection', 'app.bsky.feed.post');
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    let d; try { d = await jget(u.toString()); } catch { break; }
    const recs = d.records || [];
    for (const rec of recs) {
      const text = rec.value && rec.value.text;
      if (!text) continue;
      posts++;
      harvestGrams(text, c2, c3, want2, want3, cross);
    }
    cursor = d.cursor;
    if (!cursor || recs.length === 0) break;
  }

  const cands = [];
  const collect = (map, n) => {
    for (const [g, cnt] of map) {
      if (cnt !== 1) continue;                 // the free pre-filter
      const sc = score(g.split(' '));
      if (sc < 0) continue;                    // all-stopword gram
      cands.push({ g, n, s: sc });
    }
  };
  if (want2) collect(c2, 2);
  if (want3) collect(c3, 3);
  cands.sort((a, b) => b.s - a.s);

  return {
    did, pds, posts, pages,
    boundaries: !cross,                        // true => grams don't span punctuation/newlines
    scannedAll: !cursor,                       // false => hit the page cap
    bigramTypes: c2.size, trigramTypes: c3.size,
    onceBigrams: want2 ? [...c2.values()].filter((v) => v === 1).length : 0,
    onceTrigrams: want3 ? [...c3.values()].filter((v) => v === 1).length : 0,
    total: cands.length,
    candidates: cands.slice(0, SCAN_CAP).map(({ g, n }) => ({ g, n })),
  };
}

// ── shared: run one exact-phrase search, keep only posts that truly contain it ──
// Returns { hits: [...] } on success, or { rate: true } / { error: true } so the
// caller can distinguish "verified zero" from "couldn't check".
async function searchHits(g, token) {
  const u = new URL(`${token ? APP : PUB}/app.bsky.feed.searchPosts`);
  u.searchParams.set('q', `"${g}"`);           // quoted => exact-phrase intent
  u.searchParams.set('limit', String(SEARCH_LIMIT));
  let d;
  try { d = await jget(u.toString(), token ? { Authorization: `Bearer ${token}` } : null); }
  catch (e) {
    if (e.status === 429) return { rate: true };
    // authed host hiccup — one retry unauthed (may still 403, handled as error)
    if (token) { try { d = await jget(u.toString(), null); } catch { return { error: true }; } }
    else return { error: true };
  }
  // Search is fuzzy; keep only posts whose text actually contains the phrase.
  const pad = (t) => ' ' + tokenize(t).join(' ') + ' ';
  const needle = ' ' + g + ' ';
  const seen = new Set();
  const hits = [];
  for (const p of (d.posts || [])) {
    const text = p.record && p.record.text;
    if (!text || !pad(text).includes(needle)) continue;
    if (seen.has(p.uri)) continue;
    seen.add(p.uri);
    hits.push({ uri: p.uri, did: p.author && p.author.did, handle: p.author && p.author.handle, text: String(text).slice(0, 240) });
  }
  return { hits };
}

// ── search: verify a candidate against platform-wide full-text search ──────────
async function searchPhrase(g, wantDid, token) {
  const n = g.split(' ').length;
  const r = await searchHits(g, token);
  if (r.rate) return { g, n, status: 'rate' };
  if (r.error) return { g, n, status: 'error' };
  const hits = r.hits;
  if (hits.length === 0) return { g, n, status: 'none' };       // not indexed / inconclusive
  if (hits.length === 1) {
    const h = hits[0];
    const mine = !wantDid || h.did === wantDid;
    return { g, n, status: 'unique', mine, post: h };
  }
  // ≥2 verified posts — not unique. Report count (15 => "15+").
  return { g, n, status: 'common', count: hits.length >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : hits.length };
}

// Streamed NDJSON: one verdict object per line, emitted as each search resolves.
export function search(request, env, token) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  (async () => {
    let body;
    try { body = await request.json(); } catch { body = {}; }
    const list = Array.isArray(body.candidates) ? body.candidates : [];
    const wantDid = typeof body.did === 'string' ? body.did : null;
    const cands = list
      .map((x) => (typeof x === 'string' ? x : x && x.g))
      .filter((g) => typeof g === 'string' && g.trim())
      .slice(0, SEARCH_MAX);

    const write = (obj) => writer.write(enc.encode(JSON.stringify(obj) + '\n'));

    let idx = 0;
    async function worker() {
      while (idx < cands.length) {
        const g = cands[idx++];
        let res;
        try { res = await searchPhrase(g, wantDid, token); }
        catch (e) { res = { g, n: g.split(' ').length, status: 'error' }; }
        await write(res);
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(SEARCH_CONC, cands.length || 1) }, worker));
      await write({ done: true, checked: cands.length });
    } catch (e) {
      try { await write({ done: true, error: String((e && e.message) || e) }); } catch {}
    }
    try { await writer.close(); } catch {}
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ── novelty: does this draft contain a phrase NO ONE has ever posted? ───────────
// The gate for /coin — the posting box that only unlocks when your text carries a
// bigram or trigram that returns zero indexed posts platform-wide. Once you post
// it, that phrase becomes a hapax (used exactly once, by you). Distinct from the
// finder's "unique" (exactly one existing post): here "novel" means ZERO existing
// posts, because you haven't posted yet.
const NOVELTY_MAX = 60;   // cap grams searched per draft (posts are short anyway)

export async function novelty(request, env, token) {
  let body; try { body = await request.json(); } catch { body = {}; }
  const text = String((body && body.text) || '');
  if (!text.trim()) return { grams: [], searched: 0, novelCount: 0, ok: false, reason: 'empty' };

  // Contiguous phrases only (boundary-aware) — a real phrase gate shouldn't credit
  // words glued across a sentence break. Dedupe, drop all-stopword grams, rank by
  // interest so the cap spends on the most distinctive phrases first.
  const c2 = new Map(), c3 = new Map();
  harvestGrams(text, c2, c3, true, true, false);
  const seen = new Set(), cands = [];
  for (const [map, n] of [[c2, 2], [c3, 3]]) {
    for (const g of map.keys()) {
      if (seen.has(g)) continue;
      const sc = score(g.split(' '));
      if (sc < 0) continue;                    // all-stopword gram
      seen.add(g);
      cands.push({ g, n, s: sc });
    }
  }
  cands.sort((a, b) => b.s - a.s);
  const batch = cands.slice(0, NOVELTY_MAX);

  const results = new Array(batch.length);
  let idx = 0, inconclusive = false;
  async function worker() {
    while (idx < batch.length) {
      const i = idx++, { g, n } = batch[i];
      let r; try { r = await searchHits(g, token); } catch { r = { error: true }; }
      if (r.rate || r.error) { inconclusive = true; results[i] = { g, n, status: 'unknown' }; }
      else results[i] = { g, n, hits: r.hits.length, novel: r.hits.length === 0 };
    }
  }
  await Promise.all(Array.from({ length: Math.min(SEARCH_CONC, batch.length || 1) }, worker));

  const grams = results.filter(Boolean);
  const novel = grams.filter((x) => x.novel).map((x) => x.g);
  return {
    grams, searched: batch.length, total: cands.length,
    novelCount: novel.length, novel,
    ok: novel.length > 0,
    inconclusive,
  };
}
