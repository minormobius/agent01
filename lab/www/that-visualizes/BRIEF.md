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

## Turn three — "breaking the formula into pieces"

The requester asked why r is calculated the way it is, and suggested
breaking the formula apart — this is exactly the "show the math" item
turn one's plan had scoped out and left for later, so this turn built it
rather than picking something else off the list.

What shipped: a "Show how r is built, piece by piece" toggle (checkbox,
44px tap target, off by default so the base demo stays uncluttered) that
reveals two things at once:

- **On the canvas itself** — a dashed crosshair at (x̄, ȳ) and, per point,
  a rectangle spanning from the mean to that point. Width = x−x̄, height =
  y−ȳ, so the rectangle's *area* is literally the (x−x̄)(y−ȳ) term the
  numerator sums — orange when the deviations share a sign (the point
  agrees with an upward trend), blue when they don't. This is what makes
  visible *why* one outlier can dominate: a point far from the mean in
  both directions casts a much bigger rectangle than one that's only far
  in one, and that's a direct visual consequence of the formula, not an
  assertion about it.
- **A breakdown panel below the formula** with three live pieces: the
  numerator (a centered bar, since it can be negative), and the two
  spread terms Σ(x−x̄)² and Σ(y−ȳ)² (unsigned bars), each with a
  one-sentence "why this piece exists" note, ending in a plain-language
  final line: `r = num ÷ √(dx2 × dy2) = num ÷ denom = r`, recomputed on
  every drag/preset change.

