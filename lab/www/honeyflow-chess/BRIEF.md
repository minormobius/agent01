# BRIEF — others-induce (Honeyflow Chess)

## This turn (2026-08-07): speed, self-immunity, potency

**Request, verbatim: "Yes piece moves are about 10x the speed they should
be. It's a blink and you miss it sort of affair. Also the piece that
induces the flow field shouldn't be effected by the flow field, the piece
that moves should always hit its target. Also I'm seeing real effects not
start until flow at four."** Three asks, three independent fixes, all in
`index.html` and mirrored into `headless-test.mjs`:

1. **~10x slower.** `RESTORE` 0.95 → 0.995, `DRAG` 0.5 → 0.05, together —
   see the comment on the recurrence right above the constants. The pair
   was chosen so the steady-state offset a piece eventually reaches is
   *unchanged* (~2%) from what shipped last turn, while the number of ticks
   it takes to get there is ~10x longer (~20 → ~200 ticks, ~0.3s → ~3.3s at
   60fps). Purely a TIME change, not a "how far" change — same shape as last
   turn's fix, just apparently not enough of one.
2. **The piece that just moved is now immune to the flow field it just
   released.** A single `lastMovedSq = {r, c}` (set in `doMove()`, checked
   first thing in `updatePiecePhysics()`) pins that one square's offset at
   exactly `{0,0}` every tick — it cannot wobble or slide — until the
   *next* `doMove()` reassigns which square is immune. So a piece always
   lands dead-centre on its target and stays there for as long as it's the
   opponent's move to make, and only becomes vulnerable to flow again once
   a fresh move — and a fresh impulse — begins. Deliberately NOT extended
   to pieces `resolveFlowSlides()` relocates: the request named the piece
   that *induces* a flow, and flow-carried neighbours are the mechanic
   itself, not a bug to fix.
3. **Roughly doubled flow potency.** `FLOW_VEL_MULT` (was an inline `0.045`
   in `injectFlow()`, now a named constant) 0.045 → 0.09. The steady-state
   drag offset scales linearly with this number, so at the old value the
   default `flowStrength` (2.6 of a 0.4–4 range) landed below
   `SLIDE_THRESHOLD` and only the top of the slider ever produced a real
   square change — exactly "real effects not start until flow at four".
   Doubling it moves that same effect down to roughly the default setting.

All three numbers are **reasoned from the recurrence and from linear
scaling, not measured in a browser** — same constraint as every turn before
this one. Worked example in the `FLOW_VEL_MULT`/`DRAG` comments: at the new
constants, a default-flowStrength pawn push should reach `SLIDE_THRESHOLD`
(0.55) at roughly tick 240 (~4s), and a max-flowStrength push at roughly
tick 100 (~1.7s) — both comfortably slower than "blink and miss" (which
would be single-digit ticks), and neither instant nor sluggish by
construction of the math, but **this is arithmetic, not a screen**. Running
`headless-test.mjs` (now defaulting to 600 ticks and a DRAG sweep centred on
the new 0.05, both updated to match) is the next agent's first move if this
still doesn't feel right.

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

1. **Run `headless-test.mjs` and read the new `slides=` column, against
   RESTORE=0.995/DRAG=0.05/FLOW_VEL_MULT=0.09 — this turn's numbers, still
   completely unrun.** Same load-bearing unknown as every turn before this
   one, now three constants deep: does a normal move at default
   `flowStrength` now produce a slide at all (the whole point of doubling
   `FLOW_VEL_MULT`), does it take a plausible number of ticks to get there
   (the worked example in the `DRAG` comment predicts ~240 ticks / ~4s), and
   does the *no-slide* case (immune square) actually stay put across a long
   run rather than leaking through some path that doesn't check
   `lastMovedSq`. If `slides` is still 0 at the default flow setting, the
   potency fix wasn't enough and `FLOW_VEL_MULT` needs another pass. If a
   single move still produces a long cascade, `SLIDE_THRESHOLD` is too low
   relative to how much the field decays, or viscosity needs to damp faster.
   If it now feels sluggish rather than deliberate, `RESTORE` overshot —
   dial back the exponent (RESTORE^(1/k) for k somewhat less than 10) rather
   than guessing a new number from scratch.
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
7. **Vector field tuning is un-run, and now stale against a THIRD set of
   RESTORE/DRAG values.** `FIELD_REFSPEED` (0.01) and `FIELD_EPS` (0.0005)
   were picked against the streamline code two turns ago and never
   revisited. `FLOW_VEL_MULT` doubling this turn means the underlying field
   itself carries more energy at a given `flowStrength` than when those two
   were picked — the arrows may now read as busier/whiter than intended even
   though nothing about the vector-field code changed. If the board looks
   bare after a move, lower `FIELD_REFSPEED` or `FIELD_EPS`; if it's a solid
   wall of white arrows, raise them.
8. Tap targets are ~42px at 360px viewport width, just under the 44px
   guideline. Untouched.
9. **`lastMovedSq` immunity is scoped to exactly one square at a time.** If
   a future turn wants captures, en passant, or castling, check whether
   those need their own immunity handling (a captured square's old occupant
   obviously doesn't need it, but a castling rook landing at the same time
   as the king would — right now only one square can be immune, whichever
   `doMove()` sets last).

## Gotchas

- **`headless-test.mjs` and `index.html`'s solver/physics are two copies of
  the same code, not one shared module.** `resolveFlowSlides()`,
  `RESTORE`/`DRAG`, `FLOW_VEL_MULT`, and now `lastMovedSq`-style immunity
  (mirrored inline in `runScenario()` since the test rig only ever plays one
  move, so there's no second `doMove()` to reassign it away) have all been
  mirrored across both files at some point. The rendering change
  (streamlines → vector field, an earlier turn) was NOT mirrored, and
  doesn't need to be: `headless-test.mjs` never draws anything, it only
  measures the solver and the board array. Keep that split in mind — physics
  constants need mirroring, rendering constants don't.
- **This build agent has no Bash, no WebFetch, no WebSearch, and no browser** —
  a permanent constraint of this tenant's build role, not a one-off gap, and
  true again this turn: the ~10x slower RESTORE/DRAG, the doubled
  `FLOW_VEL_MULT`, and the `lastMovedSq` immunity have never been seen
  moving. The harness's post-build screenshot will show a single frame —
  whether the moved piece and the board otherwise look sane — but not
  whether a neighbour's drag now visibly takes ~4 seconds to build, or
  whether the immune piece actually looks "pinned" rather than just
  coincidentally still. Only `headless-test.mjs`, run by a human or a
  differently-privileged agent, or an actual browser, can confirm either.
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

## Post-build screenshot check

This session had no screenshot tool and never saw one — the entries below
were written by earlier turns that apparently did. This turn's changes
(speed, `lastMovedSq` immunity, `FLOW_VEL_MULT`) ship unverified by any
image; whatever the harness's own post-build pass finds is the first look
anyone gets. Left as-is below for whoever reads this next.

### Turn before this one (vector-field rewrite)

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

### Superseded note (older turn still, before the rendering rewrite)

Left for the record only — described the old streamline renderer, which no
longer exists.

1200×800 static screenshot under production CSP: title, description, "White
to move" label, and a correctly laid out 8×8 starting position all rendered —
legible glyphs, no overlap, no off-screen content, no blank canvas. Nothing
visibly broken, so nothing was changed. A static image can't show whether
`resolveFlowSlides()` actually fires or feels right over time — that's still
only checkable by running `headless-test.mjs`, per the Gotchas above.
