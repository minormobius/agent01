# Rope after the knot: what holds in four dimensions

*Draft 4, 2026-11-16, revised after two reviews of the code and claims, one of them an independent audit. Not submitted. The open items are listed at the end.*

## Abstract

A knotted loop comes undone in four dimensions, and it is often taken to follow that a four-dimensional world
could have no rope, no knots and no cloth. We argue that this overstates the loss. What four dimensions removes is
narrow: one thread can no longer catch on another. Each thing a rope does in our world (holding twist, gripping its
own fibres, braiding, being made fast) fails for thread against thread and returns when one of the two parts is a
surface. We build each case as geometry in a solid-modelling kernel written for four dimensions, test twist in a
frictionless bead-chain simulation run identically in three dimensions and in four, and compare the resulting ropes
per weight in one tensile model. Three results. In a frictionless relaxation a twisted bundle of threads sheds every whole turn in four
dimensions. Confined between a core and a sheath, the same bundle kept one turn and shed two in every run, as the
topology of braids on a sphere would require. And a rope of continuous filaments in a thin closed hose is worth
{{ratioMin}} to {{ratioMax}} times the same filaments loose, per weight, over the rope lengths and fibre scatters
we tried; whether it also beats a single strand depends on both, and on friction. The topology is known and cited. The mechanics and
the comparison are the contribution.

## 1. Introduction

Two things in four dimensions can obstruct each other only if their dimensions add to at least three (general
position; F1). A thread is one-dimensional, so two threads add to two and pass through where each other would be. A
thread and a surface add to three and catch. So a ring falls off a ring and stays on a sphere, and chains, cloth
and bearings have been drawn and simulated on that basis before (G1, G2, G3). The same sources and an older forum
discussion state the consequence for textiles: what weaves and what knots in n dimensions has n − 2 dimensions, so
in four it is a sheet or a tube, not a thread (G3, G6, G7).

Cordage in our world is thread against thread at every scale. Twist holds short fibres in a yarn because each is
wound round the others and pressed on them by its own tension (B5, G4, G5). A knot holds because a strand cannot
pass through a strand. A braid is strands that cannot pass. All three are the same fact, and all three go in four
dimensions. The usual conclusion is that rope goes with them.

This paper asks the engineering question instead: what is the least change that brings each function back, and
what is the resulting rope worth? The answer in every case is one surface. The paper's order is: methods
(section 2); twist, fastening and braiding (section 3); strength per weight (section 4); validation and
sensitivity (section 5).

The parts of a rope have different dimensions, and the argument depends on keeping them apart:

| name | ideal shape | dimension | cross-section along the rope | drawn in the kernel as | what it can do |
|---|---|---|---|---|---|
| thread, filament | a curve | 1 | a point (a ball once thick) | a wire of given radius | carry load; nothing else |
| ribbon | a strip | 2 | a line segment | a thin box | hold a thread wound on it, until the thread reaches an edge |
| tube | circle × line | 2 | a circle (a ring once thick) | a three-dimensional curve revolved, of given wire radius | braid and knot (E1, E8) |
| hose | sphere × line | 3 | a sphere (a shell once thick) | a shell of a 3-ball, extruded, τ thick | enclose a bundle |

A **tube** and a **hose** are different objects, one dimension apart. The loop braid group and the spun torus are
about tubes. A hose does not braid or knot: it is what a bundle goes inside. Boring a hole along a thick
four-dimensional fibre makes a hose, not a tube.

[[fig:1]]

## 2. Methods

Three instruments, each with its own test file. Every number below that comes from a computation is filled into
this text from the data file by the build, and a test fails if the two part.

### 2.1 Geometric tests in the CAD⁴ kernel

CAD⁴ is a solid-modelling kernel for four dimensions, written for this work. A part is a tree of operations that
compiles to a distance function. Two parts *interfere* if a sampled grid finds a point inside both (12 to 20
samples an axis over the overlap of their bounding boxes, with cells proved empty by the distance bound skipped).
A sampled grid can miss a small intersection, so "no interference" is numerical evidence, not a certified clearance.

