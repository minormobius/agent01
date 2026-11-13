# Paper R1 — outline

**Status: opened 2026-11-13, after the prior-art check ([PRIOR-ART.md](PRIOR-ART.md)), which decides what this may
claim. The PI agreed to the narrow paper the same day, and widened the work first: the design space
([CONFIGURATIONS.md](CONFIGURATIONS.md)) and cabling. Nothing is written as prose.**

The bar is the atoms paper's (`four/papers/p1`): checkable claims, verified references, reproducible numbers, every
number in the text from a baked file and checked against it.

## What the paper is

*Rope in four dimensions: why twist cannot grip, and what does.* A computational-mechanics note. One question: in a
space with four spatial dimensions, how do you make a strong line out of short weak fibres?

## What it may claim (and only this)

1. **Twist does not grip in four dimensions.** A controlled simulation, the same code in 3D and 4D: seven elastic
   fibres, twisted, clamped and stretched. In 3D the turns stay and press on the core; in 4D every whole turn leaves
   through the spare transverse direction, the lateral pressure goes to zero and the energy returns to the untwisted
   value; the twisted state is an equilibrium and an unstable one. Stated as the mechanical consequence of a known
   topological fact (the transverse sphere is simply connected), and set against Seguin and Crassous and Warren,
   Ball and Goldstein, who explain why twist *does* grip here. (`kata/twist`)
2. **A ribbon core restores it**, with a width threshold, and with about half our grip per unit tension. (`kata/twist`)
3. **What the species are worth**, as an engineering comparison in one tensile model: twisted staple yarn in 3D and
   4D, yarn on a ribbon, hooped bundles, loose and sheathed filament, each as a distribution over 200 pulls, per
   material. The model is standard (Daniels; Harlow and Phoenix; Cox); the comparison is the contribution, and its
   dependence on the assumed normal forces is stated, not hidden. (`kata/pull`)
4. **What a sheath weighs against what it grips**, and why a 4D sheath is a different bargain from a 3D one.
   (`kata/pull/sheath.mjs`; in progress)
5. *If it survives checking:* a third family of whole sheets cannot join a two-family weave. To be tested against
   the triple-point ordering of broken surface diagrams (Carter and Saito) before it is claimed.

## What it must cite and not claim

Loops unlink in R⁴ and link closed surfaces; the dimension-count rule; rotation about a plane; ring-and-sphere and
unequal-torus chains (Hqak 2019, 2020, with a rigid-body simulation); "weave sheets, not threads" and 3D cloth
(hi.gher.space 2010; Hqak 2016); plane axles (Hqak 2018). These are the setting, given in a short section with
figures from CAD⁴, credited.

## To do before any prose

- [ ] Read the hi.gher.space threads and the Codidact question by hand (the search could not).
- [ ] Verify every reference marked record or unverified.
- [ ] A ledger (`ledger.json`) of every number the text will use, recomputed on build, as in P1.
- [ ] Bigger baked runs: TWIST over fibre count, twist, stiffness and seed (it is seven fibres and one geometry
      now); PULL over fibre length, bundle size and the set, to 1000 pulls where the tail matters.
- [ ] Replace the bench's assumed normal forces with measured ones: a 4D bundle in an elastic hoop in the TWIST rig,
      to give the hoop's press as a function of load. This removes the paper's largest free parameter.
- [ ] The sheath study, finished.
- [ ] Check claim 5 or drop it.
- [ ] An independent audit of the solver and the claims (P1 had one).
- [ ] Figures: the species drawn (CAD⁴), the twist experiment (before, during, after, in both dimensions), the bench
      (a rope under load, force curves), the distributions, the sheath's bargain.

## Authors

As P1: Claude (computation, code, analysis, drafting), an independent auditor to be found, and minor mobius last
(direction, judgement, PI). arXiv does not accept AI authors: there, a contribution statement and the PI's byline.
