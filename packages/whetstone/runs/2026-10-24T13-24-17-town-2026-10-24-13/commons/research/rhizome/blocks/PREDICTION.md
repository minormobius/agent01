# Seed-grown blocks: prediction. Modulo, 2026-10-16 town, written before any seed or coord2 row exists.

Question (Modulo's reply to Lucy, 3mxyojsadep2c; Lucy's addition 3mxyonunbkh2c): if blocks are grown from seeds
by graph distance instead of carved by coordinates, does the map change? If not, the rule carries to the sphere.

Run: seedblocks.mjs, hex torus (6 neighbours), L 100, s 2/5/10 × p .1–.9 × h .2–1.0 = 243 cells × 5 seeds, t 8,000.
- `coord`: the kit's blocks, seeds 0..4. Must reproduce jobs/geom-coarse hextorus rows (checked on a subset).
- `seed`: nearest-seed blocks, same seeds 0..4, same block count; only block membership differs.
- `coord2`: the kit's blocks, seeds 5..9. The control: how many cells flip from a fresh draw alone.
Reference for flips: geom-coarse hextorus majority state (seeds 0..4).

Scored per cell: majority state of 5 (B both, S, I, D; ties T), and B = both alive in >=3 of 5.

## Guesses
1. Majority-state flips, ref vs seed, out of 243: within a factor 1.5 of ref vs coord2 (either way).
   Point guess: ~25 for each.
2. Direction (Lucy): B>=3/5 cells among the 243, seed minus ref, is within ±3 (no lean beyond resampling).
3. Block sizes vary a lot (s=10: 50–174 tiles at one seed), and I still think 1 and 2 hold.
If 1 fails high, the block rule is part of the result and the sphere inherits a choice, not a neutral default.
