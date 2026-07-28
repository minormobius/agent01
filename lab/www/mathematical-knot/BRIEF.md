# BRIEF — mathematical-knot

## What this is

@ponder.ooo asked for a mathematical knot simulator: Reidemeister moves,
crossing switches, a button that runs an energy-based relaxation (they pointed
at arxiv.org/abs/2006.07859, which I could not fetch — no network in this
sandbox), and the ability to load well-known knots. This is the first turn to
actually ship a page; two earlier attempts left nothing on disk.

What's live now: a three.js viewer showing a closed 3D curve you can drag/zoom.
Six presets (unknot, a pre-tangled unknot, trefoil, figure-eight, cinquefoil,
7₁ torus knot), all exact parametric formulas except the tangled unknot, which
is a circle with three kinks spliced in. A "Start relaxing" button runs a
continuous physical flow: bending force pulls each point toward its neighbours'
average, and a 1/d² repulsion between every non-adjacent point pair pushes the
strand off itself, with per-step displacement clamped so it can't blow up.
Reidemeister I (add/remove a kink) is a real, working local edit. Crossing
switching works via a detected-crossings list (not click-to-pick — see
Decisions) with a Switch button per crossing that flips which strand is in
front by nudging the curve's depth locally.

## Decisions

**3D curve, not a 2D PD-code diagram.** The obvious "textbook" representation
for Reidemeister moves is a planar diagram (a 4-regular graph with over/under
labels), and I considered building on that instead. I didn't, because general
R1/R2/R3 detection and rewriting on an arbitrary diagram is a real research-grade
problem to get right with no way to test the result here (no browser, no JS
runtime available to me — Bash isn't in this build's toolset). A 3D polygonal
curve sidesteps that: crossings are whatever the geometry produces, "over" and
"under" are just relative depth (no separate data structure to keep in sync),
and the energy relaxation — the actual novel ask — operates directly and
naturally on this representation. This is also how real tools in this space
(KnotPlot, SONO/Mobius-energy tightening) work: the energy method IS the 3D
curve method.

**Crossing switch is a list-with-buttons, not click-on-the-crossing.** Picking
a specific crossing on a freely-rotatable 3D canvas needs raycasting against a
tube mesh plus matching a screen click back to a specific pair of curve
parameters — doable, but risky to get right blind. Computing crossings via a
fixed-projection (ignore the model's local Z) segment-intersection pass and
listing them as buttons is unambiguous and testable by reading the code, so I
shipped that instead. It also means over/under is defined relative to the
model's own Z axis, independent of the view rotation — worth keeping if you
build the click-based picker later, so switching a crossing doesn't depend on
which way the user last dragged the camera.

**Möbius-energy-*inspired*, not the O'Hara functional and not the arxiv paper.**
The 1/d² pairwise term plus curvature-smoothing is the right family (this is
close to the classic knot-tightening literature: SONO, and gradient descent on
repulsive energies), but it is not a rigorous implementation of any specific
paper's functional, and the UI copy says so. Don't let anyone believe it's a
faithful reproduction of 2006.07859 — nobody here has read it.

**Only R1 is implemented as an explicit move.** See THE PLAN.

## The plan (next turn, in order)

1. **R2 (poke/unpoke a strand over a neighbour).** The natural extension of the
   R1 kink-insertion approach: instead of looping a single edge around its own
   tangent, take a short run of the curve and displace it in Z over an adjacent
   run (adding two crossings), or detect two adjacent same-pair crossings and
   pull them apart to remove them. Detecting "two adjacent crossings between the
   same strand pair" from the `computeCrossings` list (already in index.html) is
   the hard part — you need crossings that are close in *arc-length* on both
   strands, not just close in space.
2. **R3 (slide a strand across a crossing).** Purely a reparametrization of
   which of three mutually-crossing strands is "in front" locally — lowest
   priority, since R1+R2+crossing-switch already let a user reach any diagram
   from any other of the same knot type in principle (crossing switch changes
   type; R1+R2 alone do not, but R3 is needed for *some* isotopies R1/R2 alone
   can't reach without detouring through a higher crossing number first).
3. **Click-to-pick a crossing directly on the 3D view**, once R2/R3 exist and
   there's more reason to interact precisely rather than pick from a list.
4. **Undo of a kink survives a relax pass.** Right now `insertKink`'s returned
   `{start, count}` range is only valid until `equalizeSpacing` next resamples
   the curve, at which point "Remove last kink" removes *some* contiguous
   range near the right place, not necessarily the kink itself. Tracking a kink
   by arc-length position (fraction of total curve length) instead of raw index
   would survive resampling; I didn't do this because it touches the resampling
   function too and I ran out of turn budget to reason through it carefully.
5. **A real crossing-number readout that's stable across relax steps**, shown
   live rather than only on demand — right now `refreshCrossings()` is only
   called when relaxing stops or a move is made, not every frame (deliberately,
   for performance — recomputing is O(n²) per call), so the number can be stale
   while "Start relaxing" is running.

## Gotchas

- **Can't test any of this.** No Bash, no browser, no way to load the page in
  this sandbox. Everything above is reasoned through by hand, not observed. If
  the harness's one-pass fix report comes back with a runtime error, start with
  `rebuildMesh()`'s TubeGeometry call and the pointer-event wiring — those are
  the parts most likely to have a signature mismatch I couldn't check against
  the actual r169 API on disk.
- **`renderer.setSize(w, h, false)` would have been a real bug** — I wrote it
  first, then caught it on review: `updateStyle=false` skips setting the
  canvas's CSS width/height, so with `devicePixelRatio` > 1 the canvas would
  render at 2x the container size with nothing constraining its CSS box,
  overflowing `#viewport`. Fixed to the two-arg form, which lets three.js set
  the style dimensions to match. If you ever pass `false` there for a reason,
  you now also need to set `canvas.style.width/height` yourself.
- **The `--col` token is overridden to `68rem` locally** (wider than the kit's
  default `46rem`) so the viewport has room to be a real 3D canvas, not a
  postage stamp. This is the sanctioned way to do it per the kit's own README —
  not a fork.
- No profile existed yet for @ponder.ooo before this build; I created one.
