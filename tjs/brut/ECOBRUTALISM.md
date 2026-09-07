# Ecobrutalism — the course

*The design record for planting in `/brut`. What it is, what it demands of the
generator, what gets built in what order, and what would tell us it is wrong.*

---

## The position

Ecobrutalism is not concrete with plants photographed in front of it. The
photographs are the symptom; the idea underneath is that **the planting is a
participant** — it carries load, it takes wind, it holds water, it shades, and
the building has to be designed around all four. Béton brut and a canopy are a
good pairing precisely because the frame is heavy enough to carry a metre of wet
soil, and because a raw concrete soffit is the one surface that improves when
something grows over it.

The lineage is older than the hashtag. Roberto Burle Marx planting for Niemeyer
and Costa; Charles Correa's Kanchanjunga; **Ken Yeang**, who wrote the theory of
the bioclimatic tower in the eighties and drew the vertical landscape as a
continuous ramp of soil; WOHA in Singapore, where the greenery is the facade's
environmental system and not its decoration; and **Stefano Boeri's Bosco
Verticale**, which is the honest test case because it is the one where the
engineering is published. Nine hundred trees at up to 110 m. Every one of them
root-anchored in a steel cage, every planter designed for saturated soil, and
the whole facade wind-tunnel-tested with the trees on it — because a tree that
comes off the twentieth floor is not a landscaping problem.

So the position this surface takes is the same one it takes everywhere else:

> **A system is only real if it is drawn AND modelled AND changes a number.**

A plant that does not change a number is a garnish, and this repo does not do
garnishes. Which is convenient, because plants change a lot of numbers.

---

## What planting actually costs

This is the argument for doing it properly, and it is one line:

| | load |
|---|---|
| an office floor's live load (ASCE 7-16) | **2.4 kPa** |
| a 150 mm sedum roof, saturated | **~2.4 kPa** |
| a 600 mm shrub bed, saturated | **~10 kPa** |
| a **1 m planter**, saturated | **~16 kPa** |
| a 1.5 m tree pit, saturated, plus the tree | **~26 kPa** |

A metre of wet soil is **seven times** an office floor's live load. Planting is
not a finish applied at the end; it is the governing load case for the slab it
sits on, and on Bosco Verticale it is what sized the structure. The moment
`/brut` can put a tree on a terrace, `struct.js` has to be told — and that is
the whole reason this is worth building rather than drawing.

And there are three more numbers behind it:

- **Wind.** A canopy has a drag area, and at 100 m the design gust is not a
  breeze. But a tree is not a rigid bluff body: the crown *reconfigures* —
  leaves furl, branches bend downwind, the frontal area collapses — so drag
  grows more slowly than U². Vogel's exponent Ψ (≈ −0.6 to −1.2 in leaf) makes
  F ∝ U^(2+Ψ), and ignoring it overestimates the load on a big crown by a
  factor of two or more. Deciduous species lose it in winter, which is when the
  design gust usually arrives, so the two load cases are genuinely different.
- **Water.** A green roof retains 50–90 % of a rainfall event depending on
  depth, which is the actual civic reason cities subsidise them. Irrigation is a
  riser, a tank and a pump — three things that have to be somewhere in the core.
- **Soil depth decides what can grow, full stop.** This is the hard planning
  constraint and it is a ladder, exactly like the foundation ladder: 150 mm is
  sedum and nothing else; a tree needs a metre and prefers 1.5. Every
  architectural drawing of a "green roof" with trees on 200 mm of substrate is
  a drawing of dead trees.

---

## What it demands of the generator

Four couplings, in the order they bind:

1. **The parti already says where.** Terraces, setbacks, the cloister court, the
   undercroft, the atrium, and the balcony module in the facade rhythm are all
   places the plan has *already* declared. Planting does not need a new siting
   stage — it needs to read `parti.js` the way the stairs do. A ziggurat massing
   is the ecobrutalist form par excellence and this generator already makes one.
2. **The structure PAYS for the depth — it does not permit it.** This is the
   coupling that was easiest to get backwards, and the first draft of this
   document had it backwards. Clipping the substrate to what the slab already
   takes gives a generator in which planting can never be the reason anything
   fails, which makes the whole exercise decorative. The ambition is set by what
   the place is; the load goes into the model; the solver decides. What DOES run
   downward is the ladder from depth to palette: 150 mm is sedum and nothing
   else, whatever anybody wanted.
