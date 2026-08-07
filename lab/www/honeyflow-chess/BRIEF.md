# BRIEF — others-induce (Honeyflow Chess)

## What this is

A Bluesky thread asked for a chess board made of honey where every move
induces a laminar flow impulse scaled to distance moved, keeping the grid and
overlaying streamlines, with neighbouring pieces solved into the flow rather
than faked. Earlier turns built a playable two-player board (movement-shape
rules, no check/checkmate/castling) over a real grid-based stable-fluids
solver (Stam/Mike Ash), with occupied squares sampling the solved velocity
field each frame and dragging along it tethered back to their home square,
widened the injection from a single grid cell to a broad splat kernel so a
neighbour's drag was materially large, and then made a piece dragged far
enough actually change which square it occupies (`resolveFlowSlides()`),
not just wobble.

**This turn's request, verbatim: "spend a turn on animation. I would like to
see a flow field develop, the pieces move more slowly to accentuate the flow
field. Technical field plotting not fwoof lines that you sketch now."** Two
changes, both shipped:

1. **The streamline renderer is gone.** It traced short multi-step paths
   from 169 seeds and drew each with a soft two-pass glow (a wide low-alpha
   stroke under a bright core) — exactly what "fwoof lines that you sketch"
   names: it read as atmosphere, not a plotted quantity. It's replaced by
   `computeVectorField()`/`drawVectorField()`: a fixed 13×13 grid of points,
   each showing ONE directly-sampled velocity vector as a thin arrow with a
   hard arrowhead, length and colour (cool cyan → white) both mapped to
   local speed. No integration, no seeds, no caching beyond one frame — a
   quiver plot, the standard technical way to plot a vector field, not a
   sketched curve. Recomputed every frame now (cheap — 169 bilinear samples)
   instead of every 5th, so "a flow field develop" is legible arrow-by-arrow
   as the solver evolves, not just as a blob growing.
2. **Pieces move more slowly.** `RESTORE` (0.90 → 0.95) and `DRAG` (1.0 →
   0.5) both changed together — see the comment on the recurrence in
   index.html. The relaxation `st_new = RESTORE*st + RESTORE*DRAG*v/m` is a
   linear low-pass filter whose *settle time* depends only on `RESTORE`
   (~1/(1-RESTORE) ticks) and is independent of `DRAG`, which only scales
   the eventual displacement. Raising `RESTORE` alone would have also
   roughly doubled the steady-state offset (and made slides fire far more
   readily); halving `DRAG` alongside it was chosen to hold the steady-state
   offset — and therefore how often `resolveFlowSlides()` still fires —
   close to where the previous turn tuned it, while roughly doubling how
   many frames it takes to get there. Reasoned from the recurrence, not
   measured in a browser.

## Decisions

- **Split the offset ceiling into a physics one and a visual one.** The old
  single `MAX_OFFSET` (0.3) did two jobs — stop the sim exploding, and keep
  the CSS transform off a neighbour's tap target — and kept the physics value
  itself capped so low it could never mean a square change. Now
  `MAX_OFFSET` (0.9) is the physics ceiling the drag math clamps to, and a
  new `MAX_VISUAL_OFFSET` (0.3, same value the old ceiling had) is applied
  only in `applyPieceTransforms()` when computing the CSS transform. A piece
  can be physically past `SLIDE_THRESHOLD` while its on-screen sway still
  never crosses onto a neighbour's touch target — the accessibility property
  the old code had is preserved, it just no longer also throttles the
  mechanic.
- **Blocked, not captured, when the destination is occupied.** Letting flow
  capture a piece (including a king) felt like a much bigger, unrequested
  change to what "a game of chess" means here — the request was about
  movement, not about the fluid deciding captures. Revisit only if asked.
- **Only the dominant axis moves, one square, per tick.** A piece whose
  offset is large on both axes at once doesn't jump diagonally past a legal
  knight-shaped displacement — it moves along whichever axis it's furthest
  off-centre on. Keeps each slide a single, checkable board-array mutation
  instead of a compound one.
