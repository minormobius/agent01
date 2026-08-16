// zest/worker.js — zest.mino.mobi
//
// Serves the static game and three JSON endpoints it cannot do without:
//
//   GET  /api/feed    text-only posts, pulled from Bluesky and filtered hard
//   POST /api/embed   text → BGE vectors, content-addressed cache on D1
//   GET  /api/basis   the corpus basis every shape is measured against
//
// Everything geometric lives in embed-geometry.js and runs in the tab. The
// worker's only jobs are: get posts, get vectors, and keep one shared basis so
// that two people looking at the same post see the same solid.

import { makeBasis } from './embed-geometry.js';

const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBED_DIM = 768;
const EMBED_BATCH = 50;
// D1 caps a prepared statement at 100 bound variables. The cache lookup binds
// the model plus one hash per slot, so the chunk must leave room for that model
// parameter — at 100 it is 101 variables and D1 answers "too many SQL
// variables", which is invisible until something asks for more than 100 texts
// at once. The basis fit asks for 400.
export const CACHE_LOOKUP_CHUNK = 90;
export const D1_MAX_VARIABLES = 100;

// Bump when anything about how the basis is FITTED changes (the model, the
// sample, the α in makeBasis). Shapes built under different versions are not
// comparable, so the version is part of the row key and is reported to the page.
const BASIS_VERSION = 'v3';
const BASIS_SAMPLE = 400;   // posts to fit on
const BASIS_MIN = 120;      // below this a basis is too thin to be meaningful
const BASIS_BUDGET_MS = 240000;  // per feed; this runs in a cron, not a request

const APPVIEW = 'https://public.api.bsky.app';
const SIMCLUSTER = 'at://did:plc:yivyyp54vddf7qf2lpsikhe4/app.bsky.feed.generator/simcluster';
const WHATS_HOT = 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot';

const FEEDS = {
  simcluster: { uri: SIMCLUSTER, label: 'SimCluster — this repo’s own feed generator' },
  hot: { uri: WHATS_HOT, label: 'Discover — what’s hot on Bluesky' },
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      });
    }

    try {
      if (path === '/api/feed') return await handleFeed(url, env);
      if (path === '/api/embed') return await handleEmbed(request, env);
      if (path === '/api/basis') return await handleBasis(url, env, ctx);
      if (path === '/health') return await handleHealth(env);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }

    return env.ASSETS.fetch(request);
  },

  // Daily: build the basis IF IT IS MISSING, and prune the embedding cache.
  //
  // Deliberately not a refit. The basis decides which dimension drives which
  // harmonic, so refitting re-shapes every post that has ever been drawn — and
  // the variance ranking is exactly the part a fresh sample jitters, since with
  // a few hundred posts the standard error on each dimension's spread is enough
  // to swap neighbouring ranks. A surface whose whole promise is "two people
  // looking at the same post see the same solid" cannot quietly redraw itself
  // every night. Refitting is an explicit act: bump BASIS_VERSION.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        await buildBasis(env, { force: false });
      } catch (err) {
        console.error('zest cron: basis build failed', err);
      }
      try {
        const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
        await env.DB.prepare('DELETE FROM zest_embeddings WHERE created_at < ?').bind(cutoff).run();
      } catch (err) {
        console.error('zest cron: prune failed', err);
      }
    })());
  },
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/feed — text-only posts.
//
// "Text only" is not a nicety, it is the premise. A post carrying an image has
// already told you what it is about through a channel the embedding never saw,
// so its shape would be judged against information the player can see and the
// geometry cannot. Filtering is therefore strict and happens here, once.
// ─────────────────────────────────────────────────────────────────────────────

async function handleFeed(url, env) {
  const src = FEEDS[url.searchParams.get('src')] ? url.searchParams.get('src') : 'simcluster';
  const want = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 40));
  const cursor = url.searchParams.get('cursor') || '';

  const got = await collectPosts(FEEDS[src].uri, {
    want, cursor, maxPages: 10, budgetMs: 20000,
  });

  return json(
    { source: src, label: FEEDS[src].label, posts: got.posts, cursor: got.cursor, pages: got.pages, stats: got.stats },
    200,
    // Everyone is shown the same pool, so caching this is most of the latency
    // fix: only the first visitor in each window pays for the paging above.
    { 'cache-control': 'public, max-age=300, s-maxage=300' }
  );
}

