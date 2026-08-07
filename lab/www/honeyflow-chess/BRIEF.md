# BRIEF — others-induce (Honeyflow Chess)

## What this is

A Bluesky thread asked for a chess board made of honey where every move
induces a laminar flow impulse scaled to distance moved, keeping the grid and
overlaying streamlines, with neighbouring pieces actually solved into the
flow rather than faked. Earlier turns built exactly that: a playable
two-player board (movement-shape rules, no check/checkmate/castling) over a
real grid-based stable-fluids solver (Stam/Mike Ash — semi-Lagrangian
advection, Gauss-Seidel diffusion, pressure projection), with occupied
squares sampling the same solved velocity field each frame and dragging
along it, tethered back to their home square. The turn before this one added
`headless-test.mjs` (a standalone Node rig to measure the neighbour-drag
effect) and raised several constants by reasoning, never able to run it.

**This turn's request, verbatim: "Mm my pieces aren't moving their neighbors
at all. Bugged? Or weak. The plan is to have flow field extend out far
enough to impact other pieces materially. You might be thinking of chess
piece sized chess pieces but the physics will work better if you think of
them like 1um scale pieces."** Worked through the actual numbers rather than
just raising a constant again (see Decisions): the old injection wrote
velocity into exactly **one** grid cell per point along the moved piece's
path, and relied on the solver's diffusion to leak that disturbance sideways
over many frames to reach a neighbouring square's cell. Worked through the
diffusion coefficients that ship, what arrives there lands well under 10% of
a board-square's worth of visible offset — structurally too weak to read as
anything. "Not moving at all" was an accurate report, not a misreading.

