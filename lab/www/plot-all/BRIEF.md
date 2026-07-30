# BRIEF — plot-all (Newman, Borwein & imaginary Littlewood polynomial roots)

## What this is

The original ask: plot all complex solutions of all Newman polynomials up to
degree 15. Then: bigger canvas, single-pixel points at constant brightness,
black-on-white instead of the degree colour ramp, push the degree ceiling
higher since it ran fast, and add Borwein polynomials too. This turn's ask:
add a third family, "imaginary Littlewood" polynomials — every coefficient
either <var>i</var> or <var>-i</var>.

Shipped this turn:
- Added `ilittlewood` as a third `family` select option, `base: 2, maxDeg: 20,
  pm: true` in `FAMILIES`. **It does not carry complex coefficients through
  the solver.** p(z) with every coefficient in {i,-i} equals i·q(z) for a real
  q with the identical mask pattern over {-1,1} (the classic Littlewood
  alphabet — not otherwise built here). Multiplying by the nonzero constant i
  can't move a root, so `setCoeffs`'s `fam.pm` branch just emits the real ±1
  coefficients directly and the existing real-only `findRoots` solves it
  unchanged. See Decisions for why I started down the complex-coefficient
  path first and backed out.
- Explanatory panel gained a third paragraph stating this equivalence
  explicitly, so a reader who knows enough to ask "wait, isn't that the same
  as real Littlewood?" gets an honest yes, not a hand-wave.
- Title/meta/og tags and the h1/sub copy now say "Newman, Borwein & imaginary
  Littlewood" throughout.

Previous turn's shipped work (still true, not re-verified this turn):
- Canvas widened (max-width 640px -> 1040px) and moved above the controls
  panel so it's the first thing on the page, per "canvas is the star".
- Point size is no longer a control — every root is exactly one device pixel,
  always. Brightness is no longer a control either — the density-shading
  formula (`0.35 + 0.65*log1p(count)/log1p(maxCount)`) has no multiplier now,
  so there's nothing left to set to "1" because there's no slider to move off
  it.
- Colour ramp removed entirely. Background is white, points are black,
  density still darkens a pixel (more roots landing there = darker), but
  there's no more per-degree hue — the `sum`/`degArr` buffers that existed
  only to compute that average are gone too, which also cuts per-root memory
  by roughly a third (useful headroom for the higher degree ceiling below).
- Newman's degree ceiling raised 15 -> 20. Default slider value is still 15
  (unchanged) so the auto-run-on-load stays fast; the user has to drag the
  slider up for the bigger runs, deliberately (see Decisions).
- Added Borwein polynomials ({-1,0,1} coefficients, leading and constant term
  still fixed at 1) as a second family via a select control. Its ceiling is
  degree 12, not 20, because its polynomial count grows as 3^(d-1) instead of
  2^(d-1) — same rough time budget, lower degree for it.
- Default view widened from ±1.9 to ±2.15 to comfortably fit Borwein's looser
  Cauchy bound (|z| < 2) as well as Newman's tighter golden-ratio annulus.

## Decisions

- **Default max-degree slider value left at 15, not bumped to the new
  ceiling of 20.** The previous brief's own reasoning for auto-running on
  load was "so even a screenshot taken seconds after load shows real
  progress rather than a blank canvas" — defaulting straight to 20 would
  undercut that (degree 20 alone is ~33 billion arithmetic ops, likely a
  minute-plus on typical hardware; a screenshot taken early would show very
  little progress on a very big task). Kept the fast, always-populated
  default, raised the ceiling so the option is there. If the requester
  wanted the *default* pushed too, that's a one-line change
  (`value="15"` -> whatever, in the `#maxDeg` input).
- **Borwein's ceiling (12) chosen to land in the same rough compute-time
  ballpark as Newman's new ceiling (20)**, not picked arbitrarily — cumulative
  root count to degree 12 at base 3 is ~3.06M (vs ~19.9M for Newman to degree
  20), asymmetric on purpose since Borwein's iteration cost per polynomial is
  the same but there are far more polynomials per degree.
