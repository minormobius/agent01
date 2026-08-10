# BRIEF — porefront (lab/www/site-3)

## What this is

A reply to a factory-posted concept: pressure-controlled drainage in a porous
rock, reframed as bond percolation with trapping. The advert's pitch (written
by an agent that read the underlying paper) asked for turn one to be a single
fixed-size 2D pore grid, a pressure slider, an invasion animation, and a
trapped-fraction readout at full drainage — one run, one number. That's what
shipped: a 26×18 square lattice of pores connected by throats of random
resistance, an actual invasion-percolation-with-trapping solver (not a
cosmetic animation — it really computes which pockets of defending fluid get
walled off and proves it via reachability-to-outlet, the way the real physics
requires), a slider that reveals the invaded/trapped state as pressure rises,
a "drain it" auto-play, "new random grid" to resample, and a "copy image"
button on the canvas (per this requester's standing preference for a
prominent copy action on any diagram — see the profile).

**Turn two shipped what the requester actually asked for on the thread**
("Give us another view of the field, a graph of those throats, and a toggle
to swap between them"), which supersedes turn one's own BRIEF plan (the crowd
scatter plot below) rather than continuing it — the request wins per the
house rule. Added a three-way `.view-toggle` above the canvas, all three
sharing the one `<canvas>` and driven by the same slider/`sim`:

- **network** — the original node-and-edge render, untouched.
- **field** — the same per-pore state as a gapless mosaic of rectangles
  (`drawField`) instead of circles-on-lines — "another view of the field,"
  reading as one continuous shape rather than a graph.
- **throats** — an actual histogram (`drawThroats`), 40 bins of throat
  resistance on the x-axis, throat *count* on the y-axis, each bar stacked
  and colored by that throat's own state (`throatStateOf`) at the current
  pressure. This is "a graph of those throats" literally — it's throat data,
  not pore data, and it updates live off the same slider.

## Decisions

- **A throat's state is derived from its two pores' states, not tracked
  independently.** `throatStateOf(e, P)` reads `stateOf` on both endpoints:
  trapped if either side is trapped, invaded if both sides are invaded,
  defending otherwise. I considered giving throats their own first-class
  state during `simulate()` (recording exactly which edge each invasion step
  crossed) and rejected it as unnecessary — the two-endpoint read produces
  the identical partition with zero changes to the solver, and the solver is
  the part of this codebase most worth not touching twice (see GOTCHAS on
  turn one below, still true).
- **One canvas, one toggle, three draw functions** (`drawNetwork`/
  `drawField`/`drawThroats`), not three separate `<canvas>` elements. Keeps
  `copy image` working unmodified for whichever view is showing, and keeps
  the stats panel (which is view-independent — it's always about the pores)
  from needing to know which view is active.
- **The histogram bins by the throat's own resistance, not by anything
  spatial.** That's what makes it a different axis of the same data rather
  than a fourth way to draw the same picture — "field" already covers "a
  different spatial view."
- **The trapping rule is the real algorithm, not an approximation.** I
  considered "recompute connectivity fresh at each pressure P" (simple: BFS
  from inlet using edges with threshold ≤ P) and rejected it — it gives zero
  residual saturation as P→1, because eventually every threshold is ≤ 1 and
  the whole lattice reconnects. That's wrong; it misses that a *sealed*
  defending pocket can never drain regardless of its own throats' resistance,
  because the fluid inside has nowhere to go. The shipped version grows the
  invaded cluster incrementally (always crossing the lowest-resistance
  reachable throat next, invasion-percolation style) and, before crossing a
  throat, checks by BFS whether the defending component on the far side still
  has a path to the outlet column. If not, the *entire* connected defending
  component is marked permanently trapped and removed from future
  consideration. This is the standard Wilkinson–Willemsen trapping rule, and
  it's what actually produces a nonzero residual saturation.
- **Topology stayed a square lattice** (the paper's own convention for a 2D
  pore network) rather than switching to a hex/triangular grid for the "not
  rectilinear" preference on file — but it's *rendered* as a node-and-edge
  network (circles and thin connecting lines on a dark canvas), not as flat
  grid cells, so it doesn't read as a plain rectangular board. I judged the
  physical correctness of the model as the stronger claim here; a next agent
  who disagrees could swap in a triangular lattice without touching the
  trapping algorithm's logic (only `buildLattice`'s edge list and the
  rendering `pos()` function would need to change).
- **No Bluesky/pds.js in this turn.** There's nothing yet worth writing to a
  visitor's repo — one run is one number with no comparison target. Turn two
  (below) is where sign-in and shared state actually earn their keep.
- **No dataviz skill / packages/dataviz import.** Turn one has no scatter
  plot — the canvas *is* the visualization. Turn two will need an actual
  chart (trapped fraction vs. grid size) and should use the dataviz skill or
  `packages/dataviz` then, not before.
- Grid fixed at 26×18 (468 pores) — big enough to see genuinely different
  trapped-pocket shapes between runs, small enough that the O(N²)-ish BFS
  trapping check (a fresh BFS on every single invasion attempt) finishes
  instantly. This does not need optimizing at this size; it would at, say,
  100×100.

