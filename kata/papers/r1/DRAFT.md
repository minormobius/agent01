# Rope after the knot: what holds in four dimensions

**Draft 1, 2026-11-15. Not submitted, not audited.** Every bench number below is recomputed from the baked data by
`test/ledger.selftest.mjs`, which fails if the text and the data part. The twist runs are baked too (`kata/twist/data/twist.json`) and are in the ledger. Sources and how far each was checked: [REFERENCES.md](REFERENCES.md). What is
ours and what is not: [PRIOR-ART.md](PRIOR-ART.md). Open items are listed at the end and are part of the draft.

**Figures.** [figures.html](figures.html): every rope drawn four ways by CAD⁴ (two cross-sections along the rope, two
side views). [results.html](results.html): what was tested, how, and what came out, one chart at a time, each drawn
from a baked data file. Both are meant to be read before the text. Which go in the main text is listed after the
methods.

## Summary

"Knots come undone in four dimensions" is true and is usually heard as "so there is no rope there". The second does
not follow. What four dimensions takes away is narrow: one thread cannot catch on another. Every job a rope does in
our world depends on that somewhere (twist holds fibres, knots hold ends, braids hold strands), so every one fails for
thread on thread. But each comes back the moment one of the two parts is a surface: a ribbon, a hoop that is a
sphere, a tube. We build each case as geometry, test it in a solid-modelling kernel written for the purpose, and
price the resulting ropes on one tensile bench.

The ropes that work are not exotic. The strongest per weight is continuous filaments in a thin closed hose. One
result is particular to four dimensions: a bundle held together appears to keep one turn of twist and no more,
where ours keeps every turn. The evidence for it is suggestive and not yet clean (section 2). We have not yet searched the literature for it specifically.

## 1. The rule

Two things in four dimensions can obstruct each other only if their dimensions add to at least three. A thread is
one-dimensional, so thread and thread add to two: they pass. A thread and a surface add to three: they catch. This is
standard (general position; F1 in the references), and the ring-and-sphere chain that follows from it has been drawn
and simulated before (PRIOR-ART: Hqak). We use it as the spine and claim none of it.

What it predicts for cordage, case by case, is the content of sections 2 to 4.

## Methods: what was tested, and how

Three instruments, each with its own test file, and one rule for reporting: a number appears here only if a script
writes it to a data file and the ledger finds it there.

**M1. The kernel (geometry: can this part move?).** CAD⁴ is a solid-modelling kernel for four dimensions, written for
this work. A part is a tree of operations that compiles to a distance function. Two parts *interfere* if a sampled
grid finds a point inside both (`fit`, 12 to 18 samples an axis over the overlap of their bounding boxes, with cells
proved empty by the distance bound skipped). "A cannot be moved off B" means: translate A rigidly along each of the
four axes, both ways, in steps finer than the thinnest wall, and it interferes before it is clear (`sweep`). "A
comes free" means a stated path is swept with no interference at any step. **What this does and does not show:** it
tests rigid translations of one part along axes, and named paths. It can show a way out exists. It cannot prove none
does; where the text says a link or knot *holds*, that rests on the cited theorem, and the kernel shows only that
the obvious ways out are shut. Constructions by revolving (the hose braids, the tube knot, the tube yarn) are the
spun surface of a three-dimensional curve (Winter 2009). Test files: `kata/cad4/test/*.selftest.mjs`.

**M2. The bead yarn (mechanics: does twist stay, and what does it press with?).** Fibres are chains of 33 beads on
springs (stiffness 3000) with a repelling contact (stiffness 6000) between beads of different fibres nearer than
two radii (radius 0.1; length 4). Seven fibres, six round one, are laid as helices of a given number of turns, the
ends clamped, the yarn stretched 3%, every free bead displaced at random by 0.002, and the system relaxed by damped
dynamics (step 0.006, damping 0.985 a step) for 30 000 steps. The same code runs with three coordinates or four.
Measured at rest: the turns one outer fibre still makes round the core; the elastic energy; the contact force on
the core and on one outer fibre, per length; that fibre's tension. Variants: the core replaced by a rigid ribbon of
a given half-width; thirteen fibres inside a wall that no bead's centre may pass (a hose). **Limits:** no friction
and no bending stiffness (so a twisted state can only be held by geometry, which is the question); one bundle size
for each case; relaxation finds a rest state, not necessarily the lowest. Baked by `kata/twist/bake.mjs`.

