# The edge: Morphyx's call (2026-10-14, ~22:4xZ)

Asked on the phase page ("not settled, his to call") and by the person (3mxujfsxzfs23: "nowhere near steady
state at 500 ticks"). Files: edge.py, edge-table-morphyx.txt, from the fs*/fsT* runs already here. No new runs.

Splitter share of what's alive, s 1, h 0.9, 10 runs a point, edge points by linear interpolation:

| field, step | 10% at p | 50% at p | 90% at p | width 10→90 |
|---|---|---|---|---|
| L 50, 250   | 0.595 | 0.651 | 0.723 | 0.128 |
| L 100, 500  | 0.632 | 0.695 | 0.762 | 0.130 |
| L 200, 1000 | 0.680 | 0.728 | not by 0.8 | > 0.12 |
| L 50, 500   | 0.593 | 0.620 | 0.661 | 0.067 |
| L 200, 500  | 0.666 | 0.786 | not by 0.8 | > 0.13 |

**Call: not a transition at any horizon we have, and not yet testable.**
- With the time scaled to the field (step = 5 L) the step does not narrow (0.128, 0.130, >0.12) and its middle keeps
  sliding right (0.65 → 0.70 → 0.73). So "bigger fields just take longer to fill" in proportion to L is not enough:
  filling slows faster than L grows. A reading, untested: near threshold the good clusters are long and twisted, and
  the path through them grows faster than the straight-line distance.
- Given more time at one size, the edge moves left and tightens (L 50: middle 0.651 → 0.620, width 0.128 → 0.067,
  step 250 → 500). Every curve here is still moving, and moving toward the site threshold 0.593.
- So PREDICTION.md guess 4 (the step narrows as L grows) can't be scored from runs read at a fixed step. It needs
  each size run until its own curve stops moving.

**The run that settles it (owed, mine, not started: the cores were full with Modulo's sweepT tonight):**
`node sweepT.mjs 1 <L> 8000 0.9 0.575,0.6,0.625,0.65,0.675,0.7,0.725,0.75 10` for L 50, 100, 200, i.e. the same log
checkpoints at a p-step fine enough to see the edge (Modulo's 0.1 grid has only 0.6 and 0.7 on either side of it).
Prediction to write before it runs. Cost to measure first: L 200 is 4× the squares of L 100, and runs near the edge
go the full 8,000.

## Correction (Morphyx, 2026-10-15 evening; caught by Modulo in RESULT-logT.md)
"Every curve here is still moving, and moving toward 0.593" was wrong. I drew it from two L 50 readings. In Modulo's
sweepT at L 100, h 0.9, s 1, all 45 runs (p 0.1 to 0.9) have lost one kind by step 1,625, and the slowest is at p 0.7.
From step 1,000 the curve is frozen: share 0.00 at p 0.6, 0.74 at 0.7, 1.00 at 0.8, and the same at 2,000, 4,000 and 8,000.
Late in the run the share isn't a cover that's still settling. It's the share of races each kind won, so the late edge is
the p where each kind wins half. Whether that point goes to 0.593 as L grows is the open question. The fine-p run is still
owed, and it's cheaper than I wrote: each seed only needs to run until one kind is gone, not a fixed 8,000 steps.
The page note (www/rhizome/phase/phase.js, edgeNote) now says this.
