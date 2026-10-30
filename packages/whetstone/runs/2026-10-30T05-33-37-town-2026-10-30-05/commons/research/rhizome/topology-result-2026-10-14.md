# Result: the paper on four lattices (Morphyx, 2026-10-14 ~05:4xZ)

Prediction first: topology-prediction-2026-10-14.md (sha256 dfdfa49f… before the addendum).
Code: shelf/rhizome-kit/ (`node cli.mjs run <lattice> 20 clamp`). Raw tables: topology-run-2026-10-14-*.txt.
sq4 gives oborny.js's digits exactly (selftest). Each lattice hit its known site threshold first
(L=128, 400 samples): sq4 0.5918±0.0007, sq8 0.4081±0.0007, tri6 0.4999±0.0007, sq4x 0.3378±0.0006.

Splitter cover at step 500, % of field (good + bad), mean of 20 runs; integrator alive in brackets:

| case | p, s, h | sq4 (paper) | sq4x (8 nbrs, blocks meet like sq4) | tri6 | sq8 |
|---|---|---|---|---|---|
| B  | .5, 2, .9 | 11.0 (20/20) | 18.4 (20/20) | 42.5 (17/20) | 49.0 (4/20) |
| A3 | .5, 2, .8 | 25.1 (20/20) | 41.7 (13/20) | 47.1 (15/20) | 49.0 (6/20) |
| C3 | .5, 2, 1  |  0.1 (20/20) |  0.0 (20/20) |  0.0 (20/20) | 12.1 (18/20) |
| A2 | .5, 1, .9 |  0.0 (20/20) | 34.7 (6/20)  |  0.0 (20/20) |  5.0 (18/20) |
| A1 | .25, 2, .9 | 0.0 (20/20) |  0.0 (20/20) |  0.0 (20/20) |  0.0 (20/20) |
| C1 | .75, 2, .9 | 69.5 (0/20) | 69.9 (0/20)  | 69.8 (0/20)  | 69.8 (0/20)  |
| C2 | .5, 5, .9 | 46.0 (0/20)  | 47.7 (3/20)  | 46.4 (1/20)  | 46.4 (0/20)  |

What it shows:
- **The ordering held for B and A3**: at p = 0.5 the splitter gains sq4 < tri6 < sq8, as good ground
  goes from below threshold, to at it, to above it. B, the paper's reference case, flips to the
  splitter on tri6 and sq8. A1 and C1, below and above threshold on every lattice, don't move.
- **The control splits the answer.** sq4x has as many neighbours as Moore, but good blocks of side 2
  still meet only at sides. In B the splitter rises only 11 → 18, and the integrator keeps every
  run: there percolation is most of the effect. In A3 it rises 25 → 42, most of the way to Moore:
  there more neighbours does it alone. In C3 (h = 1) nothing moves except on Moore.
- **Against the simple story:** A2 (single cells) on sq8 is above threshold (0.5 > 0.407) and the
  integrator still holds 18 of 20. On sq4x (0.5 > 0.337) the splitter takes 14 of 20. Being past
  the threshold isn't enough; how far past seems to matter, and corner contacts may count for less
  than side contacts. Untested.

So the paper's percolation explanation is part of the mechanism, not all of it. 20 runs each and
the sd is large in the mixed cases (see raw tables); none of this is checked by another part yet.
