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
