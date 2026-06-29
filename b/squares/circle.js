// /api/squares/circle — server-side "closest circle" computation for the
// squares toy. Moves the heavy fan-out (the seed's repo scan + a best-picture
// probe per close account) off the browser and onto the Worker, where the
// fetches run parallel and edge-local. AppView reads carry a service-account
// token (prefer modulo) so they get the authed — higher — rate limit; the
// bulk repo scan hits the PDS directly (unauthed, not the bottleneck).
// Read-only public data, no writes.

const PUB = 'https://public.api.bsky.app/xrpc'; // unauthed AppView reads
const APP = 'https://api.bsky.app/xrpc';        // authed AppView reads (Bearer)
const W = { like: 1, repost: 2, reply: 3, quote: 4 }; // interaction weights

// page ceilings (per collection / per author feed) — bound subrequests + time
const MAX_LIKE_PAGES = 20, MAX_REPOST_PAGES = 8, MAX_POST_PAGES = 12, FEED_PAGES = 3;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const authorOf = (uri) => (uri && uri.startsWith('at://')) ? uri.slice(5).split('/')[0] : null;

async function jget(url, headers) {
  const r = await fetch(url, headers ? { headers } : undefined);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// AppView read: authed (api.bsky.app) when a token is present, else public.
function appGet(method, params, token) {
  const u = new URL(`${token ? APP : PUB}/${method}`);
  for (const k in params) {
    const v = params[k];
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x));
    else if (v != null && v !== '') u.searchParams.set(k, v);
  }
  return jget(u.toString(), token ? { Authorization: `Bearer ${token}` } : null);
}

// authed read, but transparently retry on the public AppView if the authed
// host rejects/throws — so a token quirk never breaks the toy.
async function appGetSafe(method, params, token) {
  try { return await appGet(method, params, token); }
  catch (e) { if (token) { try { return await appGet(method, params, null); } catch {} } throw e; }
}

async function resolveActor(actor) {
  const a = (actor || '').trim().replace(/^@/, '').replace(/^at:\/\//, '')
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, '').split('/')[0];
  if (!a) throw new Error('empty handle');
  if (a.startsWith('did:')) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
}

async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) doc = await jget(`https://plc.directory/${did}`);
  else if (did.startsWith('did:web:')) doc = await jget(`https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`);
  else throw new Error('unsupported DID method');
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds');
  if (!svc) throw new Error('no PDS in DID doc');
  return svc.serviceEndpoint;
}

// Paginate a repo collection newest-first, stop once records fall before sinceMs.
async function scan(pds, did, collection, sinceMs, maxPages, onRec) {
  let cursor = '', stop = false;
  for (let p = 0; p < maxPages && !stop; p++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', did);
    u.searchParams.set('collection', collection);
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    let d; try { d = await jget(u.toString()); } catch { break; }
    const recs = d.records || [];
    for (const rec of recs) {
      const t = rec.value && rec.value.createdAt ? Date.parse(rec.value.createdAt) : 0;
      if (t && t < sinceMs) { stop = true; break; }
      onRec(rec);
    }
    if (!d.cursor || recs.length === 0) break;
    cursor = d.cursor;
  }
}

function extractImage(embed) {
  if (!embed) return null;
  const fromImages = (im) => im && im.images && im.images.length
    ? { thumb: im.images[0].thumb, full: im.images[0].fullsize || im.images[0].thumb, alt: im.images[0].alt || '', count: im.images.length }
    : null;
  if (embed.$type === 'app.bsky.embed.images#view') return fromImages(embed);
  if (embed.$type === 'app.bsky.embed.recordWithMedia#view' && embed.media) {
    if (embed.media.$type === 'app.bsky.embed.images#view') return fromImages(embed.media);
    if (embed.media.$type === 'app.bsky.embed.video#view' && embed.media.thumbnail)
      return { thumb: embed.media.thumbnail, full: embed.media.thumbnail, alt: embed.media.alt || '', count: 1, video: true };
  }
  if (embed.$type === 'app.bsky.embed.video#view' && embed.thumbnail)
    return { thumb: embed.thumbnail, full: embed.thumbnail, alt: embed.alt || '', count: 1, video: true };
  return null;
}

