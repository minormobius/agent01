# BRIEF — others-induce (Honeyflow Chess)

## What this is

A Bluesky thread asked (via minormobius, replying to a "liquid chess" pitch
aimed at @buildthis.bisks.net) for a chess board made of honey where every
move induces a laminar flow impulse scaled to the distance moved, keeping
the grid and overlaying streamlines. This turn built exactly that as a
single-page site: a playable two-player chess board (standard piece-movement
shapes, no check/checkmate/castling/en-passant) sitting on top of a real
grid-based stable-fluids solver (Stam/Mike Ash formulation — semi-Lagrangian
advection, Gauss-Seidel diffusion, a pressure-projection step for
incompressibility). Each move injects a directional velocity+dye impulse
along the path from source square to destination square, magnitude
proportional to move distance in board units (a king's-move ~1, a full rook
sweep ~7). Streamlines are recomputed periodically by integrating the live
velocity field from a grid of seed points and drawn over the board on top of
the honey-dye glow. It ships fully working end to end — this is not a
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

## The plan (not built yet, roughly in order)

1. **Untested in a real browser — the solver's boundary/indexing math is
   copied carefully from the well-known Stam/Mike-Ash reference algorithm
   from memory, but there was no way to run it here.** If the board loads
   with no flow at all, or with an exploding/NaN-filled mess, start by
   checking `IX`, the `advect` clamp bounds (`0.5` / `N-1.5`), and the
   `linSolve` boundary pass — those are the three spots a stable-fluids port
   most commonly gets subtly wrong.
2. **PDS persistence.** `store.save('board', {board, turn})` on every move,
   `store.load('board')` on page load with a "resume game" prompt if a save
   exists. Low risk, kit does the hard part.
3. **Check detection**, if a future turn wants "real" chess rather than
   movement-shapes-only — this is the actual hard part deferred here: a
   `wouldBeInCheck(afterMove)` filter on `movesFor()`'s output, which needs
   a `kingPos` tracker and an "is square attacked by color X" helper reusing
   the same move-generation logic in reverse.
4. **Piece-weight scaling.** Right now impulse magnitude is purely distance
   — a one-square king move and a one-square pawn push are identical. Could
   scale by captured-piece value or moving-piece value too, if that reads
   as more "physical." Not requested explicitly; a plausible follow-up.
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
  chess row/col directly into the fluid arrays.
- `computeStreamlines()` is deliberately not run every frame (every 8
  frames, or 24 under `prefers-reduced-motion`) — a guess to keep cost down
  and avoid line-jitter, not something confirmed by eye (no browser here).
  If streamlines look sluggish to update after a move, or too jittery, that
  interval is the first knob to turn, not the solver itself.
