# BRIEF — serre-twisting

## What this is

@ponder.ooo asked, tersely, for "serre's twisting sheaf visualized" — no
reference link, no further steer, the same bare-mathematical-object pattern as
most of their earlier requests. This is turn one, and it ships a working site,
not a skeleton.

What's live: a three.js ribbon that winds `n` full turns around a loop (`n`
slider from -10 to 10, paired with a numeric input per the profile's standing
preference), where the loop is the real locus of `P¹(C)` and the twisting is
literally driven by `O(n)`'s own transition function `g₀₁(t) = tⁿ` — walk once
around the loop and a trivializing frame vector's angle advances by `n·θ`, so
the visible winding count *is* n, which *is* the degree / first Chern class.
Below the viewer: the two-chart setup (`U₀`, coordinate `t`; `U₁`, coordinate
`s=1/t`) with the cocycle spelled out for the current `n`; a Riemann–Roch panel
(`h⁰`, `h¹` via Serre duality, the χ=n+1 identity, live-updated); and the actual
basis of `H⁰(P¹, O(n))` as degree-n monomials in `z₀,z₁`, which disappears
correctly for `n<0`.

## Decisions

**A twisted ribbon over a real circle, not an attempt at the full complex total
space.** `O(n)`'s fibre is a complex line — the honest total space over all of
`P¹(C)` is 4 real dimensions, and even restricted to one real circle it's 3 real
dimensions (1 base + 2 fibre), which still doesn't collapse to an embeddable
ribbon. What's drawn is the real span of *one* trivializing frame vector,
carried around the loop by the cocycle — this keeps the winding number (the one
topologically meaningful, literally-n invariant) completely honest while
dropping the orthogonal phase. Said so explicitly on-page under "Honest limit,"
per the standing pattern in the profile of flagging a deliberate simplification
rather than letting a picture quietly claim more than it shows.

**Picked a sign convention for the cocycle and said so.** `g₀₁(t) = tⁿ` matches
the standard fact that `O(1)`'s sections are linear forms `z₀,z₁`, consistent
with `z₁ = t·z₀` on the overlap, but there's a real alternative convention
(`t^{-n}`, or swapping which chart is "the" trivializing one) that would mirror
the ribbon's handedness without changing anything mathematically. Flagged in
the footer rather than presented as the only possible picture.

**Monomial basis display, not a plot of the sections as functions.** Degree-n
homogeneous polynomials in two variables don't have an obviously better single
picture than the list itself (unlike, say, a radial field or a complex plot);
listing the basis is the literal, checkable answer to "what is H⁰ here," which
fits the standing pattern of giving the real mathematical object rather than a
decorative stand-in.

## The plan (next turn, in order)

1. **Let n go non-integer.** This is the natural "make the implicit explicit"
   extension the NOTE.txt points at: for non-integer n the cocycle `e^{inθ}`
   does NOT return to 1 after one lap, so the ribbon would visibly fail to
   close — a direct, hands-on demonstration of *why* `O(n)` only exists for
   integer n (H^1(P¹, O*) = Z, not R). Needs either an obvious visual seam where
   it doesn't close, or clamping the last segment and showing the gap as a
   colored wedge.
2. **A second panel showing both frame vectors (U₀'s and U₁'s) at once**,
   rather than just one ribbon — e.g. two ribbons of different colors, exactly
   `g₀₁` apart in phase, so the overlap relation is visible rather than
   asserted in a formula. This is the natural second "form of visualization"
   this requester has rewarded on past bare-formula asks (cf. the Newman-
   polynomial and half-wave-symmetry builds).
3. **Click a monomial in the sections list to highlight where it's "supported"
   on the ribbon** (e.g. color the ribbon by `|z₀^i z₁^{n-i}|` restricted to the
   real locus, parametrized by θ via `z₀=cosθ, z₁=sinθ` or similar) — ties the
   algebra panel back into the 3D view instead of leaving them as two separate
   facts about the same n.
4. **P^1 is the easy case.** If a follow-up asks for `O_{P^n}(k)` on higher
   projective space, this ribbon construction doesn't generalize directly (the
   real locus of `P^n(C)` isn't a circle for n>1) — that would need a genuinely
   different visualization, not a parameter bump.

## Gotchas

- **Can't test any of this** — no browser, no network, no shell in this
  sandbox. The ribbon-building math (offset direction = `cos(twist)·radial +
  sin(twist)·ŷ`) was checked by hand at θ=0 and θ=2π (both give `offset =
  radial`, so the strip closes for any integer n) but not watched on a screen.
- Picked `n=3` as the default on load — visually busy enough to read as
  "twisted" without being hard to parse; `n=0` (flat, untwisted) and `n=1` are
  both worth checking first if something looks wrong, since they're the
  easiest cases to verify by eye.
- The segment count scales with `|n|` (`40*|n|+80`, capped at 2200) specifically
  so high-twist ribbons stay smooth instead of faceted; if a future edit adds a
  much larger n range, watch that cap.
