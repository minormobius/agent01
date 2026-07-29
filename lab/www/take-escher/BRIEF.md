# BRIEF — take-escher / "Shoal"

## What this is

Requester wanted Escher's *Circle Limit III* turned into an interactive
Poincaré-disk explorer: pick a row of fish, translate/"swim" them in the
direction of their nose, and have the rest of the tiling follow so it still
tiles. Turn 1 shipped independent geodesic lines (didn't interlock). Turn 2
rebuilt it as an actual hyperbolic {p,q} reflection tiling, panned as one
rigid Möbius isometry, so tiles stay edge-locked by construction. Turn 3 put
fish silhouettes on every tile (barycentric warp from the canonical polygon).
Turn 4 made panning genuinely infinite by rebuilding the generated patch
whenever its root drifted too far from screen centre.

Turn 5 (this one) was the requester's reaction to turn 4: **"Currently the
patch doesn't extend out so eg you scroll far enough over and just get
patches of one rebuilt. Secondly it's not smooth. It's gotta be smooth, no
jerky jerky. You might be better served by building a buffer, and retiring
tiles exceeding threshold."** Turn 4's fix was structurally right (infinite
panning needs the generation to be re-rooted periodically — see the old
BRIEF text in git history for why) but mechanically the wrong shape: it
generated a fresh 140-face patch in one synchronous burst and threw the old
array away completely, so every recentre was a visible pop — a chunk of the
screen suddenly swapped to a differently-shaped patch in one frame. That's
exactly "patches of one rebuilt."

This turn replaced the whole-array snap with a persistent, continuously
maintained tile buffer, doing exactly what the requester suggested:

- **`faceMap`** (a `Map` keyed by tile centroid) holds every tile currently
  alive, and never gets discarded wholesale. **`frontier`** holds the subset
  of those tiles that still have unexplored neighbours.
- **`growBuffer(p)`** expands up to `GROW_BUDGET` (8) frontier tiles per
  call, but only ones whose *current screen position* (`mApply(g, ...)`) is
  still within `BUFFER_MOD` (0.90) of the disk's centre — so it only ever
  does the work that's actually about to matter, a few tiles at a time.
- **`retireBuffer()`** deletes any live tile whose screen position has
  drifted out past `RETIRE_MOD` (0.96), freeing budget for whatever's
  growing in on the side you're swimming toward. The gap between
  `BUFFER_MOD` and `RETIRE_MOD` is deliberate hysteresis — a tile isn't
  retired and then immediately regrown next call.
