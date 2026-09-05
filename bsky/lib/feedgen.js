/**
 * Custom feeds — including personalised ones published by other people.
 *
 * This is the piece that makes the surface an AppView rather than a reader: any
 * `app.bsky.feed.generator` on the network, rendered here, personalised to
 * whoever is signed in.
 *
 * How a personalised feed knows who you are: the generator is an independent
 * service, and Bluesky's own AppView identifies the reader to it with a
 * short-lived **service-auth JWT** — `iss` the reader's DID, `aud` the feed's
 * service DID, `lxm` the one method it may be used for. The browser can get
 * exactly the same thing: `com.atproto.server.getServiceAuth` on the reader's
 * OWN PDS mints it. Nobody has to trust us with anything; the credential is
 * theirs, narrow, and lives about a minute.
 *
 * What the browser cannot do is send it. Feed generators do not answer with
 * CORS headers — measured: `foryou.club` and `api.graze.social` send none,
 * while our own `feed.mino.mobi` sends `*`, which is why simcluster loads
 * directly and a third-party feed does not. So the request goes through this
 * surface's own worker, which is a CORS shim holding no credential of its own
 * and choosing no destination (it resolves the endpoint from the feed URI).
 *
 * A feed with no valid JWT still answers — with a generic list rather than an
 * error. Signed out you get someone's idea of a good default; signed in you get
 * yours. Verified that two different malformed tokens return byte-identical
 * lists, so the fallback reads no identity.
 */

import { auth } from '/lib/compose.js';

const BSKY_PUBLIC = 'https://public.api.bsky.app';
const RELAY = '/api/feedgen';

/** The scope that lets this site mint a service-auth JWT on the reader's PDS. */
export const SERVICE_AUTH_SCOPE = 'rpc:com.atproto.server.getServiceAuth';

/** at:// uri → the generator's own record (displayName, avatar, service DID). */
const metaCache = new Map();

/**
 * @param {string} feedUri
 * @returns {Promise<{uri, serviceDid, displayName, description, avatar, creatorDid}>}
 */
export async function generatorMeta(feedUri) {
  if (metaCache.has(feedUri)) return metaCache.get(feedUri);
  const m = /^at:\/\/([^/]+)\/([^/]+)\/(.+)$/.exec(feedUri);
  if (!m) throw new Error('not an at:// feed uri');
  const [, repo, collection, rkey] = m;

  const res = await fetch(
    `${BSKY_PUBLIC}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(repo)}`
    + `&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`
  );
  if (!res.ok) throw new Error(`feed record ${res.status}`);
  const v = (await res.json())?.value || {};
  const meta = {
    uri: feedUri,
    serviceDid: v.did,
    displayName: v.displayName || rkey,
    description: v.description || '',
    creatorDid: repo,
  };
  metaCache.set(feedUri, meta);
  return meta;
}

/**
 * Mint a service-auth JWT for one feed service and one method.
 *
 * Returns null when signed out, or when the session lacks the RPC scope — both
 * are ordinary states, not errors: the caller falls back to the feed's
 * unauthenticated response.
 *
 * @param {string} serviceDid
 * @returns {Promise<string|null>}
 */
export async function serviceToken(serviceDid) {
  const a = auth();
  if (!a.isLoggedIn() || !serviceDid) return null;
  if (!a.hasScope(SERVICE_AUTH_SCOPE)) return null;
  try {
    // `lxm` binds the token to getFeedSkeleton alone — without it the JWT would
    // be usable for any method at that audience.
    const params = new URLSearchParams({
      aud: serviceDid,
      lxm: 'app.bsky.feed.getFeedSkeleton',
    });
    const res = await a.request(`/pds/server/getServiceAuth?${params}`);
    if (!res.ok) return null;
    return (await res.json())?.token || null;
  } catch {
    return null;
  }
}

/**
 * Load a page of any feed generator, hydrated into renderable posts.
 *
 * @param {string} feedUri
 * @param {{limit?: number, cursor?: string}} [opts]
 * @returns {Promise<{posts: object[], cursor?: string, personalised: boolean}>}
 */
export async function loadCustomFeed(feedUri, { limit = 30, cursor } = {}) {
  const meta = await generatorMeta(feedUri);
  const token = await serviceToken(meta.serviceDid);

  const params = new URLSearchParams({ feed: feedUri, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`${RELAY}?${params}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `feed ${res.status}`);
  }
  const skeleton = await res.json();

  const uris = (skeleton.feed || []).map((f) => f.post).filter(Boolean);
  const posts = await hydrate(uris);
  return { posts, cursor: skeleton.cursor, personalised: Boolean(token) };
}

/** getPosts takes 25 at a time, and does not preserve order — the order IS the feed. */
async function hydrate(uris) {
  const out = [];
  for (let i = 0; i < uris.length; i += 25) {
    const p = new URLSearchParams();
    for (const u of uris.slice(i, i + 25)) p.append('uris', u);
    try {
      const r = await fetch(`${BSKY_PUBLIC}/xrpc/app.bsky.feed.getPosts?${p}`);
      if (!r.ok) continue;
      const { posts = [] } = await r.json();
      for (const post of posts) {
        out.push({
          uri: post.uri,
          cid: post.cid,
          did: post.author.did,
          rkey: post.uri.split('/').pop(),
          createdAt: post.record?.createdAt || post.indexedAt,
          record: post.record,
          author: post.author,
          viewEmbed: post.embed || null,
          counts: {
            likeCount: post.likeCount ?? 0,
            repostCount: post.repostCount ?? 0,
            replyCount: post.replyCount ?? 0,
            quoteCount: post.quoteCount ?? 0,
          },
        });
      }
    } catch { /* a lost page is not a lost feed */ }
  }
  const rank = new Map(uris.map((u, i) => [u, i]));
  out.sort((a, b) => (rank.get(a.uri) ?? 1e9) - (rank.get(b.uri) ?? 1e9));
  return out;
}

/**
 * Feeds published by one account — how a reader finds a feed to add.
 * @param {string} actor
 */
export async function feedsBy(actor) {
  try {
    const res = await fetch(
      `${BSKY_PUBLIC}/xrpc/app.bsky.feed.getActorFeeds?actor=${encodeURIComponent(actor)}&limit=50`
    );
    if (!res.ok) return [];
    return (await res.json()).feeds || [];
  } catch { return []; }
}

// ─── the reader's own feed list ──────────────────────────────────

const SAVED = 'bsky:feeds';

/** Feeds the reader has added here, as at:// URIs. Local to this browser. */
export function savedFeeds() {
  try { return JSON.parse(localStorage.getItem(SAVED) || '[]'); } catch { return []; }
}

export function saveFeed(uri) {
  const list = savedFeeds();
  if (list.includes(uri)) return list;
  const next = [...list, uri];
  try { localStorage.setItem(SAVED, JSON.stringify(next)); } catch { /* not fatal */ }
  return next;
}

export function removeFeed(uri) {
  const next = savedFeeds().filter((x) => x !== uri);
  try { localStorage.setItem(SAVED, JSON.stringify(next)); } catch { /* not fatal */ }
  return next;
}

/**
 * The feed this whole exercise is about: @spacecowboy17's For You, which is
 * genuinely personalised per reader. Offered by default so a signed-in visitor
 * can see their own without having to find it first.
 */
export const FOR_YOU = 'at://did:plc:3guzzweuqraryl3rdkimjamk/app.bsky.feed.generator/for-you';
