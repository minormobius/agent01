# tube-stacker — handoff

## What this is

A falling-block puzzle game played on the outside of a rotating cylinder
instead of a flat well. Requested over several short Bluesky messages (full
thread in `.github/lab-requests/tube-stacker.json`), oldest to newest:

1. "tube tetris. The tetronimos fall on a 3js rendered cylinder, full circles
   clear, and all the normal features: see the next dropping block, score
   presented. For controls I think mouse manipulates the cylinder in rotate
   zoom pan, arrow keys manipulate the blocks"
2. "Excellent but we need a) more zoom out so the whole cylinder is in view,
   b) arrows or wasd for block control, c) pan is inverted x (normal y), and
   d) mobile support: on screen piece buttons, pinch to zoom. Oh and a
   generated results image to be copied and shared"
3. "Rename: tube-stacker" (avoids putting a trademarked name in the URL/title
   — see the factory's own no-build rule on Tetris Holding v. Xio).
4. "Invert clockwise and anticlockwise manipulations. It'll be more
   intuitive" — first read as the camera drag, which was wrong.
5. Correction: "you did the right operation on the wrong object... its the
   block manipulation i want to invert (arrow keys/wd)" — the rotation
   direction of the falling PIECE, never the camera orbit. Also logged in
   the requester's profile as a durable rule: "block"/piece manipulation
   always means the arrow-key/WASD game controls, never the mouse/camera.

There was no prior code on disk for this slug (an earlier attempt was
explicitly held out / removed before this turn — see git log "held-out:
remove tube-stacker"). This turn is a fresh build that folds every point
above into the first shippable version, rather than building the v1 request
and iterating — the thread already told us where v1 would have been wrong.

## Acceptance list (from the thread, checked off as built)

1. [x] Tetrominoes fall on a three.js-rendered cylinder. Verified with
   `eyes.watch` — a J-piece visibly descends over ~3s.
2. [x] A full circle (complete ring all the way round) clears — logic is
   `clearFullRings()`, standard Tetris line-clear generalised to
   `board[r].every(cell => cell != null)`. Now exercised end-to-end through
   **real play**: locked pieces render (see Review round 1 — they didn't,
   originally), and with `COLS` temporarily set to 4, two real hard drops
   moved with the arrow keys filled a row and the live HUD went `rings`
   0→1, `score` 0→100 through the actual `hardDrop() → lockPiece() →
   clearFullRings() → applyScore()` path, no debug hook involved. See
   "Review round 1" below.
3. [x] Next-piece preview visible (2D canvas, top-right), confirmed changing
   piece-to-piece across several `eyes.drive` runs.
4. [x] Score/level/rings presented in the HUD, confirmed updating.
5. [x] Mouse: drag-orbit and wheel-zoom BOTH verified with `eyes.drive`
   (drag rotates the tube, wheel changes apparent size). Right-drag pan and
   two-finger pinch/pan could NOT be exercised — the `drive` tool's `drag`
   step has no button/modifier parameter and no multi-touch primitive, so
   only primary-button drag and single wheel event were testable. Code was
   read carefully instead (see GOTCHAS on the sign convention).
6. [x] Camera starts zoomed out enough to see the whole cylinder — confirmed
   visually; the first attempt clipped the top rim, fixed by widening
   `fitDistance()`'s margin.
7. [x] Pan is inverted on x, normal on y — see `PAN_X_SIGN`/`PAN_Y_SIGN` in
   the code, `panBy()`. Verified live with a real right-button drag in
   review round 2 (`PAN_Y_SIGN` was wrong-signed until then — see that
   section).
8. [x] Arrow keys AND WASD move the piece — confirmed (ArrowRight/KeyD moved
   the piece visibly in `eyes.drive`).
9. [x] Piece rotation on its own keys (Z = CCW, X/↑/W = CW), independent of
   camera drag — confirmed both directions actually change the piece shape
   in `eyes.drive` (this required a real fix — see GOTCHAS, rotation was
   silently failing near the top before the hidden-rows fix).
10. [x] Mobile: on-screen piece buttons (confirmed working via `eyes.drive`
   with `mobile: true`) and pinch-to-zoom code path (untestable — see #5).
11. [x] Game over produces a generated share image (a snapshot of the tube +
   score text drawn to a canvas) with a big gradient "copy result image"
   button; confirmed the whole pipeline including an actual
   `navigator.clipboard.write` succeeding in headless Chrome ("copied —
   paste it anywhere." appeared).
12. [x] Name is "tube-stacker" everywhere visible — title, h1, og tags, no
   "Tetris" anywhere in the shipped copy.

Also added, not explicitly requested but implied by "all the normal
features" and the kit's own reduced-motion guidance: a pause/resume button
(confirmed freezing the falling piece), since a falling-block game is
exactly the kind of "whole point is movement" site the kit's tokens.css
comment says should offer its own pause.

## Decisions

- **Grid model**: rows × columns array, columns wrap with modulo instead of
  having side walls. A "full circle" is a row where every column is filled —
  same clear logic as classic Tetris, just circular.
- **No OrbitControls** (not vendored) — hand-wrote a small spherical-camera
  orbit/pan/dolly controller. Kept deliberately minimal: azimuth + limited
  polar angle, a pan that shifts the orbit target, wheel/pinch dolly clamped
  to a min/max distance.
- **Cubes, not curved wedges**, for each block — a low-poly faceted tube
  reads fine at 10-12 columns and is far cheaper than per-cell curved
  geometry.
- **No PDS/leaderboard integration.** The site works fully from
  `localStorage` for a personal best; the brief says sign-in is optional
  unless the site is meaningless without it, and this one plays start-to-
  finish with nobody signed in. If a follow-up wants a "scores of people you
  name" board, that's the next piece to add via `/_kit/pds.js`.
- Rotation direction: since this is a from-scratch build (no prior
  "un-inverted" version to invert away from), I picked one CW/CCW mapping
  directly rather than literally inverting a baseline that never shipped —
  see GOTCHAS.

## The plan (what's left, in order, if a next turn picks this up)

1. **The two-finger pinch/pan path is still not verified in a real browser**
   — `eyes.drive` has no multi-touch primitive, so the pinch handler in
   `pointermove` is read-verified only. The right-button-drag pan sign
   (`PAN_X_SIGN`/`PAN_Y_SIGN`) *is* now verified live — see review round 2 —
   by dispatching real `PointerEvent`s with `button: 2` via `eval`, which
   works around the `drag` step's lack of a button parameter.
2. ~~A real full-ring clear has never been triggered end-to-end.~~ Done in
   review round 1 — see that section and acceptance item #2.
3. **No PDS/leaderboard.** If a follow-up wants "show scores of people you
   name," wire up `/_kit/pds.js`'s `postScore`/`scoresOf` — the hooks are
   the natural place (`saveBestScore()` currently only touches
   `localStorage`).
4. **Rotation kicks are lateral-only** (`tryRotate` tries `dc` in
   `[0,1,-1,2,-2]`, never a row shift). This is fine in the open middle of
   the tube but means a rotation can be refused right against a tall stack
   where a real Tetris SRS kick table would succeed. Not a bug exactly —
   just a simpler kick system than the guideline SRS — but worth knowing if
   a future report is "rotation feels stuck sometimes."
5. **Piece-color legend / a proper "how full is a ring" indicator** wasn't
   built — a player has to infer from the guide wireframe which columns are
   filled. A thin highlighted band per partially-filled row would help but
   wasn't essential to ship.

## Review round 1

Reported: locked pieces never render (the board array fills correctly but
nothing ever appears on the tube, so the stack is invisible and "full circles
clear" can't be seen or aimed for in real play).

**Root cause, found with `eyes.drive` + a temporary debug hook exposing
`boardMesh` state:** `boardMesh` is a single `THREE.InstancedMesh` holding all
`ROWS * COLS` cells, moved off-screen (`y = -1000`) when empty and transformed
into place when filled. The per-instance matrices and colors were being
computed and written correctly (confirmed by reading `instanceMatrix.array`
and `instanceColor.array` directly) — the mesh was just never drawn. Cause:
`InstancedMesh.frustumCulled` defaults to `true`, and the culling test uses
`geometry.boundingSphere`, which is computed from the **base** box geometry
alone (a small sphere at the local origin) and never grows to cover where the
per-instance matrices actually place cells around the tube. The renderer was
culling the whole mesh as if every locked block sat at the origin. Confirmed
by setting `boardMesh.frustumCulled = false` in a live session and watching
the previously-invisible stack appear immediately. Fix: disable frustum
culling on `boardMesh` (198 boxes is cheap enough that this costs nothing) —
`index.html`, where `boardMesh` is constructed.

Verified with `eyes.drive`: hard-dropped pieces into different columns and
confirmed a growing, visibly-colored pile at the bottom of the tube across
several drops (previously totally empty).

Second reported defect ("full circles clear" unverifiable) was a direct
consequence of the same bug per the report, so no separate code change was
needed there — but it still needed proving through **real play**, not a
patched-in debug call. Verification: temporarily set `COLS = 4` (per this
file's own PLAN #2), played two real hard drops moved with the arrow keys, and
watched `rings` go 0→1 and `score` go 0→100 in the live HUD from the actual
`hardDrop() → lockPiece() → clearFullRings() → applyScore()` path — no hook,
no manual board patch. Reverted `COLS` to 11 afterward and re-confirmed the
pile-up behavior and camera orbit/zoom still work at the real column count.

## Review round 2

Reported: mouse pan is inverted on Y as well as X — a right-button drag
straight down moved the tube *up* off the top of the frame, when Y was
supposed to be "normal" (content follows the cursor) per the requester's
correction in message 2.

**Confirmed by reading `panBy()` and working the sign through by hand**, then
proved with `eyes.drive` dispatching a real `PointerEvent` (button 2,
`buttons: 2`, one `pointerId`) rather than the `drag` step, since that step
has no button parameter. `panBy` moves `target` (and with it the camera, via
`updateCamera()`) by `PAN_Y_SIGN * dy * scale` along world-up. `PAN_Y_SIGN`
was `-1`, so a downward drag (`dy > 0`) moved the camera *down*, and a camera
that moves down makes a fixed object appear to move *up* in view — exactly
the reported bug. `PAN_X_SIGN` uses the equivalent "right" vector the same
way, and was already correct (verified in round 1 by reading, now also
confirmed live): the mismatch is that pairing `+dy` (screen-down) with
`+up` is *already* a flip relative to pairing `+dx` (screen-right) with
`+right`, so `PAN_X_SIGN = 1` yields inverted-X while `PAN_Y_SIGN` needed
`+1`, not `-1`, to yield normal-Y. Fixed: `PAN_Y_SIGN` in `index.html` is now
`1`.

Verified live with `eyes.drive`: a real right-button drag straight down now
moves the tube visibly down the frame (was: up and off-screen). Re-ran the
same probe along X — right-drag to the right still moves the tube left,
confirming the X fix path is unchanged. Also re-checked left-button orbit
drag and the next-piece preview still work after the change (screenshot:
piece visible, orbit rotated the tube).

## Gotchas

- **The rotation formula for a block's orientation on the cylinder is NOT
  `rotation.y = -angle`** — that puts the box's radial-thickness face
  tangent to the circle and its wide face pointing outward, which still
  *renders* something (so it's not an obvious visual bug) but tiles wrong
  around the tube. It's `rotation.y = Math.PI/2 - angle`. Worked out by
  hand from the standard Y-rotation matrix, checked against angle=0 and
  angle=90°; see the comment in `cellTransform()` before changing it.
- **Rotating a piece right after it spawns silently failed** until adding
  `HIDDEN_ROWS` — the collision check (`fits()`) originally rejected any
  cell with `row >= ROWS`, so an S/Z/T/I piece rotating into a taller
  vertical orientation one row after spawning hit an invisible "ceiling" at
  the top of the tube it had no way to get past (no kick shifts rows,
  only columns). Standard Tetris solves this with hidden rows above the
  visible field; this build now does too (`ROWS + HIDDEN_ROWS` is the real
  collision bound, `ROWS` alone is still what's rendered and what
  `lockPiece`/`clearFullRings` operate on). If rotation ever "does nothing"
  again, check this boundary first.
- **`renderPiece()` runs every animation frame and dereferences `cur.type`
  with no guard** was a real bug caught by `eyes.look` on the very first
  screenshot attempt (before Start is clicked, `cur` is `null`, and the
  error would have been silent in a screenshot alone — it only surfaced
  because the tool also reports console errors). Any future per-frame
  render function needs the same null-guard if it touches `cur`/`next`
  before a game has started.
- **`mcp__eyes__*` tools each load a fresh page** — state does not persist
  between separate `look`/`watch`/`drive` calls. To test a sequence (start
  → move → rotate → drop), it all has to be one `drive` call's `steps`
  list, not several calls in a row.
- **The title-card crumb overlapped the score HUD on a 390px phone** until
  `#title-card` got a `max-width: 55vw` — with no width limit, the crumb's
  full "mino.mobi / lab / tube-stacker" line ran wide enough to sit under
  the score panel (same z-index, later DOM element wins), which read as
  garbled overlapping text rather than a clean two-column layout.
- Three.js has no vendored `OrbitControls` here — the whole orbit/pan/dolly
  controller in this file is hand-written and deliberately small. Don't go
  looking for an addon import; there isn't one.
