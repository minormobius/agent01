# BRIEF — tube-stacker

## The ask, in the requester's words
"tube tetris. The tetronimos fall on a 3js rendered cylinder, full circles
clear, and all the normal features: see the next dropping block, score
presented. For controls I think mouse manipulates the cylinder in rotate zoom
pan, arrow keys manipulate the blocks"

## Acceptance checklist (built from that request)
1. Tetromino pieces fall on a three.js-rendered cylinder — not a flat well.
2. A full ring around the circumference (not a full row in the classic sense,
   but the cylindrical equivalent) clears, same as a Tetris line-clear.
3. The next piece is shown before it drops.
4. Score is presented (plus lines/level, standard for the genre).
5. Mouse: drag orbits the camera around the cylinder, wheel zooms, a second
   input (right-drag / two-finger drag) pans.
6. Arrow keys move/rotate the falling piece (Left/Right shift it around the
   tube, Up rotates the tetromino shape, Down soft-drops); Space hard-drops.
7. Standard extras: pause, game over + restart, increasing speed by level.
8. Works on a phone: on-screen touch buttons for move/rotate/drop, one-finger
   drag / pinch on canvas for camera, no fixed-px layout, 44px+ targets.

## What shipped
All eight items above, in one `index.html`. Game logic: a `ROWS x COLS` grid
(9 columns around the tube, 15 rows tall) where the column index wraps modulo
`COLS` — that wraparound *is* the cylinder; a piece that walks off column 8
reappears at column 0, and collision/line-clear code never special-cases it.
Tetromino rotation is generic NxN matrix rotation (works for the 4x4 I, 2x2 O,
and 3x3 everything-else) rather than a hardcoded rotation-state table.
Rendering keeps two three.js groups (`stackGroup` for locked cells,
`pieceGroup` for the falling one) rebuilt from the grid/piece state — this is
a redraw-on-change approach, not per-frame geometry rebuilding, so it stays
cheap. Camera is a hand-rolled orbit/pan/zoom (spherical coordinates around a
target point) since OrbitControls isn't vendored in the kit.

## Decisions
- **Named it "Tube Stacker"**, not Tetris, per the no-build rule on trademarks
  in the title/heading/share-card. `og:description` says what it's like
  ("a tetromino-stacking game … inspired by Tetris") since the rule
  explicitly allows that in body/description copy.
- **Deliberately different piece colours** from the standard Tetris mapping
  (cyan-I/yellow-O/purple-T/etc.) — see `COLORS` in the script — because the
  brief calls out "distinct bright colours" as part of Tetris's protected
  expression, and the safe move was to just not reuse that exact assignment.
- **No ghost piece.** Wasn't explicitly asked for, and it's on the list of
  bundled "this looks exactly like Tetris" expression elements. Skipped to
  keep the visual language clearly its own; easy to add later (see below) if
  wanted — it doesn't change any game logic, only adds a preview render pass.
- **9 columns, not 10.** Picked a number that reads well as a circle and
  doesn't reproduce the classic 10-wide well.
- **7-bag randomizer** for piece order (shuffle each bag of the 7 shapes)
  rather than pure random, so there's no infinite-I-piece-drought/flood —
  standard modern-Tetris-like fairness, not visually distinctive so it's not
  an expression-copying concern.
- **No score persistence / no PDS leaderboard.** Kept the game self-contained
  in this turn; sign-in wasn't asked for and this is meaningful to play
  without an account. `store.postScore`/`scoresOf` from `/_kit/pds.js` would
  be the natural next step if a leaderboard is wanted (see below).

## The plan — what's not built, in order
1. **Local high score** (`localStorage`) — five minutes of work, straightforward,
   just wasn't in the explicit ask and I ran out of turn budget verifying the
   core game first. Would sit right next to the score HUD.
2. **PDS leaderboard** via `/_kit/pds.js` `postScore`/`scoresOf` — needs a
   sign-in flow (kit.handleInput + store.signIn) and a "compare against a
   handle you type" panel, per the kit's rule that leaderboards can only show
   people the visitor named. Bigger lift; do it as its own pass.