Two kinds of test are used, and the results say which. A **sweep** translates one part rigidly along a named path
in steps of 0.08 to 0.2 and records whether it interferes at any step; the steps are not always finer than the
thinnest part (wires of radius 0.06), which is a second reason a clean sweep is evidence and not proof. A **push** displaces one part once, by 0.3 (several
times the gap to its neighbours), along an axis and records whether it then interferes. Sweeps were used for the
bundles in a hoop, a ring and a hose, the plaits, the knot and the Borromean link; pushes for the tube yarn, the
maypole and ribbons on a tube, along x, y and z only.

Either test can show that a way out exists. Neither can prove that none does: they try rigid translations along
axes and a few named paths. Where we say a link or knot *holds*, that rests on a cited theorem; where there is no
theorem we say only what was pushed and what it ran into. Constructions made by revolving a three-dimensional
curve (the tube plait, the tube knot, the tube yarn) are the spun surface of that curve (E8).

### 2.2 Bead-chain simulation of twisted yarn

Fibres are chains of {{beads}} beads on springs (stiffness {{ks}}) with a repelling contact (stiffness {{kc}})
between beads of different fibres nearer than two radii (radius 0.1; length 4). Seven fibres, six round one, are
laid as helices of a given number of turns, the ends clamped, the yarn stretched 3%, every free bead displaced at
random by 0.002, and the system relaxed by damped dynamics (step 0.006, damping 0.985 a step) for {{yarnSteps}}
steps. The same code runs with three coordinates or with four; the only difference is one more direction for a
bead to move in.

Measured at rest: the elastic energy; the contact force on the core and on one outer fibre, per length; that
fibre's tension. Variants: the core replaced by a rigid ribbon of a given half-width; and thirteen fibres (one and
the twelve that fit round it) inside a wall, which stands for a hose: a stiff penalty force on any bead whose centre
is beyond a given radius, not a hard bound. The clamped end beads sit at radius 0.212, inside the loosest wall used
(0.215) and outside the tightest (0.19). The hosed
runs are 40 000 steps; one set is annealed (six random kicks of falling size, each followed by a relaxation).

There is no friction and no bending stiffness. So this instrument answers a narrower question than "does a 4D
yarn hold": it shows whether twist is held by geometry alone. Each case is one bundle size. Relaxation finds a rest
state, not necessarily the lowest.

### 2.3 Tensile model

[[fig:3]]

A rope is 96 sections long. Each fibre's place is a track of unit links: one continuous filament, or short fibres
40 links long laid end to end from a random phase. Links share one stiffness and each has its own strength, Weibull
with modulus 5 (A2). Neighbouring tracks are joined at each section by a frictional interface, elastic (stiffness
a quarter of a link's) until its shear reaches 0.3 times the press between them, then slipping at that force. Both
ends are in jaws. This is the chain-of-bundles picture with frictional load transfer (A1–A7).

The rope is stretched in {{benchSteps}} steps to {{benchStrain}} (7% in the braid and sensitivity runs). At each
step the equilibrium is the minimum of a convex incremental energy: with the friction limits and the slips so far
held fixed for the step, a stick-then-slip interface has a potential. It is found by Newton's method with a banded
Cholesky solve and a line search. Then any link over its strength is removed, worst first, and the equilibrium is
found again. A solve is accepted if its final Newton step is under 10⁻⁹ of the stretch, or if the line search can make no
further progress and the forces balance to a millionth of a link's strength; otherwise the pull is reported and
excluded. (The audit found that an earlier version reported a stalled line search as converged. The force
imbalances it measured in those cases were negligible, and the flag is now explicit. In the audit's follow-up run all {{statusPulls}} pulls were
accepted.) A review reimplemented the
solve with a different minimiser and agreed with it to eleven figures on thirteen small ropes.

The loading is in finite steps, which reads a peak a little low: at {{benchSteps}} steps a single strand reads
{{stepLow}} below its value at 1760 steps, and the hose rope's ratio to it moves from {{ref110}} to {{ref1760}}. The
last decimal of every strength here carries that much.

Each rope is pulled {{pulls}} times ({{nSheath}} or {{nGauge}} in the sweeps, as each figure says) with different
random strengths and phases. We report the mean, the spread and the 5th percentile. Strength is in strands: one
continuous strand's mean at the same length and scatter is 1. Weight is in strands, counting every sheath, hose,
jacket and the extra length of a strand laid at an angle.

What differs between ropes is who touches whom, and the press:

| rope | who touches whom | the press between neighbours |
|---|---|---|
| loose bundle | 13: one and the twelve round it (D4) | none |
| twisted yarn | 7: one and six | q × (their mean tension + a laying tension), q measured in 2.2 |
| yarn on a ribbon | six fibres, each touching only the ribbon | the same law, q measured with a ribbon core |
| hoops | 13 | constant: a third of the skin's force on a fibre |
| hose | 13, and a fourteenth track, the hose, touching the outer twelve and carrying load | fibre to fibre a third of the skin's force; hose to fibre all of it |
| braid of strands | 3, or a core and 6; a strand at θ has stiffness cos³θ, strength cosθ, weight 1/cosθ | tan²θ × tension (B5, C2) |
| cable | 13 elements with the level below's measured strength distribution, stiffness and weight | as hoops |

The skin's force on a fibre comes from treating a hose τ thick as a thin pressure vessel (D1) stressed to half its
strength. The hose's own track is given a stiffness and a strength equal to its weight, with a fibre's scatter.

The model has free choices, and sections 4 and 5 vary each, one or two at a time and not over the whole space: the hose's stress and the friction coefficient (which enter
only as a product, so they are one dial); the laying tension of a yarn or braid; the rope's length; the fibres'
scatter; and how much load the hose is allowed to carry.

