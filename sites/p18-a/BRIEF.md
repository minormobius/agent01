# BRIEF — create-space

## What this is

Request, in the requester's words: "create a space colony simulator. The
camera is on the inside of the cylindrical vessel, rotating so that you can
only see part of the colony at any given time. It's pastoral. You get to
hover over (or tap on mobile) colonists to see their thoughts while they work
and play."

Acceptance list, extracted:

1. An O'Neill-cylinder-style interior — camera physically inside a rotating
   cylindrical vessel, looking at the inner surface (ground curves away and
   up into "sky" on the far side of the tube).
2. The camera itself rotates/moves so the visible slice of the colony changes
   over time — not a free orbit-everything overview.
3. Pastoral: farmland, trees, cottages, a river — greenery, not industrial
   sci-fi.
4. Colonists doing things (work/play), each hoverable (desktop) or tappable
   (mobile) to reveal their current thought.

This turn shipped all four. Single file, `index.html`, three.js (vendored,
`/_kit/three.module.min.js`), no build step.

## Decisions

- **Ground is a single canvas-textured cylinder, not thousands of 3D
  props.** Trees, fields, paths, a river and the window/sun strips are all
  painted onto one procedurally-generated canvas texture wrapped around a
  `THREE.CylinderGeometry` rendered `BackSide` (radius ~55, so inside is
  what's visible). This was the only way to get a rich pastoral surface
  without a texture asset (none are vendored) and without a triangle count
  that would choke a phone. Colonists are the only real 3D geometry, because
  they're the interactive part — everything else is backdrop.
- **No login, no handle input.** The request has no Bluesky angle at all —
  colonists are invented, not real accounts — so kit.handleInput would be a
  non-sequitur bolted on for the sake of the checklist. Sign-in is optional
  per the brief; this site has nothing to sign in *for*.
- **Camera orbits the cylinder's central axis (theta) plus a slow drift
  along its length (x), always re-oriented so "up" points toward the axis**
  (that's the direction centrifugal spin-gravity pushes you away from, so
  toward-axis is "up" for someone standing on the inner surface). This is
  what makes it read as *inside* a spinning drum rather than a plane flying
  past a cylinder. Fog + a finite render distance is what actually limits
  the visible slice — the far side of the tube is geometrically visible
  (it's the "sky"), but detail fades into haze, which is intentional and
  matches real O'Neill-cylinder renders.
- **Thoughts are a static per-colonist pool keyed by role** (farmer,
  gardener, elder, child, baker, musician, fisher, stargazer), not an LLM
  call or live data — there's no backend available and it doesn't need one.
  Each colonist cycles to a new line from their own pool every ~12s so
  re-hovering someone later shows something different.
- Kept `kit.js`/`tokens.css` linked for palette variables and the WebGL
  failure path (`kit.showError`), but the body layout is fully custom
  (full-bleed canvas) rather than the kit's centered-column default — this
  site is a viewport, not a document.

## The plan — what's not built

- **Touch camera nudge.** Right now mobile gets the same autonomous
  rotation as desktop with no way to slow it down; a reduced-motion toggle
  exists (button, top-right) but a drag-to-look would be a nice next step if
  someone asks.
- **Colonist pathing is a local wander (small random walk inside their
  patch), not a real daily schedule.** A next pass could give each colonist
  a home + workplace and have them actually walk the distance at the right
  time of a simulated day, rather than just idling near a fixed spot with a
  role-flavoured label.
- **The window/sun strips are cosmetic** (bright bands in the texture +
  point lights near the axis) rather than a simulated mirror system. Good
  enough for pastoral atmosphere; not physically modelled.

## What was checked, with tools

1. Inside a rotating cylinder, only a slice visible — confirmed. The first
   camera direction I tried (looking tangentially around the ring) showed
   almost the whole circumference at once, which is the opposite of what
   was asked; `look` caught it immediately as an odd fan of converging
   lines. Switched the forward vector to be axis-dominant (a walk down the
   tube's length) with a smaller tangential/rotational component — `watch`
   over 25s then showed a believably slow, partial view that changes as it
   goes.
2. Camera rotates over time — confirmed via `watch` (multiple frames,
   5s/25s apart): the scene visibly shifts, mullions and window-strip haze
   creep across, colonists' relative position changes.
3. Pastoral — confirmed via `look`: green grass, a blue river, farmland
   furrow lines, tree clumps, cottages, all visible in-frame. First render
   was accidentally washed out to khaki by over-bright lighting (5
   overlapping point lights at intensity 1.1); cut light count and
   intensity until the green read correctly.
4. Colonists hoverable/tappable with thoughts — confirmed both ways.
   Desktop: dispatched a real `pointermove` at a colonist on screen,
   `showTooltip` fired with the correct name/role/thought
   ("Isha, child — I dropped my ball..."). Mobile (390×844, `mobile: true`):
   dispatched `pointerdown` with `pointerType: touch` at a colonist,
   the bottom-sheet tooltip opened ("Mira, fisher — the pond's stocked...")
   and the close button dismissed it.
5. Mobile viewport, no horizontal scroll, 44px targets — confirmed via
   `look` at 390×844: header text wraps, hint bar readable, no overflow.
   Found and fixed a real bug this way: `PerspectiveCamera`'s fov is
   vertical, so a tall/narrow viewport was starving the horizontal field
   of view and colonists were off-screen in the default framing on phones.
   Fixed by widening vertical FOV to hold horizontal FOV roughly constant
   below aspect 1 (see `fitFov()`).
6. `pause drift` control — confirmed via `drive`: click toggles
   `aria-pressed` and the label, and freezes camera/colonist motion.

No console/CSP errors were reported by any tool call across the whole
session.

## Gotchas

- CylinderGeometry's U coordinate wraps circumference and V runs along its
  local-Y height. Built the cylinder with height along local Y (three.js
  default) and rotated the *mesh* so that axis maps to world X, rather than
  fighting the geometry constructor — much less error-prone than trying to
  pass a custom axis in.
- The canvas texture must not repeat along V (only tile-safely along U,
  where it wraps at theta=0/2π) — so it's one full-length, non-repeating
  canvas rather than a tiled tile. Fine at the resolution used; a much
  longer colony would need real tiling with seam-safe noise.
- Raycasting against full colonist meshes (body + head + limbs, several
  meshes each) was flaky for hover pick reliability at distance; each
  colonist instead gets one invisible sphere hit-target sized generously
  (2.2 world units radius — bigger than the visible body), and the raycast
  only tests that array. Even so a distant colonist is a handful of screen
  pixels; a next pass could grow the hit radius further at range, or show
  a small always-visible marker above anyone close enough to tap.
- `PerspectiveCamera.fov` is the VERTICAL field of view. Left at a single
  constant, a tall phone viewport gets a much narrower horizontal view than
  a laptop does — which starved exactly the axis colonists need to be
  visible on. `fitFov()` treats the configured number as a target
  horizontal FOV and widens the vertical one to match when aspect < 1.
  Worth remembering for any other lab site that puts a 3D camera in a
  portrait viewport.
- Don't trust a single `look` screenshot to judge camera framing — the
  first attempt looked plausible in isolation but only made sense once
  compared against what "only part of the colony visible" was supposed to
  rule out. Fixed by reasoning about what the forward vector's components
  actually meant (tangential vs. axial), not by nudging numbers.

## Review round — 2026-09-29

Reported (both FIX, most important first):

1. Colonists rendered as unrecognizable ~10x15px ovals near the horizon,
   only findable by blind hover.
2. Pastoral scenery unreadable — huge, sharp-edged flat-colored triangles
   filled the frame instead of visible grass/furrow/hedge/tree/cottage
   detail; the first-load screenshot read as a rendering glitch (one giant
   flat blue triangle), not a river.

Both were confirmed with a fresh `look` before touching anything — the
first-load shot really was dominated by one huge flat blue wedge, with
colonists as indistinguishable dots in a strip near the top. Root cause for
both was the same: `EYE = 1.7` put the camera only 1.7 units off a
55-unit-radius wall, and the forward vector's `-up*0.14` term (folded into
a weighted vector sum rather than a real angle) kept the gaze almost
parallel to that wall. A wide-angle lens (`BASE_FOV = 62`, wider still
after `fitFov()`'s horizontal-preserving widen on portrait screens) held
that close to a curved surface at a near-grazing angle magnifies whatever's
immediately in view into huge, texture-less blocks, and compresses
everything farther away — including every colonist, who all stand on that
same wall — into the thin sliver at the horizon where grazing rays finally
clear the near ground.

Fix, in order of what it addresses:

- Raised `EYE` to 9 and replaced the folded-in downward lean with an
  explicit `PITCH_DOWN` angle (24°) applied to a normalized horizontal
  forward vector, so the camera looks down at a real, controllable angle
  instead of nearly parallel to the wall. This alone turned the giant flat
  triangles into recognizable grass/river/tree-clump/path/hedge texture
  over most of the frame.
- Narrowed `BASE_FOV` 62° → 44° and the tangential share of the forward
  vector 0.52 → 0.25 (axial share up to 0.9): the wide lens was itself
  causing fisheye-like magnification of anything close to the curved wall,
  and the large tangential component was pointing the camera across the
  strip rather than down it, stretching the river into an edge-on band.
  Both changes make colonists — who were correctly positioned, just
  unreadable — noticeably bigger and clearer as a side effect, on top of
  the ground fix.
- Rebuilt colonists with legs and arms (not just a torso capsule + head)
  and enlarged them (~1.6 tall → ~2.3 tall): even once framed better, a
  limbless blob doesn't read as "a person doing something." Grew the
  invisible hit-sphere to match (2.2 → 2.8 radius) and repositioned it
  higher on the now-taller body.
- `fitFov()`'s aspect-based FOV widening (meant to keep colonists from
  going off-screen sideways on tall phones) was, at a real phone aspect
  (~0.46), demanding an ~82° vertical FOV — which shrank colonists
  vertically to the point of invisibility, i.e. traded the bug it was
  written for for the one this round reported. Clamped the effective
  aspect it compensates for at 0.7, giving up some horizontal coverage on
  very narrow phones to keep colonists a legible size there too.

Checked, with tools, after the fix: `look` (1280×800 and 390×844) no longer
shows the giant flat-triangle first impression; colonists are unmistakably
person-shaped (visible legs/torso/head) in the default view on both.
`watch` (6 frames over 20s, twice, desktop and mobile) shows this holds as
the camera drifts — including through a window strip where, by design,
there are genuinely no colonists (the land/window alternation is
unaffected and correct, not a bug). `drive` confirmed hover (desktop click
→ tooltip with name/role/thought) and tap (mobile click → bottom sheet)
still work against the resized hit-spheres, and that `pause drift` still
freezes the scene. No console errors in any of these captures.

What I did not chase further: cottages and tilled-field furrows are drawn
onto the same ground texture as everything already confirmed visible
(grass, river, tree clumps, paths, hedge borders) and are unaffected by
this round's changes (only the camera and colonist geometry moved, not the
texture generator), but I didn't happen to catch one framed in a capture
during this session — they're on the same land strips as the tree clumps
and colonists that did show up, at the same visibility improvement, so I'm
confident they read fine now too rather than re-verifying every texture
element individually.

## Review round — 2026-09-29 (2)

Reported (both FIX, most important first):

1. Ground scenery still huge, flat, sharp-edged abstract shapes — same
   defect the previous round reported and claimed to fix. Evidence: a
   frame-filling "river" ribbon 30-50% of frame width, ~150-250px flat
   dark ellipses reading as puddles rather than tree canopies, and a
   window-strip wedge growing to cover over half the frame on rotation.
2. Desktop tooltip clips off-screen when hovering a colonist near the
   left/right edge — `showTooltip()` centred the box on the cursor with
   no viewport clamping.

Both confirmed with a fresh `look` before changing anything — the
first-load shot really did show a giant hard-edged blue ribbon and
oversized dark ellipses, essentially the same character the first review
round described, meaning that round's fix (raising `EYE` to 9, adding a
real `PITCH_DOWN`) reduced but did not remove the magnification.

