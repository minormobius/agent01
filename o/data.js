// o/data.js — read every interaction between one account and everyone else, in
// a window, from public data. Runs in the browser; no sign-in, nothing stored.
//
// OUT (what they did to others) comes from their own repo on their PDS, newest
// first, so a window costs only its own pages: likes, reposts, and posts
// (a reply credits the parent's author, a quote the quoted post's author).
//
// IN (what others did to them) has no repo to read — those records live in
// other people's repos — so it comes from the AppView, per post: who liked,
// reposted, quoted, replied. Posts are read busiest-first under a request
// budget, and anything the budget cut is reported, never hidden.

import { authorOf } from './circle.js';

const PUB = 'https://public.api.bsky.app/xrpc';
const DAY = 86400000;
export const LIMITS = {
  likePages: 40, repostPages: 12, postPages: 25,   // OUT: repo pages (100 each)
  feedPages: 12,                                   // IN: the account's own posts
  // IN: per-post lookups, total. Measured 2026-11-23 against a full read of an
  // active account (707 lookups): 300 kept the inner 8 identical and 23 of the
  // top 24; 150 swapped three of the inner 8. 400 leaves headroom over 300.
  inRequests: 400,
  likersPerPost: 2,                                // IN: pages of likers per post (100 each)
  concurrency: 24,
};
export const stats = { requests: 0 };

