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
read that file). Strength in strands: one continuous strand's mean is 1. **Material** is everything the rope
is made of, in strands' worth (a ribbon is two; hoops and hoses are weighed). **Specific** is
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
| 4D short fibres in thin hoops (τ 0.02) | 13.54 | 3.32 | 13% | 2.68 | 0.25 | 0.20 |
| 4D short fibres in hoops (τ 0.2) | 18.4 | 12.69 | 8% | 10.78 | 0.69 | 0.59 |
| 4D filament bundle, loose | 13 | 9.07 | 11% | 7.45 | 0.70 | 0.57 |
| 4D filaments in a hose (τ 0.1) | 15.7 | 17.32 | 6% | 15.36 | 1.10 | 0.98 |
| 4D plait of three hoses, 20° | 3.19 | 2.45 | 14% | 1.92 | 0.77 | 0.60 |
| 4D maypole: hose core, six braided, 20° | 7.39 | 5.55 | 10% | 4.62 | 0.75 | 0.62 |
| 4D ribbons on a hose, 20° | 7.39 | 5.20 | 12% | 4.15 | 0.70 | 0.56 |

- **The answer is a distribution.** One strand's strength spreads 24% about its mean; a loose bundle of thirteen,
  11%; filaments in a hose, 6%. So on the strength you can count on, per material, the rope is 1.7 times a strand
  where on the mean it is 1.10 times. Most of what a rope buys is reliability.
- **A ribbon alone is two strands, with a strand's spread,** and so 1.00 per material: the proper yardstick for the
  yarn spun on it. That yarn (hard) is 4.35 strands from 8 strands' worth of material, 0.54 per material. The short
  fibres add strength and add more weight. Ours, hard, is 0.64. No yarn of short fibres matches a continuous member
  per material; what it buys is being made of short fibres at all.
- **A 4D yarn twisted round nothing has no strength.**
- **A loose bundle is worth less than its count** (0.70 a fibre): the weakest goes first and hands its load on.
  **In a hose it is worth more** (1.10, hose weighed): friction lets a broken fibre take load again a little way
  along, so a weak spot costs a short stretch, not the fibre, and the hose carries load too.
- **Hoops make short fibres into a rope, at a price:** 0.69 per material in thick hoops, about what filaments are
  worth loose, and 0.25 in thin ones.
- **The hard twisted yarn keeps a strand's spread** (24%): it fails where the grip gives out, one place, like a
  weakest link.
- Longer fibres are stronger: the hard 3D yarn goes 1.2, 4.5, 5.9 strands at 20, 40, 80 diameters.

## What a sheath weighs against what it grips

A sheath grips by its own hoop tension, so how hard it can press is set by how thick it is, and thick is heavy.
`sheath()` in the bench gives the relation for thirteen fibres in a closed hose τ thick in 4D: material 27 τ/r
fibres' worth; the skin's force on each outer fibre 0.06 × 0.5 × τ/r (the hoop stress taken at half the material's
strength); and from fibre to fibre a third of that, because an outer fibre leans on the middle one and four
neighbours. For our seven in a tube: 6 τ/r, 0.0133 × 0.5 × τ/r, and a half. `node kata/pull/sheath.mjs` sweeps τ
with the sheath's weight counted (`data/sheath.json`, 60 pulls a cell). Two ways to spend the same material:

- a **hose**: a closed skin, which grips and also carries load along the rope (in the bench it is a member as strong
  as its material);
- **hoops**: the same material as separate hoops, which grip and carry nothing along the rope. This is a weave's
  hoops; its lengthwise bands are just more filaments.

Strength per material, sheath included (a loose bundle is 0.71; one strand is 1):

