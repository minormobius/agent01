/**
 * Likes and reposts — real writes to the user's own repo.
 *
 * A like is just a record: `app.bsky.feed.like` with a `subject` pointing at
 * the post's URI *and CID*. Undoing one is deleting that record, which means
 * knowing its rkey. That is the whole problem this module solves, because the
 * read path here is unauthenticated and therefore has no `viewer` state to tell
 * us what we already liked.
 *
 * Two sources of truth, in order:
 *
 *   1. LOCAL — the rkey we got back when we created the record. Instant, exact,
 *      survives reloads (IndexedDB via lib/cache.js's meta store).
 *   2. CONSTELLATION — `listLinks(postUri, LINK.likes, { did: me })` asks the
 *      global backlink index "did THIS account like THIS post?" and returns the
 *      record's rkey if so. No auth. This is how a like made on another device,
 *      or in the official app, becomes undoable here.
 *
 * The index lags a few seconds behind a write, which is exactly why local wins.
 *
 * SCOPE. These need `repo:app.bsky.feed.like` and `repo:app.bsky.feed.repost`.
 * Both were added to WRITE_COLLECTIONS in workers/auth — but that worker deploys
 * from its own branch, so until it ships, authorization refuses the scope and
 * `ensureScope` throws. `available()` reports that, and the UI says so rather
 * than failing on tap.
 */

import { auth } from '/lib/compose.js';
import { listLinks, LINK } from '/packages/atproto/constellation.js';

export const LIKE_SCOPE = 'repo:app.bsky.feed.like';
export const REPOST_SCOPE = 'repo:app.bsky.feed.repost';

const KIND = {
  like:   { collection: 'app.bsky.feed.like',   scope: LIKE_SCOPE,   link: LINK.likes },
  repost: { collection: 'app.bsky.feed.repost', scope: REPOST_SCOPE, link: LINK.reposts },
};

/** uri -> { like?: rkey, repost?: rkey }, mirrored to localStorage. */
const local = new Map();
const STORAGE = 'bsky:my-interactions';

try {
  const raw = localStorage.getItem(STORAGE);
  if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) local.set(k, v);
} catch { /* private window: memory only, which still works for this session */ }

function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(local))); }
  catch { /* over quota or blocked — the in-memory map still serves this tab */ }
}

/** @returns {boolean} whether writes are possible at all right now */
export function signedIn() { return auth().isLoggedIn(); }

/** What we believe about a post without asking anyone. */
export function localState(uri) { return local.get(uri) || {}; }

/**
 * Ask Constellation whether this account has already liked/reposted a post, and
 * get the rkey needed to undo it. Used to reconcile likes made elsewhere.
 *
 * @param {string} uri
 * @param {'like'|'repost'} kind
 * @returns {Promise<string|null>} the rkey, or null
 */
export async function findExisting(uri, kind) {
  const me = auth().getUser()?.did;
  if (!me) return null;
  try {
    const { records } = await listLinks(uri, KIND[kind].link, { did: me, limit: 1 });
    return records[0]?.rkey || null;
  } catch {
    return null;
  }
}

/**
 * Toggle a like or repost. Returns the new state.
 *
 * Optimism is the caller's job: this resolves only once the PDS has answered,
 * so a UI that wants an instant response should paint first and reconcile with
 * what comes back.
 *
 * @param {{uri: string, cid: string}} post - the CID is REQUIRED; a like whose
 *   subject has no cid is rejected by the PDS
 * @param {'like'|'repost'} kind
 * @returns {Promise<{on: boolean, rkey?: string}>}
 */
export async function toggle(post, kind) {
  const a = auth();
  if (!a.isLoggedIn()) throw new Error('sign in to ' + kind);
  if (!post?.uri) throw new Error('no post');
  const spec = KIND[kind];

  // Scope is fixed at authorization, so a session predating this feature has to
  // escalate. ensureScope redirects from the user's tap, which is the only
  // place a redirect is acceptable.
  if (!a.hasScope(spec.scope)) {
    await a.ensureScope(spec.scope);
    throw new Error('re-authorizing — tap again when you return');
  }

  const known = local.get(post.uri) || {};
  let rkey = known[kind] || await findExisting(post.uri, kind);

  if (rkey) {
    await a.pds.deleteRecord(spec.collection, rkey);
    delete known[kind];
    if (Object.keys(known).length) local.set(post.uri, known); else local.delete(post.uri);
    persist();
    return { on: false };
  }

  if (!post.cid) throw new Error('missing cid — cannot ' + kind + ' this post');
  const res = await a.pds.createRecord(spec.collection, {
    $type: spec.collection,
    subject: { uri: post.uri, cid: post.cid },
    createdAt: new Date().toISOString(),
  });
  rkey = String(res.uri || '').split('/').pop();
  local.set(post.uri, { ...known, [kind]: rkey });
  persist();
  return { on: true, rkey };
}

/**
 * Whether the shared auth worker will grant these scopes yet.
 *
 * The ceiling lives in auth.mino.mobi's client-metadata.json, and the
 * authorization server grants nothing outside it. Checking it directly means
 * the UI can explain the situation instead of letting a tap fail at the consent
 * screen with `invalid_scope`.
 *
 * @returns {Promise<{like: boolean, repost: boolean}>}
 */
export async function available() {
  try {
    const res = await fetch('https://auth.mino.mobi/client-metadata.json');
    if (!res.ok) return { like: false, repost: false };
    const scope = String((await res.json()).scope || '');
    return { like: scope.includes(LIKE_SCOPE), repost: scope.includes(REPOST_SCOPE) };
  } catch {
    return { like: false, repost: false };
  }
}
