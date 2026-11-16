# R1 — the review of 2026-11-16, and what was done about it

A second Claude instance was given the repository and no account of how the work was made, and asked to find what
was wrong, unsupported or overstated. It ran its own experiments. This is a record of what it found and what
changed. It is a check by another instance of the same model, not an independent human audit.

## What it confirmed

- **The solver is right.** Energy, gradient and Hessian are consistent; the band width is sufficient; an independent
  reimplementation with a different minimiser agreed on the jaw force at every step to 10⁻¹¹ on thirteen small ropes;
  full-size residuals are under 2 × 10⁻⁸ of the peak. Finer loading steps move the hose rope by about 1%.
- The reference strand matches the Weibull closed form; the loose bundle is the Daniels value; the taut-skin estimate
  (0.806 of the vessel formula) and the 3D band (exactly 1) are right.
- Four-dimensional thread yarn sheds whole turns; a half turn stays; the ribbon threshold is 0.1 to 0.2.

## What it found wrong, and the change

| Finding | Change |
|---|---|
| The ledger only checked that a number's digits appeared somewhere in the text ("2.3" was satisfied by a section heading), and many numbers were not in it | The text's numbers are now tokens filled from `values.mjs`, which reads the data; the test fails if a token has no value or the built paper is stale |
| "Halved and doubled each of three chosen numbers" was one dial for the hose: friction and hose stress enter only as a product, and the laying tension does not touch it | Said so in sections 2.3 and 5 |
| The headline, hose rope 1.13 against a strand, held only at one rope length and one fibre scatter: 0.90 at 24 sections, 0.96 and 0.94 at Weibull moduli 10 and 20 | New study `pull/gauge.mjs`; a table of it in section 4; the abstract and results now claim the ratio to the loose bundle (1.1 to 1.7), which holds at every setting, and say the comparison with a strand depends on both |
| The hose's track was given full axial strength while stressed in hoop, a fibre's scatter, and no size effect | Same study, five versions of the hose as a member; section 5 reports them. The order survives; a value above 1 does not |
| "Hose" was used for the skin round a bundle (a sphere in cross-section, which was priced) and for the hollow strands that braid (a ring in cross-section) | "Hose" and "tube", defined in the introduction and kept apart; the bench's braid rows are called braids of strands, which is what they are |
| Section 2.1 described sweeps along four axes; the tube yarn, maypole and ribbons-on-a-tube tests are single 0.3 pushes along x, y, z | Section 2.1 now describes both kinds of test and says which result used which; the results say "pushed 0.3 … runs into" |
| The twist section miscounted its runs, omitted the five-turn rows, and used the untwisted state (not the lowest) as baseline | Replaced by two new studies (`twist/walls.mjs`, `twist/hosed.mjs`) |
| "A twisted yarn of threads has no strength in 4D" is an input to the bench, and the twist rig has no friction | Section 3.1 says the result is that nothing geometric holds the twist; the table marks the 0.00 as "given no grip" |
| Sentences claiming more than the tests show: tubes "can be spun", "a hitch is a sphere … the line is fast", "for strength, make one fat rope", "a sheath is a better bargain" in 4D | Cut or reduced to what was tested |
| The twisted-yarn rows take no penalty for fibre angle where braids do | Noted in the table and in the open items; not fixed |
| Study data other than the 200-pull samples is not re-pulled by any test | Listed in the open items; not fixed |

## What it found that improved the paper

