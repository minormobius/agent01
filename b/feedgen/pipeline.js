// feedgen evaluator — a SkyFeed-style block definition in, post views out.
// Runs in the b Worker (slice 2): both /api/feedgen/preview and getFeedSkeleton
// call evaluate(). Search uses the public AppView WITH a service token (the
// public endpoint 403s unauthed); list/author/filters/sort are open.
//
// Definition (this is the com.minomobi.feedgen.def record on the user's PDS):
//   { name, description,
//     inputs:[{type:'search',q,sort}|{type:'list',uri}|{type:'author',actor,filter}
//             |{type:'firehose',seconds}],
//     filters:[{type:'regex',mode,pattern,target,caseSensitive}|{type:'media',has,mode}|
//              {type:'lang',code,mode}|{type:'noLang'}|{type:'list',uri,mode}|
//              {type:'removeReplies'}|{type:'removeReposts'}|{type:'minLikes',n}],
//     sort:{type:'latest'|'top'}, limit }
//
// The FILTERS are not implemented here. They live in packages/feedgen/match.js,
// shared with workers/hose/, because the same definition has to be filtered in
// two places over two shapes — hydrated postViews here, raw Jetstream commits
// there. Two copies of a predicate is how a feed's preview quietly stops
// describing the feed people actually read.
//
// A `firehose` input cannot be evaluated from here at all: there is no query
// for "every post". Those feeds are SERVED by hose.mino.mobi; this file can
// only approximate one for preview, and says so (`approximated`).
import { fromPostView, passes, listUris } from '../../packages/feedgen/match.js';

const PUB = 'https://public.api.bsky.app/xrpc'; // open reads (lists, authors)
const APP = 'https://api.bsky.app/xrpc';        // authed reads (search) w/ Bearer

async function xrpc(method, params = {}, opts = {}) {
  const u = new URL(`${opts.base || PUB}/${method}`);
  for (const k in params) if (params[k] != null && params[k] !== '') u.searchParams.set(k, params[k]);
  const headers = {};
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const r = await fetch(u.toString(), { headers });
  if (!r.ok) throw new Error(`${method} → HTTP ${r.status}`);
  return r.json();
}

async function resolveActor(actor) {
  const a = (actor || '').trim().replace(/^@/, '');
  if (a.startsWith('did:')) return a;
  const r = await xrpc('com.atproto.identity.resolveHandle', { handle: a });
  return r.did;
}

