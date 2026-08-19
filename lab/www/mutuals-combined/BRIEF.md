# one-hand — handoff

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

Shipped: type your handle → resolve it → read your mutuals (people you follow
who follow you back, first ~100 of each direction) → build a simple
bag-of-words vector for you and for each mutual from their recent original
posts → solve **real non-negative least squares** (`min ‖v − Σwᵢuᵢ‖², wᵢ≥0`)
for the best non-negative combination of your mutuals that reconstructs your
vector → render as a donut chart (raster image, primary, with a copy-image
button) plus an equation-style readout and a per-mutual contributor list.
Two independent honesty checks are shown, not one: cosine similarity of the
reconstruction, and its L2 residual.

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
- **Mutual cap of 8, one page (~100) of follows/followers.** Kept the turn
  shippable — fetching and vectorizing more accounts is a straightforward
  extension, not a design problem, so it's the first thing named below.

## The plan (next turn, in order)

1. **Paginate follows/followers with the cursor** instead of reading only the
   first ~100 of each. High-follower accounts will silently undercount
   mutuals right now. Also consider raising the mutual cap above 8 once
   pagination exists — more mutuals genuinely improves the fit, it isn't just
   more UI.
2. **TF-IDF instead of raw relative frequency.** Right now every word counts
   the same; down-weighting words common across *all* the fetched accounts
   (the water-cooler vocabulary) and up-weighting words distinctive to one
   mutual would sharpen the combination meaningfully. The Gram-matrix/NNLS
   plumbing doesn't change — only how `buildVector` weights each token.
3. **Swap the simplified active-set for real Lawson–Hanson** if mutual counts
   ever grow past ~15-20 — the current "drop worst, re-solve" approach can in
   principle fail to re-admit a variable that becomes attractive again after
   another is dropped; true Lawson–Hanson handles that. Not a problem at n≤8,
   worth flagging before scaling up.
4. Optional: let a signed-in visitor save a run via `/_kit/pds.js` and
   revisit how their blend shifts over time. Not attempted — sign-in should
   stay optional here since the page is fully meaningful without it, per the
   kit's own rule.

## Gotchas

- **`app.bsky.graph.getFollows` has no fixture in `lab/_kit/fixtures/` —
  only `getFollowers.json` exists, and its `followers` array is empty in the
  capture, so there's no captured example of an individual follower/follows
  profile object either.** The code assumes the response shape is
  `{ subject, cursor, follows: ProfileView[] }` (standard AT Protocol lexicon,
  mirroring `getFollowers`'s `followers` field) and that each `ProfileView`
  has `did`/`handle`/`displayName`/`avatar`, matching the `author` shape
  already captured inside `getAuthorFeed.json`. This is unverified against a
  real capture — if the smoke test comes back with "no mutuals found" for a
  handle that plainly has mutuals, check this field name first before
  anything else.
- `ownTexts()` only counts posts where `post.author.did` matches the account
  being vectorized, which drops reposts (their `post.author` is the original
  poster) and keeps quote-post captions (the account's own `record.text`).
  Reply *parents* embedded in `item.reply` are never read as text — only the
  account's own `post.record.text` per feed item — so replies-heavy accounts
  are represented by their reply text only, which is correct but worth
  knowing if a vector looks thin for a very reply-heavy account.