**Shipped: replaced the single-cell injection with a wide splat kernel.**
`Fluid.prototype.splatVelocity`/`splatDensity` (index.html, mirrored
byte-for-byte in headless-test.mjs) spread each injection over a disc of
`SPREAD_RADIUS = 14` sim cells (~2.3 board squares) with a cone falloff
(`1 - r/radius`), so an adjacent square gets ~57% of peak strength
**directly, on the first tick**, instead of waiting on diffusion to leak an
ever-more-dilute signal there. This is the "1um scale" physics the requester
pointed at, made concrete: at low Reynolds number a disturbance is
viscosity-dominated and reaches much further than an inertial/local wake
would, so representing a piece's push as a wide, slowly-decaying footprint
(a regularized point-force — the standard way to model a finite-size
disturbance in Stokes flow, e.g. Cortez's regularized-Stokeslet method) is
the honest way to get that reach, not a faked wobble layered on top. The
solver still solves the resulting field; only the shape of the forcing
changed. Because the kernel now covers ~600 cells per splat instead of one,
and adjacent squares now sit well inside it, the per-splat multipliers were
cut hard (velocity 0.13→0.045, density 4.2→3.0) to avoid every neighbour
instantly slamming into `MAX_OFFSET` on the first tick after any move — see
Gotchas, this is the number most likely to need retuning next.

## Decisions

- **A wide splat kernel, not a bigger single-cell number.** The previous
  turn's failure mode was raising `DRAG`/multipliers on an injection that
  geometrically never reached the neighbour in any material amount — no
  constant increase on that shape fixes a reach problem. This turn changed
  *where* the momentum lands, not just how much of it there is, because that
  is what the request actually diagnosed ("flow field extend out far
  enough").
- **Cone falloff (`1 - r/radius`), not Gaussian or 1/r.** A plain linear
  taper is the simplest kernel that (a) is exactly zero at the boundary, so
  there's no discontinuity to hide, and (b) is cheap — no `exp` or division
  per cell, just a subtraction, run over up to a few hundred cells per splat.
  A true Stokeslet decays like 1/r with no cutoff at all; that's physically
  purer but was rejected because an uncapped tail would touch the whole
  board on every move, which is the opposite of "impact other pieces" (it
  should read as local-but-wide, not global).
- **Fewer, wider splats along the path, not more of them.** The old code put
  a point roughly every 1/6 of a sim-unit of travel; with a radius-14 kernel
  that badly oversamples — consecutive splats would overlap almost
  entirely. Spacing points at ~70% of the radius keeps the path covered
  without wasteful redundant accumulation. A short move (king, one square)
  now injects from just 2 points instead of a dozen-plus.
- **Multipliers cut by roughly 3× on velocity, more lightly on density.**
  This is the actual guess in this turn's change, flagged honestly: the
  reasoning is "a neighbour square at the kernel's characteristic distance
  now receives order-of-magnitude more velocity than before, so cut the
  input enough that it doesn't reach `MAX_OFFSET` in a single tick" — but
  the exact right number needs `headless-test.mjs` run against the new
  kernel, which this sandbox still can't do. Density got a lighter cut
  because it only feeds the visual glow (no clamp to slam into) and the
  previous turn's "more dramatic streamlines" ask is still the live
  request there too.
- **`DRAG` (1.0) and `RESTORE`/`MAX_OFFSET` were left untouched.** Retuning
  two unmeasured things at once (the kernel's reach *and* the drag response)
  makes the next sweep harder to read — better to isolate what changed this
  turn and let the tester (once someone can run it) tell you whether `DRAG`
  also needs to move, and in which direction.
- No other behaviour changed this turn — chess rules, PDS persistence, and
  most of the previous turn's plan are exactly where it was left.

## The plan (not built yet, roughly in order)

1. **Run `headless-test.mjs`'s sweep against the new kernel and retune from
   real numbers.** This is more load-bearing than it was last turn — the
   injection's whole geometry changed, so the previous sweep's numbers (for
   the old single-cell version) no longer describe what ships. If the sweep
   shows every neighbour pinned to `MAX_OFFSET` even at the lowest `DRAG`,
   cut the velocity multiplier (0.045) further before touching `DRAG`. If
   it's still too weak, raise `DRAG` first — it's cheap and safe (clamped
   every tick regardless of size, see the comment above its definition).
2. **Consider whether `SPREAD_RADIUS=14` is the right reach.** It was picked
   to comfortably cover one square and taper out by two to three; nothing
   here measures whether that *feels* like the right footprint versus, say,
   reaching a full three squares. Easy to retune — it's one constant, mirror
   it in both files.
3. **PDS persistence.** `store.save('board', {board, turn})` on every move,
   `store.load('board')` on page load with a "resume game" prompt. Low risk,
   kit does the hard part. Still untouched.
4. **Check detection**, if a future turn wants "real" chess — the actual
   hard part: a `wouldBeInCheck` filter on `movesFor()`'s output, needing a
   king tracker and an "is square attacked" helper reusing the move-gen
   logic in reverse.
5. **Piece-weight scaling of the injected impulse itself** (not just drag
   resistance) — `PIECE_MASS` exists and could scale `injectFlow()`'s `base`
   too, so a queen sweep feels heavier than a pawn push of the same
   distance. Not requested explicitly.
6. **Knight leap / impact ripple**, floated earlier in the thread ("knights
   could leap instead of swim and generate repulsive ripple on impact") but
   not part of this turn's request — a knight currently injects flow along
   the straight line between its start and end squares like every other
   piece, which doesn't read as a leap. Would need a distinct L-shaped or
   impact-only injection path for knights specifically.
7. Tap targets are ~42px at 360px viewport width, just under the 44px
   guideline. Consider letting the board go edge-to-edge on narrow
   viewports if this comes up.

## Gotchas

- **`headless-test.mjs` and `index.html`'s solver are two copies of the same
  code, not one shared module.** If you change the solver, `injectFlow`,
  `splatVelocity`/`splatDensity`, or `updatePiecePhysics` in `index.html`,
  mirror the change in `headless-test.mjs` or the tester silently starts
  measuring a different simulation than the one that ships. Both were kept
  in sync this turn — verify that's still true before trusting a sweep.
- **This build agent has no Bash, no WebFetch, no WebSearch, and no way to
  execute `headless-test.mjs` or load `index.html` in a browser.** That's a
  permanent constraint of this tenant's build role (`lab/www/CLAUDE.md`),
  not a one-off gap — don't assume a future turn can run it either unless
  something about the harness changes. The tester's value is for a human
  running it locally, or a differently-privileged agent.
- **The velocity multiplier (0.045) is a guess with real risk in both
  directions**, unlike last turn's `DRAG` change which had a structural
  safety net (`MAX_OFFSET` clamps regardless of size). Too high and every
  move looks like it slams neighbours to the clamp instantly — a binary
  snap, not a graduated flow. Too low and this turn's whole fix reads as
  "still nothing." There's no clamp protecting the *feel* here the way there
  is for the offset itself, which is exactly why this is flagged as the
  first thing to verify against `headless-test.mjs` rather than trusted on
  read-through.
- The two fluid grids (48×48 sim vs 8×8 chess) are **not** the same
  coordinate space anywhere in the code — every touchpoint converts board
  coords (0..8) to sim coords (1..N-2) explicitly. `offsetGrid` is the one
  array already in chess coords; don't add a second conversion on top of it.
- `computeStreamlines()` runs every 5 frames, with denser seeds (13×13) and
  longer traces (10 steps) than the original build — untouched this turn.
  Now that the velocity field itself carries wide, overlapping splats rather
  than thin single-cell spikes, the streamlines may render visibly
  different (broader, smoother strands) even though the renderer's own code
  didn't change — worth a look if a future turn has a browser.
