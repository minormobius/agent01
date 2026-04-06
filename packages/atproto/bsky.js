/**
 * Shared Bluesky public API wrappers — read-only, no auth needed.
 * Covers the most commonly duplicated fetch patterns across the monorepo.
 *
 * Usage:
 *   import { getAuthorFeed, getProfiles, getFollows } from '../../packages/atproto/bsky.js';
 *
 *   const posts = await getAuthorFeed('did:plc:xxx');
 *   const profiles = await getProfiles(['did:plc:aaa', 'did:plc:bbb']);
 */

const BSKY_PUBLIC = 'https://public.api.bsky.app';

// ─── Profile & Identity ──────────────────────────────────────────

/**
 * Fetch profiles for a list of DIDs. Batches in groups of 25 (API limit).
 * Returns a Map<did, profile>. Failures are silently skipped.
 *
 * @param {string[]} dids
 * @returns {Promise<Map<string, { did: string, handle: string, displayName?: string, avatar?: string }>>}
 */
export async function getProfiles(dids) {
  const result = new Map();
  const BATCH = 25;

  for (let i = 0; i < dids.length; i += BATCH) {
    const batch = dids.slice(i, i + BATCH);
    const params = batch.map(d => `actors=${encodeURIComponent(d)}`).join('&');

    try {
      const res = await fetch(
        `${BSKY_PUBLIC}/xrpc/app.bsky.actor.getProfiles?${params}`
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const p of data.profiles || []) {
        result.set(p.did, p);
      }
    } catch {
      // Degrade gracefully
    }
  }

  return result;
}

/**
 * Resolve a batch of DIDs to handles. Returns Map<did, handle>.
 * Wrapper around getProfiles that extracts just the handle field.
 *
 * @param {string[]} dids
 * @returns {Promise<Map<string, string>>}
 */
export async function resolveHandles(dids) {
  const profiles = await getProfiles(dids);
  const handles = new Map();
  for (const [did, profile] of profiles) {
    if (profile.handle) handles.set(did, profile.handle);
  }
  return handles;
}

// ─── Feeds ───────────────────────────────────────────────────────

/**
 * Fetch recent posts from a user's feed.
 * Returns engagement counts alongside each post.
 *
 * @param {string} did - Author DID
 * @param {number} [limit=30] - Max posts to return
 * @param {string} [filter='posts_no_replies'] - Feed filter
 * @returns {Promise<Array<{ uri: string, indexedAt: string, replyCount: number, likeCount: number, repostCount: number }>>}
 */
export async function getAuthorFeed(did, limit = 30, filter = 'posts_no_replies') {
  const params = new URLSearchParams({
    actor: did,
    limit: String(limit),
    filter,
  });

  try {
    const res = await fetch(
      `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getAuthorFeed?${params}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.feed || []).map(item => ({
      uri: item.post.uri,
      indexedAt: item.post.indexedAt,
      replyCount: item.post.replyCount ?? 0,
      likeCount: item.post.likeCount ?? 0,
      repostCount: item.post.repostCount ?? 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch likes on a specific post URI. Paginates up to maxPages.
 *
 * @param {string} uri - AT URI of the post
 * @param {number} [maxPages=5]
 * @returns {Promise<Array<{ did: string, indexedAt: string }>>}
 */
export async function getLikes(uri, maxPages = 5) {
  const likes = [];
  let cursor;
  let pages = 0;

  do {
    const params = new URLSearchParams({ uri, limit: '100' });
    if (cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(
        `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getLikes?${params}`
      );
      if (!res.ok) break;
      const data = await res.json();
      for (const like of data.likes || []) {
        likes.push({ did: like.actor.did, indexedAt: like.indexedAt });
      }
      cursor = data.cursor;
      pages++;
    } catch {
      break;
    }
  } while (cursor && pages < maxPages);

  return likes;
}

// ─── Social Graph ────────────────────────────────────────────────

/**
 * Fetch who a user follows. Paginates up to maxPages (100 per page).
 *
 * @param {string} did - Actor DID
 * @param {number} [maxPages=20] - Cap at 2000 follows
 * @returns {Promise<string[]>} - Array of followed DIDs
 */
export async function getFollows(did, maxPages = 20) {
  const follows = [];
  let cursor;
  let pages = 0;

  do {
    const params = new URLSearchParams({ actor: did, limit: '100' });
    if (cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(
        `${BSKY_PUBLIC}/xrpc/app.bsky.graph.getFollows?${params}`
      );
      if (!res.ok) break;
      const data = await res.json();
      for (const f of data.follows || []) follows.push(f.did);
      cursor = data.cursor;
      pages++;
    } catch {
      break;
    }
  } while (cursor && pages < maxPages);

  return follows;
}

/**
 * Fetch members of a Bluesky list. Paginates fully.
 *
 * @param {string} listUri - AT URI of the list
 * @returns {Promise<string[]>} - Array of member DIDs
 */
export async function getListMembers(listUri) {
  const dids = [];
  let cursor;

  do {
    const params = new URLSearchParams({ list: listUri, limit: '100' });
    if (cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(
        `${BSKY_PUBLIC}/xrpc/app.bsky.graph.getList?${params}`
      );
      if (!res.ok) break;
      const data = await res.json();
      for (const item of data.items || []) dids.push(item.subject.did);
      cursor = data.cursor;
    } catch {
      break;
    }
  } while (cursor);

  return dids;
}

// ─── Threads ─────────────────────────────────────────────────────

/**
 * Fetch a post thread and compute depth + top-level reply count.
 * Returns null on failure. Useful for thread visualization.
 *
 * @param {string} postUri - AT URI of the root post
 * @param {number} [depth=10]
 * @returns {Promise<{ maxDepth: number, topLevelReplies: number, interactorDids: string[] } | null>}
 */
export async function getPostThreadDepth(postUri, depth = 10) {
  const params = new URLSearchParams({
    uri: postUri,
    depth: String(depth),
    parentHeight: '0',
  });

  try {
    const res = await fetch(
      `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getPostThread?${params}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.thread || data.thread.$type === 'app.bsky.feed.defs#blockedPost') return null;

    const interactors = new Set();
    let maxDepth = 0;
    let topLevelReplies = 0;

    function walk(node, d) {
      if (!node || node.$type === 'app.bsky.feed.defs#blockedPost') return;
      if (node.post?.author?.did) interactors.add(node.post.author.did);
      if (d > maxDepth) maxDepth = d;
      if (d === 1) topLevelReplies++;
      for (const reply of node.replies || []) walk(reply, d + 1);
    }

    for (const reply of data.thread.replies || []) walk(reply, 1);
    if (data.thread.post?.author?.did) interactors.add(data.thread.post.author.did);

    return { maxDepth, topLevelReplies, interactorDids: [...interactors] };
  } catch {
    return null;
  }
}
