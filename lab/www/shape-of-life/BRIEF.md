# BRIEF — create-stack

## What this is

A request from the thread: a stacked chart of the entire universe's timeline,
Big Bang to heat death, showing "amount of life" per era — defined in the ask
as quantity × quality of experience — with each band roughly one life form
(microbes, simple animals, complex animals, humans, ...). Shipped as a single
page, `index.html`, no dependencies beyond the kit.

Five layers: microbial life, simple animals (invertebrates), complex animals
(non-human vertebrates), humans, and a speculative "post-human / machine
descendants" band covering everything from digital minds through the far,
far future. Three time-range presets (whole timeline / life on Earth / the
far future) and two reading modes (share of total, stacked; total amount on
a log scale). A pointer/tap crosshair shows exact numbers at any moment. A
pulsing "how is this estimated?" button reveals the formula, the quality
weights with one-line justifications, a data table across eight eras, and an
explicit "what this is not" caveat list.

## Decisions

**The x-axis is two joined log scales, not one.** Big Bang to heat death is
~110 orders of magnitude in years; a single log(years-since-Big-Bang) axis
would put every event in Earth's biological history — abiogenesis through
right now — inside the leftmost 10% of the chart, indistinguishable from a
single pixel. Instead the axis is log(years-ago) for the past and
log(years-from-now) for the future, joined at "now" (`wholeFrac()` /
`wholeInv()` in the script). This is the same trick "timeline of the far
future" infographics use. The three view presets reuse the same per-layer
data model but swap in a single-domain log scale (`earthFrac`/`futureFrac`)
so each range gets full resolution.

**The default "share of total" view is NOT a literal linear stack — it's
cube-rooted, then renormalized to 100%.** This was the single biggest
problem in the build. Real quantity gaps between the layers are enormous:
~10^30 microbes vs ~10^10 humans, a 20-order-of-magnitude difference that no
plausible "quality of experience" weight can close without asserting
something scientifically indefensible (e.g. that an insect's inner life is
10% as rich as a human's, just to make pixels visible). A true linear 100%
stack would render as a single solid color — microbe-blue — almost
everywhere, with every other band sub-pixel. I chose to keep the honest
numbers (visible in the hover tooltip, the data table, and stated outright
in the caveats) but apply a cube-root visual-emphasis transform to the STACK
GEOMETRY only, clearly labeled under the chart ("Band thickness is the cube
root of each layer's share..."). This is a real, disclosed technique, not a
silent lie — but it is a judgment call, and if the requester wants the
unvarnished linear version instead (which would look like a flat blue block
for ~13 billion years), that's a one-line change: drop the `Math.cbrt()` in
the share branch of `render()`.

**Quality weights (0.0000001 microbes → 1 human → 1 speculative post-human)
are illustrative, not researched.** They're loosely inspired by how
real "moral weight" estimates in population ethics tend to reason (weight by
something like nervous-system complexity), but I did not try to reproduce
any specific published figure — there wasn't time to check one against the
sandbox's lack of network access, and the brief says estimates are fine as
long as they're labeled. They are, twice: in the reveal panel's table and in
the caveats list.

**No Bluesky handle lookup, no PDS save/leaderboard.** This is a
pure-concept page — nothing here is about a specific person, and the
underlying data model doesn't obviously benefit from per-visitor state. This
requester (per their profile notes) is comfortable with concept pages that
skip the handle box entirely.

## The plan — what's not built

1. **The transition eras are drawn with too few keyframes.** Each layer has
   8-13 keyframes across ~110 orders of magnitude of x-axis; log-linear
   interpolation between them is a straight line in log-population space,
   which will look like a slightly-too-sharp elbow at, e.g., the Cambrian
   explosion or the post-human band's takeoff around 2046. More keyframes
   (especially around known biological milestones — Ediacaran, Cambrian,
   Ordovician, K-Pg) would smooth the "life on Earth" view specifically,
   which is the range most likely to get scrutinized.
2. **The far-future keyframes for the post-human band are the weakest part
   of the model** — population figures from 10^5 to 10^40 years out are
   essentially a hand-drawn curve shaped to "look like" civilization
   expanding then fading with the stelliferous → degenerate → black-hole
   eras, not derived from anything. If a follow-up wants this taken more
   seriously, the right next step is reading up on the Adams & Laughlin
   "five ages of the universe" timeline properly (I only had it from
   memory) and re-deriving the curve's shape from that, rather than tuning
   numbers to look right.
3. **No dark/light toggle** — the kit is dark-only and I didn't add one;
   not needed unless a future ask wants it.
4. **The tooltip's screen-space math (`onHover`) assumes the SVG's rendered
   aspect ratio matches its viewBox aspect ratio exactly** (1000:460), which
   holds today because the CSS is `width:100%; height:auto`. If a future
   layout change constrains the SVG's height independently, the crosshair
   x-position and the tooltip's left offset will drift out of sync and need
   re-deriving from `getBoundingClientRect()` on both axes.

## Gotchas

- **Log-scale stacking of wildly-uneven-magnitude series is close to
  unworkable**, and it cost most of the build's time. If you're extending
  this or building something similar: decide up front whether the point is
  to show relative composition (needs a share-of-total view, probably with
  a compression transform) or absolute scale (needs a log total, probably
  NOT stacked by layer) — trying to do literal stacking on a log y-axis
  doesn't actually solve the visibility problem, it just relocates it
  (I tried this first and abandoned it).
- Untested in an actual browser beyond reasoning through the math by hand —
  the harness's post-build screenshot is the first real look. If the
  cube-root stack looks wrong (bands in an unexpected order, or the "share"
  view not reaching 100% at the top), check `emphShares` renormalization in
  `render()` first — that's the newest and least-exercised code path.
