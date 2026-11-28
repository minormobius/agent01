# W1 — the audit of 2026-11-27, and what changed

An independent scientific audit, commissioned by the PI and run on the auditor's own compute against commit
`cf1fd53f3` (draft 1). This file records its findings and what was done about each. The auditor's numbers below are
quoted from the audit report; they are not this study's.

**Assessment, in the auditor's words:** "The headline steady spanwise instability survives a separate
implementation. The thermal instrument numbers and generalized pipe relations also reproduce. The largest correction
is bibliographic: finite-Reynolds-number body wakes in four spatial dimensions already have published numerical
studies. Three further conclusions need narrower wording. I found no numerical failure that overturns the
demonstrated wire mode or the reported instrument calibration."

## What was reproduced

| Item | How | Result |
|---|---|---|
| A2, growth of the m = 0 mode at β = 2.5 | a separate implementation: own base flow, complex Fourier forms for (u, v, b) with iβ, a differently triangulated mesh, the radial measure and the v/r² term kept. Same element family (Taylor–Hood P2/P1), libraries and outer boundary | −0.00664661, −0.00190022, +0.00274962, +0.00730579, +0.02043928 at Re 188, 190, 192, 194, 200 (ours −0.0067, −0.0020, +0.0027, +0.0072, +0.0204); all real; crossing at 190.817; largest eigen-residual 7.9e-11 |
| A1, sphere drag | separate base flow | 27.697, 4.3213, 1.5786, 1.0894, 0.7715 at Re 1, 10, 50, 100, 200 |
| A4, sphere Nusselt number | separate scalar assembly, finite outer boundary | 2.2491, 3.3189, 5.3952, 6.9035, 9.1151 |
| A5, the instrument | adaptive collocation, our Nu table as input | P 2.65374, 2.81725, 3.13461, 3.84224, 4.77691 at Re 0.25, 1, 3, 10, 25: within 0.002% of ours; runaway 10.7438; plug and n = 4 misreadings 0.4983 and 0.8079 |
| A8, the pipe | symbolic integration | all relations confirmed |

**Not rerun by the auditor:** the saturated ripple and its secondary stability (A3), the tube (A6), the pulse (A7);
their saved diagnostics and code were inspected. The large-domain low-Reynolds Nu table was not regenerated. The
audit did not search other m, oscillating branches or the β range, so that the m = 0 mode is the *first* to go is
still this study's search alone. "An independent implementation, not a different numerical-method validation or an
independent domain study."

## Findings and what was done

| | Finding | Done |
|---|---|---|
| F01, high | The claim that no finite-Reynolds flow past a body in 4D had been published is wrong: Kawamura (2022) computes the flow round a 4-ball in a 4D duct at Re 100 and 3000, and Kawamura (2024) round a hypercube at Re 40, 200, 2000. Neither treats an endless wire's instability or anemometry | Section 1 rewritten to cite both and to state what is added; section 8 and `PRIOR-ART.md` say the search missed them |
| F02, medium | The tube's steadiness is within imposed symmetries (rotation in the two directions perpendicular to flow and wire, no swirl, a mirror plane at the wire's midpoint); the Re 209 tilt cannot be carried to the tube | Section 5 says so in the result paragraph; section 6 ties the tube heat loss to those symmetric states; section 8 lists it |
| F03, medium | The endless ribbon's equivalence to a cylinder is exact, but it is not a finite-device recommendation, and the zero conduction floor needs an unbounded fluid (Nu = 2/ln(b/a) = 0.377 at b/a = 200 in an annulus) | Abstract and section 7 now say "natural candidate", give the annulus number, and list what a finite ribbon would need |
| F04, medium | The wire does not take an arithmetic line average. δP = ∫θ² δh dw / ∫θ(1 + θ) dw, so the weight is θ² Nu′; two profiles with the same line average differ by 2.2% (Re 3) and 3.15% (Re 10) | Section 7's paragraph rewritten round the weighting formula (confirmed here against the solver to six figures) and the two-profile comparison; 5/3 kept as geometry only. `wire4/README.md` section 12 and the page's wording changed to match |
| minor 1 | 0.988, 0.995, 0.9990 are ratios of current squared, labelled as current | relabelled |
| minor 2 | Figure 1a joined the β = 0 box mode to the wake mode's branch | the two lowest points are drawn open and unjoined, and the caption says why |
| minor 3 | The friction factor's Reynolds number was not stated beside it | stated in the table |

## References the audit supplied

- Kawamura 2022 and 2024 (above); the auditor read the first's primary text and the second's abstract and selected
  methods and results.
- Barkley & Henderson (1996): Re = 188.5 ± 1.0, wavelength 3.96 ± 0.02 D, from the authors' repository abstract. The
  note now cites it directly for the cylinder's spanwise instability.
- Barkley, Gomes & Henderson (2002): primary PDF read by the auditor; supports the steady separation-bubble analogy
  and does not establish the wire's mechanism.
- A lead to Komurasaki (2021), a cavity flow in four dimensions: named in the audit, in a file
  (`reference-additions.json`) that has not reached this repository; not cited until it has.
- **Still open:** Collis & Williams's coefficients at first hand. The auditor read the publisher's abstract and could
  not retrieve the paper.

## What would strengthen a later pass (the auditor's list)

A different discretisation and domain for A2; a search of the other branches; stability of the tube states to
perturbations outside the imposed symmetries.

## After the audit: draft 3 (2026-11-27)

The PI asked for the ribbon to be computed, not argued. Draft 3 adds, as section 8 and items A9 and A10 of the audit sheet: the cylinder computed by this study's own solver (replacing the quoted Collis & Williams law
in the figures and the sensitivity comparison); the ribbon spanning the pipe, station by station as a cylinder in a
channel with cold walls; its check in the true tube at R = 5; and its calibration against the wire's. Finding F03's
caution is kept and sharpened by the result: the ribbon is the more sensitive probe at low speed, by a factor of 2 to
5 and not the ideal cylinder's, because it loses heat to its rim. Section 9 is a summary added at the same time. The live page's instrument now has the ribbon too (a grid of the
station problem, `wire4/data/ribbon-grid.json`, interpolated in the browser; within 1% of the station-by-station
numbers). Three pictures of computed fields were added to the figures (`sims.py`: the rippled wake in figure 1, the wire in
the tube as figure 2, one station of the ribbon in figure 5); they are drawn from the saved runs and change no number.
**None of draft 3's additions has been audited.**
