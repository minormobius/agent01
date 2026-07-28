# tube-stacker — handoff

## This turn: inverted the orbit-drag rotation direction

Requester feedback: "Invert clockwise and anticlockwise manipulations. It'll
be more intuitive." The only manipulation in this page with a clockwise/
anticlockwise sense is the left-drag camera orbit (dragging spins the tube
around its axis; right-drag/shift-drag pan and wheel/pinch zoom don't have a
rotational direction to invert). Flipped the sign of the horizontal-drag term
in the rotate branch of the pointermove handler: `view.theta -= dx * 0.006`
→ `view.theta += dx * 0.006`. Left the vertical term (`view.phi -= dy *
0.006`, tilt up/down) untouched — that's not a clockwise/anticlockwise axis,
and wasn't part of the complaint. This is a one-line, one-sign change, same
shape as the pan-x inversion two turns ago — read the ask the same way: one
axis was backwards, flip that one sign, don't touch anything adjacent.

Untested in a real browser (no Bash/WebFetch in this sandbox, same as every
prior turn) — if the harness's browser pass reports the drag still feels
backwards, the fix is probably that "clockwise" reads oppositely once you
account for which side of the tube the camera is orbiting on at phi≈1.15;
try flipping the sign back and see if that's what "intuitive" meant instead.

## Renamed this turn

