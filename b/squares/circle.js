// /api/squares/circle — server-side "closest circle" computation for the
// squares toy. Moves the heavy fan-out (the seed's repo scan + a best-picture
// probe per close account) off the browser and onto the Worker, where the
// fetches run parallel and edge-local. AppView reads carry a service-account
// token (prefer modulo) so they get the authed — higher — rate limit; the
// bulk repo scan hits the PDS directly (unauthed, not the bottleneck).
// Read-only public data, no writes.
//
// THE RANKING IS NOT HERE ANY MORE. Who a handle is closest to — the three repo
// scans, the weights, the sort — moved to ../lib/closeness.js when /orbit
// needed the same circle around a different centre. What is left here is the
// part that is actually about squares: the best picture each of them posted.
import {
  BUDGET, appGetSafe, clamp, interactionCounts, profilesFor, rank,
  resolveActor, resolvePds,
} from '../lib/closeness.js';

// page ceiling for the per-account picture probe
const FEED_PAGES = 3;

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

  const counts = await interactionCounts(pds, seedDid, sinceMs, BUDGET);
  const ranked = rank(counts);
  const top = ranked.slice(0, n);

  // profiles (seed + candidates) + best pictures, all concurrent
  const ids = [seedDid, ...top.map((c) => c.did)];
  const [profMap, pics] = await Promise.all([
    profilesFor(ids, token),
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
