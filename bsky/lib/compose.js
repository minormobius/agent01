/**
 * Posting — the one thing here that writes.
 *
 * Everything else on this surface is read-only and needs no account. Posting
 * goes through the shared OAuth worker at auth.mino.mobi, which holds the PDS
 * token so this page never does. See ../../docs/OAUTH.md.
 *
 * The scope is deliberately one collection:
 *
 *     atproto repo:app.bsky.feed.post
 *
 * so the consent screen says "post to Bluesky" and nothing else. Do not widen
 * it to UNIFIED_SCOPE for convenience — a long consent screen for a page whose
 * only write is a post is exactly what the repo's narrow-scope policy exists to
 * prevent. `app.bsky.feed.post` is already in the auth worker's
 * WRITE_COLLECTIONS, and bsky.mino.mobi passes its *.mino.mobi origin
 * wildcard, so no change to that surface was needed.
 */

import { AuthClient } from '/packages/oauth-client/auth.js';

/**
 * ONE consent screen for everything this site writes.
 *
 * The repo's rule is a NARROW scope — only the collections this site writes —
 * not a minimal one. This site writes posts, likes and reposts, so all three
 * belong in the initial grant. Asking for `feed.post` alone and escalating with
 * `ensureScope()` on the first like meant a second consent screen, then a third
 * for the first repost: three round trips through Bluesky to use one app.
 *
 * Worse, while `app.bsky.feed.like`/`.repost` were missing from the auth
 * worker's ceiling the authorization server simply would not grant them, so
 * each escalation returned WITHOUT the scope and the next tap escalated again —
 * an unbreakable loop with no error to explain it. The ceiling now carries them
 * (77 collections), and requesting them up front means it cannot recur.
 */
export const SCOPE = [
  'atproto',
  'repo:app.bsky.feed.post',
  'repo:app.bsky.feed.like',
  'repo:app.bsky.feed.repost',
  // Not a write. Lets the reader's own PDS mint a short-lived service-auth JWT
  // so a third-party feed generator can personalise their feed — see
  // lib/feedgen.js. Already in the auth worker's RPC_SCOPES.
  'rpc:com.atproto.server.getServiceAuth',
].join(' ');

/** Bluesky counts GRAPHEMES, not UTF-16 code units. An emoji is one. */
export const MAX_GRAPHEMES = 300;

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : null;

/**
 * Length as Bluesky counts it. Falls back to [...str] (code points) where
 * Intl.Segmenter is missing — still far closer than `.length`, which counts a
 * family emoji as 11.
 *
 * @param {string} text
 * @returns {number}
 */
export function graphemeLength(text) {
  if (!text) return 0;
  if (segmenter) {
    let n = 0;
    for (const _ of segmenter.segment(text)) n++;
    return n;
  }
  return [...text].length;
}

let client = null;

/** The shared AuthClient, created once. @returns {AuthClient} */
export function auth() {
  if (!client) client = new AuthClient();
  return client;
}

/**
 * Detect links and mentions and turn them into ATProto facets — the byte-range
 * annotations that make a post's links clickable in every client.
 *
 * Ranges are in UTF-8 BYTES, not characters. Getting this wrong shifts every
 * link after the first non-ASCII character, which is why the offsets are
 * computed by encoding the text once and searching the bytes.
 *
 * @param {string} text
 * @param {(handle: string) => Promise<string|null>} resolveHandle
 * @returns {Promise<Array<object>>}
 */
export async function detectFacets(text, resolveHandle) {
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  const facets = [];

  // Byte offset of a character index, by encoding the prefix.
  const byteOf = (charIndex) => enc.encode(text.slice(0, charIndex)).length;

  const urlRe = /https?:\/\/[^\s<>()\[\]]+[^\s<>()\[\].,;:!?'"]/g;
  for (const m of text.matchAll(urlRe)) {
    facets.push({
      index: { byteStart: byteOf(m.index), byteEnd: byteOf(m.index + m[0].length) },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }],
    });
  }

  const mentionRe = /(^|\s)@([a-zA-Z0-9][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+)/g;
  for (const m of text.matchAll(mentionRe)) {
    const handle = m[2];
    const did = await resolveHandle(handle).catch(() => null);
    if (!did) continue;   // an unresolvable @thing is just text
    const start = m.index + m[1].length;
    facets.push({
      index: { byteStart: byteOf(start), byteEnd: byteOf(start + 1 + handle.length) },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did }],
    });
  }

  facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
  void bytes;
  return facets;
}

/**
 * Publish a post to the signed-in user's own repo.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {(handle: string) => Promise<string|null>} [opts.resolveHandle]
 * @param {{uri:string, cid:string}} [opts.replyTo] - parent, for a reply
 * @returns {Promise<{uri:string, cid:string}>}
 */
export async function publish(text, opts = {}) {
  const a = auth();
  if (!a.isLoggedIn()) throw new Error('not signed in');

  const n = graphemeLength(text);
  if (!n) throw new Error('empty post');
  if (n > MAX_GRAPHEMES) throw new Error(`${n} characters — the limit is ${MAX_GRAPHEMES}`);

  // Scope is fixed at authorization, so a session that predates this site's
  // scope may lack the write. ensureScope redirects to consent from the user's
  // click, which is the only place a redirect is acceptable.
  // A session minted before this site asked for all three scopes needs one
  // escalation. ensureScope navigates away, so nothing after it runs.
  if (!a.hasScope('repo:app.bsky.feed.post')) {
    await a.ensureScope('repo:app.bsky.feed.post');
    return Promise.reject(new Error('re-authorizing…'));
  }

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
  };

  if (opts.resolveHandle) {
    const facets = await detectFacets(text, opts.resolveHandle);
    if (facets.length) record.facets = facets;
  }

  if (opts.replyTo) {
    // A reply carries BOTH root and parent. Threading breaks in every client
    // if root is omitted or set to the parent of a deep reply.
    record.reply = {
      root: opts.replyTo.root || { uri: opts.replyTo.uri, cid: opts.replyTo.cid },
      parent: { uri: opts.replyTo.uri, cid: opts.replyTo.cid },
    };
  }

  return a.pds.createRecord('app.bsky.feed.post', record);
}
