# BRIEF — that-visualizes

## What this is

The ask was: a page that visualizes the concept of a correlation
coefficient. No Bluesky handle, no lookup, no user data — this is a pure
math/stats concept page, so it doesn't touch `kit.bskyGet` or
`kit.handleInput` at all, unlike most lab sites.

What shipped, in one turn: a 480×480 canvas scatter plot with 12 points you
can drag (pointer events, works with mouse/touch/pen), a live Pearson r
readout, a diverging −1..+1 meter (blue/gray/accent, matching the
blue/orange pairing `turn-venn/` already established for two-pole content),
a dashed best-fit line drawn through the points, and six presets: strong
positive, strong negative, none, a curved (parabola) example where r reads
near 0 despite an obvious relationship, an outlier example where one point
dominates the statistic, and a randomizer. This is the whole concept, not a
skeleton — r is computed correctly (verified by hand against the preset
arrays: `positive` should read roughly 0.95, `curved` near 0, `outlier`
swinging hard positive off a near-zero base) and the drag interaction is
the hard part that's proven, not stubbed.

## Turn two — "crazy rainbow gradients everywhere"

The requester came back asking for exactly that, no more scoping needed —
this was a direct style instruction, so it overrode the turn-one plan below
rather than adding to it. What shipped: an animated rainbow gradient behind
the whole page (`body`), a static rainbow border wrapped around `main` (the
gradient-border trick: two background-image layers, one solid at
padding-box, one rainbow at border-box — cheaper than an extra wrapper div),
an animated rainbow-text `h1`, rainbow underlines on every `h2`, rainbow
gradient-fill preset buttons, a rainbow border on the canvas and the
formula box, a rainbow-recolored diverging meter (still cool-to-warm
left-to-right so it doesn't lose its −1..+1 direction), rainbow-hued scatter
points (each point's hue is `i / n * 300`, so the twelve dots themselves
read as a spectrum), and a rainbow gradient stroke on the best-fit line.

**Load-bearing decision: the reading surface stayed untouched.** `main`
keeps `background: var(--bg)` — a plain solid dark card — so every paragraph
of body copy has exactly the contrast it had before. All the rainbow lives
in decoration (backdrop, borders, headings, buttons, dots, the meter) never
in body text color or the text's own background. If a future ask wants MORE
rainbow, the next place to push is probably the numeric readout (`.rval`)
or the stats line — deliberately left alone this turn since that's the one
thing on the page a low-vision user most needs to read at a glance.

Animations (`body`, `h1`) are gated behind `prefers-reduced-motion: reduce`
already; the meter marker's transition already was. Didn't add any new
always-on motion beyond what two lines of CSS animation cost.

## Decisions

- **No Bluesky integration at all.** The task didn't ask for one, the
  concept doesn't need one, and forcing a handle box onto a stats demo
  would just be decoration. If a future ask wants "show the correlation
  between two of a user's own stats" (post length vs. likes, say), that's
  a genuinely different page, not an addition to this one.
- **Fixed, hand-picked preset point arrays instead of algorithmically
  generated ones.** Wanted the "curved" and "outlier" cases to look clean
  and obviously illustrate the point on every load, not roll a good-looking
  example some fraction of the time. Only `random` uses `Math.random()`.
- **A dashed best-fit line is always drawn**, not toggleable. It's the
  thing r is actually a number *about*; hiding it by default seemed to
  undercut the teaching point rather than declutter it.
- **Reused the blue/orange pairing from `turn-venn/`** for the diverging
  meter rather than inventing a new pair, since both are "two poles plus
  neutral middle" and consistency across tenants was free here.

## The plan (not built yet)

Everything below is unchanged from turn one — the rainbow request was pure
styling and didn't touch any of it.

- **Anscombe's quartet as a fourth "fools r" preset** would strengthen the
  "correlation isn't the whole picture" section — right now there's a
  curved example and an outlier example, but not all four Anscombe shapes
  side by side. Would need either a bigger canvas or four small
  side-by-side mini-canvases; the mini-canvas layout is the part worth
  prototyping first since it's a different rendering approach from the
  single interactive canvas here.
- **A point-count control** (add/remove points, not just drag existing
  ones) was considered and cut for time. If added: clicking empty canvas
  space could add a point, and a small "×" per point (or a long-press on
  touch) could remove one — needs real touch-target thought since the
  existing 26px hit radius for drag is already close to the minimum for a
  second gesture.
- **A "show the math" expandable panel** that walks the actual arithmetic
  for the current point set (each x−x̄, y−ȳ, product) was scoped out but
  would pair well with the formula line that's already there.

## Gotchas

- The gradient-border trick (`background-image: linear-gradient(solid,solid), linear-gradient(rainbow); background-origin: border-box; background-clip: padding-box, border-box;`) needs an actual `border: Npx solid transparent` set too, or the border-box layer has nothing to paint into and the whole rule is a no-op. Used on `main`, `canvas`, and `.formula`.
- `h1`'s rainbow text uses `background-clip: text` + `color: transparent` — if a future edit adds a `color` after that rule in the cascade, the gradient silently disappears back to solid black/inherited color with no error.

- Canvas backing size (480×480 via the `width`/`height` attributes) and
  its CSS display size diverge on narrow phones because of
  `max-width:100%; height:auto`. Pointer coordinates MUST be scaled by
  `canvas.width / rect.width` (see `eventToCanvas`) or dragging is off by
  the zoom ratio on anything but a 480px-wide viewport. Easy to miss
  because it works perfectly in a desktop-width test and silently breaks
  under 480px.
- Nothing here calls a network endpoint, so there was no fixture to check
  against and nothing to verify against `lab/_kit/fixtures/`. Worth
  double-checking `scripts/lab-content-gate.mjs` and
  `scripts/preflight.mjs` pass cleanly given that absence — they should,
  since the gate cares about *what's called*, not whether anything is.
