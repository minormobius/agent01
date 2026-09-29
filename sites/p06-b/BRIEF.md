# domino-upright — Pip Cascade

## What this is

The ask: a cellular automaton where each cell is a domino. Upright cells stand
in one of 4 orientations — the projectivization of the 8-direction Moore
neighborhood, i.e. 4 axes: vertical, horizontal, and the two diagonals. Falling
cells carry one of the full 8 compass directions. Falling decays to a single
absorbing `fallen` state one step later. An upright cell topples when it has a
falling neighbor pushing *into* it along a direction that isn't orthogonal to
its own axis, and it picks one of its 2 axis-perpendicular fall directions —
unless the incoming pushes cancel because two of them point exactly opposite
each other.

Shipped: a full working implementation — canvas 2D renderer (no three.js
needed, this is a 2D grid), a toroidal (wrapping) grid, play/pause/step,
adjustable speed and grid size, and tap-to-ignite: tapping an upright cell
topples it toward wherever you tapped; tapping a falling/fallen cell resets it
to a fresh random upright axis. Legend and a written rule explanation are in a
`<details>` block. This is a complete first turn, not a skeleton — the whole
mechanic is implemented and playable.

## Decisions

- **Toroidal grid (wraps at the edges)**, not a bounded one. Chose this over
  clipping/ignoring off-grid neighbors because a domino CA is about sustained
  cascades, and hard edges kill cascades near the border for no interesting
  reason. Easy to change to clamped/dead edges if that's wanted instead —
  it's the `wrap()` calls in `step()`.
- **Direction/axis share one numbering.** Axis values 0-3 are literally the
  first 4 entries of the 8-direction table (N, NE, E, SE), since an axis is
  just an unordered line through a direction and its opposite. This made the
  geometry (`angleOf`, `circDist`) fall out of one small lookup table instead
  of two parallel ones — worth knowing before "cleaning up" what looks like
  duplication.
- **Fallen keeps its direction as render-only data.** The automaton spec calls
  for a *single* fallen state, and it is single for every purpose that affects
  the rule — a fallen cell never pushes, never reactivates, and two fallen
  cells that arrived via different directions behave identically. The
  direction byte is retained purely so the flat bar renders lying the way it
  fell; it has zero effect on `step()`'s logic. If a reviewer wants the state
  space to be *literally* one value, that byte can be dropped and the render
  branch simplified, at the cost of fallen dominoes all rendering the same way.
- **Canvas 2D, not three.js.** This is a flat grid CA — 3D bought nothing and
  costs more per-frame for no visual gain at this cell count.
- **No PDS/save-state.** Didn't wire up `/_kit/pds.js` — a CA board isn't
  something a visitor would want to reload later the way a puzzle or score
  would be, and sign-in-gated persistence for a toy like this seemed like the
  wrong trade per the "sign-in is optional unless meaningless without it" rule.
  If the requester wants to save/share specific interesting boards, that's the
  natural next feature (see below).

## The plan (not built yet, in order)

1. **Two ambiguities in the spec were resolved by fiat — worth checking they
   match intent.** (a) When a push arrives exactly along a domino's own axis
   (e.g. an E-W domino pushed from due E), there's no perpendicular bias to
   pick which of its 2 fall directions to use — currently ties go to the
   lower-indexed one deterministically (`mapToFallDir`'s `<=`). (b) When
   multiple non-cancelling pushes arrive that would map to *different* fall
   directions (they're not exactly opposite so they don't cancel, e.g. NE and
   NW both hitting an E-W domino), the lowest-valued push direction wins
   (`Math.min` in `step()`). Both are arbitrary-but-fixed. If the intent was
   randomized tie-breaking, or majority-vote, or "domino picks both and
   splits" (not representable in this state model), that's a rule change, not
   a bug fix.
2. **Share/permalink a specific board.** Encode the grid into the URL hash
   (base64 of the Uint8Arrays) so an interesting cascade setup can be linked.
   No backend needed for this, purely client-side.
3. **A "brush" of pre-set patterns** (e.g. a line of dominoes all one axis, a
   diagonal chain) placeable by tap, to make it easier to explore specific
   cascade geometries without scrambling the whole board.
4. Possibly: color the falling arrowhead more visibly at small cell sizes —
   at grid=64 the arrow is a few pixels and hard to read; the rod is the
   dominant visual cue there instead, which is fine but was not deliberate.

## Gotchas

- **Canvas rotation convention bit me once already, fixed in this build but
  worth restating:** every shape must be drawn pointing along +x (east) in
  its *own* local (untransformed) coordinates, because `angleOf(k)` is
  `atan2(dy, dx)` measured from +x. Drawing shapes in the "obvious" default
  orientation (tall rectangle, arrow pointing up) and then rotating by
  `angleOf` silently rotates everything 90° off. If you add a new visual
  element, draw it pointing east first.
- **`cellAt()`'s tap-direction snap must use a wrap-safe angular distance**,
  not `(a - b + PI) % 2PI - PI` — JS's `%` keeps the sign of the dividend, so
  that formula is wrong for angles near ±π and silently mis-picks the
  direction for taps near due-west. Use `abs(a-b)`, then `2π - diff` if it
  exceeds π, as `step()`'s `circDist` does in its own (integer, 8-step) space.
- No test harness available in this turn — logic was hand-traced against the
  spec (axis/orthogonal-axis pairs, opposite-direction cancellation, the
  circular-distance fall-direction mapping) but not run. Worth an eyeball on
  first load: an upright domino's long axis should visually match its stated
  orientation (e.g. "horizontal" should look horizontal, not vertical) — that
  exact bug existed in an earlier draft of this file and was caught by
  re-deriving the rotation convention, not by running it.
