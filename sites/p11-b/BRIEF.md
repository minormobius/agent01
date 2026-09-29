# chladni-sim — handoff

## What this is

Ask: a Chladni plate simulation, Rust-in-wasm physics, three.js rendering, a
few preset frequencies on a default plate, and "get a little didactic with it."

Shipped this turn: a complete, working single-page site. A square plate
(three.js mesh + a shared-buffer wireframe overlay, no lighting needed) whose
height field is `f(x,y) = cos(nπx)cos(mπy) − cos(mπx)cos(nπy)` for six preset
(n,m) pairs, oscillating in time as a standing wave. A few hundred "sand"
grains (three.js Points) do gradient descent down `|f|` plus jitter scaled by
local amplitude, so they visibly migrate to the nodal lines over a few
seconds — the actual 1787 demonstration, reproduced with a formula. Controls:
preset buttons, amplitude slider, grain-count slider, play/pause, scatter.
A didactic section below explains nodes/antinodes, the two-term formula, why
n≠m matters, and is explicit that the plate/boundary model and the "Hz"
labels are illustrative, not measured.

## Decisions

- **No Rust/wasm.** The sandbox has no compiler and no network, and
  `lab/_kit/` has no vendored module for this — the kit's wasm section lists
  exactly three (`wave_md`, `codescan_ocr`, `pds_car_parser`), none of them
  applicable. Built the physics in plain JS instead of shipping a page that
  silently does nothing, per the task's own instruction for this situation.
  If a human vendors a Chladni/plate-physics wasm module into `lab/_kit/wasm/`
  later, the JS math in `index.html` (the `chladni()` function and the two
  update loops) is the only thing that would move into it — the three.js
  scene, controls and grain logic are runtime-agnostic and would not need to
  change.
- **Square free-plate model, not a solved PDE.** Used the standard teaching
  approximation (two cos·cos grids, subtracted) rather than attempting a real
  eigenvalue solve for a specific boundary condition — correct for the
  "explain vibration modes" ask, wrong if someone later wants this to match a
  specific real plate.
- **Grain migration is gradient descent on `|f|`, not a particle-in-cell or
  bouncing-ball simulation.** Visually convincing and fast; not physically
  derived. Said so in the page copy rather than overclaiming.
- **Shared-buffer wireframe trick**: the solid mesh and the line overlay for
  the same grid share one `THREE.BufferAttribute` position object, so heights
  are written once per frame and both draw calls pick it up — avoids
  `computeVertexNormals()` and any lighting setup entirely. If you add
  lighting later, this trick still works, but you'll need real normals too.
- No PDS/sign-in — this site has no state worth persisting per visitor, so it
  intentionally does not touch `pds.js` or `handleInput`.

## The plan (not built yet, in order)

1. **A custom "drive frequency" slider** distinct from the mode picker, so a
   visitor can sweep frequency continuously and watch the pattern snap
   between modes near resonance — closer to how a real signal-generator
   demo works, and more didactic than fixed presets. Needs a mapping from
   continuous frequency back to a blended (or nearest) mode shape; the
   current code only supports discrete (n,m).
2. **A circular-plate option.** Real Chladni demonstrations are usually
   circular. Would need a different closed-form mode approximation (Bessel-
   function based, not cos·cos) and a differently shaped grid/mesh — a bigger
   change than it sounds, don't underestimate it.
3. **Orbit/tilt control on the camera.** Currently fixed camera angle; a
   drag-to-orbit would help visitors see the relief better, but `OrbitControls`
   is not vendored in `lab/_kit/` (core three.js only) — would have to be
   hand-written against raw pointer events, not imported.
4. Tune `MAX_HEIGHT` / color-mix clamp — high (n,m) presets saturate to full
   accent color across most of the plate since `|f|` frequently exceeds 1;
   a nonlinear (e.g. sqrt or log) color mapping would look better than the
   current linear clamp.

## Gotchas

- `BufferGeometry.setIndex()` accepts a plain JS array directly in three.js
  r169 (auto-picks Uint16/Uint32) — no need to wrap in a TypedArray yourself.
- Sharing one `BufferAttribute` instance across two `BufferGeometry` objects
  works for updates (`needsUpdate` flips once, both draw calls see it) — did
  not need to verify this against a live renderer, but it follows directly
  from three.js's `WebGLAttributes` keying by attribute object identity, not
  by geometry. Worth an actual visual check if the harness screenshot looks
  wrong in a way that smells like stale geometry.
- Kit's `tokens.css` styles `input[type=text]`/`input:not([type])` but not
  `input[type=range]` — the range sliders here are unstyled browser defaults
  except for the local CSS added in this file's `<style>` block.
