/**
 * Where posts come from, and the notifications tab.
 *
 * Two different kinds of feed live here, and the difference matters:
 *
 *   ALGORITHMIC (simcluster) — a feed generator returns a SKELETON: a list of
 *   at:// URIs and nothing else. We hydrate it with getPosts, which gives fully
 *   formed posts with author, counts and embeds. Cheap, paginated, works
 *   logged-out, and it is the default because a new visitor with no follow
 *   graph should still see something good.
 *
 *   LIVE (a follow graph) — Jetstream, filtered server-side, which is the rest
 *   of this app. Raw records, no counts, but real-time and free.
 *
 * Notifications are the interesting one. Bluesky's own notification endpoint
 * needs auth, but Constellation is a global BACKLINK index — "who points at
 * this?" — which is exactly what a notification is. So this builds a
 * notifications feed for ANY handle, logged out, from public data.
 */

import { postCounts as _postCounts, listLinks, LINK } from '/packages/atproto/constellation.js';
import { getProfiles } from '/packages/atproto/bsky.js';

const BSKY_PUBLIC = 'https://public.api.bsky.app';
const FEED_HOST = 'https://feed.mino.mobi';
const PUBLISHER = 'did:plc:yivyyp54vddf7qf2lpsikhe4';

/**
 * The feeds this repo already runs. simcluster does community detection on the
 * mutual-follow graph every 6h and ranks by cross-community engagement — see
 * workers/feed/CLAUDE.md.
 */
export const FEEDS = [
  { id: 'simcluster', label: 'simcluster',
    uri: `at://${PUBLISHER}/app.bsky.feed.generator/simcluster`,
    blurb: 'Communities found in the mutual-follow graph, ranked by posts that cross between them.' },
  { id: 'simcluster-liked', label: 'liked',
    uri: `at://${PUBLISHER}/app.bsky.feed.generator/simcluster-liked`,
    blurb: 'The same communities, filtered to what they liked.' },
];

/**
 * Fetch a feed skeleton and hydrate it into renderable posts.
 *
 * @param {string} feedUri
 * @param {{limit?: number, cursor?: string}} [opts]
 * @returns {Promise<{posts: object[], cursor?: string}>}
 */