The bench does not know a tube from a thread. A track is an abstract strand, and each row stands for a
construction only through who touches whom and the press. The hose rows stand for the hose of figure 1. The braid
rows are braids of plain strands: section 3.3 shows that such braids can be made of tubes, and the axial and
contact laws used for them are assumptions carried over from threads, not derived for tubes.

### 2.4 Sheath pressure: three estimates

(a) The vessel formula. (b) A net of springs on an icosphere of up to 10 242 nodes, shrunk onto twelve rigid balls
in their packed places and relaxed with the nodes kept outside the balls; the force on each ball is read against
the net's mean tension. The same method on a band round six discs must give exactly one tension per disc, and
does. (c) The same force from the convex hull's area and mean curvature (Steiner's formula; D3) and the virial of
a closed film. Separately, how that force is shared: thirteen balls with one-sided linear contacts and diameters
drawn at random, 200 packings a setting (D5).

## 3. Results: twist, fastening and braiding

### 3.1 Twist

[[fig:2]]

**Thread yarn.** In three dimensions the turns stay and the fibres press on the core. In four every whole turn
leaves through the spare direction, the pressure goes to zero and the energy returns to the untwisted value
({{after2}} against {{untwisted}}). A half turn stays in both worlds: it cannot be undone with the ends clamped.
With no jiggle the 4D twist stands, so it is an equilibrium, and an unstable one. So, in the frictionless relaxation studied here, whole-turn winding and contact pressure disappear. Assigning
that zero pressure to the staple-yarn row of the bench gives its zero strength: the zero is an input carried over,
not a second experiment. A yarn with friction, bending stiffness or a particular preparation might hold an
unstable twisted state against small disturbances; that needs a coupled experiment we have not done. What is
established is the loss of the geometric trapping.

**Ribbon core.** A ribbon core holds the twist if the ribbon is wide enough that a fibre cannot slip round its
edge: the threshold lies between half-widths of {{ribbonLo}} and {{ribbonHi}}, one to two fibre radii.

**Bundle between a core and a hose: in these runs one turn is kept and two are shed.** Thirteen fibres inside a wall were given
whole numbers of turns, {{nWallSeeds}} seeds each. With the wall where the fibres just touch, every even twist
came to rest at the untwisted energy ({{wEven}}) and every odd twist at {{wOdd}}. With the wall loose, so that
nothing is squeezed, the same: {{wlEven}} for even and {{wlOdd}} for odd. With no wall at all the thirteen shed
everything ({{free13}} whatever they are given).

