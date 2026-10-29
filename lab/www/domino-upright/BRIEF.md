# domino-upright — handoff

## What this is

A cellular automaton of toppling dominoes, requested as: "4 upright orientations
(projectivized moore neighborhood), 8 directional falling states, falling
transitions to a single fallen state, each upright has 2 fallings it can
transition to if it has falling neighbors not orthogonal to it & not pushing in
opposite directions."

Shipped: a working grid CA (canvas, no dependencies) with all three state
families, a precise implementation of the push rule, tap-to-place and
tap-to-push interaction, step/play/randomize/clear controls, a speed slider,
a colour legend, and a written-out explanation of the rule on the page itself
(under "the rule"). It runs, has a pre-seeded chain reaction on load, and is
playable on a phone (pointer events, 44px controls, no fixed pixel layout).

## Decisions

The request names concepts (projectivized Moore neighbourhood, "orthogonal",
"opposite directions") without pinning down the exact geometric predicate, so
I had to choose one. I went with the reading that makes both halves of the
spec literally true simultaneously, worked it through by hand, and wrote it
down twice — in the code comments and in the on-page "the rule" box — rather
than picking silently:

- Axes are 0°/45°/90°/135° (mod 180); an upright on axis θ can ONLY ever
  become falling(θ) or falling(θ+180) — never any other of the 8 falling
  directions. That is the literal meaning of "each upright has 2 fallings it
  can transition to."
- A neighbour at relative direction n only counts if it is falling in
  direction n+180 (i.e. its motion is actually heading toward this cell, not
  away from it or sideways past it).
- Of that neighbour's falling direction d, "orthogonal to it" excludes
  d = θ±90 (2 of 8 directions) from having any effect at all — no lever arm,
  ignored outright, not even counted toward a tie.
- The remaining 6 directions split evenly: 3 near θ (θ, θ±45) push toward
  falling(θ); 3 near θ+180 push toward falling(θ+180).
- "Not pushing in opposite directions" = if valid pushes exist toward BOTH
  ends in the same tick, they cancel and the upright stays upright, rather
  than picking one arbitrarily.

~~Rendering choice: an upright's bar is drawn ALONG its fall axis~~ — **reversed
turn three, see below.** The requester came back and said this reads as
90° off from real-world domino physics, and they're right: a real domino
stands with its long footprint PERPENDICULAR to the line it topples along
(picket-fence style — wide face-on to the direction of travel, narrow along
it), not with a bar pointing down the fall line. Do not revert this.

No accounts, no PDS save. This sim has no visitor-identity angle (nobody's
handle or avatar is involved) and works fully anonymously, so I left auth out
entirely rather than bolting on a save button just because the kit offers one.

## Turn two (2026-09-06): fixed the reported bugs

The requester came back with three complaints: "the behavior seems maybe
buggy," "can't tell visually which direction the falling dominoes are falling
in, which direction one is pushing in," and "push seems to also rotate
sometimes?" All three traced to the same root cause plus one rendering issue,
not to the CA rule itself (re-verified the step() logic by hand again this
turn — it still matches the rule as documented above and in "the rule" box;
did not touch it):

- **The push-rotates bug was real.** Push committed a direction straight from
  the raw pointerdown position: `Math.atan2(fy, fx)` on a tap near a tile's
  *centre* is one pixel from the boundary between two of the 8 direction
  buckets, so a tap meant to push "forward" could snap to a neighbouring 45°
  bucket by sub-pixel noise — which reads exactly as "it rotated instead of
  falling where I pushed." Fixed by turning push into a **press-drag-release**:
  direction previews live as a white ghost arrow while dragging (see `draw()`
  and the `pushPending`/`previewDir` state), and a dead zone
  (`PUSH_DEADZONE = 0.16` of the cell half-width) around the centre means
  nothing commits until the drag is unambiguous. A plain tap far enough from
  centre still works in one motion — this doesn't remove the old gesture, it
  removes the noise floor that made it unreliable.
- **Direction was hard to read.** The old falling-arrow was a bar with a
  small triangle drawn *overlapping its own tip* — from a few feet away (or a
  phone) it read as a faint notch, not an arrowhead. `drawBar()` now draws a
  narrow tail-shaft feeding into a distinctly wider, pointed head, with a dark
  stroke outline on every shape for contrast against the axis colours. The
  legend swatch (`barSvg`) was updated to match so it doesn't now contradict
  the canvas.

