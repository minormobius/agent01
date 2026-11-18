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

## After the audit: the extra computation (2026-11-17)

The PI chose to do the work the audit called most valuable before closing.

- **R04, a constitutive closure for the hose.** `pull/js/hose.js`: the skin is one material with flaws. Each section has
  an axial and a hoop strength (Weibull, the fibre's modulus, with the size effect of a piece that large); its hoop
  stress peaks at 2.3 times the mean where it bends over a fibre; a section over-stressed in hoop splits and stops
  pressing; a section broken along the rope keeps pressing; its axial strength under hoop stress follows a stated
  criterion. How tight the hose is made is then optimised, with its thickness. `pull/closure.mjs` changes each
  assumption in turn. At the half-strength tightness the first model assumed, 97% of the skin would split.
- **R03, a map.** `pull/map.mjs`: Weibull modulus 3, 5, 10, 20 by friction 0.15, 0.3, 0.6, tuned on seeds 1–30 and
  reported on seeds 31–90, each modulus with its own reference strand.
- **R06, enforcement.** `pull/verify.mjs` re-pulls every reported row of both studies: 2 280 pulls, all converged, all
  reproducing the stored figure. Every study script now writes its convergence record, and the paper's build writes
  `provenance.json` with a hash of each data file.

What it did to the claim: with the hose as a real material the reference rope reads 0.97 of a strand, not 1.13. The
hose rope is above the loose bundle in every cell of the map (by 1.02 to 2.03) and above a single strand in three of
twelve. The paper now leads with that.

Still not done: how far a split runs (bracketed, not modelled); damage that grows under load; the new model at other
rope lengths and for the other constructions; event-driven breaking; an orientation field for the kept turn; re-baking
the first model's study files under the explicit convergence flag.

## The recheck by Astra, 2026-11-18 (commit e007b7d5b)

The auditor re-read the note and the full account after the shortening. It confirmed the page target, that the live
documents match the commit, that the ledger catches a corrupted cell in either document, and that the H references
now render (F06, closed). Five findings stayed open. What was done about each:

| finding | what it said | what was done |
|---|---|---|
| F01 | The note says the press is 0.81 of the vessel value; `hoseRope` did not apply the factor. | Applied in `pull/js/hose.js` (`TAUT`, `force(m)`), and the closure, map and bundle-size studies were run again. |
| F02 | The hoop strength was normalised to unit mean while the press used the Weibull scale. | One convention, written at the top of `hose.js`: every stress is a fraction of a link's **mean** strength. The press is now σ Γ(1 + 1/m) × TAUT per unit of hoop × τ. Together with F01 the old press was 27 to 39% too hard, by modulus. |
| F03 | The isotropic-material paragraph claimed the same stretch at peak load and a shallower neck for any material. | Rewritten in the full account: the bound on Poisson's ratio and the two geometric statements are kept; equal loss of cross-section and equal stretch at peak load are stated only for an incompressible material with the same hardening law; the necking claim is gone. |
| F04 | Tuning candidates with unconverged pulls were scored like any other. | A candidate with any unconverged tuning pull is ineligible, whole. `map.mjs`, `closure.mjs` and `size.mjs` record each candidate's count (`grid[].unconverged`, `ineligible`), and the paper reports how many were excluded. No seed is dropped from a candidate. |
| F05 | "As the topology would require" claimed more than was shown: the bead model's reduction to a sphere braid is not established. | Abstract: "consistent with the order-two full twist in the sphere braid group". Section 3.1 of the note says the reduction for the finite-thickness, soft-contact model is open, and separates a topological class from a rest energy. The full account says the same at more length and records the auditor's orientation diagnostic. "In the frictionless relaxation" is now in the abstract's first result. |

Not done: the first, uncoupled model's studies (sheath, cable, braid, sens, poisson, gauge, corner) were not run
again. The full account now says they use the uncorrected vessel formula and the Weibull scale. The taut-skin factor
was measured for thirteen fibres and is assumed for the 55-fibre cluster.

What the re-run changed, at the same seeds: the reference hose rope (modulus 5, μ 0.3) went from 0.97 to 0.93 against
0.71 loose, as the auditor's fixed-design estimate (0.934) predicted; the hose's worth over the loose bundle went from
1.02–2.03 to 1.01–1.91 across the map; against a strand, from 0.87–1.29 to 0.87–1.22, still above 1 in three cells of
twelve. Fourteen of 366 tuning candidates were excluded for an unconverged pull; all 2,280 reported pulls were
re-pulled, reproduced and converged. One conclusion weakened: at 55 fibres the four-dimensional hose is now worth
1.12 times its loose bundle, the same as the three-dimensional tube (1.10–1.12), so the paper no longer says the hose
is worth more in four dimensions; at thirteen fibres it still reads 1.18. And one new caveat: the map's tightness
grid stops at 0.3 and nine of its twelve cells chose that top value, so those cells are a lower bound.
