// parts — parts.mino.mobi. The Reddit-shaped front for CAD parts: one static
// page, one Durable Object holding the index in its own SQLite, one cron.
//
// Nothing here owns a post. Communities, posts, comments and votes are
// records in their authors' repos (lib/index.js names the four collections);
// this worker keeps a cache that is rebuilt from the network and serves it.
//
//   GET  /api/status                       what the index holds, when it last swept
//   GET  /api/communities
//   GET  /api/community?name=clocks | ?uri=at://…
//   GET  /api/feed?[community=at://…]&sort=hot|new|top
//   GET  /api/post?uri=at://…              one post with its score and comment count
//   GET  /api/thread?uri=at://…            its comments as a tree
//   GET  /api/mine?did=did:…               that account's votes, by subject
//   POST /api/index?repo=<did|handle>      make the index agree with one repo — the site calls this after every write
//   POST /api/sweep                        discover through backlinks and refresh stale repos — the cron calls this
//
// The index object is a singleton (idFromName('index')); every API request is
// forwarded to it, so reads and writes see one SQLite. Sweeps are serialised
// inside the object with a flag, so an overlapping cron tick is a no-op.

import { Index } from './lib/index.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': status === 200 ? 'public, max-age=15' : 'no-store' } });

/** The API over one Index. `state.sweeping` serialises sweeps. Shared by the Durable Object and the browser selftest's server. */
export async function handleApi(ix, request, state = {}) {
  const url = new URL(request.url); const p = url.pathname; const q = url.searchParams;
  try {
    if (p === '/api/status') return json({ ok: true, ...ix.status(), sweeping: !!state.sweeping });
    if (p === '/api/communities') return json({ communities: ix.communities() });
    if (p === '/api/community') { const c = q.get('uri') ? ix.community(q.get('uri')) : q.get('name') ? ix.communityByName(q.get('name')) : null; return c ? json({ community: c, posts: ix.feed({ community: c.uri, sort: q.get('sort') || 'hot' }) }) : json({ error: 'no such community' }, 404); }
    if (p === '/api/feed') return json({ posts: ix.feed({ community: q.get('community') || null, sort: q.get('sort') || 'hot', limit: Math.min(Number(q.get('limit')) || 50, 200) }) });
    if (p === '/api/post') { const post = ix.post(q.get('uri') || ''); return post ? json({ post, community: ix.community(post.community) }) : json({ error: 'no such post' }, 404); }
    if (p === '/api/thread') return json({ comments: ix.thread(q.get('uri') || '', { sort: q.get('sort') || 'top' }) });
    if (p === '/api/mine') return json({ votes: ix.mine(q.get('did') || '') });
    if (p === '/api/index') {
      if (request.method !== 'POST') return json({ error: 'POST' }, 405);
      const repo = q.get('repo'); if (!repo) return json({ error: 'repo is required' }, 400);
      try { return json(await ix.indexRepo(repo), 200); } catch (e) { return json({ error: String(e?.message ?? e) }, 502); }
    }
    if (p === '/api/sweep') {
      if (request.method !== 'POST') return json({ error: 'POST' }, 405);
      if (state.sweeping) return json({ ok: true, skipped: 'a sweep is already running' });
      state.sweeping = true;
      try { return json({ ok: true, ...(await ix.sweep({ maxRepos: 25 })) }); } finally { state.sweeping = false; }
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
}

export class PartsIndex {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    const sql = ctx.storage.sql;
    this.db = { run: (q, ...p) => { sql.exec(q, ...p); }, all: (q, ...p) => sql.exec(q, ...p).toArray() };
    this.index = new Index(this.db);
    this.state = { sweeping: false };
  }
  fetch(request) { return handleApi(this.index, request, this.state); }
}

const indexStub = (env) => env.INDEX.get(env.INDEX.idFromName('index'));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
      const res = await indexStub(env).fetch(request);
      return res;
    }
    return env.ASSETS.fetch(request);
  },
  // Every 15 minutes: discover through backlinks, refresh what is stale. Bounded inside the object.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(indexStub(env).fetch(new Request('https://parts.mino.mobi/api/sweep', { method: 'POST' })));
  },
};
