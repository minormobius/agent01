# BRIEF — take-escher / "Shoal"

## What this is

Requester wanted Escher's *Circle Limit III* turned into an interactive
Poincaré-disk explorer: pick a row of fish, translate/"swim" them in the
direction of their nose, and have the rest of the tiling follow so it still
tiles. Turns 1–3 built a real hyperbolic {p,q} reflection tiling (not
independent lines), panned as one rigid Möbius isometry so tiles stay
edge-locked by construction, with fish silhouettes warped onto every tile.
Turn 4 made panning infinite by rebuilding the generated patch when its root
drifted too far — but as one big synchronous swap, which read as a visible
pop. Turn 5 replaced that with a persistent tile buffer (`faceMap` +
`frontier`, incremental `growBuffer`/`retireBuffer`), but its recentring
step (`maybeRecenter`) still worked by fabricating a *brand-new* canonical
patch at the drifted point and merging it in by key.

Turn 6 (this one) was the requester's reaction to turn 5: **"the whole
tiling getting stamped on top of the old tiling at roughly a half pitch so
it's a mess. And it still runs out when you roll over far enough. Try to
add the 'next' tile to the edge of the buffer rather than in the center of
the view."** Both complaints trace to the same root cause: a freshly built
canonical central polygon at an arbitrary point has no reason to align with
the real tiling already on screen — it's a *different* discrete copy of the
same abstract pattern, so merging it in produced the seam/mismatch, and
because it was capped small (`MERGE_SEED_CAP`=40) and still ultimately
bounded by the old fixed coordinate frame, growth kept petering out.

This turn replaced recentring with coordinate **re-rooting by conjugation**
instead of re-seeding. `centralFace()` finds the live tile nearest screen
centre; once its *stored* (pre-pan) centroid drifts past `RECENTER_ORIG_MOD`
(0.5), every live tile's vertices are remapped through the Möbius isometry
`Tinv = mInverse(mTranslateTo(anchorCentroid))` — the same map applied to
every tile, so it's an exact isometry of the existing structure, not a new
one — and `g` is updated to `g = mCompose(g, T)` so the actual screen
picture is provably unchanged (verified algebraically, not just by
reasoning: `mApply(g_old, z_old) = mApply(g_old, mApply(T, z_new)) =
mApply(mCompose(g_old, T), z_new)`). No tile is invented or duplicated —
only the numbers describing tiles that were already there change, all at
once, consistently. `seedPatch`, `MERGE_SEED_CAP`, and `rootOrig` are gone;
`maybeRecenter` no longer calls `seedPatch` at all.

## Decisions

- **Conjugate the whole live buffer instead of merging a fresh seed patch.**
  The turn-5 approach could never be made to line up reliably: a canonical
  polygon built at an arbitrary point is only guaranteed to match the real
  tiling if that point happens to *be* an actual tile centroid with matching
  orientation, which a screen-centre-derived point has no reason to be.
  Conjugation sidesteps the alignment problem entirely by never generating
  new geometry at recentre time — it only changes the coordinate frame the
  same tiles are described in.
- **Recompute every face's `.key` after conjugation, and rebuild `faceMap`
  with a fresh `Map`.** This was the one subtle trap: `faceKey` is a
  rounded string of the CURRENT centroid, and `growBuffer`'s dedup
  (`faceMap.has(faceKey(nv))`) only works if a face's stored `.key` matches
  its current `.verts`. Mutating `.verts` in place without recomputing
  `.key` would silently break dedup after the first recentre — freshly
  reflected tiles that are actually already-live faces would fail the
  `has()` check (comparing a new-frame key against a stale old-frame key
  string) and get added again as "new" tiles, reproducing the exact
  stamped-on-top bug this turn set out to fix. `frontier` needed no
  separate update: its entries are the *same objects* as `faceMap`'s, so
  mutating `f.verts`/`f.key` on the object updates both automatically.
- **Trigger on the anchor's own stored-coordinate modulus (0.5), not a
  screen-space proxy.** Turn 5 triggered on how far a tracked point had
  drifted on screen from a fixed original root — a proxy for the real
  concern. This turn checks the actual thing that matters (how close the
  tile everyone cares about right now is, in its own stored numbers, to the
  disk's rim where `seedPatch`/`growBuffer`'s safety cull at 0.995² lives),
  which is more direct and should recentre exactly when needed rather than
  on a schedule tied to the old root.
