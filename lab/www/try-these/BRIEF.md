# try-these — handoff

## What this is

The requester (minormobius.bsky.social, watching a sibling thread where
anthonybecker.bsky.social asked the factory to "download a few cool obj files
from the internet, give them some basic UV mapped textures and create a
simple gallery for them") said "I wanna play, try it one more time" and this
site is that attempt, in its own new directory.

`/tmp/lab-refs.md` this turn carried the poly.pizza "Farm house" page (page
chrome only, zero geometry — confirmed, not new) and a partial fetch of
`opengameart.org/sites/default/files/house.obj` (truncated at 40,000
characters, still mid-`vt` block, no `f` lines at all). Both dead ends are
already documented exhaustively in `lab/www/download-few/BRIEF.md`, a sibling
site built from the same underlying request thread across many turns — read
that file before spending a turn re-investigating either link. Short version:
poly.pizza is a JS-driven picker with no raw-file fallback for any fetch;
`opengameart.org/sites/default/files/*.obj` links can never reach the real
asset pipeline (`scripts/lib/asset-sources.mjs` only recognises
`opengameart.org/content/<slug>` item pages, which carry the licence block);
and even a perfectly-fetched file would hit the refs-fetch 40k-character
budget long before reaching face data for any real-world mesh. None of that
has changed and none of it will change without a factory-level (out-of-tenant)
fix.

What shipped: rather than more procedural shapes (download-few's approach,
now at six), this site leans into the one thing it *can* do that download-few
doesn't — a real Wavefront OBJ parser plus a file upload / drag-drop feature,
so the visitor does the one click poly.pizza/opengameart need themselves (no
account, exactly as they said) and the page does the UV-mapping and texturing
live in the browser. Two boxes-and-cones stand-ins ("Bot", "Cottage") ship by
default so the gallery isn't empty on first load, both honestly labelled as
not the real downloads.

## Decisions

- **Upload-first, not fetch-first.** Given the sibling site's exhaustive proof
  that no path here can ever fetch real geometry (build-time or live — the
  CSP's `connect-src` doesn't include either host and never should, per
  `lab/www/CLAUDE.md`'s "Assets: on the domain, or not at all"), the honest
  and actually-useful move is a tool that accepts what the *visitor* fetches,
  not another apology page.
- **No addon loader** (`OBJLoader` isn't vendored — only core three.js r169
  is, per `lab/_kit/README.md`), so the parser here is hand-written: `v`/`vt`/
  `f` only, `vn` parsed-and-discarded (computeVertexNormals gives the flat
  low-poly look anyway), n-gon faces fan-triangulated, negative/relative
  indices resolved. No `.mtl`/`usemtl` support — out of scope for one turn.
- **Auto-UV via box/triplanar projection when a file's UVs are incomplete.**
  Real downloads from poly.pizza usually ship good `vt` data and use it
  as-is; a file with partial or no `vt` (or hand-authored test files) falls
  back to projecting each triangle onto the axis its face normal points away
  from most, scaled by the model's own bounding-box extent so the checker
  tiles at a sane density regardless of source scale. This is untested
  against a real multi-part download (nothing fetchable survived long enough
  to test against) — reasoned through by hand, not verified in a browser
  beyond the screenshot pass.
- **One `THREE.WebGLRenderer` per card**, driven by a single shared `rAF`
  loop rather than one loop per card — cheap to add cards without stacking
  callbacks. Every object (whether a parsed `Mesh` or a hand-built `Group`)
  gets wrapped in a recentring/rescaling pivot via `Box3.setFromObject`, so
  drag and auto-rotate behave identically for a 7-box robot and an arbitrary
  uploaded mesh.
- **Remove button per card**, with real disposal (`geometry.dispose()`,
  `material.dispose()`, texture `dispose()`, `ResizeObserver.disconnect()`,
  `renderer.dispose()`) — a page inviting repeated uploads for testing needs
  a way to not leak WebGL contexts across a long session.
- **Demo stand-ins are original geometry**, not derived from the poly.pizza
  models — boxes, a cone roof, nothing traced or copied — so there's no
  licence/attribution question to enforce (`lab-content-gate.mjs`'s
  attribution check only applies to real vendored assets under
  `assets/manifest.json`, which this site has none of).

## The plan (not built yet)

1. **If a future turn gets a real fetched `.obj` with face data** (only
   possible if `lab-fetch-refs.mjs`'s budget changes, or the requester posts
   a `poly.pizza/m/<id>` / `opengameart.org/content/<slug>` link that flows
   through the *real* asset pipeline into `lab/www/try-these/assets/` before
   the agent runs) — swap it in as a third default card, keep the upload
   feature regardless, and update the honesty copy in the footer/NOTE.
2. **Texture picker.** Right now every upload gets one auto-generated
   checker, hue-hashed from the filename. A small palette selector (checker
   density, a stripe/gradient alternative) per card would make "basic UV
   mapped textures" feel less like a fixed default — cheap addition, wasn't
   worth the time this turn against the parser/upload work.
3. **`.mtl` support** if a real multi-material download ever gets tested
   here — currently every uploaded file gets one material regardless of
   `usemtl` lines in the source, which is silently ignored.
4. Untested against an actual multi-thousand-triangle real-world download —
   only exercised against small hand-typed test OBJ text mentally traced
   through the parser. If a screenshot or a real upload shows the
   box-projected UV looking wrong on a real download, that's the first place
   to check, not the parser's face-triangulation (which is the same
   fan-triangulation approach download-few's parser already proved out).

## Gotchas

- **`lab/www/download-few/` is the same underlying request, different
  requester/thread branch, much longer history.** Don't duplicate its content
  wholesale or re-derive its findings from scratch — read its `BRIEF.md`
  first; it's five-plus turns deep on exactly the same two dead links.
- **No OBJLoader in the kit** — confirmed again this turn, matches what
  download-few already found. Any future 3D work on any surface should check
  `lab/_kit/README.md` before assuming a loader exists.
- **`ResizeObserver` sizing, not the "append all cards, then size" two-pass
  trick download-few needed** — this page sizes each canvas reactively via
  its own observer instead, which should sidestep the stale-width bug
  download-few hit on its first screenshot, but wasn't verified against an
  actual screenshot at the time of writing this file.
- Uploaded file size is capped at 8MB client-side as a sanity guard against
  freezing the tab on an absurd file — not a hard technical limit, just a
  guess at "reasonable for a low-poly model," worth revisiting if a real
  download turns out to need more.
