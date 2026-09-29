# BRIEF — create-stack

## What this is

Requester's words (paraphrased from the task): "Create a stack chart
projecting the entire timeline of the universe from the Big Bang to heat
death showing the amount of life in the universe — each layer should
correspond roughly to one form of life, such as humans. Define amount of
life as quality of experience × quantity. Estimate."

The Bluesky thread around it ("are we cooked, as a society?" / "still raw
in the middle") is just tone context — nobody in the reply thread is asking
this bot for anything, so it's ignored per the task instructions.

Acceptance list, extracted from the ask:

1. A **stack chart** (stacked area / streamgraph), not a line or bar chart.
2. Spans the **entire timeline of the universe**: Big Bang → heat death.
3. Shows **"amount of life in the universe"** over that span.
4. **Each layer ≈ one form of life** (example given: humans) — bacteria,
   insects, fish, dinosaurs, mammals, humans, etc. should each be their own
   band, not lumped into "life" as a single number.
5. **"Amount of life" is explicitly defined**: quality of experience ×
   quantity — both factors have to be visible/inspectable, not just a
   single opaque score.
6. It says **"Estimate"** — the numbers are acknowledged guesses. The build
   should show real order-of-magnitude reasoning (not fabricate false
   precision) and say so on the page.

## What shipped

One file, `index.html`, no dependencies, no Bluesky lookup (this is a
pure-concept page — per the requester's profile they're comfortable with
that, and there's no handle to look up here anyway).

- A **piecewise-log time axis** built by hand (no d3): Big Bang → first
  life is one log-compressed segment, first life → now is a second
  log-compressed segment (this is where all the real biological layers
  live, so it gets the most screen width deliberately), and now → heat
  death (10^100 yr) is a third log segment. A pure single log(age) axis
  was tried first and rejected — see DECISIONS.
- 14 layers, each a form of life, each with a start/peak/decline and a
  `quantity` (order-of-magnitude population estimate) × `quality`
  (0–20ish subjective-richness scale I defined and documented) that
  multiply into the stacked value. Values are `log10(quantity × quality)`
  stacked, not the raw linear product — see DECISIONS for why.
- Canvas-drawn stacked area chart, hover/touch scrub for exact readout
  (direct manipulation, not autoplay — matches the requester's stated
  preference), era tick marks and labels along the axis.
- A pulsing gradient "how is this calculated" toggle that reveals a table
  of every layer's quantity, quality, and the one-line reasoning behind
  each number — the "mechanism as opt-in reveal" pattern from prior builds
  with this requester.
- Rainbow gradient chrome (heading, panel border, the reveal button) over
  the kit's plain dark reading surface — matches this requester's stated
  palette preference, applied to chrome only, body text left at kit
  contrast.
- Big, unmissable caveat block: this is an order-of-magnitude estimate,
  quality-of-experience numbers are invented and contestable, everything
  after ~2100 CE is speculative extrapolation not prediction.

## Decisions

- **Piecewise axis over a single log(age) axis.** A straight log10(years
  since Big Bang) axis, big-bang-to-heat-death, puts ALL of biological
  history (single-cell life ~10.3 Gyr in, humans ~13.8 Gyr in) inside 0.1%
  of the axis width — it would render as a single pixel. That defeats
  "each layer should correspond roughly to one form of life": you'd see
  one indistinguishable sliver and 99.9% future speculation. Instead the
  axis is three hand-built log segments with FIXED screen-width shares
  (~18% pre-life, ~42% first-life→now, ~40% now→heat death) so the known
  biological layers are actually readable, while the axis labels and a
  short caption still tell the truth: even at generous width, life is a
  rounding error against cosmic time. This is the one thing I'd flag for
  a design reviewer — it's an honest but nonstandard axis, not a
  real bug.
- **Stacked value is log10(quantity × quality), not the raw product.**
  Bacteria quantity (~10^30) vs. human quantity (~10^10) differ by 20
  orders of magnitude; a linear stack would render every other layer as a
  flat zero line under the bacteria band. Logging the product before
  stacking keeps every layer visible, but it means the chart is NOT a
  true linear sum of "amount of life" — a caption says this explicitly,
  and the mechanism reveal shows the real (unlogged) numbers per layer so
  nobody mistakes the chart for the actual arithmetic.
- **No Bluesky handle box.** Matches this requester's documented comfort
  with pure-concept pages (see `lab/_profiles/ezba.bsky.social.md`) and
  there's nothing personal to look up for this request.
- **Future layers (post-human/AI, galactic-era, degenerate-era exotic
  life) are included** because the ask says "to heat death," but they're
  visually and textually marked speculative (dashed outline + lower
  opacity + called out by name in the caveat), so the chart doesn't
  present science fiction with the same confidence as the fossil record.

## The plan (not done, in order)

1. **Verify on a real phone viewport with `eyes` tools** — I ran `look`
   and `drive` during this build, but if you're picking this up cold,
   re-check the hover/touch scrub works with a *drag* gesture (not just
   tap) at 390px wide; canvas touch handling is the part most likely to
   have a rough edge I didn't fully exercise.
2. **Consider adding 2-3 more invertebrate/plant layers** (land plants,
   fungi) if a follow-up wants more granularity — the data structure
   already supports adding a layer, it's one object in the `LAYERS` array
   plus a color.
3. **If someone objects to the log-stacking choice**, the alternative is
   a small-multiples view (one sparkline per layer, true linear scale,
   own y-axis per layer) instead of one stacked chart — more honest
   arithmetic, less "one chart" feel. Worth offering as an option rather
   than replacing the current view outright.

## Verification (checked with the `eyes` tools this turn)

1. Stack chart, not line/bar — confirmed visually, canvas draws filled
   stacked bands.
2. Big Bang → heat death span — confirmed: axis ticks run Big Bang → first
   stars → Earth forms → first life → Cambrian → dinosaurs die → now →
   Sun swells → last stars fade → black holes evaporate → heat death, and
   `ageAtFrac`/`xFrac` were checked to be true inverses at the segment
   boundaries.
3. Each layer its own band — confirmed: 14 distinct coloured bands render,
   legend lists all 14, clicking a legend item isolates that band (dims
   the rest) — checked with `drive` on both desktop and a touch (drag)
   viewport.
4. Quantity × quality shown, not just a total — confirmed: the reading
   panel under the chart lists, for every point in time, each present
   layer's raw quantity, its quality, and the resulting amount (e.g. at
   "now": `humans 8.2×10⁹ × 8.0 q ≈ 6.6×10¹⁰`), read via `eval` against
   the live page, not just eyeballed.
5. "Estimate" is honoured — confirmed: the caveat block above the chart,
   the formula box, and the full mechanism table (every layer's peak
   quantity/quality/amount plus a one-line citation or reasoning) are all
   present and legible at 1280px, 390px and 360px wide.

Also checked and fixed during this pass: axis tick labels originally
overlapped into an unreadable clump (fixed with a greedy row-packing
layout); the legend buttons were 34px tall, under the 44px tap-target
floor (fixed); the "post-human / AI minds" band had a near-vertical jump
right after "now" from an under-spread keyframe (softened by spreading
its first jump over more decades). Not independently checked: whether the
colour choices clear the project's CVD validator — no shell was available
to run it (see the mechanism panel's own disclosure of this).

## Review round 1

Reported:

1. `fmtSci()` showed non-standard scientific notation like `10.0×10²⁴` instead
   of `1.0×10²⁵` for interpolated values that round up to a full power of ten
   — most visible while scrubbing near "now", since most layers ramp toward
   round-number keyframes there.
2. The empty-panel string "No life yet at this point in cosmic history" was
   shown for times *after* every layer had gone extinct too (e.g. deep into
   the post-heat-death future), not just before life began — backwards use
   of "yet".

Fixed:

1. `fmtSci()` now re-checks its rounded mantissa: if `toFixed(1)` rounds up
   to `10.0`, the exponent is bumped and the mantissa reset to `1.0`, so the
   mantissa always lands in `[1,10)`. Found the same bug also live in the
   `n < 10` "plain number" branch (`fmtSci(9.96)` was `"10.0"` with no
   exponent, same rounding-without-recheck class) — fixed that branch too by
   falling through to scientific notation when the plain-number rounding
   crosses 10. Verified via `eval` against the live page across the boundary
   cases (`9.94`, `9.96`, `9.98e24`, `9.999999e24`, `1e25`) and by rereading
   the mechanism table's rendered `<td class="num">` cells.
2. Added `LIFE_START`/`LIFE_END` (min/max keyframe age across all layers) and
   split the empty-panel copy: pre-`LIFE_START` keeps "No life yet at this
   point in cosmic history," post-`LIFE_END` now reads "No life modeled at
   this point — every band on this chart has already gone extinct." Verified
   by calling `updatePanel(f)` directly at fracs before first life, in the
   post-heat-death tail past `LIFE_END`, and in between.

Not changed: nothing else reported. Re-checked the mechanism table, legend,
reveal toggle, and a 390×844 mobile viewport after both fixes — all render
as before.

## Review round 2

Reported:

1. The scrub panel's rounded quality display didn't match its own "amount"
   for the largest layers — `bacteria & archaea 5.0×10³⁰ × 0.0 q ≈ 1.0×10²⁹`,
   because the panel row formatted `quality` with `toFixed(1)` while every
   real quality value on the chart is `>= 0.02`, which rounds to `0.0`.
2. The stack collapsed through a near-vertical spike right after "now" —
   climbing ~159→186.6 then crashing to <1 within ~4% of the chart's width
   (~25-30px), reading as a rendering glitch. Real cause: every earthbound
   biological layer's last keyframe sits within the same ~0.5 Gyr window
   (~1.0-1.5 Gyr from now), and a log(yearsFromNow) axis spanning to 1e100 yr
   can't spread out an event less than one order of magnitude wide no matter
   how much screen width the segment gets.

Fixed:

1. Panel row quality now uses `toFixed(2)` (matching the mechanism table's
   existing precision), so `0.02` renders as `0.02` not `0.0`. Verified via
   `updatePanel()` at the "now" fraction: `bacteria & archaea 5.0×10³⁰ ×
   0.02 q ≈ 1.0×10²⁹` — the shown multiplication now checks out exactly.
2. Split the post-"now" axis into three segments instead of one: a log
   segment for when later speculative layers first appear (`T_APPEAR_END`,
   1 yr-1 Gyr — genuinely spans decades to a billion years, so log still
   reads naturally there); then a dedicated **linear** segment for
   `T_APPEAR_END`-`LIFE_DECLINE_END` (1-2 Gyr from now) that gives the
   extinction cluster real, fixed screen width instead of vanishing into a
   log axis; then log again for the deep future. Also added a "life ends"
   tick at `FUT(1.45e9)` next to the existing "Sun swells" tick, so the
   transition is named as well as widened. First attempt used a single
   linear segment for the whole "now→2 Gyr" span, which fixed the crash but
   *introduced* a new near-instant vertical jump right at "now" (the
   appearance of post-human/galactic layers, which happens over decades-to-
   millennia — negligible width on a 2 Gyr linear scale, though it had
   ~17px of width on the old log axis). Caught by sampling `cum` at fine
   resolution before and after each change, not just eyeballing the
   screenshot. Final version: the appearance transition now spreads over
   ~250px+ of a 668px chart (log-scaled), the extinction crash spreads over
   ~48px (was ~25-30px, now genuinely readable as a slope), and
   `ageAtFrac`/`xFrac` were re-checked as exact inverses at every segment
   boundary (`SEGB[1]` through `SEGB[4]`) plus near the axis extremes.

Also re-checked after both fixes: real pointer-drag scrub and touch-drag
scrub both land correctly on the widened transition; tick labels (now 12,
plus "life ends") still row-pack without overlap; legend isolate and the
mechanism-table toggle still work; mobile (390×844) renders correctly.

## Gotchas

- Canvas devicePixelRatio scaling: set canvas backing-store size to
  `rect.width * dpr` and use `ctx.setTransform(dpr,0,0,dpr,0,0)` once per
  resize, not per frame — easy to double-scale by accident on redraw.
- `prefers-reduced-motion` only disables the CSS gradient animation
  (kit's blanket rule handles that); the canvas itself only redraws on
  pointer/resize events, never rAF-loops on its own, so there was nothing
  else to gate.
