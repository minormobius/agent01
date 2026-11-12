# TWIST

Why you can't spin yarn in four dimensions: [kata.mino.mobi/twist/](https://kata.mino.mobi/twist/).

A rope is made of fibres far shorter than itself, and what joins them is friction. In our world the friction comes
from twist: a fibre wound round the core is a helix, a helix under tension presses inward, and the harder you pull
the harder it grips. This lab asks whether that survives one more dimension. It doesn't.

## The experiment

`js/yarn.js` (no DOM). Seven elastic fibres, each a chain of 33 beads joined by stiff stretch springs, with a soft
repulsion between beads of different fibres (a fibre has a radius). One in the middle, six round it. The top end is
turned by a number of turns in the x–y plane, both ends are clamped, the yarn is stretched 3%, and it is left to
relax under damped dynamics with a small jiggle to break the symmetry.

The same code runs with three coordinates and with four. The yarn lies along the last one, so its cross-section is a
plane in 3D and a 3-space in 4D. Nothing else differs.

Measured: the **squeeze on the core** (the contact force on the middle fibre, per length: friction is that times a
coefficient), the **turns still wound** (an outer fibre's winding round the core), the elastic energy, and in 4D how
far any fibre went out of the twisting plane on the way.

## What it shows

| | 3D | 4D |
|---|---|---|
| untwisted | squeeze 0, energy 4.73 | the same |
| one turn | stays 1.00 turn, squeeze 31.6 | 0 turns, squeeze 0, energy 4.73 |
| two turns | stays 2.00 turns, squeeze 332 | 0 turns, squeeze 0, energy 4.73 |
| half a turn | stays, squeeze 4.4 | stays, squeeze 1.7 |
| one and a half | stays, squeeze 44 | relaxes to the half-turn state exactly |

- In 3D a wound fibre is trapped: it can't leave the core without passing through it.
- In 4D the core's surroundings are 3D. A loop round a point in 3-space is not caught on it, so each fibre's path
  slides over the core through the spare direction (the fibres go up to 0.5 out of the plane, five fibre radii) and
  pulls straight. Every whole turn comes off and the yarn ends exactly as if it had never been twisted.
- A part turn stays, because the clamped ends are a part turn apart and the fibre must still get round the core. It
  squeezes less than ours.
- With no jiggle at all the 4D twist stands and squeezes like ours. It is an equilibrium, and an unstable one.

## The cheat

A fibre catches on nothing one-dimensional and on anything two-dimensional. So give the yarn a core that is a
**ribbon**: flat along the yarn, wide across z (`tape`, the half-width; rigid here). Six fibres twisted round it:

| ribbon | one turn | two turns |
|---|---|---|
| none | unwinds | unwinds |
| ±0.1 (a fibre's radius) | stays, squeeze 62 | slips round the edge, unwinds |
| ±0.3 and wider | stays, squeeze 62 | stays, squeeze 676 |

It holds against ten times the jiggle. The squeeze is on the ribbon, from all six fibres, so it is not the same
quantity as the core squeeze above; what matters is that it is not zero. Not tested: a ribbon that can bend or crumple,
fibres wound near its edge, or many layers.

So a plain 4D yarn cannot get its grip from twist, but one spun round a ribbon can.

## Grip per pull, and the shortest fibre that holds

A rope of short fibres holds because friction along each fibre can match that fibre's tension. Friction is μ × the
normal force on it, so what matters is **grip per pull**: every contact force on one outer fibre, per length, over
that fibre's own tension. A fibre of length ℓ holds if μ × grip × ℓ / 2 ≥ pull, so the shortest that holds is
2 / (μ × grip/pull).

| | grip per pull at 1%, 3%, 6% stretch | shortest fibre that holds (μ = 0.3) |
|---|---|---|
| 3D, one turn | 0.62, 0.64, 0.65 | 52 thicknesses |
| 3D, two turns | 4.1, 4.0, 3.2 | 8 |
| 4D, twisted | 0 | none |
| 4D on a ribbon, one turn | 0.47, 0.46, 0.45 | 73 |
| 4D on a ribbon, two turns | 1.79, 1.74, 1.68 | 19 |

The ratio hardly moves while the pull nearly doubles: both yarns grip in proportion to their load, which is what
makes a rope a rope. The ribbon yarn gets about half our grip at the same twist (its fibres press the ribbon, not
each other, and it has no core fibre). The plain 4D yarn has no grip, so no fibre length holds and a yarn of short
fibres has no strength at all.

This is the answer the model can give to "how strong is the bundle against one strand": with fibres longer than that
length the yarn can load every fibre to its breaking tension, seven fibres for seven strengths, less what the
statistics of weak spots take; with shorter ones, or with no grip, it pulls apart at any load. A pull to failure
needs a friction law and fibres that break, which this does not have. A squeezing sleeve in place of twist was tried
and gave no clean number (the fibres repack inside it); that needs the sheath as an elastic body. What it can use (a hoop that is a sphere, a woven sheath) is in
[CAD⁴](../cad4/#rope); whether a sheath tightens under load, as a finger trap does, is the next experiment.

## What this is not

A strength test. There is no friction law and nothing breaks: the squeeze is the normal force friction would act on.
Beads, not smooth rods, so the fibres are slightly bumpy; contact is a penalty spring, so fibres overlap a little
under a hard squeeze (at two turns in 3D, visibly). Seven fibres, one geometry.

## Test

```bash
node kata/twist/test/twist.selftest.mjs   # ~30 s, 10 checks
```
