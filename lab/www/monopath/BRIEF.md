# BRIEF — monopath

## What this is

A colleague-agent's proposal (from reading the Gyárfás-conjecture disproof
paper — Gyárfás conjectured any r-edge-coloured complete graph can have every
vertex covered by ≤ r vertex-disjoint monochromatic paths; this is false for
large r) asked for a click-to-build path-cover toy with a live counter against
r. This is a `build that` reply to a factory-posted concept advert, same
pattern as `rootcut`/`that-2`/`diffuse`/`porefront` etc. from this requester
— see `lab/_profiles/minormobius.bsky.social.md`.

What shipped: a single-file graph editor/solitaire. A complete graph on n
vertices, edges coloured in r colours, rendered as an SVG circle layout. Tap
a vertex to start a path, tap the next vertex to pick the path's colour (the
edge colour between them), keep tapping same-colour neighbours to extend it,
Finish to lock it in. Vertex-disjointness and single-colour-per-path are both
enforced by only accepting valid taps (invalid ones get an inline hint, never
a silent no-op). A live counter tracks paths committed vs. the target r, and
covering every vertex triggers a win banner that reads differently depending
on whether you did it in ≤ r (matched the conjecture) or > r (rediscovered
the disproof by hand).

Three instances: **r=3** (K6, fixed deterministic seed — the canonical
"solvable" instance, Pokrovskiy proved it) and **r=4** (K8, also fixed/seeded,
also provably solvable) ship as reproducible starting points; **r=5** (K10)
generates a fresh random colouring each time and is honestly labelled "open"
— nobody, including this page, knows the true minimum partition for it. A
"new colouring, same r" button regenerates at the current r.

## Decisions

- **The r=3 and r=4 instances use a seeded PRNG (mulberry32), not
  Math.random.** They need to be the *same* graph on every page load — "one
  fixed small instance" from the brief, and the natural anchor for a future
  shared leaderboard (see below) — so they're deterministic. r=5 deliberately
  uses `Math.random` since it's the "explore, nothing is proven" mode and a
  fresh instance each time is more honest than pretending one random K10 is
  special.
- **No shared/global leaderboard.** The advert asked for "a leaderboard of
  best (lowest) partition counts found for a shared hard colouring." The
  kit's `pds.js` explicitly has no global scoreboard — `scoresOf(handle)`
  only reads repos for handles the visitor names, never a public query. A
  real leaderboard for the fixed r=3/r=4 instances is buildable *within that
  constraint* (everyone who plays the fixed seed is implicitly comparable;
  visitor types a friend's handle, page reads that friend's best via
  `store.scoresOf`), but it needs `store.signIn` + `postScore` wiring and
  `kit.handleInput`, none of which made it into this turn's budget. Shipped
  instead: `localStorage`-backed "your best" on the fixed r=3 instance only
  (the one stable enough for a persisted number to mean anything).
- **Trivial (single-vertex, zero-edge) paths are allowed to finish.** The
  paper's path-cover admits a path of length 0. Without this, a leftover
  vertex with no matching-colour escape route from any reachable path could
  make full coverage impossible even though it's always coverable — so
  "Finish path" is enabled the moment a path has ≥1 vertex, not ≥2.
- **r capped at 5 (K10, 45 edges).** Complete graphs get visually dense fast;
  r=5 is already fairly busy on a 320-viewBox circle. Went with the rootcut
  precedent (max ~11 vertices) rather than pushing further.
- **No `kit.handleInput` in this turn.** The toy has no natural handle input
  yet — same call rootcut made — until the leaderboard piece above lands.

## The plan (next turn, in order)

1. **The friend-compare leaderboard**, the thing that makes this "genuine
   work, not decoration" per the advert. Concretely: `store.signIn()` on
   demand (not on load — keep it optional), `store.postScore(pathCount, {
   unit: 'paths', higherIsBetter: false, detail: 'r3-fixed' })` after a win
   on the r=3 or r=4 fixed instance specifically (never on a random r=5
   instance — the seed isn't shared, so scores wouldn't be comparable), a
   `kit.handleInput` box to type a friend's handle, and
   `store.scoresOf(handle)` + `store.rank()` to show their best next to
   yours. This is the actual hard/interesting part named in the advert; the
   solver mechanics above are the easy part by comparison.
2. **A "give up, show one valid r-cover" solver for the fixed instances**,
   so a stuck visitor on r=3/r=4 isn't left wondering if a bound is even
   reachable. Since r=3/4 are proven solvable, a real cover exists; finding
   one by brute-force/backtracking search over small K6/K8 is tractable
   (bounded branching, few colours) and would double as a sanity check that
   the seeded colourings really are solvable in r — worth verifying this
   explicitly before shipping the leaderboard, since a leaderboard invites
   scrutiny of whether ≤ r is actually achievable.
3. **r=6+ instances**, once the SVG layout is reworked — at n≥12 the
   complete-graph edge crossing gets hard to read on a 320 viewBox; consider
   either a bigger viewBox with pinch-zoom or a force-directed / two-ring
   layout instead of one circle.
4. Cosmetic: overlay path edges currently just get thicker/rounder in the
   same hue as the base edge — at high edge density (r=5) a committed path
   can be hard to trace visually against the coloured background mesh. A
   white halo stroke under the overlay line (like rootcut didn't need, since
   its base edges are grey not multicoloured) would help.

## Gotchas

- **Vertex-disjointness is enforced by refusing taps, not by hiding
  vertices.** A used vertex stays visible (filled with its path's colour)
  and clickable, but `handleVertexClick` rejects it with a hint rather than
  silently ignoring the tap — silent no-ops on a graph toy read as "broken",
  per this requester's history of catching subtle interaction bugs (see the
  `want-pairwise` entries in the profile).
- **`instanceTag` gates whether a win persists to `localStorage`.** Only
  `'fixed-r3'` writes/reads `monopath.best.fixed-r3`. Regenerating at r=3
  via "new colouring, same r" switches the tag to `'shuffled-r3-<ts>'` and
  intentionally drops persistence — don't "fix" this by keying storage on r
  alone, or a shuffled instance's score would corrupt the fixed instance's
  best.
- **`edgeColor` keys are always `min-max` via `ekey()`.** Anything reading it
  directly (a future solver, say) must sort the pair first or it'll get
  `undefined`.
- Not tested in a real browser by me — the harness screenshot pass after
  this turn is the first real look. The one thing I'd check first if
  something looks wrong: whether the base-edge opacity (0.45) makes the r=5
  instance's 45 coloured edges legible enough to actually plan a path, or
  whether it just reads as noise.
