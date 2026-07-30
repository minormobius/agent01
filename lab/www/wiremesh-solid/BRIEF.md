# BRIEF — wiremesh-solid

## What this is

Requested: a 3D wiremesh/solid toggle demonstrating "Fractal Dynamics" —
self-similar patterns emerging from a cluster, where the whole's behavior is
reflected in its parts, with a floating default view and camera controls to
fly through.

Shipped, end to end: a recursive tetrahedral cluster (Sierpinski-tetrahedron
construction — 4 children per node, each at half the parent's scale, down to
a depth the visitor picks 1–5). Every node's world position each frame is
`parent position + own offset * (1 + amplitude * sin(time * frequency +
phase))`, and both amplitude and frequency scale with the SAME factor the
geometry itself scales by per depth. That's the "fractal dynamics" part: it's
not just a self-similar shape, the *motion* is self-similar too — zoom into
any sub-cluster and its jitter is the parent cluster's jitter, smaller and
faster. Rendered with a single InstancedMesh (nodes) + one LineSegments
(parent-child edges), both rebuilt on depth change and re-posed every frame.

Wiremesh/solid toggles `nodeMaterial.wireframe` and shows/hides the edge
lines. Floating/fly-through toggles between (a) the whole cluster
auto-rotating with drag adding manual rotation on top, camera fixed, and
(b) the cluster frozen in place, drag steering camera yaw/pitch FPS-style,
and two on-screen 56px buttons (+ W/S) moving forward/back along the view
direction.

## Decisions

- **Tetrahedral Sierpinski construction, not a random/organic cluster.**
  Considered a noise-based or randomly-branching cluster (more "organic"
  looking) but rejected it: the ask specifically names self-similarity as
  the thing to demonstrate, and a construction where every child is a
  *literal* scaled copy of the parent's own branching rule makes that
  provable by inspection, not just implied by the topic. Random branching
  would look fractal-ish without actually being self-similar.
- **Motion is self-similar too, not just the geometry.** The obvious minimal
  build is a static fractal shape with a toggle. Spent the extra time on the
  coupled-oscillator update rule (same sin() formula, scaled per depth)
  because "dynamics" is in the requested title, not just "fractal" — a
  frozen Sierpinski tetrahedron would answer half the brief.
- **Camera distance is a constant (`CAM_DIST`), not recomputed per depth.**
  This is deliberate, not an oversight: a Sierpinski construction's overall
  extent converges (geometric series in the 0.5 scale factor) even as depth
  adds finer detail, so the same framing works at every depth. Verify this
  visually if the scale factor ever changes — it's a real mathematical
  property of `SCALE < 1`, not an approximation.
- **No InstancedMesh per-node color-by-depth.** Would read better (depth
  visually legible at a glance) but I could not test in a browser, and
  `instanceColor` + custom material interaction has sharp edges in three.js
  I wasn't confident about shipping unverified. Left as a single accent
  color instead of risking a silent no-render.
- **Fly-through has forward/back only, no strafe/up-down.** Scoped down
  deliberately to fit the turn — see THE PLAN.

## The plan

Roughly in order:

1. **Strafe + vertical movement in fly mode.** Add left/right and up/down to
   the on-screen control cluster (or a second thumbstick) and to
   `moveState`/the movement branch in `animate()`. Use
   `camera.getWorldDirection` crossed with world-up for strafe, same pattern
   already there for forward/back.
2. **Depth-based instance coloring**, once someone can actually load the page
   and confirm `InstancedMesh.setColorAt` + `MeshStandardMaterial` behaves as
   expected under this CSP — I did not want to ship that unverified. Would
   make the self-similarity much easier to read at a glance (each depth a
   distinct hue).
3. **A "seed" control** — right now branching is fixed at 4 (tetrahedron) and
   SCALE fixed at 0.5. Exposing SCALE as a slider (0.3–0.7) would let a
   visitor see the geometric-series convergence directly: tighter clusters
   at low SCALE, sparser/more spread-out at high SCALE approaching 1.
4. **Collision/clipping in fly mode** — currently the camera can fly straight
   through node spheres with no feedback. Not critical, but a subtle
   fog-density increase or FOV kick when inside a node's radius would sell
   "flying through" better than nothing happening.

## Gotchas

- `THREE.InstancedMesh.instanceMatrix` needs
  `setUsage(THREE.DynamicDrawUsage)` since it's rewritten every frame —
  included, but if performance is ever bad on a real device, check this
  first; it silently still works without it, just slower.
- Camera `rotation.order` must be `'YXZ'` for FPS-style yaw/pitch to compose
  correctly without roll drift — three.js defaults to `'XYZ'`, which looks
  fine briefly and then visibly rolls the horizon after a few drags. Set
  once at creation, not reset per-mode.
- Node count grows as `(4^(depth+1) - 1) / 3` — depth 5 is 1365 nodes, still
  cheap for InstancedMesh but I capped the slider at 5 rather than letting it
  go higher, on the assumption that's already past the point of visual
  legibility on a phone screen. Untested on an actual device.
- I have no way to run this in a browser this turn — no Bash, no WebFetch.
  Everything above is read-carefully, not verified. If the harness's one
  fix-pass flags something, the sin()/wobble math and the `rebuild()`
  dispose-and-recreate-on-depth-change path are the two places most likely
  to have an off-by-one or a forgotten `.dispose()` leak.