| sheath thickness, in fibre radii | its weight, in fibres (of 13) | hose | hoops | hose, short fibres | hoops, short fibres | ours: tube round 7, grip only |
|---|---|---|---|---|---|---|
| 0 | 0.00 | 0.71 | 0.71 | 0.00 | 0.00 | 0.74 |
| 0.01 | 0.27 | 0.84 | 0.79 | 0.25 | 0.13 | 0.75 |
| 0.02 | 0.54 | 0.91 | 0.83 | 0.47 | 0.25 | 0.76 |
| 0.05 | 1.35 | 1.02 | 0.86 | 0.78 | 0.53 | 0.79 |
| 0.1 | 2.70 | 1.11 | 0.86 | 0.97 | 0.67 | 0.80 |
| 0.2 | 5.40 | 1.13 | 0.80 | 1.06 | 0.70 | 0.79 |
| 0.3 | 8.10 | 1.09 | 0.74 | 1.05 | 0.66 | 0.77 |
| 0.5 | 13.50 | 1.04 | 0.62 | 1.02 | 0.56 | 0.72 |

(The weight column is the 4D sheath's. Our tube's is 6 τ/r of seven fibres, and it is run for its grip only.)

> **Corrected 2026-11-13.** Until then the bench pressed fibre on fibre with the skin's whole force on a fibre, where
> each contact carries a third of it (a half in 3D). Every sheath number fell: the best hose from 1.20 to 1.13, the
> best hoops from 0.99 to 0.86. The hoop and sheath rows of the species table were redefined at the same time (they
> had been a squeeze with no weight counted; under the corrected law that squeeze needs a wrap heavier than its core).

- **There is a best sheath, and it is thin:** a tenth to a fifth of a fibre's radius, a fifth to two fifths of the
  core's weight. Past that the weight outruns the grip.
- **A hose beats hoops by about a third** at the best thickness (1.13 against 0.86 for filament), because its
  material also carries load. **Hoops alone never reach a single strand's worth per weight;** a hose does.
  **Weaving saves no weight in this model; it costs some.** It would pay only if material laid along a hoop were
  stronger than the same material as a skin (in our world drawn fibre is far stronger than film, which is why we
  weave), or where you can't extrude a hose.
- **A 4D sheath is a slightly better bargain than ours.** A sphere's skin pulls in two directions, so it presses
  twice as hard per thickness, but it is shared among more contacts; per unit of sheath weight per fibre it gives
  about 1.24 times a tube's press at each contact, on five contacts a fibre instead of three.

## Where the squeeze comes from

The hose's squeeze was a formula taken on trust. `js/skin.js` gets it three ways and `node kata/pull/press.mjs`
(`data/press.json`) puts the bench through each. Sources are in [`../papers/r1/REFERENCES.md`](../papers/r1/REFERENCES.md),
with how far each was checked.

