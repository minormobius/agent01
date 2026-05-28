// cATProto — cat pictures from the Bluesky firehose.
//
// Architecture:
//   - A singleton Durable Object (CatListener) holds an outbound WebSocket
//     to Jetstream, filtered to app.bsky.feed.post events. For each post it
//     extracts the first embedded image and the post's hashtags; if any
//     hashtag is in the cat list, the post is upserted into D1.
//   - The DO is kept warm by a per-minute cron (scheduled handler pings the
//     DO) and the DO's own alarm chain.
//   - The frontend reads /api/cat/feed for paginated recent cats and renders
//     them in an are.na-style masonry. Images come from Bluesky's public CDN
//     (cdn.bsky.app), so we never proxy blobs ourselves.
//
// The migration in poll/apps/api/migrations/0024_cat.sql owns the schema
// (cat_posts table); we share atpolls-db with the other projects.

const JETSTREAM_HOSTS = [
  'jetstream2.us-east.bsky.network',
  'jetstream1.us-east.bsky.network',
  'jetstream2.us-west.bsky.network',
  'jetstream1.us-west.bsky.network',
];

const CAT_HASHTAGS = new Set([
  'cat', 'cats', 'kitten', 'kittens', 'kitty', 'meow',
  'catsofbluesky', 'catsofbsky', 'catsofatproto', 'catsky',
  'caturday', 'catpic', 'catpics', 'catstagram', 'catsoftwitter',
  'catmeme', 'catmemes', 'cursedcats', 'cursedcat',
  'tortie', 'calico', 'tabby', 'tuxedo', 'blackcat', 'orangecat', 'ginger',
  'mainecoon', 'ragdoll', 'siamese', 'persian', 'bengal',
  'catlover', 'catlovers', 'catlife', 'catsofig',
  // ATProto-native cat tags people have organically used
  'catprotocol', 'catproto', 'catsfromthefirehose',
]);

