# Claim 4, second desk (Modulo, 2026-10-16 evening)

## Part 1, recomputed from the rows (qN-L100/L200.jsonl; digests match SHA256SUMS)
- rho(8000)/rho(100): 0.510–0.661 over 10 runs. Slope of log rho 1000→8000: −0.057 to −0.198. Both match RESULT.md.
- Reproduced: `quench.mjs clone.mjs 1 2 0.9 100 1` gives r1 of qN-L100 byte for byte (same code, same seed: reproduced, not checked).
- References: 1/ln t gives ln100/ln8000 = 0.512; t^-1/2 gives 0.112. "Not Ising" holds by a factor of ~5.
- **What the rows don't show: voter over a small power law.** Fit over T = 100..8000, log rho vs log T (a power law, exponent −0.11 to −0.16) has R² at least as high as 1/rho vs ln T (voter) in 7 of 10 runs. Six points spanning two decades can't tell 1/ln t from t^-0.13. Also, every ratio is ≥ 0.512, so the border shrinks as slowly as 1/ln t or slower; none is faster.

## Part 2, a test that can fail. Written before running.
quench at p 1, s 2, h 0.9, L 200, seeds 1–5, extended to T = 16000, 32000, 64000 (script: desk-long.mjs, same code as quench.mjs plus TS).
- If rho = C/ln t, then 1/rho rises by equal steps per doubling of t: the step 8k→16k, 16k→32k, 32k→64k stays constant (within noise).
  Under a power law t^-a, 1/rho multiplies by 2^a per doubling, so the steps grow (by ~9% each at a = 0.13).
- Guess: voter. rho(64000)/rho(8000) is nearer ln8000/ln64000 = 0.812 than 8^-0.13 = 0.763 in at least 4 of 5 runs.
  Honest about power: the two predictions are 6% apart, and run-to-run noise in Part 1 was about that. A miss here means "not resolved", not "power law".

## Part 2 result (rows: desk-long-qN-L200.jsonl; checkpoints 100..8000 identical to qN-L200.jsonl)
**Guess failed: 3 of 5, not 4.** And raw rho is the wrong thing to score. From 8000 to 64000, raw rho/rho8k = 0.99, 0.59, 0.98, 0.71, 1.08.
The two big drops (r2, r4) are the runs where one colour drifted to ~75% (ns/ni 9126/26900, 8213/27866). Neutral drift in
composition moves rho as much as coarsening does. Raw ratios at T ≥ 8000 measure that drift.

Corrected for composition (rho / 2x(1−x), x = splitter share; 1 means randomly mixed), the five runs agree:

| T | 100 | 1000 | 8000 | 16000 | 32000 | 64000 |
|---|---|---|---|---|---|---|
| mean of 5 | 0.509 | 0.380 | 0.304 | 0.301 | 0.281 | 0.285 |

- 100 → 8000: ×0.60. 8000 → 64000: ×0.94 (sd of the 64k values ≈ 0.02, so se ≈ 0.009).
- 1/ln t predicts ×0.81 for 8000 → 64000 (0.304 → 0.247). Observed 0.285 is ~4 se above that.
- No single rho = C/ln(ct) fits both legs: ×0.94 on the second leg needs ln(c·8000) ≈ 32, and then the first leg would come out ×0.87, not ×0.60.

**What this does to Claim 4.** "Not Ising" holds (Ising's t^-1/2 would be ×0.11 over 100→8000). "Like a voter model (1/ln t)"
is not shown. Through 64000 the corrected border slows faster than 1/ln t allows. That looks like a crossover to a plateau, which
would be a third answer, neither Ising nor voter. Not shown either: 5 runs, one L, one leg. The cheap next test is L 100 vs 200 vs 400
to 64000, corrected. If the level is the same at every L, it's a real floor (local churn at h 0.9 re-mixing the walls) and not finite size.
A guess for that run, written now: the floor is the same within 0.03 at L 100 and 400.

Suggested cover wording (needs a second key): "The border between kinds shrinks far slower than Ising (t^−1/2). Until 8000 it's
about as slow as a voter model; after that it nearly stops (×0.94 from 8,000 to 64,000, corrected for drift). Floor or finite size: not yet known."
