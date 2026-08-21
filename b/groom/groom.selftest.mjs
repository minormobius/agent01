// groom selftest — run before changing b/groom/groom.js:
//   node b/groom/groom.selftest.mjs
//
// This tool's output is a list of accounts to DELETE from someone's follows, so
// a wrong answer here is destructive in a way a wrong answer in a reader is
// not. The assertions below are the three feed lies documented at the top of
// groom.js, each with the fixture shape the real API returns:
//
//   • a repost carries the ORIGINAL author's fresh timestamp — counting it as
//     activity keeps dead accounts off the list forever;
//   • createdAt is client-supplied and can be in the future — trusting it keeps
//     a corpse alive until 2031;
//   • the answer can sit below page one — stopping early with no authored post
//     found must report "unknown", never "dormant", or the tool proposes
//     deleting someone it simply did not read far enough to see.

import {
  classify, effectiveTime, fmtAgo, isAuthored, mergeScan, needsAnotherPage,
  lastPostLabel, parseActorInput, pickUnfollowScope, rkeyOf, scanFeedPage, selectRows, summarize, DAY_MS,
} from './groom.js';

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.error('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const NOW = Date.parse('2026-08-21T12:00:00Z');
const ago = (days) => new Date(NOW - days * DAY_MS).toISOString();
const ME = 'did:plc:me';

// A post the account wrote.
const post = (days, extra = {}) => ({
  post: { author: { did: ME }, record: { createdAt: ago(days) }, indexedAt: ago(days) },
  ...extra,
});
// Something they reposted: someone ELSE's post, carrying a repost reason.
const repost = (days) => ({
  post: { author: { did: 'did:plc:other' }, record: { createdAt: ago(days) }, indexedAt: ago(days) },
  reason: { $type: 'app.bsky.feed.defs#reasonRepost' },
});

// ── input ────────────────────────────────────────────────────────────────────
{
  eq(parseActorInput('alice.bsky.social'), 'alice.bsky.social', 'a bare handle passes through');
  eq(parseActorInput('  @Alice.BSKY.social '), 'alice.bsky.social', 'an @ and stray case and space are cleaned off');
  eq(parseActorInput('did:plc:z72i7hdynmk6r22z27h6tvur'), 'did:plc:z72i7hdynmk6r22z27h6tvur', 'a DID passes through');
  eq(parseActorInput('https://bsky.app/profile/alice.bsky.social'), 'alice.bsky.social', 'a profile URL yields the handle');
  eq(parseActorInput('https://bsky.app/profile/alice.bsky.social/post/3kabc'), 'alice.bsky.social',
    'a POST url grooms the poster rather than erroring');
  eq(parseActorInput('https://deer.social/profile/did:plc:abc'), 'did:plc:abc', 'other clients and DID-in-URL work too');
  eq(parseActorInput('not a handle'), null, 'a bare word is refused, not guessed at');
  eq(parseActorInput(''), null, 'and so is nothing');
}

// ── lie #1: reposts are not posts ────────────────────────────────────────────
{
  ok(isAuthored(post(5), ME), 'a post by the account is authored');
  ok(!isAuthored(repost(1), ME), 'a repost is NOT authored');
  ok(!isAuthored({ post: { author: { did: ME } }, reason: { $type: 'app.bsky.feed.defs#reasonPin' } }, ME),
    'a pin reason is not a fresh authored item either — a pinned post resurfaces old text');

  // The shape that matters: reposted today, last wrote two years ago.
  const scan = scanFeedPage([repost(0), repost(1), post(730)], ME);
  eq(scan.lastRepost, NOW, 'the repost is recorded as a repost');
  eq(scan.lastPost, NOW - 730 * DAY_MS, 'and the last thing they WROTE is two years old');

  const v = classify({ profile: { postsCount: 40 }, ...scan, exhausted: true }, { now: NOW, dormantDays: 365 });
  eq(v.state, 'reposts-only', 'so they are dormant — but flagged as still boosting, not as a corpse');
  ok(v.dormant, 'and they do land in the report');
}

// ── lie #2: createdAt is self-reported ───────────────────────────────────────
{
  const futureDated = { record: { createdAt: ago(-2000) }, indexedAt: ago(900) };
  eq(effectiveTime(futureDated), NOW - 900 * DAY_MS,
    'a post stamped in the future is read at the time the appview actually saw it');

  const backfilled = { record: { createdAt: ago(2000) }, indexedAt: ago(900) };
  eq(effectiveTime(backfilled), NOW - 2000 * DAY_MS,
    'but a genuinely old post keeps its authored date — the earlier of the two is right both ways');

  eq(effectiveTime({}), null, 'a post with no usable timestamp yields null rather than NaN');
  eq(effectiveTime({ record: { createdAt: 'nonsense' }, indexedAt: ago(3) }), NOW - 3 * DAY_MS,
    'an unparseable createdAt falls back to indexedAt instead of poisoning the result');

  // The whole point: the future-dated corpse still gets reported.
  const v = classify(
    { profile: { postsCount: 12 }, ...scanFeedPage([{ post: { author: { did: ME }, ...futureDated } }], ME), exhausted: true },
    { now: NOW, dormantDays: 365 });
  eq(v.state, 'dormant', 'a future-dated post does not keep a dead account off the list');
}

// ── lie #3: the answer can be below page one ─────────────────────────────────
{
  const allReposts = scanFeedPage([repost(1), repost(2), repost(3)], ME);
  ok(needsAnotherPage(allReposts, NOW - 365 * DAY_MS, true),
    'a page of nothing but recent reposts is not an answer — keep reading');
  ok(!needsAnotherPage(allReposts, NOW - 365 * DAY_MS, false),
    'unless the feed ended, in which case there is nothing left to read');

  ok(!needsAnotherPage(scanFeedPage([post(400)], ME), NOW - 365 * DAY_MS, true),
    'finding something they wrote is a complete answer, however old');
  ok(!needsAnotherPage(scanFeedPage([repost(400)], ME), NOW - 365 * DAY_MS, true),
    'and a page that has run past the cutoff proves nothing authored is left inside the window');

  // The destructive case: we gave up early and never saw an authored post.
  const gaveUp = classify({ profile: { postsCount: 900 }, ...allReposts, exhausted: false }, { now: NOW, dormantDays: 365 });
  eq(gaveUp.state, 'unknown', 'stopping at the page cap reports UNKNOWN, never dormant');
  ok(!gaveUp.dormant, 'so a heavy reposter is never proposed for deletion on a partial read');

  eq(mergeScan({ lastPost: null, lastRepost: 5, oldestSeen: 5 }, { lastPost: 3, lastRepost: null, oldestSeen: 3 }).lastPost, 3,
    'merging pages keeps a value found on the later page');
  eq(mergeScan({ lastPost: 9, lastRepost: null, oldestSeen: 9 }, { lastPost: 3, lastRepost: null, oldestSeen: 3 }).oldestSeen, 3,
    'and tracks the oldest thing seen across all of them');
}

// ── the rest of the verdicts ─────────────────────────────────────────────────
{
  const at = (o) => classify(o, { now: NOW, dormantDays: 365 });

  eq(at({ profile: { postsCount: 5 }, lastPost: NOW - 10 * DAY_MS, exhausted: true }).state, 'active',
    'someone who posted last week is active');
  ok(!at({ profile: { postsCount: 5 }, lastPost: NOW - 10 * DAY_MS, exhausted: true }).dormant,
    'and stays out of the report');

  eq(at({ profile: { postsCount: 5 }, lastPost: NOW - 364 * DAY_MS, exhausted: true }).state, 'active',
    'the day before the cutoff is still active — the boundary is not off by one');
  eq(at({ profile: { postsCount: 5 }, lastPost: NOW - 366 * DAY_MS, exhausted: true }).state, 'dormant',
    'the day after it is not');

  eq(at({ profile: { postsCount: 0 }, lastPost: null, exhausted: true }).state, 'never',
    'an account that never posted at all is called that, not "silent for a year"');
  eq(at({ profile: null }).state, 'gone',
    'a DID the repo follows with no profile behind it is gone — deleted, deactivated or suspended');
  ok(at({ profile: null }).dormant, 'and gone accounts belong in the report');
  eq(at({ profile: { postsCount: 5 }, feedError: true }).state, 'unknown',
    'a feed that failed to load is unknown — a network blip must not read as death');
  ok(!at({ profile: { postsCount: 5 }, feedError: true }).dormant, 'and is never proposed for deletion');

  // A shorter window reclassifies without any refetching.
  const row = { profile: { postsCount: 5 }, lastPost: NOW - 200 * DAY_MS, exhausted: true };
  eq(classify(row, { now: NOW, dormantDays: 365 }).state, 'active', '200 days is active against a year');
  eq(classify(row, { now: NOW, dormantDays: 180 }).state, 'dormant', 'and dormant against six months');
}

// ── filtering and counting ───────────────────────────────────────────────────
{
  const rows = [
    { state: 'dormant', dormant: true, followsBack: true },
    { state: 'dormant', dormant: true, followsBack: false },
    { state: 'active', dormant: false, followsBack: false },
    { state: 'active', dormant: false, followsBack: true },
    { state: 'gone', dormant: true, followsBack: false },
  ];
  eq(selectRows(rows, { dormant: true, nonMutual: false, mode: 'any' }).length, 3, 'silent-only selects the three dormant rows');
  eq(selectRows(rows, { dormant: false, nonMutual: true, mode: 'any' }).length, 3, 'no-follow-back selects the three non-mutuals');
  eq(selectRows(rows, { dormant: true, nonMutual: true, mode: 'all' }).length, 2, 'AND selects only the overlap');
  eq(selectRows(rows, { dormant: true, nonMutual: true, mode: 'any' }).length, 4, 'OR selects the union');
  eq(selectRows(rows, { dormant: false, nonMutual: false, mode: 'all' }).length, 5, 'no filter shows everything');

  // followsBack is undefined when the mutual check was not run — that must not
  // read as "does not follow back" and sweep the whole list into the report.
  eq(selectRows([{ dormant: false }], { dormant: false, nonMutual: true, mode: 'any' }).length, 0,
    'an unchecked mutual status is not a non-mutual');

  const t = summarize(rows);
  eq(t.total, 5, 'total counts every follow');
  eq(t.dormant, 3, 'dormant tally');
  eq(t.nonMutual, 3, 'non-mutual tally');
  eq(t.both, 2, 'and the overlap is counted separately');
  eq(t.gone, 1, 'gone tally');
}

// ── scope, rkeys, dates ──────────────────────────────────────────────────────
{
  const narrow = pickUnfollowScope('atproto repo:app.bsky.feed.post repo:app.bsky.graph.follow');
  eq(narrow.token, 'repo:app.bsky.graph.follow', 'with the collection in the live ceiling, ask narrowly');
  ok(narrow.narrow, 'and say so');

  const wide = pickUnfollowScope('atproto transition:generic repo:app.bsky.feed.post');
  eq(wide.token, 'transition:generic', 'without it, fall back to what the ceiling does carry');
  ok(!wide.narrow, 'and flag that the ask is broader than it should be');
  eq(pickUnfollowScope('').token, 'transition:generic', 'an unreadable ceiling falls back rather than throwing');

  eq(rkeyOf('at://did:plc:me/app.bsky.graph.follow/3kabc'), '3kabc', 'the rkey is the last segment of the AT-URI');
  eq(rkeyOf(''), null, 'and a missing URI yields null rather than a bad delete');

  eq(fmtAgo(null, NOW), 'never', 'no timestamp reads as never');
  eq(fmtAgo(NOW, NOW), 'today', 'today');
  eq(fmtAgo(NOW - 1 * DAY_MS, NOW), 'yesterday', 'yesterday');
  eq(fmtAgo(NOW - 20 * DAY_MS, NOW), '20 days ago', 'days stay days for a while');
  eq(fmtAgo(NOW - 200 * DAY_MS, NOW), '7 months ago', 'then months');
  eq(fmtAgo(NOW - 400 * DAY_MS, NOW), 'about a year ago', 'just over a year reads as about a year');
  eq(fmtAgo(NOW - 620 * DAY_MS, NOW), '1.7 years ago',
    'but twenty months does NOT — rounding it down to "about a year" understates the case for unfollowing');
  eq(fmtAgo(NOW - 1200 * DAY_MS, NOW), '3.3 years ago', 'and older reads in years');
}

// ── "never" vs "not in the window" ───────────────────────────────────────────
// Both come back with lastPost === null and they are not the same fact. The
// scan stops reading once it passes the cutoff, so an account with two dozen
// old posts has no date attached — calling that "never posted" overstates the
// case for deleting it.
{
  const W = 'a year';
  eq(lastPostLabel({ lastPost: NOW - 500 * DAY_MS, state: 'dormant' }, W, NOW), '1.4 years ago',
    'a known date is just the date');
  eq(lastPostLabel({ lastPost: null, state: 'never' }, W, NOW), 'never posted',
    'an empty account says so');
  eq(lastPostLabel({ lastPost: null, state: 'reposts-only' }, W, NOW), 'nothing in a year',
    'an account whose posts all predate the window is reported as that, NOT as "never"');
  eq(lastPostLabel({ lastPost: null, state: 'dormant' }, W, NOW), 'nothing in a year',
    'same for a plain dormant account read only as far as the cutoff');
  eq(lastPostLabel({ lastPost: null, state: 'gone' }, W, NOW), 'unknown',
    'and a deleted account has no readable history at all');
  eq(lastPostLabel({ lastPost: null, state: 'unknown' }, 'six months', NOW), 'unknown',
    'as does one whose feed would not load');
}

if (failures) { console.error(`\ngroom selftest: ${failures} failure(s)`); process.exit(1); }
console.log('groom selftest: all assertions passed');
