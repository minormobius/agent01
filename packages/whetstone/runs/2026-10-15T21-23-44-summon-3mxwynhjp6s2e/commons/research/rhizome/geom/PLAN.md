# Other geometries (Morphyx, 2026-10-15 town, ~15:40Z)

The person asked (3mxwecbinok2b, 15:18Z): heatmaps for Voronoi plane, Voronoi sphere, Voronoi torus, hex torus,
triangle torus, then the same edge refinement at each map's boundary.

**Stage 1, this job (geom-coarse):** the coarse log-time sweep, same grid as /rhizome/phase/
(s 1,2,5,10 × p .1–.9 × h .2–1.0, 5 seeds, L 100, read at 125…8,000), on four geometries: vortorus, vorplane,
hextorus, tritorus (definitions in geom.mjs). 6,480 runs, 4 shards, each running the four in turn.
**Stage 2:** the woken session folds the rows (as compactT does), picks edge cells with ../phase/refine/plan.py's
rule, and writes the refine job. A woken session's job wakes nobody, so stage 2's report comes on a clock run.

**Not in stage 1: the Voronoi sphere.** The habitat is laid in s × s blocks on x, y. A sphere has no such blocks,
so a block has to be defined (equal-area lat-long patches? clusters of s² nearest cells?), and that choice
moves the map. Asked of the person before building.

**Words:** "hex torus" here means hexagon tiles, which touch 6 each (the triangular site lattice, p_c 1/2);
"triangle torus" means triangle tiles, which touch 3 each (the honeycomb site lattice, p_c ≈ 0.697). In the
kit, 'tri6' is named for the first, which is easy to read backwards.

## Guesses, written before any row exists
1. The coexistence band (both alive in ≥3 of 5 at 8,000) survives on all four: ≥1 cell on each.
2. tritorus (3 neighbours) has more both-alive cells at 8,000 than hextorus (6): fewer neighbours, slower
   invasion, slower races.
3. vorplane and vortorus differ by ≤3 cells in holder at 8,000 out of 324: the edge is a small share of L=100.

## Stage 1 result (Morphyx, job-woken session, 2026-10-15 ~19:30Z)

geom-coarse: exit 0, 231 min, 6,480 of 6,480 rows (5 per cell, 324 cells each). `python3 -I fold.py ../../../jobs/geom-coarse/out ../phase`.
Cells with both alive in ≥3 of 5 at t=8,000, and the majority-state map, beside the square torus (sq4, Modulo's sweepT):

| geometry | neighbours | B ≥3/5 | dead-majority cells |
|---|---|---|---|
| tritorus | 3 | 20 | 69 |
| sq4 (ref) | 4 | 29 | 58 |
| hextorus | 6 | 31 | 45 |
| vortorus | ~6 (irregular) | 33 | 39 |
| vorplane | ~6, edges | 38 | 41 |

1. ≥1 coexistence cell on every geometry: **right** (20 to 38).
2. tritorus has more than hextorus: **wrong**, the other way: 20 against 31. Fewer neighbours gave less coexistence and more
   dead cells, not slower races. Coexistence rises with neighbour count across all five.
3. vorplane and vortorus differ by ≤3 majority cells: **wrong**, 8 differ. With 5 runs a cell, some of that is noise;
   I have no same-geometry repeat to say how much. I'm not saying it's an edge effect.

## Stage 2: geom-refine (written, needs a second signature)

`python3 -I plan.py ../../../jobs/geom-coarse/out > cells.json`: 576 edge parents (332 at priority 0, which touch B, I or a tie;
244 priority 1, S|D fronts). × 4 quarters × 5 seeds = 11,520 runs, about 410 min at the coarse job's pace, so more than one
330-min cap. refine.mjs is resumable and works priority 0 first, so the first round should finish every B/I edge; a "round": 2
finishes the S|D fronts. Rows: rref-<shard>.jsonl. No predictions this time from me past one: the band stays where the coarse
map put it on each geometry (≥60% of B parents' quarters are B), same as on the square.
