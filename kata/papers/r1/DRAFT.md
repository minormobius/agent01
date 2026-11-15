# Rope after the knot: what holds in four dimensions

**Draft 1, 2026-11-15. Not submitted, not audited.** Every bench number below is recomputed from the baked data by
`test/ledger.selftest.mjs`, which fails if the text and the data part. The TWIST numbers are held by TWIST's selftest
but are not yet baked into a data file. Sources and how far each was checked: [REFERENCES.md](REFERENCES.md). What is
ours and what is not: [PRIOR-ART.md](PRIOR-ART.md). Open items are listed at the end and are part of the draft.

**Figures: [figures.html](figures.html)** (also at kata.mino.mobi/papers/r1/figures.html). Every rope drawn three
ways by CAD⁴: two cross-sections along the rope and one side view. They are meant to be read first.

## Summary

"Knots come undone in four dimensions" is true and is usually heard as "so there is no rope there". The second does
not follow. What four dimensions takes away is narrow: one thread cannot catch on another. Every job a rope does in
our world depends on that somewhere (twist holds fibres, knots hold ends, braids hold strands), so every one fails for
thread on thread. But each comes back the moment one of the two parts is a surface: a ribbon, a hoop that is a
sphere, a tube. We build each case as geometry, test it in a solid-modelling kernel written for the purpose, and
price the resulting ropes on one tensile bench.

The ropes that work are not exotic. The strongest per weight is continuous filaments in a thin closed hose. One
result is particular to four dimensions: a bundle held together keeps exactly one turn of twist, where ours keeps
every turn. We have not yet searched the literature for it specifically.

## 1. The rule

Two things in four dimensions can obstruct each other only if their dimensions add to at least three. A thread is
one-dimensional, so thread and thread add to two: they pass. A thread and a surface add to three: they catch. This is
standard (general position; F1 in the references), and the ring-and-sphere chain that follows from it has been drawn
and simulated before (PRIOR-ART: Hqak). We use it as the spine and claim none of it.

What it predicts for cordage, case by case, is the content of sections 2 to 4.

## 2. Twist

**Threads shed it.** Seven elastic fibres, one in the middle and six round it, are twisted, clamped and stretched,
by the same code in three dimensions and in four. In three the turns stay and the fibres press on the core. In four
every whole turn leaves through the spare direction, the pressure goes to zero and the energy returns to the
untwisted value. A twisted staple yarn of threads therefore has no strength in four dimensions: on the bench it
reads 0.00 strands.

**A ribbon core holds it**, if the ribbon is wide enough that a fibre cannot slip round its edge. A hose core should
hold it at any width, because a hose has no edge; that is shown here only for ribbons wound on a hose (section 4).

**A hose round the bundle saves one turn, and only one.** Thirteen fibres (one and the twelve that fit round it in a
three-dimensional cross-section) pressed together by a tight hose keep an odd turn and shed an even one: started with
one, two, three or four turns, they come to rest at energies of 83, 52, 83 and 64, against 56 untwisted. A bundle
that is held together turns as a body, and the rotations of its three-dimensional cross-section have a single
stubborn loop (the belt trick; F6). Ours has a two-dimensional cross-section, whose rotations wind without limit.
That is the difference between a world that can spin yarn and one that cannot, in one sentence: **ℤ against ℤ/2.**

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
theorems; none has been through a mechanical rig. The belt-trick reading of section 2 rests on rest energies and one
packing; the packed cluster's symmetries should make some part turns stubborn too (F7), untested.

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
- Bake TWIST's numbers and add them to the ledger; repeat the one-turn experiment over packings, sizes and seeds,
  and test for stubborn part turns.
- A rig with tubes, for the tube yarn's grip.
- The bundle-size study (a hose's weight share against fibre count, 13 to 55 to 147).
- Figures of the bench (a rope under load, force curves, the distributions) and of the twist experiment; the rope
  figures exist (`figures.mjs`). An independent audit.
- Authors as for the atoms paper; where a venue does not accept an AI author, a contribution statement and the PI's
  byline.
