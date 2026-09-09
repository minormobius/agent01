# BRIEF — pipedream

## What this is

A pipedream screensaver — classic 3D-Pipes-style growth — except the pipes
carry text, letter by letter, imprinted along the tube. Original framing from
the requester: "if screensavers were invented after microblogging." The
source of the letters is a textarea the visitor types into, OR a Bluesky
handle they type (via `kit.handleInput`), whose recent visible posts
(`getAuthorFeed` + `kit.visible`) become the letter stream, OR — if both are
empty — an infinite shuffle of a built-in neutral word list. That part is
unchanged since turn 1.

**Turn 2 (this turn)** answered two follow-ups from the requester: *"The real
pipedream was 3-dimensional. Can you do that?"* and *"The letters seem to
only appear at the 'head' of the pipe, I was thinking more it should stay on
the sides as the pipe goes along."* Both are now shipped — the renderer is a
full rewrite from 2D canvas to three.js (r169, vendored, `../_kit/three.module.min.js`):

- A real 3D grid (10×8×8 cells), six-directional random walk (±x, ±y, ±z),
  same "72% chance to continue straight" bias as before.
- Each new grid step is a `CylinderGeometry` segment (shared geometry, one
  material per pipe for its hue) plus a small sphere at every joint to keep
  corners (and straight runs) looking continuous rather than faceted.
- **Letters are now decals mounted on the tube's own surface** — a small
  transparent plane, textured with the next character, positioned flush
  against the side of the cylinder (offset outward by its radius) and
  oriented so the letter's "up" runs along the pipe's direction of travel.
  This directly answers the second ask: the letter is not a flat glyph
  stamped once at the growing tip's centerline, it's part of the tube's skin
  and stays there as the pipe extends past it.
- A slowly auto-orbiting camera (no `OrbitControls` — that addon isn't
  vendored) circles the whole grid so the 3D shape actually reads; its rate
  is tied to the same speed slider as pipe growth, and frozen along with
  everything else when motion is off.
- Persistent draw is kept (meshes accumulate in the scene, nothing is
  redrawn every frame) — same reasoning as before, now expressed as "don't
  rebuild geometry you don't have to." `fullReset()` at ~50% grid fill
  disposes materials (not the shared geometries, not the cached letter
  textures) and respawns all pipes, replacing the old canvas clear/refill.
- HUD, speed slider, motion auto/on/off, text box, handle box: all untouched
  — same DOM, same event wiring, same `kit.handleInput`/`bskyGet` calls.

## Decisions

- **Six-direction grid walk, not a smooth/curved 3D path.** Matches the
  original 2D pipe-growth logic (which the requester hadn't objected to) and
  keeps geometry cheap: every segment is exactly one grid cell long, so a
  single shared `CylinderGeometry` and `SphereGeometry` cover every pipe —
  no per-segment geometry allocation, only a per-pipe material for hue.
- **Letters as surface decals, not a texture wrapped around the cylinder
  itself.** A wrapped-texture approach (bake the letter into the cylinder's
  own material map, repeated around the circumference) was considered and
  rejected for time: it needs per-letter-per-hue texture variants (or a
  second UV pass) to keep the coloured body and a legible glyph distinct.
  A separate decal plane, mounted on the surface, gets "letters on the
  side" with one cached texture per character regardless of pipe colour.
- **Fixed-size 3D grid (10×8×8), not tied to window pixel dimensions.**
  The old 2D grid was `cols = ceil(w/CELL)` etc., which made sense for a
  flat canvas; a 3D scene is framed by the camera, not the pixel grid, so
  window size now only drives `renderer.setSize`/`camera.aspect` on resize,
  never a full grid rebuild. Resizing (e.g. a phone's URL bar collapsing)
  no longer wipes the pipes mid-animation — an improvement over turn 1,
  which did a full reset on every `resize` event.
- **No `OrbitControls`** — it's not vendored in `/_kit/` (README says so
  explicitly: "Addons are not included"). A hand-rolled auto-orbit stands in.
  If a future turn wants visitor-driven camera control, that addon would
  need to be vendored by a human first (same rule as three.js itself), or
  it'd need to be written by hand against core `THREE` (raycasting +
  pointer events for drag-to-orbit is doable but is its own chunk of work).

## The plan (not built yet, in order)

1. **Untested in a real WebGL context by me.** Per the harness note, a
   screenshot pass happens after this turn ends. If the canvas renders as a
   black/blank frame: check that `../_kit/three.module.min.js` resolves
   correctly from `/pipedream/` (it should, mirrors the existing
   `../_kit/tokens.css` pattern) before anything else — a failed module
   import is the single most likely total-failure mode, and it will throw
   in the console rather than degrade gracefully (no try/catch around the
   `import`, since a lab page can't do anything useful without three.js
   here regardless).
2. **Density control**, still not built (flagged since turn 1) — a slider
   for `pipeCount`/grid size, same pattern as the speed slider.
3. **Camera drag-to-orbit**, if the requester wants visitor control rather
   than the current fixed auto-orbit. Needs pointer event handling (rotate
   the orbit angle/height on drag) rather than the `OrbitControls` addon,
   which isn't vendored. Should stay separate from the existing `touch-action:
   none` on the canvas so it doesn't fight page scroll on mobile.
4. **Perf tuning if it turns out to matter on a real phone**: at up to 9
   pipes growing every 90ms/speedMul until ~50% grid fill (320 of 640
   cells), the scene can hold on the order of 800–1000 small meshes between
   resets. Geometries are shared so this is mostly draw-call count, not
   vertex count — if it stutters on real hardware, the first lever is
   lowering `fillLimit`'s multiplier (reset sooner) before touching anything
   else.
5. **Letter orientation is "good enough," not verified precise.** The decal
   basis (`xAxis`/`yAxis`/`zAxis` from cross products) should put each
   letter roughly upright and reading along the pipe's direction of travel,
   but the exact handedness wasn't checked against a render — some letters
   may appear mirrored or rotated 180° depending on travel direction. Worth
   a look once there's a screenshot; if it's wrong it's a sign-flip in
   `sideVectorFor` or the `xAxis`/`yAxis` cross-product order, not a deeper
   problem.

## Gotchas

- `CylinderGeometry`'s `openEnded` is the **6th** constructor argument —
  easy to miscount (`radiusTop, radiusBottom, height, radialSegments,
  heightSegments, openEnded, ...`).
- `Material.dispose()` does **not** dispose textures attached via `.map`.
  This turn relies on that: the letter-texture cache is shared and reused
  forever, and `fullReset()` disposes every mesh's material every reset
  without needing to special-case decal materials to avoid killing the
  cache.
- Grid step length is always exactly `CELL` (one cell, one axis, per move)
  — that's what makes sharing a single `CylinderGeometry` across every
  segment possible. Don't introduce diagonal or multi-cell moves without
  also handling per-segment geometry again.
- `getAuthorFeed` post text is `item.post.record.text`, not
  `item.post.text` — checked against the fixture in turn 1, still true,
  still easy to get wrong from memory.
- three.js addons (`OrbitControls`, loaders, post-processing) are **not**
  in `/_kit/` — only the core ES module. Confirmed by re-reading
  `lab/_kit/README.md` this turn before reaching for one.
