/**
 * io.mino.mobi — ATProto ticket tracker + StumbleUpon portal.
 *
 * One Worker, two surfaces, served from the ASSETS binding:
 *   /            unified front page (board preview + stumble launcher + compose)
 *   /board       full Jira-ish board
 *   /stumble     iframe-wrapper portal host + persistent bar
 *
 * Tickets (com.minomobi.io.ticket) live on each author's own PDS. This worker:
 *   - indexes them network-wide via Constellation's backlink index (every
 *     ticket links to a constant BOARD_ANCHOR url; we query backlinks to it),
 *     caching into D1 (io_tickets) for fast board reads;
 *   - mints tickets from Bluesky posts carrying a sweep hashtag onto a service
 *     account (phase 4 — dormant until ATPROTO_SERVICE_* secrets are set);
 *   - serves the portal's site registry and a /go random-redirect.
 *
 * Board-owned triage state (status/severity) is D1-only — we never write back
 * to anyone else's repo.
 *
 * Mirrors the rite/airchat single-file worker shape (fetch + scheduled + ASSETS
 * fallthrough + shared atpolls-db).
 */

const IO_COLLECTION = 'com.minomobi.io.ticket';

// The discovery anchor. Every ticket record sets `board` to this exact URL, so
// Constellation's backlink index can enumerate every ticket network-wide as
// "records whose .board link points at BOARD_ANCHOR". Must stay constant and
// unique to us — do not reuse a generic page URL.
const BOARD_ANCHOR = 'https://io.mino.mobi/anchor/tickets/v1';

const CONSTELLATION = 'https://constellation.microcosm.blue';
// Constellation `source` param is "<collection>:<json-path-to-link>" with NO
// leading dot (verified live: app.bsky.feed.like:subject.uri → 200). Our
// `board` field is a top-level string, so the path is just "board". A leading
// dot ("...:.board") returns HTTP 400 and silently breaks the indexer.
const CONSTELLATION_SOURCE = `${IO_COLLECTION}:board`;

const BSKY_PUBLIC = 'https://public.api.bsky.app';

// Seed sweep hashtag(s). Add/rename freely — matched against post text + tags.
const SWEEP_TAGS = ['atprotoideasio', 'atproideasio'];

const KINDS = ['bug', 'feature', 'idea'];
const STATUSES = ['new', 'triaged', 'in_progress', 'done', 'wontfix'];
const SEVERITIES = ['low', 'med', 'high'];

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight for the API (portal bar / cross-site compose may call us).
    if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (pathname === '/api/health') return health(env);
      if (pathname === '/api/tickets') return listTickets(url, env);
      if (pathname === '/api/sites') return serveSites(env);
      if (pathname === '/go') return randomRedirect(url, env);
      if (pathname === '/api/index/notify' && request.method === 'POST') return notifyIndex(request, env, ctx);
      if (pathname === '/api/index/refresh' && request.method === 'POST') return adminRefresh(request, env, ctx);
      if (pathname === '/api/triage' && request.method === 'POST') return triage(request, env);
      if (pathname === '/api/sweep/run' && request.method === 'POST') return adminSweep(request, env, ctx);
      if (pathname === '/api/config') return configInfo();
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }

    // Pretty routes → their html files; everything else falls through to assets.
    if (pathname === '/board') return env.ASSETS.fetch(new Request(new URL('/board.html', url), request));
    if (pathname === '/stumble') return env.ASSETS.fetch(new Request(new URL('/stumble.html', url), request));

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      // Sweep first (mints new service-account tickets), then index everything
      // (folds both swept + manually-submitted tickets into D1).
      try { await runSweep(env); } catch (e) { console.error('sweep failed', e); }
      try { await runIndex(env); } catch (e) { console.error('index failed', e); }
    })());
  },
};

// ─────────────────────────────── API handlers ──────────────────────────────

