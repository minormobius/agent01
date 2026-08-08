# BRIEF — Stokes Chess (start-over)

## Turn 3 — flow strength to 100×, viscosity removed (this turn)

The request this turn was two explicit, literal instructions from the
requester: "Increase default flow strength to 100x. Remove viscosity
altogether (i.e. make it zero or effectively zero)." Both were implemented
directly rather than reasoned about — this is not the moment to second-guess
with a gentler default, the person who owns the site asked for the extreme
version and named a number.

- **Flow strength slider**: default raised from `2.5` to `100`, range widened
  from `0.5–6` to `0.5–200` (step `0.5`, was `0.25`) so 100 sits comfortably
  inside the range rather than at a clipped edge. `STORM_BASE` and `FLOW_BASE`
  themselves are untouched — both formulas already scale linearly off the
  slider's raw value (`storm = STORM_BASE * (v / 2.5)`, `mag = FLOW_BASE * v *
  dist`), so raising the *value* the slider defaults to was enough; at 100 the
  storm amplitude is ~3.2 (was 0.08) and a one-square move's splat magnitude
  is ~85 (was ~2.1) — both roughly 40× turn 2's defaults, not literally 100×
  turn 2's, because "100×" describes the slider's own displayed units, not a
  multiplier on the old default. Said plainly in case that reads as a
  discrepancy: it isn't one, it's what "set flow strength to 100×" means once
  you take the UI's own label literally.
- **Viscosity removed, not just zeroed via the slider.** Deleted the
  "Viscosity (thickness)" control, its label, its `viscLabels` array
  (water/oil/honey/tar) and its input listener entirely, and hardcoded
  `params.visc = 0` at the solver's parameter object. A slider that always
  reads zero would have been a dead control left on the page for no reason;
  removing it is the more honest UI once there's nothing left to adjust.
  `visc = 0` makes `diffuse()`'s Jacobi solve degenerate to `a = 0, c = 1`,
  i.e. an identity copy each iteration — confirmed by reading the algebra, not
  by running it (still no browser). No divide-by-zero risk (`cRecip = 1/1`).
- Updated the lede, reveal panel, footer and `og:description` to describe
  viscosity as off and flow strength as defaulting to 100× rather than
  describing a "thickness" control that no longer exists.

### Decisions

- **Did not recalibrate `STORM_BASE`'s `/ 2.5` divisor to `/ 100`.** Leaving
  it as-is means the same formula that was tuned (on paper) at the old
  default now simply outputs 40× more at the new default — which is exactly
  what "raise the default" should do to a linear scale. Changing the divisor
  too would have silently re-normalized back to roughly the old storm
  strength at the new slider position, defeating the request without
  looking like it did.
- **Did not add a velocity clamp or extra damping to guard against the much
  larger flow.** The system is still linearly damped (the existing 0.999
  per-frame decay in `Fluid.prototype.step`, present since turn 1/2), so it
  cannot diverge to infinity or NaN regardless of injection magnitude — it
  reaches a (much higher) bounded steady state instead. Adding a safety
  clamp nobody asked for, on a turn whose entire point was "make it more
  extreme," would be second-guessing the request. If the screenshot shows
  the board in total chaos rather than dramatic-but-readable motion, that
  may still be correct per the ask — see the next section before damping it
  back down.
- **Did not touch `MAX_OFFSET`, `SLIDE_THRESHOLD`, `RESTORE`, `DRAG`, or the
  0.999 velocity decay.** Same reasoning as turn 2: those are the existing
  safety valves (offset clamp, slide threshold) and the piece-drag tuning,
  none of which the request touched, and all of which now matter *more* at
  100× — they're what stands between "pieces sway dramatically" and "pieces
  teleport every frame in a way that reads as broken rather than stormy."

### What to check first, next turn

This build still has never been seen in a browser (no Bash, no
screenshot tool available to this agent). The single largest open question
left by this turn: **at flow=100 with visc=0, does the board read as
"dramatic storm" or as "unreadable strobing"?** The offset-relaxation gain
math from turn 2 (`off_ss ≈ RESTORE·drag·v / (1−RESTORE)`, ~50–100× gain at
RESTORE=0.99) was already flagged as likely to saturate `SLIDE_THRESHOLD`
almost immediately at *any* nonzero ambient velocity — at 40× the ambient
velocity turn 2 was already worried about, expect near-constant sliding on
lightweight pieces (pawns, mass 1) unless the screenshot says otherwise. If
the harness screenshot shows every piece flickering between squares every
frame rather than swaying-with-occasional-slides, the fix is almost
certainly a *separate*, much gentler gain for how offset responds to
ambient/storm-sourced velocity vs. move-sourced velocity — not turning flow
strength back down, which would undo this turn's actual request.

## Turn 2 — ambient storm forcing

The request this turn was explicit: "give every cell a constant flow as
though fluid is being pumped into and draining out of the system — the
pieces should be constantly moving around like ships on the ocean during a
storm." Turn 1 (below) only moved fluid in response to a drag or a piece
move; left alone, the board went dead still. This turn adds a permanent
forcing term so it never does:

- Six fixed vent points on a ring around the board's centre, alternating
  pump (positive `addVelocity`/`addDensity`) and drain (`addVelocity`
  pointing outward-turned-180°, `addDensity` negative — see the new clamp on
  `Fluid.addDensity`, which now floors density at 0 so a drain empties a
  spot rather than driving it negative). Each vent's strength and angle
  wobble on a **sum of two out-of-phase sines with a per-vent phase
  offset**, not one clean sine, so the six of them never pulse in sync and
  the pattern doesn't read as a metronome.
- Called once per frame from `loop()`, before `fluid.step()`, so it's
  subject to the same pause / `prefers-reduced-motion` gate as everything
  else — reduced-motion visitors still get a still board by default.
- Wired to the existing "Flow strength" slider (now relabelled "storm &
  moves") rather than adding a new, unlabelled constant — `STORM_BASE`
  (0.08) is the base amplitude at the slider's default of 2.5×, scaled
  linearly with it. One slider now controls both how hard a move pushes and
  how strong the permanent storm is.
- Copy updated throughout (lede, slider label, reveal panel, footer,
  og:description) to describe the storm rather than just drag-to-stir.

### Decisions

- **Diffusion carries the forcing to every cell; nothing forces each cell
  directly.** "Give every cell a constant flow" reads two ways — literally
  (inject noise at all 46×46 interior cells) or as the emergent result of a
  few real sources/sinks spreading through the solver's own diffuse/project
  steps. Went with the second: it's what an actual pump/drain system looks
  like (a handful of vents, not uniform noise everywhere), it's what "pumped
  in and drained out" describes literally, and per-cell independent noise
  would mostly cancel under the incompressible projection anyway rather than
  reading as directional current.
- **Six vents, ring layout, alternating pump/drain.** Enough points that the
  whole 8×8 board sees some current without one vent's local field dominating
  a whole quadrant; a ring rather than edges/corners so no vent sits on a
  board edge where `setBnd` reflection would fight it.
- **Did not touch `RESTORE`/`DRAG`/the global 0.999 velocity decay.** Those
  were already tuned (unverified, but tuned) for how a piece answers a
  *drag* or a *move*-splat; changing them to accommodate the new ambient
  term would un-tune that as much as tune this. Instead the new term's own
  amplitude (`STORM_BASE`) is the only new knob, kept deliberately small —
  see the gotcha below for why it has to be.

## Turn 1 — original build

## What this is

A Bluesky thread asked for "liquid chess," a previous build agent iterated it
for several turns as a sibling site (`lab/www/honeyflow-chess/`), and the
requester (ezba.bsky.social) then asked to **start over**: build a fluid
dynamics simulator first, then add chess pieces on top. This is a fresh
directory and a fresh implementation, not a fork of honeyflow-chess — though
I read honeyflow's BRIEF.md closely before writing anything, because it
documents several already-learned lessons (see Decisions).

Shipped this turn, all in one `index.html`:

- A real grid-based fluid solver (48×48 interior cells, Jos Stam's
  stable-fluids method: diffuse → project → advect → project, 4 Jacobi
  iterations per linear solve) that works completely on its own — drag
  anywhere on the board and it stirs, independent of any chess piece. This
  was the point of "start over": prove the simulator first, not the game.
- A live vector-field quiver plot (one directly-sampled arrow per grid point
  on a 12×12 overlay) plus a dye-density render, both recomputed every frame.
- A full 8×8 chess set standing in the fluid. Every occupied square samples
  the local velocity each frame and relaxes toward it with NO inertia term
  (overdamped/Stokes-drag model — the physically correct one for the "1um
  scale pieces" framing the original thread asked for), tethered back to its
  home square. Drag a piece past a threshold on its dominant axis and it
  actually changes squares — blocked, not captured, if the destination is
  occupied.
- Moving a piece injects a directional flow splat scaled to distance moved.
  The piece that just moved is immune to its own wake (pinned at offset
  zero) until the next move reassigns which square is immune.
- Movement-shape-only chess (no check/checkmate/castling/en passant), pawns
  auto-promote to queen, and capturing a king ends the game with a banner.
- A "How this works" reveal panel (kept collapsed by default) with the
  actual relaxation formula — this requester has repeatedly asked for
  mechanism explained as an opt-in toggle rather than always-on text, see
  `lab/_profiles/ezba.bsky.social.md`.
- Pause button (also the default when `prefers-reduced-motion` is set),
  reset button, flow-strength and viscosity sliders.

## Decisions

- **New directory, new solver code, not a fork.** The task explicitly said
  "start over," and honeyflow-chess already exists at its own URL for anyone
  who wants that version. Writing my own solver from the standard published
  algorithm (not copying honeyflow's file) also meant I could size the grid
  and the injection/relaxation constants for what THIS page's canvas and
  interaction actually produce, rather than inheriting numbers tuned against
  a different implementation's velocity scale.
- **Reused the qualitative lessons from honeyflow's BRIEF, not its numbers.**
  Three things carried over because they're solver-agnostic: (1) a piece's
  offset relaxation needs NO inertia term and a multi-second settle time, or
  a move reads as "blink and you miss it" — confirmed by an actual complaint
  in the thread; (2) the piece that induces a flow must be immune to it and
  always land exactly on its target; (3) plot the vector field as a discrete
  quiver (arrows, direct samples, no path integration) rather than traced
  "fwoof" streamlines — a request in the thread named this exact failure
  mode by name. I did NOT reuse honeyflow's actual RESTORE/DRAG/FLOW
  constants, because my solver's velocity magnitudes come from a different
  set of diffuse/project/advect calls and a different injection kernel; the
  settle-time formula (`~1/(1-RESTORE)` ticks) is what transfers, not the
  number itself.
- **Drag-to-stir and tap-to-move share one pointer listener on the pieces
  overlay**, with a movement-distance threshold (6px) deciding which one a
  gesture was. This is the trickiest bit of code on the page — see Gotchas.
- **Kings can be captured and end the game.** No check/checkmate logic
  exists (matches honeyflow's own scope decision, which reasoned it would be
  a much bigger, unrequested change), but leaving captured kings on the
  board with the game still "in progress" felt more broken than adding one
  cheap win condition.
- **Mass affects a piece's resistance to being dragged, not the size of the
  wake it induces when it moves.** A queen resists the current more once
  it's sitting still; the flow it releases when it moves is NOT divided by
  its own mass. Physically the opposite framing (heavier objects displace
  more fluid) is at least as defensible — this was a judgment call, not a
  derivation, and cheap to flip in `doMove()` if it reads wrong.

## The plan (not built yet, roughly in order)

0. **The ambient storm (Turn 2) has never been seen moving either**, and the
   offset-relaxation gain analysis below suggests it may be too aggressive:
   at steady state `off_ss ≈ RESTORE·drag·v / (1 − RESTORE)`, which with
   RESTORE=0.99 is a **~50–100× gain** — meaning almost any nonzero sampled
   velocity `v` (order 0.01) pushes a piece's offset straight past
   `SLIDE_THRESHOLD` (0.5). Turn 1's board was stable at rest only because
   `v` was *exactly* zero everywhere between drags. Now it never is. If the
   next screenshot shows the whole board in permanent chaos (every piece
   sliding every tick) rather than swaying-with-occasional-drift, the fix is
   almost certainly to lower `STORM_BASE` further (it's already been cut
   from an initial 0.11 to 0.08 on paper reasoning alone, no measurement)
   — or, better, to give the relaxation its own separate, gentler gain for
   ambient-sourced velocity vs. drag/move-sourced velocity, since right now
   both go through the same `off = RESTORE·off + RESTORE·drag·v` line and
   there's no way to make the storm merely *sway* pieces without also making
   deliberate drags feel weaker.
1. **This has never been seen moving.** No browser, no screenshot tool in
   this session — only the harness's post-build pass will show a single
   frame. The physics constants (RESTORE=0.99, DRAG=0.7, SLIDE_THRESHOLD=0.5,
   FLOW_BASE=0.85, viscosity slider mapping) are reasoned from the
   relaxation's settle-time math, not measured. If pieces look frozen, raise
   FLOW_BASE or lower viscosity's slider mapping (`0.00004*v*v`) first — that
   quadratic in `v` was picked so "water" (v=1) and "tar" (v=10) feel
   different, not verified against the solver's actual iteration count.
2. **Knight leap + impact ripple**, floated early in the thread and not
   built: a knight's move should skip the drag-through-the-fluid feel
   entirely (it "leaps") and instead fire an isotropic ring-shaped impulse
   outward from its landing square, distinct from the directional splat
   every other piece leaves. Needs a second injection shape in the fluid
   layer, not just a different `mag`.
3. **PDS persistence** (`store.save('board', {board, turn})` /
   `store.load('board')`), so a game survives a reload. Not started — this
   page has zero Bluesky/auth code right now, which is fine per the
   profile's "pure-concept pages are comfortable" note, but multiplayer
   or resume-later would need it.
4. **A per-move log**, since flow-triggered slides change `board[][]`
   outside of `doMove()` with no notation recorded — same gap honeyflow
   flagged in its own Gotchas. Right now a slide is only visible by looking
   at the board, not in any status text.
5. **Tune the vector-field visibility thresholds** (`speed/0.03` in
   `drawVectorField`) once real velocity magnitudes are known from a
   browser — picked by guessing what "a few percent of a grid cell per tick"
   looks like in this solver's units, same class of unmeasured constant as
   everything above.

## Gotchas

- **The pointer-capture / click interaction is fragile and already had one
  bug fixed before shipping:** calling `setPointerCapture` on the pieces
  overlay during `pointerdown` retargets the subsequent synthetic `click`
  event to the capturing element too, in at least some engines — which
  silently breaks every tap-to-select on the board, because
  `ev.target.closest('.sq')` then resolves against the overlay div itself,
  not the tapped square. Fixed by releasing capture inside the `pointerup`
  handler before `click` fires, plus an `elementFromPoint` fallback in the
  click handler. If squares ever stop responding to taps after touching this
  code, look here first.
- **The offset-to-CSS-transform scale is approximate.** The visual sway is
  `translate(x%, y%)` on the glyph `<span>`, which sizes the percentage
  against the span's own (font-sized) box, not the square's box — so "34% of
  offset" is not literally 34% of a square's width. It happens to be roughly
  the right order of magnitude because font-size and square size both scale
  with viewport width, but it was never derived to match exactly.
- **`headless-test.mjs`-style solver verification does not exist for this
  file.** honeyflow-chess has one; this page does not, because time this
  turn went into a from-scratch solver plus the interaction-capture bug
  above. A next turn that wants confidence in the constants should probably
  write one — extract `Fluid`, `stepPiecePhysics`, and `doMove` well enough
  to run headless the way honeyflow's does.
- **Two pieces whose offsets point at each other's square in the same tick
  neither move** (both pre-tick snapshots see the other square as occupied).
  Same known quirk as honeyflow, reads as the flow failing to swap them
  rather than as a bug, but worth knowing if it looks odd while testing.
- **`Fluid.addDensity` now clamps at zero** (it used to let `dens` go
  negative with no visible effect other than making the rendered colour
  slightly *darker* than the background, since the render math never
  clamped the low end either). The vent drains rely on this clamp to read as
  "the dye empties out here" rather than "this cell goes into dye debt and
  looks faintly wrong forever." If you add another negative-density caller,
  this clamp now applies to it too — check that's what you want.
- **The offset-relaxation gain is roughly 50–100× at steady state** (see The
  Plan, item 0) — this was derived on paper this turn, not discovered by
  testing, and is the single most important number to sanity-check once a
  screenshot exists. It's why `STORM_BASE` is as small as 0.08 while a
  drag-stir's per-frame velocity add can be several units: the two aren't
  meant to be comparable in raw magnitude, only in how they read once run
  through that gain.
