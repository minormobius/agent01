// days/engage.js — what other people did with an account's posts. Pure.
//
// The repo holds only the account's own records, so a post carries no counts:
// likes, reposts, replies and quotes received are other people's records. They
// come from the AppView (getPosts, 25 posts a call), filled into four typed
// arrays indexed like the repo's posts. Measured: ~75 calls/s with 10 in
// flight, so 52k posts take about 30 s, once; app.js caches the arrays.
//
// "Interactions" is o's rule: every like, repost, reply and quote counts 1.

export const KINDS = ['all', 'like', 'repost', 'reply', 'quote'];

export function emptyCounts(n) {
  return { n, like: new Uint32Array(n), repost: new Uint32Array(n), reply: new Uint32Array(n), quote: new Uint32Array(n), seen: new Uint8Array(n), done: 0 };
}

/** Record one hydrated post view at index i. A post the AppView will not
 *  return stays unseen: it sorts last and is never counted as zero-and-real. */
export function put(E, i, v) {
  if (!E.seen[i]) E.done++;
  E.seen[i] = 1;
  // the AppView has been seen to report quoteCount -1; in a Uint32Array that
  // wraps to 4,294,967,295 and swallows every total, so anything below 0 is 0
  E.like[i] = c(v.likeCount); E.repost[i] = c(v.repostCount); E.reply[i] = c(v.replyCount); E.quote[i] = c(v.quoteCount);
}
const c = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
export function miss(E, i) { if (!E.seen[i]) { E.seen[i] = 2; E.done++; } }

export const value = (E, i, kind = 'all') => (kind === 'all' ? E.like[i] + E.repost[i] + E.reply[i] + E.quote[i] : E[kind][i]);

/** Post indices by `kind`, most first; ties go to the newer post. Only seen posts. */
export function ranked(E, kind = 'all', among = null) {
  const ids = [];
  if (among) { for (const i of among) if (E.seen[i] === 1) ids.push(i); }
  else for (let i = 0; i < E.n; i++) if (E.seen[i] === 1) ids.push(i);
  return ids.sort((a, b) => value(E, b, kind) - value(E, a, kind) || b - a);
}

/** Interactions received per day (the day the POST was made), as a days map. */
export function daySums(E, posts, dayOf, kind = 'all') {
  const days = new Map();
  for (let i = 0; i < E.n; i++) {
    if (E.seen[i] !== 1) continue;
    const v = value(E, i, kind);
    if (!v) continue;
    const d = dayOf(posts[i].t);
    days.set(d, { hit: (days.get(d)?.hit || 0) + v });
  }
  return days;
}

/** Batches of indices to fetch, newest first, so the recent feed fills first. */
export function batches(E, size = 25) {
  const out = [];
  let cur = [];
  for (let i = E.n - 1; i >= 0; i--) {
    if (E.seen[i]) continue;
    cur.push(i);
    if (cur.length === size) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

// cache form: the arrays, as plain arrays of numbers (IndexedDB clones typed arrays too, but this survives JSON)
export const pack = (E) => ({ n: E.n, like: E.like, repost: E.repost, reply: E.reply, quote: E.quote, seen: E.seen, done: E.done });
export const unpack = (o) => ({ n: o.n, like: new Uint32Array(o.like), repost: new Uint32Array(o.repost), reply: new Uint32Array(o.reply), quote: new Uint32Array(o.quote), seen: new Uint8Array(o.seen), done: o.done });
