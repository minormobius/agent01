// /api/orbit/* — the worker half of the orbit game.
//
// Three endpoints, all read-only public data, no writes and no auth:
//
//   /api/orbit/circle?seed=&window=&n=&mutuals=  → the ring
//   /api/orbit/deck?dids=a,b,c                   → every card the ring can deal
//   /api/orbit/av?u=<cdn.bsky.app url>           → one avatar, with CORS
//
// WHY THE FAN-OUT IS HERE AND NOT IN THE BROWSER. The ring is one repo scan;
// the deck is one author-feed page per member, twelve of them. Done in the tab
// that is twelve round trips on a phone before the first card appears, and the
// AppView rate-limits per IP. Done here they are parallel, edge-local, and
// carry the service token's higher limit. /groom deliberately does the opposite
// — a thousand feed reads per visitor would share one Cloudflare egress IP and
// throttle the second visitor — but a dozen is not a thousand.
//
// WHY THE WHOLE DECK ARRIVES AT ONCE. "Draw more posts" has to be instant, and
// re-querying twelve feeds to deal twenty more cards would be a second wait for
// a button that should feel free. One fetch, then every subsequent hand is dealt
// from memory by orbit/game.js — which is also why the interesting part (the
// bias toward wordier posts) lives in a pure module with a selftest rather than
// in an endpoint nothing can test.

import {
  appGetSafe, clamp, interactionCounts, mutualsAmong, pickCircle,
  profilesFor, rank, resolveActor, resolvePds,
} from '../lib/closeness.js';

const MONTH = 30 * 24 * 3600 * 1000;

// Page ceilings for the ring scan. Lower than squares' because this is a
// FOREGROUND wait — the player is looking at a blank arena until it returns,
// where squares is already showing tiles. Measured on a heavy account
// (minormobius, ~2,000 likes in thirty days): the full budget takes 20 s and
// this one takes about 13, and the top twelve came out identical, because a
// twelfth-place seat is decided by dozens of interactions and not by the last
// four hundred likes of the month. It does bias toward the recent end of the
// window when someone out-likes the budget; that is stated on the page.
const RING_BUDGET = { like: 14, repost: 6, post: 10 };
const DECK_PAGES = 2;      // author-feed pages per member (100 posts each)
const DECK_KEEP = 60;      // cards kept per member — the draw never needs more
const AV_HOSTS = new Set(['cdn.bsky.app']);

// ── caches (per isolate, short) ──────────────────────────────────────────────
// A circle is ~25 subrequests and a deck is ~24; both are stable over the few
// minutes someone spends playing, and a reload should not pay for them twice.
const CACHE = new Map();
const CMAX = 200;
function cached(key, ttl, make) {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = make().catch((e) => { CACHE.delete(key); throw e; });
  if (CACHE.size >= CMAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, { at: Date.now(), p });
  return p;
}

// ── the ring ─────────────────────────────────────────────────────────────────

export async function circle(params, env, token) {
  const seedRaw = params.get('seed');
  if (!seedRaw) { const e = new Error('seed handle required'); e.status = 400; throw e; }
  // A month by default — long enough that a quiet week does not empty the ring,
  // short enough that it is this year's circle and not a 2023 friendship.
  const windowMs = clamp(parseInt(params.get('window'), 10) || MONTH, 3600000, 7776000000);
  const n = clamp(parseInt(params.get('n'), 10) || 12, 3, 20);
  const wantMutuals = params.get('mutuals') !== '0';

  const seedDid = await resolveActor(seedRaw);
  return cached(`circle|${seedDid}|${windowMs}|${n}|${wantMutuals}`, 300e3, async () => {
    const sinceMs = Date.now() - windowMs;
    const pds = await resolvePds(seedDid);
    const ranked = rank(await interactionCounts(pds, seedDid, sinceMs, RING_BUDGET));

    // Only the plausible head is hydrated and checked for mutuality:
    // getRelationships answers 30 pairs per request and getProfiles 25, and
    // nobody's closest circle is their ninetieth-ranked interaction partner.
    const head = ranked.slice(0, Math.max(n * 3, 30));
    const headDids = head.map((c) => c.did);
    const [profMap, mutualSet] = await Promise.all([
      profilesFor([seedDid, ...headDids], token),
      wantMutuals ? mutualsAmong(seedDid, headDids, token) : Promise.resolve(new Set()),
    ]);

    // An account the AppView will not hydrate is deactivated, suspended,
    // deleted or blocking us. It cannot supply a card and cannot be guessed,
    // and seating it would print a raw DID on the ring — a key, not a name.
    // Drop it and let the next candidate up take the seat.
    const alive = head.filter((c) => profMap.has(c.did));
    const dropped = head.length - alive.length;
    const top = wantMutuals
      ? pickCircle(alive, mutualSet, n)
      : alive.slice(0, n).map((c) => ({ ...c, mutual: false }));

    const sp = profMap.get(seedDid) || {};
    return {
      seed: {
        did: seedDid,
        handle: sp.handle || seedRaw.replace(/^@/, ''),
        displayName: sp.displayName || '',
        avatar: sp.avatar || null,
      },
      window: windowMs,
      candidates: ranked.length,
      unresolvable: dropped,
      budget: RING_BUDGET,
      mutualsPreferred: wantMutuals,
      authed: !!token,
      ring: top.map((c) => {
        const p = profMap.get(c.did) || {};
        return {
          did: c.did,
          handle: p.handle || c.did,
          displayName: p.displayName || '',
          avatar: p.avatar || null,
          score: c.score,
          mutual: !!c.mutual,
          counts: { like: c.like, repost: c.repost, reply: c.reply, quote: c.quote },
        };
      }),
    };
  });
}

