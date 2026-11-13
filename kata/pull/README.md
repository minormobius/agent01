# PULL

A tensile bench for four-dimensional rope: [kata.mino.mobi/pull/](https://kata.mino.mobi/pull/).

Every species of rope this site has arrived at, pulled to failure in the same model, against one continuous strand
of the same length.

## The bench (`js/bench.js`, no DOM)

The rope is a bundle of **tracks** (places in the cross-section), each a chain of unit links, 96 fibre diameters
long. A track is one continuous filament, or short fibres laid end to end with a gap every `staple` links at a
random phase. Every link has its own strength (Weibull, shape 5: weak spots exist) and the same stiffness.
Neighbouring tracks pass load through **friction**: an elastic interface that sticks until its shear reaches
μ × the normal force pressing the two together (μ = 0.3), then slips at that force. Both ends are held in jaws.

The rope is stretched in steps. At each step the equilibrium is found; any link over its strength is broken, worst
first, and the equilibrium found again. The force at the jaws is recorded and its peak is the strength.

**The solve.** With the caps fixed for a step, a stick-then-slip interface has a potential (quadratic up to the cap,
linear beyond), so equilibrium is the minimum of a convex energy. It is found by Newton's method on that energy,
the whole rope at once (a banded matrix), the step shortened if the energy doesn't fall, damping raised when a
fibre is barely held. It converges in 3 to 16 steps. An earlier relaxation scheme stopped at its sweep limit
unconverged and read the hard 3D yarn 10% low; the selftest now fails if any solve doesn't converge.

One strand in the bench breaks at its weakest link: mean 0.00725 over 200 pulls against the closed-form 0.00739,
spread 24% against Weibull's 23%.

## What makes the species differ

Only the **press**, the normal force per length between two neighbours:

| press | where it comes from | measured? |
|---|---|---|
| twist | q × (the pair's mean tension + a set) | q is TWIST's grip per pull. The **set** is an allowance |
| hoop | a constant p | no: a dial for how tight the hoop or sheath is |
| none | nothing | TWIST: a 4D yarn twisted round nothing has no grip |

and the cross-section: seven in 3D (one and six round it); thirteen in 4D (the cross-section is 3D, where twelve
fit round one); six on a ribbon, touching only the ribbon, which is a continuous track of its own worth two strands.

**The set.** Grip in proportion to tension has a dead state: a slack yarn has no grip to start gripping with. Real
yarn is spun under tension and keeps some. The bench gives it 5% of a fibre's mean link strength. It matters, most for
soft twist (24 pulls each, strength in strands):

| set | 3D soft | 3D hard | ribbon soft | ribbon hard |
|---|---|---|---|---|
| 1% | 0.05 | 3.4 | 1.9 | 2.9 |
| 5% | 0.23 | 4.6 | 2.3 | 4.5 |
| 20% | 0.90 | 5.7 | 3.2 | 5.9 |
| 100% | 4.0 | 7.4 | 5.6 | 7.8 |

So the twisted rows are good to the ordering and roughly to a factor, not to two figures.

## What it found

200 pulls of every species (`node kata/pull/sample.mjs`, written to `data/samples.json`; the page and the selftest
read that file). Strength in strands: one continuous strand's mean is 1. **Material** is what carries load, in
strands' worth (a ribbon is two); `+w` marks a hoop or sheath whose own weight is not counted. **Specific** is
strength per material. The 5th percentile is what you could count on. Short fibres are 40 diameters long.

| rope | material | strength | spread | 5th percentile | specific | specific, 5th pct |
|---|---|---|---|---|---|---|
| any one continuous strand | 1 | 1.00 | 24% | 0.56 | 1.00 | 0.56 |
| 4D a ribbon alone | 2 | 2.00 | 24% | 1.13 | 1.00 | 0.56 |
| 3D twisted yarn, soft | 7 | 0.23 | 23% | 0.15 | 0.03 | 0.02 |
| 3D twisted yarn, hard | 7 | 4.48 | 24% | 2.60 | 0.64 | 0.37 |
| 4D twisted yarn | 7 | 0 | n/a | 0 | 0 | 0 |
| 4D yarn on a ribbon, soft | 8 | 2.34 | 21% | 1.46 | 0.29 | 0.18 |
| 4D yarn on a ribbon, hard | 8 | 4.35 | 22% | 2.61 | 0.54 | 0.33 |
| 4D hooped bundle, slack | 13+w | 8.44 | 11% | 6.58 | 0.65 | 0.51 |
| 4D hooped bundle, tight | 13+w | 15.06 | 7% | 13.44 | 1.16 | 1.03 |
| 4D filament bundle, loose | 13 | 9.07 | 11% | 7.45 | 0.70 | 0.57 |
| 4D filament rope, sheathed | 13+w | 16.35 | 5% | 14.77 | 1.26 | 1.14 |

- **The answer is a distribution.** One strand's strength spreads 24% about its mean; a loose bundle of thirteen,
  11%; the sheathed rope, 5%. So on the strength you can count on, per material, the rope is 2.0 times a strand
  where on the mean it is 1.26 times. Most of what a rope buys is reliability.
- **A ribbon alone is two strands, with a strand's spread,** and so 1.00 per material: the proper yardstick for the
  yarn spun on it. That yarn (hard) is 4.35 strands from 8 strands' worth of material, 0.54 per material. The short
  fibres add strength and add more weight. Ours, hard, is 0.64. No yarn of short fibres matches a continuous member
  per material; what it buys is being made of short fibres at all.
- **A 4D yarn twisted round nothing has no strength.**
- **A loose bundle is worth less than its count** (0.70 a fibre): the weakest goes first and hands its load on.
  **A gripped bundle is worth more** (1.16 hooped tight, 1.26 sheathed): friction lets a broken fibre take load again
  a little way along, so a weak spot costs a short stretch, not the fibre. The sheathed rope stays ahead of the
  loose bundle per material until its sheath weighs 80% of its core.
- **The hard twisted yarn keeps a strand's spread** (24%): it fails where the grip gives out, one place, like a
  weakest link.
- Longer fibres are stronger: the hard 3D yarn goes 1.2, 4.5, 5.9 strands at 20, 40, 80 diameters.

## What this is not

A model, not a rope. One dimension of mechanics (along the rope), with the cross-section reduced to who touches
whom; the dimension enters only through the cross-section's packing and through TWIST's numbers. The hoop's
tightness is chosen, not derived, and whether a woven sheath tightens as it is pulled (a finger trap) is still open:
if it does, the hooped rows would grip in proportion to load as the twisted ones do. No bending, no fibre migration,
no rate effects, no chain (the tiger chain's strength is its links' sections, a different question).

## Test

```bash
node kata/pull/test/pull.selftest.mjs   # ~10 s, 7 checks
node kata/pull/sample.mjs 200             # ~8 min: remake data/samples.json
```