A second test gives quarter turns, which put the top end back on the packing's own sites, and anneals. If twist is
kept modulo two turns, the rest energy should repeat every two turns and be the same at t and 2 − t; free fibres'
ends differ only modulo one turn. The lowest rest energies over {{nSeeds}} seeds, at 0, ¼, ½, ¾, 1, 1¼, 1½, 1¾ and
2 turns: {{q0}}, {{q025}}, {{q05}}, {{q075}}, {{q1}}, {{q125}}, {{q15}}, {{q175}}, {{q2}}; at 3 and 4 turns,
{{q3}} and {{q4}}. The free fibres repeat every single turn, {{free13}} at each whole turn and {{freeHalf}} at each
half. (This test used a wall tight enough to compress the bundle, where runs sometimes jam above the lowest state:
whole turns there rest at {{wtEven}} when even and {{wtOdd}} when odd. An earlier draft reported that overlap
without the looser walls, and understated the result.)

The reason is known mathematics. The twelve outer fibres are confined to a shell between the core and the wall, so
in each cross-section they are twelve points on a sphere, and their paths along the rope are a braid on the
sphere. In the braid group of the sphere the full twist has order two (H3). Equivalently, a framed curve in four
dimensions has two framings, not a whole number of them, because the rotations of three-dimensional space have a
single non-trivial loop (H1, H2, F6): the belt trick. In three dimensions the corresponding count is a whole
number, and a clamped elastic rod there already has exactly these two classes once it is allowed to pass round its
own ends (H4). We did not find the consequence for a twisted bundle in four dimensions stated anywhere. The evidence here is
rest energies; following the bundle's orientation along its length, and showing that its allowed configurations are
those of a rotating body or a sphere braid, would be stronger.

So a hose does not give a four-dimensional rope twist to grip with: at most one turn in its whole length. This was
shown for one shell of twelve. Bundles of several layers are untested.

**Tube fibres.** Hollow tubes as the threads of four-dimensional textiles are proposed in G1 (whether that means
the tube of our table or a hose we could not check). Revolve an ordinary
twisted yarn and each fibre becomes a tube. In the kernel an outer tube pushed 0.3 along any of the four axes runs
into the others. That is all that was tested: no mechanical simulation has tubes in it.

### 3.2 Fastening

**Knots in thread.** A thread cannot be knotted (F1, F2). The kernel illustrates the one move that matters: a
strand at a crossing of a trefoil is lifted into the spare direction, carried through the place where the other
strand is, and set down, and the sweep finds no interference; pushed through without the lift, the strands collide.
One crossing changed makes a trefoil a plain loop. The model is cut into the moving strand and the rest, with gaps
at the joins, so this is an illustration of a crossing change and not a verified isotopy of a closed knot.

**Knots in tubes.** A tube can be knotted. The same trefoil revolved is the spun torus of the knot, and its
complement has the trefoil's group (E5, E8). In the kernel the strand that passed freely as a thread is stopped (the same cut model, so again an illustration;
the theorem is the evidence).

**A sphere round a post.** In the kernel a bundle of rods inside a sphere-hoop cannot leave it sideways, where
the same rods in a ring can (figure 1). So a sphere round a post is the four-dimensional counterpart of a ring on a
rod: it cannot come off sideways and is free to slide along. That is the geometric core of a hitch. We did not
model a line attached to it, or what stops it sliding. A ring through a sphere is a link of a chain (G1).

**Borromean links.** One explicit construction uses two round spheres and a ring (F3): in the kernel, with both
spheres the ring is stopped along every axis, and with either sphere taken away it slides clear. Three rings
cannot do it (F1). Systems made of spheres alone also exist (F4).

### 3.3 Braids and cloth

[[fig:5]]

**Threads and ribbons.** Threads do not braid, and neither do flat ribbons. A ribbon has edges, and in the kernel
one ribbon of a plait is swept along its own width past the others and lifted away, touching nothing.

