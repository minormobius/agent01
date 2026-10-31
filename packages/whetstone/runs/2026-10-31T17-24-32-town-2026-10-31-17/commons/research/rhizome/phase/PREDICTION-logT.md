# Phase map in log time: prediction, written before the run (Modulo, 2026-10-14 ~22:20Z)

Asked by the person (3mxujfsxzfs23): "nowhere near steady state at 500 ticks ... heatmaps in log
space tick time going quite a bit further out."

Run: sweepT.mjs. Same grid, seeds and model as Morphyx's sweep (kit sim, L 100, sq4 torus, 25+25,
p 0.05..0.95, h 0.2..1.0, s 1/2/5/10, seedOf(0..9)). Checkpoints at t = 125, 250, 500, 1000, 2000,
4000, 8000 (doubling). A run stops when one kind is extinct (that's absorbing: no replanting);
the step it was lost at is kept, and later checkpoints carry its last cover forward (exact for who
holds the field and for "both alive"; approximate for "how much is alive").

Twin check before anything else: the t=500 checkpoint must equal sweep-s*.jsonl row for row.

Guesses:
1. "Both alive" falls with time everywhere: the number of cells with both alive in >=5 of 10 runs
   at t=8000 is under half the number at t=500.
2. Where it changes, it changes toward the splitter: of cells whose pooled splitter share moves by
   more than 0.2 between 500 and 8000, more than two thirds move up.
3. The share boundary (share = 0.5) is not stationary at 500: at h 0.9, s 1, the p where share
   crosses 0.5 moves by at least 0.05 between t=500 and t=8000.
4. Most change happens by 2000: for cells that flip winner between 500 and 8000, more than half
   have flipped by 2000.

Correction to the run description above (~22:35Z, before any result was read): stopping at the first
extinction was wrong, because the surviving kind can still die later (the twin check caught rows that
read "splitter alone" where the T=500 sweep had everything dead). The run now stops only when both
kinds are gone. Every checkpoint is exact. The guesses above are unchanged.

Second change (~22:50Z, before any result was read): the full grid to 8,000 came to more than two
hours on four cores, so p is thinned to 0.1, 0.2, … 0.9 (nine of the nineteen columns, all of them on
the old grid, so the step-500 twin check still holds). h, s, the seeds and the horizon are unchanged.
Guess 3 is read by linear interpolation between the 0.1 columns.

Third change (~23:00Z, before any result was read): even thinned, 10 seeds came to more than two hours
(at 0.2 ≤ h ≤ 0.5 the splitter survives on good blocks, so almost every run goes the full 8,000
steps). Each cell now gets 5 runs, seedOf(0..4). The script resumes (it skips rows already in the
file), so seeds 5 to 9 can be added on another day; compactT folds only seeds 0 to 4 until every
cell has all ten. "≥5 of 10" in guess 1 now reads "≥3 of 5".
