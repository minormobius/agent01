// groom — the pure half of the follow-grooming tool. No DOM, no fetch, so
// `groom.selftest.mjs` can run it under node. app.js does the I/O and calls in
// here for every judgement that has a right answer.
//
// THE ONE THING THIS FILE EXISTS TO GET RIGHT: "have they posted in a year?"
// is a question about a feed that lies to you in three different ways, and each
// lie turns a live account into a deletion candidate (or hides a dead one):
//
//   1. REPOSTS ARE IN THE FEED. getAuthorFeed returns what the account boosted
//      alongside what it wrote, and the boosted post carries the ORIGINAL
//      author's timestamp — often today's. Read the top item naively and every
//      account that reposts is "active", including ones that have not written a
//      word since 2023. `authoredItems` drops anything carrying a repost reason
//      or another author's DID.
//   2. createdAt IS SELF-REPORTED. It comes out of the posting client and can
//      sit in the future — a post stamped 2031 makes a corpse look alive
//      forever. indexedAt is the appview's own clock. `effectiveTime` takes the
//      EARLIER of the two, which reads a future-dated post at its real index
//      time and still reads a genuinely backfilled old post at its real
//      authored time.
//   3. THE ANSWER CAN BE OFF THE FIRST PAGE. An account that reposts thirty
//      times a day has nothing it wrote on page one. Paging forever costs a
//      request per page per account across a thousand accounts, so
//      `needsAnotherPage` stops the moment the answer is KNOWABLE: either we
//      found something they wrote, or the page has run off the end of the
//      window and nothing they wrote can still be inside it.

export const DAY_MS = 86400000;

/** Windows the UI offers. `days` feeds the cutoff; the label is what the
 *  report says out loud, so "a year" reads as a year and not as 365. */
export const WINDOWS = [
  { days: 180, label: 'six months' },
  { days: 365, label: 'a year' },
  { days: 730, label: 'two years' },
];

// ─── Input ───────────────────────────────────────────────────────────────────

/**
 * Read whatever the user pasted into the box as an actor for the API: a bare
 * handle, an @handle, a DID, or a bsky.app / deer.social profile URL. Returns
 * null rather than guessing, so the caller can say so instead of firing a
 * request that 400s.
 * @param {string} raw
 * @returns {string|null}
 */
