// closeness.js — "which accounts is this handle closest to", server-side.
//
// Lifted verbatim out of squares/circle.js, which was the first tool to need it
// and is no longer the only one: /orbit rings the same ranked set around a game
// arena. One tool importing another tool's private module is how five pages
// ended up loading feedgen's copy of the typeahead, so the shared thing moved
// here instead — same arrangement as lib/graph.js and lib/gc.js.
//
// The ranking is deliberately NOT engagement-received. It reads the seed's own
// repository — their likes, their reposts, their replies, their quotes — so it
// measures who *they* reach for, which is what "closest" should mean and what a
// follower count never says. Weights are in WEIGHTS below and are editorial: a
// reply costs you a sentence, a like costs you a thumb.
//
// Read-only public data. The AppView reads take a service token when the caller
// has one (higher rate limit); the bulk repo scan hits the PDS unauthenticated,
// which is public and is not the bottleneck.

export const PUB = 'https://public.api.bsky.app/xrpc'; // unauthed AppView reads
export const APP = 'https://api.bsky.app/xrpc';        // authed AppView reads (Bearer)

/** What one interaction is worth. Editorial, not measured. */
export const WEIGHTS = { like: 1, repost: 2, reply: 3, quote: 4 };

/** Page ceilings per collection — these bound subrequests and wall time. */
export const BUDGET = { like: 20, repost: 8, post: 12 };

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** `at://did:plc:xyz/app.bsky.feed.post/3k…` → `did:plc:xyz`. */
export const authorOf = (uri) =>
  (uri && uri.startsWith('at://')) ? uri.slice(5).split('/')[0] : null;

export async function jget(url, headers) {
  const r = await fetch(url, headers ? { headers } : undefined);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** AppView read: authed (api.bsky.app) when a token is present, else public. */
export function appGet(method, params, token) {
  const u = new URL(`${token ? APP : PUB}/${method}`);
  for (const k in params) {
    const v = params[k];
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k, x));
    else if (v != null && v !== '') u.searchParams.set(k, v);
  }
  return jget(u.toString(), token ? { Authorization: `Bearer ${token}` } : null);
}

/**
 * Authed read that transparently retries on the public AppView if the authed
 * host rejects — so a token quirk degrades the rate limit, never the tool.
 */
export async function appGetSafe(method, params, token) {
  try { return await appGet(method, params, token); }
  catch (e) { if (token) { try { return await appGet(method, params, null); } catch {} } throw e; }
}

/** Anything a person might paste → a DID. */
export async function resolveActor(actor) {
  const a = (actor || '').trim().replace(/^@/, '').replace(/^at:\/\//, '')
    .replace(/^https?:\/\/(bsky\.app\/profile\/)?/, '').split('/')[0];
  if (!a) throw new Error('empty handle');
  if (a.startsWith('did:')) return a;
  const d = await jget(`${PUB}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(a)}`);
  if (!d.did) throw new Error(`couldn't resolve “${a}”`);
  return d.did;
}

/** DID → the PDS that actually holds the repo. */
export async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) doc = await jget(`https://plc.directory/${did}`);
  else if (did.startsWith('did:web:')) doc = await jget(`https://${did.slice(8).replace(/:/g, '/')}/.well-known/did.json`);
  else throw new Error('unsupported DID method');
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds');
  if (!svc) throw new Error('no PDS in DID doc');
  return svc.serviceEndpoint;
}

/**
 * Paginate a repo collection newest-first, stopping once records fall before
 * `sinceMs`. Records are self-timestamped, so this is a floor on the window,
 * not a guarantee about it.
 */
export async function scan(pds, did, collection, sinceMs, maxPages, onRec) {
  let cursor = '', stop = false;
  for (let p = 0; p < maxPages && !stop; p++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', did);
    u.searchParams.set('collection', collection);
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    let d; try { d = await jget(u.toString()); } catch { break; }
    const recs = d.records || [];
    for (const rec of recs) {
      const t = rec.value && rec.value.createdAt ? Date.parse(rec.value.createdAt) : 0;
      if (t && t < sinceMs) { stop = true; break; }
      onRec(rec);
    }
    if (!d.cursor || recs.length === 0) break;
    cursor = d.cursor;
  }
}

/**
 * The quote target of a post record, if it quotes one. Pure — exported because
 * the selftest is the only thing that can prove the two embed shapes are both
 * handled, and a quote is the heaviest-weighted interaction there is.
 */