async function health(env) {
  let tickets = null, dbOk = false, lastSweep = null, lastSweepAt = null;
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM io_tickets').first();
    tickets = row ? row.n : 0;
    dbOk = true;
    const rep = await env.DB.prepare("SELECT v FROM io_sweep_state WHERE k = 'last_sweep_report'").first();
    if (rep && rep.v) lastSweep = safeParse(rep.v, null);
    const at = await env.DB.prepare("SELECT v FROM io_sweep_state WHERE k = 'last_sweep_at'").first();
    if (at && at.v) lastSweepAt = new Date(Number(at.v)).toISOString();
  } catch { /* table may not exist yet pre-migration */ }
  return json({
    ok: true,
    service: 'io',
    db: dbOk,
    tickets,
    sweeperConfigured: !!(env.ATPROTO_SERVICE_HANDLE && env.ATPROTO_SERVICE_PASSWORD),
    serviceHandle: env.ATPROTO_SERVICE_HANDLE || null,
    servicePds: env.ATPROTO_SERVICE_PDS || 'https://bsky.social',
    sweepTags: SWEEP_TAGS,
    replyBot: env.SWEEP_REPLY === 'on',
    lastSweepAt,
    lastSweep,
  });
}

function configInfo() {
  // Public, non-secret config the frontend needs to build records + deep links.
  return json({
    collection: IO_COLLECTION,
    boardAnchor: BOARD_ANCHOR,
    authUrl: 'https://auth.mino.mobi',
    scope: `atproto repo:${IO_COLLECTION}`,
    kinds: KINDS,
    severities: SEVERITIES,
  });
}

async function listTickets(url, env) {
  const q = url.searchParams;
  const limit = Math.min(parseInt(q.get('limit') || '200', 10) || 200, 500);
  const where = [];
  const binds = [];
  for (const col of ['status', 'kind', 'repo', 'site', 'author_did']) {
    const v = q.get(col);
    if (v) { where.push(`${col} = ?`); binds.push(v); }
  }
  const sql =
    'SELECT uri, cid, author_did, author_handle, kind, title, body, site, url, repo, ' +
    'severity, tags, source_kind, source_post, status, created_at, indexed_at ' +
    'FROM io_tickets' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY created_at DESC LIMIT ?';
  binds.push(limit);
  const res = await env.DB.prepare(sql).bind(...binds).all();
  const tickets = (res.results || []).map((r) => ({
    ...r,
    tags: safeParse(r.tags, []),
  }));
  return json({ tickets, count: tickets.length });
}

/**
 * Best-effort: pull one freshly-created ticket into D1 immediately, so the board
 * reflects it without waiting for the next cron index pass. Public + idempotent
 * — we re-fetch the record from its author's PDS and validate the collection,
 * so a bad uri just no-ops.
 */
async function notifyIndex(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const uri = body && body.uri;
  if (!uri || typeof uri !== 'string') return json({ error: 'uri required' }, 400);
  const parsed = parseAtUri(uri);
  if (!parsed || parsed.collection !== IO_COLLECTION) {
    return json({ error: 'not an io ticket uri' }, 400);
  }
  ctx.waitUntil(indexOne(env, parsed.did, parsed.rkey).catch((e) => console.error('notify index', e)));
  return json({ ok: true, queued: uri });
}

async function adminRefresh(request, env, ctx) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  ctx.waitUntil(runIndex(env).catch((e) => console.error('refresh', e)));
  return json({ ok: true, started: 'index refresh' });
}

async function adminSweep(request, env, ctx) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  // ?debug=1 runs synchronously and returns the diagnostic report so you can
  // see exactly what the sweeper saw (search status, posts found, skips).
  const url = new URL(request.url);
  if (url.searchParams.get('debug') === '1') {
    const report = await runSweep(env);
    return json({ ok: true, report });
  }
  ctx.waitUntil(runSweep(env).catch((e) => console.error('sweep', e)));
  return json({ ok: true, started: 'sweep' });
}

async function triage(request, env) {
  if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const { uri, status, severity } = body || {};
  if (!uri) return json({ error: 'uri required' }, 400);
  const sets = [];
  const binds = [];
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return json({ error: 'bad status' }, 400);
    sets.push('status = ?'); binds.push(status);
  }
  if (severity !== undefined) {
    if (severity !== null && !SEVERITIES.includes(severity)) return json({ error: 'bad severity' }, 400);
    sets.push('severity = ?'); binds.push(severity);
  }
  if (!sets.length) return json({ error: 'nothing to update' }, 400);
  binds.push(uri);
  const res = await env.DB.prepare(`UPDATE io_tickets SET ${sets.join(', ')} WHERE uri = ?`).bind(...binds).run();
  return json({ ok: true, updated: res.meta ? res.meta.changes : undefined });
}

