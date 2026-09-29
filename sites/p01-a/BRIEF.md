# BRIEF — tube-stacker

## What this is

The ask: a falling-block stacking game rendered on a 3D cylinder instead of a
flat well. Full circles ("rings") clear instead of full rows. Mouse orbits/
zooms/pans the camera; arrow keys move and rotate the piece; next-piece preview
and score are shown.

This turn shipped the whole thing as a working single file: a 9-column x
15-row grid wrapped around a cylinder (column index wraps mod 9, so moving off
one edge reappears on the other — this is the one bit of "3D-ness" the game
logic actually needs; everything else is classic falling-block bookkeeping).
Seven piece shapes, simple rotation (no wall-kick table, just a few column
nudges tried in order), gravity that speeds up with level, ring-clear with
scoring, next-piece preview via a small 2D canvas, hand-rolled orbit/zoom/pan
camera controls (no OrbitControls addon — it isn't vendored in the kit), and
on-screen touch buttons for mobile since there's no keyboard there.

## Decisions

- **Game logic is a 2D grid, not real 3D physics.** Cylindrical wrap is just
  `col % SEGMENTS`. This is deliberate: a genuinely 3D board (pieces that can
  also rotate around the tube axis, drift diagonally, etc.) is a much bigger
  design problem and the request read as "Tetris but the well is a tube," not
  "solve 3D packing." If a future turn wants richer 3D piece behavior, that's
  a redesign, not a tweak.
- **No OrbitControls import** — it's not in `lab/_kit/`, only core three.js is.
  Wrote a ~40-line custom orbit/zoom/pan controller instead of vendoring or
  reimplementing the whole addon. It's deliberately minimal (no damping,
  no auto-rotate).
- **Named it "Tube Stacker"**, not anything with "Tetris"/"tetromino" in a
  naming surface — those are on the content gate's trademark tripwire
  (`scripts/lib/marks.mjs`). The directory name was already `tube-stacker` in
  the task, which also clears `marksInSlug`.
- **Rotation has no proper SRS wall-kick table** — just tries the piece at
  `col, col-1, col+1, col-2, col+2` and takes the first that doesn't collide.
  Good enough for a casual game; a Tetris purist would notice.
- Locked colors to a palette that doesn't mirror the official
  shape-to-color mapping (I is teal not cyan-in-that-exact-shade, etc.) —
  minor, but keeps distance from the specific expression, not just the name.

## The plan (not built yet, roughly in order)

1. **Pinch-to-zoom on touch.** Wheel zoom works; touch only orbits (single
   pointer). Two-pointer pinch-distance tracking on the canvas's pointer
   events would close this — worth doing before anything else since it's the
   one control gap on the platform most visitors will actually use.
2. **Ghost/preview cell for hard drop** would make the game meaningfully
   easier to read at speed — compute the hard-drop landing row and render the
   active piece there at low opacity. Straightforward: reuse `collides()` in
   a loop like `hardDrop()` does, but only for rendering, don't mutate state.
3. **Save best score to the visitor's own repo** via `/_kit/pds.js`
   (`store.postScore`) — sign-in is optional per the house rules, so this
   should be an opt-in "save score" button after game over, not a gate on
   play. Not done this turn; wanted the core game solid first.
4. **Pause affordance** — `P` toggles `paused` already (loop stops, input
   still processed for camera) but there's no visible indicator or button.
   Small UI addition.

## Gotchas

- **Ring-clear had a real bug that's now fixed**: the original loop iterated
  `r` downward and decremented unconditionally after clearing a row. Since
  clearing splices the row out and pushes an empty one at the top, the row
  that was *above* the cleared one slides down into the same index — and the
  old loop moved past it without checking whether *it* was also full. Two
  adjacent full rings would only clear one. Fixed by only decrementing `r`
  when the row *wasn't* cleared.
- **`_kit` lives at `lab/_kit/` in source but is copied to `lab/www/_kit/`
  by `gen-lab-tenants.mjs` at build time**, so `../_kit/...` from
  `lab/www/tube-stacker/index.html` is the correct relative path — don't
  "fix" it to `../../_kit/`, that's wrong for the served layout even though
  it looks more correct against the source tree.
- **`OrbitControls` is not in the vendored three.js** — only core r169. Don't
  try to import it from `three/examples/`; it isn't there.
- Camera pan reads `camera.matrix` (local transform) for right/up basis
  vectors — this is only valid *after* a render call has run, because
  `WebGLRenderer.render()` is what calls `camera.updateMatrixWorld()` for a
  parentless camera. Fine in practice since the render loop is already
  running by the time anyone can drag, but don't move the pan logic
  somewhere that could run before the first frame.
