# create-space — handoff

## What this is

Requested (over two turns now): a space colony simulator, camera on the
inside of a spinning cylindrical vessel, seeing only part of the colony at a
time, pastoral, with colonists whose thoughts you can read while they work
and play.

Turn 1 shipped: a full working scene. `three.js` r169 (vendored, imported
from `/_kit/three.module.min.js`). One `CylinderGeometry` rendered `BackSide`
from the inside as the "ground", textured with a procedurally painted canvas
(patchwork fields, two lakes, a few winding paths). A thin glowing rod along
the spin axis stands in for the sun-line, lit by three point lights spaced
along it plus ambient/hemisphere fill. ~20 colonists in 5 clusters, each with
a name, a job, and a pool of flavour-text thoughts; idle bob + a small
side-to-side walk cycle. The camera auto-orbits around the spin axis (this
IS the "vessel rotating" — see DECISIONS), and a visitor can drag/swipe to
look around locally and scroll/pinch to zoom. A slider controls how fast the
vessel spins, down to 0.

Turn 2 (this one) shipped the four asks from the follow-up:
1. **~20x scenery density on a strict grid.** 140 randomly-scattered
   trees/cottages became a 56×50 grid (2800 cells) across the full inner
   surface — see GRID_THETA/GRID_ROWS. Positions are exact grid points (no
   jitter), only scale/rotation/variant vary per cell.
2. **More variety.** 4 tree variants (pine, round-leaf, birch, autumn) and 4
   building variants (cottage, barn, silo/tower, shed), each 1-2 parts.
3. **Thoughts now appear by proximity, not hover/tap.** The old raycast
   pick + single tooltip is gone entirely. Every colonist has its own DOM
   bubble (`updateThoughtBubbles`), shown/positioned every frame by
   projecting their head into screen space, when the camera is within
   `PROXIMITY_RADIUS` world units and they're on-screen.
4. **New thoughts.** Each of the 8 jobs went from 4 to 6 thought lines.

Performance was the risk here: 2800 individual meshes would have been ~2800
extra draw calls. Solved with `THREE.InstancedMesh` — one per (variant,
part), 16 total, built once from a grid pass that buckets cells by
type+variant (`buckets`, `buildInstancedVariants`). Colonists stay
individual (only ~20, and they need independent walk-cycle animation).

No Bluesky calls anywhere — nothing here needs a visitor-named subject, so
`kit.bskyGet`/`handleInput` are unused. That's a deliberate scope call, not
an oversight.

## Decisions

- **The "rotation" is the camera orbiting the axis, not the mesh spinning.**
  Physically the vessel spins and a co-rotating rider feels stationary
  gravity while the *view* sweeps past the fixed colony. Actually spinning
  the mesh would either need the whole colony (140+ scattered objects) reoriented
  every frame for no visual gain, or a shader-space trick that wasn't worth
  the time in this turn. Moving the camera around a static world is visually
  identical from inside and much simpler. If a future turn wants literal
  "the walls spin, you stand still," it's a bigger rewrite — see THE PLAN.
- **No OrbitControls** — it's not vendored, and a manual drag→yaw/pitch
  offset applied after `lookAt` was enough for "look around" without pulling
  in an addon. `camera.up` is recomputed every frame from the camera's
  current position on the cylinder (pointing toward the axis), which is what
  makes "down" always mean "toward the ground currently under you" instead
  of a fixed world up — that's the one non-obvious piece of math here.
- **Procedural canvas ground texture instead of an image.** No network, no
  vendored art; a tileable painted texture was the only option and looks
  fine at this scale.
- **Deterministic PRNG (`seed`/`rnd()`), not `Math.random()`.** Not required
  by the harness here since this isn't a workflow script, but it made the
  scatter layout reproducible while iterating, so I kept it.
- **Grid, not jittered grid.** "Strict grid" was explicit in the ask, so
  cell centres are exact — `theta = i/GRID_THETA * 2π`, `y` linspaced across
  `rowSpan`. Only per-cell scale/rotation/variant choice is random; nothing
  moves off its grid point. If it reads as too regimented in practice, small
  jitter (±20% of cell spacing) is a one-line addition in the grid-build loop.
- **Instancing over LOD or fewer objects.** With 2800 cells the honest
  choices were "fewer objects" (fights the explicit 20x ask) or "instance
  them" (keeps the count, keeps draw calls flat). Went with instancing:
  `THREE.InstancedMesh` per (variant, part) — 16 draw calls total regardless
  of instance count. Tri counts are low-poly (8-20 tris/part), so even
  ~200k triangles total should be well inside a phone GPU's budget, but this
  is read-the-numbers confidence, not measured.
- **Replaced hover/tap entirely, didn't add proximity alongside it.** The
  request said thoughts should appear "without requiring a hover or click" —
  read as replacing the interaction model, not layering a second one on top.
  Removed the raycaster, the pick logic, and the single shared tooltip; each
  colonist now owns a DOM bubble instead. Simpler code, and there's no
  mobile-only tap path to keep in sync with a desktop-only hover path.
- **Distance-gated, not screen-space-gated.** A colonist's bubble shows when
  the camera is within `PROXIMITY_RADIUS` world units of their head *and*
  they project on-screen — not "whenever they're visible," which at this
  camera's FOV could include colonists 60+ units away down the tube. Reads
  as "close enough to overhear," matching the ask's wording.