export function quoteTarget(v) {
  const emb = v && v.embed;
  if (!emb) return null;
  let uri = null;
  if (emb.$type === 'app.bsky.embed.record' && emb.record) uri = emb.record.uri;
  else if (emb.$type === 'app.bsky.embed.recordWithMedia' && emb.record && emb.record.record) uri = emb.record.record.uri;
  return (uri && uri.includes('/app.bsky.feed.post/')) ? uri : null;
}

/** An empty tally row. */
const row = (did) => ({ did, like: 0, repost: 0, reply: 0, quote: 0, score: 0 });

/**
 * Read the seed's own three collections and tally who they reached for.
 * Returns a Map did → { like, repost, reply, quote, score }, self excluded.
 */
export async function interactionCounts(pds, seedDid, sinceMs, budget = BUDGET) {
  const counts = new Map();
  const add = (did, type) => {
    if (!did || did === seedDid) return;
    let e = counts.get(did);
    if (!e) { e = row(did); counts.set(did, e); }
    e[type]++; e.score += WEIGHTS[type];
  };

  await Promise.all([
    scan(pds, seedDid, 'app.bsky.feed.like', sinceMs, budget.like,
      (rec) => add(authorOf(rec.value && rec.value.subject && rec.value.subject.uri), 'like')),
    scan(pds, seedDid, 'app.bsky.feed.repost', sinceMs, budget.repost,
      (rec) => add(authorOf(rec.value && rec.value.subject && rec.value.subject.uri), 'repost')),
    scan(pds, seedDid, 'app.bsky.feed.post', sinceMs, budget.post, (rec) => {
      const v = rec.value || {};
      if (v.reply && v.reply.parent && v.reply.parent.uri) add(authorOf(v.reply.parent.uri), 'reply');
      const qu = quoteTarget(v);
      if (qu) add(authorOf(qu), 'quote');
    }),
  ]);
  return counts;
}

/** Highest score first; ties break on the cheap interactions, then on DID. */
export function rank(counts) {
  return [...counts.values()].sort((a, b) =>
    b.score - a.score ||
    (b.like + b.repost) - (a.like + a.repost) ||
    String(a.did).localeCompare(String(b.did)));
}

/** Display names and avatars, 25 at a time. Decoration — never throws. */
export async function profilesFor(dids, token) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    try {
      const d = await appGetSafe('app.bsky.actor.getProfiles', { actors: dids.slice(i, i + 25) }, token);
      for (const p of (d.profiles || [])) out.set(p.did, p);
    } catch { /* decoration */ }
  }
  return out;
}

/**
 * Which of `others` follow the seed back. `getRelationships` answers 30 pairs
 * per request in both directions, so this is one or two calls for a circle —
 * paging getFollowers for a popular seed would be unbounded work for the same
 * answer. Never throws: an unknown answer must not empty the circle.
 */
export async function mutualsAmong(seedDid, others, token) {
  const mutual = new Set();
  const jobs = [];
  for (let i = 0; i < others.length; i += 30) {
    const chunk = others.slice(i, i + 30);
    jobs.push(appGetSafe('app.bsky.graph.getRelationships', { actor: seedDid, others: chunk }, token)
      .then((d) => { for (const r of (d.relationships || [])) if (r.following && r.followedBy) mutual.add(r.did); })
      .catch(() => {}));
  }
  await Promise.all(jobs);
  return mutual;
}

/**
 * Pick the circle out of a ranked list, preferring mutuals.
 *
 * "Closest mutuals" is the ask, but a hard mutuals-only filter can hand back a
 * circle of four because the seed spent the month replying to people who have
 * not followed them back — and a four-seat arena is not the tool anyone asked
 * for. So: mutuals fill the ring in rank order first, and non-mutuals top it up
 * only if there are not enough. `mutual: false` on a tile is the honest label
 * for a seat filled that way; nothing is silently substituted.
 *
 * Pure, so the selftest can pin the fallback rather than hoping for it.
 */
export function pickCircle(ranked, mutualSet, n) {
  const mutual = [], rest = [];
  for (const c of ranked) (mutualSet.has(c.did) ? mutual : rest).push(c);
  const out = mutual.slice(0, n);
  for (const c of rest) { if (out.length >= n) break; out.push(c); }
  return out.map((c) => ({ ...c, mutual: mutualSet.has(c.did) }));
}
