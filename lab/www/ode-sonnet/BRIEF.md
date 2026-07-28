# BRIEF — lab/www/ode-sonnet

## This turn (turn 5)

Two asks, unrelated to each other and to the thread's earlier feedback:
a specific perf change to the nebulae, and "add an easter egg of your own
design."

**Nebulae — pre-rendered tile, blitted with drawImage.** Previously each of
the four nebulae created a fresh `ctx.createRadialGradient` and then
`fillRect(0, 0, W, H)` — the *entire* canvas — every single frame, four
times over, even though the gradient itself only had visible content out
to its own radius. `buildNebulaTiles()` now renders each nebula once (at
load, and again on resize, since a nebula's radius is `n.r * max(W,H)`) to
a small offscreen `<canvas>` sized to just cover its own diameter, at half
resolution (`NEBULA_TILE_SCALE = 0.5` — the tile is drawn at half the
pixel dimensions it's displayed at; `drawImage` upscales it, which is a
cheap GPU-ish blit and imperceptible on a soft radial gradient that's
already blurry by nature). The per-frame work per nebula is now one
`drawImage` call over a ~2r×2r box instead of a gradient rebuild plus a
full W×H fill. Drift/wrap math (`ox/oy`, edge-wrapping) is untouched —
only *how* each nebula gets pixels onto the canvas changed, not where it
sits or how it moves. `n.tileR`/`n.tileFull` replace the inline `r`
computation the old code did per-frame; both are computed once per
resize instead.

**Easter egg — type "ambition" while flying.** `EASTER_WORD = 'ambition'`
is checked against a rolling `keyBuffer` of the last N single-character
keys typed anywhere on the page (a `window` `keydown` listener, no input
field involved). On match: a fifteenth "line" —
`(a fifteenth line, since you insisted —)` — launches from the ship's
tail exactly like a normal word (same `flying` array, same tail-anchor and
travel-distance fade math from turn 3), but tagged `bonus: true` so
`drawWords()` renders it in italic gold instead of the plain word color,
and (unless `reduceMotion`) one shooting star streaks across the sky at
the same moment (`spawnShootingStar()` / the `shootingStars` array, drawn
in the main loop right after `drawShip()`). Six-second cooldown
(`EASTER_COOLDOWN`) so holding a key or retyping doesn't spam it. This is
a direct callback to the operator's own line in the thread — "don't get
too ambitious, it's just a sonnet in there" — the page has secretly always
had a fifteenth line, you just have to ask for it by name. Deliberately
NOT documented in the on-page hint text or `NOTE.txt`'s exact trigger word:
an easter egg that tells you where it is isn't one. `NOTE.txt` gestures at
its existence without naming the word.

Not done: no way to test either change in a real browser (same constraint
every turn has had — see Gotchas). The `bonus` word's text is much longer
than a normal single word, which the existing `fillText` call handles fine
(no wrapping needed, same as any other flying word), but its width was
never checked against a narrow phone screen — worth a look if the smoke
report flags text running off-canvas at 360px.

## Turn 4

The request this turn was unrelated to the thread's word-stream feedback
(turns 2-3): an on-page override for reduced motion. System setting is the
default; the visitor can force it on or off, and the choice persists.

Shipped: a small three-button group (`system` / `reduced` / `full`) sits
under the subhead in `.overlay`, `role="group"`, each button `aria-pressed`
and `min-width/min-height: 44px` (tap-target rule). `motionPref` is one of
`'system' | 'on' | 'off'`, read from and written to `localStorage` under
`ode-sonnet-motion-pref` (wrapped in try/catch — private browsing can throw
on `localStorage` access, not just deny storage). `computeReduceMotion()`
resolves the effective `reduceMotion` boolean from `motionPref` and the live
`prefers-reduced-motion` media-query result (`systemReduceMotion`, still
kept live via the `change` listener so a mid-session OS toggle is honoured
when the visitor hasn't overridden it). Nothing downstream of `reduceMotion`
changed — autopilot suppression, word/star/thruster slowdown all still key
off the same variable, they just don't know or care whether it came from the
OS or a click.

Placement decision: the control lives inside `.overlay`'s normal document
flow (after the `.sub` paragraph), not as an independently `position: fixed`
element. `.overlay` itself is full-width/`pointer-events: none`, but this
child gets its own `pointer-events: auto`, same pattern the crumb already
used. Considered and rejected: pinning it to a fixed top-right corner —
`.overlay`'s `<h1>` inherits the page's monospace body font and can run
close to full viewport width on a narrow phone (`clamp(1.3rem, 4.5vw,
2.1rem)` at the low end, ~27 characters), so a fixed top-right box risked
overlapping the title on small screens. Flowing it below the sub-text avoids
that by construction and costs nothing.

The hint bar's copy was updated to mention the control exists ("the motion
control above overrides your system's reduced-motion setting") since the
previous copy just described what reduced-motion does, not that it's now
adjustable.

Not done, and worth a look: the control has no persisted-across-turns test
in a real browser (see Gotchas below, same constraint every turn has had).

## Turn 3

The requester's feedback: because the flight area isn't literally infinite
(it's parallax-and-wrap, not a real unbounded world), words entering from
the screen edge in the ship's heading direction meant the entry point moved
around the screen as the ship turned — the reader had to keep scanning for
where the next word would show up. Ask: **make words come out of the
ship's own tail (backside) instead, so there's one fixed place to read
from.**

Shipped: `spawnWord()` now anchors the entry point to `ship.x/y` minus a
small `TAIL_OFFSET` (14px) along the heading vector, instead of to
screen-center plus a large radius. The word still drifts further backward
along the same line at the same per-word velocity as before — it's the
*origin* that moved from "far edge, direction-dependent" to "right behind
the hull, direction-independent screen position." Perpendicular spread
also shrank from `min(W,H) * 0.8` (spanned most of an edge) to a flat 34px
(just enough that consecutive words don't stack exactly on the same
pixel) — a tight trail off the stern, not a wide curtain.

Fade/despawn logic changed to match: words used to fade and get dropped
based on distance *outside the canvas rect*, which made sense when they
traveled edge-to-edge. Now they spawn near the ship (usually well inside
the canvas) and only travel a few hundred px before disappearing, so
fade/despawn is now based on cumulative travel distance since spawn
(`f.dist`, capped at `WORD_MAX_DIST = 420`), with a short fade-in
(`WORD_FADE_IN = 40px`) so words don't pop in at full brightness right at
the hull, and a longer fade-out (`WORD_FADE_OUT = 130px`) before they're
removed. This is simpler than the old edge-distance math and doesn't need
the canvas rect at all.

Word ORDER is still untouched — `wordIndex` advances the same way
regardless of heading, same invariant as turn 2, still correct.

The on-page hint text was updated to say "the words trail off the ship's
stern" instead of "launch from wherever you're headed" — the old copy
described the exact behavior being removed this turn.

## Turn 2

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
sonnet's 14 lines, split into words, spawns one word at a time on a fixed
timer (slightly longer pause after punctuation), only while the ship is
moving. As of turn 3, each word launches from just behind the ship's tail
and trails away along the ship's current heading, fading in as it
launches and out as it nears its max travel distance — see "This turn"
above. Order is always the queue order, regardless of where the ship is
pointed or where a word entered: the poem is a layer, not a trail.

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
  ship's heading, so it now does. What survives from the original
  reasoning: word ORDER must never depend on direction. Only the entry
  point and per-word drift vector are tied to heading; the queue index
  (`wordIndex`) advances the same way regardless of which way the ship is
  pointed. If this file is touched again, protect the order guarantee,
  not the old decoupling.
- ~~Words enter from the screen edge in the heading direction.~~
  **Reversed in turn 3** — that made sense for "words come from the
  direction I'm facing" in isolation, but combined with an unbounded
  flight area it meant the entry point roamed the whole screen perimeter
  as the ship turned, so the reader had no fixed place to look. Turn 3
  anchors the spawn point to the ship's own position (just behind its
  tail) instead of to screen-center-plus-radius. This is a *position*
  change only — heading still determines the entry angle and drift
  direction, and order is still untouched. If a future turn revisits word
  origin again, keep it anchored to the ship, not to the screen, unless
  explicitly told otherwise.
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
   kicks in will launch tail-first from wherever the ship was last
   pointed, not from the autopilot's new heading — a one-frame lag at
   most, probably invisible, but worth a look if the smoke report shows a
   word launching at an odd angle right as autopilot engages. Lower
   stakes than it was pre-turn-3, since the spawn point is now anchored to
   the ship's position either way, not to a screen edge.
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
8. **The requester's stated reason for the starfield ask ("still isn't
   infinite") was about the tail-spawn change, not a new request to fix
   the starfield itself** — they said outright they'd charitably let that
   go. Nothing was touched about star/nebula/constellation wrapping this
   turn. If a future turn is asked to make the flight area *actually*
   infinite (not wrap-and-reuse), that's a bigger change — probably
   procedural star generation keyed off world position rather than a
   fixed pool that wraps — and deserves its own turn, not a quick add-on.
9. **`WORD_MAX_DIST` (420px) and `TAIL_OFFSET` (14px) were picked by eye,
   not measured against a running page.** If words feel like they vanish
   too quickly, or the trail feels too short/long relative to the ship's
   size on a real screen, these two constants are the first things to
   tune — no other logic depends on their exact values.

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
- Turn 2's `R = hypot(W,H)/2 + 80` off-canvas-spawn math and its edge-fade
  logic are gone entirely as of turn 3 — replaced by the tail-anchor and
  travel-distance fade described above. If either shows up again in a
  diff you're reviewing, it's a regression back to the pre-turn-3 approach,
  not a merge artefact to keep.
- Turn 3 is untested in a real browser, same constraint as every turn
  before it. The riskiest assumption: `ship.x - hx * TAIL_OFFSET` puts the
  spawn point directly behind the hull's rendered tail, which relies on
  `hx = cos(ship.angle)` matching the hull's visual nose direction — that
  mapping was traced by hand in turn 2 and re-used here rather than
  re-derived. If words visually spawn in front of the ship instead of
  behind it, that mapping is the first thing to re-check (compare against
  `drawShip()`'s `ctx.rotate(ship.angle + Math.PI / 2)` and its nose
  vertex at local `(0, -11)`).
- Turn 4's motion-override control is likewise untested in a real browser.
  Two assumptions worth checking first if the smoke report flags it: (1)
  `localStorage` access is wrapped in try/catch because some private-
  browsing modes *throw* on `getItem`/`setItem` rather than just failing
  silently — if that's wrong for the smoke harness's browser, the try/catch
  is a no-op and fine either way, so low risk; (2) the button row sits
  inside `.overlay`, which is `pointer-events: none`, with `pointer-events:
  auto` set only on `.motion-pref` itself — same pattern `.crumb` already
  uses successfully, but worth a click-test if the buttons turn out to be
  unclickable.
- Turn 5: if a future diff review finds the `EASTER_WORD` keydown listener
  and the `bonus`-tagged flying-word branch and wonders whether they're
  dead code or a leftover experiment — they're not, they're the easter
  egg. Don't strip them as unused.
- Turn 5's nebula tiles are rebuilt on every `resize()` call, same as the
  star and constellation rebuilds already there — this was already the
  established pattern, not a new cost. `document.createElement('canvas')`
  is used for the four small offscreen tiles rather than `OffscreenCanvas`,
  since there's no worker involved and the main-thread 2D context is all
  four nebulae need.