- **Widened the camera's along-axis drift (`camY`) from ±15.8 to ±66.**
  Necessary side-effect of the proximity system: colonist clusters are
  placed up to ±66 along the axis (`baseY`), but the old camY amplitude only
  swept ±15.8, so three of the five clusters could never have come within
  proximity range at all, ever. Bumped the amplitude to match the cluster
  spread; the drift is still slow (~5 min per half-cycle) so it doesn't
  change the pastoral pacing.

## The plan — what's not built yet, roughly in order

1. **Only 20 colonists against 2800 scenery objects now reads sparse.** The
   grid density jump makes the colony itself feel emptier by contrast — if
   asked for "more people" next, growing CLUSTERS/count-per-cluster is cheap
   (colonists are still individual meshes, not instanced; ~60-80 should
   still be fine unbatched, beyond that they'd want the same InstancedMesh
   treatment the scenery just got, which is harder because they animate).
2. **Thought bubbles are still content-static per-colonist** — proximity
   now controls *when* they appear, but which thought gets picked is still
   a flat random draw from the job's pool, not tied to what the colonist is
   currently doing (walking vs idle). Give each colonist a simple state
   machine (idle/walk/work) and pick from a state-tagged sub-pool for the
   "in the moment" feel.
3. **Colonists don't interact with the scenery or each other.** They walk a
   tiny sine-wave arc in place. A small waypoint system (2-3 points per
   cluster, ease between them, maybe now routing around the denser grid
   objects) would sell "working and playing" much better than the idle
   wobble.
4. **No literal mesh-spin option.** If a future request wants the vessel
   itself visibly turning, that's a real rewrite: rotate the instanced
   meshes + groundMesh together each frame and keep the camera fixed in
   world space, or fake it with a rotating texture offset on the ground
   material only (cheap, but the grid objects/colonists wouldn't move with
   it — would look wrong immediately).
5. **Performance is calculated, not measured.** 16 InstancedMesh draw calls
   covering 2800 low-poly instances plus ~20 individual colonists should be
   comfortable even on a mid phone GPU, but nothing here has run in an
   actual browser. If the smoke harness reports slowness, first check
   whether `frustumCulled = false` on the instanced meshes (needed because
   their default bounding sphere doesn't account for instance transforms) is
   costing more than expected — a proper `computeBoundingSphere()` call that
   accounts for all instances would be the fix, letting culling work again.
6. **No day/night cycle.** Still just static-lit; could tie the sun-rod
   brightness to `camTheta` for a slow light/shadow sweep if asked.

## Gotchas

- **Never `import` three.js with a relative path** — other lab sites all use
  the absolute `/_kit/three.module.min.js`, even though `tokens.css`/`kit.js`
  are linked relatively (`../_kit/...`). Kept consistent with that.
- **`CylinderGeometry`'s default vertex layout is `x=r·cosθ, z=r·sinθ,
  y=height`** — that's why `surfacePoint()` matches it directly with no extra
  transform once you rotate the mesh's Y to move the UV seam out of the way.
  Getting the up-vector math (`orientToSurface`) to agree with the *camera's*
  up vector (both point "toward the axis") is what makes objects on the
  ground look upright instead of sideways; if you touch one, touch the other.
- The old tap-vs-drag pointerup gating is gone along with the raycast pick
  system (see DECISIONS) — pointerup is now just `dragging = false`. If you
  reintroduce any tap-triggered interaction, you'll want that 8px-movement
  guard back or a real drag will double as a tap.
- **`Vector3.project(camera)` needs `camera.matrixWorldInverse` current for
  *this* frame**, and that's normally only refreshed inside
  `renderer.render()`. `updateThoughtBubbles()` runs *before* `render()` each
  frame (so bubbles reflect this frame's camera, not last frame's), which
  means it needs an explicit `camera.updateMatrixWorld()` call after the
  camera's transform is set and before the projection — that call is in
  `animate()` right after `camera.rotateX(lookPitch)`. Move the projection
  call without moving (or duplicating) that update and bubbles will lag one
  frame behind, which is subtle enough to miss by eye.
- **Colonist head world position comes from `mesh.userData.head.getWorldPosition()`,
  not from `mesh.position` plus a manual offset.** A colonist's local "up" is
  whatever `orientToSurface` set it to (points toward the axis, varies with
  `theta`) — it is *not* world-space Y. Adding `(0, headHeight, 0)` to a
  world position directly, like an early version of this did, puts the head
  in the wrong place for every colonist except the one at theta=0. Reading
  the actual head child's world position sidesteps the whole problem.
- **The instanced-scenery grid and the colonist clusters are placed
  independently** — no collision avoidance between them. At this density a
  tree or building can render inside/through a colonist cluster. Cosmetic,
  not something I chased this turn; if it looks bad, skip grid cells whose
  (theta, y) falls within a cluster's footprint before bucketing them.
- I could not run this in a browser — no Bash/WebFetch/WebSearch in this
  sandbox, this turn or last. Everything above is read-the-code confidence.
  If the smoke harness reports errors, start with the instancing matrix math
  (`buildInstancedVariants` — quaternion composition order, `part.off`
  scaling before or after rotation) and the proximity/projection code, since
  both are new this turn and neither has been exercised.