async function j(url, signal) {
  for (let attempt = 0; ; attempt++) {
    let r;
    try { r = await fetch(url, { signal }); }
    catch (e) { if (e?.name === 'AbortError' || attempt >= 2) throw e; await sleep(400 * (attempt + 1)); continue; }
    stats.requests++;
    if (r.ok) return r.json();
    if (attempt >= 2 || (r.status < 500 && r.status !== 429)) throw new Error(`${r.status}`);
    await sleep(700 * (attempt + 1) ** 2);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (params) => Object.entries(params).filter(([, v]) => v != null && v !== '')
  .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

/** Handle or DID → { did, handle, displayName, avatar }. */
export async function profile(actor, signal) {
  const p = await j(`${PUB}/app.bsky.actor.getProfile?${q({ actor })}`, signal);
  return { did: p.did, handle: p.handle, displayName: p.displayName || '', avatar: p.avatar || '' };
}

async function pdsOf(did, signal) {
  const doc = did.startsWith('did:web:')
    ? await j(`https://${did.slice(8)}/.well-known/did.json`, signal)
    : await j(`https://plc.directory/${did}`, signal);
  const s = (doc.service || []).find((x) => x.id === '#atproto_pds' || x.type === 'AtprotoPersonalDataServer');
  if (!s) throw new Error('no PDS for this account');
  return s.serviceEndpoint.replace(/\/$/, '');
}

async function scan(pds, did, collection, since, maxPages, onRec, signal) {
  let cursor, pages = 0;
  for (;;) {
    const d = await j(`${pds}/xrpc/com.atproto.repo.listRecords?${q({ repo: did, collection, limit: 100, cursor })}`, signal);
    pages++;
    for (const r of d.records || []) {
      const t = Date.parse(r.value?.createdAt);
      if (t && t < since) return { pages, capped: false };
      onRec(r.value || {}, t);
    }
    cursor = d.cursor;
    if (!cursor) return { pages, capped: false };
    if (pages >= maxPages) return { pages, capped: true };
  }
}

function quoteOf(v) {
  const e = v.embed;
  const uri = e && (e.$type === 'app.bsky.embed.record' ? e.record?.uri
    : e.$type === 'app.bsky.embed.recordWithMedia' ? e.record?.record?.uri : null);
  return uri && uri.includes('/app.bsky.feed.post/') ? uri : null;
}

/**
 * Every interaction in the last `days`.
 * @returns {{ events, meta }} — events as in circle.js; meta says what was read and cut.
 */
export async function gather(did, { days = 20, signal, onProgress = () => {} } = {}) {
  const since = Date.now() - days * DAY;
  const events = [];
  const meta = { posts: 0, postsRead: 0, capped: [], outPages: 0 };
  const push = (other, kind, dir, t) => { if (other && other !== did) events.push({ did: other, kind, dir, t: t || 0 }); };

  const pds = await pdsOf(did, signal);
  onProgress('reading your likes, reposts and replies');

  const outJob = Promise.all([
    scan(pds, did, 'app.bsky.feed.like', since, LIMITS.likePages, (v, t) => push(authorOf(v.subject?.uri), 'like', 'out', t), signal),
    scan(pds, did, 'app.bsky.feed.repost', since, LIMITS.repostPages, (v, t) => push(authorOf(v.subject?.uri), 'repost', 'out', t), signal),
    scan(pds, did, 'app.bsky.feed.post', since, LIMITS.postPages, (v, t) => {
      if (v.reply?.parent?.uri) push(authorOf(v.reply.parent.uri), 'reply', 'out', t);
      const qu = quoteOf(v);
      if (qu) push(authorOf(qu), 'quote', 'out', t);
    }, signal),
  ]).then((rs) => {
    meta.outPages = rs.reduce((s, r) => s + r.pages, 0);
    ['likes', 'reposts', 'posts'].forEach((name, i) => { if (rs[i].capped) meta.capped.push(`your ${name} (oldest not read)`); });
  });

  // IN: their own posts in the window, with engagement counts
  const inJob = (async () => {
    const posts = [];
    let cursor, pages = 0, done = false;
    while (!done && pages < LIMITS.feedPages) {
      const d = await j(`${PUB}/app.bsky.feed.getAuthorFeed?${q({ actor: did, filter: 'posts_with_replies', limit: 100, cursor })}`, signal);
      pages++;
      for (const it of d.feed || []) {
        if (it.reason) continue;                                   // their reposts of others
        const p = it.post;
        if (!p || p.author?.did !== did) continue;
        const t = Date.parse(p.indexedAt || p.record?.createdAt);
        if (t && t < since) { done = true; break; }
        posts.push({ uri: p.uri, t, like: p.likeCount || 0, repost: p.repostCount || 0, reply: p.replyCount || 0, quote: p.quoteCount || 0 });
      }
      cursor = d.cursor;
      if (!cursor) break;
    }
    if (!done && cursor) meta.capped.push('your oldest posts in the window');
    meta.posts = posts.length;
    onProgress(`reading who engaged with your ${posts.length} posts`);

    // one job per (post, kind) that has something to read, busiest posts first
    posts.sort((a, b) => (b.like + b.repost + b.reply + b.quote) - (a.like + a.repost + a.reply + a.quote));
    const jobs = [];
    for (const p of posts) {
      if (p.reply) jobs.push(['reply', p]);
      if (p.quote) jobs.push(['quote', p]);
      if (p.repost) jobs.push(['repost', p]);
      if (p.like) jobs.push(['like', p]);
    }
    let budget = LIMITS.inRequests, skipped = 0;
    const run = jobs.filter(() => (budget-- > 0 ? true : (skipped++, false)));
    if (skipped) meta.capped.push(`${skipped} lookups on your quietest posts`);
    const seen = new Set();
    let done2 = 0;
    await pool(run, LIMITS.concurrency, async ([kind, p]) => {
      seen.add(p.uri);
      try {
        if (kind === 'like') {
          let c, n = 0;
          do {
            const d = await j(`${PUB}/app.bsky.feed.getLikes?${q({ uri: p.uri, limit: 100, cursor: c })}`, signal);
            for (const l of d.likes || []) push(l.actor?.did, 'like', 'in', Date.parse(l.createdAt) || p.t);
            c = d.cursor; n++;
          } while (c && n < LIMITS.likersPerPost);
          if (c) meta.likersCut = (meta.likersCut || 0) + 1;
        } else if (kind === 'repost') {
          const d = await j(`${PUB}/app.bsky.feed.getRepostedBy?${q({ uri: p.uri, limit: 100 })}`, signal);
          for (const a of d.repostedBy || []) push(a.did, 'repost', 'in', p.t);
        } else if (kind === 'quote') {
          const d = await j(`${PUB}/app.bsky.feed.getQuotes?${q({ uri: p.uri, limit: 100 })}`, signal);
          for (const x of d.posts || []) push(x.author?.did, 'quote', 'in', Date.parse(x.indexedAt) || p.t);
        } else {
          const d = await j(`${PUB}/app.bsky.feed.getPostThread?${q({ uri: p.uri, depth: 1, parentHeight: 0 })}`, signal);
          for (const r of d.thread?.replies || []) push(r.post?.author?.did, 'reply', 'in', Date.parse(r.post?.indexedAt) || p.t);
        }
      } catch (e) { if (e?.name === 'AbortError') throw e; meta.failed = (meta.failed || 0) + 1; }
      done2++;
      if (done2 % 20 === 0) onProgress(`reading who engaged with your posts · ${done2}/${run.length}`);
    });
    meta.postsRead = seen.size;
    if (meta.likersCut) meta.capped.push(`likers past ${LIMITS.likersPerPost * 100} on ${meta.likersCut} big posts`);
  })();

  await Promise.all([outJob, inJob]);
  return { events, meta };
}

/** Profiles for up to N DIDs, 25 per request, in parallel. Decoration: never throws. */
export async function profiles(dids, signal) {
  const out = new Map();
  const chunks = [];
  for (let i = 0; i < dids.length; i += 25) chunks.push(dids.slice(i, i + 25));
  await Promise.all(chunks.map(async (c) => {
    try {
      const d = await j(`${PUB}/app.bsky.actor.getProfiles?${c.map((x) => 'actors=' + encodeURIComponent(x)).join('&')}`, signal);
      for (const p of d.profiles || []) out.set(p.did, { did: p.did, handle: p.handle, displayName: p.displayName || '', avatar: p.avatar || '' });
    } catch { /* decoration */ }
  }));
  return out;
}

/** A Bluesky avatar URL → our CORS-safe proxy path (so the card can be exported). */
export function proxied(url) {
  const m = String(url || '').match(/\/img\/avatar(?:_thumbnail)?\/plain\/([^/]+)\/([a-z2-7]+)/);
  return m ? `/av/${m[1]}/${m[2]}` : null;
}