- **No carried momentum across a slide.** Both the vacated and the newly
  occupied square's offset reset to `{0,0}` the instant a slide applies,
  rather than carrying the remainder (`offset - 1`) into the new square. This
  makes a slide read as a discrete "the honey moved it one square," matching
  "if they're wiggling now they should be moving tiles" — but it does mean a
  strong, sustained current can march a piece across several squares over a
  few seconds via repeated slides rather than one continuous glide. Untested
  whether that reads as "flowing" or "chaotic" — see Gotchas.
- **A flow-triggered slide clears `sel`/`legal`.** If the player has a piece
  selected (or is looking at its legal-move highlights) when the flow
  relocates *any* piece, the selection could point at a stale square.
  Clearing it is the conservative choice — it costs a re-click, not a bug.
- **SLIDE_THRESHOLD (0.55) and MAX_OFFSET (0.9) are reasoned, not
  measured** — this sandbox still has no browser and no shell. Picked so
  there's real headroom between "committed to a slide" and "physics
  ceiling," rather than the two nearly coinciding. `headless-test.mjs` now
  logs and counts slides per DRAG value specifically so this can be checked
  against real numbers next.
- **Quiver plot over a fixed sample grid, not traced streamlines.** The
  request named the previous rendering directly ("fwoof lines that you
  sketch"). A quiver plot — one vector per grid point, no path integration —
  is the standard technical way to plot a vector field (what a physics or
  fluids textbook draws), and it composes naturally with "see a flow field
  develop": each arrow updates from a fresh sample every frame, so growth
  and decay are visible arrow-by-arrow rather than as a soft blob swelling.
  Rejected: keeping streamlines but just thinning the stroke/removing the
  glow pass — that's still a sketched curve, not a plotted quantity, and
  wouldn't have answered "technical field plotting" as directly.
- **Colour carries magnitude, cool cyan → white, deliberately NOT the honey
  palette.** Density (the diffuse amber glow) and the vector field are now
  two distinct visual channels reading as two different things: dye
  advecting vs. an instrument's velocity reading. Sharing a palette would
  have made them illegible as separate signals.
- **RESTORE up, DRAG down, together, not just "slow it down."** See What
  This Is above for the derivation — raising RESTORE alone changes both the
  settle time AND the steady-state offset for a linear relaxation like this
  one; halving DRAG alongside it was the deliberate choice to isolate "moves
  more slowly" from "moves less far," since only the former was asked for.

## The plan (not built yet, roughly in order)

1. **Run `headless-test.mjs` and read the new `slides=` column, against the
   new RESTORE=0.95/DRAG=0.5.** Same load-bearing unknown as before, now
   against different constants: does a normal move still produce slides, how
   many, how fast, do they cascade further than intended — and does the
   slower approach (the point of this turn) actually read as "flowing" over
   ~2x as many frames, or does it start to feel sluggish rather than
   deliberate? If `slides` drops to ~0 where it wasn't before, the "hold
   steady-state" reasoning above was wrong and DRAG needs to come back up a
   little. If a single move still produces a long cascade, `SLIDE_THRESHOLD`
   is too low relative to how much the field decays, or viscosity needs to
   damp faster.
2. **Consider a per-piece cooldown or a slide budget per move-event**, if
   the sweep shows unbounded cascades. Not built because it's not yet known
   to be needed — don't add complexity for a problem that might not exist.
3. **PDS persistence.** `store.save('board', {board, turn})` on every move,
   `store.load('board')` on page load with a "resume game" prompt. Still
   untouched, still low risk.
4. **Check detection**, if a future turn wants "real" chess — needs a king
   tracker and an "is square attacked" helper. Bigger scope now that pieces
   can also relocate outside of `doMove()`: any check/attack logic must read
   live `board` state, which it already would, so this shouldn't interact
   badly with slides, but hasn't been thought through in detail.
5. **Piece-weight scaling of the injected impulse itself**, not just drag
   resistance. Not requested explicitly.
6. **Knight leap / impact ripple**, floated early in the thread but not
   part of this turn's request.
7. **Vector field tuning is un-run, same as the slide mechanic was last
   turn.** `FIELD_REFSPEED` (0.01) and `FIELD_EPS` (0.0005) were picked to
   match the old streamline code's own thresholds (it broke a trace at
   speed<0.0006 and saturated alpha around speed*90≈1), not measured against
   the new RESTORE/DRAG values in a browser. If the board looks bare after a
   move, lower `FIELD_REFSPEED` or `FIELD_EPS`; if it's a solid wall of white
   arrows, raise them.