// Most-liked image post by `did` within the window.
async function bestPicture(did, sinceMs, token) {
  let cursor, best = null, pages = 0;
  do {
    let d;
    try { d = await appGetSafe('app.bsky.feed.getAuthorFeed', { actor: did, limit: 100, filter: 'posts_no_replies', cursor }, token); }
    catch { break; }
    const feed = d.feed || [];
    let oldest = Infinity;
    for (const item of feed) {
      const post = item.post; if (!post) continue;
      if (item.reason && (item.reason.$type || '').includes('Repost')) continue; // own posts only
      if (post.author && post.author.did !== did) continue;
      const t = Date.parse(post.indexedAt || (post.record && post.record.createdAt) || 0) || 0;
      if (t < oldest) oldest = t;
      if (!t || t < sinceMs) continue;
      const img = extractImage(post.embed); if (!img) continue;
      const likes = post.likeCount || 0;
      if (!best || likes > best.likes) best = { ...img, likes, uri: post.uri };
    }
    cursor = d.cursor; pages++;
    if (oldest < sinceMs) break; // page reached past the window
  } while (cursor && pages < FEED_PAGES);
  return best;
}

// short per-isolate cache so re-clicks / back-nav are instant and the APIs stay happy
const CACHE = new Map();
const TTL = 90 * 1000, CMAX = 200;

export async function circle(params, env, token) {
  const seedRaw = params.get('seed');
  if (!seedRaw) { const e = new Error('seed handle required'); e.status = 400; throw e; }
  const windowMs = clamp(parseInt(params.get('window'), 10) || 604800000, 3600000, 7776000000);
  const n = clamp(parseInt(params.get('n'), 10) || 12, 1, 20);

  const seedDid = await resolveActor(seedRaw);
  const ckey = `${seedDid}|${windowMs}|${n}`;
  const hit = CACHE.get(ckey);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const sinceMs = Date.now() - windowMs;
  const pds = await resolvePds(seedDid);

  const counts = new Map();
  const add = (did, type) => {
    if (!did || did === seedDid) return;
    let e = counts.get(did);
    if (!e) { e = { did, like: 0, repost: 0, reply: 0, quote: 0, score: 0 }; counts.set(did, e); }
    e[type]++; e.score += W[type];
  };

  // three independent repo scans, in parallel
  await Promise.all([
    scan(pds, seedDid, 'app.bsky.feed.like', sinceMs, MAX_LIKE_PAGES,
      (rec) => add(authorOf(rec.value && rec.value.subject && rec.value.subject.uri), 'like')),
    scan(pds, seedDid, 'app.bsky.feed.repost', sinceMs, MAX_REPOST_PAGES,
      (rec) => add(authorOf(rec.value && rec.value.subject && rec.value.subject.uri), 'repost')),
    scan(pds, seedDid, 'app.bsky.feed.post', sinceMs, MAX_POST_PAGES, (rec) => {
      const v = rec.value || {};
      if (v.reply && v.reply.parent && v.reply.parent.uri) add(authorOf(v.reply.parent.uri), 'reply');
      const emb = v.embed; let qu = null;
      if (emb) {
        if (emb.$type === 'app.bsky.embed.record' && emb.record) qu = emb.record.uri;
        else if (emb.$type === 'app.bsky.embed.recordWithMedia' && emb.record && emb.record.record) qu = emb.record.record.uri;
      }
      if (qu && qu.includes('/app.bsky.feed.post/')) add(authorOf(qu), 'quote');
    }),
  ]);

  const ranked = [...counts.values()].sort((a, b) => b.score - a.score || (b.like + b.repost) - (a.like + a.repost));
  const top = ranked.slice(0, n);

  // profiles (seed + candidates) + best pictures, all concurrent
  const ids = [seedDid, ...top.map((c) => c.did)];
  const profMap = new Map();
  const [, pics] = await Promise.all([
    (async () => {
      for (let i = 0; i < ids.length; i += 25) {
        try {
          const d = await appGetSafe('app.bsky.actor.getProfiles', { actors: ids.slice(i, i + 25) }, token);
          for (const p of (d.profiles || [])) profMap.set(p.did, p);
        } catch {}
      }
    })(),
    Promise.all(top.map((c) => bestPicture(c.did, sinceMs, token).catch(() => null))),
  ]);

  const sp = profMap.get(seedDid) || { did: seedDid };
  const data = {
    seed: { did: seedDid, handle: sp.handle || seedRaw.replace(/^@/, ''), displayName: sp.displayName || '', avatar: sp.avatar || null },
    window: windowMs,
    candidates: ranked.length,
    authed: !!token,
    tiles: top.map((c, i) => {
      const p = profMap.get(c.did) || {};
      const pic = pics[i];
      return {
        did: c.did, handle: p.handle || c.did, displayName: p.displayName || '', avatar: p.avatar || null,
        score: c.score, counts: { like: c.like, repost: c.repost, reply: c.reply, quote: c.quote },
        pic: pic ? { thumb: pic.thumb, full: pic.full, alt: pic.alt, likes: pic.likes, uri: pic.uri, video: !!pic.video } : null,
      };
    }),
  };

  if (CACHE.size >= CMAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(ckey, { at: Date.now(), data });
  return data;
}