3. **The building shapes the tree.** A tree under a soffit grows lopsided; one
   against a facade grows outward toward the light; one in a corner planter
   fills a quadrant. The growth model has to take an ENVELOPE, and the envelope
   is what the architecture hands it. That is the coupling that makes this
   procgen rather than instancing a tree asset.
4. **The tree loads the building back.** Dead load, wind, and an anchorage
   check — and on a tall building the anchorage is the interesting one.

---

## The phases

### Phase 1 — `brut/plant.js`, the botany kernel · **BUILT**

Procgen plants from a growth model that is also a structural model, which is the
whole trick:

- **Space colonization** (Runions et al., 2007) for the branching. Scatter
  attractors through a crown envelope, grow toward them, kill them as they are
  reached. It produces genuinely tree-like crowns, it is deterministic under a
  seeded RNG, and — the point — it takes the envelope as an argument, so the
  building can shape the tree.
- **The pipe model** (Shinozaki, 1964; "Leonardo's rule") for the radii.
  Cross-sectional area is conserved through a branch point:
  `d_parent^n = Σ d_child^n`, n ≈ 2–2.5. This gives taper for free, and it is
  simultaneously the botanical rule and the structural one — the branch is sized
  by what it has to carry, which is why the same equation does both jobs.
- **Allometry** for the dimensions that have to be right: height from DBH,
  crown spread from DBH, and above-ground biomass from Chave's 2014 pantropical
  equation `AGB = 0.0673·(ρ·D²·H)^0.976`. That last one is where the LOAD comes
  from, so it is the one that matters most and the one the selftest pins.
- **Vogel reconfiguration** for the drag, so the wind load is the one a tree
  actually applies rather than the one a signboard would.
- **The soil ladder**, depth → palette → saturated load, run downward from what
  the slab will take.

Checked against closed form: the pipe model's area conservation at every branch
point, the allometric round trip, Chave against a hand-computed case, and the
drag against both its rigid limit and its measured reconfiguration ratio.

### Phase 2 — where it goes · **BUILT**

`placePlanting`, reading the same parti the stairs and the lifts read. The
sites need no siting stage of their own because the massing already made them:
`roofDecks()` computes exactly the part of each plate the level above does not
stand on, which is simultaneously where the roof slab goes and where anything
can be planted. Setbacks become terraces, the top becomes a green roof, a parti
terrace becomes a garden, a cloister's void becomes a court, and an undercroft
becomes a grove.

**Corrected from the original plan:** the depth is NOT clipped to what the slab
currently takes. That was written above as coupling 2 and it is the wrong way
round — a green roof is not *permitted* by a slab, it is *paid for* by one. So
the ambition is set by what the place IS, the load goes into the structural
model, and the solver says whether the payment worked. Clipping it the other way
would have produced a generator that quietly shaves the substrate until nothing
is ever heavy enough to fail, which is precisely the "garnish" failure the kill
criteria exist to catch.

**Not built:** planting on the balcony rhythm. The facade bays are a separate
geometry from the plates, and a balcony planter is a different structural
problem — a cantilever rather than a slab — so it wants its own pass.

### Phase 3 — the consequences · **BUILT**

The part that makes it real rather than pretty:

- `struct.js` takes saturated soil as **dead** load (it is permanently there)
  plus the tree's own fresh mass, and a **wind** load on the crown using the
  reconfigured drag at the design gust.
- A new check family: the slab under a wet planter; the tree's anchorage against
  the design gust and its overturning moment about the root ball; drainage and
  the retained-water case; and whether the species chosen can survive the
  exposure at that height, because it cannot above a certain wind speed.
- The schedule gains m² of planting, tree count by species, substrate volume,
  saturated tonnage and litres of irrigation demand.

### Phase 4 — drawing and rendering · **BUILT**

The plan symbol every landscape drawing uses (the circle, the canopy hatch, the
centre cross, the spread dimension), the trees in elevation and section, and the
canopy in the bench — with the deciduous ones able to drop their leaves, because
the winter case is a different load case and the drawing should say so.

**Where the drawing work actually went.** Plan was the easy half and it is also
the half that never justified the species list: every species makes the same
circle. Elevation is where the habit shows, and getting there turned up four
things worth writing down.

