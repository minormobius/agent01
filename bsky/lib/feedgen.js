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
/**
 * Mint the reader's service-auth JWT, and say WHY when it cannot.
 *
 * This used to return a bare `null` for four unrelated failures — not signed
 * in, session missing the rpc scope, the PDS refusing, an exception — and the
 * UI turned all four into "this session cannot mint a service token", which
 * tells a reader nothing and is not actionable. The most common one by far is
 * the second, and it is invisible: a session created BEFORE
 * `rpc:com.atproto.server.getServiceAuth` was added to `SCOPE` carries the old
 * grant forever. Signing in again fixes it, and nothing anywhere said so.
 *
 * @returns {Promise<{token: string|null, reason: string, fix?: 'signin'|'rescope'}>}
 */
export async function serviceToken(serviceDid) {
  const a = auth();
  if (!serviceDid) return { token: null, reason: 'this feed declares no service DID' };
  if (!a.isLoggedIn()) return { token: null, reason: 'sign in to personalise', fix: 'signin' };

  if (!a.hasScope(SERVICE_AUTH_SCOPE)) {
    return {
      token: null,
      fix: 'rescope',
      reason: 'your sign-in predates this permission — reauthorise to personalise',
    };
  }

  try {
    // `lxm` binds the token to getFeedSkeleton alone — without it the JWT would
    // be usable for any method at that audience.
    const params = new URLSearchParams({
      aud: serviceDid,
      lxm: 'app.bsky.feed.getFeedSkeleton',
    });
    const res = await a.request(`/pds/server/getServiceAuth?${params}`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { token: null, reason: `your PDS refused to mint a token (${res.status})`, body: body.slice(0, 200) };
    }
    const token = (await res.json())?.token || null;
    return token
      ? { token, reason: 'personalised to you' }
      : { token: null, reason: 'your PDS returned no token' };
  } catch (err) {
    return { token: null, reason: `could not reach your PDS: ${err.message}` };
  }
}

/** True when re-authorising would fix personalisation. Needs a user gesture. */
export async function rescopeForFeeds() {
  return auth().ensureScope(SERVICE_AUTH_SCOPE);
}

/**
 * Resolve a feed's service endpoint IN THE BROWSER, when the network lets us.
 *
 * Three of the four steps are browser-reachable: the generator record and the
 * hydration both come from the public AppView (CORS `*`), and a `did:plc`
 * service resolves through plc.directory (CORS `*`). Only a `did:web`
 * document served from the operator's own host may refuse — measured:
 * foryou.club does.
 *
 * @returns {Promise<string|null>} the endpoint, or null if we cannot see it
 */
async function resolveEndpointInBrowser(serviceDid) {
  try {
    let doc;
    if (serviceDid.startsWith('did:plc:')) {
      doc = await (await fetch(`https://plc.directory/${serviceDid}`)).json();
    } else if (serviceDid.startsWith('did:web:')) {
      const host = serviceDid.slice('did:web:'.length).replace(/:/g, '/');
      doc = await (await fetch(`https://${host}/.well-known/did.json`)).json();
    } else return null;
    const svc = (doc.service || []).find((x) => x.id === '#bsky_fg' || x.type === 'BskyFeedGenerator');
    const ep = svc?.serviceEndpoint;
    return typeof ep === 'string' && ep.startsWith('https://') ? ep : null;
  } catch {
    return null;              // almost always CORS on the operator's host
  }
}

/** service DID → 'direct' | 'relay', remembered for the session. */
const routeFor = new Map();

/**
 * Load a page of any feed generator, hydrated into renderable posts.
 *
 * **Direct first, relay only if refused.** Not every generator needs the shim:
 * a survey of 10 live services found 3 answering with `access-control-allow-origin: *`,
 * including Bluesky's own `discover.bsky.app`. Those the browser calls itself,
 * with no worker in the path at all — which is worth doing, because the less
 * traffic through our relay the smaller the thing anyone has to trust.
 *
 * The verdict is cached per service, so the failed attempt costs one request
 * once rather than on every page.
 *
 * @param {string} feedUri
 * @param {{limit?: number, cursor?: string}} [opts]
 * @returns {Promise<{posts, cursor?, personalised: boolean, route: 'direct'|'relay'}>}
 */
export async function loadCustomFeed(feedUri, { limit = 30, cursor } = {}) {
  const meta = await generatorMeta(feedUri);
  const mint = await serviceToken(meta.serviceDid);
  const token = mint.token;
  const headers = token ? { authorization: `Bearer ${token}` } : {};

  const params = new URLSearchParams({ feed: feedUri, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  let skeleton = null;
  let route = routeFor.get(meta.serviceDid) || null;

  if (route !== 'relay') {
    const endpoint = await resolveEndpointInBrowser(meta.serviceDid);
    if (endpoint) {
      try {
        const direct = await fetch(
          `${endpoint}/xrpc/app.bsky.feed.getFeedSkeleton?${params}`, { headers }
        );
        if (direct.ok) {
          skeleton = await direct.json();
          route = 'direct';
        }
      } catch {
        // A CORS refusal surfaces here as a TypeError with no status. Nothing
        // to distinguish it from a network fault, and the fallback handles both.
      }
    }
    routeFor.set(meta.serviceDid, skeleton ? 'direct' : 'relay');
  }

  if (!skeleton) {
    route = 'relay';
    const res = await fetch(`${RELAY}?${params}`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `feed ${res.status}`);
    }
    skeleton = await res.json();
  }

  const uris = (skeleton.feed || []).map((f) => f.post).filter(Boolean);
  const posts = await hydrate(uris);
  return { posts, cursor: skeleton.cursor, personalised: Boolean(token), route,
           why: mint.reason, fix: mint.fix };
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