Both are driven off the same `pearson()` return value `draw()` already
computed — no second pass over the points, no new state beyond one
boolean (the checkbox's own `checked`).

**Load-bearing decision: bar scale is a fixed constant (300), not
auto-fit to the current max.** Points live on a 0–10 grid with n=12, so
Σ(dev)² tops out well under that in every preset. Auto-fitting would make
every preset's bars look equally "full" regardless of actual spread,
which defeats the point of a magnitude comparison — you want "outlier"'s
bars to visibly dwarf "none"'s.

## Turn four — "the toggle is easy to miss"

The requester said the "show how r is built" checkbox/label was hard to
see. It's true — before this turn it was a plain outlined pill matching
`var(--bg-raised)`, the same visual weight as any other secondary control,
sitting below a stats line that's easy to skim past.

What shipped: the toggle (`.switchrow`) now uses the same rainbow gradient
fill as the preset buttons (dark `#0e0e11` text on it for contrast, same
pairing already used elsewhere on the page), a slow pulsing glow
(`box-shadow` animation, ~2.2s) to catch a scrolling eye, and a bigger
checkbox/padding/font-size than before. The glow stops once the box is
checked (`:has(input:checked)`) so it doesn't keep demanding attention
after the visitor has already found it — a progressive-enhancement rule;
browsers without `:has()` just keep the (harmless) pulse going. Both
animations are gated behind `prefers-reduced-motion: reduce` alongside the
page's existing rainbow/h1 animations.

Didn't touch the copy or the layout — this was a visibility problem, not a
wording or information-architecture one, so scope stayed to CSS.

## Turn five — "make the points people, and attach a concrete pair"

The requester's message bundled two related ideas: attach a concrete
variable pair (their example: height and weight) instead of abstract x/y,
and render each point as a tiny SVG person instead of a plain dot. Both
shipped, together, since they reinforce each other — a scatter of little
people only pays off once there's a real pair of variables to hang them on.

What shipped:

- **A new "People: height vs weight" preset** with a hand-picked, lightly
  imperfect height(cm)/weight(kg) dataset (r comes out ≈0.97 — very clean,
  see Gotchas) plotted on real 140–200cm / 40–100kg axes instead of the
  abstract 0–10 grid.
- **Every point on every preset is now a tiny person icon**, not a circle.
  This is a literal SVG: a small template string (`<circle>` head +
  rounded-rect-ish `<path>` body) built per hue, turned into a data-URI
  `Image`, and drawn with `ctx.drawImage`. Not a canvas-drawn stand-in —
  an actual `<svg>` markup string rasterized once per hue and cached
  (`iconCache`), so there are only 12 image loads total regardless of
  preset or drag activity. The rainbow-hue-per-index scheme from turn two
  carries over unchanged; the dragged point gets a white ring instead of a
  colour swap, same as the old dot did.
- **Generalized the coordinate system.** `toCanvas`/`toData` used to hardcode
  a 0–10 domain; they now read `currentDomain` (`{xMin,xMax,yMin,yMax,
  xName,yName,xUnit,yUnit,barScale}`), set on every preset switch from a
  `DOMAINS` map (falling back to `DEFAULT_DOMAIN` for the five abstract
  presets, which is exactly the old 0–10 behavior — pixel-identical, I
  didn't touch their look).
- **Axis tick numbers and an axis caption**, drawn/shown only when
  `currentDomain.xUnit` is set (i.e. only for `people`) — the abstract
  presets stay exactly as they were, no new clutter for them.
- **The stats line** now shows `x̄ (height) = 171.08 cm` /
  `ȳ (weight) = 66.00 kg` for `people`, plain `x̄`/`ȳ` for everything else.

## Decisions (turn five)

- **Icons apply to every preset, not just `people`.** The request read as
  "the whole visualization should use people, not just this one dataset" —
  restricting person-icons to a single preset button would have made it a
  gimmick attached to one demo rather than the visual language of the page.
- **A `DOMAINS` map + per-preset `barScale`, not a special-cased `if (key
  === 'people')` scattered through `draw()`.** The turn-four BRIEF already
  flagged that the breakdown panel's fixed `SCALE=300` would break "if a
  future preset uses a wider coordinate range" — that future arrived this
  turn, so `barScale` is now a domain property (`300` default, `1800` for
  `people`, calibrated by hand against the actual Σ(dev)² this dataset
  produces) rather than another special case.
- **Best-fit line endpoints now come from `currentDomain.xMin/xMax`, not
  hardcoded `0`/`10`.** Caught this while implementing: the line spans the
  full domain width so it needs the *current* domain's bounds, or it draws
  a mathematically-correct-but-absurdly-far-outside-the-canvas segment for
  any domain other than 0–10 (still renders right after clipping, since
  the line equation itself doesn't depend on the domain, but it's needless
  fragility to leave hardcoded).
- **Real SVG markup via data-URI `Image`, not a canvas-path person glyph.**
  The request specifically said "each person could be rendered as an svg"
  — worth taking literally rather than approximating with `arc`/`moveTo`
  calls that only look vaguely person-shaped.

## The plan (not built yet)

- **A second concrete-variable preset** (e.g. study hours vs. test score,
  or something with a negative/weak relationship) would show that the
  "attach real variables" idea generalizes past one positively-correlated
  example — right now `people` is the only non-abstract preset, and it's
  also the only one that happens to be strongly positive.
- **The `people` dataset reads too clean.** r≈0.97 by hand-calculation —
  real height/weight scatter is usually more like 0.7–0.9. The wiggle
  added this turn (a few points out of rank order) wasn't enough to knock
  it down much. Either loosen the dataset further, or — probably better —
  say explicitly in the copy that real-world height/weight correlation is
  usually weaker than this particular toy sample, since right now the page
  doesn't caveat that at all and risks reading as "0.97 is normal for real
  human traits."
- **Anscombe's quartet as a fourth "fools r" preset** would strengthen the
  "correlation isn't the whole picture" section — right now there's a
  curved example and an outlier example, but not all four Anscombe shapes
  side by side. Would need either a bigger canvas or four small
  side-by-side mini-canvases; the mini-canvas layout is the part worth
  prototyping first since it's a different rendering approach from the
  single interactive canvas here.
- **A point-count control** (add/remove points, not just drag existing
  ones) was considered and cut for time in turn one, still not built.
  If added: clicking empty canvas space could add a point, and a small
  "×" per point (or a long-press on touch) could remove one — needs real
  touch-target thought since the existing 26px hit radius for drag is
  already close to the minimum for a second gesture. The person-icon
  rendering (turn five) is not a blocker for this: hue is derived as
  `i / points.length * 300`, so a variable point count already works.
- ~~The breakdown panel's fixed SCALE=300~~ — fixed this turn via a
  per-domain `currentDomain.barScale` (`300` abstract, `1800` for
  `people`). If a *third* domain gets added, give it its own hand-picked
  `barScale` too rather than assuming either existing value fits.

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
- `.switchrow:has(input:checked)` (turn four, stops the glow once checked)
  degrades gracefully rather than breaking on browsers without `:has()` —
  the pulse just keeps running forever, which is a minor cosmetic miss,
  not a functional one. Fine to leave as-is.
- The deviation rectangles are drawn between `axes`/gridlines and the
  best-fit line, inside their own `ctx.save()/clip()/restore()` pair, so
  they respect the plot bounds but never clip the best-fit line's own
  clip region (that one opens and closes separately, right after). If you
  add a third canvas overlay, give it its own save/clip/restore too rather
  than trying to reuse one across sections — cheap and avoids one region's
  dash pattern or line width leaking into the next.
- **Turn five:** the person icons are `Image`s loaded from SVG data URIs
  (`getPersonIcon`), not drawn synchronously. `img.onload` fires async, so
  `draw()` can run once before any icon has loaded — handled by falling
  back to the old plain-circle rendering for that one frame and calling
  `draw()` again from inside `onload`. If you touch this, keep the
  fallback: without it the very first paint on page load shows nothing at
  each point until the (usually near-instant, same-tab, no-network)
  image decode finishes.
- **Turn five:** `toCanvas`/`toData` now read `currentDomain`, which is
  plain module-level state set inside the preset-button click handler —
  if you add a way to change domain from anywhere else (e.g. a text input
  for custom variables), route it through the same `currentDomain =
  DOMAINS[key] || DEFAULT_DOMAIN` assignment before calling `draw()`, or
  the plot will keep rendering points against the old domain's scale.
- **Turn five:** the best-fit line's clip-and-draw already handled an
  out-of-0–10 domain correctly by construction (the line equation is in
  data space, independent of pixel domain) — but if you ever add a domain
  where `xMin > xMax` or a zero-width axis, `toCanvas`'s division by
  `(d.xMax - d.xMin)` will divide by zero. Not currently possible from any
  UI path, so not guarded.