// ── the deck ─────────────────────────────────────────────────────────────────

/**
 * Every own-authored post this account has on its recent feed, reduced to what
 * a card needs. Reposts are dropped (they carry the ORIGINAL author's text and
 * would make the game unwinnable and unfair in the same move), and so is
 * anything the AppView hands back authored by somebody else.
 */
async function authorCards(did, token) {
  const out = [];
  let cursor, pages = 0;
  do {
    let d;
    try { d = await appGetSafe('app.bsky.feed.getAuthorFeed', { actor: did, limit: 100, filter: 'posts_no_replies', cursor }, token); }
    catch { break; }
    for (const item of (d.feed || [])) {
      const post = item.post; if (!post) continue;
      if (item.reason) continue;                                    // a repost is not their writing
      if (post.author && post.author.did !== did) continue;
      const rec = post.record || {};
      const text = typeof rec.text === 'string' ? rec.text.trim() : '';
      if (!text) continue;
      const emb = post.embed && post.embed.$type ? String(post.embed.$type) : '';
      out.push({
        uri: post.uri,
        did,
        text,
        createdAt: rec.createdAt || post.indexedAt || null,
        likes: post.likeCount || 0,
        replies: post.replyCount || 0,
        embed: emb.includes('images') || emb.includes('gallery') ? 'image'
          : emb.includes('video') ? 'video'
          : emb.includes('external') ? 'link'
          : emb.includes('record') ? 'quote' : null,
      });
    }
    cursor = d.cursor; pages++;
  } while (cursor && pages < DECK_PAGES && out.length < DECK_KEEP * 2);
  return out.slice(0, DECK_KEEP);
}

export async function deck(params, env, token) {
  const dids = String(params.get('dids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (!dids.length) { const e = new Error('dids required'); e.status = 400; throw e; }
  return cached(`deck|${dids.join(',')}`, 300e3, async () => {
    const pools = await Promise.all(dids.map((d) => authorCards(d, token).catch(() => [])));
    const cards = [];
    const perAuthor = {};
    dids.forEach((d, i) => { perAuthor[d] = pools[i].length; cards.push(...pools[i]); });
    return { cards, perAuthor, authed: !!token };
  });
}

// ── the avatar proxy ─────────────────────────────────────────────────────────

/**
 * WHY THIS EXISTS. The share card is drawn on a canvas, and a canvas that has
 * drawn a cross-origin image without CORS permission cannot be read back —
 * `toBlob` throws `SecurityError` and the copy button dies. Measured: an avatar
 * from cdn.bsky.app comes back with no `access-control-allow-origin` at all, so
 * `crossOrigin="anonymous"` does not merely taint the canvas, it fails the load
 * outright. One same-origin hop fixes both.
 *
 * Locked to the Bluesky CDN host so this is not an open proxy, and cached hard
 * — an avatar at a given CID is immutable by construction.
 */
export async function avatar(params) {
  const raw = params.get('u') || '';
  let u;
  try { u = new URL(raw); } catch { const e = new Error('bad url'); e.status = 400; throw e; }
  if (u.protocol !== 'https:' || !AV_HOSTS.has(u.hostname)) { const e = new Error('host not allowed'); e.status = 403; throw e; }
  const r = await fetch(u.toString(), { cf: { cacheEverything: true, cacheTtl: 86400 } });
  if (!r.ok) { const e = new Error(`upstream ${r.status}`); e.status = 502; throw e; }
  return new Response(r.body, {
    status: 200,
    headers: {
      'Content-Type': r.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=604800, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