async function serveSites(env) {
  // Static sites.json shipped in ASSETS; re-serve with CORS for the portal.
  const res = await env.ASSETS.fetch(new Request('https://io.mino.mobi/sites.json'));
  const text = await res.text();
  return new Response(text, { headers: { ...JSON_HEADERS, ...corsHeaders() } });
}

async function randomRedirect(url, env) {
  const sites = await loadSites(env);
  if (!sites.length) return json({ error: 'no sites' }, 503);
  const exclude = url.searchParams.get('exclude');
  const pool = exclude ? sites.filter((s) => s.url !== exclude) : sites;
  const pick = weightedPick(pool.length ? pool : sites);
  return Response.redirect(pick.url, 302);
}

async function loadSites(env) {
  const res = await env.ASSETS.fetch(new Request('https://io.mino.mobi/sites.json'));
  if (!res.ok) return [];
  const doc = await res.json().catch(() => null);
  if (!doc) return [];
  const out = [];
  for (const c of doc.constellations || []) {
    for (const s of c.sites || []) out.push({ ...s, domain: c.domain });
  }
  return out;
}

function weightedPick(sites) {
  const total = sites.reduce((a, s) => a + Math.max(1, s.weight || 1), 0);
  let r = Math.random() * total;
  for (const s of sites) {
    r -= Math.max(1, s.weight || 1);
    if (r <= 0) return s;
  }
  return sites[sites.length - 1];
}

// ─────────────────────────────── Indexer ───────────────────────────────────

/**
 * Pull every ticket that links to BOARD_ANCHOR via Constellation, fetch each
 * record's content from its author's PDS, and upsert into D1. Constellation
 * returns identities (did/rkey) only, so we hydrate each record ourselves.
 */