// ───────────────────────────── Worker entry ──────────────────────────────

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/api/cat/health')       return await health(env);
      if (p === '/api/cat/feed')         return await feed(req, env);
      if (p === '/api/cat/tags')         return await tagCounts(env);
      if (p === '/api/cat/admin/kick')   return await kickListener(req, env);
      if (p === '/api/cat/admin/clear')  return await clearAll(req, env);
      // Touch the DO opportunistically so the WS stays alive even between
      // crons. waitUntil keeps it off the response critical path.
      ctx.waitUntil(touchListener(env).catch(() => {}));
      return env.ASSETS.fetch(req);
    } catch (e) {
      return new Response('error: ' + (e?.message || String(e)), { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(touchListener(env).catch(() => {}));
  },
};

async function touchListener(env) {
  const id = env.LISTENER.idFromName('global');
  const stub = env.LISTENER.get(id);
  await stub.fetch('https://internal/ping');
}

// ───────────────────────────── DO: Jetstream ─────────────────────────────

export class CatListener {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.ws = null;
    this.connecting = false;
    this.hostIdx = 0;
    this.inserts = 0;
    this.events = 0;
    this.lastEventAt = 0;
    this.lastInsertAt = 0;
    this.lastError = '';
    this.connectedAt = 0;

    state.blockConcurrencyWhile(async () => {
      const a = await state.storage.getAlarm();
      if (!a) await state.storage.setAlarm(Date.now() + 1500);
    });
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ping') {
      await this.ensureConnected();
      return Response.json({
        connected: !!(this.ws && this.ws.readyState === 1),
        host: JETSTREAM_HOSTS[this.hostIdx % JETSTREAM_HOSTS.length],
        connectedAt: this.connectedAt,
        events: this.events,
        inserts: this.inserts,
        lastEventAt: this.lastEventAt,
        lastInsertAt: this.lastInsertAt,
        lastError: this.lastError,
      });
    }
    if (url.pathname === '/kick') {
      try { this.ws?.close(); } catch {}
      this.ws = null;
      this.hostIdx++;                                          // rotate next attempt
      await this.ensureConnected();
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  async alarm() {
    await this.ensureConnected();
    // Re-arm every 60s. If we're idle (no events) for a while, force a
    // reconnect — jetstream sometimes goes quiet without closing.
    if (this.lastEventAt && Date.now() - this.lastEventAt > 180_000 && this.ws) {
      this.lastError = 'idle reconnect';
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    await this.state.storage.setAlarm(Date.now() + 60_000);
  }

  async ensureConnected() {
    if (this.connecting) return;
    if (this.ws && this.ws.readyState === 1) return;
    this.connecting = true;
    try {
      const host = JETSTREAM_HOSTS[this.hostIdx % JETSTREAM_HOSTS.length];
      const url = `https://${host}/subscribe?wantedCollections=${encodeURIComponent('app.bsky.feed.post')}`;
      const resp = await fetch(url, { headers: { Upgrade: 'websocket' } });
      if (resp.status !== 101 || !resp.webSocket) {
        this.lastError = `jetstream ${host}: HTTP ${resp.status}`;
        this.hostIdx++;                                        // try a different host next
        return;
      }
      const ws = resp.webSocket;
      ws.accept();
      this.ws = ws;
      this.connectedAt = Date.now();
      this.lastError = '';
      ws.addEventListener('message', (ev) => { this.handleMessage(ev).catch(e => { this.lastError = 'msg: ' + (e?.message || e); }); });
      ws.addEventListener('close', () => { this.ws = null; });
      ws.addEventListener('error', () => { this.ws = null; this.lastError = 'ws error'; });
    } catch (e) {
      this.lastError = 'connect: ' + (e?.message || String(e));
      this.hostIdx++;
    } finally {
      this.connecting = false;
    }
  }

  async handleMessage(ev) {
    this.events++;
    this.lastEventAt = Date.now();
    let data;
    try { data = JSON.parse(ev.data); } catch { return; }
    if (data.kind !== 'commit') return;
    const c = data.commit;
    if (!c || c.operation !== 'create' || c.collection !== 'app.bsky.feed.post') return;
    const rec = c.record;
    if (!rec) return;

    // Must have at least one embedded image.
    const images = extractImages(rec.embed);
    if (!images || images.length === 0) return;

    // Must carry at least one cat hashtag.
    const all = extractHashtags(rec);
    if (all.length === 0) return;
    const matched = all.filter(t => CAT_HASHTAGS.has(t));
    if (matched.length === 0) return;

    const img0 = images[0];
    const cid = blobCid(img0?.image);
    if (!cid) return;

    const uri = `at://${data.did}/${c.collection}/${c.rkey}`;
    const createdAt = Date.parse(rec.createdAt || '') || Date.now();
    const aspect = img0.aspectRatio || {};

    try {
      await this.env.DB.prepare(`
        INSERT OR IGNORE INTO cat_posts
          (uri, did, rkey, cid, text, langs, image_cid, image_alt,
           image_aspect_w, image_aspect_h, hashtags, created_at, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        uri, data.did, c.rkey, c.cid || '',
        truncate(rec.text || '', 1024),
        JSON.stringify(rec.langs || []),
        cid,
        truncate(img0.alt || '', 512),
        Number(aspect.width || 0) | 0,
        Number(aspect.height || 0) | 0,
        JSON.stringify(matched),
        createdAt, Date.now(),
      ).run();
      this.inserts++;
      this.lastInsertAt = Date.now();
    } catch (e) {
      this.lastError = 'insert: ' + (e?.message || String(e));
    }
  }
}

function extractImages(embed) {
  if (!embed) return null;
  if (embed.$type === 'app.bsky.embed.images') return embed.images;
  if (embed.$type === 'app.bsky.embed.recordWithMedia' &&
      embed.media?.$type === 'app.bsky.embed.images') return embed.media.images;
  return null;
}

function blobCid(blob) {
  if (!blob) return null;
  // canonical form: { $type: 'blob', ref: { $link: 'bafkrei...' }, ... }
  if (typeof blob.ref?.$link === 'string') return blob.ref.$link;
  if (typeof blob.ref === 'string') return blob.ref;
  if (typeof blob.cid === 'string') return blob.cid;       // legacy form
  return null;
}

function extractHashtags(rec) {
  const out = new Set();
  if (Array.isArray(rec.tags)) {
    for (const t of rec.tags) {
      const s = String(t).toLowerCase().replace(/^#/, '');
      if (s) out.add(s);
    }
  }
  if (Array.isArray(rec.facets)) {
    for (const f of rec.facets) {
      if (!Array.isArray(f.features)) continue;
      for (const feat of f.features) {
        if (feat.$type === 'app.bsky.richtext.facet#tag' && typeof feat.tag === 'string') {
          out.add(feat.tag.toLowerCase().replace(/^#/, ''));
        }
      }
    }
  }
  // Fallback: inline #tag in the text body.
  const text = rec.text || '';
  const re = /#([A-Za-z][A-Za-z0-9_]{0,63})/g;
  let m;
  while ((m = re.exec(text)) !== null) out.add(m[1].toLowerCase());
  return [...out];
}

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) : s;
}

// ───────────────────────────── HTTP endpoints ────────────────────────────

async function feed(req, env) {
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '40', 10) || 40));
  const cursor = parseInt(url.searchParams.get('cursor') || '0', 10) || 0;
  const tag = (url.searchParams.get('tag') || '').toLowerCase().replace(/^#/, '');

  const conds = [];
  const binds = [];
  if (cursor > 0) { conds.push('indexed_at < ?'); binds.push(cursor); }
  if (tag) { conds.push('hashtags LIKE ?'); binds.push(`%"${tag.replace(/"/g, '')}"%`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  binds.push(limit);
  const result = await env.DB.prepare(`
    SELECT uri, did, rkey, text, image_cid, image_alt, image_aspect_w, image_aspect_h,
           hashtags, created_at, indexed_at
    FROM cat_posts ${where}
    ORDER BY indexed_at DESC
    LIMIT ?
  `).bind(...binds).all();

  const items = (result.results || []).map(r => ({
    uri: r.uri,
    did: r.did,
    rkey: r.rkey,
    text: r.text || '',
    image: {
      cid: r.image_cid,
      alt: r.image_alt || '',
      aspect: { width: r.image_aspect_w || 0, height: r.image_aspect_h || 0 },
      thumb:    `https://cdn.bsky.app/img/feed_thumbnail/plain/${r.did}/${r.image_cid}@jpeg`,
      fullsize: `https://cdn.bsky.app/img/feed_fullsize/plain/${r.did}/${r.image_cid}@jpeg`,
    },
    hashtags:  safeJson(r.hashtags, []),
    createdAt: r.created_at,
    indexedAt: r.indexed_at,
    bskyUrl:   `https://bsky.app/profile/${r.did}/post/${r.rkey}`,
  }));
  const nextCursor = items.length === limit ? items[items.length - 1].indexedAt : null;
  return Response.json({ items, cursor: nextCursor }, {
    headers: { 'cache-control': 'public, max-age=20' },
  });
}

async function tagCounts(env) {
  // Approximate: scan recent 5k rows. Cheap and good enough for a tag cloud.
  const rows = await env.DB.prepare(`
    SELECT hashtags FROM cat_posts ORDER BY indexed_at DESC LIMIT 5000
  `).all();
  const counts = new Map();
  for (const r of rows.results || []) {
    for (const t of safeJson(r.hashtags, [])) {
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  return Response.json({ tags: top.map(([tag, n]) => ({ tag, n })) }, {
    headers: { 'cache-control': 'public, max-age=120' },
  });
}

async function health(env) {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n, MAX(indexed_at) AS last FROM cat_posts`).first();
  let listener = null;
  try {
    const id = env.LISTENER.idFromName('global');
    const stub = env.LISTENER.get(id);
    const r = await stub.fetch('https://internal/ping');
    listener = await r.json();
  } catch (e) {
    listener = { error: e?.message || String(e) };
  }
  return Response.json({
    ok: true,
    total: row?.n || 0,
    last_indexed_at: row?.last || null,
    now: Date.now(),
    listener,
  });
}

async function kickListener(req, env) {
  if (!checkAdmin(req, env)) return new Response('forbidden', { status: 403 });
  const id = env.LISTENER.idFromName('global');
  const stub = env.LISTENER.get(id);
  const r = await stub.fetch('https://internal/kick');
  return new Response(await r.text());
}

async function clearAll(req, env) {
  if (!checkAdmin(req, env)) return new Response('forbidden', { status: 403 });
  await env.DB.prepare('DELETE FROM cat_posts').run();
  return new Response('cleared');
}

function checkAdmin(req, env) {
  if (!env.ADMIN_KEY) return false;
  return (req.headers.get('x-admin-key') || '') === env.ADMIN_KEY;
}

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
