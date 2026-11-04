# screen — "First Words," a grid of first replies among mutuals

## What this is

Requested in a Bluesky thread as: "I want to create a grid that's all mutuals
first reply to every other mutual." Read literally and built literally: type a
handle, the page finds that account's mutuals (people they follow who follow
them back), and for every ordered pair of included mutuals it shows the
earliest reply one sent the other — laid out as an N×N grid, rows are "from,"
columns are "to," a cell is a clickable date if a reply was found or a dot if
not.

Shipped as a complete, working single turn — not a skeleton. Handle
typeahead, full follow/follower pagination up to a cap, mutual-graph
intersection, concurrent per-mutual feed scanning with a live progress
counter, and a scrollable sticky-header/sticky-column grid render with real
links back to the actual reply post on bsky.app.

**Turn 2 (this one):** the requester asked, in-thread, to "expand it to like,
100? and get the 100 by the 100 'top' mutuals ie the ones the account
responds to the most." Two changes: the cap slider now goes to 4–100
(default 50, was 4–20/10), and mutual *selection* is no longer "first N
returned by getFollows" — it's now ranked by how often the searched account
replies to each mutual, measured by scanning the searched account's own
last ~300 posts and tallying reply targets, then taking the top N. See
`countRepliesTo()` and the ranking block in `build()`.

## Decisions