**Tubes.** Tubes braid. Draw any braid in a half-space and revolve it: every strand is a tube and every crossing is
one tube passing through another. The mathematics is the loop braid group, into which the ordinary braid group
embeds (E1, E6). In the kernel one tube of a three-tube plait, swept along any of the four axes, runs into the
other two.

**Braid on a core.** Six tubes braided round a seventh (a maypole): each of the six, and the core, pushed 0.3 along
x, y or z runs into the rest. By the same counting that lets a ring of rods fall out of a ring, a ring of tubes
round a thread core should leave the core free along the ring's axis; that case was not built.

**Ribbons on a tube.** Six ribbons wound on a tube: each pushed 0.3 along x, y or z runs into the tube, and one
slides round the tube past its neighbours' edges touching nothing. So the ribbons are held by the tube, as far as
pushes show, and are not held by each other.

**Cloth.** Cloth is threads woven with ribbons, or sheets with sheets, which is published (G3, G6).

## 4. Results: strength per weight

[[fig:4]]

At the model's reference setting (96 sections, Weibull modulus 5), per weight:

| rope | per weight | note |
|---|---|---|
| twisted yarn of short threads, 4D | {{y4}} | given no grip: section 3.1 |
| the same in 3D, hard twist | {{y3hard}} | for comparison; no penalty taken for the fibres' angle |
| yarn on a ribbon, hard twist | {{ribhard}} | the ribbon alone is 1.00; no angle penalty |
| thirteen filaments, loose | {{loose}} | spread {{looseCv}}, against a strand's {{strandCv}} |
| filaments in hoops (best thickness) | {{hoopsBest}} | |
| short fibres in hoops | {{hoopsShort}} | |
| **filaments in a hose (best thickness)** | **{{hoseBest}}** | see the next table |
| short fibres in a hose | {{hoseShort}} | |
| a hose that contracts more than its fibres | {{po02}} to {{po1}} | Poisson difference 0.2, and 1 |
| seven strands, loose | {{loose7}} | spread {{loose7Cv}} |
| a core and six strands braided at {{maypoleAngle}} | {{maypole}} | spread {{maypoleCv}} |
| plait of three strands | {{plait}} | |
| six strands wound on a core, no grip on each other | {{served}} | |
| rope, cable, great cable (thirteen of each, hooped) | {{cable1}}, {{cable2}}, {{cable3}} | |

That table is one setting. The comparison with a single strand depends on two things the reference setting fixes,
because a strand is a weakest-link chain: the longer it is and the more its strength scatters, the weaker it is,
while a rope confines each break to a short stretch. Thirteen filaments, {{nGauge}} pulls, each setting with its
own reference strand:

| rope length (sections), Weibull modulus | loose | hoops | hose | hose ÷ loose |
|---|---|---|---|---|
| 24, modulus 5 | {{l24}} | {{h24}} | {{g24}} | {{r24}} |
| 48, modulus 5 | {{l48}} | {{h48}} | {{g48}} | {{r48}} |
| 96, modulus 5 (the reference) | {{l96}} | {{h96}} | {{g96}} | {{r96}} |
| 192, modulus 5 | {{l192}} | {{h192}} | {{g192}} | {{r192}} |
| 96, modulus 10 | {{lm10}} | {{hm10}} | {{gm10}} | {{rm10}} |
| 96, modulus 20 | {{lm20}} | {{hm20}} | {{gm20}} | {{rm20}} |

- **Hose.** Filaments in a hose are worth more per weight than the same filaments loose at each of these six
  settings, by a factor of {{ratioMin}} to {{ratioMax}}. Against a single strand they range from {{hoseMin}} to {{hoseMax}}: above
  1 for long ropes of scattered fibre, below it for short ropes or uniform fibre. The advantage is load sharing
  round weak spots, and it shrinks as the fibre becomes uniform, because there are fewer weak spots to share round.
- **Reliability.** At the reference setting the hose rope's spread is {{ropeCv}} against a strand's
  {{strandCv}}, and its 5th percentile is {{ropeP5}} per weight against a strand's {{strandP5}}. Most of what a rope
  buys is that it can be counted on.
- **Hoops.** Hoops grip and carry nothing. With uniform fibre they are worth less than the loose bundle: their
  weight costs more than their grip returns.
