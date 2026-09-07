// groom — the network half. Runs in the BROWSER, on the reader's own IP.
//
// WHY IT IS NOT IN THE WORKER, unlike /squares and /unique next door. Judging a
// thousand follows costs roughly a thousand getAuthorFeed calls, and the public
// appview rate-limits per IP. Done in the worker every scan on the site would
// share one Cloudflare egress IP, so the second person to press the button
// would be throttled by the first. Done here, each reader spends their own
// budget on their own follows — which is also why nothing about the account
// being groomed ever reaches a server of ours.
//
// Every read below is public and unauthenticated. The ONLY authenticated call
// in this tool is the unfollow, which app.js sends through auth.mino.mobi.

import { mergeScan, needsAnotherPage, scanFeedPage } from './groom.js';

const APPVIEW = 'https://public.api.bsky.app';
const PLC = 'https://plc.directory';
const FOLLOW_COLLECTION = 'app.bsky.graph.follow';

/** How far down one account's feed we will read before giving up and reporting
 *  `unknown`. Six pages of 50 is 300 items — past that an account is reposting
 *  so heavily that the honest answer is "could not tell", not "delete them". */
const MAX_FEED_PAGES = 6;

/** Concurrent in-flight requests. High enough that a thousand accounts finish
 *  in a couple of minutes, low enough to stay under the unauthenticated limit
 *  (3000 requests / 5 min) with room for the reader's other tabs. */
export const CONCURRENCY = 6;

/** Thrown with `.retryAfter` when the appview asks us to slow down. */
class Throttled extends Error {}

/**
 * GET some JSON, with the two retries that actually matter: 429 (respect
 * Retry-After — guessing shorter just burns the budget faster) and 5xx.
 */
async function jget(url, { tries = 4, signal } = {}) {
  let wait = 800;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { signal, headers: { accept: 'application/json' } });
    } catch (e) {
      if (signal?.aborted) throw e;
      if (attempt >= tries) throw e;
      await sleep(wait, signal); wait *= 2; continue;
    }
    if (res.ok) return res.json();
    if (res.status === 429) {
      const hinted = Number(res.headers.get('retry-after'));
      const delay = Number.isFinite(hinted) && hinted > 0 ? hinted * 1000 : wait;
      if (attempt >= tries) { const t = new Throttled('rate limited'); t.retryAfter = delay; throw t; }
      await sleep(delay, signal); wait = Math.min(wait * 2, 30000); continue;
    }
    if (res.status >= 500 && attempt < tries) { await sleep(wait, signal); wait *= 2; continue; }
    const err = new Error(`HTTP ${res.status} from ${new URL(url).pathname}`);
    err.status = res.status;
    throw err;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
}

const qs = (params) => new URLSearchParams(params).toString();

// ─── Identity ────────────────────────────────────────────────────────────────

/** Resolve whatever `parseActorInput` returned into the full profile. Throws a
 *  readable error if the handle does not exist. */
export async function resolveActor(actor, opts = {}) {
  try {
    return await jget(`${APPVIEW}/xrpc/app.bsky.actor.getProfile?${qs({ actor })}`, opts);
  } catch (e) {
    if (e.status === 400 || e.status === 404) throw new Error(`no account called “${actor}”`);
    throw e;
  }
}

/**
 * Where an account's repo actually lives. Needed because the follow LIST comes
 * from the repo rather than the appview — see `listFollows`.
 * Falls back to bsky.social, which proxies for the accounts it hosts, so a
 * plc.directory hiccup degrades instead of failing.
 */
export async function resolvePdsHost(did, opts = {}) {
  try {
    let doc;
    if (did.startsWith('did:plc:')) {
      doc = await jget(`${PLC}/${encodeURIComponent(did)}`, opts);
    } else if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).replace(/:/g, '/');
      doc = await jget(`https://${host}/.well-known/did.json`, opts);
    }
    const svc = (doc?.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
    if (svc?.serviceEndpoint) return String(svc.serviceEndpoint).replace(/\/$/, '');
  } catch { /* fall through */ }
  return 'https://bsky.social';
}

// ─── The follow list ─────────────────────────────────────────────────────────

/**
 * Every account they follow, read from their REPO rather than from the
 * appview's getFollows. Two reasons, both of which this tool depends on:
 *
 *   1. THE RKEY. An unfollow deletes a record, and only the repo listing says
 *      which record. getFollows returns profiles, and its `viewer.following`
 *      URI is populated only for a request authenticated as the viewer — so
 *      scanning someone else's account, or your own before signing in, would
 *      give a list nothing could act on.
 *   2. THE DEAD ONES SURVIVE THE TRIP. getFollows quietly omits follows whose
 *      target has been deleted, deactivated or suspended. Those are exactly
 *      what a grooming pass is looking for; the repo still holds the record,
 *      so reading the repo is what surfaces them.
 *
 * The trade is that repo records carry no profile data, which `hydrate` adds.
 */
