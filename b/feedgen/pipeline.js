// feedgen pipeline — evaluate a SkyFeed-style block definition against the public
// Bluesky AppView. Pure: a definition object in, post views out. This SAME module
// will run in the serving Worker (slice 2) returning bare uris for getFeedSkeleton;
// only the output shape differs, so keep gather/filter/sort here canonical.
//
// Definition shape (this is the atproto record we'll write to the user's PDS):
//   {
//     name, description,
//     inputs:  [ {type:'search', q, sort}, {type:'list', uri}, {type:'author', actor, filter} ],
//     filters: [ {type:'regex', mode:'include'|'exclude', pattern},
//                {type:'media', has:'image'|'video'|'link'|'quote'},
//                {type:'lang', code}, {type:'removeReplies'}, {type:'removeReposts'},
//                {type:'minLikes', n}, {type:'minReposts', n} ],
//     sort: {type:'latest'|'top'}, limit
//   }

const PUB = 'https://public.api.bsky.app/xrpc';

export async function xrpc(method, params = {}) {
  const u = new URL(`${PUB}/${method}`);
  for (const k in params) if (params[k] != null && params[k] !== '') u.searchParams.set(k, params[k]);
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`${method} → HTTP ${r.status}`);
  return r.json();
}

async function resolveActor(actor) {
  const a = (actor || '').trim().replace(/^@/, '');
  if (a.startsWith('did:')) return a;
  const r = await xrpc('com.atproto.identity.resolveHandle', { handle: a });
  return r.did;
}

const isRepost = (fi) => !!(fi && fi.reason && (fi.reason.$type || '').includes('Repost'));

// One input block → [{post, isRepost}]
async function gather(input) {
  const limit = 100;
  if (input.type === 'search') {
    if (!input.q) return [];
    let r;
    try {
      r = await xrpc('app.bsky.feed.searchPosts', { q: input.q, sort: input.sort || 'latest', limit });
    } catch (e) {
      if (/HTTP 40[13]/.test(e.message || '')) throw new Error('search needs sign-in (coming in slice 2) — use list or author inputs for now');
      throw e;
    }
    return (r.posts || []).map((post) => ({ post, isRepost: false }));
  }
  if (input.type === 'list') {
    if (!input.uri) return [];
    const r = await xrpc('app.bsky.feed.getListFeed', { list: input.uri, limit });
    return (r.feed || []).map((fi) => ({ post: fi.post, isRepost: isRepost(fi) }));
  }
  if (input.type === 'author') {
    if (!input.actor) return [];
    const actor = await resolveActor(input.actor);
    const r = await xrpc('app.bsky.feed.getAuthorFeed', { actor, limit, filter: input.filter || 'posts_no_replies' });
    return (r.feed || []).map((fi) => ({ post: fi.post, isRepost: isRepost(fi) }));
  }
  return [];
}

function mediaFlags(post) {
  const t = (post.embed && post.embed.$type) || '';
  return {
    image: t.includes('embed.images') || t.includes('recordWithMedia'),
    video: t.includes('embed.video'),
    link: t.includes('embed.external'),
    quote: t.includes('embed.record'),
  };
}

function passes(cand, filters) {
  const post = cand.post;
  const rec = post.record || {};
  const text = rec.text || '';
  const m = mediaFlags(post);
  for (const f of filters) {
    if (f.type === 'regex') {
      if (!f.pattern) continue;
      let re; try { re = new RegExp(f.pattern, 'i'); } catch { continue; }
      const hit = re.test(text);
      if (f.mode === 'exclude' && hit) return false;
      if (f.mode !== 'exclude' && !hit) return false;
    } else if (f.type === 'media') {
      if (!m[f.has]) return false;
    } else if (f.type === 'lang') {
      const langs = rec.langs || [];
      if (!f.code) continue;
      if (!langs.some((l) => (l || '').toLowerCase().startsWith(f.code.toLowerCase()))) return false;
    } else if (f.type === 'removeReplies') {
      if (rec.reply) return false;
    } else if (f.type === 'removeReposts') {
      if (cand.isRepost) return false;
    } else if (f.type === 'minLikes') {
      if ((post.likeCount || 0) < (f.n || 0)) return false;
    } else if (f.type === 'minReposts') {
      if ((post.repostCount || 0) < (f.n || 0)) return false;
    }
  }
  return true;
}

function sortCands(cands, sort) {
  const top = sort === 'top';
  const key = (c) => top
    ? (c.post.likeCount || 0)
    : new Date((c.post.record && c.post.record.createdAt) || c.post.indexedAt || 0).getTime();
  return cands.sort((a, b) => key(b) - key(a));
}

// Returns { posts: postView[], errors: string[] }
export async function evaluate(def) {
  const inputs = def.inputs || [];
  const errors = [];
  const results = await Promise.all(inputs.map((i) =>
    gather(i).catch((e) => { errors.push(`${i.type}: ${e.message || e}`); return []; })));
  let cands = results.flat();
  const seen = new Set();
  cands = cands.filter((c) => c.post && c.post.uri && !seen.has(c.post.uri) && seen.add(c.post.uri));
  cands = cands.filter((c) => passes(c, def.filters || []));
  cands = sortCands(cands, (def.sort && def.sort.type) || 'latest');
  const limit = def.limit || 40;
  return { posts: cands.slice(0, limit).map((c) => c.post), errors, candidateCount: cands.length };
}
