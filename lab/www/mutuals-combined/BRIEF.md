# one-hand — handoff

## Turn 2 (2026-08-19): swapped the follow-graph for a real interaction chart

The requester's follow-up: "no way is this gonna work with 100 follows. you
gotta parse the full follow graph. youd be better suited to use an
interaction chart, say your top 100 most interacted with accounts (that
might not fill up, that's ok)." Read as a recommendation to replace the
mechanism, not add to it — so the follow/follower intersection is gone
entirely, replaced with:

1. Page the visitor's own `getAuthorFeed` with the cursor — up to 10 pages
   (~1000 posts), not the old single page of 100 — to get real depth on
   their own post history.
2. Walk every one of the visitor's own feed items (reposts of others
   excluded) and tally who they replied to (`item.reply.parent.author`) and
   who they quoted (`post.embed` of type `#view` or `recordWithMedia#view`,
   reading `.record.author`). That tally, sorted descending, **is** the
   interaction chart.
3. Take the top `MUTUAL_CAP = 100` of it as candidates — deliberately not
   forced to fill; a small account with 12 real interaction partners gets
   12, per "that might not fill up, that's ok" being explicit in the ask.
4. Vectorize up to 100 candidates in parallel (`mapPool`, concurrency 8) so
   a full pool doesn't mean 100 sequential round trips.
5. Everything downstream (BOW vectors, Gram matrix, NNLS, donut, two-metric
   honesty check) is untouched — this was a data-source swap, not a math
   rewrite. `getFollows`/`getFollowers` calls are gone from the page
   entirely.

The old "up to 8 mutuals, first page of follows/followers" framing is gone
from the copy too — `<title>`, meta tags, h1, sub, and the "how this is
computed" details block were all rewritten around "interaction chart"
language, since the underlying mechanism actually changed, not just a
number. Contributor entries now also show a raw interaction count
alongside their % share, since "who you actually interact with" is now the
literal claim being made and a contributor list without the count backing
it up doesn't earn that framing.

Also fixed as an accuracy improvement, not a re-scope: the visitor's own
vector now builds from every page read (up to ~1000 posts) instead of one
page of 100, since the pagination work to get there was already being done
for the interaction tally.

Didn't touch: the NNLS solver itself, the donut rendering, the copy-image
flow, the two-metric honesty check. None of that was what broke.

## What this is