export async function listFollows(did, { pds, onProgress, signal } = {}) {
  const host = pds || await resolvePdsHost(did, { signal });
  const follows = [];
  let cursor;
  do {
    const page = await jget(
      `${host}/xrpc/com.atproto.repo.listRecords?${qs({ repo: did, collection: FOLLOW_COLLECTION, limit: 100, ...(cursor ? { cursor } : {}) })}`,
      { signal });
    for (const rec of page.records || []) {
      const subject = rec?.value?.subject;
      if (typeof subject === 'string' && subject.startsWith('did:')) {
        follows.push({ did: subject, uri: rec.uri, followedAt: rec.value.createdAt || null });
      }
    }
    cursor = page.cursor;
    onProgress?.(follows.length);
  } while (cursor);

  // A repo can hold two follow records for the same DID (a double-follow from a
  // client retry). Keep the first; unfollowing deletes the record we kept, and
  // the stray is picked up on the next scan rather than double-deleted here.
  const seen = new Set();
  return follows.filter((f) => (seen.has(f.did) ? false : (seen.add(f.did), true)));
}

// ─── Hydration ───────────────────────────────────────────────────────────────

/**
 * Profiles for a list of DIDs, 25 at a time. DIDs the appview does not return
 * are simply absent from the Map — that absence is the signal `classify` reads
 * as `gone`, so do NOT fill it in with a placeholder.
 */
export async function hydrateProfiles(dids, { onProgress, signal } = {}) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 25) {
    const batch = dids.slice(i, i + 25);
    const url = `${APPVIEW}/xrpc/app.bsky.actor.getProfiles?${batch.map((d) => `actors=${encodeURIComponent(d)}`).join('&')}`;
    try {
      const page = await jget(url, { signal });
      for (const p of page.profiles || []) out.set(p.did, p);
    } catch (e) {
      if (signal?.aborted) throw e;
      // A batch that fails wholesale would mark 25 live accounts "gone" — the
      // most destructive failure this tool has. Retry them one at a time so a
      // single bad DID cannot condemn its neighbours.
      for (const did of batch) {
        try {
          const one = await jget(`${APPVIEW}/xrpc/app.bsky.actor.getProfiles?actors=${encodeURIComponent(did)}`, { signal, tries: 1 });
          for (const p of one.profiles || []) out.set(p.did, p);
        } catch { /* genuinely absent, or unreadable — left out of the Map */ }
      }
    }
    onProgress?.(Math.min(i + 25, dids.length));
  }
  return out;
}

/**
 * Who follows back. `getRelationships` answers 30 accounts per request in both
 * directions, so this costs ~34 calls for a thousand follows — and, unlike
 * paging getFollowers, its cost does not grow with how many followers the
 * account has. Returns a Map<did, boolean>; a DID missing from the Map means
 * the check could not be made, which `selectRows` treats as "unknown" rather
 * than as "does not follow back".
 */
export async function checkMutuals(actorDid, dids, { onProgress, signal } = {}) {
  const out = new Map();
  for (let i = 0; i < dids.length; i += 30) {
    const batch = dids.slice(i, i + 30);
    const url = `${APPVIEW}/xrpc/app.bsky.graph.getRelationships?${qs({ actor: actorDid })}&${batch.map((d) => `others=${encodeURIComponent(d)}`).join('&')}`;
    try {
      const page = await jget(url, { signal });
      for (const rel of page.relationships || []) {
        if (rel.did) out.set(rel.did, Boolean(rel.followedBy));
      }
    } catch (e) {
      if (signal?.aborted) throw e;
      // Leave the batch unset — an unanswered question, not a "no".
    }
    onProgress?.(Math.min(i + 30, dids.length));
  }
  return out;
}

// ─── The expensive bit: when did each of them last write something ───────────

/**
 * Read one account's feed far enough to answer "have they posted or replied
 * since `cutoff`?" — and no further. `needsAnotherPage` is what bounds it.
 *
 * @returns {{lastPost, lastRepost, oldestSeen, exhausted, feedError}}
 *   `exhausted` means the answer is complete: we either found something they
 *   wrote, read past the cutoff, or reached the end of the feed. When it is
 *   false we stopped at the page cap, and `classify` reports `unknown` rather
 *   than proposing a deletion on a partial read.
 */
export async function lastActivity(did, cutoff, { signal, maxPages = MAX_FEED_PAGES } = {}) {
  let acc = { lastPost: null, lastRepost: null, oldestSeen: null };
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    let res;
    try {
      res = await jget(`${APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed?${qs({
        actor: did, limit: 50, filter: 'posts_with_replies', ...(cursor ? { cursor } : {}),
      })}`, { signal, tries: 2 });
    } catch (e) {
      if (signal?.aborted) throw e;
      // A blocked, deactivated or taken-down account 400s here. That is not a
      // read failure — it is the same news the missing profile carries, and
      // classify already calls it `gone` off the profile. Anything else is a
      // genuine read failure and must not read as death.
      return { ...acc, exhausted: false, feedError: true, error: e.message };
    }
    acc = mergeScan(acc, scanFeedPage(res.feed, did));
    cursor = res.cursor;
    if (!needsAnotherPage(acc, cutoff, Boolean(cursor))) {
      return { ...acc, exhausted: true, feedError: false };
    }
  }
  return { ...acc, exhausted: false, feedError: false };
}

/** Run `worker` over `items` with a fixed number in flight. Order preserved. */
export async function pool(items, worker, { concurrency = CONCURRENCY, signal } = {}) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

export { MAX_FEED_PAGES, Throttled };