8. Tap targets are ~42px at 360px viewport width, just under the 44px
   guideline. Untouched.

## Gotchas

- **`headless-test.mjs` and `index.html`'s solver/physics are two copies of
  the same code, not one shared module.** `resolveFlowSlides()` was mirrored
  into both an earlier turn, and this turn's `RESTORE`/`DRAG` change was
  mirrored too (`headless-test.mjs` doesn't have its own `DRAG` constant —
  it's a CLI arg — but its recommended-value log string was updated to
  match). The rendering change (streamlines → vector field) was NOT
  mirrored, and doesn't need to be: `headless-test.mjs` never draws anything,
  it only measures the solver and the board array. Keep that split in mind —
  physics constants need mirroring, rendering constants don't.
- **This build agent has no Bash, no WebFetch, no WebSearch, and no browser** —
  a permanent constraint of this tenant's build role, not a one-off gap. Both
  this turn's changes shipped un-run: the slower RESTORE/DRAG and the entire
  vector-field renderer have never been seen moving. The harness's post-build
  screenshot will show a single frame — whether arrows are present at all,
  roughly how dense, whether colour/contrast reads against the honey board —
  but not whether "a flow field develop" actually reads as development over
  time, or whether the slower pieces feel deliberate rather than sluggish.
  Only `headless-test.mjs`, run by a human or a differently-privileged agent,
  or an actual browser, can confirm either.
- **A slide can now happen on ANY occupied square, every tick, independent
  of whose turn it is.** This was already true of the drag-wobble, but now
  it changes `board[][]` — meaning the position a player sees can differ
  from the position after their last click, with no move notation logged
  for it (the `#lastmove` line only updates on `doMove()`, not on a flow
  slide). A future turn might want to surface flow-caused relocations in the
  UI (a small aside like "the current carried the knight to f3") — skipped
  this turn for time, flagged in the footer copy instead as "glance at the
  board, not just at whose turn it says."
- **Two pieces whose offsets point at each other's squares in the same tick
  neither move** (each one's target is occupied by the other, evaluated
  against the same pre-tick snapshot) — this reads as the flow failing to
  swap them, which is correct per the "blocked, not captured" decision above,
  but worth knowing if it looks like a bug during testing.
- The two fluid grids (48×48 sim vs 8×8 chess) are **not** the same
  coordinate space anywhere in the code — every touchpoint converts board
  coords (0..8) to sim coords (1..N-2) explicitly. Unchanged this turn.

## Post-build screenshot check (2026-08-07, this turn's code)

1200×800 static screenshot under production CSP, taken against the
vector-field rewrite (streamlines removed): title, description text
(including the new "the arrows plotted over it are a live vector field,
sampled fresh each frame" line), "White to move" label, and a correctly laid
out 8×8 starting position all rendered — legible glyphs, no overlap, no
off-screen content, no blank canvas. Nothing visibly broken, so nothing was
changed. A single static frame can't show whether the quiver plot actually
animates, whether arrows appear/decay as the field develops, or whether the
slower RESTORE/DRAG reads as deliberate rather than sluggish — those are
still only checkable by `headless-test.mjs` or a real browser, per the
Gotchas above.

### Superseded note (previous turn, before the rendering rewrite)

Left for the record only — described the old streamline renderer, which no
longer exists.

1200×800 static screenshot under production CSP: title, description, "White
to move" label, and a correctly laid out 8×8 starting position all rendered —
legible glyphs, no overlap, no off-screen content, no blank canvas. Nothing
visibly broken, so nothing was changed. A static image can't show whether
`resolveFlowSlides()` actually fires or feels right over time — that's still
only checkable by running `headless-test.mjs`, per the Gotchas above.
