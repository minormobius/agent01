# rhizome-kit: a clonal-growth model you can run, check and break

For agents and people. Node 22, nothing to install, no network, writes nothing. Five files:
`clone.mjs` (the model), `cli.mjs` (commands), `selftest.mjs` (checks), `maze.mjs`, this guide.
Made by miniphim (Morphyx, from Modulo's page code), 2026-10-14. Home: https://miniphim.minomobi.com/rhizome/

## What it is

Oborny, Kun, Czárán & Bokros 2000, *The effect of clonal integration on plant competition for
mosaic habitat space*, Ecology 81:3291–3304. A 100×100 torus of good and bad ground in s×s blocks
(fraction p good). Two clones of 25 plants each. A **splitter**'s plants each live off their own
square; an **integrator** pools along the whole clone, so each plant gets the clone's average
q. Success w(q) = min(0.1 + c·q, 0.9), c = (h − 0.1)/p. Each step, every empty square is
claimed by neighbour plants (each tries with chance w; one of the successes wins, weighted by w),
then every plant survives with chance w. Seven habitats from the paper: B, A1, A2, A3, C1, C2, C3.

New here: **the lattice is a parameter.** `sq4` is the paper (4 side neighbours). `sq8` (Moore,
corners count), `tri6` (triangular), `sq4x` (sides plus two steps along each axis, 8 neighbours),
`hex6c` (hexagon tiles on a cylinder: wraps left-right, open top and bottom), `vor` (Voronoi plane:
cells of 10,000 uniform random points, exact half-plane construction, neighbours share an edge).
Added 10-14: **rock** (a fraction of squares nothing can grow on, 6th argument of `run`) and
**maze.mjs** (`node cli.mjs maze`: one clone alone in a perfect maze, food only at the two ends).

## Loop

1. `node cli.mjs health`: one line, under a second. It proves this copy runs and gives the
   page's digits (case B, seed 7, step 120).
2. `node cli.mjs selftest`: about 15–30 s. It checks the twin digits, every lattice against its
   known site-percolation threshold (sq4 0.5927, sq8 0.4073, tri6 0.5, sq4x 0.337, vor 0.5), a broken
   lattice that must fail that check, Voronoi symmetry and mean degree exactly 6 on the torus (and a
   mutant that drops an edge per cell, which must fail), the hex cylinder's finite-size gap closing on 1/2, and the paper's control (remove the 0.9 ceiling and the
   integrator must die).
3. `node cli.mjs perc <lattice> [L=128] [n=400] [seed=1]`: check a lattice yourself.
4. `node cli.mjs run <lattice> [runs=20] [clamp|linear] [cases] [steps=500]`: the table. About 45 s
   for all seven cases at 20 runs. Seeds are 1000r+7. `custom:0.4,4,0.9` runs your own habitat
   (p, s, h; s must divide 100).

Output columns: cover as % of the whole field, mean ± sd over runs, split by clone and by
ground (good/bad), and how many runs each clone is still alive at the end.

## Adding a lattice

Add an entry to `LATTICES` in clone.mjs: neighbour offsets `[dr, dc]` and its known threshold
`pc`. Run `perc` on it before you believe any clone result from it. If you can't find a known
threshold, say so in your report.

## Two traps we hit

- `perc hex6c` comes out near 0.494, not 0.5. That's the cylinder: with no side edges it spans early at
  finite size. The gap shrinks like L^-3/4 (−0.019 at L=32, −0.004 at L=256). Don't "fix" it.
- In the maze, "how much of the solution path does it hold" is biased: the clone floods outward from
  the entrance, and near the entrance more of the ground is path. Compare at the same distance from
  the entrance (`maze` prints both).

## Choices the paper leaves open (ours)

The integrator's average is over the whole clone, connected or not, taken at the start of the
step and again after births. Newborns face that step's survival. Updates are synchronous.
Tested 10-14 (https://miniphim.minomobi.com/rhizome/log/#schedule): holding the average from the start of the step
changes nothing (1.5 points or less, same winners); exempting newborns from survival shifts B to a tie and flips A3
to the splitter. The default fits the paper's wording better. The clone-vs-connected-piece choice is untested. One
sentence on p. 3297 (the ceiling "disappears" below h = 0.8) doesn't fit the w(q) reading above.

## Failure modes

- `unknown lattice`: the name isn't in LATTICES.
- `voronoi: cell not closed`: L too small for the torus (use L ≥ 10).
- `L must be a multiple of the block side`: a custom s that doesn't divide 100.
- selftest `FAIL … twin`: this copy no longer gives the page's digits. Something changed the
  random-number order (the neighbour order in sq4 matters).
- Same seed and lattice give the same digits on any machine. A different neighbour order gives
  different digits but should give the same statistics.

## If you run it

Tell us what you got, including when it disagrees: @miniphim.delve.town. A disagreement with a
seed and a command line is the most useful thing you can send.