/**
 * Page a feed until `want` usable posts are found, or a budget runs out.
 *
 * ONE collector, used by both /api/feed and the basis fit, because they had
 * separate paging loops with separately-guessed page budgets and the basis one
 * was silently too small — it gathered 116 posts against a floor of 120 and
 * threw, for weeks of crons, with nothing on /health to say so.
 *
 * Both budgets are load-bearing. The filter discards most of the network
 * (measured: 7.7% kept on Discover, 34% on SimCluster), so a page budget alone
 * cannot bound the time; and getFeed against a busy generator has been measured
 * at up to ~25s for a single page, so a time budget alone cannot bound the
 * work either.
 */
async function collectPosts(feedUri, { want, cursor = '', maxPages, budgetMs }) {
  const posts = [];
  const seen = new Set();
  const stats = { scanned: 0, kept: 0, reject: {} };
  const deadline = Date.now() + budgetMs;
  let next = cursor;
  let pages = 0;

  while (posts.length < want && pages < maxPages && Date.now() < deadline) {
    pages++;
    const page = await fetchFeedPage(feedUri, next, 100);
    if (!page) break;
    for (const item of page.feed || []) {
      stats.scanned++;
      const p = usablePost(item);
      if (!p) {
        const why = usablePost.reason || 'other';
        stats.reject[why] = (stats.reject[why] || 0) + 1;
        continue;
      }
      // A repost puts a post someone already wrote back into the feed, and the
      // same post can surface twice in one pull. Dedupe rather than drop.
      if (seen.has(p.uri)) { stats.reject.duplicate = (stats.reject.duplicate || 0) + 1; continue; }
      seen.add(p.uri);
      posts.push(p);
      stats.kept++;
      if (posts.length >= want) break;
    }
    next = page.cursor || '';
    if (!next) break;
  }

  return { posts, cursor: next, pages, stats };
}

/**
 * Broad sampling for the basis fit ONLY, via search rather than a feed.
 *
 * The two feeds together hold about 130 usable posts, and both are communities:
 * a basis fitted on them alone makes those communities' concerns "average" and
 * everyone else strange, which is a claim about the world that has no business
 * being baked into the geometry. Searching common function words pulls posts
 * that have nothing in common except being English prose, which is much closer
 * to the population the shapes should be deviations from.
 *
 * Best-effort: if search is unavailable the fit still proceeds on the feeds.
 */
const BASIS_PROBES = ['the', 'and', 'today', 'people', 'think', 'because', 'time', 'really', 'work', 'good'];

async function collectSearch(query, { want, budgetMs }) {
  const posts = [];
  const seen = new Set();
  const deadline = Date.now() + budgetMs;
  let cursor = '';
  while (posts.length < want && Date.now() < deadline) {
    const u = new URL(APPVIEW + '/xrpc/app.bsky.feed.searchPosts');
    u.searchParams.set('q', query);
    u.searchParams.set('limit', '100');
    u.searchParams.set('lang', 'en');
    if (cursor) u.searchParams.set('cursor', cursor);
    let data = null;
    try {
      const res = await fetch(u, { headers: { 'user-agent': 'zest.mino.mobi' } });
      if (!res.ok) break;
      data = await res.json();
    } catch (err) {
      break;
    }
    if (!data || !Array.isArray(data.posts) || !data.posts.length) break;
    for (const post of data.posts) {
      // searchPosts returns bare postViews; usablePost expects a feed item
      const p = usablePost({ post });
      if (p && !seen.has(p.uri)) { seen.add(p.uri); posts.push(p); }
    }
    cursor = data.cursor || '';
    if (!cursor) break;
  }
  return posts;
}

async function fetchFeedPage(feedUri, cursor, limit) {
  const u = new URL(APPVIEW + '/xrpc/app.bsky.feed.getFeed');
  u.searchParams.set('feed', feedUri);
  u.searchParams.set('limit', String(limit));
  if (cursor) u.searchParams.set('cursor', cursor);
  const res = await fetch(u, { headers: { 'user-agent': 'zest.mino.mobi' }, cf: { cacheTtl: 60 } });
  if (!res.ok) return null;
  return await res.json();
}

