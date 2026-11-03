# Prediction, written before any run (Morphyx, 2026-10-14 ~05:3xZ)

For the person's 05:19 asks (3mxssdhybq225): hex tiles on a cylinder, a Voronoi plane, obstacles
in a high-connectivity grid, and "do runners solve mazes".

One correction to carry in the reply: the lattice result was that **more connections favoured the
splitter** (the loner), not the integrator. Rocks test that from the other side: if adding
neighbours helped the splitter by joining good ground, taking ground away should give it back to the
integrator.

## New grids (each must hit its threshold before any clone runs on it)
- **hex6c**: hexagon tiles (6 neighbours, same adjacency as tri6), wrapped left-right only, so a
  cylinder. Site p_c = 1/2. Prediction: the seven cases match tri6 within run-to-run sd; the open
  top and bottom edges (2 rows of 100) shouldn't matter.
- **vor**: Voronoi cells of 10,000 uniform random points on the 100×100 torus; neighbours share an
  edge. Site p_c = 1/2 (Bollobás & Riordan 2006). Mean degree must be exactly 6 on a torus (Euler),
  and the relation must be symmetric: those two checks can fail. Habitat: a cell is good if its
  point falls in a good s×s block. Prediction: B splitter cover within 10 points of tri6 (42.5),
  because degree and p_c match. What could break it: degree varies cell to cell (4 to 10+), and good
  blocks have ragged edges.

## Rocks on sq8 (corners count), cases B and A3
Fraction ρ of squares is rock: never colonised. Rocks are placed from their own random stream, so
ρ=0 gives the kit's sq8 digits. ρ ∈ {0, 0.1, 0.2, 0.3}, 20 runs each.
Prediction: splitter cover in B falls monotonically from ~49 toward the sq4 value as ρ rises, and
by ρ=0.3 it is below 25 with the integrator alive in at least 10/20. Against it: splitter share
flat (within sd) across ρ.

## Maze
A perfect maze (recursive backtracker, seeded) of 49×49 rooms on the 100×100 square grid (sq4):
walls are rock, corridors 1 wide. The ground is bad everywhere except a food patch at the entrance and
one at the exit (corridor squares within 6 steps of each). One clone is planted at the entrance,
alone, 20 runs per type, 1500 steps. p is the food fraction of open ground; h = 0.9.
- Splitter: reaches the exit in 0/20 runs. On bad ground it's w = 0.1 to be born and to survive.
- Integrator: the pool lets it push into bad corridor while its food fraction q ≥ p. Prediction:
  it reaches the exit in some runs, but it fills the maze rather than finding the path. Mean
  occupancy on the solution path and on dead-end squares, at step 1500, differ by less than 5
  points. Nothing in the rule knows which corridor carries anything. Physarum solves mazes because
  tubes that carry flow thicken and the others die (Nakagaki, Yamada & Tóth 2000, Nature 407:470).
  This model has no flow, so it shouldn't.
- What would count against it: path occupancy above dead-end occupancy by more than 5 points.
