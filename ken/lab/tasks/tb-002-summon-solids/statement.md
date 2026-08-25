# tb-002 · summoning Platonic cells in an anisotropic Voronoi foam

A cell in a Voronoi diagram is the intersection of half-spaces, one per
neighbouring seed. So a cell's faces are the bisectors between it and its
neighbours, and **a face's normal is decided by where the neighbour is**.

That gives a constructive way to summon a regular solid: put a seed at the
centre, and one neighbour in the direction of each of the solid's faces.

## The complication

This foam's metric is **anisotropic**. Vertical distance is weighted by a factor
`aniso` (2.2 in the game, so that grade stays a meaningful discriminator), which
means "distance" is measured under `M = diag(1, aniso, 1)`.

The bisector between the centre and a neighbour is still a plane. Under a
non-identity metric its normal is **not** the direction you placed the neighbour
in. Work out what it is.

## What is wanted

A module exporting three functions.

**`constellation(solid, { centre, r, aniso, rotate })`** — the seed placement.
`solid` is one of `tetrahedron`, `cube`, `octahedron`, `dodecahedron`,
`icosahedron`. `r` is the **inradius**: the perpendicular distance from the
centre to each face plane. `rotate` yaws the whole solid about the vertical
axis. Returns at least `{ solid, centre, neighbours, seeds, extent, r, aniso,
rotate }`, where `seeds` is the centre followed by the neighbours.

**`bisectors({ centre, neighbours }, aniso)`** — for each neighbour, the
bisector plane as `{ normal, distance }`, with `normal` a unit vector and
`distance` measured from the centre. This is the same algebra the engine
performs when it clips a cell, stated once so a summon can be checked rather
than trusted.

**`verify(con, { tolDeg, tolSpread })`** — did the constellation produce the
solid it claimed? Returns `{ ok, maxNormalErrorDeg, distanceSpread, inradius,
faces }`. `ok` is a gate, not a score.

## Two efforts

**A · the placement.** Get the seeds right, for every solid, at any `aniso`, at
any `rotate`, with the inradius the caller asked for.

**B · the checker, and whether it can be trusted.** `verify` decides whether a
summon shipped. A checker that passes bad geometry retires nothing; a checker
that fails good geometry retires a mechanic that was fine, and the retirement
looks like evidence. Both failures are yours to rule out.

## Constraints

- Node ES module. No dependencies, no network, no filesystem.
- Exact geometry. Any tolerance you choose, you must be able to defend.
- An unknown solid name, a non-positive `r`, or a non-positive `aniso` must be
  refused rather than answered.
