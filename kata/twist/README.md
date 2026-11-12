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

So a 4D rope cannot get its grip from twist. What it can use (a hoop that is a sphere, a woven sheath) is in
[CAD⁴](../cad4/#rope); whether a sheath tightens under load, as a finger trap does, is the next experiment.

## What this is not

A strength test. There is no friction law and nothing breaks: the squeeze is the normal force friction would act on.
Beads, not smooth rods, so the fibres are slightly bumpy; contact is a penalty spring, so fibres overlap a little
under a hard squeeze (at two turns in 3D, visibly). Seven fibres, one geometry.

## Test

```bash
node kata/twist/test/twist.selftest.mjs   # ~15 s, 6 checks
```
