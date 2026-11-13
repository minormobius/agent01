// kith/lib/activity.js — who each member reached out to, recently.
//
// Read straight from the member's own repo (listRecords), like follows: posts
// (replies, quotes, mentions), reposts and likes. listRecords returns newest
// first, so a window costs only the pages inside it — read backwards until a
// record is older than the window start.
//
// Measured 2026-11-13 on one active account: 100 posts ≈ 3 days, 100 likes ≈ 1
// day. Likes dominate the cost, so they are capped per person (LIKE_PAGES) and
// the cap is reported rather than hidden.
//
// Scores (directed, from this member to the target's author):
//   reply 3 · quote 3 · mention 2 · repost 2 · like 1
// community.js turns a pair's two directions into one weight, log2(1 + a→b + b→a).

import { pdsFor, stats } from './graph.js';

export const WEIGHTS = { reply: 3, quote: 3, mention: 2, repost: 2, like: 1 };
// Conversation: the kinds that are written to someone. Likes and reposts are
// cheap and broadcast-shaped; on the first real list (182 people, 14 days) they
// were 54k of 61k interactions and blurred every group.
export const CONVO = new Set(['reply', 'quote', 'mention']);
const PAGES = { 'app.bsky.feed.post': 10, 'app.bsky.feed.repost': 5, 'app.bsky.feed.like': 15 };
const DAY = 86400000;

const S32 = '234567abcdefghijklmnopqrstuvwxyz';
/** A TID record key → ms since epoch, or NaN. Harder to fake than createdAt. */
export function tidTime(rkey) {
  if (typeof rkey !== 'string' || rkey.length !== 13) return NaN;
  let v = 0n;
  for (const c of rkey) { const i = S32.indexOf(c); if (i < 0) return NaN; v = v * 32n + BigInt(i); }
  return Number((v >> 10n) / 1000n);
}
const recTime = (r) => {
  const t = tidTime(r.uri.split('/').pop());
  return Number.isFinite(t) ? t : Date.parse(r.value?.createdAt);
};
const didOf = (uri) => (typeof uri === 'string' && uri.startsWith('at://') ? uri.slice(5).split('/')[0] : null);

/** The interactions one record carries: [[targetDid, kind], …]. Pure, testable. */
export function interactionsIn(collection, value) {
  const out = [];
  if (!value) return out;
  if (collection === 'app.bsky.feed.like') { const d = didOf(value.subject?.uri); if (d) out.push([d, 'like']); }
  else if (collection === 'app.bsky.feed.repost') { const d = didOf(value.subject?.uri); if (d) out.push([d, 'repost']); }
  else if (collection === 'app.bsky.feed.post') {
    const p = didOf(value.reply?.parent?.uri);
    if (p) out.push([p, 'reply']);
    const e = value.embed;
    const q = e && (e.$type === 'app.bsky.embed.record' ? e.record?.uri
      : e.$type === 'app.bsky.embed.recordWithMedia' ? e.record?.record?.uri : null);
    const qd = didOf(q);
    if (qd) out.push([qd, 'quote']);
    const seen = new Set();
    for (const f of value.facets || []) for (const g of f.features || []) {
      if (g.$type === 'app.bsky.richtext.facet#mention' && g.did && !seen.has(g.did) && g.did !== p) {
        seen.add(g.did); out.push([g.did, 'mention']);
      }
    }
  }
  return out;
}

async function getJSON(url, signal) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { signal });
      stats.requests++;
      if (r.ok) { const t = await r.text(); stats.bytes += t.length; return JSON.parse(t); }
      if (r.status >= 400 && r.status < 500 && r.status !== 429) throw Object.assign(new Error(`${r.status}`), { final: true });
    } catch (e) {
      if (e?.name === 'AbortError' || e?.final) throw e;
    }
    if (attempt >= 2) throw new Error('unreachable');
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1) ** 2));
  }
}

const cache = new Map();
/**
 * One member's outgoing interactions in the last `days`, restricted to `members`.
 * @returns {{ scores: Object<string,number>, counts: Object<string,number>, capped: string[] }}
 */
export async function activityOf(did, { days = 14, members = null, signal } = {}) {
  const key = did + '|' + days;
  if (cache.has(key)) { stats.cacheHits++; return cache.get(key); }
  const since = Date.now() - days * DAY;
  const pds = (await pdsFor(did, { signal })).replace(/\/$/, '');
  const scores = {}, convo = {}, counts = { reply: 0, quote: 0, mention: 0, repost: 0, like: 0 }, capped = [];
  for (const [collection, maxPages] of Object.entries(PAGES)) {
    let cursor, pages = 0, done = false;
    while (!done) {
      const j = await getJSON(`${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${collection}&limit=100`
        + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''), signal);
      pages++;
      for (const r of j.records || []) {
        if (recTime(r) < since) { done = true; break; }
        for (const [t, kind] of interactionsIn(collection, r.value)) {
          if (t === did || (members && !members.has(t))) continue;
          counts[kind]++;
          scores[t] = (scores[t] || 0) + WEIGHTS[kind];
          if (CONVO.has(kind)) convo[t] = (convo[t] || 0) + WEIGHTS[kind];
        }
      }
      cursor = j.cursor;
      if (!cursor) break;
      if (!done && pages >= maxPages) { capped.push(collection.split('.').pop()); break; }
    }
  }
  const out = { scores, convo, counts, capped };
  cache.set(key, out);
  return out;
}