- **What a tree IS on a sheet depends on the sheet's scale.** `treeGlyph` has
  three tiers — a stick and a blob, the filled habit silhouette, the projected
  skeleton — chosen by how big the tree lands on *that* drawing. Projecting the
  full skeleton at every size drew a forty-pixel tree as three hundred radiating
  hairs under a scatter of dots: a firework. No drawing office has ever done
  that, because at 1:500 a tree is a symbol and at 1:100 it is a drawing.
- **The tier test has to read the spread, not just the height.** A climber is
  twelve metres of plant in 1.26 m of width, so height alone sent it to the full
  skeleton and drew a green wall as a single bare wiggling line.
- **A crown is a solid of revolution, not a ball.** `foliage()` took the crown
  surface as 4πr², which is only true for `domed`. Every tall narrow habit came
  out with a tenth of the leaves it needs — on the sheet *and in the bench*.
  The habit already carries its profile; integrating it is exact enough and
  costs nothing.
- **Two outlines, meaning two different things.** The dashed line is the design
  envelope at mature spread — what a landscape architect dimensions. The solid
  mass is the tree that actually grew inside whatever envelope the architecture
  handed it. Where the building clipped the crown the two pull apart, and that
  gap is coupling 3 made visible on a sheet. One outline would have hidden it.

And the section, which is the drawing this whole subsystem exists for, because
it is where the substrate depth, the drainage layer and the roots become
visible — the three things the slab is being asked to carry. It carries **two**
root geometries and they are not interchangeable:

| | what it answers | shape |
|---|---|---|
| **root ball**, ANSI Z60.1 off the caliper | can it be *installed*? | ~11 ball-diameters per trunk diameter, dug 60 % as deep as wide |
| **root plate**, clipped to its planter | can it *stand*? | wide and shallow — ~90 % of root mass in the top 600 mm |

Running the nursery rule on a mature trunk claims a fifteen-metre plane arrives
on a ball nearly three metres deep, which no plane has ever done. The plate is
what takes the overturning moment, and on a planter it runs out of room
sideways long before it runs out of room down — which is what `confined` says.

### Phase 5 — the whole-building case

The interesting synthesis, and the reason to do the rest: **an ecobrutalist
building is a different building, not a planted one.** The floor system has to
be heavier, so the seismic mass goes up, so the period changes, so the base
shear changes. The setbacks want to be deeper to hold soil. The core carries an
irrigation riser and a tank. Deciduous planting means two wind load cases. At
that point the parti gains a ninth meme — the **hanging garden** — and the
generator can take a position that is about the planting rather than about the
plan.

---

## What would tell us this is wrong

Kill criteria, stated up front so they are not negotiated later:

- **If the planting never changes the governing check**, it is a garnish and
  should be deleted rather than kept for the render. The test is whether a
  planted terrace ever becomes the reason a slab or a column fails.
- **If the growth model has to be tuned per species to look right**, it is not a
  model, it is a spline with extra steps — and the honest move is to say so and
  ship an asset library instead.
- **If the trees cost more frame time than the building**, the bench stops being
  usable, and a canopy nobody can orbit is worth less than no canopy.

  *Measured, after the fuller crowns landed* (mean over eight seeds): `generate`
  goes 3.6 ms → 20.8 ms and the part count 4,056 → 11,391. So by both measures
  the planting IS more than the building — but the cost is `grow()`, not the
  foliage (0.5 ms a plant against 0.17), it is paid once per parameter change
  rather than per frame, and the blobs land in a single `InstancedMesh` at 20
  triangles each. The criterion is about frame time and frame time is unmoved;
  if that ever stops being true the honest lever is `PLANT_BUDGET`, not thinner
  crowns. In the drawing office the same appetite had to be capped for real: the
  first version emitted a 513 KB SVG for one elevation, and the tiers plus a
  visibility-based stroke budget brought a five-drawing sheet to 1.4–3.5× the
  bare sheet.
- **If the soil ladder ever produces a tree on 200 mm**, the coupling has been
  inverted somewhere and the whole point has been lost.

---

## Notes for whoever picks this up

- The growth model is deterministic and salted (`Rand(seed, 'plant')`), so a
  tree is part of the permalink. Changing the growth code changes every existing
  planted permalink — the same hazard the facade grammar has, and the same
  discipline applies.
- **A species is data, not code.** Adding one should be a row in `SPECIES`, and
  if it needs a new branch in `grow()` the model is wrong.
- The envelope is the coupling. Resist the temptation to grow a tree in free
  space and then scale it to fit — that is instancing with extra steps, and the
  lopsided tree under the soffit is the entire reason to do this properly.
