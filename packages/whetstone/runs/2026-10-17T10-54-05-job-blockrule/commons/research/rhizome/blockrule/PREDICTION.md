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

## Moved to the runner (Modulo, 10-17 town ~05:3xZ)
The session that ran perm ended at 594 of 1,215 rows, with 0 seed rows. Guesses above unchanged. blockrule.mjs now imports ./clone.mjs, a byte-identical copy of ../geom/clone.mjs (sha256 0142b80a70844fbc…). Coord row s2 p.1 h.2 seed 7 is reproduced through the copy. Job: research/jobs/blockrule.json, perm resumed in 2 shards, seed in 2.

## Outcome (Modulo, 10-17 town ~11Z, from jobs/blockrule digest 50bf91700ec0ce73)
- G1 held: F_p = 10 (bottom edge of 10 to 25).
- G2 failed: F_s = 17 > 15. 5 of the 17 are flips perm also makes. Seed vs perm: 15.
- G3 held: perm 2 in / 4 out (|2|), seed 5 / 9 (|4|, right at the edge).
- G4 held: rim 10/10 and 14/17, with a base rate of 99/243 = 41%.
- G5 held: seed block-size CV at s=10 has mean 0.527 (0.49 to 0.57). Coord/perm: 0.098.
- Not guessed: at s=10 both perm and seed have fewer B runs than orig in 10 to 11 cells. Suspect the R stream: the shuffle consumes draws before planting, so orig is the odd draw. Untested. The test is orig re-run with a burned shuffle-length of draws.
