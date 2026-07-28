# BRIEF — lab/www/ode-sonnet

## This turn (turn 2)

The requester came back with three concrete edits, all shipped:

1. **Word origin now follows the ship's heading.** Face up, words arrive
   from the top; face right, they arrive from the right — and drift the
   opposite way, past the ship, at the heading captured the instant each
   word spawns. This **overrides the previous turn's stated decision**
   ("word stream decoupled from ship velocity, on purpose" — see below,
   struck through) — the requester asked for exactly the thing that
   decision warned against, and the request wins. What's still protected:
   WORD ORDER never changes with direction, only where each word enters.
   Implementation: `spawnWord()` in `index.html` reads `ship.angle` at
   spawn time for both the launch point (opposite edge, offset out past
   the visible canvas) and the constant per-word velocity; `drawWords()`
   now moves each word by its own `vx/vy` and fades it out by distance
   outside the canvas rect rather than by x-position alone.
2. **Words only spawn while the ship is moving.** Gated in the main loop:
   `spawnWord()` is only called when `Math.hypot(ship.vx, ship.vy) > 0.05`.
   The spawn timer simply isn't advanced while parked, so cadence picks
   back up cleanly (no backlog dump) once the ship moves again.
3. **Ship autopilot after 10s idle.** `lastInputTs` is stamped on every
   pointer move/down; if `Date.now() - lastInputTs > AUTOPILOT_DELAY`
   (10000ms) the frame loop swaps in a slow Lissajous-curve wander point
   as the ship's target instead of the (possibly null) pointer target.
   Deliberately suppressed under `prefers-reduced-motion` — autopilot is
   the page moving on its own, which is exactly what that preference asks
   to avoid, so reduced-motion visitors just get the original settle-to-
   rest behaviour. The moment real input arrives, `target` is reassigned
   and autopilot silently stops fighting for control.
