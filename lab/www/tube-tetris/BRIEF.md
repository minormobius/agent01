# tube-tetris — handoff

## What this is

Tetris wrapped around a 3D cylinder, requested by @minormobius.bsky.social:
"the tetronimos fall on a 3js rendered cylinder, full circles clear, and all
the normal features: see the next dropping block, score presented. For
controls I think mouse manipulates the cylinder in rotate zoom pan, arrow
keys manipulate the blocks."

It shipped complete in one turn — this is a full, playable game, not a
skeleton. Board is 12 columns (wrapping all the way around the tube) by 16
rows. Pieces are the standard 7 tetrominoes, drawn from a 7-bag randomiser
(one of each before any repeat). A "full ring" — every column filled in one
row, which reads visually as a closed circle around the tube — clears and
scores, same scoring curve as classic tetris (100/300/500/800 × level),
level rising every 10 lines and speeding up the drop. Next piece shown in a
small 4×4 HTML preview grid, top right. Score/level/lines HUD top left.
Start/pause/game-over all route through one center panel + button.

Mouse: left-drag orbits the camera around the tube, right-drag or
shift-drag pans the look-at target, wheel zooms — hand-rolled, since
OrbitControls isn't vendored in this kit (`lab/_kit/README.md` says so
explicitly: addons aren't included, write what you need). Keyboard: arrows
move/rotate/soft-drop, space hard-drops, P pauses, R restarts after game
over.

## Decisions

- **No wall kicks on rotation.** A rotate that would collide is simply
  cancelled rather than trying offset positions (SRS kick tables). This is
  the one corner cut for time — it means rotating right up against the
  "seam" where col wraps, or against a stack, sometimes just refuses when a
  human player would expect a kick. Standard tetris behaviour otherwise
  (7-bag, ghost-free, no hold piece).
- **Rows don't wrap, columns do.** Gravity is along the cylinder's axis
  (top to bottom), and "left/right" walks around the circumference with
  modulo wraparound — there's no wall on the sides, which is the whole
  point of doing this on a tube instead of a flat board. This seemed like
  the only sane reading of "tube tetris"; a version where gravity spirals
  around the tube instead would be a much stranger game and wasn't asked
  for.
- **Next-piece preview is a flat HTML grid, not a second 3D scene.** Simpler
  and more reliable than a mini camera/viewport, and it's a small UI detail
  the player glances at, not the point of the game.
- **No touch-specific UI.** Pointer Events are used for the orbit controls
  (not raw mouse events), so single-finger drag-to-orbit already works on
  touch for free, but there's no on-screen d-pad for moving pieces on
  mobile — arrow keys assume a keyboard. If this needs to work well on
  phones, that's the first real gap.

## The plan (not built yet, in order)

1. **Wall kicks on rotation** (see above) — try the classic SRS offset
   table (or even just a couple of simple `[-1,0]`/`[1,0]`/`[0,-1]` nudges)
   before giving up on a rotate, so play feels less sticky near the seam
   and near a tall stack.
2. **On-screen touch controls** for moving/rotating/dropping — a small
   d-pad + rotate/drop buttons overlaid on the HUD — if this needs to be
   playable on a phone without a keyboard. Currently untested on touch
   beyond "camera drag should work via Pointer Events."
3. **Ghost piece** (a dim projection showing where hard-drop would land) —
   nice-to-have, not asked for explicitly but a normal-features expectation
   for "all the normal features."
4. Possibly a **hold piece** slot, same caveat as above.

## Gotchas

- **Box orientation on the cylinder needs `rotation.y = Math.PI/2 - angle`,
  not `-angle`.** three.js's `makeRotationY(θ)` sends local +Z to
  `(sinθ, 0, cosθ)`; to make that align with the radial direction
  `(cos(angle), 0, sin(angle))` at a given column, θ has to be
  `π/2 - angle`. Got this wrong on the first pass (used `-angle`, which
  looks plausible but rotates every block slightly off-radial except at
  angle 0) — worked it out from the rotation matrix rather than guessing;
  worth double-checking in a real browser since I have no way to render
  this sandbox-side.
- **`lab/_kit/README.md` is explicit that OrbitControls isn't vendored** —
  don't waste a turn trying to import it from `/_kit/three/examples/...`,
  it isn't there. The hand-rolled spherical-coordinate controls in this
  file are the whole answer.
- This site touches no Bluesky data at all (no handles, no avatars, no
  feed), so `lab-content-gate.mjs` and the `/_img/` proxy are irrelevant
  here — don't add a handle-typeahead or Bluesky integration unless a
  future request actually asks for one; it isn't part of "tube tetris."
- Entirely untested in an actual browser (no Bash/WebFetch in this
  sandbox) — the geometry math, collision logic, and rotation formula are
  worked out on paper/by hand-tracing, not run. If the harness's browser
  pass reports something, that's the first real signal on whether any of
  this is actually right.
