// index.js — the parts index: a Reddit-shaped view over records that live in
// people's own repos. No record is stored here that a repo does not hold;
// this is a cache that can be rebuilt from the network, and it is rebuilt
// from the network, not from a firehose:
//
//   • indexRepo(did)  lists the four collections from that repo's PDS and
//                     makes the index agree with it — upserts, and deletes
//                     what the repo no longer has. Idempotent. Writers call
//                     it right after they write (the site does), so a post
//                     appears the moment it exists.
//   • sweep()         discovers repos nobody told us about through
//                     Constellation, the network backlink index: who links to
//                     each community (posts), to each post (comments, votes),
//                     to each comment (replies, votes). Every DID it finds is
//                     indexed. Runs from a cron. Bounded per run.
//
// Why not Jetstream: holding a firehose socket open keeps a Durable Object
// resident around the clock, which the hose surface measured at most of the
// account's duration allowance — to watch for a handful of CAD records a
// day. Backlinks plus self-reporting cover the same ground for a few HTTP
// calls an hour, and the record of truth is the repo either way.
//
//   com.minomobi.cad.community  { name, title, description, rules?, createdAt }         in the founder's repo; rkey = the slug
//   com.minomobi.cad.post       { community: strongRef, part: strongRef (a REVISION), title, text?, createdAt }
//   com.minomobi.cad.comment    { post: strongRef, parent?: strongRef (a comment), text, createdAt }
//   com.minomobi.cad.vote       { subject: strongRef (post or comment), value: 1 | -1, createdAt }
//
// A post references a revision, not a head, so what people voted on cannot
// change under them; the part's history is one hop away. A vote is a record
// the voter owns, counted here; there is no counter anyone can write.
//
// The db seam: `db.run(sql, ...params)` executes; `db.all(sql, ...params)`
// returns rows as objects. worker.js provides it over the Durable Object's
// SQLite storage; the selftest over node:sqlite.

