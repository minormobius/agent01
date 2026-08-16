# download-few — handoff

## This turn (2026-08-01, fifth pass)

The requester linked a new host for the first time —
`graphics.stanford.edu/~mdfisher/Data/Meshes/bunny.obj`, the Stanford bunny —
after "sonnet says" had recommended it. `/tmp/lab-refs.md` carried all three
references this turn (bunny.obj, the poly.pizza Farm house page from two turns
ago, and the opengameart house.obj from four turns ago — the harness re-fetches
everything still reachable from the thread every turn, not just what's new).
None of the three yields usable geometry, for three different reasons worth
keeping straight:

1. **Bunny.obj** — the header declares 2503 vertices / 4968 faces, and the
   fetch is capped at 40,000 characters (the "page" budget, since a raw `.obj`
   isn't a paper or an article). Each `v` line is ~48 characters, so the
   budget runs out **mid-vertex-list, mid-number** (`v -5.86` — the literal
   last thing in the file) at roughly 800 of 2503 vertices. No `vt`, no `f`,
   nothing to build geometry from — a strictly worse case than house.obj
   two turns ago, which at least reached partial `vt` lines. **Any real-world
   mesh with a few thousand verts is going to hit this same wall** — the
   budget isn't a per-file quirk, it's a hard ceiling this pipeline can't
   cross for anything beyond a very small model.
2. **Poly.pizza Farm house page** — confirms what turn one only suspected:
   the fetch returns page chrome (nav links, view counts, a "Download" button
   label, footer credits) and zero geometry. It really is a JS-driven picker
   with no raw-file fallback for a generic fetch.
3. **Opengameart house.obj** — same conclusion as four turns ago, re-verified:
   truncated at 40,000 characters before any `f` line, still mid-`vt` block.
   Nothing new here; the earlier finding holds.

**New this turn: `graphics.stanford.edu` isn't in the real asset pipeline
either.** Checked `scripts/lib/asset-sources.mjs`'s `planAsset()` again (read
only — it's outside this tenant's directory and out of bounds to edit): it
recognizes exactly two source shapes, `poly.pizza/m/<id>` and
`opengameart.org/content/<slug>`. Stanford's own mesh archive isn't one of
them, so even a perfectly-shaped link here would never reach
`lab-fetch-assets.mjs` — a new resolver would need writing, which is a
factory-level change no tenant agent can make. Worth naming for whoever reads
this next so nobody spends a turn re-checking it: **this specific link is dead
at three independent layers** — the refs-fetch character budget, the asset
pipeline's source allowlist, and (unverified, but worth flagging) the Stanford
Scanning Repository's own licence is a bespoke academic-attribution grant
older than Creative Commons, not obviously one of the CC0/CC-BY/OGA-BY terms
the gate accepts — that last one would be a human call regardless.

With nothing fetchable yielding geometry, I worked the existing plan's
suggested next step for item 2: added a sixth model, **Loop**, a torus built
from two nested loop-generated rings (major circle × minor circle — 20×10
segments, 400 triangles) rather than the prism-with-caps topology Drum used.
This is the "push the generated-ring idea further" step the previous plan
named explicitly, and it's the first shape here with no flat caps at all — the
tube closes on itself in both directions, so it's the first genuinely smooth
closed surface on the page. Textured with a pink icing gradient, scattered
rectangular "sprinkles" at random rotations, and the same faint grid overlay
Spire uses, for the same reason: a torus swept into hundreds of small facets
needs *something* tracing the seams or the UV wrapping is invisible under the
gradient alone. Bumped "five" → "six" everywhere in the copy (meta
description, og:description, intro paragraph, the "these N are authored here"
code comment).

## Previous turn (2026-08-01, fourth pass)

The requester asked again for the same link — "Let's try this again! Please
download this obj and add it to the scene: opengameart.org/sites/default/
files/house.obj" — and this time the harness *did* fetch it into
`/tmp/lab-refs.md` (earlier turns had no fetch at all). Two things that
finding actually settles, both worth knowing before anyone tries this link
again:

1. **The text is truncated before a single `f` (face) line appears.** It cuts
   off mid-`vt` list at the 40,000-character budget, having only gotten
   through the `v`/partial-`vt` blocks of what "o house_Cube.002" marks as
   the *first* named sub-object in a multi-part scene. There is no face data
   at all in what's fetched, so even setting the pipeline question aside,
   there was nothing here to build geometry from this turn.
2. **This is the wrong pipeline for the job anyway, and it's worth being
   precise about why.** `/tmp/lab-refs.md` comes from `lab-fetch-refs.mjs` —
   reference material, read-only, explicitly "not instructions" and not
   vetted for licence or size. The pipeline that actually places bytes on the
   domain is `scripts/lab-fetch-assets.mjs`, gated by licence, attribution,
   and a size cap, and it runs *before* the agent starts (see
   `lab/www/CLAUDE.md` "Assets: on the domain, or not at all"). I checked
   whether it ran for this link: it didn't, and it couldn't have —
   `planAsset()` in `scripts/lib/asset-sources.mjs:191` only matches
   `opengameart.org/content/<slug>` (the item's page, which carries the
   "License(s):" block the resolver reads), and the requester's link is
   `opengameart.org/sites/default/files/house.obj` — a raw file URL with no
   such page to check licence or attribution against. `planAsset()` returns
   `null` for it, so `lab-fetch-assets.mjs` silently skips it (its filter at
   line 71 drops any URL the resolver doesn't recognise) and never even
   attempts the download. **This is worth putting in the reply to the
   requester in plain terms**: the raw-file link looks like the "easy" one
   because it skips the JS-driven picker poly.pizza needs, but it's actually
   the one case the asset pipeline can't handle at all, for the opposite
   reason — there's no licence page attached to check. The fix on their side
   is to link the *item page* instead (something like
   `opengameart.org/content/<some-slug>`), which is what the resolver is
   built to read.

With nothing fetchable to add, and both of those findings written up above,
I spent the rest of the turn on the one piece of the still-open plan item 1
("real downloaded assets") that's genuinely gradeable without a live model to
test against: hardened `parseObj` against the OBJ constructs a real download
is likely to use that this page's own generator never produces —
`v//vn`-style faces, faces with no uv at all (default to `(0,0)`), and
negative/relative vertex indices (`resolveIndex()`, new). None of this could
be exercised against the actual house data (no face lines survived the
truncation), so it's reasoned through rather than tested: traced by hand
against the token shapes each construct produces. Quad/n-gon faces needed no
change — the fan-triangulation loop already handled any corner count. Left
`usemtl`/multi-material out; nothing here needs it yet and it's a much bigger
addition (would mean multiple materials per mesh, not a data-shape fix).
Updated the footer copy's `v/vt` → `v/vt/vn` claim to match.

## Previous turn (2026-08-01, third pass)

The requester's new message was just "daaaaaaaaaddd" — a reaction, not an
instruction. It's a reply inside a side-conversation where they'd just
explained to someone else in the thread ("Yeah if you bring links it can pull
that data but it can't go out to the searchables. It's on the list of todos
but Claude is saying some nonsense abt preconditions") that this build can't
go fetch its own links — i.e. they already understand the constraint from
earlier turns' NOTE.txt and are exasperated/joking about it, not asking for
anything new. **Still no WebFetch/Bash/network tool this turn either**
(checked the actual tool list, same as every prior turn) — the constraint
that message is about hasn't changed.

With no actionable new ask and no fetch access, worked the existing plan
(item 3, texture legibility): added a faint 8×8 grid overlay on top of
Spire's marbled texture, so its UV wrapping reads as clearly as Block's
checkerboard or Drum's concentric rings do — the blobs alone didn't trace the
triangle boundary the way those two do. Left Gem (radial spokes already
radiate from the UV triangle's shared vertex) and Shard (diagonal stripes
already show orientation) alone — both already had a directional pattern
doing the same job a grid would, so redoing them risked making them worse
without a screenshot to check against mid-turn.

## Previous turn (2026-07-31, second pass)

The requester's new message pointed specifically at the opengameart.org link
they'd given earlier ("what about this one?") — a fair question, since that
one is a **direct file path** (`opengameart.org/sites/default/files/...`),
unlike the poly.pizza pages which are HTML with a format-picker behind a
download button. Worth trying first if a future turn gets WebFetch: a
`sites/default/files` URL is far more likely to hand back raw bytes than a
JS-driven picker page.

But **this turn still had no WebFetch/Bash/network tool at all** — checked
against the actual tool list, not assumed, same as last turn. So the
opengameart link could not be fetched either, and nothing changed about the
CSP problem noted below: even a build-time-fetched file still has to be baked
into the page as a string literal, never fetched client-side, because
`connect-src` doesn't allow opengameart.org any more than it allows
poly.pizza.

Since no new content was fetchable, I worked the existing plan (item 2, more
shapes) instead: added a fifth model, **Drum** — a hexagonal prism/cylinder
stand-in built from two generated six-point rings plus two fan caps (24
triangles total), textured with a brushed-steel concentric-ring
`CanvasTexture`. This is the first model here built from a *loop-generated*
ring rather than literal hand-typed coordinates for every vertex (Spire's
ring was 5 points and unclosed at the ends; Drum closes both ends with caps),
which is the shape of what a real curved surface (true cylinder/torus) would
need — more segments, same pattern. Updated "four" → "five" everywhere in the
copy (meta description, og:description, intro paragraph, the "these N are
authored here" code comment).

## Previous turn (2026-07-31, first pass)

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

No turn on this build so far has had network tools (no WebFetch, no Bash, no
fetch of any external URL), so "download a few obj files" has not been
literally possible yet. What shipped instead: six small solids (an
icosahedron "Gem", an octahedron "Shard", a pentagonal bipyramid "Spire", a
cube "Block", a hexagonal drum "Drum", a torus "Loop"), each one
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
- **Drum uses two apex points + two rings, not a shared-vertex ring loop.**
  Matches the existing Spire pattern (apex + ring) rather than introducing a
  new topology style, and sidesteps having to get a ring-to-ring quad winding
  right without being able to render it — the fan-triangulation-from-a-pole
  approach was already proven correct by Spire.

## The plan (not built yet)

1. **Real downloaded assets — dead-ended at three layers for every link tried
   so far, not just a tool gap.** Confirmed across turns:
   - The refs-fetch character budget (40k for a "page") runs out around
     ~800 vertex lines for a real-world mesh — long before any `f` line, for
     *any* model with a few thousand vertices. This isn't fixable by trying a
     different link shape; it's a hard ceiling of `lab-fetch-refs.mjs`.
   - `lab-fetch-assets.mjs` (the pipeline that actually vets and commits
     bytes) only recognizes two source shapes via `planAsset()` in
     `scripts/lib/asset-sources.mjs:191`: `poly.pizza/m/<id>` and
     `opengameart.org/content/<slug>` (the item page, where the licence
     block lives — not a raw file URL, and not `graphics.stanford.edu` or any
     other host). Both are outside this tenant's directory to fix.
   - Licence: even a recognized host isn't automatically clear — e.g. the
     Stanford 3D Scanning Repository's own terms predate Creative Commons and
     don't obviously map onto the CC0/CC-BY/OGA-BY allowlist. That's a human
     judgement call per `lab/www/CLAUDE.md`, not something to guess past.

   **The one path still open**: a `poly.pizza/m/<id>` or
   `opengameart.org/content/<slug>` link, posted by the requester, would flow
   through the existing pipeline with no code change here at all, straight
   into `lab/www/download-few/assets/` with licence + attribution already
   enforced by `lab-content-gate.mjs`. Everything else tried so far (raw file
   URLs, graphics.stanford.edu, relying on the refs-fetch text) is a dead end
   — don't re-investigate any of those three without new information.
   `parseObj` was hardened two turns ago (v//vn, uv-less faces, negative
   indices) against constructs a real download is likely to use; still
   untested against an actual face list, since none has survived a fetch yet.
   Check it renders before trusting the hardening, once one does.
2. **More/varied shapes — done for now, in a real sense this time.** Six
   solids ship, covering two distinct techniques: hand-authored polyhedra
   (Gem, Shard, Spire, Block) and loop-generated ring-sweeps, both variants of
   which are now built — a capped prism (Drum) and a fully closed torus
   (Loop). A seventh would need either a real download (item 1, currently
   blocked at every layer above) or a genuinely different generation
   technique, not just more segments on the same sweep — e.g. a
   superellipsoid/supershape formula, or a noise-displaced sphere.
3. **Texture variety** — done for now. Block's checkerboard, Drum's
   concentric rings, Spire's grid-over-marbling, and now Loop's
   sprinkles-over-grid all make the UV wrapping legible; Gem's radial spokes
   and Shard's diagonal stripes already trace the triangle's orientation a
   different way. If a screenshot ever shows one of these six reading badly,
   that's the one to revisit — nothing else obvious left to do here without
   new geometry (item 1 or 2).

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
- **`/tmp/lab-refs.md` and the real asset pipeline are two different things,
  and it's easy to conflate them.** The refs file is `lab-fetch-refs.mjs` —
  unvetted reference text, read-only, character-budget-truncated, and it ran
  this turn for the first time across this build's history. The asset
  pipeline is `lab-fetch-assets.mjs` — licence-checked, attributed, capped,
  and runs before the agent starts, into `lab/www/download-few/assets/`
  (doesn't exist yet, meaning it has never fired for this site). Getting real
  fetched OBJ *text* in `/tmp/lab-refs.md` is not the same as getting a
  vetted asset — don't mistake one turn's presence for the other's.
- **`opengameart.org` direct file links (`/sites/default/files/...`) can
  never be resolved by `lab-fetch-assets.mjs`**, by design — `planAsset()` in
  `scripts/lib/asset-sources.mjs` only recognises `/content/<slug>` item
  pages, because that's the page with the licence on it. Don't spend a future
  turn re-investigating this; it's a link-shape problem the requester has to
  fix on their end (link the item page), not a bug in this site.
- **`/tmp/lab-refs.md`'s 40k-character "page" budget cannot fit a real mesh.**
  A 2503-vertex OBJ (Stanford bunny) hit the wall around 800 `v` lines, mid-
  number, with zero `vt`/`f` content. This isn't specific to that file —
  any plausible download-a-few-cool-models mesh has thousands of vertices, so
  this ceiling will bite again on the next fetchable link too. Don't expect a
  future fetch of a *different* raw `.obj` URL to fare better; the fix would
  have to be in `lab-fetch-refs.mjs`'s budget or a smarter partial-parse, both
  outside this tenant's directory.
- **`graphics.stanford.edu` is not a recognised source in
  `scripts/lib/asset-sources.mjs`** — only `poly.pizza/m/<id>` and
  `opengameart.org/content/<slug>` are. A link to Stanford's mesh archive (or
  any other host) silently never reaches `lab-fetch-assets.mjs`, regardless of
  the refs-budget problem above. Two independent reasons this specific link
  can never work, not one.
