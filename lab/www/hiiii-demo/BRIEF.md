# my commute — handoff

## What this is

Requested: "My Commute" — a demo of a super-light single-person watercraft
riding from Lake Merritt (Oakland) to Oracle's campus in Redwood Shores. This
is a brand-new site, `hiiii-demo/`, one turn in. What shipped: a full 3D
chase-cam ride in three.js — a boat model with a rider, a stylized route from
Lake Merritt through the Oakland Estuary, across the open bay past the San
Mateo Bridge, into the Redwood Shores lagoon, procedurally generated land on
both banks that widens mid-bay and narrows at each lagoon, a scrolling water
texture, a spawn-pooled wake trail, four in-world landmark labels, an "arrived"
callout, and a HUD with distance-remaining / ETA and play/pause/restart/speed
controls. It runs start to finish unattended and is a complete, playable demo,
not a skeleton.

## Decisions

- **No real GIS data, and the copy says so.** There's no network access in
  this sandbox and no coastline file vendored in the kit, so the land masses
  are procedurally generated blobs along the route, not traced coastline. The
  HUD explicitly labels the route "a stylized route, not a nautical chart" and
  the distance/ETA numbers as estimates. Don't let a future turn quietly drop
  that caveat while also not fixing the underlying accuracy — if real
  coastline ever gets vendored, update both together.
- **No handle input, no PDS.** This is a fixed simulation with no
  personalization angle — nobody's identity or saved state makes it better,
  so I skipped `kit.handleInput` and `/_kit/pds.js` entirely rather than
  bolting on a leaderboard nobody asked for. If a later ask is "let me save my
  best ETA" or "race a friend," that's the moment to bring `store.postScore` /
  `store.scoresOf` in — see the pds.js section of `lab/_kit/README.md`.
  Following the requester's own profile note: they like a real 3D scene over a
  UI-heavy tool, so I leaned all the build time into the ride itself.
- **Arc-length parametrization via `curve.getPointAt`/`getTangentAt`**, not
  raw `t` on the CatmullRomCurve3 — otherwise the boat visibly speeds up
  through the tightly-spaced waypoints and crawls through the sparse ones.
- **Wake and rocking motion are gated on `!reducedMotion`**, but the render
  loop and boat-following-path logic always run — the kit's own comment on
  this (`tokens.css`) is explicit that CSS-only reduced-motion must not freeze
  a canvas game via `prefers-reduced-motion`, and a chase-cam ride whose whole
  point is movement should own its own pause. It also starts *paused* rather
  than autoplaying when reduced motion is requested, so the user opts into
  the movement rather than getting it by default.
- **Water is a single flat plane with a scrolling canvas texture**, not
  per-vertex displacement. The requester's profile notes explicitly flagged
  performance as a real constraint ("keep it performance inexpensive") on a
  previous 3D build — vertex-displaced water on a plane large enough to cover
  this route would be a few thousand verts updated every frame for a
  cosmetic wave effect; texture scroll gets a similar "moving water" read for
  near-zero cost.

## The plan (not built yet, roughly in order)

1. **A small top-down map inset** (2D canvas or an orthographic mini three.js
   viewport in a HUD corner) showing the boat's dot moving along the route
   against a simplified bay outline — would make the geography legible in a
   way the chase cam alone can't; the chase cam sells the ride, not the map.
2. **Real coastline.** If a GeoJSON/TopoJSON of the SF Bay shoreline ever gets
   vendored into `lab/_kit/`, swap the procedural land-blob loop for actual
   traced polygons and drop the "stylized route" hedge from the copy. Until
   then, don't quietly harden the honesty language — it's accurate as written.
3. **Landmark polish**: the four labels (Lake Merritt / Oakland Estuary / San
   Mateo Bridge / Oracle · Redwood Shores) are static in-world sprites with no
   dynamic HUD callout when the boat passes near one — a "now passing: San
   Mateo Bridge" toast would read nicely and is a small, scoped add.
4. **Sound** was not attempted — an engine-hum + water-slap loop synthesized
   with WebAudio (no CDN samples available) could be a good, cheap follow-up
   if asked for.
5. Untested at any viewport below what the smoke harness checks — the layout
   uses `min(Nvw, rem)` clamps and 44px controls throughout, but if a report
   comes back with the HUD panels overlapping on a very short landscape phone
   screen, that's the first place to look (the title panel and progress
   panel both anchor `top: .7rem` on opposite corners and could collide on a
   very narrow, very short viewport).

## Gotchas

- **three.js import must be the absolute `/_kit/three.module.min.js`**, not
  a relative path — `tokens.css`/`kit.js` are linked relatively
  (`../_kit/...`) and that's fine, but the module import is not (documented
  in `create-space/BRIEF.md`, kept consistent here rather than rediscovering
  it the hard way).
- `curve.getTangentAt` is undefined right at `t=0`/`t=1` in places (division
  by a zero-length lookahead), so the animation loop clamps to
  `[0.0001, 0.9999]` before calling it — remove that clamp and the boat can
  throw or snap its heading at the very start/end of the ride.
- The land-blob offset and radius both scale with `Math.sin(Math.PI * t)`
  (0 at each lagoon mouth, 1 mid-bay) — that single function is what makes the
  route read as "narrow inlet → wide bay → narrow lagoon" rather than a canal
  of constant width. If the route waypoints change, this still works as-is
  since it's parametrized by `t`, not by absolute position.