- **Follow-graph intersection, not an interaction chart.** `BRIEF.md` for the
  sibling site `mutuals-combined` records that its requester explicitly
  rejected follows/followers ("no way is this gonna work with 100 follows...
  you gotta parse the full follow graph... use an interaction chart instead")
  in favor of a reply/quote tally sourced from the visitor's own feed. This
  request is different in kind: it explicitly asks for *mutuals* and *replies
  between every pair of them*, which an interaction chart (one account's own
  outbound reply/quote targets) cannot produce — it has no notion of a
  two-sided mutual relationship or of scanning multiple people's histories
  against each other. So this build kept the follow/follower approach that
  the other site abandoned, because here it's the only mechanism that
  actually answers the question asked, not a default reached for out of habit.
- **Capped, not exhaustive, and said so in the UI, not just here.** Follows
  and followers are paginated up to 300 each (3 pages) to find mutuals; the
  grid itself is capped to a visitor-chosen 4–20 mutuals (default 10) to keep
  the number of feed-scan requests bounded; each mutual's own feed is scanned
  up to 300 posts (3 pages) for replies. All three caps are stated in the
  on-page "how this is computed" details block, including that a hit cap
  means the mutual count shown is a lower bound. This mirrors the caveat
  pattern used throughout `want-pairwise`/`want-pairwise-2`/
  `mutuals-combined` — the honest move here is transparency, not silently
  pretending the numbers are exact.
- **No extra profile lookups for reply targets.** A reply's parent author DID
  is read straight out of the AT-URI (`at://<did>/...`) rather than making a
  second API call per reply to resolve authorship — since the only DIDs that
  matter are the mutuals already fetched, a plain map lookup answers "is this
  reply to one of them" with zero extra requests. This is the one thing that
  makes an N-mutual × 300-post scan tractable in a browser at all.
- **`mapPool` with concurrency 4 for the per-mutual scan**, not sequential —
  same pattern as `mutuals-combined` turn 2's candidate vectorization, for
  the same reason: up to 20 sequential paginated feed fetches would make the
  page feel hung for a long stretch with only a static message, so a live
  "(n/total)" counter plus concurrent fetches keeps it visibly moving.
- **Only direct-parent replies count**, not deep-thread replies further down
  a chain and not quote-posts or mentions. Simpler to reason about and to
  explain on-page ("replied directly to a post by the other mutual"), and
  matches the literal wording of the ask ("first reply... to every other
  mutual") better than a broader "any interaction" definition would.
- **No sign-in.** The grid is fully meaningful without it (public read-only
  data), so per the kit's own rule (sign-in only when the site is meaningless
  without it) this doesn't touch `/_kit/pds.js` at all. Nothing here needs
  saving to a repo — it's not a score or a document, it's a live query result
  that would go stale immediately.
- **kit amber, untouched.** norvid-studies.bsky.social's profile shows kit
  amber used unmodified across thirteen prior builds with no stated
  preference otherwise — kept as the safe default here too.

## Decisions (turn 2)

- **Ranked, not manually picked.** The turn-1 plan's item 1 proposed a
  checkbox/multi-select for the visitor to choose which mutuals go in the
  grid. The actual request superseded that with a concrete, specific
  selection rule — "the 100 'top' mutuals ie the ones the account responds
  to the most" — which is a fully automatic ranking, not a UI decision. Built
  that instead: no picker needed, since the rule is well-defined. If a future
  ask wants manual override *on top of* the ranking (e.g. pin/exclude one
  person), that's additive, not a replacement of this.
- **Ranking source is the searched account's own feed, not a follow-order
  proxy.** "Responds to the most" only has one honest reading — actual reply
  counts, tallied via `getAuthorFeed` the same way `scanReplies` already
  reads them — so `countRepliesTo()` reuses that exact parent-URI→DID
  extraction against a `dstSet` limited to the mutual pool, over the same
  `FEED_PAGES` (300-post) window already used elsewhere on this page, for
  consistency of "how deep does this page look" rather than introducing a
  second, different depth budget.
- **Ranking scan is skipped entirely when it can't matter** — only runs when
  `mutualsAll.length > cap`, so a visitor with fewer mutuals than the cap
  (the common case for most accounts) never pays for a sort that would be a
  no-op.
- **Ties sort last, in original `getFollows` order** (Array.sort is stable
  across the JS engines this page runs in) — a mutual never replied to in
  the 300-post ranking window isn't dropped, just pushed to the back, and
  the "how this is computed" panel says so plainly rather than implying the
  ranking is exhaustive.

## Decisions (turn 3 — bug report)

The requester reported, in-thread: (1) "doesn't populate the grid with any
replies" and (2) "these aren't my most-replied to mutuals." Two real,
independent bugs, both fixed this turn without live testing (still no
network in this sandbox — reasoned from the code, not observed):

- **Bug 2 (wrong "top" mutuals) had a findable root cause: the ranking scan
  only ran `if (mutualsAll.length > cap)`.** For any account with fewer
  mutuals than the slider — the common case, since the default is 50 — the
  grid silently fell back to whatever order `getFollows` happened to return,
  while the page still called it "top mutuals." Fixed by always running
  `countRepliesTo` and sorting `mutualsAll`, regardless of whether trimming
  is needed. This is the same 3-request scan either way; the only cost of
  "always" is doing it on the (common) runs where it isn't strictly required
  to decide inclusion — which is exactly the case it was wrongly skipping.
- **Bug 1 (no replies at all) did not have one single findable root cause
  in the code — the reply-detection logic (`record.reply.parent.uri`, the
  `at://<did>/` extraction) is standard AT Proto and was already checked
  against real lexicon knowledge last turn.** The strongest remaining
  candidate, given the request volume this page generates (up to 100
  mutuals × up to 3 pages each, at concurrency 4, immediately after a
  3-request ranking scan against the same account), is `public.api.bsky.app`
  rate-limiting a burst of concurrent requests — and every fetch failure in
  `scanReplies`/`countRepliesTo` was `catch (e) { break; }`: silent, no
  retry, no surfaced error. Under a rate-limit burst that reads exactly as
  reported — a grid that renders with every cell a dot, no explanation.
  Fixed three ways: (a) every AppView call in the scan paths now goes
  through `bskyRetry` — up to 3 attempts, exponential backoff (400ms/800ms)
  — before giving up on that page; (b) `POOL_SIZE` dropped 4→3 and
  `mapPool` now staggers each worker's first request by `150ms × index`
  instead of firing all of them in the same tick, to reduce the chance of
  triggering the limit at all; (c) if a scan or the ranking call still fails
  after retries, that's now tracked (`incomplete`/`scanFailures`) and shown
  as a visible warning above the grid ("Partial results: N of M mutuals'
  reply scans failed…") rather than presenting a degraded result as if it
  were complete and correct. **This is a mitigation, not a confirmed fix** —
  nobody has run it against a real high-mutual account to see the warning
  actually fire or actually stay silent. If the next report says the same
  two things again, the warning banner is the first thing to check: if it's
  showing up, the request volume is genuinely the problem and the fix is
  cutting `POOL_SIZE`/`FEED_PAGES` further or raising the retry budget; if
  it's silent and the grid is still empty, the bug is a field-shape mismatch
  this turn didn't find, and the fixture gap noted below is the place to
  start.

## The plan (next turn, in order)

1. **Raise or make configurable the per-mutual scan depth.** 300 posts is a
   guess at a reasonable browser-runtime cost; if reports come back that
   real first replies are being missed for very active accounts, the fix is
   letting the scan go deeper (more pages) for a smaller mutual cap, trading
   grid size for depth, rather than raising both caps at once and making
   every run slower.
2. **Partially addressed turn 3:** at cap=100 the grid still does up to 100
   pooled feed scans (300 posts each) plus the ranking scan — a lot of
   requests from one tab. `POOL_SIZE` is now 3 (was 4), workers stagger
   150ms apart, and each request retries with backoff before giving up —
   but there's still no adaptive backoff or "this is taking a while"
   time-based nudge. If the new partial-results warning starts firing
   regularly at high caps, that's the next thing to add, plus consider
   lowering `POOL_SIZE` further or widening the retry budget past 3 tries.
3. **A "both directions in one cell" compact mode.** The current grid shows
   A→B and B→A as two separate cells (upper and lower triangle), which is
   correct but means half the grid is "the same pair, other direction." A
   toggle to collapse each unordered pair into one cell (showing whichever
   reply came first, with a small arrow indicating direction) would roughly
   halve the visual size of the grid for the same data — worth doing if a
   large-N grid turns out to be hard to read.

## Gotchas

- **`getFollows`/`getFollowers` response shape was inferred, not fixture-
  verified.** Only `lab/_kit/fixtures/getFollowers.json` exists, and that
  fixture's `followers` array is empty — it confirms the top-level shape
  (`{ followers: [...], subject: {...} }`) and that entries carry `did`,
  `handle`, `avatar`, `labels` (same shape as `subject`), but not a single
  real populated entry. `getFollows` is assumed to mirror it exactly
  (`{ follows: [...], subject: {...} }`) since both are standard AT Proto
  actor-list endpoints on the same lexicon family — plausible, not
  confirmed against a captured response. If a real run comes back with an
  empty grid despite a visitor definitely having mutuals, check this first.
- **`getAuthorFeed.json`'s one example item is a repost**, not a reply —
  useful for confirming the repost-skip branch (`item.reason` present →
  skip) but it means the `record.reply.parent.uri` field path was written
  from AT Proto lexicon knowledge, not verified against a captured reply
  item in this repo's fixtures.
- **Untested in a browser** — this build has no Bash/WebFetch/network. The
  harness's post-build screenshot pass will show the empty-state page (no
  handle typed yet); the actual scan/grid logic can only be exercised by a
  real visitor typing a real handle with real mutuals, which is the one
  thing this sandbox cannot simulate. If the screenshot shows a blank page
  with no form at all, that's a real bug — the form should always render
  regardless of network.
- Filter value passed to `getAuthorFeed` is `'posts_with_replies'` — chosen
  explicitly rather than relying on the endpoint's default, since the two
  documented alternatives (`posts_no_replies`, `posts_with_media`) would
  silently drop exactly the posts this page exists to find.
- **`countRepliesTo` (turn 2) reuses `scanReplies`'s exact field-path
  assumptions** (`item.reason`, `record.reply.parent.uri`, the `at://<did>/`
  regex) rather than duplicating and re-guessing them, so it inherits the
  same "not fixture-verified against a real reply" caveat above — same risk,
  same fix if it's wrong.
- **`FOLLOW_PAGES = 3` (300 follows / 300 followers) is unchanged** even
  though the cap now goes to 100. For an account with 100+ mutuals this is
  probably still fine — 300 follows and 300 followers is a lot of room for
  100 mutuals to hide in — but it hasn't been checked against a real
  high-follow account. If a visitor with clearly >100 real mutuals gets a
  grid capped by "found fewer mutuals than expected" rather than by the
  slider, raising `FOLLOW_PAGES` is the fix, not the ranking logic.
- **Screenshot check (turn 2):** the empty-state page at 1200x800 renders correctly under the production CSP — heading, description, handle input, the "Top mutuals to include (by reply frequency)" slider (labeled, thumb at its default of 50, track visible against the dark background), the caveat line, and the "build the grid" button all readable and properly laid out, nothing overlapping or off-screen. No changes made.
- **Screenshot check (turn 3):** same empty-state view, same clean render — no visible regressions from the retry/backoff/warning-banner changes above. Still can't see the post-submission grid or the new partial-results warning from a static screenshot of the unsubmitted form, so the two reported bugs (no replies populating, wrong "top" mutuals) couldn't be visually confirmed fixed here — only reasoned about in code, per the section above. No changes made this pass.
- There is **no separate "site was built for buildoff" acknowledgment** on
  the page and none was added — a competing build (`mootrace.bisks.net`,
  reading full repos rather than a paginated feed sample) appeared in the
  same thread as this request. That's a different technical approach
  (whole-repo scan vs. bounded feed pagination) and out of scope for what
  was actually asked here; not chased or referenced on-page since the
  request was specifically "expand it to 100 with top-mutual ranking," not
  "match the other build."
