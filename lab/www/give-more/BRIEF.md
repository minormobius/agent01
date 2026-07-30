# give-more — melting clocks in 3D, real three.js

## What this is

A single-page toy at `minomobi.com/give-more/`: surreal, Dalí-style melting
clocks rendered in real-time 3D in the browser, using real three.js (r169,
vendored same-origin at `/_kit/three.module.min.js`). Each reshuffle produces
four to seven clocks, randomly drawn from four placements — draped over the
front edge of a table (the iconic "Persistence of Memory" pose), flat on the
table and barely melted, floating impossibly in the sky, or puddled on the
ground slowly spiraling into a vortex — with one of each guaranteed and extra
copies on top of any archetype filling out the rest. Hour and minute hands
read the visitor's actual system clock — this is a working clock, not just an
animation — while the faces, ticks and hands sag and drip according to a
sine-based melt function the visitor can crank up or down. The camera orbits
by drag and pans with shift-drag, right-click-drag or a second finger.

## What was asked

First build: "give me more clock tools weird clocks melting clocks and do it
in 3js" — done at the time with a hand-rolled WebGL renderer, because three.js
wasn't available same-origin yet.

Second iteration: the operator vendored three.js r169 into `lab/_kit/` and
asked for the real thing — the renderer was rebuilt on `import * as THREE
from '/_kit/three.module.min.js'`, and a fourth clock (vortex/spiral) was
added.

Third iteration, from a Bluesky reply to the second build: "the clocks melt
into the scene when they should hit a surface as a minimum. Random should
randomize more things more clocks and give me a way to pan the scene, not
just rotate." Three changes, addressed in order below: (1) a surface floor so
melted geometry stops at the table or ground instead of sinking through it,
(2) a reshuffle that varies the *count* of clocks (4-7, not a fixed four) as
well as widening the randomized ranges on every archetype, and (3) camera
panning as a control distinct from orbiting.

Fourth iteration, after that landed: "when a clock lies on a table, it's
glitching through in a high frequency discombobulating manner. I think the
fix for you is to put some epsilon thickness between the clock and the
table, or maybe give the clocks some thickness." The surface floor from the
previous round fixed sinking-through but introduced flush-coplanar
z-fighting; addressed below under "Fourth iteration."

## The three.js rebuild

Swapped out entirely: the hand-rolled `mat4Perspective`/`mat4LookAt`/
`mat4Multiply` helpers, the manual GLSL program, and the per-vertex Lambertian
shading baked in JS are all gone. Three.js now owns the camera
(`PerspectiveCamera`), the renderer (`WebGLRenderer` on the existing
`<canvas>`), and the lighting (`HemisphereLight` + `DirectionalLight` +
`MeshStandardMaterial`, so normals from `computeVertexNormals()` do the
shading work instead of a hand-baked light dot-product per vertex). The
ground and table went from custom hand-built triangle lists to a
`BufferGeometry` quad and a plain `BoxGeometry` respectively — three.js's own
default box normals replace the old six-face manual shading multiplier table.

What stayed hand-written on purpose: the melt/drape/spiral **deformation**
itself. `meltDrop()` (sine-based droop, quadratic extra sag past the table
edge) and the new `twistOffset()` (an angular swirl proportional to
`radiusFraction²`, slowly rotating over time) still run per vertex, every
frame, in plain JS, writing straight into preallocated `Float32Array`
position/color buffers (`needsUpdate = true`, no new allocations per frame).
That is deliberately not "a three.js effect" — it is this project's own math,
now sitting on top of a real renderer instead of reimplementing one.

Geometry topology (which vertex triangulates with which) is static per clock
shape, so the two index buffers (`FACE_INDEX`, `TICK_INDEX`) are built once
and shared across all four clocks' `BufferGeometry`s — only positions and
colors get rewritten per frame.

## Key implementation choices

- **Face melt bends the mesh in JS; three.js relights it.** `updateFace()`
  writes displaced vertex positions and a flat per-clock base color into
  typed arrays, then calls `computeVertexNormals()` so the `MeshStandardMaterial`
  + `DirectionalLight` combination shades it correctly from whatever angle the
  camera currently sits at — this only works right because it's now a real
  renderer; the old version had to fake it with one fixed light baked by hand.
- **The spiral/vortex clock.** `twistOffset(clock, rFrac, t)` adds an angle
  offset proportional to `rFrac²` plus a slow time-based rotation, applied to
  the face grid and the tick marks but **not** the hands — the hands stay
  straight lines from center, which is what reads as "a clock face spiraling
  into a whirlpool while a frozen hand points through it" rather than just a
  twisted blob. It's positioned on the ground away from the table, not draped
  or floating.
