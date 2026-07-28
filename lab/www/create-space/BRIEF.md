# create-space — handoff

## What this is

Requested: a space colony simulator, camera on the inside of a spinning
cylindrical vessel, seeing only part of the colony at a time, pastoral, with
colonists you can hover (or tap on mobile) to read their thoughts while they
work and play.

Shipped this turn: a full working scene. `three.js` r169 (vendored, imported
from `/_kit/three.module.min.js`). One `CylinderGeometry` rendered `BackSide`
from the inside as the "ground", textured with a procedurally painted canvas
(patchwork fields, two lakes, a few winding paths). A thin glowing rod along
the spin axis stands in for the sun-line, lit by three point lights spaced
along it plus ambient/hemisphere fill. ~140 low-poly trees/cottages scattered
on the inner surface, oriented so their "up" points toward the axis (that's
also how "down" works for anything standing on the ground here — see
`orientToSurface`). ~20 colonists in 5 clusters, each with a name, a job, and
4 flavour-text thoughts; idle bob + a small side-to-side walk cycle. The
camera auto-orbits around the spin axis (this IS the "vessel rotating" —
see DECISIONS), and a visitor can drag/swipe to look around locally and
scroll/pinch to zoom. Raycasting picks the colonist under the pointer;
hover shows a tooltip on desktop, tap pins/unpins it on mobile. A slider
controls how fast the vessel spins, down to 0.

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

## The plan — what's not built yet, roughly in order

1. **Thought bubbles are static per-colonist, not "while they work and
   play."** Right now hover always shows a random pick from a fixed list of
   4; it doesn't change with what the colonist is currently doing (walking
   vs idle vs "at work"). Next step: give each colonist a simple state
   machine (idle/walk/work) and pick thoughts from a state-tagged pool —
   more the "in the moment" feel the brief asked for.
2. **Colonists don't interact with the scenery.** They walk a tiny
   sine-wave arc in place; they don't path between the trees/cottages or
   sit down at the pond. A small waypoint system (2-3 points per cluster,
   ease between them) would sell "working and playing" much better than the
   current idle wobble.
3. **No literal mesh-spin option.** If a future request wants the vessel
   itself visibly turning (e.g. for a screenshot from "outside" or a
   photo-mode), that's a real rewrite: either rotate `scatter` + `groundMesh`
   together each frame and keep the camera fixed at a point in world space
   (then the "toward axis" up-vector logic still holds, but colonists'
   walk-cycle math needs to account for their base position being in a
   rotating frame), or fake it with a rotating texture offset on the ground
   material only (cheap, but the trees/cottages/colonists wouldn't move with
   it, which would look wrong immediately).
4. **Performance headroom untested.** 140 scattered meshes + 20 colonists,
   all individual (no instancing). Fine on a decent laptop; unverified on a
   low-end phone GPU. If it chugs, the trees are the easy win —
   `InstancedMesh` for trunk+foliage would cut draw calls from ~140 to 2.
5. **No day/night cycle.** The brief said "pastoral," not "changing light,"
   so I left it static-lit; could tie the sun-rod brightness to `camTheta`
   for a nice slow light/shadow sweep if asked.

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
- **Tap vs. drag on the same pointerup listener** double-fires the tooltip
  pick unless you gate on movement distance — fixed with an 8px threshold,
  but if you add more gesture handling, keep that guard or taps will pin/
  unpin colonists every time a drag ends over one.
- I could not run this in a browser — no Bash/WebFetch/WebSearch in this
  sandbox. Everything above is read-the-code confidence, not verified
  confidence. If the smoke harness reports errors, start with the raycast
  parent-walk logic and the camera up/lookAt/rotate order — those are the
  parts most likely to have a sign or order bug I couldn't catch by eye.
