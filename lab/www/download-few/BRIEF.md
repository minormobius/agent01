# download-few — handoff

## What this is

The request was "download a few cool obj files from the internet, give them
some basic UV mapped textures and create a simple gallery for them." The
requester's other lab sites (`create-space`, `hiiii-demo`) are both real 3D
scenes rather than UI widgets, so a 3D viewer gallery fits their taste — see
`lab/_profiles/anthonybecker.bsky.social.md`.

The build agent for this turn has no network tools at all (no WebFetch, no
Bash, no fetch of any external URL), so "download a few obj files" was not
literally possible. What shipped instead: three small solids (an icosahedron
"Gem", an octahedron "Shard", a pentagonal bipyramid "Spire"), each one
authored as real Wavefront OBJ text (`v`/`vt`/`f` lines) via a small
serialiser, round-tripped through a from-scratch OBJ parser written for this
page, turned into `THREE.BufferGeometry`, and textured with a canvas-drawn
`CanvasTexture` (no image files, no CDN). Each card has its own WebGL viewer:
auto-rotates until dragged, honours `prefers-reduced-motion` by holding still
(drag still works), and normalizes model size via `computeBoundingSphere` so
new shapes drop in without hand-tuning scale.

Everything lives in one `index.html`, per the single-file requirement — the
OBJ text lives in JS template data, not as separate `.obj` files on disk.

## Decisions

- **Procedural models, not fetched ones**, and said so plainly in the page
  copy, NOTE.txt and here — the honest option given the sandbox constraint,
  rather than silently shipping something and hoping nobody noticed the gap.
- **UV-per-face, not a shared UV atlas.** Every triangle gets its own full
  0–1 UV triangle (`(0,0),(1,0),(0.5,1)`), so each facet shows the whole
  texture rather than a sliver of it — this is what gives the faceted "gem"
  look and made both the OBJ data and the parser trivial to get right (no
  seam-matching, no shared-vertex UV averaging).
- **No addon loader.** `OBJLoader` isn't vendored in the kit (only core
  three.js is), so the parser here is intentionally minimal: triangulated
  `v/vt` faces only, no `vn`, no negative/relative indices, no `.mtl`. It
  reads exactly what this page's own serialiser writes — it is not a general
  OBJ loader and shouldn't be assumed to handle an arbitrary downloaded file
  without extending it first.
- **`side: THREE.DoubleSide`** on every material as cheap insurance against a
  hand-derived winding order being backwards on some face — I could not open
  a browser to check, so this trades a small render cost for not shipping an
  invisible-backface bug.
- **Per-model auto-rotate + drag**, no OrbitControls (not vendored) — a
  minimal hand-rolled pointer-drag rotator instead, same pattern as
  `wiremesh-solid`.

## The plan (not built yet)

1. **Real downloaded assets, if a future turn gets network/tool access to
   fetch actual `.obj` files** (or if a human vendors a couple into
   `lab/_kit/` the way `three.module.min.js` was). The parser here already
   speaks real Wavefront OBJ, so swapping in a genuinely third-party model
   should mostly work — but a real downloaded file will likely have quads,
   `vn` lines, negative indices, or a `usemtl`, none of which this parser
   handles yet. Extend `parseObj` before pointing it at anything but this
   page's own generated text.
2. **More/varied shapes.** Only three platonic-ish solids shipped, chosen
   because their vertex math is simple enough to write by hand correctly
   without a way to test. A torus knot or anything with curved surfaces would
   need generated (not hand-derived) vertex data — fine to add, just note it
   needs its own small generator function rather than literal coordinates.
3. **Texture variety.** The three canvas textures (radial gold gradient,
   diagonal teal stripes, purple blob "marble") are intentionally simple and
   fast to eyeball-verify were correct without a screenshot. Worth revisiting
   for something showing off UV mapping more clearly, e.g. a checkerboard
   that visibly wraps around the facets.

## Screenshot fix

The first-pass screenshot showed the Gem card's viewer rendering badly
non-square — far taller than its column, running off the bottom of the
viewport — with the Shard card also stretched, and only Spire (built and
measured last) coming out square. Cause: each card called `createViewer` (which
measures the container and calls `renderer.setSize`) immediately after being
appended, so earlier cards measured a transient column width from before their
siblings existed in the grid, and `setSize`'s default `updateStyle` baked that
stale pixel size onto the canvas permanently. Fixed by appending all cards
first and only then creating their viewers in a second pass, and by passing
`updateStyle: false` to `setSize` so the canvas keeps tracking the CSS-driven
100%/aspect-ratio box instead of a one-time pixel snapshot.

## Gotchas

- **No Bash/network tool this turn** — confirmed by the tool list, not
  assumed. If a future turn has WebFetch back, the honest move is to replace
  the procedural models with real fetched ones and update the copy/NOTE
  accordingly rather than leaving both.
- **Kit has no `OBJLoader`/addons** — only core `three.module.min.js` r169 is
  vendored (see `lab/_kit/README.md`). Any future 3D work here should check
  the kit before assuming a loader exists.
- **Icosahedron face-index list** is the standard 20-face table (matches the
  one three.js's own `IcosahedronGeometry` uses) — trusted from memory, not
  independently re-derived. If a facet looks wrong in the screenshot, that
  table is the first thing to re-check.