- **Braids.** A core and six braided strands read {{maypole}} against {{loose7}} for seven strands loose; the
  spread falls from {{loose7Cv}} to {{maypoleCv}}. The angle that grips is also the angle that costs.
- **Cabling.** Thirteen hooped ropes in a jacket, and thirteen of those, read lower per weight at each level
  ({{cable1}}, {{cable2}}, {{cable3}}). This was done with hooped ropes only, at the reference setting.
- **Contracting hose.** A hose with a larger Poisson ratio than its fibres tightens as the rope stretches. A
  difference of 0.2 adds little ({{po0}} to {{po02}}); a sheath built to contract reaches {{po1}}. These figures
  assume the extra hoop stress costs the hose nothing (section 5) and are the least secure in the table.

## 5. Validation and sensitivity

**Hoop load and axial load are not coupled.** This is the model's main gap. The hose is given a prescribed
press on the fibres and, separately, an axial track with a strength; its hoop stress does not enter the test for
its breaking, a break in its track does not reduce the press, and a hose made to tighten gains press at no cost in
axial strength. A weakest-link axial strength with a nominal uniform hoop allowance is not a multiaxial material
model. The pressure estimates below check how large the force is, not whether a skin can sustain it and its axial
load together. So every hose figure is conditional on that independence, and the next paragraph brackets it without
removing it.

**The hose as a load-bearing member.** The hose's advantage over hoops comes mostly from carrying load. As built
its track has strength equal to its weight. Alternatives, at the reference setting: with the size effect a piece
of material that large would have, {{memSize}}; with its axial strength reduced for carrying hoop stress as well
(von Mises, 0.866), {{memVm}}; with its axial strength halved, {{memHalf}}; gripping but carrying almost nothing,
{{memGrip}}; against {{memBuilt}} as built. The order hose, hoops, loose survives all of them. A value above 1
does not.

**Friction and hose stress.** These enter only as a product. Halved and doubled, with the thickness re-tuned, the
hose rope reads {{dialLo}} and {{dialHi}}, and hoops {{hoopsDialLo}} and {{hoopsDialHi}}. With both halved (the
product a quarter), choosing the thickness on one set of sixty seeds by the 5th percentile and reporting it on
sixty others, the hose rope reads {{cornerMean}} ± {{cornerSe}}: below a strand, and {{cornerRatio}} times the loose
bundle. Chosen by the mean instead it reads {{cornerByMean}}. In the earlier sweeps the thickness was chosen and
reported on the same seeds, which flatters a tuned figure by about its standard error. Doubling puts the hose at
its full strength in hoop, so the upper figure is not attainable. The laying tension does not touch the hose; it
moves yarn on a ribbon so much that that rope can be ordered and not quoted (supplement B5).

**Sheath pressure.** A taut skin lies on the outer fibres and runs straight between them. The net of springs and
the hull calculation agree to three figures, and give {{skin}} of the vessel formula's value. The same method gives
the exact answer in three dimensions. The skin's tightest hundredth carries {{skinPeak}} times its mean tension,
so a hose stressed to half its strength on average is at its limit in places.

**Load sharing between contacts.** An outer fibre shares the skin's force among five contacts, a third each when
the fibres are equal. An earlier version of the bench applied the whole force at every contact; the repository
records the correction. With fibre diameters drawn at random the total grip on an outer fibre barely moves and the
grip on the middle fibre scatters widely.

**Grip law.** Against the bead yarn, tension times curvature is within 20% below 20° (worst ratio {{helixLow}}) and
understates by a factor of {{helixHigh}} above, on four twists. The braids were run at the boundary.

**Combined.** Under the taut-skin force and the extremes of load sharing, at the reference setting, the hose rope
reads {{pressLo}} to {{pressHi}}.

**Not modelled.** A multiaxial failure criterion for the hose, and what its damage does to the press (above);
bending; fibre migration; a hose's bending stiffness; creep of a shrink fit; bundles larger than thirteen; any mechanical difference between
a tube and a thread. The tube yarn, the tube knot and the sphere round a post are geometry and cited theorems;
none has been through a mechanical rig.

