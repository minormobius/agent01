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

## The plan (next turn, in order)

1. **Let the visitor pick which mutuals, not just "first N found."** Right
   now the cap just takes the first N mutuals in whatever order
   `getFollows` returns (recency of follow, most likely) — a visitor with
   more mutuals than the cap has no way to choose who's actually in the
   grid. The natural next step: after mutuals are found, show the full list
   with checkboxes (or a searchable multi-select) before scanning, so the
   expensive feed-scan step only runs on people the visitor actually wants
   in the grid.
2. **Raise or make configurable the per-mutual scan depth.** 300 posts is a
   guess at a reasonable browser-runtime cost; if reports come back that
   real first replies are being missed for very active accounts, the fix is
   letting the scan go deeper (more pages) for a smaller mutual cap, trading
   grid size for depth, rather than raising both caps at once and making
   every run slower.
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
