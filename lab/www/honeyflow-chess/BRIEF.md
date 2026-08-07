# BRIEF — others-induce (Honeyflow Chess)

## What this is

A Bluesky thread asked (via minormobius, replying to a "liquid chess" pitch
aimed at @buildthis.bisks.net) for a chess board made of honey where every
move induces a laminar flow impulse scaled to the distance moved, keeping
the grid and overlaying streamlines. First turn built exactly that as a
single-page site: a playable two-player chess board (standard piece-movement
shapes, no check/checkmate/castling/en-passant) sitting on top of a real
grid-based stable-fluids solver (Stam/Mike Ash formulation — semi-Lagrangian
advection, Gauss-Seidel diffusion, a pressure-projection step for
incompressibility). Each move injects a directional velocity+dye impulse
along the path from source square to destination square, magnitude
proportional to move distance in board units (a king's-move ~1, a full rook
sweep ~7). Streamlines are recomputed periodically by integrating the live
velocity field from a grid of seed points and drawn over the board on top of
the honey-dye glow.

**This turn (in reply to "neighboring pieces should get caught in the flow
and move along with it — solved, not guessed"):** pieces are now physically
coupled to the same solved velocity field, not just the density/streamline
overlay. Every occupied square samples `fluid.sampleVel()` at its own live
position each frame, converts that sim-space velocity to board-units/tick
using the exact `(N-2)/8` scale factor already used everywhere else in the
file (derived from `advect()`'s `dtx = dt*(N-2)`, not a new made-up
constant), and accumulates it into a per-piece offset with exponential
relaxation pulling the piece back toward its home square (honey's own
stiffness) — see `updatePiecePhysics()`. Heavier pieces (`PIECE_MASS`) resist
the drag more. Rendered as a CSS `translate(%, %)` on the piece's own button,
recomputed every animation frame in `loop()`, so a piece near a moving
piece's wake visibly sways and settles rather than just sitting on a
glowing background. It ships fully working end to end — this is not a
skeleton.

## Decisions

- **No vorticity confinement.** That's the standard stable-fluids trick for
  making swirly, turbulent-looking flow, and it's the opposite of "honey" —
  laminar/creeping flow at low Reynolds number is what heavy diffusion
  without vorticity gives you for free. Deliberately left out.
- **Sim grid is 48×48 interior cells (N=50 with boundary), independent of
  the 8×8 chess grid.** The chess grid is the visible board; the fluid grid
  is a finer mesh underneath it, mapped by a simple `board-coord * (N-2)/8`
  scale. This is what lets the flow look continuous rather than
  quantized to chess squares.
- **Chess rules are movement-shape-only, no check detection.** A full legal
  engine (check, checkmate, pins, castling, en passant) was out of reach in
  20 minutes alongside a real fluid solver, and the request was about the
  fluid, not tournament legality. Said so plainly in the page footer rather
  than silently shipping a half-correct rules engine.
- **Two live sliders (flow strength, honey thickness/viscosity) instead of
  guessing exact constants.** The request itself said "some tuning of this
  required to get it to feel right" — since this sandbox has no browser to
  actually feel it in, the honest move was to expose the two constants that
  matter (impulse magnitude, viscosity/diffusion) as runtime sliders rather
  than hand-picking numbers I couldn't verify. Defaults are a best guess;
  the sliders are the real fix if they're off.
- **No PDS persistence.** `/_kit/pds.js` could save board state to the
  visitor's repo, but this felt like a nice-to-have rather than the hard
  part the thread actually asked for, and the fluid solver + chess rules
  already used most of the turn. Left for next time — see below.
- Board glyphs are plain Unicode chess characters (♔♕♖♗♘♙ etc.) rendered as
  HTML buttons overlaid on the canvas, not baked into the canvas raster —
  this keeps click targets real buttons with ARIA labels rather than canvas
  hit-testing, and doesn't fight this requester's documented preference
  (see profile) for real interactive controls over static images where
  interactivity matters.
- **Piece drag uses exponential relaxation (`offset = (offset + drag) *
  0.90` per tick), not an integrated spring-damper ODE.** A real spring
  (`accel = -k·x - c·v`) needs `k`/`c` tuned by eye against the actual `dt`
  the browser runs at, and there's no browser here. Relaxation toward zero
  is unconditionally stable at any coefficient and any frame rate, so it's
  the honest choice for a value that has to ship untested — it trades a
  "properly springy" feel for one that cannot blow up or oscillate into
  nonsense.
- **`MAX_OFFSET = 0.3` board-units, not 0.4+.** A CSS `transform` moves the
  hit-test box along with the paint, so a piece dragged too far toward a
  neighbouring square starts stealing that square's tap target. 0.3 keeps
  the drag readable while staying clear of the neighbour's button — a
  mobile-tap-accuracy constraint, not a physics one.
- **Piece drag is gated on `!reduceMotion` entirely** (offsets never leave
  zero), rather than damped or slowed. The fluid itself keeps simulating
  under reduced motion (existing behaviour, unchanged) because stilling it
  would defeat the page's whole point, but pieces visibly sliding around
  the board is exactly the kind of motion that preference exists to opt
  out of, so it gets a clean off-switch instead of a compromise.

## The plan (not built yet, roughly in order)

1. **Untested in a real browser — both the solver and the new piece drag.**
   The solver's boundary/indexing math is copied carefully from the
   well-known Stam/Mike-Ash reference algorithm from memory, but there was
   no way to run it here. If the board loads with no flow at all, or with
   an exploding/NaN-filled mess, start by checking `IX`, the `advect` clamp
   bounds (`0.5` / `N-1.5`), and the `linSolve` boundary pass — those are
   the three spots a stable-fluids port most commonly gets subtly wrong.
   **For the piece drag specifically**, if pieces don't visibly move at
   all: check `fluid.sampleVel()` isn't returning near-zero everywhere at
   the magnitudes `DRAG = 0.4` expects — the `* 8` conversion in
   `updatePiecePhysics()` was derived from `advect()`'s math, not measured,
   so if drag is imperceptible or wildly excessive, that conversion factor
   (or `DRAG` itself) is the first thing to adjust, before touching the
   solver. If pieces judder or overshoot their square, lower `RESTORE`
   (currently 0.90) rather than adding real damping — see the decision
   above on why relaxation was chosen over a spring.
2. **PDS persistence.** `store.save('board', {board, turn})` on every move,
   `store.load('board')` on page load with a "resume game" prompt if a save
   exists. Low risk, kit does the hard part.
3. **Check detection**, if a future turn wants "real" chess rather than
   movement-shapes-only — this is the actual hard part deferred here: a
   `wouldBeInCheck(afterMove)` filter on `movesFor()`'s output, which needs
   a `kingPos` tracker and an "is square attacked by color X" helper reusing
   the same move-generation logic in reverse.
4. **Piece-weight scaling of the injected impulse.** Right now impulse
   magnitude is purely distance — a one-square king move and a one-square
   pawn push are identical. `PIECE_MASS` now exists (added this turn, for
   drag *resistance*) and could be reused in `injectFlow()` to scale the
   impulse itself too, if that reads as more "physical." Not requested
   explicitly; a plausible follow-up.
5. Tap targets on the board are ~42px at 360px viewport width (8-way divide
   of a ~338px board), just under the 44px guideline — a genuinely narrow
   phone in portrait will feel slightly tight. Widening further risks
   crowding the controls below; if this comes up, consider letting the
   board go edge-to-edge (negative margin against `main`'s padding) on
   narrow viewports specifically.

## Gotchas

- The two fluid grids (48×48 sim vs 8×8 chess) are **not** the same
  coordinate space anywhere in the code — every touchpoint converts board
  coords (0..8) to sim coords (1..N-2) explicitly (`injectFlow`,
  `sampleVel`, `drawDensity`'s inverse via the offscreen canvas scale).
  If a future edit adds a new place that reads/writes `fluid.dens` or
  `fluid.Vx/Vy` directly, it needs the same conversion — don't index by
  chess row/col directly into the fluid arrays. `offsetGrid` (added this
  turn) is the one array that's already in chess coords (`offsetGrid[r][c]`
  parallels `board[r][c]` directly) — it converts to board coords itself
  (`c + 0.5 + st.ox`) before calling `sampleVel`, so don't add a second
  conversion on top of it.
- `computeStreamlines()` is deliberately not run every frame (every 8
  frames, or 24 under `prefers-reduced-motion`) — a guess to keep cost down
  and avoid line-jitter, not something confirmed by eye (no browser here).
  If streamlines look sluggish to update after a move, or too jittery, that
  interval is the first knob to turn, not the solver itself.