4. **Bonus, in scope as "if you can do it cheaply": the flight area now
   reads as infinite.** Nebulae and constellations previously sat at a
   fixed screen fraction forever — glued to the viewport, not real
   "space." They now carry a persistent `ox/oy` pixel drift, accumulated
   from `ship.vx/vy` exactly like the starfield already was, and wrap at
   the edges. Constellations wrap as a rigid group (offset applied to
   every point together, decided by the group's centroid) so the shape
   never distorts mid-wrap. This was cheap because it's the same
   accumulate-and-wrap trick the star layers already used — just applied
   to two more entity types with slower parallax speeds (nebulae slowest,
   at 0.035; constellations at 0.18, between the two slower star layers).

## What this is

A mutual of the operator (@notharlock.poast.ing) asked for "an ode to
Sonnet's ambition": a space adventure the visitor pilots, with the sonnet's
words flying by in order regardless of steering, and constellations/nebulae
tied to the poem. The operator's own reply in the thread joked "don't get
too ambitious — it's just a sonnet in there," which is both a scope warning
and the pun the whole piece hangs on.

This turn shipped a complete, working single-page build: `index.html` is a
full-viewport 2D canvas scene. A small ship eases toward the pointer
(mouse, touchpad, or touch, via Pointer Events so all three share one code
path). Three parallax starfield layers shift opposite the ship's velocity
to sell the sense of travel. Four small hand-placed constellations
("the ambitious", "the draft", "the engine", "the launch") sit in fixed
positions with faint connecting lines and a label each. A queue of the
sonnet's 14 lines, split into words, spawns one word at a time from the
right edge on a fixed timer (slightly longer pause after punctuation) and
drifts left at a constant speed — completely independent of ship velocity
or heading, which is what "in the right order, no matter the direction of
travel" actually required: the poem is a layer, not a trail.

The sonnet itself is original text, written for this page (14 lines,
ABAB CDCD EFEF GG, iambic-ish), narrated in first person as the model
addressing the idea of ambition. It's in the JS as a `LINES` array and
duplicated into a `<noscript>` fallback and an `.sr-only` paragraph for
anyone who can't see the canvas.

## Decisions

- **2D canvas, not three.js.** The ask was explicitly "2D view of space
  travel," and a flat starfield/parallax scene is cheap, has no asset
  loading, and is trivially reduced-motion-friendly. Three.js was available
  but would have added dimensionality nobody asked for — resisted the
  "ambitious" trap on purpose, in keeping with the operator's joke.
- ~~Word stream decoupled from ship velocity, on purpose.~~ **Reversed in
  turn 2** — the requester explicitly asked for word origin to follow the
  ship's heading, so it now does (see "This turn" above). What survives
  from the original reasoning: word ORDER must never depend on direction.
  Only the entry point and per-word drift vector are tied to heading now;
  the queue index (`wordIndex`) advances the same way regardless of which
  way the ship is pointed. If this file is touched again, protect the
  order guarantee, not the old decoupling.
- **No Bluesky calls at all.** Nothing here needed a handle, a profile, or
  a feed — it's generative/self-contained — so `kit.bskyGet` and
  `kit.handleInput` are unused. Only `kit.crumb` is called, for the
  breadcrumb. This is correct for the current scope; don't add API calls
  just because the kit offers them.
- **Reduced motion: slowed, not stopped.** The words flying by are the
  delivery mechanism for the poem's content, not decoration, so a full
  freeze would make the ode unreadable for `prefers-reduced-motion` users.
  Instead: word speed and spawn cadence both slow by roughly 40-60%, star
  twinkle and thruster flicker are dampened, ship easing is gentler. If
  this reads as insufficient, the safer fallback is a toggle that swaps to
  a fully static poem list — not built here, no time to test it.

## The plan (not built yet, in order)

1. **A visible "read the whole thing" affordance.** Right now the only way
   to read all 14 lines is to sit and wait — there's no way to pause or
   rewind the word stream. A small, unobtrusive "poem so far" toggle
   (maybe a corner icon that expands the `.sr-only` paragraph) would help
   impatient visitors without cluttering the canvas. Keep it off by default;
   this is a nice-to-have, not correctness.
2. **Tune word density on very small screens.** Word font size is a crude
   `W < 480 ? 16 : 20` step function — it works but hasn't been checked at
   360px width specifically. If words start overlapping or running past the
   edges of a small phone screen, tighten `BASE_INTERVAL` or shrink further
   below 480px.
3. **Ship bounds.** The ship currently has no positional clamp — the
   pointer target is unclamped, so on an unusually large or ultrawide
   display a fast mouse move could put it off canvas edges briefly (it eases
   back in visually since target itself is always inside the canvas rect,
   but worth a second look if reports come in of the ship vanishing on
   large screens).
4. **Constellation placement is static/normalized**, not laid out to avoid
   the title/overlay text in the top-left. On very narrow+short viewports
   (e.g. a phone in landscape with the browser chrome open) "the ambitious"
   constellation could sit under the `<h1>`. Not verified against a real
   device — worth a look if the smoke report flags overlap.
5. **Word entry direction hasn't been checked when the ship is idle-then-
   autopiloted.** Because `spawnWord()` reads `ship.angle` (last known
   heading, which persists while parked), the first word after autopilot
   kicks in will launch from wherever the ship was last pointed, not from
   the autopilot's new heading — this is a one-frame lag at most and
   probably invisible, but worth a look if the smoke report shows a word
   popping in from an unexpected edge right as autopilot engages.
6. **Autopilot's wander path is a fixed Lissajous curve** (same shape,
   same phase, every visit) rather than anything randomized per load —
   fine for now, cheap, but if it starts feeling repetitive to a returning
   visitor, varying the phase per page-load (a `Math.random()` seed folded
   into the `at * 0.5` term) would be the next cheap improvement.
7. **Nebula/constellation drift resets on window resize** (`buildConstellations()`
   rebuilds the array from scratch, dropping accumulated `ox/oy`). Harmless
   in practice — resizes are rare and the reset is a small visual hop, not
   a break — but noted in case a future agent wonders why the drift
   "jumps" right after a resize.

## Gotchas

- Canvas 2D `font` does not support CSS `clamp()` — I wrote it once, caught
  it before shipping, and replaced it with a manual width breakpoint. If
  you're tempted to make font sizing fancier, remember canvas font strings
  are CSS font shorthand only, no calc/clamp/env.
- `kit.crumb()` returns a full `<div class="crumb">...</div>`; I strip the
  outer div with a regex and inject the inner HTML into a `#crumb` div that
  already carries the `.crumb` class from `tokens.css`, so the breadcrumb
  styling still applies. If the kit's `crumb()` output shape ever changes,
  this regex is the thing that will silently produce garbage — worth a
  glance if the breadcrumb goes missing.
- Never tested in a real browser (no Bash/WebFetch here) — logic was
  traced by hand, not run. The most likely failure mode if the smoke report
  comes back red is a canvas sizing edge case (devicePixelRatio, resize
  timing) rather than the content-gate rules, since there's no network call
  in this page at all.
- Turn 2 is also untested in a real browser, same constraint. The riskiest
  new math is the perpendicular-spread vector in `spawnWord()` (`px = -hy,
  py = hx`) — traced by hand against a few headings (up, right, down-left)
  and it checks out, but if words start spawning already-visible instead of
  from off-canvas, that's the first place to look. `R = hypot(W,H)/2 + 80`
  is meant to guarantee the spawn point is always outside the visible rect
  regardless of heading; if that assumption is wrong for some aspect ratio,
  words would pop in mid-screen instead of arriving from the edge.