- **`centralFace()` scans all of `faceMap` (≤300 tiles) every `updateBuffer()`
  call.** Same order of cost as `render()`'s own full scan, called at the
  same frequency — not a new performance concern.

## The plan (next agent, in order)

1. **Verify in a real browser — this turn had none.** Specifically: (a) does
   the "stamped tiling" artefact from turn 5 actually stop, especially after
   dragging far in one direction repeatedly so several recentres fire; (b)
   does growth genuinely keep up indefinitely now, or does some other limit
   (e.g. `HARD_CAP`=300, or `GROW_BUDGET`=8/call not keeping pace with a
   fast drag) become the new bottleneck. If (b), the knobs to raise first
   are `GROW_BUDGET` then `HARD_CAP` — no restructuring needed.
2. **Watch for any visible "shimmer" at the instant of a recentre** — the
   screen picture is *supposed* to be pixel-identical before/after
   (algebraically proven above), but floating-point round-trip through
   `Tinv` then back through the new `g` could in principle introduce a
   sub-pixel jitter after many recentres compound. Only worth chasing if
   actually visible.
3. **Verify (or fix) the two-coloring** — carried over unaddressed from
   turns 3–5. Fish orientation/colour is BFS-depth parity, not a true
   face-adjacency 2-coloring, and can still drift at a boundary between
   tiles grown before/after different recentres. Cosmetic only. Note this is
   provably impossible as a *true* 2-coloring for the two odd-`q` presets
   ({8,3}, {7,3}) — each vertex has an odd cycle of `q` faces around it.
4. **Fit the fish tighter to the tile** — `FISH_SCALE` (0.68) is one
   constant for all four presets, conservative for the smallest ({5,4}).
5. **Replace the affine barycentric fish warp with the true isometry**, if
   it looks visibly wrong on far-from-centre tiles once someone can look.
6. **Circle Limit III uses equidistant curves, not geodesics** — documented
   in the page copy as a known simplification, unaddressed.

## Gotchas

- Still no browser here — see plan item 1, this turn's fix is reasoned from
  the algebra and from re-reading turn 5's actual bug, not observed.
- **`faceKey` must be recomputed after any mutation of `.verts`.** This is
  the sharpest edge in the whole file now: anything that transforms
  existing tile coordinates (recentring is the only thing that does today)
  MUST rebuild `faceMap` with fresh keys in the same pass, or dedup silently
  breaks and duplicate/overlapping tiles reappear. If a future turn adds
  another way to touch `.verts` post-creation, this applies there too.
- **`growBuffer`'s `while` loop mutates `frontier` with `splice` while
  iterating by index** — unchanged from turn 5, still fragile: the
  "retired" and "just expanded" branches splice at `idx` and do not
  increment afterward (next element shifted into that slot); only the
  "not in range yet" branch increments. Getting this backwards reintroduces
  a skipped element or an infinite loop.
- `updateBuffer()` (`growBuffer` → `retireBuffer` → `maybeRecenter`, in that
  order) still needs to run after every place `g` changes from user
  interaction — every pointermove and every swim animation frame.
  `resetBtn`/`newBtn` don't need it: they call `seedTiling()` directly,
  which replaces `faceMap` wholesale — the one place a full replace is
  still correct, since the user explicitly asked to start over.
- `seedPatch(p, q, center, cap)`'s `center` param is currently dead code —
  every call site (`seedTiling`, always called with 2 args) passes it as
  `undefined`. Harmless, predates this turn, not touched.
- Everything from turn 3's gotchas about `mCompose` order and the
  fish-weight rebuild-on-preset-switch requirement still applies unchanged
  — see git history for turn 3's BRIEF if needed. `mCompose(M1, M2)` means
  "apply M2 first, then M1" — `mApply(mCompose(M1,M2), z) = mApply(M1,
  mApply(M2, z))`. This turn's `g = mCompose(g, T)` depends on that
  convention; get it backwards and every recentre visibly jumps the view.
