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

Shipped (turn 1): one file, `index.html`. A plain function
`buildJankIllustration(THREE, opts)` (shape choice, subdivision, stroke
count, jitter amount/speed, line opacity, palette, fill colour/opacity,
seed) builds a `THREE.Group` and returns `{ group, update(time), dispose,
options }`. The page wires it to a control panel (all sliders/selects
rebuild live), drag-to-orbit, auto-spin, a randomize-seed button, and two
export buttons: one downloads the generator's own source (recovered via
`.toString()`, not a hand-kept copy) as a standalone ES module with the
current panel state baked in as `defaultOptions`; the other downloads a PNG
snapshot.

Turn 2: the requester replied asking whether they could just link the
image and have it pulled in. They did — the harness fetches every link in
the request into `/tmp/lab-refs.md` before the agent runs — but what came
back for an image URL is the **raw undecoded file bytes** (WebP container,
pixel/VP8 data, EXIF block) dumped as garbled text, not a description or
anything an agent can read as a picture. There is no vision/image-decoding
step anywhere in this pipeline, so linking the image did not actually get
it "to me" in any usable sense — said so plainly in NOTE.txt this turn, so
that's not left implicit for whoever reads the next reply. No progress was
possible on "match the actual image" this turn because of that; instead
spent it on plan item 3 (below), which was doable without seeing the
reference: **fill can now be flat or crosshatch**, a small procedural
canvas texture (`makeCrosshatchTexture`, nested inside
`buildJankIllustration` like `hash`/`makeGeometry`, so the exported
generator stays self-contained) drawn once per rebuild — diagonal
crosshatch lines in a darker shade of the fill colour, tiled 4×4 over the
shape's existing UVs, material colour set to white so it multiplies
unmodified. New "Fill style" select, wired into `currentOptions()`,
`REBUILD_ON`, `DEFAULTS`, and `resetBtn`. Disposed alongside the material
in `dispose()`.

Turn 3: the request that arrived was the requester asking (elsewhere, of
the bot in general) "can you read images?", quoting this project as an
example of good work that "can't read images" — not a new ask, the same
question turn 2 already answered. `/tmp/lab-refs.md` fetched the same
image URL again and got back the same undecoded WebP bytes, plus the
GitHub profile/tree pages for `minormobius` (their account, not image
content) — nothing new, confirms turn 2's finding rather than changing it.
So this turn didn't re-litigate that; it worked plan item 2 instead:
**strokes are now real screen-space-width lines**, not 1px
`LineBasicMaterial`. Each stroke is a custom `THREE.ShaderMaterial` drawing
a quad billboard per edge segment (six vertices, non-indexed, two
triangles), thickened in the vertex shader by projecting both segment
endpoints to clip space, finding the screen-space perpendicular, and
offsetting by `uLineWidth` pixels — the hand-rolled version of three.js's
Line2/LineMaterial addon, which isn't vendored here. New "Line width (px)"
slider (1–8, default 2), wired into `currentOptions()`, `REBUILD_ON`,
`DEFAULTS`, `resetBtn`, and the `LIVE` label list. `buildJankIllustration`
now also returns `setResolution(w, h)`, which `resize()` calls (in device
pixels) so the line width stays a constant number of screen pixels rather
than drifting when the viewport or canvas changes — call it from any host
scene the exported module is dropped into, too; the export file's usage
comment says so.

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
- **Crosshatch is a texture on the existing geometry's UVs, not a new mesh
  or a shader.** Cheapest way to get a hand-inked fill without touching the
  wobble mechanism or needing per-shape UV work — `IcosahedronGeometry`,
  `SphereGeometry`, `BoxGeometry` and `TorusKnotGeometry` all ship usable
  UVs already. Untested on `blob` specifically (UVs come from the
  pre-displacement icosahedron, so the hatching should just look stretched
  wherever the displacement is largest, not broken — but I couldn't render
  it to confirm).
- **Fat lines via a hand-rolled shader, not `THREE.Line2`.** The correct
  three.js answer to "real line width" is the `Line2`/`LineMaterial`/
  `LineGeometry` addon trio, which is not vendored (only the core `three.js`
  module is, per the brief), so it was rebuilt from scratch: one quad
  (6 vertices, non-indexed, two triangles) per edge segment per stroke, a
  `ShaderMaterial` that computes the segment's screen-space direction from
  both endpoints and offsets each corner by half the line width in pixels
  along the perpendicular. Kept the CPU-side jitter model exactly as it was
  (same `hash`/`phase`/`update()` math) rather than moving wobble into the
  shader — displaced positions are still computed on the CPU once per
  frame into a scratch buffer, then scattered onto both `aStart`/`aEnd`
  attributes for every corner of every segment. More per-frame writes than
  the old direct `LineSegments` (six corners instead of one vertex per
  edge-geometry point) but still cheap at the capped detail levels.
- **`mesh.frustumCulled = false` on every stroke.** The geometry's
  `position` attribute is aliased onto `aStart`'s buffer purely so
  three.js knows the draw's vertex count (the shader never reads
  `position`), which makes any auto-computed bounding sphere reflect the
  base pose, not the live jittered one. Rather than recomputing a bounding
  sphere every frame for a shape that's on-screen almost by construction
  (the wobble amplitude is tiny relative to camera distance), culling is
  just off for these meshes.

## The plan

Roughly in priority order, once the requester says what's off (or asks for
more depth generally):

