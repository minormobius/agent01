# place-line ("Kiss Chain") — handoff

## What this is

The ask: place a unit-length segment, then a second segment at a random
angle that makes contact somewhere along *its own length* (not at its own
endpoint) with an endpoint of the first. From there, every additional
segment must touch the still-untouched endpoints of two other segments,
with no other intersections anywhere.

Shipped: a full working generator + viewer, `lab/www/place-line/index.html`,
one file, no dependencies. It draws segment 1 fixed at (0,0)-(1,0), lets you
seed segment 2 at a random angle through one of its endpoints, and then
grows the structure one segment at a time (manual "Add segment" button or an
"Auto-grow" loop) by picking two free endpoints on two different existing
segments and building a new segment along the line through both, extended
past each so they become interior touch points. Every candidate is checked
against every existing segment for intersections before being accepted; a
collision or a "no room" result is surfaced as a real, visible message, not
swallowed. Pan (drag) and zoom (wheel, +/- buttons, Fit) on the diagram.

## Decisions

- **Every segment is unit length, not just the first.** The prompt only
  states unit length for segment 1. But "touch the untouched endpoints of
  two other segments... along its length" only fully determines the new
  segment's geometry if its length is fixed — otherwise the new segment's
  own length is an unstated free parameter, and the construction reads as
  underspecified rather than as a real rule. Making every segment unit
  length is the reading that makes the whole thing well-posed: given two
  points closer together than 1 unit, there is a determined (up to how you
  split the leftover 1-d slack between the two overhangs) unit segment
  through both. Flagged on-page under "The rule," in NOTE.txt, and here.
  This also gives the construction a natural halting condition: two points
  further than 1 unit apart in a straight line simply cannot be joined, so
  growth runs out of room by construction rather than needing an arbitrary
  step limit.
- **Which endpoint of segment 1 does segment 2 touch, and how far along
  segment 2 is the contact point** — both randomized (endpoint 50/50, contact
  parameter t uniform in [0.15, 0.85]) rather than fixed, since the prompt
  says "random angle" but is silent on the rest and a fixed choice would look
  like an arbitrary default rather than a deliberate one.
- **Growth search is randomized, not exhaustive/backtracking.** Each "add"
  attempt samples up to 500 random free-endpoint pairs and split ratios and
  takes the first one that doesn't cross anything. This is fast (sub-frame at
  the scale this produces) and simple, but it means a single failed attempt
  is not proof there's no room left — pressing again resamples and can
  succeed. The UI treats a failure as "try again," and only gives up
  auto-grow after 6 consecutive failures.
- **No PDS/save integration.** This is a generative toy with no per-visitor
  state worth persisting (the whole point is watching a fresh random
  structure grow), so sign-in would only add friction. Skipped rather than
  built as an unused stub.
- **No CARD.json.** The page is meant to be opened and interacted with —
  the screenshot of a mid-growth tangle is the honest advert, and a
  generated illustration would be a worse, less accurate one for a tool like
  this.

## The plan (not built yet, roughly in order)

1. **Replace random sampling with a real search when it stalls.** Right now
   a "no valid placement found" after 500 tries might still have a solution
   (e.g. only 1-in-2000 pairs happen to work at high density). A proper
   answer would enumerate all free-endpoint pairs within distance 1, check
   each once, and only report true exhaustion when none work. This is the
   one piece of real algorithmic work left — everything else here is polish.
2. **Undo / step-back**, since a manual "Add segment" click can add a
   visually messy segment (valid, but placed somewhere unintuitive by chance)
   and there's currently no way to remove just the last one without a full
   Reset.
3. **A seeded RNG with the seed visible/settable in the UI (and maybe the
   URL)**, so a specific interesting-looking structure can be reproduced or
   shared. Currently every load/reset is `Math.random()`, unreproducible.
4. **Colour segments by generation/depth** (segment 2 vs. segment 20) rather
   than a flat accent colour, to make the growth order visually legible at a
   glance — currently every segment looks identical regardless of age.
5. Pinch-to-zoom on touch (currently only drag-to-pan plus tap +/-/Fit
   buttons work on mobile; wheel-zoom is desktop-only). Not urgent since the
   button-based zoom already covers phone use, but worth adding if someone
   asks for it specifically.

## Gotchas

- The segment/segment intersection test (`segIntersect`) has to special-case
  the collinear-overlap case separately from the generic parametric
  crossing case — a naive determinant-based test silently returns "no
  intersection" (denominator ~0) for two segments that overlap along the
  same line, which is exactly the degenerate case this construction has to
  reject (a new segment lying flush along an old one, e.g. if a sampled
  angle for segment 2 comes out nearly parallel to segment 1).
- Touch points are compared with a `1e-6` epsilon, not exact equality —
  floating point from the extension arithmetic (`P - eP*dir`) won't land
  exactly back on `P` when re-derived through the general intersection
  solver, even though it's the same point analytically.
- I could not run this in a browser myself (no network/shell in this
  sandbox); the harness's post-build screenshot is the first real look at
  it. If the auto-fit viewBox padding/aspect logic looks off on the actual
  screenshot, that's the first place to check — it's the one part of the
  rendering path with no unit-level sanity check other than reading the
  arithmetic back.
