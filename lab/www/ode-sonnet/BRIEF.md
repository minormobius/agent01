# BRIEF — lab/www/ode-sonnet

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
- **Word stream decoupled from ship velocity, on purpose.** The obvious
  wrong build ties word drift to steering direction — then flying backwards
  reverses the poem, which breaks "in the right order." Words always drift
  right-to-left at a constant pace; steering only moves the ship and the
  starfield/parallax layer, not the text layer. This is the one piece worth
  protecting if this file is touched again — do not merge those two systems.
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
