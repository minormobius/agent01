# BRIEF — drumlight (create-space)

## What this is

The ask: a space colony simulator, camera inside a rotating cylindrical
vessel so you only ever see part of it, pastoral, and colonists you can
hover/tap to read their thoughts. This turn shipped a working first version:
a three.js scene (vendored, `../_kit/three.module.min.js`, no CDN) rendering
a habitat drum — ground, ~26 low-poly buildings, ~40 trees, two glowing
skylight strips, and 22 colonists with a name and a thought each. Raycasting
picks colonists on mouse hover and on tap; a floating card shows who and
what they're thinking. There's a pause-spin button (also defaults to paused
under `prefers-reduced-motion`). Responsive full-viewport canvas, 44px touch
targets on the one button, no horizontal scroll.

## Decisions

- **Camera fixed at the drum's axis; the colony rotates, not the camera.**
  I considered a camera that orbits along the inner wall instead (more
  literally "the camera is rotating"), but that needs either a moving rig
  with collision-safe framing or careful interpolation to avoid clipping
  through buildings. A camera sitting still at the axis while one `drum`
  Group spins around Z gets the same "only part of the colony visible at
  once" effect for free — everything sweeps sideways through frame — and it
  is one rotation call per frame instead of a flight path. Do not read this
  as the only valid interpretation; a walking/orbiting camera is a
  reasonable v2 if the requester wants a more embodied feel.
- **Thoughts are a static hand-written pool** (22 lines), cycled by index
  across colonists, not generated or tied to Bluesky in any way. This site
  has no ATProto dependency at all — no handle input, no sign-in, no saved
  state — because nothing about "watch a colony spin" needs identity. Adding
  `/_kit/pds.js` to let a visitor save a favourite colonist or a screenshot
  is plausible but wasn't asked for.
- **No shadows, no post-processing.** Kept the render simple
  (MeshStandardMaterial + Hemisphere/Ambient/Point light, no shadow maps) to
  stay comfortably inside a 20-minute turn and avoid perf cliffs on phones.
- Building/tree/colonist placement all goes through one `placeOnHull(obj,
  theta, z)` helper that sets position from an angle+length pair and a
  quaternion that aligns local +Y to the inward (axis-facing) direction —
  worth reusing rather than reinventing if you add more hull furniture.

## The plan — what's not built yet, in order

1. **Make hover feel richer than a static line.** Right now every colonist
   just shows one of 22 fixed sentences by `i % 22`. A visible next step:
   colonists doing a simple idle animation (bob/rotate slightly, maybe a
   walk cycle along a fixed path segment) so "at work and play" reads as
   actually alive, not just standing. Tackle this before content variety —
   motion sells the pastoral feel more than more text does.
2. **More colonist density and variety without hurting mobile perf.** 22
   was a conservative number for a first pass. If you raise it, watch draw
   calls — consider `InstancedMesh` for bodies/heads once count climbs much
   past ~40, since each colonist currently is 3 separate meshes.
3. **A day/night or light-strip animation.** The two skylight strips are
   static right now. Slowly varying their emissive intensity (or the
   PointLight at the axis) on a slow cycle would sell "you're watching time
   pass" without adding interaction complexity.
4. **Consider an orbiting-camera mode as an alternative/toggle** if the
   requester specifically wants the camera itself to feel like it's moving
   through the colony rather than the colony spinning past a fixed point —
   see the Decisions note above on why this turn didn't build it first.

## Post-screenshot fix

- The harness screenshot (camera near one end of the drum) showed the far
  bulkhead cap filling ~40% of the frame as a flat region indistinguishable
  from the black page background — the exact "dissolves into void" look the
  cap comment says it exists to prevent. Brightened `capMat` (`0x23262b` →
  `0x4b4f57`, plus a small emissive) so it reads as a lit wall instead of
  empty canvas. No other change — the rest of the render (ground, buildings,
  trees, HUD, hint text, pause button) matched the ask.

## Gotchas

- **`MeshBasicMaterial({ visible: false })` does NOT hide a mesh** — `visible`
  is an `Object3D` property, not a `Material` one, and the material
  constructor happily accepts and ignores it as a plain property with no
  effect on rendering. The colonist hit-boxes were originally built this way
  and would have rendered as ugly grey boxes around every colonist; fixed by
  setting `mesh.visible = false` on the mesh itself. Watch for this pattern
  anywhere else invisible pickable geometry gets added.
- **Invisible objects (`visible = false`) are still hit by `Raycaster`** —
  three.js does not skip them — which is exactly what makes the oversized
  invisible hit-boxes usable for touch targets. Don't "fix" this by trying
  to make them visible-but-transparent; `visible = false` is correct and
  intentional here.
- `quaternion.setFromUnitVectors(Y, inward)` only works cleanly here because
  every `outward`/`inward` vector this site computes lies in the XY plane
  (the hull's cross-section) — the resulting rotation axis always comes out
  as pure Z, which is exactly the drum's spin axis, so nothing twists. That
  stops being true the moment you place something whose "up" isn't
  perpendicular to Z (e.g. something on the end-cap bulkheads) — you'd need
  different orientation logic there.
- Never tested in an actual browser from this sandbox (no network/WebFetch
  here) — the harness screenshot pass after this build is the first real
  render. If it's dark or blank, check the console message the page's own
  try/catch surfaces before assuming three.js failed to load.
