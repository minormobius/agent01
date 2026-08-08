# BRIEF — Stokes Chess (start-over)

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
