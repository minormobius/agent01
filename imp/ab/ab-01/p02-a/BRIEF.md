# Tube Stacker — handoff

## What this is

A falling-tetromino game rendered on a 3D cylinder with three.js instead of a
flat well. The board is COLS=10 columns wrapped around a drum, ROWS=16 tall.
"Full circle clears" means a whole ring around the tube (all 10 cells in one
row) clears — the cylindrical analogue of a full row in the flat game. This
is a fresh build; an earlier attempt at this same name was held out of a
previous merge (see `lab/www/tube-tetris/index.html`, which is a redirect
stub pointing here — that name got renamed off the "tetris" mark before
this build even started, so it was already decided for me).

Shipped and working end to end as far as I can verify by reading the code:
grid/collision/rotation logic, line (ring) clearing, scoring with levels
that speed up the drop, next-piece preview (2D canvas, top right), score/
lines/level/best HUD, pause, restart, game-over screen, keyboard controls
(arrows + space + p), on-screen touch controls for mobile, and a hand-rolled
mouse orbit camera (drag to rotate, wheel to zoom, right-drag or shift-drag
to pan, plus basic two-finger pinch/pan on touch).

## Decisions

- **No OrbitControls.** The addon isn't vendored in `_kit`, only core
  three.js. Wrote a minimal spherical-camera orbit by hand rather than
  reimplementing the addon's full feature set — rotate/zoom/pan only, no
  damping, no auto-rotate. Good enough for a game where the camera is a
  secondary control surface, not the point.
- **Wraparound is done with modulo arithmetic on the column index**, not
  by simulating real cylinder geometry for collision. `((col % COLS) +
  COLS) % COLS` everywhere a column is touched. This is the entire trick
  that makes it "a cylinder" rather than "a rectangle with a cylinder
  skin" — a piece moving left off column 0 reappears at column 9 and can
  still collide with blocks there.
- **Locked blocks are individual `THREE.Mesh` objects, not an
  `InstancedMesh`.** COLS×ROWS = 160 cells max, rebuilt on every lock/clear.
  Simpler code, and not a performance concern at this scale. If the board
  ever grows much bigger, switch to InstancedMesh with an instance-color
  buffer instead of rebuilding the whole group.
- **Score/best are `localStorage` only.** No ATProto sign-in or
  `labPds`/leaderboard integration — the task didn't ask for one and it
  would have eaten the rest of the turn. See "the plan" below.
- **Piece rotation** uses a generic `(x,y) -> (N-1-y, x)` matrix rotation
  in an NxN local box (N=4 for I, N=2 for O, N=3 for the rest) rather than
  hardcoded SRS rotation tables. Simpler, but the kick behavior is a plain
  linear search over `[0,1,-1,2,-2]` column offsets — not proper SRS wall
  kicks. It works because there are no side walls (the cylinder wraps), so
  kicks are only ever needed against other locked blocks.

## The plan (not built yet, in order)

1. **Verify in a real browser.** I have no way to run this myself. Watch
   the harness screenshot closely for: camera starting position (is the
   drum actually visible and reasonably framed?), whether the next-piece
   preview canvas is sized/positioned correctly now that the `#wrap canvas`
   CSS selector was narrowed to `#wrap > canvas` (this was a real bug I
   caught by re-reading the file — the broad selector was also matching
   the nested preview canvas and would have stretched it to fill the whole
   viewport).
2. **Ghost piece / landing preview.** Not implemented. Would need a
   collision-projected copy of the current piece dropped to its landing
   row, rendered with a transparent material.
3. **A `labPds` leaderboard** (`/_kit/pds.js`) if a future request wants
   one — `store.postScore(score, { unit: 'points' })` on game over, behind
   an optional sign-in button, never required to play. Read the pds.js
   section of `lab/_kit/README.md` before touching it.
4. **Line-clear visual feedback.** Right now a cleared ring just vanishes
   instantly on the next `rebuildLocked()`. A brief flash/scale animation
   on the cleared row's meshes before removal would read better, and
   should respect `prefers-reduced-motion` (skip the animation, not the
   clear).
5. **Piece color/theme could use a second pass** — picked seven arbitrary
   distinct hues rather than the classic Tetris palette on purpose (see
   the crypto/trademark section of the build brief on protectable
   *expression*, not rules), but nobody's actually looked at them next to
   each other on screen yet.

## Gotchas

- **The `#wrap canvas` CSS selector bug.** `#nextCanvas` (next-piece
  preview) lives inside `#nextWrap`, which is inside `#wrap`, same as the
  three.js renderer's canvas. A selector of `#wrap canvas` matches both.
  Fixed to `#wrap > canvas` so only the direct-child renderer canvas gets
  `width:100%;height:100%`. If you add another canvas anywhere under
  `#wrap`, check this again.
- **`lab/www/tube-tetris/index.html` already exists** as a redirect stub
  to `/tube-stacker/` — that's from the platform's auto-naming/trademark
  handling, not something I wrote this turn. Don't rename this directory
  back; the stub exists specifically so the old name still resolves.
- Camera pan math assumes `camera.quaternion` is current at the time of
  the drag event, which it is because `updateCamera()` runs at the end of
  every pointermove/wheel handler and camera.lookAt() sets the quaternion
  synchronously — but if you ever move to `requestAnimationFrame`-driven
  camera updates instead of updating on every input event, this breaks.