From a Bluesky thread riffing on style-imitation tools ("what tweet most like
this user's tweets was written by someone not this user"), where one reply
flagged that a "who does this sound like" framing is one step from a target
list / doxxing tool (an actual guide "entirely sourced on imitating one
specific thread" had already doxxed someone in the thread). The requester's
own ask picked the *other* framing explicitly: "your embeddings distribution
looks like the following linear combination of your mufos" as the feelsgood,
worth-building version, self-rated as "beyond the buildabots" — i.e. go
attempt it for real, don't fake it.

Turn 1 shipped: type your handle → resolve it → read your mutuals (people you
follow who follow you back, first ~100 of each direction) → build a simple
bag-of-words vector for you and for each mutual from their recent original
posts → solve **real non-negative least squares** (`min ‖v − Σwᵢuᵢ‖², wᵢ≥0`)
for the best non-negative combination of your mutuals that reconstructs your
vector → render as a donut chart (raster image, primary, with a copy-image
button) plus an equation-style readout and a per-mutual contributor list.
Two independent honesty checks are shown, not one: cosine similarity of the
reconstruction, and its L2 residual.

**As of turn 2 the "read your mutuals" step is gone** — see the note at the
top of this file. Candidates now come from an interaction chart (who you
reply to and quote in your own paginated post history), everything from the
bag-of-words vector onward is unchanged.

## Decisions

- **Blend, not a single match, on purpose.** This is the actual design
  response to the thread's own doxxing complaint: showing "you ≈ 40% A + 30%
  B + …" spreads credit across a circle; a "closest single match" tool is the
  shape of thing that gets misused to single someone out. Didn't build the
  single-match version at all, even as an option.
- **Real embeddings API isn't reachable** (no key, no network at build time,
  and the CSP only allows `public.api.bsky.app`/`plc.directory` at runtime
  anyway) — used bag-of-words relative-frequency vectors, L2-normalized, as
  an honest stand-in. Said so plainly in the "how this is computed" details
  block rather than calling it an embedding without qualification.
- **NNLS via simplified active-set** (solve unconstrained → drop the worst
  negative coefficient → re-solve → repeat), not the full Lawson–Hanson
  algorithm. Exact for the small n here (≤8 mutuals), and said so on-page.
  Chose this over a black-box "just clip negative weights to zero" fake
  because the profile history (`that-2`/Sixfold) shows this requester pushes
  back hard on solvers that look plausible but aren't actually solving
  anything — this one really does minimize the objective.
- **Two fit metrics, not one** (cosine similarity + L2 residual), per the
  Sixfold-turn-3 lesson on this requester: a single convergence-looking
  number can be near-perfect while the underlying result is still wrong, so
  don't ship just one.
- **Donut chart as a flat raster `<img>`, copy-image button, big/glowing**,
  per the standing profile preferences from `want-pairwise`'s iteration
  history (long-press-to-copy needs one real image, not live DOM/SVG; the
  copy action should look like a highlighted primary action).
- ~~Mutual cap of 8, one page (~100) of follows/followers.~~ **Superseded in
  turn 2** — see the note at the top of this file. The follow-graph approach
  is gone; candidates now come from an interaction chart with a cap of 100.
- **Turn 2: interaction chart (reply + quote targets from your own feed),
  not follow-graph mutuals.** The requester named the mechanism directly
  ("interaction chart... top 100 most interacted with accounts"). Kept the
  *vector-building* single-page-per-candidate, deliberately: paginating your
  own feed 10 deep is one account's worth of extra calls, but paginating 100
  candidates' feeds 10 deep each would be up to 1000 calls in one page load.
  Said so plainly in the details block rather than silently understating
  what "recent posts" covers for a candidate vs. for you.
- **Candidate vectorization runs through a concurrency-limited pool
  (`mapPool`, 8 at a time), not sequentially.** With up to 100 candidates,
  sequential fetches would make "combine" feel hung for a long stretch with
  no feedback beyond one status line; the pool plus a live "(n/total)"
  status line keeps it visibly moving.

## The plan (next turn, in order)

1. **TF-IDF instead of raw relative frequency.** Right now every word counts
   the same; down-weighting words common across *all* the fetched accounts
   (the water-cooler vocabulary) and up-weighting words distinctive to one
   partner would sharpen the combination meaningfully. The Gram-matrix/NNLS
   plumbing doesn't change — only how `buildVector` weights each token.
2. **Swap the simplified active-set for real Lawson–Hanson.** This is more
   pressing now than it was at n≤8: the interaction-chart cap is 100, and a
   very online account replying to dozens of distinct people is a realistic
   case now, not a hypothetical. The current "drop worst, re-solve" approach
   can in principle fail to re-admit a variable that becomes attractive again
   after another is dropped; true Lawson–Hanson handles that.
3. **Consider paginating each candidate's own feed too, not just the
   visitor's.** Turn 2 kept candidate vectors to one page (~100 posts) for
   call-count reasons (see Decisions) — if that turns out to make weak
   vectors for otherwise-strong interaction partners, look at paginating the
   top N by weight only (e.g. re-fetch a deeper history just for whoever
   NNLS actually assigns positive weight to, after the first solve) rather
   than deepening all 100 up front.
4. Optional: let a signed-in visitor save a run via `/_kit/pds.js` and
   revisit how their blend shifts over time. Not attempted — sign-in should
   stay optional here since the page is fully meaningful without it, per the
   kit's own rule.

## Gotchas

- **The interaction tally trusts `item.reply.parent.author` and
  `post.embed.record.author`/`post.embed.record.record.author` to be
  present and shaped like the `author` object in `getAuthorFeed.json`'s
  fixture (`did`/`handle`/`displayName`/`avatar`) — verified against that
  one fixture's quote-post example, not against a real reply.** A reply
  whose parent is a `notFoundPost` or `blockedPost` has no `.author` at all;
  `bump()` guards on `actor && actor.did`, so those are silently skipped
  rather than throwing, but that also means a heavily-moderated timeline
  will undercount without any visible sign of it.
- `ownTexts()` only counts posts where `post.author.did` matches the account
  being vectorized, which drops reposts (their `post.author` is the original
  poster) and keeps quote-post captions (the account's own `record.text`).
  Reply *parents* embedded in `item.reply` are never read as text — only the
  account's own `post.record.text` per feed item — so replies-heavy accounts
  are represented by their reply text only, which is correct but worth
  knowing if a vector looks thin for a very reply-heavy account.
