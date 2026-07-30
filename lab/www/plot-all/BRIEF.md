# BRIEF — plot-all (Newman, Borwein & Littlewood polynomial roots)

## What this is

The original ask: plot all complex solutions of all Newman polynomials up to
degree 15. Then: bigger canvas, single-pixel points at constant brightness,
black-on-white instead of the degree colour ramp, push the degree ceiling
higher since it ran fast, and add Borwein polynomials too. Then: a third
family, "imaginary Littlewood" polynomials (every coefficient either
<var>i</var> or <var>-i</var>) — which turned out to be a cheap trick, not a
new family (see the last brief's Decisions: it's real Littlewood times a
constant, solved as the real family unchanged). The requester's reaction
("oh lol") reads as clocking that, and the next ask followed directly: build
the family that trick *doesn't* work on — "cyclotomic Littlewood",
coefficients drawn from all four 4th roots of unity {-1, 1, i, -i}. Then
this turn: "how about the third roots of unity" — a fifth family,
coefficients drawn from the three cube roots of unity {1, ω, ω²} (solutions
of z³ = 1), the natural sibling to cyclotomic Littlewood's fourth roots.

Shipped this turn:
- Added `cuberoot` as a fifth `family` option: `base: 3, maxDeg: 12, cube:
  true` in `FAMILIES` — same base as Borwein (both are 3 digits per
  coefficient) but a different alphabet, so `setCoeffs`'s existing base-3
  branch grew an `if (fam.cube)` fork rather than a new base. Digit 0/1/2
  maps to the cube roots of unity via two new lookup tables, `CUBE_RE =
  [1, -0.5, -0.5]` and `CUBE_IM = [0, √3/2, -√3/2]`.
- Reused the cyclotomic-Littlewood pattern exactly: leading/constant fixed at
  real 1 (monic, so the existing unscaled Durand-Kerner denominator stays
  correct — no new solver risk), ceiling picked to match the same-growth-rate
  sibling family (Borwein, also base 3) rather than a fresh calibration.
  Panel gained a fifth paragraph; title/meta copy, sub-headline and select
  option all updated to mention it.
- Did NOT touch `findRoots`, the compute driver, or the rendering pipeline —
  this family flows through unchanged infrastructure exactly like cyclotomic
  Littlewood did; the only new code is the alphabet lookup and one `if` fork
  in `setCoeffs`.

Previous turns' shipped work (still true, not re-verified this turn):
- Added `cyclolittlewood` as a fourth `family` option: `base: 4, maxDeg: 10`
  in `FAMILIES`, leading/constant fixed at real 1, each interior coefficient
  independently one of {1,-1,i,-i} via a base-4 digit of `mask`.
- **This is the first family that is genuinely complex through the solver**
  — plan item 4 from the last brief. `coeffs` (the old `Float64Array`) is now
  two parallel arrays, `coeffsRe`/`coeffsIm`; `findRoots`'s Horner step and
  `setCoeffs` both carry both. Newman/Borwein/imaginary-Littlewood are
  unaffected in behaviour — they just leave `coeffsIm` at 0 for every
  interior coefficient (real branches now zero it explicitly since the
  buffer is reused across families/degrees and could otherwise carry a
  nonzero imaginary value left over from a previous cyclotomic run).
- **Sidestepped the Durand-Kerner denominator fix entirely**, rather than
  building it — see Decisions for why fixing leading/constant at real 1 made
  that fix unnecessary for this family, on purpose.
- Explanatory panel gained a fourth paragraph; title/meta/og tags, h1 and sub
  copy now say "Newman, Borwein & Littlewood" (dropped "imaginary" from the
  headline since there are now two Littlewood variants).