**1. The skin's force on a fibre.** The bench treats the hose as a round pressure vessel of the bundle's radius
(a sphere's skin under tension n presses 2n/R; D1). But a taut skin is not round: it lies on the twelve outer
fibres and runs straight between them.

| the skin's force on each outer fibre, over its tension × the fibre's radius | 3D: a band round six | 4D: a skin round twelve |
|---|---|---|
| round-vessel formula (the bench) | 2.094 | 6.283 |
| exact, a band turning 60° at each disc | 2.000 | |
| a net of springs shrunk onto the fibres, barely taut | 2.000 | 5.065 |
| the same, stretched 20% | 2.000 | 4.861 |
| the convex hull under one tension, by Steiner's formula (D3) | | 5.065 |

- In 3D the net gives the exact answer, which checks the method. The round formula is 5% high.
- **In 4D the round formula is 24% high.** The net on a 10 242-node mesh and the hull calculated from geometry agree
  to three figures (5.065 against 5.065): the skin presses
  **0.81** of what the bench assumed. Stretched further the net sags between the fibres and presses a little less.
- **The skin is not evenly stressed.** Its tightest hundredth carries 2.3 times the mean
  tension (it is flat between fibres and creased over them). So a hose whose *mean* stress is half its strength is
  past its strength in places. The dial HOOP should be read as the mean, and 0.5 is at the edge of what a skin could bear.

**2. Who carries it.** The skin's force on an outer fibre goes inward through one contact with the middle fibre and
four with its neighbours. With every fibre equal each contact carries a third (the correction above). Thirteen balls
with twelve neighbours each have more contacts than they need to stand (36), so the split depends on the fibres being
equal (D5). `sharing()` draws their diameters at random, the scatter in units of how far a contact closes under load:

| diameter scatter / contact closure | a middle contact carries | a ring contact carries | middle contacts open | everything pressing on an outer fibre | on the middle fibre |
|---|---|---|---|---|---|
| 0 | 0.33 ± 0.00 | 0.33 ± 0.00 | 0% | 2.67 ± 0.00 | 4.0 ± 0.0 |
| 1 | 0.33 ± 0.12 | 0.34 ± 0.06 | 0% | 2.67 ± 0.12 | 3.9 ± 1.4 |
| 2 | 0.33 ± 0.22 | 0.34 ± 0.12 | 5% | 2.67 ± 0.22 | 3.9 ± 2.5 |
| 5 | 0.38 ± 0.36 | 0.31 ± 0.19 | 17% | 2.62 ± 0.36 | 4.6 ± 4.1 |
| 10 | 0.43 ± 0.41 | 0.29 ± 0.22 | 23% | 2.57 ± 0.41 | 5.1 ± 4.7 |

(in units of the skin's force on one fibre)

- **The grip on an outer fibre is robust:** about 2.6 times the skin's force however it is shared. Statics pins it
  between 2 and 3.
- **The grip on the middle fibre is not.** Once the scatter is a few times the closure, a quarter of its contacts are
  open and its grip runs from nothing to twice the mean. A real 4D rope would have a loosely held heart. A rough
  estimate puts a contact's closure near 1% of a fibre's radius, so this is the regime for any fibre less uniform than that.

**3. The law a wound strand presses by.** A strand at tension T on a helix of radius ρ at angle θ to the rope is
pushed inward by T sin²θ / ρ per length of strand (B5–B7; Costello writes it cos²α / r with his angle from the
cross-section). That is the `twist` and `laid` laws. TWIST's bead yarn measures it with nothing assumed:

| turns | angle | the law, per length of yarn | measured in the bead yarn | ratio |
|---|---|---|---|---|
| 0.5 | 9° | 0.115 | 0.093 | 0.81 |
| 1 | 17° | 0.445 | 0.409 | 0.92 |
| 1.5 | 25° | 0.962 | 1.387 | 1.44 |
| 2 | 33° | 1.643 | 2.300 | 1.40 |

- At low twist the law is good to 10–20%. **Past 20° the bead yarn presses about 1.4 times what the law says.** Part
  of that is my bookkeeping (it resolves the contacts as if the fibres stood straight, and at 30° they lean); part
  may be real (the squeezed yarn is thinner than its nominal radius). So the braid rows' grip is good to a factor of
  about one and a half, which the sensitivity table already spans (friction halved and doubled).

**What the bench makes of it** (thirteen filaments in a hose a tenth of a radius thick, 60 pulls each, per weight):

| | mean | 5th percentile |
|---|---|---|
| as built: round vessel, equal sharing | 1.11 | 0.96 |
| the taut skin's force (0.81 of the vessel's) | 1.08 | 0.96 |
| the skin's force, limited by its tightest part | 1.06 | 0.96 |
| middle fibre loose: all through neighbours | 1.06 | 0.95 |
| all through the middle fibre | 1.09 | 0.96 |

**The hose rope's headline survives all of it: 1.06 to 1.11 per weight, and
0.95–0.96 at the 5th percentile, which hardly moves.** The published rows keep the
round-vessel formula; the taut skin's 0.81 is the same as turning HOOP from 0.5 to 0.40, inside the band the
sensitivity study covers.

**Does a hose tighten as the rope stretches?** Not to first order. A stretched hose wants to shrink by its Poisson
ratio; so does every fibre inside it, and so the bundle. With hose and fibres of one material the two shrink together
and the squeeze stays what it was made with: hoop stress = E (misfit + (ν_hose − ν_fibre) × stretch) / (1 − ν_hose).
The squeeze is a **shrink fit** (D2): HOOP = 0.5 means the hose was made about half a percent too small for its
bundle. Only a hose with a larger Poisson ratio than its fibres tightens under load. A braided sleeve does (C1, C2),
which is the bias sheath's law.

**Still assumed:** equal contact stiffness; rigid fibres in their packed places under the skin; a skin with no
bending stiffness; and that a 0.5% shrink fit can be made and does not creep away.

## Braids

The ropes whose strands are hoses ([CAD⁴](../cad4/): `#hosebraid`, `#maypole`, `#ribbonpole`). A hose is continuous, so
a braid cannot be there to hold short fibres together. What it can add is load sharing round a break; what it costs
is the angle its strands lie at. `node kata/pull/braid.mjs` (200 pulls each, `data/braid.json`):

| rope | angle | strength (strands) | weight | per weight | spread | 5th percentile per weight |
|---|---|---|---|---|---|---|
| 3 hoses, loose | 0° | 2.38 | 3.00 | 0.79 | 19% | 0.60 |
| plait of 3 | 20° | 2.47 | 3.19 | 0.77 | 14% | 0.62 |
| plait of 3 | 30° | 2.45 | 3.46 | 0.71 | 14% | 0.54 |
| 7 hoses, loose | 0° | 5.12 | 7.00 | 0.73 | 15% | 0.54 |
| maypole (core + 6) | 20° | 5.61 | 7.39 | 0.76 | 11% | 0.62 |
| maypole | 30° | 5.73 | 7.93 | 0.72 | 9% | 0.62 |
| maypole | 40° | 5.41 | 8.83 | 0.61 | 9% | 0.52 |
| ribbons on a hose | 20° | 5.25 | 7.39 | 0.71 | 12% | 0.57 |
| ribbons on a hose | 30° | 5.38 | 7.93 | 0.68 | 10% | 0.56 |

- **Braiding buys reliability, not strength per weight.** A maypole at 20–30° is 10% stronger than its seven hoses
  loose, and weighs 6–13% more, because a strand at an angle is longer. Per weight that is a wash (0.73 → 0.76 → 0.72).
  The spread falls from 15% to 9%, so the strength you can count on rises about 15% (0.54 → 0.62).
- **There is a best angle, near 20°.** Steeper grips harder (press goes as tan²θ) but a strand at θ carries cosθ of
  its strength along the rope and weighs 1/cosθ. By 40° the angle has cost more than the grip gave.
- **A braid grips much less than a tight hose.** Filaments in a hose read 1.13 per weight at best. A braid's press is a fraction of its strands' tension; the hose's is set by how tight it was made.
- **Ribbons on a hose are the low end.** That row gives the ribbons no grip on each other, since CAD⁴ shows they can
  slide out of it; the maypole row is the same rope with that grip. The truth for ribbons lies between, 4–6% apart.
- **The core breaks first.** It is straight, so it is stiffer than the strands round it and takes the load first.

What is assumed (`laid` in `js/bench.js`): a strand at θ is a track of stiffness cos³θ, strength cosθ, weight 1/cosθ,
pressing tan²θ × its tension on a neighbour one diameter away; the plait uses the same law though its strands only
meet at crossings; the braid is laid with the same 5% set as the yarns (with none, a broken end floats and the solve
does not converge); 50° is left out because some of its solves did not converge. Nothing here knows the strands are
hoses rather than threads except the geometry that lets them be braided at all.

## Does the ranking survive the dials?

Three numbers in the bench are chosen, not measured: how hard a hose or hoop is stressed (HOOP, half its strength),
the tension a yarn or braid is laid with (the set, 5%), and friction (μ, 0.3). `node kata/pull/sens.mjs` pulls each
configuration at half and double each dial that touches it, re-tuned to its best thickness or angle each time
(60 pulls a tuning, `data/sens.json`). Strength per weight, all weight counted:

| rope | as published | lowest | highest | what moves it |
|---|---|---|---|---|
| filaments in a hose | 1.12 | 1.06 | 1.22 | HOOP or μ |
| short fibres in a hose | 1.06 | 0.96 | 1.13 | HOOP or μ |
| a ribbon alone | 1.00 |  |  | nothing |
| filaments in hoops | 0.87 | 0.79 | 0.95 | HOOP or μ |
| plait of three | 0.77 | 0.77 | 0.80 | μ; the set hardly |
| maypole | 0.76 | 0.66 | 0.81 | μ; the set hardly |
| filaments, loose | 0.71 |  |  | nothing |
| yarn on a ribbon, hard | 0.54 | 0.35* | 0.77 | the set and μ, strongly |

\* a row with an unconverged solve; not to be quoted.

- **The order holds, with one tie.** A hose of filaments beats everything at every setting (1.06–1.22). Then a
  ribbon alone (1.00), which short fibres in a hose match or beat only at the published dial and above. Hoops
  (0.79–0.95) stay under a single strand's worth. Braids stay below hoops and round about the loose bundle: at half
  friction the maypole (0.66) is under it.
- **HOOP and μ are one dial.** Only their product enters, so their rows are identical. Halving it costs a hose 5%.
- **The braids don't care about the set** (0.75–0.77 for the maypole from 2% to 10%). They need some, not a particular amount.
- **Yarn on a ribbon is the one row that cannot be quoted as a number.** It runs from 0.35 to 0.77 with the dials, and
  two of its rows did not converge. What survives is the order: it holds, and it is worth less than the ribbon it is spun on.
- The best thickness moves with the dial (a hose of filaments: τ 0.1 → 0.2 at half).

## Cabling

`node kata/pull/cable.mjs` (`data/cable.json`, 40 pulls a cell). Thirteen ropes in a sheath, then thirteen of
those. Each level is the same bench with the level below as its fibre: the element's link strengths are Weibull
with the modulus and scale that reproduce its own measured distribution, its stiffness and weight are its own, and
the sheath (hoops) is τ element radii thick. The best sheath at each level, by the 5th percentile:

| | fibres | best τ | strength | spread | per material | per material, 5th pct | with no sheath |
|---|---|---|---|---|---|---|---|
| a rope: 13 filaments | 13 | 0.05 | 12 | 5.1% | 0.84 | 0.77 | 0.68 |
| a cable: 13 ropes | 169 | 0.005 | 139 | 4.0% | 0.73 | 0.68 | 0.74 |
| a great cable: 13 cables | 2197 | 0.005 | 1619 | 2.8% | 0.63 | 0.61 | 0.64 |

- **Cabling buys no strength per weight. Each level costs about an eighth** (0.84, 0.73, 0.63)**.** A rope is already uniform (5% spread
  against a fibre's 24%), so bundling ropes has little left to average; and a rope is partly hollow (thirteen fibres
  in a section that would hold twenty-seven), so a sheath round thirteen of them is heavy for what it adds. The best
  cable sheath is a tenth as thick as the best rope sheath, and makes almost no difference.
- **Pessimistic by construction:** a broken element here carries nothing, where a real rope keeps a frictional
  plateau. And the hoops' weight is counted but they carry no load along the cable.
- In our world cabling also balances torque: each level is laid against the last. With no twist there is none to
  balance. So in 4D a cable is for handling, bending and redundancy; for strength, make one fat rope.

## A sheath that tightens as it is pulled

A sheath laid on the bias squeezes in proportion to its own tension (a finger trap). The bench has it as a law
(`trap`: the skin's force on a fibre = c × the sheath's tension, c = tan²θ / 9 for a bias angle θ round thirteen
fibres, and a third of that from fibre to fibre), with the sheath a
member τ thick. **Whether such a sheath can be woven round a sphere's worth of directions is open** (a sphere
cannot be combed), so this is what it would be worth, not what it is. Strength per material, 40 pulls a cell:

| τ | 35° | 45° | 55° | 45°, short fibres | 55°, short fibres |
|---|---|---|---|---|---|
| 0.01 | 0.76 | 0.81 | 0.88 | 0.17 | 0.30 |
| 0.02 | 0.81 | 0.88 | 0.96 | 0.33 | 0.59 |
| 0.05 | 0.89 | 0.97 | 1.06 | 0.67 | 0.86 |
| 0.1 | 0.94 | 1.02 | 1.09 | 0.84 | 0.96 |

It does not beat the plain hose (1.11 at τ = 0.1, which assumes its hoop stress held at half strength whatever the
load), but it comes close (1.09 at 55°). What it buys is grip at low weight without that assumption: at τ = 0.02 and
55° it is 0.96 against the hose's 0.91, and it holds short fibres.

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
node kata/pull/sheath.mjs 60              # ~14 min: data/sheath.json
node kata/pull/cable.mjs 40               # ~22 min: data/cable.json
```