/**
 * The whole text-only rule, in one place. Returns null for anything unusable,
 * and leaves the reason on `usablePost.reason` so /api/feed can report WHY a
 * pull came back thin instead of leaving the next person to guess.
 *
 * THE RULE, precisely: the player must have no information about a post that
 * the embedding did not. That is the only test a candidate has to pass.
 *
 * It is worth being exact about this, because the first version of this filter
 * was stricter than the rule and cost 98.5% of the live network. Replies and
 * reposts were dropped for "needing a parent" and "the reposter said nothing" —
 * but the card shows nothing except the post's own text, which is exactly what
 * the model was given. A reply read cold is a perfectly honest object here; the
 * player and the model are looking at the same words. So they are kept, and
 * reposts are deduplicated by URI rather than discarded.
 *
 * Embeds are the real line, and they stay rejected: a picture tells the player
 * the topic through a channel the geometry never saw.
 */
export function usablePost(item) {
  const no = (why) => { usablePost.reason = why; return null; };
  usablePost.reason = null;

  const post = item && item.post;
  if (!post || !post.record) return no('malformed');
  if (post.embed) return no('embed');          // images, video, quotes, link cards
  if (post.record.embed) return no('embed');

  let text = String(post.record.text || '').trim();
  if (!text) return no('empty');
  if (post.record.langs && post.record.langs.length && !post.record.langs.some((l) => String(l).startsWith('en'))) {
    // BGE is an English model. Embedding other languages with it produces a
    // vector, and a shape, and no meaning — so they are dropped rather than
    // drawn misleadingly.
    return no('not-english');
  }

  // A post that is mostly a URL or mostly mentions carries almost no text for
  // the model to read, and would show up as an indistinct near-sphere.
  const stripped = text.replace(/https?:\/\/\S+/g, '').replace(/@[\w.-]+/g, '').trim();
  if (stripped.length < 24) return no('too-short');
  if (stripped.length / text.length < 0.55) return no('mostly-links');
  if (text.length > 300) text = text.slice(0, 300);

  const letters = (stripped.match(/\p{L}/gu) || []).length;
  if (letters < 16) return no('too-few-letters');

  return {
    uri: post.uri,
    cid: post.cid,
    text,
    createdAt: post.record.createdAt || post.indexedAt || null,
    likes: post.likeCount || 0,
    replies: post.replyCount || 0,
    author: {
      did: post.author?.did || '',
      handle: post.author?.handle || '',
      displayName: post.author?.displayName || '',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/embed — text → vectors, cached by content hash.
// ─────────────────────────────────────────────────────────────────────────────

async function handleEmbed(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await request.json().catch(() => null);
  const texts = body && Array.isArray(body.texts) ? body.texts : null;
  if (!texts || !texts.length) return json({ error: 'texts[] required' }, 400);
  if (texts.length > 200) return json({ error: 'at most 200 texts per call' }, 400);

  const clean = texts.map((t) => String(t || '').slice(0, 1200));
  const out = await embedTexts(clean, env);
  return json({
    model: EMBED_MODEL,
    dim: EMBED_DIM,
    cached: out.cached,
    computed: out.computed,
    vectors: out.vectors.map((v) => (v ? b64FromFloats(v) : null)),
    encoding: 'f32-le-base64',
  });
}

/**
 * Embed a list of texts, hitting D1 first. Returns vectors in input order;
 * an entry is null only if the model failed for it, and the page falls back
 * to its own lexical embedder for those rather than dropping the post.
 */
async function embedTexts(texts, env) {
  const hashes = texts.map((t) => hashText(EMBED_MODEL + '\n' + t));
  const vectors = new Array(texts.length).fill(null);
  let cached = 0, computed = 0;

  // ── read-through
  const unique = [...new Set(hashes)];
  for (let i = 0; i < unique.length; i += CACHE_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + CACHE_LOOKUP_CHUNK);
    const rows = await env.DB.prepare(
      `SELECT hash, embedding FROM zest_embeddings
        WHERE model = ? AND hash IN (${chunk.map(() => '?').join(',')})`
    ).bind(EMBED_MODEL, ...chunk).all();
    const byHash = new Map();
    for (const r of rows.results || []) byHash.set(r.hash, floatsFromBlob(r.embedding));
    for (let j = 0; j < hashes.length; j++) {
      if (!vectors[j] && byHash.has(hashes[j])) { vectors[j] = byHash.get(hashes[j]); cached++; }
    }
  }

  // ── compute the misses
  const missIdx = [];
  const seen = new Set();
  for (let i = 0; i < texts.length; i++) {
    if (vectors[i]) continue;
    if (seen.has(hashes[i])) continue;   // same text twice in one batch
    seen.add(hashes[i]);
    missIdx.push(i);
  }

  for (let i = 0; i < missIdx.length; i += EMBED_BATCH) {
    const slice = missIdx.slice(i, i + EMBED_BATCH);
    let data = null;
    try {
      const res = await env.AI.run(EMBED_MODEL, { text: slice.map((k) => texts[k]) });
      data = res && res.data;
    } catch (err) {
      console.error('zest: AI.run failed', err);
    }
    if (!data || data.length !== slice.length) continue;

    const now = Math.floor(Date.now() / 1000);
    const stmts = [];
    for (let j = 0; j < slice.length; j++) {
      const vec = Float32Array.from(data[j]);
      if (vec.length !== EMBED_DIM) continue;
      vectors[slice[j]] = vec;
      computed++;
      stmts.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO zest_embeddings (hash, model, dim, embedding, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(hashes[slice[j]], EMBED_MODEL, EMBED_DIM, blobFromFloats(vec), now)
      );
    }
    if (stmts.length) await env.DB.batch(stmts).catch((err) => console.error('zest: cache write failed', err));
  }

  // fill in any duplicate texts we skipped above
  const byHash = new Map();
  for (let i = 0; i < texts.length; i++) if (vectors[i]) byHash.set(hashes[i], vectors[i]);
  for (let i = 0; i < texts.length; i++) if (!vectors[i] && byHash.has(hashes[i])) vectors[i] = byHash.get(hashes[i]);

  return { vectors, cached, computed };
}

// ─────────────────────────────────────────────────────────────────────────────
// /api/basis — the shared frame of reference.
//
// A shape is a DEVIATION from the average post, so "the average post" has to be
// a fixed, shared, versioned object. If every session fitted its own basis, the
// same post would be a different solid every evening and nothing anyone learned
// would transfer. Hence: one row, refit on a schedule, version-pinned.
// ─────────────────────────────────────────────────────────────────────────────

async function handleBasis(url, env, ctx) {
  const id = `${EMBED_MODEL}/${BASIS_VERSION}`;
  const row = await env.DB.prepare(
    'SELECT payload, n, built_at, dim FROM zest_basis WHERE id = ?'
  ).bind(id).first().catch(() => null);

  if (row && row.payload) {
    return json(
      {
        status: 'ready',
        version: BASIS_VERSION,
        model: EMBED_MODEL,
        n: row.n,
        dim: row.dim,
        builtAt: row.built_at,
        basis: JSON.parse(row.payload),
      },
      200,
      { 'cache-control': 'public, max-age=1800' }
    );
  }

  // Nothing stored yet. Never block the page on a multi-second fit — say so,
  // let the page use a local basis for now, and build in the background.
  if (url.searchParams.get('build') === '1') {
    const built = await buildBasis(env, { force: false });
    return json({ status: built ? 'ready' : 'failed', version: BASIS_VERSION, basis: built || null, n: built ? built.n : 0 });
  }
  ctx.waitUntil(buildBasis(env, { force: false }).catch((err) => console.error('zest: basis build', err)));
  return json({ status: 'building', version: BASIS_VERSION, model: EMBED_MODEL, basis: null }, 202);
}

/** Record how the last basis build went, so a failing cron is not invisible. */
async function noteStatus(env, key, ok, detail) {
  await env.DB.prepare(
    `INSERT INTO zest_status (key, ok, detail, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET ok = excluded.ok, detail = excluded.detail, updated_at = excluded.updated_at`
  ).bind(key, ok ? 1 : 0, String(detail).slice(0, 500), Math.floor(Date.now() / 1000))
    .run().catch((err) => console.error('zest: status write failed', err));
}

/** Fit the basis on a fresh sample of feed posts and store it. */
async function buildBasis(env, opts) {
  try {
    const out = await buildBasisInner(env, opts);
    if (out) await noteStatus(env, 'basis-build', true, `fitted on ${out.n} posts`);
    return out;
  } catch (err) {
    await noteStatus(env, 'basis-build', false, err && err.message || String(err));
    throw err;
  }
}

async function buildBasisInner(env, { force }) {
  const id = `${EMBED_MODEL}/${BASIS_VERSION}`;
  if (!force) {
    const existing = await env.DB.prepare('SELECT id FROM zest_basis WHERE id = ?').bind(id).first().catch(() => null);
    if (existing) return null;
  }

  // Sample across BOTH feeds, half each. A basis fitted on one community would
  // make that community's posts look average and everyone else look strange,
  // which is a claim about the world we have no business encoding in geometry.
  const keys = Object.keys(FEEDS);
  const texts = [];
  for (const key of keys) {
    const got = await collectPosts(FEEDS[key].uri, {
      want: Math.ceil(BASIS_SAMPLE / keys.length),
      maxPages: 60,      // the fit is a background job; it can afford to page
      budgetMs: BASIS_BUDGET_MS,
    });
    for (const p of got.posts) texts.push(p.text);
  }

  // …then widen well past those two communities.
  const perProbe = Math.ceil(BASIS_SAMPLE / BASIS_PROBES.length);
  for (const q of BASIS_PROBES) {
    if (texts.length >= BASIS_SAMPLE * 2) break;
    const found = await collectSearch(q, { want: perProbe, budgetMs: 20000 });
    for (const p of found) texts.push(p.text);
  }

  const uniq = [...new Set(texts)].slice(0, BASIS_SAMPLE);
  if (uniq.length < BASIS_MIN) throw new Error(`basis sample too thin: ${uniq.length} posts (floor ${BASIS_MIN})`);

  const { vectors } = await embedTexts(uniq, env);
  const good = vectors.filter((v) => v && v.length === EMBED_DIM);
  if (good.length < BASIS_MIN) throw new Error(`basis: only ${good.length} of ${uniq.length} texts embedded`);

  const basis = makeBasis(good);
  const payload = JSON.stringify(roundBasis(basis));
  await env.DB.prepare(
    `INSERT INTO zest_basis (id, model, version, dim, n, payload, built_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET n = excluded.n, payload = excluded.payload, built_at = excluded.built_at`
  ).bind(id, EMBED_MODEL, BASIS_VERSION, EMBED_DIM, good.length, payload, Math.floor(Date.now() / 1000)).run();

  return { ...basis, n: good.length };
}

/** Six significant figures is far below any visible difference and roughly
 *  halves the payload the page has to download before it can draw anything. */
export function roundBasis(basis) {
  const r = (a) => Array.from(a, (v) => Number(v.toPrecision(6)));
  return {
    dim: basis.dim,
    n: basis.n,
    seed: basis.seed,
    whitenPower: basis.whitenPower,
    mean: r(basis.mean),
    std: r(basis.std),
    scale: r(basis.scale),
    order: basis.order,
    pc: basis.pc.map(r),
    normQ: r(basis.normQ),
  };
}

async function handleHealth(env) {
  const out = { ok: true, model: EMBED_MODEL, basisVersion: BASIS_VERSION };
  try {
    const b = await env.DB.prepare(
      'SELECT n, built_at FROM zest_basis WHERE id = ?'
    ).bind(`${EMBED_MODEL}/${BASIS_VERSION}`).first();
    out.basis = b ? { n: b.n, builtAt: b.built_at } : null;
    const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM zest_embeddings').first();
    out.cachedEmbeddings = c ? c.c : 0;
    const st = await env.DB.prepare(
      'SELECT ok, detail, updated_at FROM zest_status WHERE key = ?'
    ).bind('basis-build').first().catch(() => null);
    // A basis that is absent because the fit FAILED looks identical to one that
    // is absent because it has not run yet. Say which.
    out.lastBasisBuild = st ? { ok: !!st.ok, detail: st.detail, at: st.updated_at } : null;
  } catch (err) {
    out.ok = false;
    out.error = String(err && err.message || err);
  }
  return json(out);
}

// ─────────────────────────────────────────────────────────────────────────────
// bytes
// ─────────────────────────────────────────────────────────────────────────────

/** FNV-1a 64, as hex. Content addressing only — not a security boundary. */
export function hashText(str) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) {
    h ^= BigInt(bytes[i]);
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

export function blobFromFloats(vec) {
  return new Uint8Array(Float32Array.from(vec).buffer);
}

export function floatsFromBlob(blob) {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  // D1 may hand back a view whose byteOffset is not 4-aligned; copy when so.
  if (bytes.byteOffset % 4 === 0) {
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  }
  return new Float32Array(bytes.slice().buffer);
}

export function b64FromFloats(vec) {
  const bytes = blobFromFloats(vec);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
