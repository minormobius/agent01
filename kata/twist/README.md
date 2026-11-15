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

## A hose seems to save one turn, and only one

`makeYarn({ pack: 13, wall })` is the full 4D bundle (one fibre and the twelve that fit round it) inside a hose, a wall
no bead's centre may pass. Loose, the thirteen shed every turn, as the seven do. Pressed together by a tight hose
they cannot pass each other. `node kata/twist/bake.mjs` (→ `data/twist.json`) gives them 0 to 5 turns with three seeds
(hose at 0.19, fibres touch at 0.20); energy at rest:

| seed | 0 turns | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | 56 | 83 | 52 | 83 | 64 | 172 |
| 7 | 63 | 90 | 56 | 83 | 80 | 390 |
| 13 | 56 | 83 | 52 | 77 | 56 | 226 |

**Odd twists never rest below 77. Even twists come down to 52–56 in six runs of nine and jam higher in the rest (up
to 80), so odd and even overlap.** The first version of this section, from one seed, said odd settle to one state
and even go back to nothing; three seeds show that was too clean. The reading still offered: a bundle held together
turns as a body, its cross-section is three-dimensional, and a full turn of a body in three dimensions cannot be
undone where two can (the belt trick). That predicts the floor under the odd runs. It does not explain the jams, and
five turns jam far higher. A relaxation that escapes jams, more seeds and other packings are needed before this is a
result.

So a hose does not give a 4D rope twist to grip with: at most one turn in the whole length. What grips is the hose.
The `wind` reading follows one fibre in the x–y plane and loses track once the turn moves to another axis, so the
energies are the evidence. A packed cluster has symmetries, so part turns that map it onto itself may be stubborn
too (not tested).
