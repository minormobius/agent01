# BRIEF — reproduce-this ("Jank Engine")

## What this is

Requested: reproduce "this illustration" (a Bluesky post captioned "jank
illustration" by @scanstone.bsky.social) in three.js, highly customizable
with controls, with the generator code exportable.

**I never saw the image.** This build has no network tools at all — no
WebFetch, no image loading — and the task only carried the post's text, not
its embed. So rather than guess a specific picture wrong, I built a
generator for what "jank illustration" describes as a *style*: a solid flat
fill underneath, with several copies of its own wireframe outline wobbling
out of sync on top, so the outline never quite agrees with itself or with
the fill. That mismatch is the whole effect.

Shipped: one file, `index.html`. A plain function `buildJankIllustration(THREE,
opts)` (shape choice, subdivision, stroke count, jitter amount/speed, line
opacity, palette, fill colour/opacity, seed) builds a `THREE.Group` and
returns `{ group, update(time), dispose, options }`. The page wires it to a
control panel (all sliders/selects rebuild live), drag-to-orbit, auto-spin,
a randomize-seed button, and two export buttons: one downloads the
generator's own source (recovered via `.toString()`, not a hand-kept copy)
as a standalone ES module with the current panel state baked in as
`defaultOptions`; the other downloads a PNG snapshot.

## Decisions

- **Style generator, not image reproduction.** Given the caption but not the
  picture, guessing specific composition/subject would very likely be wrong
  in a way that's hard to fix incrementally. A style with lots of knobs at
  least lets the requester dial toward what they actually meant, or say
  precisely what's off. Said so plainly on-page (`#approx`) and in NOTE.txt
  — no overclaiming this is "the" illustration.
- **`.toString()` instead of `new Function(source)` for the export
  path.** First draft kept the generator as a template-literal source string
  and used `new Function('return ' + source)()` to build the live scene from
  it, specifically so the on-page copy and the download couldn't drift. That
  requires `'unsafe-eval'` in `script-src`, which this CSP does **not**
  grant — only `'wasm-unsafe-eval'`, which covers WebAssembly, not
  `eval`/`Function`. Would have been a silent dead page. Fixed by declaring
  `buildJankIllustration` as a normal function and reading its source back
  with `.toString()` for both the `<details>` preview and the downloaded
  file — same guarantee (can't drift, since it's introspecting the actual
  running function), zero CSP risk.
- **Jitter is a deterministic per-vertex hash of a `seed`, not `Math.random()`
  per frame.** So a given seed always wobbles the same way — shareable/
  reproducible — and "Randomize seed" is a real control, not just visual
  noise.
- **Every control rebuilds the whole illustration** rather than mutating a
  shared live options object in place. Simpler and correctness-safe (no
  stale closures over a param object that gets replaced), and the geometries
  here are small enough that a full rebuild on every slider tick is cheap.
- **Rotation happens on the group, not the camera** (camera is fixed),
  matching the existing convention in `wiremesh-solid/`.
- **No fixed subject/character** — a generic wobbly solid rather than
  anything figurative, so there's nothing here that could misfire as
  depicting a real person or a specific meme without having seen the
  reference.

## The plan

Roughly in priority order, once the requester says what's off (or asks for
more depth generally):

1. **If they link or describe the actual image**, the highest-value next
   step is matching its actual composition — subject, line weight, colour
   story — rather than tuning this generic generator further. That may mean
   a different geometry entirely (a figure, not a primitive), which this
   generator's shape switch doesn't cover; the wobble/fill mechanism itself
   should transfer.
2. **Per-stroke width control.** WebGL line width is capped at 1px on most
   platforms (`LineBasicMaterial.linewidth` is a known no-op there), which is
   why the "ink" look currently comes entirely from overlapping jittered
   strokes rather than thick lines. A proper fix is billboarded quad strokes
   (screen-space thickened lines) instead of `LineSegments` — more work, but
   would make the "line weight" of the jank a real, controllable thing
   rather than an emergent side effect of stroke count.
3. **Crosshatch/scribble fill texture** instead of flat `MeshBasicMaterial`
   fill — closer to a hand-inked look than a solid flat colour. Could be a
   small procedural canvas texture generated at build time (still no CDN,
   still same-origin).
4. **Depth-sorted line rendering** — right now `depthWrite: false` on the
   line material avoids most z-fighting between overlapping strokes, but at
   some camera angles on `torusKnot`/`blob` the strokes on the far side can
   draw over near-side fill oddly. Untested on a real device; watch for it
   first if a visual bug gets reported.

## Gotchas

- **`new Function` / `eval` is dead under this CSP** — see Decisions above.
  If a future edit here ever wants to build code dynamically from a string
  (for a "paste your own generator" feature, say), it cannot use eval-family
  APIs; it would need to actually parse/interpret data, not execute it as
  JS.
- **I could not load this in a browser.** No Bash, no WebFetch. Everything
  above is careful reading, not verification. The three.js API calls
  (`EdgesGeometry`, `IcosahedronGeometry(radius, detail)`,
  `TorusKnotGeometry` argument order, `LineSegments`, `.toBlob`) are from
  memory/vendored-version knowledge (r169), not confirmed against a running
  page — if the harness's one fix-pass flags something, look there first,
  and at the `update()` loop's per-vertex trig (an off-by-one in the
  `phase` array indexing is the likeliest spot for a silent glitch rather
  than a crash).
- **Detail is capped at 3** (icosahedron/sphere/box/torusKnot) and blob's
  effective subdivision is separately capped at 3 — deliberate, to keep the
  per-frame per-vertex jitter loop (`strokes × vertCount` trig calls every
  frame) from getting heavy on a phone. Raise with care and re-check the
  vertex counts if asked for "more detail."
