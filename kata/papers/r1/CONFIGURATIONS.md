# Paper R1 — the design space

**Opened 2026-11-13 at the PI's direction: if we are spending time on rope, think more widely about what a rope can
be, and extend to cabling.** This is the map. Each configuration says where its grip comes from, what has been
tested and how, and what is open. Nothing here is claimed in the paper until it has a test.

**To see them:** every configuration with a geometry is a part in CAD⁴ (kata.mino.mobi/cad4/): `#hoop`, `#ringed`,
`#rope` (woven sheath), `#hoserope`, `#ribbonyarn`, `#wound`, `#cable`, `#spinneret`. The bias sheath has none: nobody
knows how to draw one.

## Braids (added 2026-11-13)

Threads do not braid in 4D (they pass each other), and flat ribbons do not either: a ribbon has edges, and the kernel
shows one sliding off along its width and lifting away untouched (CAD⁴ `#ribbonbraid`). A hose has no edge. In a
cross-section it is a loop, and a loop can pass through a loop, so hoses braid (`#hosebraid`: held in all four
directions). Construction: draw a 3D braid in the half-plane of (radius, one more direction) along the length and
revolve it. Every 3D braid gives a hose braid; hoses also have a move threads lack (swapping without threading). The
mathematics is the loop braid group, which is published; look it up before claiming anything here. A braid round a core works when the core is a hose too (`#maypole`: six hoses round a hose pole, every hose and the
pole held). Round a thread core it cannot: a ring of hoses leaves the thread free along the ring's axis, the ringed
bundle's failure again. So the braided sleeve belongs on hose-cored rope. Ribbons wound on a hose core (`#ribbonpole`) are held to the core, each one, by topology: the core has no edge, so the
winding cannot be undone (compare yarn on a ribbon, where the fibre slides off the ribbon's edge). They are not held to
each other: one slides round the core past its neighbours' edges. So a ribbon-served hose is a sound wrap whose
over-and-under adds only friction. What matters is that the core has no edge, not that the wrapping has none.
Whether tilted hoops passing over and under
each other can close a sphere round a thread bundle is the bias-sheath question above, still open. Open: whether a
hose braid grips a core under tension the way a 3D braided sleeve does, which is a bench question for PULL.

**Pulled (PULL README § Braids, 200 pulls each).** Braiding hoses buys reliability, not strength per weight: a maypole
at 20–30° is 0.72–0.76 per weight against 0.73 loose, with the spread down from 15% to 9% and the 5th percentile up
from 0.54 to 0.62. Best angle near 20°; by 40° the angle costs more than the grip gives. A hose round filaments
(1.13 with its weight) beats any braid here. Ribbons on a hose, given no grip on each other, read 4–6% under the maypole.

## What a rope is made of

Four choices, mostly independent.

| choice | options |
|---|---|
| **element** | a fibre (1D); a ribbon (2D); a hose (a closed skin, S² × length) |
| **length** | short (staple), which needs grip to carry anything; continuous (filament), which doesn't |
| **grip** (what presses neighbours together) | twist round a ribbon; a fixed squeeze (hoops, a hose, a wound sheath); a squeeze that grows with load (a bias sheath); glue; nothing |
| **hierarchy** | one level (a rope); ropes in a sheath (a cable); cables in a sheath |

One rule decides most of it: two things obstruct each other in four dimensions only if their dimensions add to at
least three. Fibre on fibre is two. So every grip here involves something two-dimensional.

## Grips

| grip | grows with load? | tested | finding |
|---|---|---|---|
| twist round nothing | n/a | TWIST, PULL | none: every whole turn leaves; a staple yarn has zero strength |
| twist round a ribbon | yes | TWIST (rigid ribbon), PULL | holds if the ribbon is wide enough; about half our grip per pull; 0.54 per material against the ribbon alone's 1.00 |
| hoops (spheres) | no | CAD⁴ (holds a bundle), PULL (a dial), sheath study | best about 0.1 fibre radii thick: 0.86 per material, weight counted |
| a hose | no | CAD⁴ spinneret, sheath study | 1.13 per material: it grips and carries load |
| a wound sheath: three ribbons round the bundle in three perpendicular planes | no | CAD⁴ kernel (this note) | **closes** the bundle once each ribbon is about half the bundle's radius wide; at 0.4 it leaves the eight corners open. A sheath made by winding, with no spinneret. Its grip is untested |
| a bias sheath (a finger trap) | yes | PULL, as a law only (`trap`) | 1.09 per material at 55°, between hoops (0.86) and a hose (1.13); better than either when thin; holds short fibres. **Whether one can be made is open:** a bias weave is a field of directions on the cross-section's sphere, and a sphere cannot be combed |
| glue (a matrix between fibres) | no | not tested | works in any dimension; the baseline that makes all of this unnecessary, at the price of a rope that can't flex. To be named in the paper, not studied |

## Cross-sections

A 4D bundle's cross-section is 3D. Tested: thirteen (one and the twelve that fit round it, each touching four
others) and, for TWIST, seven (our hexagon, placed in 4D). Untested and worth a look: the next shell (the fibres at
distance 2 and √3… round the thirteen), and whether the bundle should be a ball at all: a ribbon-cored yarn is flat.

## Cabling

Ropes in a sheath, then cables in a sheath. Similar to a rope, not the same:

- **The elements are already uniform.** A fibre's strength spreads 24%; a rope's about 7%. Bundling pays by
  averaging over weak spots, so there is less left to buy.
- **An element is partly hollow.** Thirteen fibres fill a section that would hold twenty-seven. A sheath round
  thirteen ropes is thicker in absolute terms, so it is heavier for the same relative thickness, and presses harder
  per unit of the element's stiffness.
- **A broken rope is not gone.** It keeps a frictional plateau. The bench breaks links cleanly, so its cabling
  figures are the pessimistic case.
- **In our world cabling also fights untwisting:** each level is laid the opposite way to the last, so the levels'
  torques cancel. In 4D, with no twist, there is nothing to cancel, and a cable is just a bundle of bundles.

**Result** (`kata/pull/cable.mjs`, PULL's README): cabling buys no strength per weight. Best per material goes
0.84 (rope), 0.73 (cable of thirteen ropes), 0.63 (cable of thirteen cables): about an eighth lost a level, and the
best sheath gets thinner each level until it is none. For strength, one fat rope; a cable is for handling, bending
and redundancy. The bench is pessimistic here (a broken rope carries nothing).

## Open, in rough order of what would change the paper

1. Can a bias sheath be made round a sphere's worth of directions? If yes, it is probably the best rope here.
2. The hoop's and the hose's press as a function of load, measured in an elastic rig (the bench assumes it).
3. A ribbon that can bend and crumple (TWIST's is rigid).
4. Does a wound sheath grip, and can its three ribbons be kept from sliding off each other?
5. The next shell of the cross-section, and flat ropes.

## Correction, 2026-11-13: the squeeze from fibre to fibre

Working the hose's press out by hand, before building a rig to measure it, showed the bench had been using the skin's
whole force on an outer fibre at every fibre-to-fibre contact. With equal contacts each carries a third of it in 4D
(one inward and four at 60°; checked with a thirteen-ball packing) and a half in 3D. Every sheath, cabling and
bias-sheath number above was re-run with that fixed, and the species table's hoop and hose rows were redefined as
sheaths of stated thickness with their weight counted. What changed: the hose 1.20 → 1.13; hoops 0.99 → 0.86, so
hoops no longer match a single strand per weight; cabling costs an eighth a level, not a tenth. What did not: the
order of everything.