async function runIndex(env) {
  let cursor = null;
  let indexed = 0;
  const seen = new Set();
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({
      subject: BOARD_ANCHOR,
      source: CONSTELLATION_SOURCE,
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);
    let data;
    try {
      const res = await fetch(`${CONSTELLATION}/xrpc/blue.microcosm.links.getBacklinks?${params}`);
      if (!res.ok) break;
      data = await res.json();
    } catch { break; }

    // Verified live shape: { total, records: [{did, collection, rkey}], cursor }
    const records = (data && data.records) || [];
    cursor = data && data.cursor;
    for (const rec of records) {
      if (!rec.did || !rec.rkey) continue;
      const key = `${rec.did}/${rec.rkey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        const ok = await indexOne(env, rec.did, rec.rkey);
        if (ok) indexed++;
      } catch (e) { console.error('indexOne', key, e); }
    }
    if (!cursor || records.length === 0) break;
  }
  await setState(env, 'last_index_at', String(Date.now()));
  await setState(env, 'last_index_count', String(indexed));
  return indexed;
}

async function indexOne(env, did, rkey) {
  const record = await getRecord(did, IO_COLLECTION, rkey);
  if (!record || !record.value) return false;
  const v = record.value;
  const uri = `at://${did}/${IO_COLLECTION}/${rkey}`;
  if (!KINDS.includes(v.kind) || !v.title) return false;

  const handle = await resolveHandleFromDid(did).catch(() => null);
  const source = v.source || {};
  // Preserve board-owned status if the row already exists.
  const existing = await env.DB.prepare('SELECT status FROM io_tickets WHERE uri = ?').bind(uri).first();
  const status = (existing && existing.status) || 'new';

  await env.DB.prepare(
    `INSERT INTO io_tickets
       (uri, cid, author_did, author_handle, kind, title, body, site, url, repo,
        severity, tags, source_kind, source_post, status, created_at, indexed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())
     ON CONFLICT(uri) DO UPDATE SET
       cid=excluded.cid, author_handle=excluded.author_handle, kind=excluded.kind,
       title=excluded.title, body=excluded.body, site=excluded.site, url=excluded.url,
       repo=excluded.repo, severity=excluded.severity, tags=excluded.tags,
       source_kind=excluded.source_kind, source_post=excluded.source_post,
       created_at=excluded.created_at, indexed_at=unixepoch()`
  ).bind(
    uri, record.cid || null, did, handle,
    v.kind, String(v.title).slice(0, 600), v.body ? String(v.body).slice(0, 20000) : null,
    v.site || null, v.url || null, v.repo || null,
    v.severity || null, JSON.stringify(Array.isArray(v.tags) ? v.tags : []),
    source.kind || 'manual', source.post && source.post.uri || null,
    status, v.createdAt || new Date().toISOString()
  ).run();
  return true;
}

// ─────────────────────────────── Sweeper ───────────────────────────────────

/**
 * Scan Bluesky for posts carrying a sweep hashtag and mint a ticket on the
 * service account for each new one. Dormant unless ATPROTO_SERVICE_* secrets
 * are set. Dedup by post uri in io_sweep_seen.
 */
async function runSweep(env) {
  const report = { configured: false, tags: {}, minted: 0, skipped: {} };
  if (!env.ATPROTO_SERVICE_HANDLE || !env.ATPROTO_SERVICE_PASSWORD) return report;
  report.configured = true;
  const pub = new ServicePublisher(env);
  let minted = 0;
  for (const tag of SWEEP_TAGS) {
    const t = { searchStatus: null, postsSeen: 0, minted: 0, error: null };
    report.tags[tag] = t;
    let cursor = null;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({ q: `#${tag}`, sort: 'latest', limit: '25' });
      if (cursor) params.set('cursor', cursor);
      let data;
      try {
        // searchPosts via the service account's PDS proxy — the public appview
        // 403s unauthenticated. Bearer token forwards the read to the appview.
        const res = await pub.authedGet('app.bsky.feed.searchPosts', Object.fromEntries(params));
        t.searchStatus = res.status;
        if (!res.ok) { t.error = (await res.text().catch(() => '')).slice(0, 200); break; }
        data = await res.json();
      } catch (e) { t.error = String(e && e.message || e); break; }
      const posts = data.posts || [];
      t.postsSeen += posts.length;
      if (!posts.length) break;
      for (const post of posts) {
        try {
          const r = await sweepPost(env, pub, post, tag);
          if (r === true) { minted++; t.minted++; }
          else if (typeof r === 'string') { report.skipped[r] = (report.skipped[r] || 0) + 1; }
        } catch (e) { report.skipped['error:' + String(e && e.message || e).slice(0, 60)] = (report.skipped['error:' + String(e && e.message || e).slice(0, 60)] || 0) + 1; }
      }
      cursor = data.cursor;
      if (!cursor) break;
    }
  }
  report.minted = minted;
  await setState(env, 'last_sweep_at', String(Date.now()));
  await setState(env, 'last_sweep_report', JSON.stringify(report));
  return report;
}

// Returns true if a ticket was minted, or a short string reason if skipped.
async function sweepPost(env, pub, post, tag) {
  const postUri = post.uri;
  if (!postUri) return 'no-uri';
  const already = await env.DB.prepare('SELECT post_uri FROM io_sweep_seen WHERE post_uri = ?').bind(postUri).first();
  if (already) return 'already-seen';

  const text = (post.record && post.record.text) || '';
  if (text.replace(/#\w+/g, '').trim().length < 12) {
    // Bare-hashtag spam — mark seen so we don't re-check, but don't mint.
    await markSwept(env, postUri, null);
    return 'too-short';
  }

  const kind = inferKind(text);
  const title = firstLine(text).slice(0, 280) || `${kind} from @${post.author && post.author.handle || 'someone'}`;
  const site = inferSite(post);

  const record = {
    $type: IO_COLLECTION,
    kind,
    title,
    body: text,
    board: BOARD_ANCHOR,
    createdAt: new Date().toISOString(),
    source: {
      kind: 'swept',
      post: { uri: postUri, cid: post.cid },
      author: post.author && post.author.did,
    },
  };
  if (site) record.site = site;

  const result = await pub.createRecord(IO_COLLECTION, generateTid(), record);
  await markSwept(env, postUri, result.uri);
  // Eagerly cache so the board shows it before the next index pass.
  const parsed = parseAtUri(result.uri);
  if (parsed) await indexOne(env, parsed.did, parsed.rkey).catch(() => {});
  // "Tracked as…" reply in the original thread. DEFAULT OFF: replying to many
  // posts in a backfill pass looks like spam and got the service account
  // takendown once (AccountTakedown). Opt in explicitly with SWEEP_REPLY=on,
  // and only after the account is healthy + the backlog is already swept (so a
  // first run won't fan out replies to old posts). Best-effort; never blocks
  // the mint.
  if (env.SWEEP_REPLY === 'on') {
    await replyTracked(pub, post, kind).catch((e) => console.error('replyTracked', e));
  }
  return true;
}

// Post a reply from the service account into the swept post's thread, letting
// the author know it's been logged and linking the board. The reply is an
// ordinary app.bsky.feed.post with reply root/parent strongRefs + a link facet.
async function replyTracked(pub, post, kind) {
  if (!post.uri || !post.cid) return;
  const boardUrl = 'https://io.mino.mobi/board';
  const label = { bug: '🐞 bug', feature: '✨ feature request', idea: '💡 idea' }[kind] || '💡 idea';
  const text = `Tracked as a ${label} on the mino board — thanks! See it (and everything else swept from #atprotoideasio) here:\n${boardUrl}`;

  // Bluesky facets index by UTF-8 byte offset, not JS string index.
  const enc = new TextEncoder();
  const byteStart = enc.encode(text.slice(0, text.indexOf(boardUrl))).length;
  const byteEnd = byteStart + enc.encode(boardUrl).length;

  // Thread root: the swept post's own root if it's already a reply, else itself.
  const parentReply = post.record && post.record.reply;
  const root = (parentReply && parentReply.root) || { uri: post.uri, cid: post.cid };

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: root.uri, cid: root.cid },
      parent: { uri: post.uri, cid: post.cid },
    },
    facets: [{
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: boardUrl }],
    }],
  };
  await pub.createRecord('app.bsky.feed.post', generateTid(), record);
}

