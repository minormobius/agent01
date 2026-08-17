# BRIEF — hey-know / "Möbius Trip"

## Second turn (this one)

The requester's only follow-up was a terse, unparseable reaction —
"I'm sure will improve dreaming experiences" — no concrete ask, no thread
pointer to anything new. Per this file's own item 3 and the requester's
established pattern (see their profile: reactions get read, not parsed
literally; when nothing parses, work the standing plan), picked up **item 1**
below: the optional dedication feature. It's now built and item 1 is DONE —
see "What shipped this turn." Item 2 (the wide-orbit companion trip) is next.

## What this is

The requester (thegodfungi) asked, terse as usual: "can we build a trip for
mobious." The only thing quoted alongside it was someone else's post
(@minormobius.bsky.social: "Claude build the cube do a breakthrough") —
that's the other person's own ask in a different thread, not an instruction
here, and it was deliberately not built. What shipped is a literal reading of
"a trip for mobious": a Möbius strip, and a "trip" as in a camera ride, not a
metaphor.

The page renders a parametric Möbius strip (unlit, vertex-coloured rainbow so
it reads the same from any angle) with its single continuous edge drawn as a
bright line. Idle view: drag to orbit, slow auto-rotate when nothing's being
dragged (paused under prefers-reduced-motion). Pressing "Take the trip" flies
the camera along that edge for two full loops — a mathematical necessity, not
a stylistic choice, and the whole point of the build (see Decisions).

## Decisions

- **Didn't pull minormobius's avatar or profile into the scene.** The
  requester said "for mobious," and the platform's rule is media for a
  subject the *visitor* named — this is defensible either way, but pulling in
  another named person's picture for a page that's "about" them, unasked,
  felt closer to the impersonation/portrait line than the brief wants to
  live near. Kept the page about the shape, which is unambiguous.
- **The camera's up-vector comes from the surface's actual local frame**
  (tangent × across-strip direction, both by finite difference), computed
  continuously across the whole 4π ride — not a scripted "flip halfway"
  animation. That continuity is the reason the flip is a real consequence of
  riding a non-orientable surface rather than a canned effect. This was the
  one hard part worth proving this turn, and it's done and correct.
- **The ride is on `v = EDGE_V` (near the boundary), never the centreline
  `v = 0`.** The centreline is a plain circle — flat, and closes after one
  loop, which is topologically boring. All the interesting behaviour (needing
  two loops, the "upside-down" flip) only exists off-centre. Don't build a
  "centreline mode"; it would just be a less interesting ride around a circle.
- **Reused the drag-to-orbit pattern from `mathematical-knot/`** (rotate an
  object group, not the camera) rather than inventing new controls — proven
  code, and consistent with the estate's other three.js sites.
- Unlit `MeshBasicMaterial` with vertex colours, not lit `MeshStandardMaterial`
  — the rainbow needs to read correctly regardless of viewing angle or trip
  camera position, and lighting would have made large parts of the strip go
  dark during the ride for no reason.

## What shipped this turn

Item 1, **the optional dedication feature**, is built: a "Ride it with
someone" panel using `kit.handleInput`, resolving the picked handle via
`kit.bskyGet('app.bsky.actor.getProfile', ...)`, and — once resolved — a
glowing marker (an additive-blended radial-gradient sprite behind a
circle-masked avatar sprite) that rides ahead of the camera on the same
`computeFrame()` path during the trip, offset by a small lead angle
(`AVATAR_LEAD = 0.22` radians) so it's visible in view rather than dead
centre/occluded. `kit.hidden()` gates it (declines with a message rather than
rendering a moderated profile); a profile with no avatar gets a canvas-drawn
monogram instead of nothing. The marker only exists in scene (not `group`)
and is only visible while `tripping` — same reasoning as the camera itself
(see Gotchas, "startTrip() force-resets…").

## The plan (not built yet, roughly in order)

1. ~~Optional dedication feature~~ — DONE, see above.
2. **Second named "trip"**: a slower, wider-orbit companion mode that
   circles the whole strip from outside (not on the edge) while the rainbow
   gently hue-shifts over time — purely decorative, gate it behind
   `prefers-reduced-motion` like everything else that moves on its own.
3. If the requester ever reacts with something un-parseable again (this
   handle's established pattern), default to item 2 above rather than
   guessing something new.
4. Not yet considered: does the dedication marker want its own short lap
   caption (e.g. "riding with @handle") folded into `updateLap()`, or is the
   panel text above the viewport enough? Left as panel text only this turn,
   for time — revisit if it reads as easy to miss.

## Gotchas

- **`startTrip()` force-resets `group.rotation` to `(0,0,0)` before flying.**
  The camera path math (`mobiusPoint`/`computeFrame`) is computed in the
  strip's own local/object space, not world space. If you ever let the trip
  start without that reset (e.g. while adding a feature that skips
  `startTrip()`), the rendered mesh and the camera path will disagree — the
  camera will fly along where the strip *would* be at zero rotation, not
  where it's currently drawn. Either keep the reset, or transform every path
  point/vector through `group.matrixWorld` (`localToWorld` /
  `transformDirection`) if you want the ride to preserve the user's current
  orbit angle instead.
- **`camera.up` must be set before `camera.lookAt()` each frame**, not after
  — `lookAt` reads `camera.up` at call time to build the orientation. Setting
  it after silently keeps the previous frame's orientation and the "flip"
  effect disappears without erroring.
- Möbius strip is a generic mathematical term, not a trademark (same
  reasoning as "knot" in `mathematical-knot/`) — safe to use directly in the
  title, no gate issue expected.
- The companion marker is a `THREE.Sprite`, which always faces the camera —
  no billboard math needed, and it's why the lead-angle trick (place it a bit
  further along `u` than the look-at target) works to keep it roughly framed
  without any orientation logic of its own.
- Building the avatar texture from `/_img/...` needs `img.onload`/`onerror`
  on a plain `Image`, then `ctx.drawImage` into a same-size canvas before
  handing that canvas to `THREE.CanvasTexture` — you cannot pass the raw
  `/_img/` URL straight to `THREE.TextureLoader` and also get the circular
  mask; the canvas step does both (CORS-safety and the crop) in one place.