export async function loadFeed(feedUri, { limit = 30, cursor } = {}) {
  const params = new URLSearchParams({ feed: feedUri, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`${FEED_HOST}/xrpc/app.bsky.feed.getFeedSkeleton?${params}`);
  if (!res.ok) throw new Error(`feed ${res.status}`);
  const skeleton = await res.json();

  const uris = (skeleton.feed || []).map((f) => f.post).filter(Boolean);
  if (!uris.length) return { posts: [], cursor: skeleton.cursor };

  // getPosts takes 25 at a time.
  const posts = [];
  for (let i = 0; i < uris.length; i += 25) {
    const p = new URLSearchParams();
    for (const u of uris.slice(i, i + 25)) p.append('uris', u);
    try {
      const r = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.feed.getPosts?${p}`);
      if (!r.ok) continue;
      const { posts: got = [] } = await r.json();
      for (const post of got) posts.push(fromHydrated(post));
    } catch { /* a lost page is not a lost feed */ }
  }

  // getPosts does not preserve the skeleton's order, and the order IS the
  // algorithm — restore it.
  const rank = new Map(uris.map((u, i) => [u, i]));
  posts.sort((a, b) => (rank.get(a.uri) ?? 1e9) - (rank.get(b.uri) ?? 1e9));

  return { posts, cursor: skeleton.cursor };
}

/** Normalise an AppView post into the shape the renderer and cache use. */
function fromHydrated(post) {
  return {
    uri: post.uri,
    did: post.author.did,
    rkey: post.uri.split('/').pop(),
    createdAt: post.record?.createdAt || post.indexedAt,
    record: post.record,
    author: post.author,
    // The hydrated `#view` embed, where the CDN URLs already exist. Raw
    // Jetstream posts have no such thing and get reconstructed from blob refs
    // — see lib/blobs.js.
    viewEmbed: post.embed || null,
    counts: {
      likeCount: post.likeCount ?? 0,
      repostCount: post.repostCount ?? 0,
      replyCount: post.replyCount ?? 0,
      quoteCount: post.quoteCount ?? 0,
    },
  };
}

/**
 * An author's own recent posts, hydrated. Used by the profile tab and as the
 * input to notifications.
 *
 * @param {string} did
 * @param {{limit?: number, cursor?: string}} [opts]
 */
export async function authorFeed(did, { limit = 30, cursor } = {}) {
  const params = new URLSearchParams({ actor: did, limit: String(limit), filter: 'posts_and_author_threads' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.feed.getAuthorFeed?${params}`);
  if (!res.ok) throw new Error(`author feed ${res.status}`);
  const data = await res.json();
  return {
    posts: (data.feed || []).map((f) => fromHydrated(f.post)),
    cursor: data.cursor,
  };
}

// ─── notifications, from the backlink index ──────────────────────

/**
 * Build a notifications feed for any account, with no auth at all.
 *
 * Bluesky's own listNotifications needs a session. Constellation does not: a
 * notification IS a backlink — someone's like, reply or follow record pointing
 * at you. So this asks the index "what points at this account, and at its
 * recent posts?".
 *
 * Bounded deliberately: the newest `postDepth` posts, two link queries each,
 * four at a time. A deeper sweep is a much bigger request fan-out for
 * diminishing returns.
 *
 * What it CANNOT show, and why the UI says so: this is a snapshot of who
 * interacted, not a read/unread inbox. Constellation indexes links, not
 * timestamps of the linking record, so ordering within a post is by the
 * index's own recency rather than a true event time.
 *
 * @param {string} did
 * @param {{postDepth?: number}} [opts]
 * @returns {Promise<Array<{kind, actorDid, subjectUri?, subjectText?}>>}
 */
export async function notifications(did, { postDepth = 8 } = {}) {
  const out = [];

  // 1. New followers — one call, and the cheapest signal there is.
  try {
    const { records } = await listLinks(did, LINK.followers, { limit: 15 });
    for (const r of records) out.push({ kind: 'follow', actorDid: r.did });
  } catch { /* keep going; a partial page beats an error page */ }

  // 2. Likes and replies on recent posts.
  let mine = [];
  try { mine = (await authorFeed(did, { limit: postDepth })).posts; } catch { /* none */ }

  const jobs = [];
  for (const post of mine.slice(0, postDepth)) {
    jobs.push({ post, link: LINK.likes, kind: 'like' });
    jobs.push({ post, link: LINK.replies, kind: 'reply' });
  }

  const CONCURRENCY = 4;
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      try {
        const { records } = await listLinks(job.post.uri, job.link, { limit: 5 });
        for (const r of records) {
          if (r.did === did) continue;            // your own like is not news
          out.push({
            kind: job.kind,
            actorDid: r.did,
            subjectUri: job.post.uri,
            subjectText: (job.post.record?.text || '').slice(0, 90),
            replyRkey: job.kind === 'reply' ? r.rkey : undefined,
          });
        }
      } catch { /* one dead query, not a dead tab */ }
    }
  }));

  // Hydrate the actors so the list reads as people, not DIDs.
  const dids = [...new Set(out.map((n) => n.actorDid))].slice(0, 100);
  const profiles = await getProfiles(dids).catch(() => new Map());
  for (const n of out) n.actor = profiles.get(n.actorDid) || null;

  return out;
}

/**
 * Full people search — the deeper cousin of typeahead. searchActorsTypeahead is
 * prefix-matched and capped at 10; this searches display names and descriptions
 * too and pages.
 *
 * @param {string} q
 * @param {{limit?: number, cursor?: string}} [opts]
 * @returns {Promise<{actors: object[], cursor?: string}>}
 */
export async function searchActors(q, { limit = 25, cursor } = {}) {
  const term = String(q || '').trim().replace(/^@/, '');
  if (!term) return { actors: [] };
  const params = new URLSearchParams({ q: term, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  try {
    const res = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.actor.searchActors?${params}`);
    if (!res.ok) return { actors: [] };
    const data = await res.json();
    return { actors: data.actors || [], cursor: data.cursor };
  } catch {
    return { actors: [] };
  }
}

export const postCounts = _postCounts;