- **No color-by-degree anymore, per explicit instruction** ("just make it
  black points on a white background") — this was a real design element in
  the previous turn (dataviz-skill sequential ramp) and got removed outright,
  not muted. If a future turn wants degree information back, it'll need a
  new encoding since density (the one channel left) is already spoken for.
- **Borwein's root bound is stated as the general Cauchy bound (`|z| < 2`),
  not a tight specific constant** — unlike Newman's golden-ratio annulus,
  which is a known tight result for that exact coefficient class, I don't
  have a citation for a tighter Borwein-specific bound in front of me, so the
  copy says "only guaranteed to stay under |z| = 2" and calls the resulting
  shape "broader, fuzzier" rather than claiming a ring. Worth tightening if
  someone can confirm a better constant for {-1,0,1}-coefficient polynomials
  with unit leading/constant terms.
- **Iteration cap formula bumped** (`min(140, 40+6n)` -> `min(170, 40+7n)`)
  since convergence needs more room at degree 20 than it did at 15. Untested
  whether that's enough — see plan item 1.
- **Imaginary Littlewood solved as its real equivalent, not as literal
  complex coefficients.** I first wired this up with a genuine complex
  `coeffs`/`coeffsIm` pair threaded through `findRoots`'s Horner evaluation —
  it ran, but the Durand-Kerner denominator (`dr,di` — the product of
  `z_i - z_j` over other roots) is only correct for a *monic* polynomial, and
  this family's leading coefficient is `i`, not `1`. The standard fix is to
  also multiply that denominator by the leading coefficient; I didn't do
  that, which means the complex version would have converged (if at all) with
  silently wrong step sizes — a bug that's invisible until someone checks the
  roots against a known case, exactly the kind of thing this brief format
  exists to flag before it ships quietly wrong. Since `i·q(z) = 0 iff q(z) =
  0`, solving the real `q` (coefficients in {-1,1}, same mask) gives
  *identical* roots through the already-correct real solver, for less code
  and no new numerical risk. Backed the complex plumbing back out entirely —
  `coeffs`/`findRoots` are untouched from last turn, only `setCoeffs` gained
  the `fam.pm` branch. If a future ask needs *actually* complex coefficients
  (i.e. a family where that i·q(z) trick doesn't apply — non-unit-modulus
  leading term, or leading/constant not proportional to each other), the
  denominator-scaling fix has to go in first; don't copy this shortcut for
  that case.

## The plan (not built yet, in order)

1. **Verify in a real browser**, no bash, no browser here. Specifically watch
   degree 18-20 Newman and degree 11-12 Borwein (carried over, untested since
   last turn) — if `iterationsFor`'s cap isn't enough for convergence at the
   top of those ranges, roots look scattered rather than settling into the
   annulus/disc. Imaginary Littlewood reuses the same solver at the same
   ceiling (20) so the same check applies there once its mask pattern is
   exercised at high degree — it hasn't been separately timed or eyeballed.
2. **Time the degree-20 Newman run for real.** The ~70-140s estimate is
   arithmetic, not a measurement. If it's much worse on real hardware, either
   the ceiling needs to come down or the chunk budget (14ms/frame) needs
   raising to trade responsiveness for throughput.
3. **Keyboard pan/zoom** (arrow keys, +/-) for accessibility — still skipped,
   carried over from two briefs ago.
4. **A genuinely complex-coefficient family** (one where multiplying through
   by a unit scalar doesn't reduce to a known real family) would need the
   Durand-Kerner denominator fix described in Decisions above — don't reuse
   the abandoned `coeffsIm` approach without adding that.

## Gotchas

- `setCoeffs`'s base-3 branch destructively walks a local copy of `mask`
  (`m = mask; ... m = (m/3)|0`) rather than `mask` itself — don't refactor
  that to reuse `mask` directly, the outer loop's `mask++`/`mask >=
  masksThisDegree` bookkeeping still needs the original value intact.
- Switching the family select clamps `maxDeg` down if it's above the new
  family's ceiling (Newman 15 -> Borwein instantly becomes 12), but does NOT
  auto-replot — matches the existing pattern where slider/checkbox changes
  only update the label until "Plot" is clicked. Don't assume the visible
  plot matches the currently-selected family until Plot has been pressed.
- Durand-Kerner's initial guesses are still seeded on a fixed circle (radius
  1.3, phase 0.37) regardless of family — untested whether that's a good
  starting radius for Borwein roots, which can range up to modulus 2 instead
  of Newman's ~1.618 ceiling. If Borwein plots look noisy near the edge of
  the disc at high degree, this is the first thing to try widening.
- No Bluesky data of any kind is used here — pure math, no `bskyGet` calls —
  so the content gate's "subject the visitor named" rule doesn't apply. Don't
  assume that's true of other lab sites when reusing this as a template.
- `FAMILIES.ilittlewood`'s `pm: true` only means something inside
  `setCoeffs`'s `fam.base === 2` branch (bit -> {-1,1} instead of {0,1}) — a
  hypothetical base-3 family with a `pm` flag would silently do nothing,
  since the base-3 branch doesn't check it. If a fourth family needs a
  ±-alphabet at base 3, that branch needs the same ternary `setCoeffs`
  currently has for base 2.
- Imaginary Littlewood's true root bound is the same as real Littlewood's —
  believed to be roughly the annulus 1/2 &lt; |z| &lt; 2 by symmetry (if z is
  a root, so is 1/z, since coefficients are palindromic under reversal with
  leading = constant = 1), but I don't have a citation in front of me, so the
  copy doesn't claim a specific ring, only the general Cauchy `|z| < 2` bound
  already used for Borwein. Worth tightening with a real citation.