- **`side: THREE.DoubleSide` on every custom mesh's material**, replacing the
  old `gl.disable(gl.CULL_FACE)`. Same reasoning: the camera orbits freely and
  can end up looking at these thin, flat, horizontal meshes edge-on or from
  below, and there was no way to check winding order visually before
  shipping.
- **`reshuffle` now disposes before rebuilding.** Each "give me more" click
  removes the four old meshes from the scene and calls `.dispose()` on their
  geometries and materials before building four new ones — the old
  hand-rolled version rebuilt the vertex/index arrays fresh every *frame*
  anyway so this wasn't a concern before; with persistent three.js
  `BufferGeometry`s it now is.
- **Still no Bluesky calls.** Nothing about this request names a Bluesky
  subject, so `kit.bskyGet` remains unused. Kit dependency is unchanged:
  `tokens.css`, `kit.crumb`, `kit.showError`.
- Camera orbit (drag + auto-rotate) and the melt/drip-speed sliders are
  unchanged in behavior from the previous build; panning is new (below).

## This iteration: surface floor, wider randomization, panning

- **`meltDrop()` now clamps to a floor.** New `surfaceY(worldX, worldZ)`
  looks up whether a world point sits over the tabletop footprint (`TABLE.x0`
  ..`TABLE.edge`, `TABLE.z0`..`TABLE.z1`) and returns `TABLE.yTop` if so, else
  `GROUND_Y` (`TABLE.yBot - 0.02`, matching the ground plane's own y). Every
  call to `meltDrop()` — from `updateFace()`, `updateHands()` and
  `updateTicks()` alike — now computes the vertex's actual world position via
  `clockPoint()` first (previously only the drape check did this, and only
  along X) and clamps the computed drop so `clock.cy + drop` never sinks below
  that surface. This is the actual fix for "the clocks melt into the scene":
  before, the base sine sag applied everywhere unconditionally, so even the
  portion of a clock face sitting on top of the table was drooping down into
  the solid tabletop; now geometry over the table stops flush at `y=0`, and
  only the true overhang (past `TABLE.edge`) is allowed to sag further, down
  to the ground plane — which happens to look better too, since a heavily
  melted drape now visibly reaches the floor instead of hanging in a
  mathematically-limited curve that had no relationship to any surface.
- **`makeClocks()` is now archetype-based with a random extra count.** Four
  generator functions (`makeDrapeClock`, `makeFlatClock`, `makeSkyClock`,
  `makeVortexClock`) replace the old fixed four-element array literal. Every
  reshuffle includes one of each (so the four placement types always appear),
  then appends 0-3 more chosen randomly from the same four generators — so
  clock count is 4-7 per shuffle, not always exactly four. Every generator
  also widened its own randomized ranges (position, radius, `baseMelt`,
  `waveSpeed`) well past the old fixed-plus-small-jitter values, and three of
  the four archetypes (drape, flat, sky) now have a random *chance* of picking
  up nonzero `swirl` too, which previously only the vortex clock ever had —
  so "randomize more things" landed as both "more randomized parameters per
  clock" and "a randomized clock count," not just wider number ranges on the
  same four fixed clocks.
- **Panning is a second drag mode, decided per-gesture.** The old single
  `dragging` boolean is now a `pointers` map keyed by `pointerId`, so the code
  can tell one pointer from two. On `pointerdown`, `dragMode` is set to `'pan'`
  if there are already 2+ active pointers, `e.shiftKey` is held, or it's a
  right-button press (`e.button === 2`, with `contextmenu` prevented on the
  stage so right-click doesn't pop a browser menu instead) — otherwise it's
  `'orbit'`, preserving the original one-finger/left-drag behavior exactly.
  Movement is tracked as the centroid of all active pointers, so a two-finger
  pan uses the average of both fingers' movement rather than fighting over
  whichever pointer's events arrive first. `panCamera(dx, dy)` moves `target`
  (the orbit's look-at point) along the camera's current horizontal right
  vector — derived from `azimuth` alone, `(cos(azimuth), 0, -sin(azimuth))`,
  not a full 3D basis off the camera matrix, which is an approximation that
  holds fine for a mostly-horizontal orbit like this one — plus vertically on
  world Y, each clamped to a fixed range so panning can't fling the scene out
  of reach with no way back. Auto-rotate now checks `pointers` being empty
  rather than the old single boolean, so it still pauses correctly during
  either drag mode.

## Fourth iteration: fixing z-fighting on the table

The surface-floor fix in the previous iteration stopped melted geometry from
sinking *through* the table, but introduced a new bug the operator caught on
the live site: "when a clock lies on a table, it's glitching through in a
high frequency discombobulating manner" — a flat or draped clock's on-table
portion flickers. They suggested two possible fixes: "put some epsilon
thickness between the clock and the table, or maybe give the clocks some
thickness."

**Root cause.** `meltDrop()`'s floor clamp was `surfaceY(worldX, worldZ) -
clock.cy`, and for the flat/drape archetypes `clock.cy === TABLE.yTop === 0`
— so the floor was exactly `0`, meaning any clamped vertex resolved to
`clock.cy + floor === TABLE.yTop`, precisely the same y as the tabletop
`BoxGeometry`'s own top face. Two meshes occupying the exact same plane is
textbook z-fighting: the depth buffer can't consistently decide which one is
in front, so it flickers per-pixel as the camera moves — which reads exactly
like "high frequency discombobulating." It was worse than a one-off
coincidence too: since `drop` (the raw, unclamped sine-driven sag) is always
≤ 0 for any vertex with `rFrac > 0`, almost the entire on-table surface was
hitting this clamp on every single frame, not just at one unlucky moment.

**The fix: epsilon separation, applied at the one place that matters.**
Went with the epsilon option, not physical thickness — it's the standard,
low-risk fix for two coplanar surfaces, and this build can't be rendered
here to validate something riskier like a real extruded slab (top face,
bottom face, side walls) before shipping. Added `SURFACE_EPS = 0.015` and
folded it straight into `surfaceY()`'s return value rather than touching
`clock.cy` per archetype: since the clamp always resolves to
`clock.cy + floor === surfaceY(...)` regardless of what `cy` was, bumping
`surfaceY()` alone guarantees every clamped vertex — face, hand, or tick,
since all three call `meltDrop()` — sits deterministically at
`table height + 0.015` or `ground height + 0.015`, never flush with the mesh
underneath. One-line root cause, one-line fix, no per-archetype changes
needed.

**Not done: literal clock thickness.** The operator's alternative framing —
give the clocks actual volume rather than a zero-thickness sheet — would
read as more physically honest (a real clock has a case) but means building
a bottom face, side walls connecting the two rings, and doubling the
per-vertex work, all without being able to render it once to check the
seams don't gap or invert. Worth doing as a follow-up once someone can
actually look at the page; flagged here so it isn't mistaken for an
oversight.

## What's open / unverified

- **Still never rendered.** No Bash/WebFetch/browser in this sandbox. The
  three.js API calls (constructor argument names, `BufferAttribute.setUsage`
  chaining, `Object3D.add`/`.remove` accepting multiple arguments, `Fog`
  behavior against a transparent-background renderer) are all correct per the
  vendored kit's README and my knowledge of three.js r169, but genuinely
  untested here. If the harness reports a blank canvas or a thrown error,
  `kit.showError` surfaces it inline from both the `WebGLRenderer` constructor
  try/catch and the `startScene()` try/catch, which should narrow it fast.
- **Face index buffer uses `Uint16Array` deliberately**, not `Uint32Array` —
  max vertex index per clock face is 167, well under the 65535 ceiling, and
  `Uint16Array` needs no `OES_element_index_uint` extension on a WebGL1
  fallback context. Worth remembering if `RINGS`/`SEGMENTS` ever grow enough
  to cross that ceiling.
- Camera framing (distance 7.6, 45° vertical FOV) is unchanged from the
  previous build and was already chosen conservatively/zoomed-out to avoid
  cropping; still worth tightening once someone can actually look at it. With
  panning now live, distance/FOV matters less than before — a bad initial
  frame is recoverable by hand.
- **Pan's right-vector is azimuth-only, not the true camera basis.** Correct
  for this orbit (elevation stays within ~7-80°, so the horizontal-plane
  approximation doesn't visibly skew), but if elevation range ever widens
  toward looking straight down, a proper `cross(forward, worldUp)` off
  `camera.matrixWorld` would be the more honest fix.
- **Pan target clamp (`x`/`z` in [-6, 6], `y` in [-1.5, 3.5]) is a guess**,
  sized to keep the whole table+ground scene reachable without needing zoom.
  Not verified against the real render — if the sky clocks (up to `cx: 3.6`)
  end up clipped at the pan boundary, widen the `x` clamp in `panCamera()`.
- The surface-floor fix and the wider randomization are both new,
  never-rendered code, same caveat as the three.js rebuild below.
- A future "give me more" could add real texture (numerals via a canvas
  texture rather than tick-mark quads), a fifth placement archetype, or
  camera zoom (scroll wheel / pinch) to complement the new pan.