Not changed: the automaton's transition rule, the axis/falling/fallen state
encoding, the seed pattern, the colour palette. If a future report says the
*rule* itself looks wrong (e.g. a specific hand-traceable sequence of ticks
producing an unexpected result), that's a different bug from this turn's and
wants a fresh hand-trace against the "the rule" box, not a rendering fix.

## Turn three (2026-09-06): fixed the 90° rendering, added drag-to-place

Requester said the behaviour is now correct but "the dominos display as 90
degrees off from how someone w/ a real-world understanding of dominos would
expect them to behave," and asked for click-and-drag placement of a path of
dominoes. Both done, nothing else touched:

- **The 90° fix.** Uprights now draw at `axis*45 + 90` instead of `axis*45`
  (see `draw()`), so the bar sits perpendicular to the axis it can fall
  along — matching a real domino's footprint (wide across the direction of
  travel, narrow along it — picket-fence style), not a bar pointing down the
  fall line. Legend swatches (`barSvg` call for uprights) updated to match.
  **This directly reverses last turn's explicit "legibility choice" — that
  choice was wrong, per the person who owns the site. Do not revert it back.**
  Falling-state arrows and the push-preview arrow are untouched: those
  already point in the actual direction of travel, which was never the
  complaint.
- **Drag-to-place.** Place mode now supports press-and-drag: dragging across
  cells lays a connected chain of upright dominoes, each one's axis set from
  the *local* direction of travel through it (`axisFromDelta`, mod 180 since
  an axis has no forward/back), so a curved drag produces a chain that curves
  with it rather than one fixed angle for the whole gesture. A fast drag that
  jumps several cells between pointermove events is filled in with a
  Bresenham line (`placeAlong`) so the chain has no gaps. A plain tap with no
  movement still falls back to the old cycle-through-orientations behaviour
  (tracked via `placeDrag.moved`), so existing muscle memory isn't broken.

Not changed: push mode's gesture or its dead-zone logic, the CA step
function, the seed pattern (which now *reads* correctly under the fixed
rendering — a horizontal run of axis-0 dominoes shows as a picket fence of
vertical bars, which is the point).

## The plan (not built yet, in order)

1. **Toroidal wrap toggle.** Right now edges just have fewer neighbours (no
   wraparound). A checkbox that wraps cols/rows would make long diagonal
   chains loop back on themselves — cheap, and the interesting case for a CA
   like this (does a chain reaction on a torus ever reach a stable pattern,
   or cycle forever?).
2. **Save/load a pattern to the visitor's own repo** via `/_kit/pds.js`
   (`com.minomobi.lab.doc`, kind `domino-upright-pattern`). Low priority since
   the sim works fully anonymously today; only worth it if someone wants to
   share a specific starting configuration.
3. **Bigger/zoomable grid.** Grid size is fixed at load (15×20 on narrow
   screens, 30×18 otherwise) from a single `innerWidth` check, not a live
   resize-and-regrid — a hard resize (rotating a phone) rescales pixels but
   doesn't change the logical grid, which is fine but noticeable. A real fix
   needs a decision about whether existing cell contents should be preserved,
   cropped, or reset on regrid; I picked "don't regrid" to dodge that
   decision, not because it's the right answer long-term.
4. **A "does this ever stabilize" analysis mode** — run to a fixed point
   automatically and report generation count / whether it cycled — would suit
   this requester's pattern of wanting the real mathematical object explored,
   not just watched.

## Gotchas

- The CA step buffers into a second `Uint8Array` and swaps; don't be tempted
  to mutate `grid` in place mid-step — a cell reading its neighbour's
  already-updated state mid-tick would make the automaton asynchronous and
  order-dependent, which is not what "synchronous CA" means.
- `diff` in the classification is computed mod 8 as
  `((d - axis) % 8 + 8) % 8` — JS `%` returns negative results for negative
  operands, and dropping the `+8` there silently breaks the group1/group2
  classification for about half of all (d, axis) pairs. Caught this by hand-
  tracing the seed pattern before shipping, since this sandbox has no shell
  to run it in.
- Angle convention throughout is canvas pixel space (y grows downward), so
  `atan2(dy, dx)` at 0° means East and 90° means South, matching `DX`/`DY`
  and `ctx.rotate`'s clockwise-positive direction. `axisFromDelta` and
  `directionFromOffset` both rely on this being consistent; if you ever
  introduce a math-convention angle (y-up) anywhere, everything drawn
  perpendicular or "toward" a neighbour will be mirrored.
