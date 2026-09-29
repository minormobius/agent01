# BRIEF — take-escher

## What this is

The ask: take Escher's *Circle Limit III* woodcut and make it an interactive
explorer — pick a row of fish, "swim" them in the direction of their nose,
and have the rest of the tiling adjust to stay consistent.

What shipped (one turn, first pass): a single-file canvas app, `index.html`,
built on real Poincaré-disk hyperbolic geometry, not a static image or a CSS
trick. Five rows, each a straight diameter (a true geodesic of the disk),
carry fish spaced at a fixed hyperbolic step so they tile nose-to-tail. Fish
positions come from the actual hyperbolic-translation formula for the disk
model (`r = tanh(t/2)` along a fixed direction θ), and fish size is scaled by
the disk's own conformal factor (`sech²(t/2)`), so they shrink toward the rim
exactly the way the model says they should — not an eyeballed fade.

Interaction: tap a row swatch or drag directly on the canvas to pick a row;
drag along it (or use the swim-forward/back buttons) to translate its fish
continuously; release and it eases back to the nearest exact multiple of the
step, so the row is always left in a valid tiled state — that's the "preserve
the tiling" requirement, made concrete as a snap-to-lattice rather than a
live constraint solver.

## Decisions

- **Straight diameters, not Escher's actual curved, slanted arcs.** Real
  Circle Limit III rows are circular arcs meeting the boundary at ~80°, tuned
  so three colours meet nose-to-nose at one kind of vertex and tail-to-tail
  at another. That's a genuine {8,3}-ish triangle-group tiling and building
  it correctly (plus the fish silhouette warped to fit the arc) did not fit a
  20-minute turn. Diameters are the simplest object that is still a *true*
  hyperbolic geodesic, so the translation math, the shrinking, and the
  snap-to-lattice are all exact — nothing here is faked, it's just a simpler
  tiling than Escher's. Rejected the alternative of faking curved rows with
  bezier eyeballing: it would look closer at a glance and be wrong underneath,
  which fails the brief's spirit worse than an honest simpler shape.
- **"Other fish follow" is a decaying visual wobble, not shared symmetry.**
  All five rows pass through one shared point (the centre), so dragging one
  row genuinely can't move any other row's fish without breaking that row's
  own tiling — there is no rigid transformation of the whole disk that keeps
  every row simultaneously valid except the identity (the rows aren't part of
  one shared discrete symmetry group the way Escher's are). What ships:
  non-active rows get a small rotation nudge near the centre, proportional to
  the active row's drag velocity and decaying with hyperbolic distance from
  centre (`1/cosh(t)`). Said plainly in the page copy and NOTE.txt rather than
  oversold.
- **No sign-in, no PDS storage.** Nothing here needs to persist per-visitor —
  it's a toy to play with, not a save-a-state tool — so `pds.js` was
  deliberately not wired in. If a future pass adds "save this arrangement" or
  a leaderboard for e.g. fastest-to-realign, that's the place to add it.
- Used `kit.crumb()` and `tokens.css` for the shell; skipped `kit.js`'s
  Bluesky helpers and `handleInput` entirely since there is no handle entry
  anywhere on this page — nothing here touches Bluesky data.

## The plan (next turn, in order)

1. **Real Circle Limit III topology.** Replace the five independent
   diameters with an actual triangle-group tiling: generate the {8,3}
   (or the specific group Escher used) via a handful of generator Möbius
   transformations, build a fundamental domain, and tile the disk by
   applying the group to it. This is the hard part named up front — the
   current file's `diskRadius`/`conformal`/row-offset math is the right
   foundation (real Möbius translations), it just needs a second generator
   and a word-reduction/BFS over the group instead of one direction per row.
2. Curve the rows to match: once real geodesic arcs exist (not just
   diameters), fish need to be drawn tangent to the arc at their position,
   not at a fixed row-constant angle — the tangent direction formula for a
   general Möbius-image geodesic is the next math step.
3. Once rows genuinely share edges with neighbours (not just the centre
   point), dragging one row can drive an actual constraint: neighbouring
   fish are pinned at the shared edge and must rotate/translate to keep that
   edge glued, which is the mechanically correct version of "the other fish
   follow as they must."
4. Cosmetic: right now fish are a simple lens-with-fins path in one flat
   colour per row; Escher's fish have distinct colour-and-line detail per
   family. Low priority relative to 1–3.

## Gotchas

- `ctx.rotate` angle convention: canvas is y-down, and the code deliberately
  never flips y anywhere (screen y = disk y directly). That keeps the
  Möbius-translation formula, the click-angle math (`atan2`), and the
  drawing rotation all in the same convention — if a future edit flips y in
  one place (e.g. "to look more like standard math orientation"), the row
  angles, the nearest-row picker, and the fish nose direction all silently
  go inconsistent with each other. Keep them unflipped together, or flip all
  three at once.
- Sensitivity (`SENS` in the drag handler) is a flat constant, not a true
  inverse-Möbius drag. It feels fine near the centre and gets "faster" near
  the rim in hyperbolic terms (because Euclidean pixels there correspond to
  much more hyperbolic distance) — nobody has used it on a screen yet to
  confirm whether that's a problem in practice.
- Not tested in a real browser by me — no shell, no network here. The
  harness's post-build screenshot is the first real look at whether the
  fish shapes, spacing, and colours read as intended.
