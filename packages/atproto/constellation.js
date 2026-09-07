/**
 * Constellation — the global ATProto backlink index, as a shared helper.
 *
 * Constellation (microcosm.blue) walks the firehose, finds anything that looks
 * like a link, and indexes it by (target, collection, JSON path). That is the
 * one piece of AppView work a browser genuinely cannot do for itself: a
 * network-wide REVERSE index. Who liked this post. Who replied to it. Who
 * follows this account. It works for EVERY lexicon, including ours.
 *
 * Read-only, unauthenticated, CORS-open. No key, no backend.
 *
 * Usage:
 *   import { countDistinct, listLinks, allLinks, LINK } from '../../packages/atproto/constellation.js';
 *
 *   const likes = await countDistinct(postUri, LINK.likes);
 *   const { records } = await listLinks(postUri, LINK.replies, { limit: 50 });
 *   const followers = await countDistinct(did, LINK.followers);
 *
 * Endpoint shapes verified live 2026-09-05. See docs/APPVIEW-FEASIBILITY.md §3.
 */

const HOST = 'https://constellation.microcosm.blue';

// Constellation asks consumers to identify themselves in the User-Agent.
// Browsers forbid setting that header, so this is only applied server-side;
// in a browser the request simply goes out with the default UA.
const UA = 'bsky.mino.mobi (+https://github.com/minormobius)';
const IS_BROWSER = typeof window !== 'undefined';

/**
 * The (collection, path) pairs worth naming. A "link" is one JSON path inside
 * one record type that points at a target, so the pair IS the question:
 * `app.bsky.feed.like` + `.subject.uri` means "likes of this post".
 */
export const LINK = {
  likes:      { collection: 'app.bsky.feed.like',    path: '.subject.uri' },
  reposts:    { collection: 'app.bsky.feed.repost',  path: '.subject.uri' },
  replies:    { collection: 'app.bsky.feed.post',    path: '.reply.parent.uri' },
  threadRoot: { collection: 'app.bsky.feed.post',    path: '.reply.root.uri' },
  quotes:     { collection: 'app.bsky.feed.post',    path: '.embed.record.uri' },
  // Media quotes nest one level deeper (recordWithMedia).
  quotesMedia:{ collection: 'app.bsky.feed.post',    path: '.embed.record.record.uri' },
  followers:  { collection: 'app.bsky.graph.follow', path: '.subject' },
  blockedBy:  { collection: 'app.bsky.graph.block',  path: '.subject' },
  listedIn:   { collection: 'app.bsky.graph.listitem', path: '.subject' },
  pinnedBy:   { collection: 'app.bsky.actor.profile',  path: '.pinnedPost.uri' },
};

function url(pathname, params) {
  const q = new URLSearchParams(params);
  return `${HOST}${pathname}?${q}`;
}

async function get(pathname, params) {
  const init = IS_BROWSER ? {} : { headers: { 'User-Agent': UA } };
  const res = await fetch(url(pathname, params), init);
  if (!res.ok) throw new Error(`constellation ${pathname} → ${res.status}`);
  return res.json();
}

/**
 * Count DISTINCT accounts linking to a target. This is the honest number for
 * "likes" — `/links/count` counts records, which double-counts an account that
 * liked, unliked and re-liked.
 *
 * @param {string} target - an at:// URI, or a bare DID for graph links
 * @param {{collection: string, path: string}} link - one of LINK
 * @returns {Promise<number>}
 */
export async function countDistinct(target, link) {
  const { total } = await get('/links/count/distinct-dids', {
    target, collection: link.collection, path: link.path,
  });
  return total ?? 0;
}

/**
 * Page through the records that link to a target, newest first.
 *
 * @param {string} target
 * @param {{collection: string, path: string}} link
 * @param {{limit?: number, cursor?: string, did?: string}} [opts]
 *   `did` filters to links from one account — that is how you answer
 *   "did THIS viewer like this post" without any auth at all.
 * @returns {Promise<{total: number, records: {did,collection,rkey}[], cursor?: string}>}
 */
export async function listLinks(target, link, opts = {}) {
  const params = { target, collection: link.collection, path: link.path };
  if (opts.limit) params.limit = Math.min(opts.limit, 100); // server max
  if (opts.cursor) params.cursor = opts.cursor;
  if (opts.did) params.did = opts.did;
  const data = await get('/links', params);
  return {
    total: data.total ?? 0,
    records: data.linking_records ?? [],
    cursor: data.cursor,
  };
}

/**
 * Every kind of link pointing at a target, in one round trip. Cheaper than N
 * count calls when you want the whole engagement picture for one post, and it
 * surfaces links from lexicons you had never heard of.
 *
 * @param {string} target
 * @returns {Promise<Record<string, Record<string, {records:number, distinct_dids:number}>>>}
 *   collection → JSON path → counts
 */
export async function allLinks(target) {
  const { links } = await get('/links/all', { target });
  return links ?? {};
}

/**
 * The engagement counts for a post, in ONE request, shaped like the `post.
 * {likeCount,repostCount,replyCount}` an AppView would hand you.
 *
 * Quote counts fold the plain and recordWithMedia paths together.
 *
 * @param {string} postUri
 * @returns {Promise<{likeCount:number, repostCount:number, replyCount:number, quoteCount:number}>}
 */
export async function postCounts(postUri) {
  const links = await allLinks(postUri);
  const at = (col, p) => links?.[col]?.[p]?.distinct_dids ?? 0;
  return {
    likeCount:   at(LINK.likes.collection,   LINK.likes.path),
    repostCount: at(LINK.reposts.collection, LINK.reposts.path),
    // Replies are counted as records, not distinct dids — one account replying
    // three times is three replies, which is what a reply count means.
    replyCount:  links?.[LINK.replies.collection]?.[LINK.replies.path]?.records ?? 0,
    quoteCount:  at(LINK.quotes.collection, LINK.quotes.path)
               + at(LINK.quotesMedia.collection, LINK.quotesMedia.path),
  };
}

/**
 * Batch `postCounts` with bounded concurrency. Failures degrade to zeroes
 * rather than rejecting the batch — same contract as bsky.js.
 *
 * @param {string[]} uris
 * @param {number} [concurrency=6]
 * @returns {Promise<Map<string, {likeCount,repostCount,replyCount,quoteCount}>>}
 */
export async function countsFor(uris, concurrency = 6) {
  const out = new Map();
  const queue = [...uris];
  const zero = { likeCount: 0, repostCount: 0, replyCount: 0, quoteCount: 0 };

  const worker = async () => {
    for (let uri = queue.shift(); uri; uri = queue.shift()) {
      try { out.set(uri, await postCounts(uri)); }
      catch { out.set(uri, { ...zero }); }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, uris.length) }, worker));
  return out;
}