This site was `tube-tetris` through the first two turns (see the rest of this
file, which predates the rename and still says "tube tetris" in prose below —
that's the old working name, kept here for history, not the current one).
The requester didn't ask for the rename; it came from upstream policy: this
game's mechanic (tetrominoes, falling pieces, line clears) is unprotectable,
but "Tetris" is a live trademark, and putting it in the URL/title/share-card
put a stranger's mark on minomobi.com. This turn changed the `<title>`,
`og:title`, the in-page heading, the crumb, the share-card's `fillText`
(both the big "TUBE STACKER" wordmark and the small `minomobi.com/...` URL
line), and the downloaded file's name from `tube-tetris-score.png` to
`tube-stacker-score.png`. The `og:description` still says "Tetris-like
blocks" — that's fine, the policy only bans the mark from the title/heading/
share-card, not from saying what the thing plays like. Nothing else changed:
no gameplay, no layout, no new features. If a future turn touches this file's
narrative sections below, prefer "tube stacker" going forward, but there's no
need to retroactively scrub "tetris" out of old rationale — it's history, not
branding.

## What this is

A Tetris-like game wrapped around a 3D cylinder, requested by @minormobius.bsky.social:
"the tetronimos fall on a 3js rendered cylinder, full circles clear, and all
the normal features: see the next dropping block, score presented. For
controls I think mouse manipulates the cylinder in rotate zoom pan, arrow
keys manipulate the blocks."

It shipped complete in turn one — a full, playable game, not a skeleton.
Board is 12 columns (wrapping all the way around the tube) by 16 rows.
Pieces are the standard 7 tetrominoes, drawn from a 7-bag randomiser (one of
each before any repeat). A "full ring" — every column filled in one row,
which reads visually as a closed circle around the tube — clears and
scores, same scoring curve as classic tetris (100/300/500/800 × level),
level rising every 10 lines and speeding up the drop. Next piece shown in a
small 4×4 HTML preview grid, top right. Score/level/lines HUD top left.
Start/pause/game-over all route through one center panel + button.

Turn two (this one) was requester feedback on that first build, four asks:
zoom out further, WASD as well as arrows, fix an inverted pan axis, and
mobile support (on-screen buttons + pinch-zoom), plus a new ask for a
shareable result image. All four shipped this turn:

- **Zoom.** The old default (`RADIUS * 3.4`) only fit about a third of the
  tube's height. Replaced with a proper fit-to-view calculation: the
  cylinder's bounding sphere (`sqrt(RADIUS² + TOP_Y²)`) divided by
  `sin(halfFov/2)`, using whichever of the vertical (`camera.fov`) or
  aspect-derived horizontal fov is tighter — a tall phone viewport is
  narrower than the desktop case, so the horizontal one binds there. 15%
  margin on top. `MAX_R` scales off the same fit distance so zooming out
  further still doesn't detach the tube from view entirely.
- **WASD.** Added alongside arrows in the keydown switch (A/D move, W
  rotates, S soft-drops) — same handlers, just more cases.
- **Pan-x inversion.** The requester's exact words were "pan is inverted x
  (normal y), invert the x" — read as: y already feels right, x is
  backwards, flip it. It was one sign: `addScaledVector(right, -dx * scale)`
  → `addScaledVector(right, dx * scale)`. Did not touch the rotate-drag math,
  which wasn't part of the complaint.
- **Mobile.** Two separate things, both done:
  - On-screen d-pad-style buttons (`#touch-controls`, bottom-center) for
    left/right/rotate/soft-drop/hard-drop, shown via `@media (pointer:
    coarse)` and hidden on desktop (mouse users already have arrows/WASD).
    Left/right/down auto-repeat while held (`setInterval` while pointer is
    down); rotate/drop are one-shot.
  - Pinch-to-zoom: the pointer handlers now track every active pointer in a
    `Map`, and a second finger touching down suspends orbit/pan and switches
    to distance-based pinch zoom instead (same `view.radius` clamp as the
    wheel handler). Single-finger drag-to-orbit is unchanged.
- **Result image.** On game over, a 800×450 canvas is drawn with the score,
  level, lines, a row of the seven piece colors, and the site URL, then
  shown inline in the game-over panel with "copy image" (clipboard-write,
  `ClipboardItem`) and "download" buttons. Falls back to a text "copy
  failed" if the browser lacks image-clipboard support; download always
  works via a `Blob` object URL.

Mouse (desktop): left-drag orbits the camera around the tube, right-drag or
shift-drag pans the look-at target, wheel zooms — hand-rolled, since
OrbitControls isn't vendored in this kit (`lab/_kit/README.md` says so
explicitly: addons aren't included, write what you need). Keyboard: arrows
or WASD move/rotate/soft-drop, space hard-drops, P pauses, R restarts after
game over. Touch: single-finger drag orbits, two-finger pinch zooms,
on-screen buttons move/rotate/drop.

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
- **Touch controls only show on coarse pointers (`@media (pointer:
  coarse)`)**, not always-on. A mouse user already has arrows/WASD; showing
  a d-pad over the tube for them would just be clutter. This is a heuristic
  (a touch-capable laptop with a mouse plugged in could go either way) but
  it's the standard way to make this call in CSS without JS feature-sniffing.
- **Pinch overrides orbit entirely rather than combining them.** The moment
  a second finger touches down, `dragging` is cleared and the pointer pair
  drives zoom only — no simultaneous rotate-while-pinching. Simpler state
  machine, and two-finger rotate-and-zoom-at-once is a much fussier gesture
  to get right than most players will miss.
- **Result image is a plain 2D canvas draw, not a screenshot of the 3D
  scene.** Simpler, doesn't need to preserve WebGL context or worry about
  `preserveDrawingBuffer`, and a clean score card is arguably a better share
  image than a screenshot of whatever the tube looked like at the moment of
  the last topping-out piece.

## The plan (not built yet, in order)

1. **Wall kicks on rotation** — try the classic SRS offset table (or even
   just a couple of simple `[-1,0]`/`[1,0]`/`[0,-1]` nudges) before giving
   up on a rotate, so play feels less sticky near the seam and near a tall
   stack. Still the single biggest gameplay-feel gap; nobody's asked for it
   explicitly yet but it's the natural next complaint once someone plays a
   few rounds.
2. **Ghost piece** (a dim projection showing where hard-drop would land) —
   nice-to-have, not asked for explicitly but a normal-features expectation
   for "all the normal features."
3. Possibly a **hold piece** slot, same caveat as above.
4. The fit-to-view zoom math (see above) assumes the camera's `aspect` at
   the moment of first layout and doesn't recompute `FIT_R` on resize/rotate
   — a phone rotated from portrait to landscape mid-game keeps the old fit
   distance rather than re-fitting. Not urgent (the user can always
   scroll/pinch to adjust), but worth a `resize()` hook if it comes up.

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
- **`camera.fov` in three.js is the *vertical* field of view, in degrees.**
  Fitting a bounding sphere in view needs `Math.sin` in radians, and on a
  narrow/tall viewport the *horizontal* fov (derived from `camera.aspect`)
  is actually the tighter constraint, not the vertical one — used
  `Math.min(vFov, hFov)` for that reason. Worked out by hand, not measured;
  double check on an actual phone if the mobile zoom still looks off.
  `camera.aspect` isn't meaningful until `resize()` has run once, so the fit
  calculation instead reads `stage.clientWidth`/`clientHeight` directly —
  those reflect the CSS flex layout immediately, before the renderer or its
  canvas have been sized at all.
- **Pointer Events + `setPointerCapture` were already in place** for the
  orbit controls, which made pinch straightforward to bolt on: track every
  live pointer in a `Map` keyed by `pointerId`, and treat "≥2 active
  pointers" as pinch instead of drag. If a future change touches the orbit
  handlers, keep using `pointerId` to key state rather than assuming one
  global pointer — that assumption is exactly what broke down going from
  mouse-only to touch.
- Entirely untested in an actual browser (no Bash/WebFetch in this
  sandbox) — the geometry math, collision logic, rotation formula, the
  fit-to-view distance, and the pinch/touch-button wiring are all worked
  out on paper/by hand-tracing, not run. If the harness's browser pass
  reports something, that's the first real signal on whether any of this
  is actually right — the fit-zoom math and the touch gestures are the
  newest and least-proven parts as of this turn.
