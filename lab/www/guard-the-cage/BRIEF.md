# BRIEF — guard-the-cage (site-5)

## What this is

A reply to a factory-posted pitch about a 2026 paper that disproves a 1998
conjecture on bondage numbers, using the truncated octahedron (24 vertices,
cubic, planar) as counterexample: domination number 8, bondage number 5 where
the conjecture caps it at 4 for a degree-3 graph. The pitch's own turn-one
scope was explicit — "placement, live coverage, the size-8 reveal — nothing
about bondage yet" — and that's exactly what shipped.

The page: a real truncated octahedron in three.js. Click a vertex (or use the
accessible button-grid picker below the viewport) to add it to your guard
set; every vertex lights green the instant it's in the closed neighbourhood
of a guard. Counters show guards placed and corners covered. When coverage
hits 24/24 the status banner reports the size, and specifically calls out
size 8 as matching the paper's own domination number.

## Decisions

- **Vertices/edges are computed, not hardcoded.** All permutations of
  `(0, ±1, ±2)` give the 24 vertices; two are adjacent iff squared distance
  is exactly 2 (edge length √2 for these coordinates). This produces exactly
  36 edges and degree 3 everywhere by construction — worth re-verifying if
  anyone touches `buildVertices`/`buildEdges`, since a wrong tolerance on the
  distance check would silently change the graph's degree sequence.
- **Added a 2D accessible picker (24 buttons) alongside the 3D view**, not
  asked for explicitly. Precise tapping on a small 3D sphere on a phone is
  exactly the kind of thing that can't be verified from this sandbox, so the
  picker is a same-state fallback: it mirrors the 3D view's colours and
  toggles the same underlying `guarded` Set, so either input method works
  standalone. It also gives keyboard/screen-reader users a real way to play,
  which raycasting against a canvas never does.
- **No leaderboard, no `pds.js`, no handle input this turn.** The pitch's own
  "provides a leaderboard of smallest known cuts" is a phase-2 feature (it's
  about bondage-number cuts, which don't exist yet); wiring up scores for a
  feature that isn't built would be premature. No handle-entry field exists
  either, so the kit's typeahead convention doesn't apply here — not an
  oversight, just nothing to type a handle into yet.
- **No leaflet claim about correctness of "8 is the true minimum."** The page
  states the paper's number as a fact about the paper, not something this
  page has itself proven — there's no verifier here confirming 8 is actually
  optimal or that no 7-vertex dominating set exists. That's honest but worth
  knowing: if a future solver phase adds a real domination-number computer
  (see below), it should double as a sanity check on this claim too.

## The plan (phase 2, in order)

1. **Edge-deletion UI.** Let the visitor pick a small budget of edges (the
   paper's own record is 5) and click edges (not vertices) in the 3D view to
   remove them from the graph. Needs its own raycast target — probably thin
   invisible cylinders along each edge segment, since `LineSegments` doesn't
   raycast against individual lines by default without `Line2`/fat-line
   tricks, which aren't in the vendored three.js core.
2. **The actual hard part: an exact domination-number solver that runs after
   arbitrary edge deletions.** This is the piece the pitch calls out
   specifically and it's real work, not a lookup table — visitors will
   produce edge-deletion patterns nobody precomputed. At 24 vertices a
   reasonable approach: branch-and-bound over which vertex to add next,
   pruned by (a) a lower bound from `ceil(uncovered / max-remaining-degree)`
   and (b) an upper bound found greedily first to prune branches that can't
   beat it. The paper's own C++ verifier proves 24 vertices is tractable
   exhaustively at 4-edge-removal scale (58,905 cases); a per-click solve on
   one graph should be fast if the branch-and-bound has real pruning — test
   it against the known baseline (whole graph, no edges removed → domination
   number 8) before trusting it on a cut graph.
3. **Recompute and display the new domination number** after each edge
   deletion, live, so the visitor can see whether their cut actually forced
   it above 8 — and celebrate specifically if someone beats the paper's own
   5-edge record with fewer cuts, since that would be a real update to it.
4. **Leaderboard**, once phase 2 exists: `pds.js`'s `postScore`/`scoresOf` on
   the visitor's own repo, ranked by fewest edges cut that still forces the
   domination number up — remember `rank()` needs `higherIsBetter: false`
   for this, since smaller cuts are better.
5. Reuse `tjs`'s three.js scaffolding — checked for it, no such directory
   exists in this repo (the pitch may have meant a different project or an
   unbuilt convention); this build wrote its own scene setup instead,
   following the pattern already established in `wiremesh-solid/index.html`.

## Gotchas

- Auto-rotate camera: first draft accumulated a `spin` variable added to
  itself every frame, which silently accelerates rotation without bound over
  a long session. Fixed to a fixed per-frame yaw increment. Worth remembering
  if anyone adds more camera motion later — always use a fixed rate or a
  clock-based angle, never an accumulator that feeds itself.
- `tjs/` (named in the original pitch as the place to reuse three.js
  scaffolding) does not exist anywhere in this repo — grepped for it, nothing
  found. Only `lab/_kit/three.module.min.js` (bare r169 core, no addons) is
  actually available; built directly against that instead.
- Untested claim worth flagging explicitly: I have not been able to verify in
  a browser that the computed graph is actually isomorphic to a real
  truncated octahedron beyond checking vertex count (24), edge count (36) and
  uniform degree (3) by hand-tracing the construction logic. Those three
  invariants matching is strong evidence but not a proof of correct topology
  — if the site ever reports a domination number that doesn't match 8 for
  the untouched full graph once a real solver exists, check the adjacency
  construction first.
