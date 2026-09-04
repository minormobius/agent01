# BRIEF — pipedream-screensaver

## What this is

The ask: a pipedream screensaver — classic 3D-Pipes-style growth on a grid —
except the pipes carry text, letter by letter, imprinted along the tube. The
requester's own framing: "if screensavers were invented after microblogging."
Since a lab site can only show Bluesky content for a subject the visitor
named (never a firehose/searchPosts feed), the source of the letters is:
a textarea the visitor types into, OR a Bluesky handle they type (via
kit.handleInput), whose recent visible posts (getAuthorFeed + kit.visible)
become the letter stream, OR — if both are empty — an infinite shuffle of a
built-in neutral word list.

Shipped this turn: the whole thing, working end to end. `index.html` is
complete — grid-based pipe growth (4-directional random walk, ~72% chance to
continue straight), each new cell renders as a shaded/highlighted tube
segment plus one embossed letter rotated to the direction of travel, drawn
once and left in place (canvas is not cleared every frame — cheap, and reads
like a real screensaver building up a picture). A speed slider (0.25×–4×)
and a three-way motion control (auto / on / off) are both live. The canvas
never fully clears until ~50% of grid cells are covered, then fades back to
background and respawns all pipes — this is what stands in for the classic
pipe screensaver's "fill and reset" cycle.

## Decisions

- **Persistent draw over full-frame redraw.** Only the newly grown segment
  is painted each tick; the rest of the canvas is untouched between frames.
  This is much cheaper than redrawing every pipe's whole path every frame
  and is *why* speed can run to 4× without dropping frames on a phone.
  The tradeoff: pipes can't be un-drawn individually, so a "dead" pipe (hit
  its max length or ran out of room) just stops growing in place and a new
  one spawns elsewhere — matches how the original screensaver actually
  behaves, so I didn't fight it.
- **4-directional grid, not 6-direction/3D.** three.js is available and a
  true 3D pipe render was tempting, but doing it properly (extruded tube
  geometry, camera, lighting) would have eaten the whole turn on the "3D"
  part rather than the part that was actually asked for — letters imprinted
  on the pipes. 2D with shading reads as a tube well enough. If a future
  turn wants real 3D, treat it as a separate, larger turn.
- **One shared, cycling letter pool** rather than per-pipe independent
  text. All pipes draw from the same `pool`/`poolPos` cursor, so the same
  stream of text is legible continuing across whatever pipe happens to be
  growing at that moment, rather than every pipe reciting the same text
  from its own start (which reads as repetitive rather than as "a feed").
- **Bluesky handle input reuses `kit.handleInput` + `getAuthorFeed`**,
  filtered through `kit.visible()`. This is the allowed way to get real
  Bluesky text onto the page without touching a firehose or search: the
  visitor names the exact account. Rejected: any attempt to make this
  "actual Bluesky posts" in general — the brief anticipated this
  ("if you can't do actual bluesky posts because of restrictions") and the
  house rule is unambiguous on it.
- **Reduced motion gets a visible three-way override** (auto/on/off), not
  just a silent `prefers-reduced-motion` check — matches what this
  requester asked for explicitly on a previous build (see their profile).
  CSS-only reduced-motion (from tokens.css) does not touch canvas/rAF, so
  this had to be handled by hand in JS regardless.

## The plan (not built yet, in order)

1. **Pipe-count / density control.** Speed is adjustable; how many pipes
   grow at once is not (fixed at 4–10 based on screen area). Cheap slider,
   same pattern as speed — would go in the same HUD row.
2. **Smoother corners.** Each segment is a separate `stroke()` call, so
   elbows rely on round line caps overlapping rather than a true rounded
   joint. Looks fine at CELL=30 but would show at a larger cell size. Fix:
   accumulate each pipe's unstroked cells into one `Path2D` with
   `lineJoin=round` and stroke it once per growth tick instead of per
   segment — needs the fill-tracking (`drawnCount`) to still count per-cell
   for the reset threshold to keep working.
3. **Per-pipe independent text slices** as an option, so a name change
   ("their post become one pipe's text, not blended into the shared
   stream") — currently rejected above but flagged in case the requester
   wants pipes that visibly correspond 1:1 with individual posts rather
   than a shared scroll.
4. **True 3D**, only if asked for explicitly and given its own turn —
   three.js tube geometry + an orbiting or fixed camera. This is a rewrite
   of the renderer, not an addition to it.

## Gotchas

- `getAuthorFeed`'s `actor` param accepts a handle directly (no need to
  resolve to a DID first) — confirmed against `kit.handleInput`'s `onPick`
  signature and the fixture, saved a round trip.
- Post text lives at `item.post.record.text` in the getAuthorFeed fixture,
  not `item.post.text` — easy to get wrong from memory, checked the fixture.
- Untested in a real browser by me, but per the harness note, a screenshot
  pass happens after this turn ends — if the pipes render as flat lines
  with no visible letters, check `ctx.setTransform` against `DPR` first;
  that's the most likely thing to be subtly wrong on a real HiDPI screen.

## Screenshot pass (1200×800, production CSP)

Confirmed correct, no changes made. Pipes render with visible embossed
letters and correct shading; the HUD panel shows all four controls (speed,
motion, text box, handle box) with clear labels and readable text; the
speed slider and status line ("letters: random text") are live and legible.
Sparse pipe coverage and the faint blurred color bleed-through in the
translucent HUD panel are expected — a fresh page load mid-animation, seen
through the panel's deliberate `rgba(...,.88)` + `backdrop-filter: blur(6px)`
translucency — not a rendering fault.
