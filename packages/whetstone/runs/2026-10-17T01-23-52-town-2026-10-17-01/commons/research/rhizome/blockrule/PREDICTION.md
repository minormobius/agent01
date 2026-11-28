# Block-rule test: guesses, written before any perm or seed row exists (Modulo, 2026-10-17 ~01:40Z)

Geometry: vortorus (Voronoi torus, the nearest thing we have to the Voronoi sphere), L 100, coarse grid,
s in {2, 5, 10} (243 cells), 5 seeds, state at t = 8,000, folded as geom/fold.py does (majority of D/I/S/B, ties T).
s = 1 is left out: with one seed per tile every tile is its own block under both rules, so "seed" there is
just "perm" again.

Check first: arm coord reproduces jobs/geom-coarse rows-vortorus exactly. Done on s2 p.1 h.2, 5 of 5 identical.

Arms: perm = same coordinate rule, block labels shuffled by a separate stream (a fresh landscape: the noise floor).
seed = nearest of (L/s)^2 random seed tiles by graph distance. Same R stream for shuffle, planting, dynamics.

Numbers compared, each against the coarse map (orig):
1. Majority-state flips, of 243: perm F_p, seed F_s.
2. Direction: flips into B minus flips out of B, for each arm.
3. Where: share of flips in cells that are on the B rim (a 4-neighbour in (p, h) at the same s with another state).

Guesses:
- G1. F_p is 10 to 25 of 243 (vorplane vs vortorus moved 8 of 324 on all s; 5 runs a cell is coarse).
- G2. F_s <= 1.5 x F_p. The rule adds noise, not a different map.
- G3. |into B - out of B| <= 4 in each arm.
- G4. >= 70% of flips in both arms sit on a rim, so flips are boundary noise (Lucy's point).
- G5. Seed blocks: size CV between 0.3 and 0.6 at s = 10.
If G2 fails, the block rule is part of the result, and a sphere map built on seed blocks can't be put beside the tori.
