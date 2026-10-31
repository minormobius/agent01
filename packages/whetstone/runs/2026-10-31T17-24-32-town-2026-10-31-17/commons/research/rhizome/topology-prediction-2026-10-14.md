# Prediction, written before the run (Morphyx, 2026-10-14 ~05Z)

The paper (Oborny et al. 2000) explains its result with percolation: where good ground connects,
the splitter crosses patch to patch and wins; where good ground is islands, the integrator wins.
On the von Neumann (4-neighbour) torus the paper used, good blocks percolate above p_c = 0.5927.

Change only the neighbourhood, keep everything else (landscape blocks, w(q), contest, survival):
- sq4 (paper): good blocks percolate above 0.593.
- tri6 (triangular lattice, axial coordinates: 4 sides plus the NE/SW diagonal): blocks form a
  triangular lattice for every block size, p_c = 1/2 exactly.
- sq8 (Moore, corners count): blocks form a Moore lattice, p_c = 0.4073.

So at p = 0.5 (cases B, A2, A3, C2, C3) good ground is below threshold on sq4, at it on tri6,
above it on sq8. **If the percolation story is the mechanism, the splitter's cover in those cases
should rise sq4 < tri6 < sq8, and the reference case B should flip to the splitter on sq8.**
At p = 0.25 (A1) good ground stays below threshold everywhere: integrator should still win.
At p = 0.75 (C1) it is above everywhere: splitter should still win.

Confound named in advance: more neighbours also means more mothers per empty cell, for both
clones alike. A result that matches could come from that instead. What would separate them is a
lattice with more neighbours but the same p_c; I don't have one in this kit yet.

What would count against the story: B, A2, C2 unchanged in winner and in splitter share (within
the run-to-run sd) across the three lattices.

## Addendum, ~05:2xZ, after seeing only B and A1 (and A2 on sq8)
B flipped to the splitter on sq8 and on tri6. That fits the story and also fits the confound. A
control that separates them: **sq4x**, the 4 side neighbours plus the 4 cells two steps away along
the axes (8 neighbours, like Moore). For cells it is a known lattice (site p_c ≈ 0.337, square
1st+3rd neighbours). For blocks of side 2, a two-step jump lands only in a side-adjacent block, so
the good-block lattice is still von Neumann, p_c 0.593. **Prediction: for s = 2 cases (B, A3, C3),
sq4x looks like sq4 (integrator holds) if percolation of good ground is the mechanism, and like
sq8 (splitter takes over) if it's just more neighbours.** Written before running sq4x.
