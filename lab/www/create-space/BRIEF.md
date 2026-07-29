# create-space — handoff

## Turn 4 (latest) — "restrict where people are placed; camera math has bugs"

Two asks, both shipped:

1. **People rarely came within proximity range.** Root cause: colonist
   cluster `baseY` was fully random over the axial range (`(rnd()-0.5) *
   LENGTH*0.6`, i.e. ±66), while the camera's axial drift (`camY`) sweeps
   that same ±66 range on a slow sine (~5 min half-period) that *dwells
   longest near the extremes* (sine's derivative is smallest there). Free
   random placement gave no guarantee against a large gap between adjacent
   clusters landing near those extremes — and a gap there meant a long
   stretch of the sweep with nobody in `PROXIMITY_RADIUS`. Fixed by putting
   cluster centres on an even lattice along the axis (`Y_SPAN`/`Y_CELL`,
   ±30% of cell width jitter only) instead of free-random — this bounds the
   worst-case gap instead of leaving it to chance. Also tightened the
   per-colonist offset from the cluster centre (±14 → ±10) so individuals
   don't wander back out of the now-guaranteed-safe band. Theta placement
   was left alone — the angular reachability window was already wide enough
   relative to cluster spacing that it wasn't the bottleneck (worked through
   the geometry: at Δy=0 the angular half-window is ~23°, versus ~36°
   spacing between 10 evenly-ish-spaced clusters — those already overlap).
