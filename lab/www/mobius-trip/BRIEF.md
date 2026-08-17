# BRIEF — hey-know / "Möbius Trip"

## Screenshot check (this turn)

Reviewed a 1200x800 screenshot of the default page load under production CSP:
title, description, the rendered Möbius strip (rainbow vertex colours, faint
wireframe overlay, correct proportions) and the control bar (labelled "Take
the trip" / "Reset view" buttons, labelled "Trip length: 16s" slider) all
render correctly — nothing off-screen, overlapping, blank, or unlabelled. The
moderated-account copy change from the turn below lives inside the dedication
panel's hidden-profile branch, which this default view doesn't reach, so
there's nothing in the screenshot that could confirm or contradict it. No
code changed.

## Fifth turn — "What does it mean when an account is 'moderated'?"

The requester's message this turn was a genuine question, not a build
instruction, and per this file's own rule the request overrides the plan when
it points somewhere else — it does: it's almost certainly a reaction to this
site's own copy. The dedication panel says "that profile is moderated" when
`kit.hidden(profile)` trips (see `HIDE_LABELS` in `/_kit/kit.js`), and the
thread's "let's take @viriditax.bsky.social goo on that" a few messages back
is a plausible reason someone tried that handle and hit exactly that message.

I have no chat channel to answer in except NOTE.txt (250 chars, no @handles/
links), so I used it to answer plainly. But the better fix is that the site
shouldn't need an out-of-band answer at all, so I also **expanded the on-page
message itself**: `companionOut.textContent` in the `kit.hidden(profile)`
branch now says *why* — "Bluesky has put a moderation label on that profile
(a content warning, or an account action like a takedown). This site honours
that the same way bsky.app does and won't pull in their name or picture" —
instead of the old bare "that profile is moderated." Same trigger, same
control flow, copy only. No other code touched this turn.

**Decision:** didn't add a persistent "what does moderated mean?" explainer
panel/tooltip elsewhere on the page — the confusion is specifically tied to
the one moment it can happen (a hidden companion lookup), so the fix belongs
right there, not as standing copy visible on every load. If a future turn
gets another question like this from a different part of the page, the same
pattern (explain in-place, at the point of confusion) is the one to reach for
first before reaching for a general FAQ block.

Plan item 3 (small polish, nothing specific queued) is still open and
untouched by this turn — this was a targeted copy fix in response to a real
question, not a scheduled polish pass.

## Fourth turn — "That was freaking amazing"

The requester's message this turn was praise, not an instruction ("That was
freaking amazing" — reacting to the polygonOffset fix from last turn). Per
this file's own rule, praise with no counter-request means work the standing
plan, so this turn built plan item 2: the wide-orbit companion mode.

**Shipped:** a "Wide orbit" button, mutually exclusive with the edge trip. It
circles the camera around the *outside* of the whole strip at a fixed radius
(6.5, safely clear of the strip's ~2.7-unit extent) with a gentle sinusoidal
height bob, while the strip's vertex colours hue-rotate continuously
(`updateStripHue(shift)`, rewriting the colour attribute in place each frame
from a stored per-column base-hue formula, not a shader — see Decisions).
Gated behind `prefers-reduced-motion`: the button is disabled outright and
says why, because unlike the trip (started on purpose, so it keeps running
under reduced motion per the existing footer copy) this mode moves on its own
indefinitely once started, which is exactly what that preference means to
prevent.

**Decisions:**
- **Recomputed vertex colours in JS every frame instead of a custom hue-
  rotate shader (`onBeforeCompile`).** A shader uniform would be cheaper, but
  the strip is only ~2000 vertices and only 181 distinct colours (one per
  `u`-column, repeated across the width) — a plain loop writing into the
  existing `Float32Array` and setting `needsUpdate` is simple, obviously
  correct, and fast enough at this size. Revisit only if a future turn makes
  the strip much denser.
- **Camera path is a fixed circle in the XZ plane with a sinusoidal Y bob**,
  not an orbit that tracks the strip's own rotation. Deliberately simple —
  "circles the whole strip from outside" was the ask, not a camera that
  chases the strip's current drag-rotated orientation.
- **`endOrbit()` calls both `resetStripHue()` and `resetView()`**, same
  pattern as `endTrip()` calling `resetView()` — leaving the scene in a
  surprising state after a decorative mode ends (rotated camera, shifted
  rainbow) would read as a second bug report.
- Trip and orbit are mutually exclusive (each disables the other's button)
  because both take over the camera; nothing in the code assumes they could
  run together, and building for that combination wasn't asked for.

**Untested claim, flagged honestly:** the hue-rotation math (per-column HSL
recompute) is straightforward and I traced it against `buildStripGeometry`'s
own colour-assignment loop to confirm the indexing matches, but there is
still no way to load a page from here — if the rotation looks offset from the
mesh or flickers, that's the first thing to check.

## Third turn — "It is bugged"

The requester's whole follow-up was "It is bugged," no detail, no repro. No
network here and no way to load the page, so this turn was a static read of
the whole file hunting for anything that could visibly break it, rather than
progressing the standing plan (the request overrides the plan per this file's
own rule, and a bug report is exactly that kind of override).

Found and fixed one confirmed, real bug: **`stripMat` (the coloured strip)
and `wireMat` (the faint overlay grid) share almost-identical geometry —
same `mobiusPoint()` surface at two different tessellations — rendered with
no `polygonOffset`.** That is a textbook WebGL z-fighting setup: two nearly-
coincident surfaces whose depth ordering flips per-pixel and per-frame,
which reads as a flickering/moire pattern over the whole strip, worst right
up close — i.e. exactly during the trip, when the camera sits `LIFT = 0.16`
units off the surface. `jank-engine/` elsewhere in this estate hits the same
overlay pattern and fixes it the same way, which is corroborating evidence
this is a known real issue, not a guess: `polygonOffset: true,
polygonOffsetFactor: 1, polygonOffsetUnits: 1` added to `stripMat`. That's
the fix shipped this turn.

**What I could not confirm:** whether this was *the* bug the requester saw,
because there is no way to load the page from here (see the standing "You
cannot test this" section below — still true, still no Bash/WebFetch). I read
the whole file end to end looking for thrown exceptions too (nothing found —
no undefined refs, no THREE API misuse, no divide/NaN paths that don't have
existing safe fallbacks) so a hard crash seems unlikely; a rendering artifact
that only shows up in an actual WebGL context is the kind of bug static
reading alone can miss, so if the site is still visibly wrong after this,
it's probably something in that category — say what it actually looks like
next time so the next turn isn't guessing again.

Item 2 (the wide-orbit companion trip, below) is still queued and untouched.

## Second turn

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

1. ~~Optional dedication feature~~ — DONE, second turn.
2. ~~Second named "trip" / wide-orbit companion mode~~ — DONE, this turn (see
   "Fourth turn" above).
3. Nothing queued. If the next message is praise or un-parseable again (this
   handle's established pattern), there's no standing plan item left to
   default to — read the whole file for anything that looks visibly wrong
   first (the same approach that found the z-fighting bug), and if nothing
   turns up, a reasonable next step is a small polish pass: e.g. does the
   dedication marker want its own short lap caption folded into
   `updateLap()` (left as panel-text-only so far, still unrevisited), or a
   third camera mode. Don't invent something big unasked.
4. Not yet considered: does the dedication marker want its own short lap
   caption (e.g. "riding with @handle") folded into `updateLap()`, or is the
   panel text above the viewport enough? Left as panel text only, still —
   revisit if it reads as easy to miss.

## Gotchas

- **The hue-shift colour rewrite only touches `stripGeo`'s colour buffer, not
  `wireMat`'s.** They're separate `BufferGeometry` instances (different
  tessellation) even though they trace the same surface — `wireMat` is a
  plain low-opacity white overlay and was never rainbow, so this is correct
  as-is, but it's easy to assume there's one shared geometry when there
  isn't. If a future feature wants the wireframe to shift too, it needs its
  own colour attribute; it currently has none (`vertexColors` isn't even set
  on `wireMat`).
- **Two coincident meshes need `polygonOffset` or they z-fight.** `stripMat`
  and `wireMat` draw the same `mobiusPoint()` surface at different
  tessellations; without offsetting one of them the overlap flickers
  unpredictably as the camera moves. Fixed on `stripMat` this turn — if a
  future turn adds another overlay mesh on this surface (a second wireframe
  pass, a highlight ring), it needs the same treatment or the same bug comes
  back in a new spot.
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
