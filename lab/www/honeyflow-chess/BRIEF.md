# BRIEF — others-induce (Honeyflow Chess)

## What this is

A Bluesky thread asked for a chess board made of honey where every move
induces a laminar flow impulse scaled to distance moved, keeping the grid and
overlaying streamlines, with neighbouring pieces solved into the flow rather
than faked. Earlier turns built a playable two-player board (movement-shape
rules, no check/checkmate/castling) over a real grid-based stable-fluids
solver (Stam/Mike Ash), with occupied squares sampling the solved velocity
field each frame and dragging along it, tethered back to their home square —
then widened the injection from a single grid cell to a broad splat kernel so
a neighbour's drag was materially large instead of diffusion-diluted to
nothing.

**This turn's request, verbatim: "Ah ok so now they wiggle at least but the
point is to have the effected pieces change squares, to have game state be a
function of adjacent moves. Pretty much if they're wiggling now they should
be moving tiles."** The wobble worked; it was still only ever a CSS
transform — `board[][]` never changed because of the flow, only because of a
played move. That's exactly what this line is calling out: dragging a piece
around its square isn't the ask, relocating it is.

**Shipped: pieces dragged far enough by the current now actually change
which square they occupy.** `resolveFlowSlides()` (index.html, mirrored in
`headless-test.mjs`) runs every physics tick after the existing drag/tether
step: any occupied square whose accumulated offset has crossed
`SLIDE_THRESHOLD` (0.55 board-units) on its dominant axis is proposed to move
one square in that direction; proposals are collected against a snapshot of
the board and applied together, so two pieces flowing toward the same empty
square in the same tick can't both claim it. A destination that's occupied
blocks the slide rather than capturing through it — the honey pushes the
piece up against its neighbour, it doesn't shove it off the board. `board`,
`offsetGrid`, and the rendered glyphs (via `renderPieces()`) all update
together, so this is a real position change, not a visual illusion — it
happens independent of whose turn it is and does not pass the turn, same as
the existing drag-wobble did.

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
- **SLIDE_THRESHOLD (0.55) and the new MAX_OFFSET (0.9) are reasoned, not
  measured** — this sandbox still has no browser and no shell. Picked so
  there's real headroom between "committed to a slide" and "physics
  ceiling," rather than the two nearly coinciding. `headless-test.mjs` now
  logs and counts slides per DRAG value specifically so this can be checked
  against real numbers next.

## The plan (not built yet, roughly in order)

1. **Run `headless-test.mjs` and read the new `slides=` column.** This is
   the load-bearing unknown left this turn: does DRAG=1.0 (the shipped
   value) produce slides at all on a normal move, and if so how many, how
   fast, and do they cascade further than intended? If `slides` is 0 across
   the whole sweep, lower `SLIDE_THRESHOLD` or raise the velocity multiplier
   in `injectFlow` before anything else — the mechanic this turn built would
   otherwise ship inert. If a single move produces a long cascade of slides
   marching a piece across the board, `SLIDE_THRESHOLD` is too low relative
   to how much the field decays, or `RESTORE`/viscosity need to damp faster.
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
7. Tap targets are ~42px at 360px viewport width, just under the 44px
   guideline. Untouched.

## Gotchas

- **`headless-test.mjs` and `index.html`'s solver/physics are two copies of
  the same code, not one shared module.** This turn's `resolveFlowSlides()`
  was mirrored into both — verify that's still true before trusting a sweep,
  and keep mirroring it if either changes again.
- **This build agent has no Bash, no WebFetch, no WebSearch, and no browser** —
  a permanent constraint of this tenant's build role, not a one-off gap. The
  entire slide mechanic shipped un-run. The harness's post-build screenshot
  will show whether pieces render at all, but a screenshot won't show slides
  happening over time — only `headless-test.mjs`, run by a human or a
  differently-privileged agent, can confirm the mechanic actually fires and
  feels right rather than being inert or chaotic.
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

## Post-build screenshot check (2026-08-07)

1200×800 static screenshot under production CSP: title, description, "White
to move" label, and a correctly laid out 8×8 starting position all rendered —
legible glyphs, no overlap, no off-screen content, no blank canvas. Nothing
visibly broken, so nothing was changed. A static image can't show whether
`resolveFlowSlides()` actually fires or feels right over time — that's still
only checkable by running `headless-test.mjs`, per the Gotchas above.