- **`maybeRecenter()`** still exists (the underlying maths still needs a
  fresh local root periodically — see Gotchas), but no longer discards
  anything. It drops in one small seed patch (`MERGE_SEED_CAP` = 40, versus
  turn 4's 140) and *merges* it: `if (!faceMap.has(f.key)) faceMap.set(...)`
  only adds tiles that are genuinely new, so every tile already on screen
  stays exactly as it was. The seed just hands `growBuffer` fresh frontier
  to keep extending from.
- All three are called together as `updateBuffer()`, wired into every
  pointermove during a drag *and* every animation frame of a swim (previously
  the recentre check only ran once, at the end of the swim tween) — so
  growth is spread across many cheap calls instead of one expensive one, and
  a swim never has a mid-animation stall waiting on a synchronous rebuild.

This is a straightforward "sliding window over an unbounded structure"
change, not a new algorithm — `seedPatch` (renamed from `buildTiling`) is
the exact same edge-reflection BFS as turn 4, just now returning its
leftover queue as `frontier` instead of discarding it, so the same BFS can
resume later instead of restarting from scratch each time.

## Decisions

- **Buffer + retire instead of rebuild-on-threshold** — the requester's own
  words, taken literally, because the analysis above showed it was the
  right shape: a persistent `Map` plus incremental grow/retire, not a bigger
  or more frequent version of turn 4's full-array swap.
- **`BUFFER_MOD` / `RETIRE_MOD` are separate thresholds (0.90 / 0.96), not
  one.** Using a single cutoff for "grow" and "retire" would flap — a tile
  right at the boundary would be retired one call and regrown the next,
  forever. The gap between them is deliberate hysteresis.
- **`growBuffer` is budgeted (`GROW_BUDGET` = 8 tiles/call), not run to
  completion.** It's called on every pointermove and every animation frame,
  so it doesn't need to finish the whole buffer in one call — it only needs
  to make steady progress, and a small fixed budget per call is what turns
  a potential synchronous hitch into work spread invisibly across frames.
  `resize()` is the one place that *does* run it to near-completion (a loop
  of 15 calls), because a resize is rare enough to afford it and can reveal
  a lot more disk at once than incremental growth would fill in time.
- **`maybeRecenter` still exists and is still necessary** — this is not a
  redesign of turn 4's core insight, just its delivery. Panning far in one
  direction still needs the underlying BFS re-rooted periodically, because
  tiles far (in hyperbolic distance) from a fixed root are inherently close
  to the disk's Euclidean rim, which is where `seedPatch`'s numerical safety
  cull (`absSq(cen) > 0.995²`) starts discarding real tiles. What changed is
  that recentring now *merges* a small seed into the live buffer instead of
  replacing it, so it no longer reads as a rebuild.
- **`seedPatch`'s local `Set`-based dedup (`localSeen`) is separate from
  `faceMap`.** Each seed patch is generated independently and only checks
  itself for duplicates during BFS; the caller (`seedTiling` / merge in
  `maybeRecenter`) is what checks against `faceMap` before adding. Keeping
  those separate meant `seedPatch` didn't need to change its BFS logic at
  all from turn 4 — only what it returns.
- **Kept `reflectAcross`, `mInverse`, `mTranslateTo` untouched** — turn 4's
  algebra there was already verified and is orthogonal to this turn's
  problem (which was about *when* and *how much* to rebuild, not about the
  geometry itself).

## The plan (next agent, in order)

1. **Verify the fix actually reads as smooth — this turn had no browser.**
   The theory (incremental growth spread across frames, merge instead of
   replace) is sound, but the concrete feel of `GROW_BUDGET`/`BUFFER_MOD`/
   `RETIRE_MOD` was picked by reasoning, not measurement. If dragging fast
   outruns the buffer (frontier not expanded before it's needed, i.e. blank
   wedges appear at the leading edge), raise `GROW_BUDGET` or `BUFFER_MOD`
   first, in that order — both are cheap knobs, no restructuring needed.
2. **Same asymptotic limit as before, still not addressed:** `rootOrig`'s
   Euclidean modulus still creeps toward 1 over a very long session of
   accumulated one-direction panning, which would eventually make
   `maybeRecenter`'s seed patch mostly get rim-culled. Needs an enormous
   amount of dragging to bite; see turn 4's BRIEF text in git history for
   the full reasoning and the fix if it ever does (cull by hyperbolic
   distance from `center`, not Euclidean modulus from zero).
3. **Verify (or fix) the two-coloring** — carried over from turn 3 and 4,
   still untouched. Fish orientation/colour depends on BFS-depth parity,
   which is not a true face-adjacency 2-coloring, and now additionally can
   drift across a `maybeRecenter` merge (a tile added via the new seed gets
   a depth relative to *that* seed's root, not the original one, so a
   newly-grown tile adjacent to an old one could theoretically land on the
   same parity/colour as its neighbour). Cosmetic only, not a correctness
   bug, but worth fixing properly: build the actual adjacency graph and
   2-color it. Note this is provably impossible as a *true* 2-coloring for
   the two odd-`q` presets ({8,3}, {7,3}) — each vertex has an odd cycle of
   `q` faces around it, so BFS-depth-parity-as-stand-in may be the
   permanent answer for those two regardless.
4. **Fit the fish tighter to the tile** — unchanged from turn 4's plan,
   `FISH_SCALE` (0.68) is one constant for all four presets, conservative
   for the smallest one ({5,4}).
5. **Replace the affine barycentric fish warp with the true isometry**, if
   it looks visibly wrong on far-from-centre tiles once someone can look.
6. **Circle Limit III uses equidistant curves, not geodesics** — documented
   in the page copy as a known simplification, unaddressed.

## Gotchas

- Still no browser here. This turn's riskiest untested assumption: that
  `growBuffer`'s per-call budget (8 tiles) keeps pace with a fast drag on a
  real phone. If it doesn't, the symptom is a visible blank wedge at the
  leading edge of a fast pan that fills in a moment later — not a crash,
  just under-budgeted. See plan item 1.
- **`faceMap` keys are the same rounded-centroid strings as before**
  (`faceKey`, `Math.round(c.re*1000)+','+Math.round(c.im*1000)`) — this is
  now load-bearing for correctness in a way it wasn't in turn 4: it's what
  lets `maybeRecenter`'s merge (`if (!faceMap.has(f.key))`) recognise a tile
  from the new seed patch as "already alive" rather than adding a near-
  duplicate. Don't lower that rounding precision without checking it still
  reliably matches the *same* physical tile reached via two different BFS
  paths (currently relies on floating-point agreement to 3 decimal places,
  which held in turn 4's testing-by-algebra and is unchanged here).
- **`growBuffer`'s `while` loop mutates `frontier` with `splice` while
  iterating by index** — on both the "retired" and "just expanded" branches
  it splices at the current `idx` and does *not* increment `idx` afterward,
  because the next element has shifted into that slot. Only the "not in
  buffer range yet" branch increments. Getting this backwards reintroduces
  either a skipped element or an infinite loop.
- `maybeRecenter()` and `growBuffer`/`retireBuffer` must be called together
  (`updateBuffer()`) after every place `g` changes from user interaction —
  now wired into *every* swim animation frame, not just its completion
  (turn 4's version only called `maybeRecenter` once, at the end of the
  tween). `resetBtn`/`newBtn` don't need any of them: they call
  `seedTiling()` directly, which replaces `faceMap` wholesale — that's the
  one place a full replace is still correct, since the user explicitly
  asked to start over.
- `seedPatch(p, q, center)`'s third argument is still checked with a plain
  `if (center)` — fine because every call site either omits it (falsy
  `undefined`) or passes a real `{re, im}` object (truthy even for
  `{re:0,im:0}`). Don't "simplify" that to a falsy check on the values
  inside `center`.
- Everything from turn 3's gotchas about `mCompose` order and the
  fish-weight rebuild-on-preset-switch requirement still applies unchanged
  — see git history for turn 3's BRIEF if needed.