1. **The image still hasn't reached this build, and linking it won't fix
   that.** Turn 2 confirmed the harness only ever hands the agent raw file
   bytes for an image URL, not a description — there is no OCR/vision step
   in this pipeline. Turn 3's task re-fetched the exact same image URL
   (asked elsewhere, not as a new instruction to this build) and got back
   the same undecoded WebP bytes — confirms it, doesn't change it. The only
   way "match the actual picture" becomes possible is if a future turn's
   task text itself *describes* the image (subject, composition, line
   weight, colour story) — either because the requester writes that
   description, or because some future harness version adds an
   image-captioning pass before the agent runs. Don't re-attempt pulling
   the link again expecting a different result; it's a pipeline limit, not
   something this site's code can work around. If a description does show
   up, matching it is the highest-value next step and may mean a different
   geometry entirely (a figure, not a primitive) — the wobble/fill
   mechanism itself should transfer.
2. ~~Per-stroke width control~~ — done in turn 3, via a hand-rolled fat-line
   shader (see Decisions). **Not yet verified in a browser** — this is the
   single highest-risk piece of code in the file (a custom vertex shader,
   never rendered). If the harness's fix-pass or a report shows a blank
   viewport, a stretched/exploded mesh, or lines that don't track the
   wobble, start here — see Gotchas for the specific things to check first.
   Possible follow-up once confirmed working: a per-stroke width (thinner
   strokes read as "ghost" copies, thicker ones as the "main" line) instead
   of one global width.
3. ~~Crosshatch/scribble fill texture~~ — done in turn 2. Possible follow-up:
   a "scribble" variant (looser, less regular than the current straight
   diagonal grid) if the requester wants a rougher look; the current pattern
   is deliberately simple/legible.
4. **Depth-sorted line rendering** — right now `depthWrite: false` on the
   stroke material avoids most z-fighting between overlapping strokes, but at
   some camera angles on `torusKnot`/`blob` the strokes on the far side can
   draw over near-side fill oddly. Untested on a real device; watch for it
   first if a visual bug gets reported (separate from the fat-line risk
   above — this one predates it).

## Gotchas

- **`new Function` / `eval` is dead under this CSP** — see Decisions above.
  If a future edit here ever wants to build code dynamically from a string
  (for a "paste your own generator" feature, say), it cannot use eval-family
  APIs; it would need to actually parse/interpret data, not execute it as
  JS.
- **I could not load this in a browser.** No Bash, no WebFetch. Everything
  above is careful reading, not verification. The three.js API calls
  (`EdgesGeometry`, `IcosahedronGeometry(radius, detail)`,
  `TorusKnotGeometry` argument order, `.toBlob`) are from memory/vendored-
  version knowledge (r169), not confirmed against a running page — if the
  harness's one fix-pass flags something, look there first, and at the
  `update()` loop's per-vertex trig (an off-by-one in the `phase` array
  indexing is the likeliest spot for a silent glitch rather than a crash).
  **Turn 3's stroke shader is the highest-risk code in the file** — a
  hand-written GLSL vertex shader that has never compiled against a real
  GL context. If the strokes are missing/wrong after a browser pass, check
  in this order: (1) `ShaderMaterial` needs `attribute`/`uniform`/no
  `precision` qualifier issues — three.js auto-prepends `precision highp
  float;` for the vertex stage, so the explicit `precision mediump float;`
  in `STROKE_FRAG_SHADER` is required there (fragment shaders don't get an
  automatic one) but would be a duplicate/error if ever added to the vertex
  shader too; (2) `uResolution` being `[0, 0]` (e.g. if `setResolution` is
  never called before first render) makes every offset `NaN` via division
  by zero — `init()`'s first `rebuild()` happens after `resize()`, which
  should avoid this, but double check `currentOptions()`'s `w`/`h` aren't
  zero on a viewport that hasn't laid out yet; (3) the `aStart`/`aEnd`
  buffers are written every frame in `update()` but only *created* once in
  the stroke-building loop — a wrong `n`/`segCount` there would under/over-
  fill and either throw or silently draw garbage at the tail.
- **Detail is capped at 3** (icosahedron/sphere/box/torusKnot) and blob's
  effective subdivision is separately capped at 3 — deliberate, to keep the
  per-frame per-vertex jitter loop (`strokes × vertCount` trig calls every
  frame) from getting heavy on a phone. Raise with care and re-check the
  vertex counts if asked for "more detail."
- **A link in the request is not a way to show this pipeline an image.**
  `/tmp/lab-refs.md` fetches URLs generically (arXiv, READMEs, web pages)
  and for an image URL that means raw file bytes as text — a WebP
  container's compressed VP8 data and EXIF block, unreadable garbage to an
  LLM. Confirmed by reading it directly this turn. Don't spend a future
  turn trying to parse or "decode" that text; there's nothing recoverable
  in it.
- **Any new helper function used inside `buildJankIllustration` (like
  `hash`/`makeGeometry`) must be nested *inside* it**, not declared
  alongside it in the module. The export path recovers the generator by
  calling `.toString()` on the function itself — anything it calls that
  lives outside its own body would be missing from the downloaded file.
  Learned/applied when adding `hexToRgb`/`makeCrosshatchTexture` in turn 2
  and again for the whole fat-line stroke system in turn 3 (shader source
  strings, `resolution`, `dispScratch` — all nested inside the function, not
  module-level). Keep doing it that way for whatever comes next (scribble
  variant, per-stroke width, etc).
