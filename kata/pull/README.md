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

The rope is stretched in steps. At each step the equilibrium is found (each track's chain solved exactly, slip
applied between sweeps); any link over its strength is broken, worst first, and the equilibrium found again. The
force at the jaws is recorded and its peak is the strength.

One strand in the bench breaks at its weakest link: 0.0066 against the closed-form 0.0074 (the bench reads the force
one step before the break).

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
soft twist (8 samples each, strength in strands):

| set | 3D soft | 3D hard | ribbon soft | ribbon hard |
|---|---|---|---|---|
| 1% | 0.06 | 3.1 | 1.9 | 2.7 |
| 5% | 0.25 | 4.0 | 2.1 | 4.7 |
| 20% | 0.94 | 5.6 | 3.0 | 5.9 |
| 100% | 3.6 | 7.4 | 5.6 | 8.0 |

So the twisted rows are good to the ordering and roughly to a factor, not to two figures.

## What it found (8 samples each, fibres 40 diameters long where short)

| rope | fibres | strength, strands | per fibre | fails by |
|---|---|---|---|---|
| 3D twisted yarn, soft | 7 | 0.25 | 0.04 | slipping apart |
| 3D twisted yarn, hard | 7 | 4.0 | 0.57 | slipping, then breaking |
| 4D twisted yarn | 7 | 0 | 0 | falls apart |
| 4D yarn on a ribbon, soft | 6 + ribbon | 2.1 | n/a | slipping (the ribbon carries it) |
| 4D yarn on a ribbon, hard | 6 + ribbon | 4.7 | n/a | slipping, then breaking |
| 4D hooped bundle, slack | 13 | 7.7 | 0.59 | slipping and breaking |
| 4D hooped bundle, tight | 13 | 14.7 | 1.13 | fibres breaking |
| 4D filament bundle, loose | 13 | 8.5 | 0.65 | fibres breaking, one by one |
| 4D filament rope, sheathed | 13 | 16.5 | 1.27 | fibres breaking |

- **A 4D yarn twisted round nothing has no strength at all.** The ribbon gives it back.
- **A loose bundle is worth less than its count** (0.65 a fibre): the weakest fibre goes first and hands its load to
  the rest.
- **A gripped bundle is worth more than its count** (1.1 to 1.3 a fibre). Friction lets a broken fibre take load
  again a little way along, so one weak spot costs a short stretch of it, not the whole fibre; and a short stretch
  is stronger than a long one. This is the "more than seven times" a rope is for.
- **The spinneret's rope is the strongest thing here**, and the only one that needs nothing twisted or woven.
- Longer fibres are stronger: the hard 3D yarn goes 1.3, 4.0, 5.5 strands at 20, 40, 80 diameters.

## What this is not

A model, not a rope. One dimension of mechanics (along the rope), with the cross-section reduced to who touches
whom; the dimension enters only through the cross-section's packing and through TWIST's numbers. The hoop's
tightness is chosen, not derived, and whether a woven sheath tightens as it is pulled (a finger trap) is still open:
if it does, the hooped rows would grip in proportion to load as the twisted ones do. No bending, no fibre migration,
no rate effects, no chain (the tiger chain's strength is its links' sections, a different question).

## Test

```bash
node kata/pull/test/pull.selftest.mjs   # ~50 s, 5 checks
```