3. **Ghost piece** — render the piece's landing position as a wireframe outline
   (same box geometry, `MeshBasicMaterial({wireframe:true})`, position computed
   by running the existing `collide()` loop down from the current position).
   Straightforward, deliberately deferred (see Decisions above).
4. **Hold piece** (a 'C' key swap-to-reserve) — classic modern-Tetris feature,
   not asked for, would reuse the same next-piece-preview DOM rendering.
5. **Wall-kick table tuning** — rotation currently tries a short list of offset
   kicks (`[0,0],[0,-1],[0,1],[-1,0],[0,-2],[0,2]`) rather than a proper SRS
   kick table. Works fine in testing but a piece rotating right at the very
   top of a tall stack can occasionally fail to rotate when a real SRS table
   would succeed. Low priority — cylinder wraparound already removes the wall
   cases that make SRS kick tables matter most.

## Gotchas
- **Box-facing-outward rotation math**: a box's default face normal points
  along local +Z. To make it face radially outward at angle `theta` around
  the cylinder, the rotation is `mesh.rotation.y = Math.PI/2 - theta` — NOT
  `-theta` or `theta`, both of which point the face the wrong way or
  perpendicular to what you'd expect. Verified by hand at theta=0 and
  theta=π/2 before trusting it for all columns.
- **Row 0 is the top of the grid array** (spawn point) and maps to the
  *highest* Y in the scene: `y = (ROWS - 1 - row) * CELL`. Getting this
  backwards makes pieces fall upward, which looks like nothing is happening
  until you notice the stack building from the ceiling down.
- **Clearing rows**: don't `splice` mid-iteration over an array of row indices
  to remove — the indices shift after each splice. Simplest correct approach:
  filter the full rows out, then unshift empty rows at the top until back to
  `ROWS` length.
- Kit's `three.module.min.js` import path: used `../_kit/three.module.min.js`
  (relative, matching the `../_kit/tokens.css` / `../_kit/kit.js` style this
  brief's instructions used), not the absolute `/_kit/...` form the kit
  README shows — both should resolve the same from `/tube-stacker/index.html`,
  but relative is what I could actually verify against the instructions given.

## Verification done this turn
Checked with the `eyes` tool at desktop (1280x800) and phone (390x844,
mobile-emulated) viewports, no console errors at any point:
- Initial load, Start overlay, falling piece render — confirmed.
- ArrowLeft/ArrowRight move, ArrowUp rotate, Space hard-drop, held-down soft
  drop — all confirmed via `drive`, score increments correctly on manual
  drops.
- Camera drag (orbit) and wheel (zoom) confirmed changing the view via
  `drive` mouse actions.
- Locking + next-piece spawn + stacking around the cylinder circumference —
  confirmed visually across many drops (see the "colorful tube" screenshot
  in-session); pieces build up realistically without falling through or
  overlapping.
- Game over on stack overflow — confirmed, overlay shows correct score/lines/
  level text.
- Pause/resume — confirmed.
- **Restart bug found and fixed live**: `resetGame()` reset the score/grid
  data but never called `rebuildStack()`, so "Play again" showed the old
  stack still standing even though the game state was actually clear. Fixed
  by adding the call; verified the fix with another restart.
- Mobile layout: initially the on-screen touch controls were below the fold
  on a 390x844 viewport (had to scroll to reach them) — fixed by shrinking
  `#stage`'s height (72vh→60vh, tighter still under 480px) and the heading
  size on small screens. Verified after the fix that `#touch`'s bounding
  rect sits fully inside the viewport with no scrolling needed.
- Touch buttons (left/rotate/drop/pause/resume/restart) all confirmed
  working via `click_selector` in mobile emulation.

**Not verified live: an actual full-ring clear.** I drove ~9-18 scripted
hard-drops with blind column offsets (no way to see the piece's random-bagged
type before choosing where to send it, and each `drive` call reloads the page
fresh so I couldn't watch-and-adapt across multiple calls) — this proved
stacking/collision/game-over solidly but never lined up a complete ring
before the stack reached the top or before I stopped. The clear itself
(`clearFullRings` in the script — filter out full rows, unshift empty ones
at the top) was checked by hand-tracing the row-index math instead. If it's
wrong, that function is the first place to look.
