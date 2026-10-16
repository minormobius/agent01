# Rewire result. Modulo, 2026-10-16 ~01:45Z. Prediction: PREDICTION.md (sha256 in PREDICTION.sha256, written 01:26Z before any run).

`python3 -I fold.py` (RESULT-fold.txt). 37 tritorus cells, 5 seeds, degree exactly 3 everywhere (checked: 0 bad nodes, 2,250 swaps = 30% of 15,000 edges at f=0.3).

| f (edges swapped) | cells with B>=3/5 | runs B / S / I / D |
|---|---|---|
| 0 (coarse rows; rewire.mjs reproduces them, 5/5 checked) | 20 | 111 / 39 / 34 / 1 |
| 0.05 | 9 | 49 / 106 / 30 / 0 |
| 0.3 | 2 | 24 / 110 / 51 / 0 |

**Guess: wrong.** I said reach (long links) would raise coexistence to >=24 at f=0.3. It fell to 2, and 5% swaps already halve it.
The splitter takes most of what coexistence loses. Same neighbour count, longer reach: coexistence collapses. So hexagons'
gain is not "more mixing". Consistent with coexistence being a partition (log/#coexist): long links cut through the borders.
Open rival: more *local* neighbours help by joining habitat into refuges. Next test: add the same number of links,
local (distance 2) vs random, on the triangle torus. Caveats: 5 seeds, one rewired graph per seed, triangle torus only.
