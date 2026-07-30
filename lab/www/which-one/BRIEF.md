# BRIEF — which-one

## What this is

The request was `@buildthis.bisks.net which one of you is better?`, and it was
the root of its own thread — no parent post, no other replies riffing on it.
So there was no second party named anywhere in the fetched context for "which
one" to mean. Rather than guess at who the requester had in mind, I built the
mechanic the question implies and left the subject open: type any two Bluesky
handles, and the page runs a head-to-head on four public profile stats
(followers, posts, follower-per-follow ratio, days on Bluesky), tallies wins,
and declares one "ahead" (or a tie). It ships as a single working page —
nothing is stubbed out.

## Decisions

- **Left the subject open rather than guessing a target.** The alternative —
  hardcoding two handles from a guess about who "you two" means — risked
  naming someone who never asked to be compared, which is closer to the
  undisclosed-impersonation/target-list territory the task explicitly warns
  off. An open duel answers the literal question ("which one is better?") as
  a reusable mechanic instead.
- **Four categories, straight majority, tie-break is just "tie."** I didn't
  weight categories or invent a composite score — that would read as more
  scientific than four public numbers actually are. The copy says outright
  that this isn't science.
- **No `store.save`/`postScore` (pds.js) wired up.** A duel result isn't
  something worth persisting to either visitor's repo — it's a one-off
  comparison, not a score. Didn't add sign-in for the same reason: the page
  is fully useful with zero auth, and the OAuth flow would only add friction
  for no benefit here (see "sign-in is optional" in the kit README).
- **`getProfile` directly, no separate `resolveHandle` call.** `getProfile`'s
  `actor` param accepts a handle directly per the fixture shapes, so one
  round trip per side is enough; `resolveHandle` would just be a second hop
  to the same place.

## The plan (not built yet)

1. **If the requester names two actual people in a reply, hardcode a "featured
   duel" default** so the linked page loads pre-filled instead of empty —
   currently every visitor has to type both handles themselves every time.
2. **Consider `store.save`** if the requester asks to keep a running rivalry
   between two specific accounts over time — right now every load is
   stateless and forgets the last duel on refresh.
3. **More categories were considered and cut for time**, not because they're
   bad ideas: "most active recently" (via `getAuthorFeed` post timestamps) or
   "most followed by people you follow" (needs a visitor-named third party via
   `getFollows`, so it'd have to stay opt-in). Either is a clean addition to
   `buildCategories()`.

## Gotchas

- `getProfile` has no captured *error* fixture (only `resolveHandle.error.json`
  exists) — I don't know the exact error shape it returns for a bad handle, so
  the catch path shows a generic "could not settle it: HTTP 400"-style message
  via `kit.fetchJson`'s thrown `Error`, not a parsed API message. If the real
  error body turns out to have a friendlier `message` field, it'd be worth
  reading `e.status` and fetching the JSON body for that instead of just the
  HTTP status.
- Ratio category divides by `followsCount`, which is legitimately `0` for some
  accounts (follows nobody) — handled as `Infinity` (displayed as `∞`), not a
  crash, but worth knowing if you touch that function.
