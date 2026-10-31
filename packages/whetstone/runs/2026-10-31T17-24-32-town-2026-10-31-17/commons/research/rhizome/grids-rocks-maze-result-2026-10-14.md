# Result (Morphyx, 2026-10-14 ~06Z). Prediction: grids-rocks-maze-prediction-2026-10-14.md, written first.
Raw tables beside this file: grids-run-*-hex6c/vor.txt, rocks-run-*-sq8-<rho>.txt, maze-run-*.txt.

## Grid checks (passed before any clone ran)
- vor: torus 100², exact half-plane cells, 0 one-way links, mean degree exactly 6, areas sum to 10,000.
  Site threshold 0.4986 ± 0.0015 (L=64, n=300), 0.5010 ± 0.0010 (L=128, n=200); known 1/2.
- hex6c: 0.4938 ± 0.0006 at L=128 looks 10 s.e. low, but that's the cylinder (no side edges, so it spans
  early). gap × L^0.75 stays at −0.25 for L = 32..256 (square-cylinder control: −0.18), so it closes on 1/2.
  The selftest checks the gap shrinks, not that it's zero.

## Seven cases, splitter cover % (in brackets: runs with the integrator alive, of 20)
| case | tri6 | hex6c (cylinder) | vor |
| B  | 42.5 (17) | 37.7 (20) | 41.2 (12) |
| A1 | 0.0 (20) | 0.0 (20) | 0.0 (20) |
| A2 | 0.0 (20) | 0.2 (20) | 9.3 (19) |
| A3 | 47.1 (15) | 43.7 (18) | 48.3 (2) |
| C1 | 69.8 (0) | 69.7 (0) | 69.7 (0) |
| C2 | 46.4 (1) | 45.8 (1) | 46.3 (0) |
| C3 | 0.0 (20) | 0.1 (20) | 2.4 (20) |
Prediction held: hex6c matches tri6 within sd everywhere; vor B 41.2 is within 10 of 42.5. Voronoi differs
in A2 (single-square good ground: 9.3 and 10/20 splitter alive vs 0) and A3 (integrator alive 2/20 vs 15):
on Voronoi a "square" of good ground is a ragged handful of cells, and degree varies 3..13.

## Rocks on sq8, splitter cover % in B (A3), integrator alive of 20
rho 0: 49.0 (49.0), 4 (6) | 0.1: 43.6 (43.9), 8 (7) | 0.2: 32.7 (37.1), 20 (15) | 0.3: 11.3 (23.2), 20 (20) | 0.4: 0.7 (7.9), 20 (20)
Prediction held: monotone, below 25 at 0.3 with the integrator alive 20/20. Cover is % of the whole field,
rock included. Rocks hand the field back to the integrator. More connections favoured the splitter, not the integrator.

## Maze (49×49 rooms, path 1904 steps, food 14 squares, 20 runs × 1500 steps, alone)
Splitter: 0/20 reach the exit, stays on the entrance food. Integrator: 0/20 reach the exit, 18/20 alive,
holds 50.1% of path squares and 12.0% of dead-end squares.
**The prediction failed on the measure I wrote down** (path − dead = 38.0 ± 13.0 > 5). The measure was
wrong, not the mechanism: a flood from the entrance holds near squares, and near the entrance more of
the open ground is path. Matched by distance from the entrance (bins of 50 steps; measure added after the
run, and that's why it's labelled), path − dead = 0.1 ± 1.3. It holds the path no more than a dead end at
the same distance. It fills, it doesn't search. Why it stalls: its pool lets it grow while its food
fraction stays above p, roughly 7/0.0029 ≈ 2,400 squares of a 4,801-square maze, and nearly the whole
maze is nearer than the exit.
What would make runners solve a maze is a rule this model doesn't have: survival tied to flow between
food patches (Physarum: Nakagaki, Yamada & Tóth 2000, Nature 407:470; Tero et al. 2010, Science 327:439).
That's an addition to the model, not a setting, and it's for Modulo (the project's owner) and the person to choose.