function inferKind(text) {
  const t = text.toLowerCase();
  if (/\b(bug|broken|crash|error|doesn'?t work|not working|fails?|500|404)\b/.test(t)) return 'bug';
  if (/\b(feature|request|add|support for|would love|please add|wish)\b/.test(t)) return 'feature';
  return 'idea';
}

function inferSite(post) {
  // Prefer an external link facet to a mino site; else any mino url in text.
  const facets = (post.record && post.record.facets) || [];
  for (const f of facets) {
    for (const feat of f.features || []) {
      if (feat.uri && /mino\.mobi|minomobi\.com/.test(feat.uri)) {
        try { return new URL(feat.uri).host; } catch { /* skip */ }
      }
    }
  }
  const m = (post.record && post.record.text || '').match(/([a-z0-9-]+\.)?(mino\.mobi|minomobi\.com)/i);
  return m ? m[0] : null;
}

async function markSwept(env, postUri, ticketUri) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO io_sweep_seen (post_uri, ticket_uri) VALUES (?, ?)'
  ).bind(postUri, ticketUri).run();
}

// ───────────────────────── Service-account publisher ───────────────────────

// Vendored from poll/packages/shared/src/atproto (PdsPublisher): app-password
// createSession → createRecord with a single 401 re-auth retry. Kept local so
// the single-file worker has no cross-package build dependency.
class ServicePublisher {
  constructor(env) {
    this.serviceUrl = env.ATPROTO_SERVICE_PDS || 'https://bsky.social';
    this.handle = env.ATPROTO_SERVICE_HANDLE;
    this.password = env.ATPROTO_SERVICE_PASSWORD;
    this.did = env.ATPROTO_SERVICE_DID || '';
    this.accessJwt = null;
  }
  async authenticate() {
    const res = await fetch(`${this.serviceUrl}/xrpc/com.atproto.server.createSession`, {
      method: 'POST', headers: JSON_HEADERS,
      body: JSON.stringify({ identifier: this.handle, password: this.password }),
    });
    if (!res.ok) throw new Error(`service auth failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    this.accessJwt = data.accessJwt;
    this.did = data.did;
  }
  async getToken() { if (!this.accessJwt) await this.authenticate(); return this.accessJwt; }
  // Authenticated read of an app.bsky.* XRPC method. The public appview now
  // 403s unauthenticated searchPosts; the service account's PDS service-proxies
  // app.bsky.* reads to the appview when we send a Bearer token.
  async authedGet(method, params) {
    const token = await this.getToken();
    const qs = new URLSearchParams(params).toString();
    let res = await fetch(`${this.serviceUrl}/xrpc/${method}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) { await this.authenticate(); return this.authedGet(method, params); }
    return res;
  }
  async createRecord(collection, rkey, record) {
    const token = await this.getToken();
    const res = await fetch(`${this.serviceUrl}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST', headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ repo: this.did, collection, rkey, record }),
    });
    if (!res.ok) {
      if (res.status === 401) { await this.authenticate(); return this.createRecord(collection, rkey, record); }
      throw new Error(`createRecord failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
}

// ─────────────────────────────── ATProto helpers ───────────────────────────

async function getRecord(did, collection, rkey) {
  const params = new URLSearchParams({ repo: did, collection, rkey });
  // Try the public API first; fall back to the author's PDS for non-app.bsky.* collections.
  let res = await fetch(`${BSKY_PUBLIC}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (!res.ok) {
    const pds = await resolvePds(did).catch(() => null);
    if (!pds) return null;
    res = await fetch(`${pds}/xrpc/com.atproto.repo.getRecord?${params}`);
    if (!res.ok) return null;
  }
  return res.json();
}

async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`https://plc.directory/${did}`);
    if (!res.ok) throw new Error('plc resolve failed');
    doc = await res.json();
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replaceAll(':', '/');
    const res = await fetch(`https://${host}/.well-known/did.json`);
    if (!res.ok) throw new Error('did:web resolve failed');
    doc = await res.json();
  } else {
    throw new Error('unsupported did');
  }
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer');
  if (!svc) throw new Error('no pds');
  return svc.serviceEndpoint;
}

async function resolveHandleFromDid(did) {
  try {
    const res = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.handle || null;
  } catch { return null; }
}

// ─────────────────────────────── small utils ───────────────────────────────

function parseAtUri(uri) {
  const m = /^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(uri || '');
  if (!m) return null;
  return { did: m[1], collection: m[2], rkey: m[3] };
}

// ATProto TID (timestamp id): 13-char base32-sortable. Good enough for rkeys.
const TID_ALPHABET = '234567abcdefghijklmnopqrstuvwxyz';
let _tidLast = 0;
function generateTid() {
  let now = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  if (now <= _tidLast) now = _tidLast + 1;
  _tidLast = now;
  let n = now;
  let s = '';
  for (let i = 0; i < 11; i++) { s = TID_ALPHABET[n % 32] + s; n = Math.floor(n / 32); }
  // 2-char clock identifier (random)
  const clk = TID_ALPHABET[Math.floor(Math.random() * 32)] + TID_ALPHABET[Math.floor(Math.random() * 32)];
  return (s + clk).slice(0, 13);
}

function firstLine(text) {
  return String(text || '').split('\n').map((l) => l.trim()).find((l) => l.length) || '';
}

function isAdmin(request, env) {
  // Open when no ADMIN_KEY is configured: the admin routes are low-stakes —
  // sweep/index are idempotent re-scans, triage only mutates D1 board state
  // (never writes to anyone's PDS). Setting an ADMIN_KEY secret re-locks them.
  if (!env.ADMIN_KEY) return true;
  return request.headers.get('X-Admin-Key') === env.ADMIN_KEY;
}

async function setState(env, k, v) {
  try {
    await env.DB.prepare('INSERT INTO io_sweep_state (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')
      .bind(k, v).run();
  } catch { /* table may not exist pre-migration */ }
}

function safeParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key',
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...corsHeaders() } });
}
