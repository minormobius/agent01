# complex-polynomial ("Root Yard")

## What this is

The ask: drag coefficient points around, permute them, change the degree,
and see where the polynomial's roots land — exact for low degree, numerical
for higher. Shipped as two side-by-side complex-plane canvases: left is
`n+1` draggable points, one per coefficient `c_k` (labelled `z^k`, colour-coded
by array index); right is the computed roots, redrawn live on every drag.
Degree slider 1–10, a "Permute coefficients" button, "Randomize", and
"Reset" (back to `z^3 - 1`, roots = cube roots of unity — a good default
because the correct answer is checkable by eye).

## Decisions

- **Exact solvers only through degree 3.** Linear and quadratic are trivial;
  cubic uses Cardano's formula worked entirely in complex arithmetic
  (principal complex sqrt/cbrt, no real/complex case-split) so it doesn't
  need discriminant sign-checking — one code path handles every case. Degree
  4 also has a closed form (Ferrari), but implementing it correctly and
  numerically stably without a browser to test against was the highest-risk
  part of this turn, so I deliberately skipped it and fall through to
  Durand-Kerner numerics for degree ≥ 4 instead. This is an honest
  simplification, not a shortcut around the ask — the numerical path is
  labelled "Numerical" in the UI with its residual shown, never dressed up
  as exact. **Next turn: add Ferrari's quartic as its own exact case.**
- **"Permute" shuffles the coefficient *array* (Fisher-Yates), not point
  positions on screen directly** — i.e. the same multiset of complex values
  gets reassigned to different powers. Since a point's screen position is
  purely a function of its value, this reads as points jumping to new
  colour/label pairings. This felt like the literal, legible reading of
  "permute them": same coefficients, different polynomial, different roots.
- **Root canvas auto-scales its view** to `max(2, 1.25 × largest root
  magnitude)`; the coefficient canvas has a fixed ±4 view with drag clamped
  to it, so it doesn't jump around mid-drag.
- Durand-Kerner (aka Weierstrass method): monic-normalized, classic
  `(0.4+0.9i)^k` initial guesses (the standard trick to avoid symmetric
  collapse), up to 400 iterations or residual < 1e-13, whichever first.
  Degree capped at 10 in the slider — plenty fast, chosen for canvas/label
  legibility more than performance.

## The plan (next turn, in order)

1. **Ferrari's quartic**, exact, alongside the existing three. The
   resolvent-cubic step can reuse `solveCubic` directly, which is the reason
   to do this next rather than write a whole separate branch.
2. **Cubic solver's degenerate-case handling is heuristic, not proven.** When
   `p ≈ 0` (repeated-root cases), it falls back to computing `u` from the
   other Cardano branch; I did not verify this against a battery of known
   repeated-root cubics (e.g. `(z-1)^2(z+2)`). Worth a dedicated check before
   trusting it near multiplicities.
2b. Consider showing multiplicity explicitly when Durand-Kerner roots
   converge to (nearly) the same point — right now they'd just overlap
   visually with no indication they're the same root twice.
3. Dragging is mouse/touch via Pointer Events with a fixed 26px canvas-pixel
   hit radius — untested on an actual small phone screen; if points are hard
   to grab at narrow widths, either shrink point spacing logic or grow the
   hit radius further.
4. No animation on permute/randomize — points and roots just jump. A short
   tween might make "which point went where" easier to track, especially for
   permute.

## Gotchas

- Complex sqrt/cbrt here are *principal* branches via polar form
  (`r^(1/2)·e^{iθ/2}` etc). This is what makes the Cardano formula uniform
  across real and complex coefficients without branching on discriminant
  sign — but it's also why the degenerate-case fallback in decision #2 above
  needed a manual patch (principal branch can pick the "wrong" root of a pair
  that should cancel to zero).
- `--mono` is a real kit token (checked `tokens.css` directly rather than
  guessing) — used it plainly for the root/coefficient lists and the
  polynomial expression readout.