Earlier turns' shipped work (still true, not re-verified since):
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
- **Cyclotomic Littlewood fixes leading and constant at real 1, rather than
  letting all coefficients (including those two) range over {1,-1,i,-i}.**
  This was deliberate, not laziness: if the leading coefficient were itself
  non-real, the Durand-Kerner denominator (product of `z_i - z_j`) would need
  scaling by that leading coefficient to stay correct — the exact fix plan
  item 4 above flagged as unbuilt. Keeping leading = constant = 1 (matching
  how Newman/Borwein/imaginary-Littlewood are already defined here) means
  the polynomial is always exactly monic, so the existing unscaled
  denominator is already correct and no new numerical risk was taken on. The
  tradeoff: this is *coefficients-in-{1,-1,i,-i} with monic ends*, not the
  fully general every-coefficient-free version the name could imply. If a
  future ask wants the leading coefficient free too, that's when the scaling
  fix actually has to be built — don't skip it a second time.
- **Root bound left unstated for cyclotomic Littlewood** rather than
  re-deriving one. Every coefficient here has modulus exactly 1 (same as the
  other three families), so the general Cauchy bound `|z| < 2` already in
  the Borwein paragraph applies unchanged — the default view (±2.15) wasn't
  touched because it already covers this. No copy claims a tighter ring
  since I don't have one to cite.