export const NS = 'com.minomobi.cad';
export const COMMUNITY = `${NS}.community`;
export const POST = `${NS}.post`;
export const COMMENT = `${NS}.comment`;
export const VOTE = `${NS}.vote`;
export const COLLECTIONS = [COMMUNITY, POST, COMMENT, VOTE];
export const SCOPE = `atproto ${COLLECTIONS.map((c) => `repo:${c}`).join(' ')}`;
export const SLUG = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS repos (did TEXT PRIMARY KEY, pds TEXT, indexed_at INTEGER NOT NULL, ok INTEGER NOT NULL DEFAULT 1, error TEXT);
CREATE TABLE IF NOT EXISTS communities (uri TEXT PRIMARY KEY, cid TEXT, did TEXT NOT NULL, rkey TEXT NOT NULL, name TEXT NOT NULL, title TEXT, description TEXT, rules TEXT, created_at TEXT, seen_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS posts (uri TEXT PRIMARY KEY, cid TEXT, did TEXT NOT NULL, rkey TEXT NOT NULL, community TEXT NOT NULL, part_uri TEXT NOT NULL, part_cid TEXT, title TEXT NOT NULL, text TEXT, created_at TEXT, created_ms INTEGER NOT NULL, seen_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS posts_community ON posts(community, created_ms);
CREATE TABLE IF NOT EXISTS comments (uri TEXT PRIMARY KEY, cid TEXT, did TEXT NOT NULL, rkey TEXT NOT NULL, post TEXT NOT NULL, parent TEXT, text TEXT NOT NULL, created_at TEXT, created_ms INTEGER NOT NULL, seen_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post, created_ms);
CREATE TABLE IF NOT EXISTS votes (uri TEXT PRIMARY KEY, cid TEXT, did TEXT NOT NULL, rkey TEXT NOT NULL, subject TEXT NOT NULL, value INTEGER NOT NULL, created_at TEXT, seen_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS votes_subject ON votes(subject);
CREATE UNIQUE INDEX IF NOT EXISTS votes_one ON votes(did, subject);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`;

// ── identity ──────────────────────────────────────────────────────────────
export async function resolveDid(repo, f = fetch) {
  if (repo.startsWith('did:')) return repo;
  const r = await f(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(repo)}`);
  if (!r.ok) throw new Error(`cannot resolve handle ${repo}`);
  return (await r.json()).did;
}
export async function resolvePds(did, f = fetch) {
  const url = did.startsWith('did:plc:') ? `https://plc.directory/${did}` : did.startsWith('did:web:') ? `https://${did.slice(8)}/.well-known/did.json` : null;
  if (!url) throw new Error(`unsupported DID ${did}`);
  const r = await f(url);
  if (!r.ok) throw new Error(`cannot resolve ${did}`);
  const svc = (await r.json()).service?.find((s) => s.id === '#atproto_pds');
  if (!svc) throw new Error(`no PDS for ${did}`);
  return svc.serviceEndpoint.replace(/\/$/, '');
}
export async function listAll(pds, did, collection, f = fetch) {
  const out = []; let cursor;
  do {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`); u.searchParams.set('repo', did); u.searchParams.set('collection', collection); u.searchParams.set('limit', '100'); if (cursor) u.searchParams.set('cursor', cursor);
    const r = await f(u); if (r.status === 400 || r.status === 404) return out; if (!r.ok) throw new Error(`listRecords ${collection} ${r.status}`);
    const j = await r.json(); out.push(...(j.records || [])); cursor = j.cursor;
  } while (cursor && out.length < 5000);
  return out;
}

// ── shaping ───────────────────────────────────────────────────────────────
const rkeyOf = (uri) => uri.slice(uri.lastIndexOf('/') + 1);
const ms = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : 0; };
const ref = (x) => (x && typeof x === 'object' && typeof x.uri === 'string' ? x : null);
const str = (x, n = 4000) => (typeof x === 'string' ? x.slice(0, n) : null);

/** Validate a record the way the index will store it; null means "not ours, skip". */
export function shape(collection, uri, cid, did, value) {
  const now = Date.now();
  if (!value || typeof value !== 'object') return null;
  switch (collection) {
    case COMMUNITY: {
      const rkey = rkeyOf(uri); const name = str(value.name, 40) || rkey;
      if (!SLUG.test(rkey) || name !== rkey) return null; // the slug is the key, and the record must agree with it
      return { uri, cid, did, rkey, name, title: str(value.title, 120), description: str(value.description, 2000), rules: str(value.rules, 4000), created_at: str(value.createdAt, 40), seen_at: now };
    }
    case POST: {
      const c = ref(value.community), p = ref(value.part); const title = str(value.title, 300);
      if (!c || !p || !title || !c.uri.includes(`/${COMMUNITY}/`) || !p.uri.includes('/com.minomobi.cad.revision/')) return null;
      return { uri, cid, did, rkey: rkeyOf(uri), community: c.uri, part_uri: p.uri, part_cid: str(p.cid, 200), title, text: str(value.text, 10000), created_at: str(value.createdAt, 40), created_ms: ms(value.createdAt), seen_at: now };
    }
    case COMMENT: {
      const p = ref(value.post), parent = ref(value.parent); const text = str(value.text, 10000);
      if (!p || !text || !p.uri.includes(`/${POST}/`)) return null;
      if (parent && !parent.uri.includes(`/${COMMENT}/`)) return null;
      return { uri, cid, did, rkey: rkeyOf(uri), post: p.uri, parent: parent?.uri || null, text, created_at: str(value.createdAt, 40), created_ms: ms(value.createdAt), seen_at: now };
    }
    case VOTE: {
      const s = ref(value.subject); const v = value.value === -1 ? -1 : value.value === 1 ? 1 : 0;
      if (!s || !v || !(s.uri.includes(`/${POST}/`) || s.uri.includes(`/${COMMENT}/`))) return null;
      return { uri, cid, did, rkey: rkeyOf(uri), subject: s.uri, value: v, created_at: str(value.createdAt, 40), seen_at: now };
    }
    default: return null;
  }
}

const TABLE = { [COMMUNITY]: 'communities', [POST]: 'posts', [COMMENT]: 'comments', [VOTE]: 'votes' };

// ── the index ─────────────────────────────────────────────────────────────
export class Index {
  constructor(db, { fetch: f, constellation, now } = {}) {
    this.db = db; this.fetch = f || globalThis.fetch.bind(globalThis); this.constellation = constellation || 'https://constellation.microcosm.blue'; this.now = now || (() => Date.now());
    for (const stmt of SCHEMA.split(';')) if (stmt.trim()) db.run(stmt);
  }

  upsert(collection, row) {
    const table = TABLE[collection]; const cols = Object.keys(row);
    if (collection === VOTE) this.db.run(`DELETE FROM votes WHERE did = ? AND subject = ? AND uri <> ?`, row.did, row.subject, row.uri); // one vote per person per subject: the newest record wins
    this.db.run(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map((c) => row[c]));
  }

  /** Make the index agree with one repo. Returns what changed. */
  async indexRepo(repo) {
    const did = await resolveDid(repo, this.fetch);
    const now = this.now();
    let pds;
    try { pds = await resolvePds(did, this.fetch); }
    catch (e) { this.db.run(`INSERT OR REPLACE INTO repos (did, pds, indexed_at, ok, error) VALUES (?, NULL, ?, 0, ?)`, did, now, String(e.message)); throw e; }
    const changed = { did, added: 0, updated: 0, removed: 0, skipped: 0 };
    for (const collection of COLLECTIONS) {
      const table = TABLE[collection];
      const have = new Map(this.db.all(`SELECT uri, cid FROM ${table} WHERE did = ?`, did).map((r) => [r.uri, r.cid]));
      const seen = new Set();
      for (const rec of await listAll(pds, did, collection, this.fetch)) {
        const row = shape(collection, rec.uri, rec.cid, did, rec.value);
        if (!row) { changed.skipped++; continue; }
        seen.add(rec.uri);
        const prev = have.get(rec.uri);
        if (prev === rec.cid) continue;
        this.upsert(collection, row); if (prev === undefined) changed.added++; else changed.updated++;
      }
      for (const uri of have.keys()) if (!seen.has(uri)) { this.db.run(`DELETE FROM ${table} WHERE uri = ?`, uri); changed.removed++; }
    }
    this.db.run(`INSERT OR REPLACE INTO repos (did, pds, indexed_at, ok, error) VALUES (?, ?, ?, 1, NULL)`, did, pds, now);
    return changed;
  }

  /** DIDs that link to `target` through (collection, path), from Constellation. */
  async linkers(target, collection, path) {
    const dids = new Set(); let cursor;
    for (let page = 0; page < 5; page++) {
      const u = new URL(`${this.constellation}/links`); u.searchParams.set('target', target); u.searchParams.set('collection', collection); u.searchParams.set('path', path); u.searchParams.set('limit', '100'); if (cursor) u.searchParams.set('cursor', cursor);
      const r = await this.fetch(u, { headers: { 'user-agent': 'parts.mino.mobi (+https://github.com/minormobius)' } });
      if (!r.ok) throw new Error(`constellation ${r.status}`);
      const j = await r.json();
      for (const x of j.linking_records || []) if (x.did) dids.add(x.did);
      cursor = j.cursor; if (!cursor) break;
    }
    return [...dids];
  }

  /** Discover and index repos through backlinks, then refresh the stalest known repos. Bounded.
   *  Discovery runs in rounds: a post found in round one is a target for comments and votes in round two. */
  async sweep({ maxRepos = 25, staleMs = 6 * 3600e3, rounds = 3 } = {}) {
    const now = this.now();
    const report = { discovered: 0, refreshed: 0, errors: [] };
    const known = new Set(this.db.all(`SELECT did FROM repos`).map((r) => r.did));
    const fresh = new Set(this.db.all(`SELECT did FROM repos WHERE indexed_at > ?`, now - staleMs).map((r) => r.did));
    const asked = new Set(); const done = new Set(); let budget = maxRepos;
    for (let round = 0; round < rounds && budget > 0; round++) {
      const targets = [
        ...this.db.all(`SELECT uri FROM communities ORDER BY seen_at DESC LIMIT 200`).map((r) => [r.uri, POST, '.community.uri']),
        ...this.db.all(`SELECT uri FROM posts ORDER BY created_ms DESC LIMIT 200`).flatMap((r) => [[r.uri, COMMENT, '.post.uri'], [r.uri, VOTE, '.subject.uri']]),
        ...this.db.all(`SELECT uri FROM comments ORDER BY created_ms DESC LIMIT 200`).flatMap((r) => [[r.uri, COMMENT, '.parent.uri'], [r.uri, VOTE, '.subject.uri']]),
      ].filter((t) => !asked.has(t.join(' ')));
      if (!targets.length) break;
      const todo = new Set();
      for (const t of targets) {
        asked.add(t.join(' '));
        try { for (const did of await this.linkers(...t)) if (!done.has(did) && !fresh.has(did)) todo.add(did); } catch (e) { report.errors.push(`${t[0]}: ${e.message}`); if (report.errors.length > 5) break; }
      }
      let newRows = false;
      for (const did of todo) {
        if (budget-- <= 0) break;
        done.add(did);
        try { const c = await this.indexRepo(did); if (c.added || c.updated || c.removed) newRows = true; known.has(did) ? report.refreshed++ : report.discovered++; known.add(did); }
        catch (e) { report.errors.push(`${did}: ${e.message}`); }
      }
      if (!newRows) break;
    }
    for (const r of this.db.all(`SELECT did FROM repos WHERE indexed_at <= ? ORDER BY indexed_at ASC LIMIT ?`, now - staleMs, Math.max(0, budget))) {
      if (done.has(r.did)) continue;
      try { await this.indexRepo(r.did); report.refreshed++; } catch (e) { report.errors.push(`${r.did}: ${e.message}`); }
    }
    this.db.run(`INSERT OR REPLACE INTO meta (k, v) VALUES ('last_sweep', ?)`, String(now));
    return report;
  }

  // ── reads ───────────────────────────────────────────────────────────────
  score(subject) { const r = this.db.all(`SELECT COALESCE(SUM(value), 0) AS s, COUNT(*) AS n FROM votes WHERE subject = ?`, subject)[0]; return { score: r.s, votes: r.n }; }
  scores(subjects) {
    if (!subjects.length) return new Map();
    const rows = this.db.all(`SELECT subject, COALESCE(SUM(value), 0) AS s, COUNT(*) AS n FROM votes WHERE subject IN (${subjects.map(() => '?').join(',')}) GROUP BY subject`, ...subjects);
    const m = new Map(subjects.map((s) => [s, { score: 0, votes: 0 }])); for (const r of rows) m.set(r.subject, { score: r.s, votes: r.n }); return m;
  }
  commentCounts(posts) {
    if (!posts.length) return new Map();
    const rows = this.db.all(`SELECT post, COUNT(*) AS n FROM comments WHERE post IN (${posts.map(() => '?').join(',')}) GROUP BY post`, ...posts);
    const m = new Map(posts.map((p) => [p, 0])); for (const r of rows) m.set(r.post, r.n); return m;
  }
  /** Reddit's hot: sign · log10(max(|score|, 1)) + age term, ages in 45000-second steps. */
  static hot(score, createdMs) { const order = Math.log10(Math.max(Math.abs(score), 1)); const sign = score > 0 ? 1 : score < 0 ? -1 : 0; return sign * order + (createdMs / 1000 - 1134028003) / 45000; }

  decorate(posts) {
    const s = this.scores(posts.map((p) => p.uri)), c = this.commentCounts(posts.map((p) => p.uri));
    const names = new Map(this.db.all(`SELECT uri, name, title FROM communities`).map((r) => [r.uri, r]));
    return posts.map((p) => ({ ...p, ...s.get(p.uri), comments: c.get(p.uri), communityName: names.get(p.community)?.name || null, hot: Index.hot(s.get(p.uri).score, p.created_ms) }));
  }
  communities() {
    const rows = this.db.all(`SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.community = c.uri) AS posts FROM communities c ORDER BY posts DESC, seen_at DESC`);
    return rows.map(({ seen_at, ...c }) => c);
  }
  community(uri) { const r = this.db.all(`SELECT * FROM communities WHERE uri = ?`, uri)[0]; if (!r) return null; const { seen_at, ...c } = r; return { ...c, posts: this.db.all(`SELECT COUNT(*) AS n FROM posts WHERE community = ?`, uri)[0].n }; }
  communityByName(name) { const r = this.db.all(`SELECT uri FROM communities WHERE name = ? ORDER BY seen_at ASC LIMIT 1`, name)[0]; return r ? this.community(r.uri) : null; }
  feed({ community = null, sort = 'hot', limit = 50 } = {}) {
    const rows = community ? this.db.all(`SELECT * FROM posts WHERE community = ? ORDER BY created_ms DESC LIMIT 500`, community) : this.db.all(`SELECT * FROM posts WHERE community IN (SELECT uri FROM communities) ORDER BY created_ms DESC LIMIT 500`);
    const posts = this.decorate(rows.map(({ seen_at, ...p }) => p));
    if (sort === 'hot') posts.sort((a, b) => b.hot - a.hot); else if (sort === 'top') posts.sort((a, b) => b.score - a.score || b.created_ms - a.created_ms); else posts.sort((a, b) => b.created_ms - a.created_ms);
    return posts.slice(0, limit);
  }
  post(uri) { const r = this.db.all(`SELECT * FROM posts WHERE uri = ?`, uri)[0]; if (!r) return null; const { seen_at, ...p } = r; return this.decorate([p])[0]; }
  /** A post's comments as a tree, each with its score, oldest-first within a level (or by score with sort 'top'). */
  thread(postUri, { sort = 'top' } = {}) {
    const rows = this.db.all(`SELECT * FROM comments WHERE post = ? ORDER BY created_ms ASC`, postUri).map(({ seen_at, ...c }) => c);
    const s = this.scores(rows.map((c) => c.uri));
    const byUri = new Map(rows.map((c) => [c.uri, { ...c, ...s.get(c.uri), replies: [] }]));
    const roots = [];
    for (const c of byUri.values()) { const p = c.parent && byUri.get(c.parent); (p ? p.replies : roots).push(c); }
    const order = (list) => { if (sort === 'top') list.sort((a, b) => b.score - a.score || a.created_ms - b.created_ms); for (const c of list) order(c.replies); return list; };
    return order(roots);
  }
  /** What one account has voted on, so a page can light the arrows. */
  mine(did) { return Object.fromEntries(this.db.all(`SELECT subject, value, uri FROM votes WHERE did = ?`, did).map((r) => [r.subject, { value: r.value, uri: r.uri }])); }
  status() {
    const n = (t) => this.db.all(`SELECT COUNT(*) AS n FROM ${t}`)[0].n;
    const last = this.db.all(`SELECT v FROM meta WHERE k = 'last_sweep'`)[0]?.v;
    return { repos: n('repos'), communities: n('communities'), posts: n('posts'), comments: n('comments'), votes: n('votes'), lastSweep: last ? Number(last) : null };
  }
}
