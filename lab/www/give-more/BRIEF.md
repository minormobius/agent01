# give-more — melting clocks in 3D, real three.js

## What this is

A single-page toy at `minomobi.com/give-more/`: four surreal, Dalí-style
melting clocks rendered in real-time 3D in the browser, using real three.js
(r169, vendored same-origin at `/_kit/three.module.min.js`). One is draped
over the front edge of a table (the iconic "Persistence of Memory" pose), one
sits mostly flat and less melted, one floats impossibly in the sky, and one
sits puddled on the ground slowly spiraling into a vortex. Hour and minute
hands read the visitor's actual system clock — this is a working clock, not
just an animation — while the faces, ticks and hands sag and drip according to
a sine-based melt function the visitor can crank up or down.

## What was asked

First build (previous iteration): "give me more clock tools weird clocks
melting clocks and do it in 3js" — done at the time with a hand-rolled WebGL
renderer, because three.js wasn't available same-origin yet and a CDN import
is blocked outright by the CSP.

This iteration: the operator vendored three.js r169 into `lab/_kit/` and
asked explicitly for the real thing — `import * as THREE from
'/_kit/three.module.min.js'` inside a `<script type="module">`. So the whole
renderer was rebuilt on top of actual three.js, and a fourth clock (the
vortex/spiral one) was added, since "give me more" is also literally the
site's name and a second round of the same request reads as "more than
before," not just "redo it."

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
- **The new spiral/vortex clock (4th clock).** `twistOffset(clock, rFrac, t)`
  adds an angle offset proportional to `rFrac²` plus a slow time-based
  rotation, applied to the face grid and the tick marks but **not** the hands
  — the hands stay straight lines from center, which is what reads as "a
  clock face spiraling into a whirlpool while a frozen hand points through
  it" rather than just a twisted blob. It's positioned on the ground away
  from the table, not draped or floating, so all three placements (table,
  drape, sky, ground) are now used.
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
- Camera orbit (drag + auto-rotate), the melt/drip-speed sliders, and the
  real-time-honest hands are all unchanged in behavior from the previous
  build — only how they're rendered changed.

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
  cropping; still worth tightening once someone can actually look at it.
- A future "give me more" could add real texture (numerals via a canvas
  texture rather than tick-mark quads), or a fifth clock variant (flip
  clock, cuckoo clock) — additive, doesn't require touching the render loop.