2. **Camera math bugs, both real:**
   - **Zoom (wheel + pinch) was additive degrees-per-event with no
     per-event clamp**: `fov += e.deltaY * 0.03`. Two separate problems
     compounded into "unexpected large changes": (a) `deltaY` isn't
     portable — pixel mode, line mode, and a trackpad's synthesized
     pinch-to-zoom wheel event all report wildly different magnitudes, the
     last of which can spike into the hundreds in a single event; (b) even
     with normal deltas, a *fixed-degree* step is a much bigger *relative*
     jump once fov is already near the 35° clamp than at 85° — zooming in
     visibly accelerates for no reason the user chose. Fixed by normalizing
     `deltaMode`, clamping the per-event delta to ±80, and switching to
     multiplicative scaling (`fov *= exp(delta * k)`) so a scroll step is a
     constant *ratio*, not a constant *degree count*. Pinch got the same
     treatment for consistency.
   - **Pan sensitivity was a fixed radians-per-pixel constant, oblivious to
     current fov.** Dragging N screen pixels rotated the camera by the same
     angle whether you'd zoomed in or out — but the same angle is a much
     bigger *visual* swing at fov=35 than fov=85, so panning felt
     over-eager after zooming in and sluggish after zooming out — "doesn't
     work the way I expect" once you've touched the scroll wheel at all.
     Fixed by scaling the drag sensitivity by `camera.fov / BASE_FOV`.
   - Reviewed and left alone: the `lookAt` → `rotateY(yaw)` → `rotateX(pitch)`
     order (standard FPS-camera composition, no gimbal issue since yaw
     happens in un-pitched local space first), the `camera.up = inward`
     recomputation, and the `updateMatrixWorld()` call before thought-bubble
     projection (turn 2's fix, still needed, still correctly placed). None
     of those showed an actual bug on inspection — see turn 2's gotcha about
     projection ordering if you touch this area again.

Neither fix touched the rotation model, the surface-orientation math, the
instancing, or the thought-bubble system — all turn 2/3 code, unchanged.

## Turn 3 — "more people, empty streets, more variety, better shading, camera up higher"

Five short asks, all shipped this turn:

1. **More people.** `CLUSTERS` 5→10, per-cluster count `3+rnd*3`→`5+rnd*5`
   (avg ~7). Total colonists went from ~20 to ~70 — still individual meshes
   (see turn 2's plan item #1; this was exactly the cheap lever it named).
   Still comfortably under the "60-80 fine unbatched" estimate.
2. **Empty streets.** The grid-population loop (`GRID_THETA`/`GRID_ROWS`)
   now skips every 8th column (`STREET_COL_EVERY`) and every 8th row
   (`STREET_ROW_EVERY`) — those cells are left bare, so the dense scenery
   grid reads as blocks separated by a lattice of open lanes: some running
   the length of the vessel, some ringing it. Deliberately **not** painted
   onto the ground texture — see DECISIONS for why that was cut.
3. **More variety.** Tree variants 4→6 (added `shrub`, a low trunkless
   bush, and `tall pine`, a darker/taller skyline variant). Building
   variants 4→6 (added `greenhouse` and `watchtower`). Draw call count for
   scenery went from 16 to 24 — still trivial.
4. **Better shading, cheap.** Added per-instance colour via
   `InstancedMesh.setColorAt` — each grid cell gets a random 0.82–1.18
   brightness multiplier baked in at build time (`cell.tint`), so the
   flat, repeated instanced geometry reads with some depth/variation
   instead of every pine looking identically lit. Zero extra draw calls —
   same meshes, one more per-instance attribute three.js already knows how
   to consume. No tone-mapping change, no shadow maps — see DECISIONS for
   why that lever specifically was picked over the alternatives.
5. **Camera up higher.** `EYE_RADIUS` went from `RADIUS - 1.7` (near
   walking-eye-height) to `RADIUS - 9` — a real lift, not a nudge. Bumped
   `PROXIMITY_RADIUS` 18→24 to compensate (the camera is now further from
   colonist heads in the radial direction, which was eating into the old
   budget) and steepened the downward look-tilt term in `lookTarget` from
   `-0.05` to `-0.12` so the higher vantage still frames the grid instead
   of drifting toward the skyline.

None of this touched the proximity/projection math, the surface-orientation
math, or the rotation model — those are unchanged from turn 2 and still
carry the same gotchas (below).

## What this is (original, turns 1-2)

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

## Decisions (turn 3)

- **Streets are bare grid gaps, not painted pavement.** The obvious nicer
  version bakes matching dirt-coloured bands into the ground canvas texture
  at the same lines. Didn't do it: the canvas UV origin has an unknown
  phase offset from the world-space `theta` used to place objects
  (`groundMesh.rotation.y = Math.PI/2` was applied in turn 1 purely to move
  the texture seam, which shifts that phase by a constant this code never
  computes). Getting the two to line up needs working out that offset or
  eyeballing it in a screenshot — can't do either without a browser. A
  wrong guess ships painted streets that don't line up with the actual
  gaps, which reads worse than no paint at all. Left as bare grass, which
  is correct by construction (same theta/y values drive both) if visually
  quieter than pavement would be.
- **Shading fix was per-instance colour, not tone mapping.** Considered
  `renderer.toneMapping = THREE.ACESFilmicToneMapping` — it's the standard
  cheap win for "make a three.js scene look better" and costs nothing at
  runtime. Didn't ship it: every light intensity in this scene
  (`axisLight` etc.) was tuned by eye against the current `NoToneMapping`
  default, and ACES changes the whole scene's contrast/exposure response —
  a change I cannot preview. A bad exposure shift is a much worse failure
  than "shading could still be nicer," so this turn took the lever that's
  correct by construction (a colour multiplier can't over- or
  under-expose the scene) and left tone mapping for a turn that can
  actually look at a screenshot before committing to it.
- **Colonist count grew via more clusters, not bigger clusters.** Kept
  `count = 5 + rnd()*5` (max 9) rather than e.g. `2 + rnd()*15` (max 16) —
  wanted the "more people" to read as more *places* having people (streets
  and yards feeling lived-in throughout the cylinder) rather than a few
  existing clusters getting crowded. Also keeps `baseY` spread — and so
  proximity reachability — matching turn 2's tuning.

## Decisions (turns 1-2)

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

1. **(new, turn 3) Streets are unpaved and colonists don't route around
   anything, including the new streets.** If asked to make the streets read
   more clearly, the honest fix is working out the ground texture's UV
   phase offset (see DECISIONS) and painting matching bands — that's a
   "look at a screenshot first" task, not a guess-and-ship one. If asked
   for colonists to actually walk the streets, that's the waypoint system
   in item 4 below, extended to prefer street cells as waypoints.
2. **~70 colonists is comfortably within budget, but if asked to keep
   growing this, colonists need the InstancedMesh treatment next** —
   harder than the scenery's because they animate (walk cycle, bob), so
   it's per-instance bone-free vertex animation or splitting each colonist
   into a static instanced body + a separate small animated part, not a
   drop-in swap. Until then, growing CLUSTERS/count-per-cluster (just done
   this turn) is still the cheap lever if asked for still more people.
3. **Thought bubbles are still content-static per-colonist** — proximity
   now controls *when* they appear, but which thought gets picked is still
   a flat random draw from the job's pool, not tied to what the colonist is
   currently doing (walking vs idle). Give each colonist a simple state
   machine (idle/walk/work) and pick from a state-tagged sub-pool for the
   "in the moment" feel.
4. **Colonists don't interact with the scenery or each other.** They walk a
   tiny sine-wave arc in place. A small waypoint system (2-3 points per
   cluster, ease between them, maybe now routing around the denser grid
   objects and preferring the new street cells) would sell "working and
   playing" much better than the idle wobble.
5. **No literal mesh-spin option.** If a future request wants the vessel
   itself visibly turning, that's a real rewrite: rotate the instanced
   meshes + groundMesh together each frame and keep the camera fixed in
   world space, or fake it with a rotating texture offset on the ground
   material only (cheap, but the grid objects/colonists wouldn't move with
   it — would look wrong immediately).
6. **Performance is calculated, not measured.** 24 InstancedMesh draw calls
   covering ~2100 low-poly instances (down slightly from turn 2's 2800 —
   the street cutouts remove ~23% of grid cells) plus ~70 individual
   colonists should still be comfortable on a mid phone GPU, but nothing
   here has run in an actual browser, this turn or either before it. If the
   smoke harness reports slowness, first check whether `frustumCulled =
   false` on the instanced meshes (needed because their default bounding
   sphere doesn't account for instance transforms) is costing more than
   expected — a proper `computeBoundingSphere()` call that accounts for all
   instances would be the fix, letting culling work again. Second place to
   look: ~70 colonists is a lot of individual `CapsuleGeometry`/
   `SphereGeometry` allocations (one pair per colonist, `makeColonist()`
   creates fresh geometry every call rather than sharing one) — cheap in
   triangle count but each is a separate GPU buffer upload; sharing one
   geometry pair across all colonists (keep materials per-colonist for the
   clothing-colour variety) would cut that if it turns out to matter.
7. **No day/night cycle.** Still just static-lit; could tie the sun-rod
   brightness to `camTheta` for a slow light/shadow sweep if asked. Tone
   mapping (`ACESFilmicToneMapping`) was considered for this turn's shading
   ask and deliberately deferred — see DECISIONS — and would be worth
   revisiting once a turn can see a screenshot before shipping it.
8. **(new, turn 4) Verify the placement/zoom/pan fixes in a real browser
   first.** All of turn 4 is read-the-geometry confidence, same as every
   turn before it — no sandbox browser access. If the smoke harness flags
   anything, this turn's surface area is small and specific: the
   `Y_SPAN`/`Y_CELL` lattice math in the cluster-placement loop, and the
   wheel/touchmove handlers' new `clampFov`/multiplicative-zoom math. If
   proximity still feels rare after this, the next lever is the *speed* of
   `camY`'s sine sweep (currently a ~5 min half-period) — turn 4 fixed the
   worst-case gap between clusters but didn't touch how long a full sweep
   takes, and a visitor who only stays 30-60s may still land in a low
   window early since `camTheta`/`camY` both start near 0 regardless of
   where clusters actually are.

## Gotchas

- **(new, turn 4) `Y_SPAN` in the cluster-placement loop must keep matching
  camY's drift amplitude (`LENGTH * 0.3` each side, i.e. `Y_SPAN/2`) —**
  they're two separately-written expressions, not one shared constant, same
  as turn 2's original `camY`-widening fix. If you change the vessel's
  pastoral pacing by touching `camY`'s amplitude, update `Y_SPAN` to match
  or the new even-lattice placement stops covering what the camera actually
  sweeps.
- **(new, turn 4) `BASE_FOV` is read by both the pan-sensitivity scaling and
  the camera constructor — don't hardcode `62` again anywhere else.** If a
  future turn changes the default FOV, pan sensitivity should follow it
  automatically through this constant; a second hardcoded `62` would silently
  break that.
- **(new, turn 3) `InstancedMesh.setColorAt` only creates `mesh.instanceColor`
  on first call** — the `if (mesh.instanceColor) mesh.instanceColor.needsUpdate
  = true` guard in `buildInstancedVariants` exists because that attribute
  doesn't exist before the first `setColorAt`, so an unconditional
  `.needsUpdate = true` would throw on a variant with zero instances (every
  street row/column can, in principle, empty a bucket if unlucky — didn't
  happen with the current constants, but don't remove the guard on that
  assumption).
- **(new, turn 3) The street skip (`i % STREET_COL_EVERY === 0 || j %
  STREET_ROW_EVERY === 0`) lives in the grid-population loop, before
  `cell.tint`/`scale`/`rotY` are rolled** — it's a `continue`, so it doesn't
  consume an `rnd()` call for skipped cells. That matters because `rnd()` is
  a seeded PRNG the whole layout depends on for reproducibility; if you
  move the street check to *after* rolling those values instead of before,
  every cell's random values shift and the whole scattered layout changes,
  even though nothing about the visible output should have.
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
  sandbox, any turn so far. Everything above is read-the-code confidence.
  If the smoke harness reports errors, this turn's new surface area is the
  `cell.tint`/`setColorAt` addition inside `buildInstancedVariants` (the
  rest of that function is unchanged from turn 2 and was already exercised
  in review) and the two new variant definitions (check they follow the
  same `{ parts: [{ geo, mat, off }] }` shape the rest use — a typo'd key
  there fails silently rather than throwing, since the code only ever reads
  `part.geo`/`part.mat`/`part.off`).