export function parseActorInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^did:(plc|web):[a-z0-9._:%-]+$/i.test(s)) return s;

  // A profile URL from any of the web clients — the handle is the segment
  // after /profile/. Tolerates a trailing /post/... so pasting a post URL
  // grooms the poster rather than erroring.
  const url = s.match(/^https?:\/\/[^/]+\/profile\/([^/?#]+)/i);
  const candidate = url ? decodeURIComponent(url[1]) : s.replace(/^@/, '');
  if (/^did:(plc|web):[a-z0-9._:%-]+$/i.test(candidate)) return candidate;
  // A handle is a domain: at least one dot, no spaces, no scheme.
  if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/i.test(candidate)) return candidate.toLowerCase();
  return null;
}

// ─── Reading a feed page honestly ────────────────────────────────────────────

/**
 * When a post really happened, in ms. The earlier of the record's self-reported
 * createdAt and the appview's indexedAt — see lie #2 up top. Returns null if
 * neither parses.
 * @param {object} post - a post view from getAuthorFeed
 * @returns {number|null}
 */
export function effectiveTime(post) {
  const stamps = [post?.record?.createdAt, post?.indexedAt]
    .map((t) => (t ? Date.parse(t) : NaN))
    .filter((n) => Number.isFinite(n));
  return stamps.length ? Math.min(...stamps) : null;
}

/** Is this feed item something `did` actually wrote (post or reply), as opposed
 *  to something they reposted? */
export function isAuthored(item, did) {
  if (!item || !item.post) return false;
  if (item.reason) return false;                   // reasonRepost / reasonPin
  return item.post.author?.did === did;
}

/**
 * Fold one page of getAuthorFeed into the two timestamps that matter.
 * @param {object[]} items - feed[] from getAuthorFeed
 * @param {string} did
 * @returns {{ lastPost: number|null, lastRepost: number|null, oldestSeen: number|null }}
 */
export function scanFeedPage(items, did) {
  let lastPost = null, lastRepost = null, oldestSeen = null;
  for (const item of items || []) {
    const t = effectiveTime(item?.post);
    if (t === null) continue;
    if (oldestSeen === null || t < oldestSeen) oldestSeen = t;
    // Take the MAX rather than trusting the feed's order: one future-dated post
    // clamped back to its index time can land out of sequence.
    if (isAuthored(item, did)) { if (lastPost === null || t > lastPost) lastPost = t; }
    else if (item.reason) { if (lastRepost === null || t > lastRepost) lastRepost = t; }
  }
  return { lastPost, lastRepost, oldestSeen };
}

/** Merge a page's scan into the running totals for an account. */
export function mergeScan(acc, page) {
  return {
    lastPost: acc.lastPost === null ? page.lastPost : (page.lastPost === null ? acc.lastPost : Math.max(acc.lastPost, page.lastPost)),
    lastRepost: acc.lastRepost === null ? page.lastRepost : (page.lastRepost === null ? acc.lastRepost : Math.max(acc.lastRepost, page.lastRepost)),
    oldestSeen: acc.oldestSeen === null ? page.oldestSeen : (page.oldestSeen === null ? acc.oldestSeen : Math.min(acc.oldestSeen, page.oldestSeen)),
  };
}

/**
 * Should we spend another request on this account? See lie #3.
 *
 * No, once EITHER is true:
 *   • we found something they wrote — that timestamp is the answer, whatever
 *     is further down;
 *   • the page ran past the cutoff — the feed is newest-first, so nothing they
 *     wrote inside the window can be hiding below, and "nothing since cutoff"
 *     is a complete answer even without a date.
 * Also no when the feed ended (no cursor) — there is nothing left to read.
 *
 * @param {{lastPost:number|null, oldestSeen:number|null}} acc
 * @param {number} cutoff - ms; the edge of the dormancy window
 * @param {boolean} hasCursor
 * @returns {boolean}
 */
export function needsAnotherPage(acc, cutoff, hasCursor) {
  if (!hasCursor) return false;
  if (acc.lastPost !== null) return false;
  if (acc.oldestSeen !== null && acc.oldestSeen < cutoff) return false;
  return true;
}

// ─── The verdict ─────────────────────────────────────────────────────────────

/**
 * What to call an account, given everything we managed to learn about it.
 *
 * @param {object} row
 * @param {object|null} row.profile   - the profile view, or null if getProfiles
 *   did not return one (deleted / deactivated / suspended / blocked)
 * @param {number|null} row.lastPost  - ms, from the scan
 * @param {number|null} row.lastRepost
 * @param {boolean} [row.feedError]   - the feed fetch failed outright
 * @param {boolean} [row.exhausted]   - we read the feed to its end (or to the
 *   cutoff), so "no post found" is a fact rather than a page-cap artefact
 * @param {object} opts
 * @param {number} opts.now
 * @param {number} opts.dormantDays
 * @returns {{state: string, dormant: boolean, lastPost: number|null, lastRepost: number|null}}
 */
export function classify(row, { now, dormantDays }) {
  const cutoff = now - dormantDays * DAY_MS;
  const out = { state: 'active', dormant: false, lastPost: row.lastPost ?? null, lastRepost: row.lastRepost ?? null };

  // No profile came back for a DID their repo still follows. The account is
  // gone or hidden — always worth grooming, and the only case where we cannot
  // even show a handle.
  if (!row.profile) { out.state = 'gone'; out.dormant = true; return out; }

  if (row.feedError) { out.state = 'unknown'; return out; }

  if (out.lastPost !== null && out.lastPost >= cutoff) return out;   // wrote inside the window

  // Nothing written inside the window. Distinguish the three ways that happens,
  // because they call for different decisions by the person reading the list.
  if (out.lastPost === null && !row.exhausted) { out.state = 'unknown'; return out; }
  out.dormant = true;
  if (out.lastPost === null && (row.profile.postsCount || 0) === 0) out.state = 'never';
  else if (out.lastRepost !== null && out.lastRepost >= cutoff) out.state = 'reposts-only';
  else out.state = 'dormant';
  return out;
}

/** Human-facing gloss for each state — kept next to `classify` so a new state
 *  cannot ship without one. */
export const STATE_LABEL = {
  active: 'active',
  dormant: 'silent',
  'reposts-only': 'reposts only',
  never: 'never posted',
  gone: 'gone',
  unknown: 'unreadable',
};

// ─── Selecting and counting ──────────────────────────────────────────────────

/**
 * Which rows the report shows. The two questions are independent filters and
 * the user picks whether to see their union or their overlap — "silent AND
 * doesn't follow me back" is the highest-confidence unfollow there is, and it
 * is worth being able to ask for exactly that.
 *
 * @param {object[]} rows - each { state, dormant, followsBack }
 * @param {{dormant: boolean, nonMutual: boolean, mode: 'any'|'all'}} f
 */
export function selectRows(rows, f) {
  const wants = [];
  if (f.dormant) wants.push((r) => r.dormant);
  if (f.nonMutual) wants.push((r) => r.followsBack === false);
  if (!wants.length) return rows.slice();
  return rows.filter((r) => (f.mode === 'all' ? wants.every((w) => w(r)) : wants.some((w) => w(r))));
}

/** Tallies for the summary line. */
export function summarize(rows) {
  const t = { total: rows.length, dormant: 0, nonMutual: 0, both: 0, gone: 0, never: 0, repostsOnly: 0, unknown: 0, active: 0 };
  for (const r of rows) {
    if (r.dormant) t.dormant++;
    if (r.followsBack === false) t.nonMutual++;
    if (r.dormant && r.followsBack === false) t.both++;
    if (r.state === 'gone') t.gone++;
    else if (r.state === 'never') t.never++;
    else if (r.state === 'reposts-only') t.repostsOnly++;
    else if (r.state === 'unknown') t.unknown++;
    else if (r.state === 'active') t.active++;
  }
  return t;
}

/** "3.3 years ago" / "7 months ago" / "11 days ago". Coarse on purpose — nobody
 *  grooming a follow list cares about hours.
 *
 *  The bands are tight deliberately: this number is what someone decides an
 *  unfollow on, and rounding twenty months down to "about a year" understates
 *  exactly the accounts the tool exists to surface. */
export function fmtAgo(then, now) {
  if (then === null || then === undefined) return 'never';
  const days = Math.floor((now - then) / DAY_MS);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  if (days < 365) return `${months} months ago`;
  const years = days / 365.25;
  if (years < 1.15) return 'about a year ago';
  return `${years.toFixed(years < 10 ? 1 : 0)} years ago`;
}

/**
 * What the "last posted" column says for one account.
 *
 * A null lastPost means two completely different things and the difference
 * decides whether someone unfollows: an account with no posts at all has NEVER
 * written anything, while an account with 26 posts and no null-result inside
 * the window simply wrote all of them before it. The scan stops reading the
 * moment it passes the cutoff — that is what keeps a thousand-account pass
 * affordable — so it genuinely does not know the date of the older ones, and
 * saying "never" about them is a lie that reads as a stronger case for deleting
 * than the truth does.
 *
 * @param {object} row - { lastPost, state, profile }
 * @param {string} windowLabel - e.g. 'a year', from WINDOWS
 */
export function lastPostLabel(row, windowLabel, now) {
  if (row.lastPost !== null && row.lastPost !== undefined) return fmtAgo(row.lastPost, now);
  if (row.state === 'never') return 'never posted';
  if (row.state === 'gone' || row.state === 'unknown') return 'unknown';
  return `nothing in ${windowLabel}`;
}

// ─── OAuth scope ─────────────────────────────────────────────────────────────

/** The collection an unfollow deletes from. */
export const FOLLOW_COLLECTION = 'app.bsky.graph.follow';

/**
 * Which scope token to ask for so the unfollow button can actually work.
 *
 * The narrow, honest request is `repo:app.bsky.graph.follow` — one line on the
 * consent screen, saying exactly what this site does. But auth.mino.mobi only
 * grants what its own client-metadata.json declares, and workers/auth is owned
 * by a different branch, so the collection lands in that ceiling on a deploy
 * this branch does not control. Ask for it before then and the sign-in dies at
 * PAR with `invalid_scope` — a broken button, not a degraded one.
 *
 * So read the live ceiling and ask for the narrow token when it is there,
 * falling back to `transition:generic` (which the ceiling has always carried)
 * when it is not. The site is correct today and tightens itself the moment the
 * auth worker redeploys, with no change here.
 *
 * @param {string} ceilingScope - the `scope` string from client-metadata.json
 * @returns {{token: string, narrow: boolean}}
 */
export function pickUnfollowScope(ceilingScope) {
  const tokens = new Set(String(ceilingScope || '').split(/\s+/).filter(Boolean));
  return tokens.has(`repo:${FOLLOW_COLLECTION}`)
    ? { token: `repo:${FOLLOW_COLLECTION}`, narrow: true }
    : { token: 'transition:generic', narrow: false };
}

/** The rkey of a follow record, from its AT-URI. */
export function rkeyOf(uri) {
  const m = String(uri || '').match(/\/([^/]+)$/);
  return m ? m[1] : null;
}