## 6. Discussion

The lesson is not that four dimensions is hospitable to rope. It is that the textbook fact was the wrong size. "A
knot unties" is a statement about one curve. A rope is a made thing with parts of several shapes, and only the
parts that are curves lose their hold on one another. Give the bundle a skin and the model says it is a rope.
Make the strand a tube and geometry says it can be braided and knotted.

The twist result is the one we would single out. In our world a clamped bundle keeps any number of turns; in these
simulations a four-dimensional bundle confined in a shell kept one, and a bundle not confined kept none. The count
is the one the topology of the cross-section gives, and the simulation was not told it.

The strength comparison is a model's, and its absolute numbers move with choices we could not fix. What it
supports, within the region of fibre scatter and contact strength we tested and under the uncoupled-hose
assumption, is an order (hose, then hoops, then loose) and a mechanism (a skin lets a broken filament carry load
again), not a figure.

**Contribution and prior work.** Not the topology: the dimension rule, chains, sheet weaving, tubes as textile
threads, the loop braid group, the spun torus, the Borromean link and the two framings of a curve in four
dimensions are published and cited. Ours, as far as two prior-art passes could tell: the controlled
three-against-four twist experiment and its ribbon variant; the observation that a confined bundle keeps exactly
one turn; the kernel constructions and tests; the comparison of ropes on one bench with its weight accounting and
its sensitivity; the taut-skin correction to the vessel formula; and the reframing. One forum (G6) was read only
through search-engine summaries.

## Contributions, data and code

Computation, code, analysis and drafting: Claude (Anthropic), working in sessions directed by the PI. Independent
audit: Astra, an auditor instance directed by the PI, which read the paper and code at a pinned commit, ran its own
diagnostics and reported eight findings; and, before it, a second Claude instance given the repository and no
account of how it was made. Both sets of findings changed sections 1 to 5 and are recorded in supplement F with
what was done about each. Direction, judgement and the reframing in the title: minor mobius. No human has audited
the work.

Everything is in one repository, `minormobius/agent01`, under `kata/`: the kernel and parts (`cad4/`), the bead
yarn (`twist/`), the bench and its studies (`pull/`), and this paper with its figure scripts (`papers/r1/`). The
text's numbers are tokens filled from `papers/r1/values.mjs`, which reads the data files; a test fails if the built
paper and the data part. The instruments run in a browser at kata.mino.mobi/cad4, /twist and /pull.

## Supplement

- **A. Rope drawings.** Twelve ropes, four panels each, every panel live on a click: [figures.html](figures.html).
- **B. Methods and results by chart.** Each chart with its method and result: [results.html](results.html).
- **C. References with verification status:** [REFERENCES.md](REFERENCES.md). **D. Prior art:**
  [PRIOR-ART.md](PRIOR-ART.md). **E. The design space and the corrections made along the way:**
  [CONFIGURATIONS.md](CONFIGURATIONS.md). **F. The review and what was done about it:** [REVIEW.md](REVIEW.md).

## Open items

- No human audit.
- The hose's hoop and axial loads are uncoupled in the model (section 5). A multiaxial criterion, and a rule for what
  damage does to the press, would be the most valuable next calculation, with a map of strength and reliability over
  fibre scatter and contact strength in place of the one- and two-parameter cuts here.
- A frictional, loaded test of twisted thread yarn in four dimensions has not been done (section 3.1).
- The kept turn was shown by rest energies for one shell of twelve fibres. Larger bundles, an orientation field, and a
  source for the sphere braid group's full twist read in the original, are owed.
- No mechanical rig has tubes in it, and the laws used for braided strands are carried over from threads.
- Except for the 200-pull samples (three seeds of each re-pulled) and the audit follow-up run, the study data is not
  re-pulled by any test, and it was baked before the solver reported a stalled line search explicitly.
- Tuned figures other than the one in section 5 were chosen and reported on the same seeds.
- The twisted-yarn rows take no penalty for the fibres' angle, where the braid rows do.
- Several references are confirmed to exist and were not read; supplement C says which. The forum sources G6 and G7
  are known only from search summaries.
