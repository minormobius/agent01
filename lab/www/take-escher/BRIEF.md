# BRIEF — take-escher / "Shoal"

## What this is

Requester wanted Escher's *Circle Limit III* turned into an interactive
Poincaré-disk explorer: pick a row of fish, translate/"swim" them in the
direction of their nose, and have the rest of the tiling follow so it still
tiles. This turn ships that core mechanic for **independent lines**, not yet
a fully interlocked 2D tiling.

What's on disk: a canvas Poincaré disk with six curved "lines" of fish (three
diameters through the centre, three off-centre arcs, all disk isometries of
each other). Each line is a bi-infinite chain of fish spaced at constant
*hyperbolic* distance along its own geodesic. Drag any fish and its whole
line slides as one rigid chain (the hyperbolic-translation flow along that
geodesic) — that's the "other fish follow to preserve tiling" behaviour,
just scoped to one line's own infinite repeat rather than the whole picture.
Fish correctly shrink approaching the rim (scaled by the Poincaré conformal
factor `1 - |z|^2`), which is exactly the visual effect in the woodcut. Also:
row-select chips, swim buttons (eased, honours prefers-reduced-motion), reset,
and a "new pattern" shuffle.

## Decisions

- **Named it "Shoal", not "Escher-anything".** Same reasoning as the Tetris
  lesson in the platform docs: express the idea, don't put a name that isn't
  free to use in the title/heading. The description honestly says "inspired
  by Circle Limit III" — that's allowed, the title/heading aren't.
- **Lines are independent geodesics, not a shared reflection-group tiling.**
  Building an actual {p,q} hyperbolic tessellation (recursive triangle-group
  reflections) and deriving fish tiles from it is the "real" version of this
  ask, but it's real geometry code with zero ability to test in this sandbox
  (no bash, no browser, no console). I chose a smaller, verifiable-by-hand
  construction — disk automorphisms `phi_a(z) = (z+a)/(1+conj(a)z)` applied to
  a real-axis chain — over guessing at a bigger reflection algorithm and
  shipping unverifiable math. This is a deliberate scope cut, not an oversight.
- **Plain canvas, not three.js.** This is inherently 2D (Poincaré disk); the
  kit's own guidance says canvas/CSS is usually the better answer for
  something small, and it avoids a whole class of WebGL-under-CSP risk for
  no benefit here.
- **Drag maps pixel movement to hyperbolic `t` via a flat scale factor**
  (`proj / R * 4.5`), using the tangent direction computed once at drag-start
  rather than every pointermove. That's an approximation, not exact hyperbolic
  arc length of the gesture — good enough for "swim this way", wrong if
  someone wants a precise 1:1 hyperbolic-distance drag. Said so in the page
  copy already; don't silently "fix" this into something that claims more
  precision than it has without re-deriving it properly.

## The plan (next agent, in order)

1. **Make lines actually interlock.** Right now six lines cross the disk
   independently with gaps between them — it looks like a radiating pattern,
   not a seamless tiling. The real fix: build the tiling from a triangle
   group (e.g. reflections in a (2,3,8)-ish hyperbolic triangle), generate
   fish tiles as unions of triangle pairs, and derive "lines" as orbits under
   the translation subgroup along one tiling edge direction, so adjacent
   lines share exact fish edges. This is the hard part flagged in the
   original task and still undone. Verify the reflection math by hand on
   paper (a few sample points, check hyperbolic distances) before trusting it
   — there's no way to run it here.
2. **When a line moves, let neighbouring lines' endpoints hand off** — i.e.
   when translating by exactly one spacing unit the boundary fish should
   match up with the next line over, so multiple lines can visibly cooperate,
   not just each independently loop through itself. Needs (1) done first.
3. **Fish silhouette is a placeholder** (ellipse body + triangle tail + eye
   dot), not Escher's interlocking fish outline. Worth a proper fish-shaped
   path (bezier, nose/fin notches) once the tiling itself is real, since right
   now a fancier outline would just make the gaps between independent lines
   more visible, not less.
4. Consider a small on-canvas label or legend key clarifying "line 1..6" map
   to which visible color, for colorblind users — currently color is the only
   differentiator between lines besides position.

## Gotchas

- No network/bash available to test any of this — the whole render pipeline
  (complex arithmetic, disk automorphism, drag hit-testing) was written and
  never executed. If a visual bug report comes back, check the math first:
  `phiA` is `(z+a)/(1+conj(a)*z)`, a standard Möbius automorphism of the unit
  disk sending 0→a; `rowPos` builds a chain on the real axis via `tanh(t/2)`
  (true hyperbolic spacing) then rotates and carries it with `phiA`. Any
  visual "fish clump weirdly near one point" bug is most likely a sign error
  in `conj`/`div`, not the rendering code.
- Bluesky kit (`kit.handleInput`, `bskyGet`) is intentionally unused — this
  site has no visitor-named subject to look up, it's pure math/art. Don't add
  a handle box just because the profile says "always add typeahead" — that
  guidance is for sites that already have a handle-entry field; this one
  doesn't need one.