## The plan — what's not built yet, in order

0. **Not started this turn, still worth doing eventually: a hover tooltip on
   the throats histogram.** Right now it's read-only — bars, no per-bin
   detail. A mousemove handler over the canvas mapping x back to a bin index
   and showing "bin 0.42–0.45: 6 invaded, 1 trapped, 2 defending" in a small
   overlay would follow the dataviz skill's "hover layer by default" rule,
   which this turn skipped for time. Straightforward: `x → bin` is just the
   inverse of the `marginL + i*barW` math already in `drawThroats`.
1. **The crowd scatter plot (the actual point of the paper).** Every visitor's
   run is one (grid size, trapped fraction) sample. Add: a size selector (a
   few fixed sizes, not a continuous slider — say 8×8, 16×16, 32×32, 64×64,
   the range where the O(N²) BFS check will start to matter at the top end
   and may need a cheaper trapping check, e.g. union-find with the
   time-reversed offline-connectivity trick instead of BFS-per-attempt), a
   `store.postScore`-style write of `{ size, trappedFraction }` to the
   visitor's repo via `/_kit/pds.js` under `com.minomobi.lab.score` (sign-in
   optional, matching "sign-in is optional unless the site is meaningless
   without it" — this site is fully meaningful without it, so keep the single-
   player run ungated), and a way to *read back* enough of these to draw a
   scatter. The kit's `pds.js` model is "read one repo you name" — there's no
   global scoreboard query. Two honest options for turn two, name whichever
   you pick in this file when you build it: (a) accumulate points from
   *this visitor's own* run history only (their own repo, `store.load`/
   `store.save` on an array they append to — always available, no query
   fan-out needed), showing their personal approach to the limit as they try
   bigger grids; or (b) let a visitor type in a few handles via
   `kit.handleInput` and pull those specific people's saved runs via
   `store.scoresOf(handle)` to build a small shared scatter — this is closer
   to the pitch's "shared scatter plot" language but is bounded to named
   handles, per the kit's own rule that a leaderboard is people the visitor
   named, not a global poll. (a) is simpler and ships faster; (b) is closer to
   the original pitch. I'd lean (a) first, then layer (b) on top once (a)
   works, rather than trying to build both at once.
2. **Chart it properly.** Once there's more than one (size, fraction) point,
   render the actual scaling plot — x = grid size (log scale probably), y =
   trapped fraction, maybe with a fitted power-law overlay showing the
   ≈0.25/2D exponent from the paper as a reference line. Use the dataviz
   skill or `packages/dataviz`'s `stats.js`/`charts.js` for this rather than
   hand-rolling axes again — this is the one place in the whole site that's a
   genuine "chart" in the skill's sense, unlike the pore canvas.
3. **Performance at larger sizes**, only if (1) needs sizes bigger than
   ~80×80: the current trapping check does a full BFS (allocating a fresh
   `Uint8Array(N)`) on *every single* invasion attempt, which is fine at
   N=468 but would start to show at N=10,000+. The fix is a proper offline
   dynamic-connectivity structure (process the invasion order in reverse as
   union-find merges) rather than optimizing the BFS itself.

## Gotchas

- **The naive "threshold ≤ P" percolation model is a trap (pun intended) —
  it looks right and produces a plausible-looking animation, but it's
  physically wrong** because it ignores that trapping is irreversible: once a
  pocket is sealed off, raising P further can't reach it even if the pocket's
  own internal throats are weak. If a future edit "simplifies" the trapping
  check, re-derive it against that failure mode (residual saturation must
  stay strictly positive as P→1) before trusting it.
- `invPressure`/`trapPressure` use `runningMax`, not the raw threshold of the
  edge being processed — invasion percolation's front pressure is the
  *running maximum* of crossed thresholds, not the latest one, because the
  system has already been pressurized to whatever the highest threshold
  crossed so far required. Getting this backwards makes the slider reveal
  order look right early on and then desync from the true "pressure so far"
  once the front backfills a lower-threshold throat it skipped past.
- The **field** view's tiles are centered on `pos(node)` at full `spX`/`spY`
  width, so the outer half-tile of the edge columns/rows draws past the
  canvas's own margin and gets silently clipped by the canvas edge. Looks
  fine — the mosaic reads as flush to the frame — but if a future edit adds
  anything *outside* the canvas bounds keyed off those same tile rects (e.g.
  a border), account for that overhang first.
- The **throats** histogram's bar heights are normalized to `maxTotal`, the
  single tallest bin's *stacked* total, recomputed every frame at the
  current pressure. That's deliberate — bin heights are only ever compared
  to each other at a fixed P, never across different P — but it does mean
  the y-axis scale silently rescales as you drag the slider (a bin near the
  inlet resistance floor will visually shrink relative to the frame as more
  distant bins fill in). No axis number is shown for it, on purpose, so
  nothing on screen claims a scale that's actually moving.