// Accept either an at:// list uri or a bsky.app list URL
// (https://bsky.app/profile/<actor>/lists/<rkey>); resolve a handle to a DID.
async function resolveListUri(s) {
  const v = (s || '').trim();
  if (!v || v.startsWith('at://')) return v;
  const m = v.match(/\/profile\/([^/]+)\/lists\/([^/?#]+)/);
  if (!m) return v;
  const actor = decodeURIComponent(m[1]);
  const did = actor.startsWith('did:') ? actor : await resolveActor(actor);
  return `at://${did}/app.bsky.graph.list/${m[2]}`;
}

const isRepost = (fi) => !!(fi && fi.reason && (fi.reason.$type || '').includes('Repost'));

async function gather(input, ctx) {
  const PER = 100;
  const pages = ctx.pages || 1;
  const cap = ctx.maxPerInput || PER;
  // Follow each input's own cursor up to `pages` pages (or until exhausted / cap).
  async function pageLoop(method, baseParams, opts, mapFn) {
    let out = [], cursor, p = 0;
    do {
      const r = await xrpc(method, { ...baseParams, limit: PER, cursor }, opts);
      out = out.concat(mapFn(r));
      cursor = r.cursor;
      p++;
    } while (cursor && p < pages && out.length < cap);
    return out;
  }
  if (input.type === 'search') {
    if (!input.q) return [];
    if (!ctx.searchToken) throw new Error('search needs a service token (not configured yet)');
    return pageLoop('app.bsky.feed.searchPosts', { q: input.q, sort: input.sort || 'latest' },
      { base: APP, token: ctx.searchToken }, (r) => (r.posts || []).map((post) => ({ post, isRepost: false })));
  }
  if (input.type === 'list') {
    if (!input.uri) return [];
    const uri = await resolveListUri(input.uri);
    return pageLoop('app.bsky.feed.getListFeed', { list: uri }, {},
      (r) => (r.feed || []).map((fi) => ({ post: fi.post, isRepost: isRepost(fi) })));
  }
  if (input.type === 'author') {
    if (!input.actor) return [];
    const actor = await resolveActor(input.actor);
    return pageLoop('app.bsky.feed.getAuthorFeed', { actor, filter: input.filter || 'posts_no_replies' }, {},
      (r) => (r.feed || []).map((fi) => ({ post: fi.post, isRepost: isRepost(fi) })));
  }
  // There is no query for "every post", so this is a SAMPLE, not the firehose:
  // a near-universal search term, enough to see whether your filters do what
  // you meant. The published feed is served by hose.mino.mobi off the real
  // firehose; ctx.approximated makes the UI admit the difference.
  if (input.type === 'firehose') {
    if (!ctx.searchToken) throw new Error('firehose preview needs a service token (not configured yet)');
    ctx.approximated = true;
    return pageLoop('app.bsky.feed.searchPosts', { q: 'a', sort: 'latest' },
      { base: APP, token: ctx.searchToken }, (r) => (r.posts || []).map((post) => ({ post, isRepost: false })));
  }
  return [];
}

// List membership for any `list` filter in the def. Resolved once per
// evaluation and handed to passes(); a list that fails to load is left out of
// the map, which passes() reads as "skip this filter" rather than "matches
// nobody" — see match.js.
async function resolveLists(def, errors) {
  const lists = new Map();
  for (const raw of listUris(def)) {
    try {
      const uri = await resolveListUri(raw);
      const dids = new Set();
      let cursor;
      for (let page = 0; page < 50; page++) {
        const r = await xrpc('app.bsky.graph.getList', { list: uri, limit: 100, cursor });
        for (const item of r.items || []) if (item.subject && item.subject.did) dids.add(item.subject.did);
        cursor = r.cursor;
        if (!cursor || dids.size >= 5000) break;
      }
      lists.set(raw, dids);
    } catch (e) {
      errors.push(`list ${raw}: ${(e && e.message) || e}`);
    }
  }
  return lists;
}

function sortCands(cands, sort) {
  const top = sort === 'top';
  const key = (c) => top
    ? (c.post.likeCount || 0)
    : new Date((c.post.record && c.post.record.createdAt) || c.post.indexedAt || 0).getTime();
  return cands.sort((a, b) => key(b) - key(a));
}

// evaluate(def, ctx) → { posts, errors, candidateCount, approximated }
// Gathers ~`limit` posts deep by paginating each input (pages scale with limit),
// dedupes, filters, sorts, returns the top `limit`.
export async function evaluate(def, ctx = {}) {
  const limit = Math.max(1, Math.min(def.limit || 500, 1000));
  const pages = Math.min(8, Math.max(1, Math.ceil(limit / 100) + 1)); // a little extra for filtering
  const c = { ...ctx, pages, maxPerInput: limit * 2 };
  // No input blocks → default to a broad recent-posts sample across the network,
  // the same approximation the firehose input gets and for the same reason.
  const inputs = (def.inputs && def.inputs.length)
    ? def.inputs
    : [{ type: 'search', q: 'a', sort: (def.sort && def.sort.type === 'top') ? 'top' : 'latest' }];
  const errors = [];
  const [results, lists] = await Promise.all([
    Promise.all(inputs.map((i) =>
      gather(i, c).catch((e) => { errors.push(`${i.type}: ${e.message || e}`); return []; }))),
    resolveLists(def, errors),
  ]);
  let cands = results.flat();
  const seen = new Set();
  cands = cands.filter((x) => x.post && x.post.uri && !seen.has(x.post.uri) && seen.add(x.post.uri));
  cands = cands.filter((x) => passes(fromPostView(x.post, x.isRepost), def.filters || [], { lists }));
  cands = sortCands(cands, (def.sort && def.sort.type) || 'latest');
  return {
    posts: cands.slice(0, limit).map((x) => x.post),
    errors,
    candidateCount: cands.length,
    approximated: !!c.approximated,
  };
}