**M3. The bench (strength: what is each rope worth?).** Results figure "Method 1" draws the model. A rope is 96
sections long. Each fibre's place is a track of unit links: one continuous filament, or short fibres 40 links long
laid end to end from a random phase. Links share one stiffness and each has its own strength, Weibull with modulus
5. Neighbouring tracks are joined at each section by a frictional interface, elastic (stiffness a quarter of a
link's) until its shear reaches 0.3 times the press between them, then slipping at that force. Both ends are in
jaws. The rope is stretched in 110 steps to 4.5% (7% for braids). At each step the equilibrium is the minimum of a
convex energy (with the friction limits fixed for the step, a stick-then-slip interface has a potential), found by
Newton's method with a banded Cholesky solve and a line search; then any link over its strength is removed, worst
first, and the equilibrium found again. **Acceptance:** a solve counts only if its final step is under 10⁻⁹ of the
stretch; runs that fail are reported and excluded (two of the sensitivity rows). **Sampling:** each rope is pulled
200 times (60 or 40 in the sweeps, as each figure says) with different random strengths and phases; we report the
mean, the spread and the 5th percentile. **Units:** strength in strands, one continuous strand's mean at this
length being 1; weight in strands, counting every sheath, hose, jacket and the extra length of a strand laid at an
angle.

What differs between ropes is who touches whom and the press:

| rope | who touches whom | the press between neighbours |
|---|---|---|
| loose bundle | 13: one and the twelve round it | none |
| twisted yarn | 7: one and six | q × (their mean tension + a laying tension), q measured in M2 |
| yarn on a ribbon | six fibres, each touching only the ribbon | the same law, q measured in M2 with a ribbon core |
| hoops | 13 | constant: a third of the skin's force on a fibre |
| hose | 13, and a fourteenth track, the hose, touching the outer twelve and carrying load | fibre to fibre a third of the skin's force; hose to fibre all of it |
| braid, maypole | 3, or a core and 6; a strand at θ has stiffness cos³θ, strength cosθ, weight 1/cosθ | tan²θ × tension |
| cable | 13 elements with the level below's measured strength distribution, stiffness and weight | as hoops |

The skin's force on a fibre comes from treating a hose τ thick as a pressure vessel stressed to half its strength
(the dial HOOP). **Three numbers are chosen, not measured**: HOOP, the laying tension (5% of a link's strength),
and friction. Section 6 says what was done about that.

**M4. The squeeze, checked three ways.** (a) The vessel formula. (b) A net of springs on an icosphere of up to
10 242 nodes, shrunk onto twelve rigid balls in their packed places and relaxed with the nodes kept outside the
balls; the force on each ball is read against the net's mean tension. The same method on a band round six discs
must give exactly one tension per disc, and does. (c) The same force from the convex hull's area and mean curvature
(Steiner's formula) and the virial of a closed film. Separately, how that force is shared: thirteen balls with
one-sided linear contacts and diameters drawn at random, 200 packings a setting.

## Figures: main text and supplement

Main text, five figures:
1. **The rule and the rope.** Filaments in a hose, four panels (figures.html#hoserope), beside the same bundle in a
   ring, which fails (#ringed).
2. **Twist.** Turns still wound, 3D against 4D (results.html: Method 3), with turns kept against turns given.
3. **The bench.** The model's diagram and one pull (Methods 1 and 2).
4. **Every rope, per weight** (Result 1).
5. **What does braid:** the hose plait, four panels (#hosebraid), beside the ribbon plait that does not (#ribbonbraid).

Supplement: the other nine ropes' drawings; the sheath sweep, the dials, braids by angle, cabling, the tightening
hose (Results 2 to 6); the ribbon threshold and the hosed bundle (Results 9 and 10); the two checks on the squeeze.

## 2. Twist

**Threads shed it.** Seven elastic fibres, one in the middle and six round it, are twisted, clamped and stretched,
by the same code in three dimensions and in four. In three the turns stay and the fibres press on the core. In four
every whole turn leaves through the spare direction, the pressure goes to zero and the energy returns to the
untwisted value (4.7 in both). A half turn stays in both worlds: it cannot be undone with the ends clamped. A twisted staple yarn of threads therefore has no strength in four dimensions: on the bench it
reads 0.00 strands.

**A ribbon core holds it**, if the ribbon is wide enough that a fibre cannot slip round its edge: the threshold lies
between half-widths of 0.1 and 0.2, one to two fibre radii. A hose core should
hold it at any width, because a hose has no edge; that is shown here only for ribbons wound on a hose (section 4).

**A hose round the bundle seems to save one turn, and only one.** Thirteen fibres (one and the twelve that fit round
it in a three-dimensional cross-section) pressed together by a tight hose were given 0 to 4 turns, with three random
seeds. Untwisted they rest at an energy near 56. Given an odd number of turns they never came to rest below 77.
Given an even number they came down to 52 to 56 in six runs of nine and jammed higher in the other three, as high
as 80. So odd and even overlap, and what separates them is the floor under the odd runs, not a clean gap. With no
hose the same thirteen shed everything (8.8 whatever they are given). The reading we offer: a bundle that is held
together turns as a body, and the rotations of its three-dimensional cross-section have a single stubborn loop (the
belt trick; F6), where ours has a two-dimensional cross-section whose rotations wind without limit, **ℤ against
ℤ/2**. That reading predicts the floor. It does not yet explain the jams, and a rig that finds lower states more
reliably is needed before this is a result (Result 10 in results.html).

**Tubes hold it.** Revolve an ordinary twisted yarn and each fibre becomes a tube. Tubes cannot pass one another, and
in the kernel an outer tube cannot be pushed off the yarn in any direction. Fibre that is tubular can be spun. We
have shown this as geometry only (section 6).

## 3. Fastening

**A thread cannot be knotted.** We show the standard fact directly: one strand of a trefoil is lifted into the spare
direction, carried through the place where the other strand is, and set down, with nothing touching; the crossing
has changed and the trefoil is a plain loop. Pushed through without the lift, the strands collide.

**A tube can.** The same trefoil revolved is the spun torus of the knot, and its complement has the trefoil's group
(Winter 2009, after Satoh; E5 and § E). In the kernel the strand that passed freely as a thread is stopped.

**A hitch is a sphere.** The lost knot is often taken to mean nothing can be made fast. But what a hitch does is hold
a line to a post, and a sphere round a post cannot be pulled off sideways, for the reason a sphere-hoop holds a
bundle and a ring does not. A ring through a sphere is a shackle. So the cost of the lost knot is narrower than it
sounds: joining two thread ropes end to end, and stoppers, need hardware or tube rope. Everything else has a
fastening already.

**Borromean links exist, in one mixture.** Two spheres and a ring (Davis, Howards, Newman and Parsley 2011; F3):
with both spheres the ring is stopped every way, and either sphere taken away frees it. Three rings cannot do it.

## 4. Braids and cloth

**Threads do not braid, and neither do flat ribbons.** A ribbon has edges, and in the kernel one ribbon of a plait
slides along its own width past the others and lifts away untouched.

**Hoses braid.** Draw any braid in a half-space and revolve it: every strand is a hose and every crossing is one
hose passing through another. The mathematics is the loop braid group, into which the ordinary braid group embeds
(E1, E6). A plait of three hoses is held in all four directions.

**A braid on a core needs the core to be a hose too.** Six hoses braided round a hose (a maypole) hold each other and
the pole. Round a thread core a ring of hoses leaves the core free along the ring's axis, the same failure as a ring
round a bundle. **Ribbons on a hose** are each held to the hose and not to one another: a served core, where the
over-and-under adds friction only.

**Cloth** is threads woven with ribbons, or sheets with sheets (PRIOR-ART: this is published).

## 5. What the ropes are worth

**Reading the figures.** Every rope lies along the fourth direction. A cross-section (x, y, z at one place along the
rope) shows what it is made of: a thread is a ball, a ribbon a strip, a tube a ring, a hose or a hoop a sphere. The
side view (x, y and the rope's own direction) shows how the parts run. Twelve ropes are drawn: the bundle in a
sphere-hoop and in a ring, filaments in a hose, the woven and the wound sheath, yarn on a ribbon, the cable, the hose
plait and the ribbon plait, the maypole, ribbons on a hose, and the yarn of tubes.

**The bench.** A rope is a bundle of tracks of unit links. Each link has its own strength (Weibull, modulus 5); a
track is one continuous filament or short fibres laid end to end. Neighbours pass load through friction that sticks
and then slips at a limit set by how hard they are pressed together. The rope is stretched in steps to failure and
the equilibrium at each step is the minimum of a convex energy, found by Newton's method. This is the chain-of-bundles
picture with frictional load transfer (A1–A7). What differs between ropes is only the press. Each rope is pulled
200 times; strength is in strands (one continuous strand's mean is 1) and is given per weight, with every sheath,
hose and the extra length of an angled strand weighed.

| rope | per weight | note |
|---|---|---|
| twisted yarn of short threads, 4D | 0.00 | sheds its twist |
| the same in 3D, hard twist | 0.64 | for comparison |
| yarn on a ribbon, hard twist | 0.54 | the ribbon alone is 1.00 |
| thirteen filaments, loose | 0.70 | spread 11%, against a strand's 24% |
| filaments in hoops (best thickness) | 0.86 | 0.79 to 0.95 across the dials |
| short fibres in hoops | 0.70 | |
| **filaments in a hose (best thickness)** | **1.13** | 1.06 to 1.22 across the dials |
| short fibres in a hose | 1.06 | |
| a hose that contracts more than its fibres | 1.15 to 1.25 | Poisson difference 0.2, and 1 |
| seven hoses, loose | 0.73 | spread 15% |
| maypole: a hose core and six braided, 20° | 0.76 | spread 11% |
| plait of three hoses | 0.77 | |
| ribbons on a hose | 0.71 | given no grip on each other |
| rope, cable, great cable (thirteen of each) | 0.84, 0.73, 0.63 | hooped at each level |

What the table says:

- **A hose is the rope.** Filaments in a hose a tenth to a fifth of a fibre's radius thick are the only construction
  that beats a single strand per weight, and they do it at every setting of every chosen number. The hose grips and
  carries load. As pulled live on the page (at a tenth) the same rope reads 1.10, with a spread of 6%; what it can be
  counted on for, the 5th percentile, is 0.98 per weight against a strand's 0.56. Most of what a rope buys is
  reliability.
- **Hoops alone never reach a strand's worth.** They grip and carry nothing.
- **Braiding buys reliability and nothing else.** A maypole is 0.76 against 0.73 for the same hoses loose; the spread
  falls by a quarter. The angle that grips is also the angle that costs.
- **Cabling costs about an eighth a level.** A rope is already uniform and partly hollow, so a jacket round thirteen
  of them is heavy for what it adds. With no twist there is no torque for cabling to balance either. In four
  dimensions a cable is for handling; for strength, make one fat rope.
- **A contracting hose is the best rope and only a little better** unless it is built to contract.

## 6. How far the bench can be trusted

**The squeeze, three ways.** The bench first treated the hose as a round pressure vessel. A taut skin lies on the
outer fibres and runs straight between them. Modelled as a net of springs shrunk onto the bundle, and separately
computed from the convex hull by Steiner's formula (D3), the skin presses 0.81 of the vessel formula's value; the two
agree to three figures. The same method gives the exact answer in three dimensions. The skin's tightest hundredth
carries 2.3 times its mean tension, so a hose stressed to half its strength on average is at its limit in places.

**Who carries it.** An outer fibre shares the skin's force among five contacts, a third each when the fibres are
equal. An earlier version of the bench applied the whole force at every contact, which overstated fibre-to-fibre grip
threefold; the correction took the hose from 1.20 to 1.13 and hoops from 0.99 to 0.86, and it is recorded in the
repository with the numbers before and after. With fibre diameters drawn at random, the total grip on an outer fibre
barely moves, and the grip on the middle fibre scatters widely: such a rope would have a loosely held heart.

**The grip law.** A wound strand presses by its tension times its curvature (B5). Against the bead yarn the law is
within 20% below 20° (worst ratio 0.81) and understates by a factor of 1.4 above.

**Under every version of the squeeze the hose rope reads 1.06–1.11 per weight.**

**Not modelled.** Bending; fibre migration; a hose's bending stiffness; creep of a shrink fit; any difference between
a tube and a thread beyond which braids exist. The tube yarn, the tube knot and the hitch are geometry and cited
theorems; none has been through a mechanical rig. The belt-trick reading of section 2 rests on rest energies, one packing and three seeds, and the odd and even
runs overlap; the packed cluster's symmetries should make some part turns stubborn too (F7), untested.

## 7. What is ours

Not the topology: the rule, the chains, sheet weaving, the loop braid group, the spun torus and the Borromean link
are published, and are cited. Ours, as far as the prior-art pass could tell: the controlled 3D-against-4D twist
experiment and its ribbon and hose variants; the one-turn result for a hosed bundle; the kernel constructions and
tests of each case; the species comparison on one bench with its weight accounting and sensitivity; the taut-skin
correction to the vessel formula; and the reframing. Two forum sources (hi.gher.space, Codidact) could not be read
by the search and may contain some of this.

## Still to do

- Search specifically for the one-turn result (belt trick applied to twisted bundles or filaments in higher
  dimensions) before calling it ours.
- Read the two forum sources by hand. Page-check every reference marked partial.
- The one-turn experiment over packings, sizes and many seeds, with a relaxation that escapes jams (annealing), and a
  test for stubborn part turns. Until then it is a suggestion.
- A rig with tubes, for the tube yarn's grip.
- The bundle-size study (a hose's weight share against fibre count, 13 to 55 to 147).
- Light-background versions of the rope drawings for print. An independent audit.
- Authors as for the atoms paper; where a venue does not accept an AI author, a contribution statement and the PI's
  byline.
