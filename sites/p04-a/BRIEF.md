# BRIEF — create-stack

## What this is

The ask: a stack chart of the entire universe's timeline, Big Bang to heat
death, where each layer is a form of life (microbes, humans, etc.) and layer
height is "amount of life" = quality of experience × quantity, estimated.

Shipped: a single-page stacked-area chart with x = log10(years since the Big
Bang), which is the only way to fit ~10^100 years on one axis at all. y per
layer = log10(quantity × quality), stacked. Five layers: microbial,
multicellular, sentient animals, humans, and a speculative future-life layer
(toggleable). Three zoom presets ("Whole universe" / "Life on Earth" / "The
deep future"), a drag-to-scrub time slider (also draggable directly on the
chart via pointer events), a live readout of era + per-layer magnitude, and a
"how were these numbers guessed" reveal panel with the actual quantity/quality
assumptions in a table, explicitly marked as disagreeable guesses.

## Decisions

- **Log-log, not linear.** Linear quantity×quality would make microbial life
  ~10^18× taller than everything else, so I plotted log10(quantity×quality)
  per layer and stacked *that*. This means total stack height is not a literal
  sum of experience — it's dominated by whichever layer is largest. I say this
  explicitly in the reveal panel rather than let the chart imply more rigor
  than it has.
- **Default view is the full "Whole universe" domain, not zoomed to life.**
  On that view, everything since Earth formed is a near-invisible sliver
  against 100 log-decades of empty universe. That's deliberate and is the
  actual point of the request ("project the entire timeline") — the zoom
  presets exist so a visitor isn't stuck squinting at a hairline, but the
  first honest thing the page says is "you have to go looking for us."
- **Speculative future life is a real layer, toggleable, not baked in.**
  Whether descendants of humanity persist for 10^12+ years is a total guess.
  Rather than assert it, I modeled one optimistic scenario and gave it a
  checkbox so a visitor can see the "we could just be the whole story"
  alternative directly, rather than only being told about it in prose.
- **Numbers are authored directly at keyframes, not derived from a live
  quantity/quality formula per point.** I kept a separate static assumptions
  table (quantity, quality, reasoning) for the five layers so the *typical*
  numbers are inspectable, but the interpolated curve between keyframes is
  hand-placed, not recomputed live from those two factors. This was a
  time-budget call — see the plan below for the better version.

## The plan (not built yet, in order)

1. **Make the assumptions live-editable.** Replace the static keyframe table
   with actual `{quantity, quality}` pairs per layer per era, and add sliders
   for the most contestable ones (human quality-of-experience, microbial
   quality) that recompute and redraw the stack in real time. This is the
   natural next step given the profile preference for direct-manipulation
   demos over static ones, and the architecture already separates "the
   estimate" from "the rendering," so it's a data change plus a couple of
   `<input type=range>` elements, not a rewrite.
2. **A real data table view**, per the dataviz skill's accessibility pass —
   right now the only tabular view is the assumptions table, not the plotted
   curve itself. Low effort, would need one row per keyframe.
3. **Reconsider the speculative layer's shape.** It's currently one
   invented curve (rise near "now," peak around 10^12 years, fade by
   10^40ish). A more honest version might offer 2-3 named scenarios
   (extinction near-term / plateau / expansion) as radio options instead of
   a single on/off toggle, so the speculation is visibly a choice among
   possibilities rather than one curve with a mute switch.

## Gotchas

- **log10(t) makes "now" and "10,000 years from now" indistinguishable.**
  Any near-future event has to move centuries-to-millennia before it shifts
  visibly on this x-axis, because the axis is measuring total universe age,
  not time-from-now. This is correct and is *why* the speculative layer's
  rise looks abrupt at "today" then extends far to the right — small
  time-from-now deltas literally don't move the x-coordinate.
  Don't try to "fix" that by switching to linear time; it's what breaks the
  chart for the 10^100-year range in the first place.
- **The chart is one big `innerHTML` rebuild on every slider tick and every
  zoom change** — no incremental DOM patching. It's cheap enough (~260
  sample points, a handful of path/line/text elements) that this wasn't worth
  optimizing, but if a future turn adds finer sampling or more layers, that's
  the first thing to profile.
- **Untested in a real browser by me** in the sense that I authored the
  keyframe numbers and the interpolation/rendering math by hand without a way
  to run it — the harness's post-build screenshot is the first real look
  this page gets. If the stack shapes look wrong, check `KEYFRAMES` first;
  the rendering pipeline (interpolate → cumulative sum → path string) is
  straightforward and less likely to be the bug.
