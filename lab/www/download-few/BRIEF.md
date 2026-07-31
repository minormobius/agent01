# download-few — handoff

## This turn (2026-07-31)

No new instruction arrived from the requester — the thread only carried
reactions to the existing page ("those are good solids fr", "yes hahahha
yes", "Whoa") and a "sonnet says" note suggesting two specific poly.pizza
model pages (a "Robot" and a "Farm house") as candidates for real downloads,
each with an OBJ-format download button, no account needed. **Still no
network tool this turn** (confirmed from the tool list, same as last time),
so those two links could not be fetched — this build cannot follow them.

Two things worth flagging for whoever gets network access next:

- **Even with a build-time fetch, the live page could never fetch those URLs
  itself at runtime.** `lab/www/worker.js`'s CSP `connect-src` only allows
  `'self'`, `public.api.bsky.app` and `plc.directory` — poly.pizza is not on
  that list and widening it is explicitly "deliberate friction" per
  `lab/www/CLAUDE.md`. The only legitimate path is a *build-time* fetch (this
  agent's own harness, if ever given WebFetch) that downloads the .obj text
  and bakes it into the page as a string literal, the same way the current
  procedural models are baked in — never a client-side `fetch()` to a
  third-party host.
- A poly.pizza model page is HTML with a format-picker and a download button,
  not a raw file URL, so even a generic WebFetch may just return the page
  shell rather than the .obj bytes — the actual asset is very likely behind a
  JS-driven request. Worth checking what `WebFetch` actually returns for one
  of those two URLs before assuming it "just works."

Given no fetchable content, I worked the existing plan instead: added a
fourth model, **Block** (a cube, 12 triangles) with a hand-drawn **8×8
checkerboard** `CanvasTexture` — this was plan item 2 (more shapes) and item
3 (a texture that shows the UV wrapping more clearly than a gradient/stripe)
in one scoped change. Updated the "three small solids" copy to "four"
everywhere it appeared (meta description, og:description, the intro
paragraph). Did not touch the viewer, the parser, or the other three models —
`makeObjText`/`parseObj` are fully generic over triangle count, so the cube
needed only new vertex/face data and a new texture function, same shape as
the existing three.

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
   `lab/_kit/` the way `three.module.min.js` was). Two concrete candidates
   were suggested this turn — "Robot" and "Farm house" on poly.pizza (see
   "This turn" above for the exact URLs and the two caveats: CSP blocks a
   runtime fetch regardless, and the page itself may not hand back raw .obj
   bytes to a naive fetch). The parser here already speaks real Wavefront
   OBJ, so swapping in a genuinely third-party model should mostly work — but
   a real downloaded file will likely have quads, `vn` lines, negative
   indices, or a `usemtl`, none of which this parser handles yet. Extend
   `parseObj` before pointing it at anything but this page's own generated
   text.
2. **More/varied shapes** — partly done. Four platonic-ish solids now ship
   (added a cube, "Block", this turn); a torus knot or anything with curved
   surfaces would need generated (not hand-derived) vertex data — fine to
   add, just note it needs its own small generator function rather than
   literal coordinates.
3. **Texture variety** — partly done. Block's checkerboard shows the UV
   wrapping much more legibly than the other three (gradient, stripes, blob).
   Worth doing the same for the other models if the checkerboard reads well
   in the screenshot.

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
