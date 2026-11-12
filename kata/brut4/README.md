# BRUT⁴

A brutalist building generator in four dimensions, with an engineer, and you can walk through what it makes:
[kata.mino.mobi/brut4/](https://kata.mino.mobi/brut4/).

After [BRUT](https://tjs.mino.mobi/brut/) (`tjs/brut`), which grows a concrete building from a seed and then runs a
structural solve over the frame it actually generated. This is that idea one dimension up, and much smaller: one
typology family, four checks.

## The architect (`js/arch.js`)

One seed, one building, for ever (xmur3 → mulberry32 from the seed string; the only unseeded roll is the button that
picks which seed to open).

- **Floors are volumes.** A storey's plate is a block in the three ground directions (x, z, w); y is up. A bay is a
  cube 4 m on a side, a storey 3.6 m, and the columns stand on a 3D lattice.
- **Massing is a stack of tiers:** each a block of whole bays for a number of storeys, each inside the one below and
  stepping back somewhere. Four kinds: ziggurat, tower on a podium, slab, stack.
- **The ground storey stands open** on its columns. Above, each storey is ringed by a wall with a ribbon of window
  cut all the way round, and every tier's roof has a parapet. Where a tier steps back there is a terrace and, on that
  storey only, a doorway on to it.
- **The stair** is in the bay at the origin: two steep ramps a storey, side by side, a landing between, to the roof.
  Every tier keeps that bay and the one beside it along x, where the stair lets you off.

It emits a [CAD⁴](../cad4/) feature tree, so the kernel can draw it, measure it and tell a walker where the concrete
is. Everything repeated (floors, columns, flights) is one shape on a lattice, the kernel's `array` op, so a tower
costs the same to ask about as a hut.

## The engineer (`js/struct.js`)

Units: a floor is a 3-volume, so floor load is newtons per m³ of floor, a column's cross-section is a 3-volume, and
stress is N/m³. The material is concrete's numbers carried over by analogy. That is a consistent fiction; what is
real is how each check scales.

1. **Gravity.** A column takes the floor in its tributary volume: a bay cube, 64 m³ a storey for an inner column. A
   0.5 m column is good for **2 storeys** of that. The same column under a 3D floor (16 m² a storey) is good for 23.
   Load goes up eightfold with the extra direction and the section only by half. So the column is not chosen: it is
   the smallest cube that carries the worst stack, 0.45 to 0.75 m in the buildings so far.
2. **Sway.** A shear building (storey stiffness from the columns, I = c⁵/12 for a cube section; storey mass from
   the floor). The frame is the same along x, z and w, so every mode comes three times.
3. **Wind.** Pressure on a face that is 3D (a storey's height times two widths), storey shears, drift against h/400.
4. **Overturning.** The wind's moment about the base against the weight's.

All 24 seeds in the selftest stand, and each on the smallest column that will: 0.05 m less and gravity fails it.

Not here, and BRUT has all of it: flexure and cores, response spectra, earthquakes, time histories, a foundation,
slab and beam design, and a floor-system choice. No torsion and no P-Δ either.

## Walking it

[HOUSE](../house/)'s walker and CAD⁴'s kernel. You see the 3D slice through your eye; the left pad walks, dragging
looks, the right pad turns you toward the direction you can't see. Things particular to this page:

- **Ghost columns.** Columns stand on lattice planes, so a slice between two rows of them shows a building standing
  on nothing. The columns just out of your slice, up to half a bay ana or kata, are drawn as faint teal or rose
  ghosts.
- **The map** shows each tier's footprint in the ground's three directions, the stair's bay in red, and you.
- **engineer** opens the report.

Two things the geometry had to get right for a walker, both because a boolean's distance is only a lower bound:
floors are built from solid blocks round the stair well, not as a plate with a hole cut in it (the cut's gradient
points the wrong way at the hole's edge, and stopped the bot at the top of every stair); and doorways are cut only
on the storey that meets a terrace.

There are no railings. The stair well is open.

## Test

```bash
node kata/brut4/test/brut4.selftest.mjs   # ~12 s, 7 checks
```