- **maxDeg ceiling (10) picked to land in the same compute budget as the
  other capped families** — cumulative root count to degree 10 at base 4 is
  ~3.38M, versus Borwein's ~3.06M at degree 12 and Newman's ~19.9M at degree
  20. Degree 11 jumps to ~14.9M (close to Newman's ceiling), so 10 was
  chosen as the last "cheap" degree — same reasoning pattern as the Borwein
  ceiling a turn ago, not a fresh calibration.
- **Cube-root shares Borwein's exact ceiling (12), not a freshly-derived
  one** — it's base 3 same as Borwein, so the polynomial-count-per-degree
  math is identical (3^(d-1)); there was no separate calibration to do. This
  is the first family ceiling this project hasn't had to compute from
  scratch.
- **Cube-root implemented as a fork inside the existing base-3 branch of
  `setCoeffs` (`fam.cube`), not a new `base: 3.5`-style hack or a duplicated
  branch.** Reusing `base: 3` was correct since the *mask arithmetic* (mod 3,
  divide by 3) is identical to Borwein — only the digit-to-coefficient
  lookup differs (index into `CUBE_RE`/`CUBE_IM` instead of `(m%3)-1`). Kept
  the two alphabets as sibling branches under one `else if (fam.base === 3)`
  rather than inventing a fifth base value.
- **Cube-root fixes leading/constant at real 1, same reasoning as cyclotomic
  Littlewood** — monic keeps the existing unscaled Durand-Kerner denominator
  correct, so no version of the denominator-scaling fix (plan item 4) was
  needed here either. Same tradeoff noted for cyclotomic Littlewood applies:
  this is coefficients-in-{1,ω,ω²}-with-monic-ends, not every coefficient
  free.
- **No new root bound derived for cube-root** — same reasoning as cyclotomic
  Littlewood: every coefficient has modulus 1, so the general Cauchy `|z| <
  2` bound already stated in the Borwein paragraph applies, and the default
  view (±2.15) already covers it.

## Screenshot check (this turn)

Browser screenshot at 1200x800 under production CSP: header, sub-copy and
description panel render correctly, text is readable, and the canvas (default
family Newman, auto-run on load) shows a real plotted density — an arc-shaped
band with internal voids, consistent with the known annulus-with-holes look of
Newman-family root plots. Nothing visibly broken; the canvas continuing below
the 800px fold is expected scroll, not a bug. Cube-root is present as a select
option (not auto-selected), matching how every prior family was added. No code
changed.

## The plan (not built yet, in order)

1. **Verify in a real browser**, no bash, no browser here. Specifically watch
   degree 18-20 Newman and degree 11-12 Borwein (carried over, untested for
   three turns now) — if `iterationsFor`'s cap isn't enough for convergence
   at the top of those ranges, roots look scattered rather than settling
   into the annulus/disc. Cyclotomic Littlewood and cube-root are both new
   and *especially* unverified — each is a family where a wrong result could
   be a real bug (a transposed re/im, a wrong digit-to-root-of-unity mapping)
   rather than just a convergence question. Sanity checks: cyclotomic
   Littlewood's alphabet {1,-1,i,-i} is closed under multiplication by i, so
   its root set should show four-fold rotational symmetry; cube-root's
   alphabet {1,ω,ω²} is closed under multiplication by ω, so its root set
   should show three-fold rotational symmetry. Look for both before trusting
   either further.
2. **Time the degree-20 Newman run for real**, and now also degree-10
   cyclotomic Littlewood and degree-12 cube-root — both do more arithmetic
   per point than the real families (a complex coefficient add every step
   instead of just the real branch), so their actual cost relative to
   Borwein/Newman at a similar root-count budget hasn't been measured, only
   reasoned about.
3. **Keyboard pan/zoom** (arrow keys, +/-) for accessibility — still skipped,
   carried over from three briefs ago.
4. **A genuinely free-leading-coefficient complex family** (cyclotomic
   Littlewood's natural extension: let leading/constant also range over
   {1,-1,i,-i} instead of fixing them at 1) needs the Durand-Kerner
   denominator-scaling fix — still not built, now for a second reason. Since
   {1,-1,i,-i} is a group under multiplication and closed under inverses,
   dividing the whole polynomial by its (unit-modulus) leading coefficient
   keeps every coefficient in the same alphabet — so this could be done by
   normalizing coefficients in `setCoeffs` instead of scaling the
   denominator in `findRoots`; probably the simpler of the two fixes if
   someone picks this up.

## Gotchas

- `setCoeffs`'s base-3 branch destructively walks a local copy of `mask`
  (`m = mask; ... m = (m/3)|0`) rather than `mask` itself — don't refactor
  that to reuse `mask` directly, the outer loop's `mask++`/`mask >=
  masksThisDegree` bookkeeping still needs the original value intact. This
  is now shared by *two* sibling loops inside the base-3 branch (Borwein's
  `(m%3)-1` and cube-root's `CUBE_RE/CUBE_IM[m%3]`, gated on `fam.cube`) —
  both walk the same local `m`, declared once above the `if`.
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
  `setCoeffs`'s `fam.base === 2` branch (bit -> {-1,1} instead of {0,1}) —
  it does nothing for base 3 (that branch checks `fam.cube`, a separate flag,
  not `fam.pm`). The two flags are unrelated despite the naming symmetry —
  don't assume setting both on one family composes; nothing reads `pm` and
  `cube` together, and no family currently sets both.
- Imaginary Littlewood's true root bound is the same as real Littlewood's —
  believed to be roughly the annulus 1/2 &lt; |z| &lt; 2 by symmetry (if z is
  a root, so is 1/z, since coefficients are palindromic under reversal with
  leading = constant = 1), but I don't have a citation in front of me, so the
  copy doesn't claim a specific ring, only the general Cauchy `|z| < 2` bound
  already used for Borwein. Worth tightening with a real citation.
- `coeffsIm` is a shared scratch buffer reused across every `setCoeffs` call
  regardless of family — the real-family branches (base 2 and base 3) now
  explicitly zero each interior slot they touch rather than relying on it
  starting zeroed, specifically *because* a prior cyclotomic-Littlewood call
  can leave nonzero imaginary values sitting in slots a later real-family
  call wouldn't otherwise overwrite (real branches never wrote to
  `coeffsIm` before this turn). If you add a fifth family, keep that pattern
  — zero what you don't set, don't assume the buffer arrives clean.
- `setCoeffs`'s base-4 branch maps `digit` values 0/1/2/3 to 1/-1/i/-i via
  two ternaries into `coeffsRe`/`coeffsIm` — there's no test harness here to
  check that mapping against known roots, only the four-fold-symmetry visual
  sanity check in plan item 1. If cyclotomic Littlewood's plot looks wrong
  (lopsided rather than 4-fold symmetric), check this mapping first.