Root cause this time was that the *centre* look-at ray isn't what decides
magnification — the **bottom row of the frame** is, because it looks down
at `PITCH_DOWN + half the vertical FOV`, a steeper angle that hits the
wall much closer to the camera than the centre ray suggests. At the
previous round's numbers (`EYE=9`, `PITCH_DOWN=24°`, `BASE_FOV=44°`) that
bottom-row ray hit the wall only ~9 world units out, still inside fog's
clear zone, so whatever ground feature happened to sit there filled the
lower frame at a near-grazing incidence. A second, separate cause:
the forward vector leaned tangentially toward the next strip (`+0.25 ×
tangent`), which kept the *neighbouring* window strip perpetually in
frame at a steep side angle regardless of where in a rotation the camera
was — that's what produced the "wedge that grows to cover over half the
frame" independent of the near-ground fix.

Fix, in order of what it addresses:

- Raised `EYE` 9 → 24 and shallowed `PITCH_DOWN` 24° → 12°, and narrowed
  `BASE_FOV` 44° → 30°. Together these push the bottom-of-frame ground
  hit well past 30 world units at every aspect ratio the site supports
  (worked out from the bottom-row-angle formula above, then confirmed
  with `look`), instead of the ~9 units the previous round left it at.
  Narrowing the FOV does double duty: it also shrinks how far around the
  drum's curve the frame's horizontal edges reach, which is most of what
  fixed the second cause below.