The reviewer re-ran the hosed bundle with five new seeds and three wall positions and found that the kept turn
survives with the wall loose, where nothing is squeezed. So the explanation in the earlier draft (a bundle "pressed
together … turns as a body") was not the mechanism. The fibres are confined to a shell, their paths are a braid on a
sphere, and the full twist there has order two. With the looser walls the result is exact across seeds, where the
tight wall had produced jams that the earlier draft reported as overlap. Sections 2.2 and 3.1 and figure 2 are
rewritten on that basis.

## The audit by Astra, 2026-11-16

Astra, an auditor instance directed by the PI, audited the draft at commit `bbe31da` (draft 2, before the changes
above). It read the paper and the code, ran the self-tests and its own diagnostics on a separate snapshot, and
pushed nothing. Its assessment: the engineering question is worth pursuing and the controlled 3D-against-4D twist
relaxation is the most convincing contribution; substantive revisions before submission. Eight findings:

| | Finding | Severity | What was done |
|---|---|---|---|
| R01 | The enclosing sheath (S² × I, three-dimensional, sphere in section) and the braid tube (S¹ × I, two-dimensional, ring in section) are different objects under one name; a bore along a fibre gives the first, not the second | High | Already split into "hose" and "tube" in draft 3. Draft 4 adds the table of objects by dimension and cross-section, says which bench rows stand for which construction, says the laws for braided strands are carried over from threads, and removes "give the fibre a bore" |
| R02 | Zero strength for a frictional 4D staple yarn is not established: the rig is frictionless, and the bench's zero is an input | High | Section 3.1 now uses the auditor's wording: whole-turn winding and pressure disappear in the frictionless relaxation; assigning that to the bench gives zero. A coupled frictional experiment is an open item |
| R03 | Weibull modulus is a fourth chosen number and reverses the comparison with a strand; the dial study moved one parameter at a time and tuned on the reporting sample; a joint low-contact corner reads below 1 | High | `pull/gauge.mjs` (draft 3) varies modulus and length. `pull/corner.mjs` (draft 4) halves friction and hose stress together, tunes on seeds 1–60 and reports on 61–120: 0.94 ± 0.01. The claim is restricted to the settings tested and to the ratio with the loose bundle. A full map over scatter and contact strength is an open item |
| R04 | Hoop load, axial failure and pressure retention are not coupled: hoop stress does not enter the hose's failure, damage does not reduce the press, a tightening hose gains press free | High (modelling gap) | Stated first in section 5 and in the open items; the contracting-hose row is marked as the least secure. Bracketed by the five versions of the hose as a member (draft 3). Not removed: no multiaxial model was built |
| R05 | The ledger does not bind a value to its claim: a table cell changed from 1.13 to 9.99 still passed | Medium | Replaced in draft 3 by tokens filled from data. Draft 4 adds the negative control: the test corrupts each named value in turn and fails if the built text does not change |
| R06 | A failed line search (t = 0) reported a small last step, so the flag could read "converged" without the stopping test being met; several study writers do not inspect the flag | Medium | `bench.js`: a stalled search is accepted only if the force imbalance is under a millionth of a link's strength, counted in `R.stalled`, with the worst imbalance in `R.resid`; otherwise the flag reads unconverged. `sample.mjs` and `sheath.mjs` now exit non-zero on an unconverged pull. `corner.json` records the status of its own pulls. The other baked files predate this and were not re-run: open item |
| R07 | The trefoil is cut into two parts with gaps, so the swept test is not an isotopy of a closed knot; sweep steps are not finer than the thinnest wall as the methods said | Medium | Sections 2.1 and 3.2: called an illustration of a crossing change; the real step sizes are given; a clean sweep is called numerical evidence, not a certified clearance |
| R08 | "Borromean links exist in one mixture" is too broad: Yanagawa (1964) has Brunnian systems of 2-spheres alone | Low | Section 3.2 says "one explicit construction"; F4 is cited with the DOI the auditor supplied |

Also from the audit and done: the wall is described as a penalty force with the clamped ends outside the tightest
wall; the loading increment's bias is measured (`corner.json`: a strand reads 2.6% low at 110 steps against 1760)
and stated in section 2.3.

Not done from the audit's recommended pathway: a constitutive closure for the hose; a strength and reliability map
over disorder and contact strength; event-driven breaking; per-claim records of revision, run recipe and data hash;
an orientation field for the kept turn.

The auditor's two diagnostic tables (Weibull modulus; load increments) were reproduced here to the digits it
reported, by `gauge.mjs` and `corner.mjs`.
