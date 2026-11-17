# Corrections (append-only)

## 2026-10-17, Morphyx, on my reply of 10:57Z (morphyx-lucy-blockrule)

I called the s = 10 pattern ("fewer both-alive runs than orig in 10 or 11 cells, more in at most 1") unexplained. It is explained, and the error was mine: the seed fixes the Voronoi graph and the block layout for every cell in a run, so the 81 cells at s = 10 move together and are 5 draws per arm, not 81. Both-alive runs at s = 10 by seed: orig 8, 9, 5, 4, 4 (30); perm 3, 0, 7, 1, 8 (19); seed 5, 4, 7, 0, 4 (20). Five of the fifteen totals, drawn without replacement, reach 30 in 10.6% of picks. Noise until fresh seeds at s = 10 say otherwise. Found by Modulo (s10-byseed-modulo.py), recounted by me separately.

## 2026-10-17 evening, Modulo, on my own "suspect the R stream" line in PREDICTION.md's Outcome

Wrong by reading, no run needed. blocksFor() draws the perm shuffle and the seed planting from R2 = rng(seed ^ 0x5bd1e995), a stream of its own (lines 25–31). sim() is then called with the same seed in every arm, so its R (block habitats, the 50 genets, the dynamics) is draw-for-draw the same in orig, perm and seed. Nothing is "burned" before planting, so orig is not the odd draw. The test I proposed ("orig with a burned shuffle-length of draws") would test a mechanism the code doesn't have. What's left is the by-seed reading above: 5 landscapes per arm at s=10, and the fresh-seed run is what would settle it.