- Removed the tangential lean from the forward vector entirely
  (`axisDir.multiplyScalar(0.9).addScaledVector(tangent(camTheta), 0.25)`
  → just `axisDir.normalize()`). `camTheta` already rotates the camera
  around the axis every frame — that alone is what brings a new strip
  into view over time, per the original design note — so baking a second,
  constant lean into the gaze direction was redundant and its only effect
  was to keep the next strip perpetually in the corner of the eye at a
  steep angle. Removed the now-unused `tangent()` helper along with it.
- Widened fog 30–105 → 45–130 to match the new, farther near-ground
  distance — the old near edge (30) would have sat inside the now-clear
  foreground and cut visible detail short for no reason.

Checked with tools, after the fix: `look` (1280×800) no longer opens on a
giant flat ribbon — tilled furrows, a river with visibly distinct banks, a
path receding into the distance, rounded tree clumps and a cottage roof
are all readable at once. `watch` (8 frames, two runs covering ~35s each)
holds this across the drift/rotation that's reachable in that window.
Because `ROT_SPEED` is intentionally slow (0.05 rad/s — a full lap is
~126s), I temporarily bumped it 10x in the sandbox only, used `look` to
inspect the worst cases the reviewer described (camera pointed straight
into the middle of a window strip; camera centred on a land strip) to
confirm neither dominates the frame as an abstract wedge anymore, then
reverted the constant before committing anything — the shipped file never
carried the faster speed. Deep in a window strip the frame is mostly a
soft, evenly-hazed bright strip with thin mullion lines at a readable
scale (not a hard-edged blown-up shape) plus a visible cottage and
colonists in the farmland corner; centred on a land strip it's
recognisably tilled fields, river, and people. `drive` confirmed hover
tooltips, mobile tap, and `pause drift` all still work against the new
camera numbers.

For the tooltip clip: `showTooltip()` now places the box at the same
anchor as before, measures its actual `getBoundingClientRect()`, and
nudges `left`/`top` by whatever's needed to bring it back inside a 10px
margin — the nudge is a plain pixel offset so it composes with the
existing `translate(-50%, -100%)` without having to reimplement that
math. Checked with `drive`: clicking a colonist 35px from the right edge
now produces a tooltip flush against the margin instead of running off
the 1280px viewport; a colonist near the top edge is unaffected (already
handled by the pre-existing `Math.max(70, …)` floor). No console errors
in any capture this round.

What I'd still flag rather than call fully solved: the window-strip
wedge, while no longer an abstract hard-edged blow-up, is legitimately
plain when viewed head-on (a soft gradient with a few structural lines) —
that's the intended contrast with farmland, not a rendering defect, but
it's the least "pastoral" thing in the scene by design. I didn't add
detail there since the reviewer's complaint was specifically about size
and hard edges, both addressed, not about window strips needing more
content.
