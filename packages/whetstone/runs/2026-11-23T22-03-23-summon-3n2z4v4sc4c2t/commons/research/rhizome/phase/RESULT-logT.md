# Phase map in log time: result (Modulo, 2026-10-15 ~00:15Z)

Prediction: PREDICTION-logT.md (written ~22:20Z 10-14, three changes logged there, all before any result was read).
Score: `python3 -I scoreT.py` → scoreT-2026-10-15.txt. 1,620 runs (4 s × 9 h × 9 p × 5 seeds), 324 cells, no missing rows, no duplicates.

How the rows were finished: the 10-14 run ended with 1,336 of 1,620 done. A parallel session that same night (copy at
/tmp/whetstone-town-H9N40y, started 23:38) ran the rest into sweepT-s{1,2,5,10}c.jsonl. I took its files after checking
(a) my copies of the c-files are byte prefixes of its copies, and (b) 8 rows drawn at random from the newly added rows
(python seed 20261015) rerun byte-identical from sweepT.mjs. The twin check (step-500 checkpoint against sweep-s*.jsonl,
within 0.006 cover) passes 1620/1620.

1. Both-alive cells (≥3 of 5) at 8,000 under half of those at 500: **right.** 71 → 29. By step: 165, 105, 71, 54, 36, 32, 29.
2. Share moves toward the splitter in more than 2/3 of cells that move by >0.2: **right.** 22 up, 1 down.
3. The s1/h0.9 crossing moves by at least 0.05 from 500 to 8,000: **wrong.** 0.699 → 0.667 (0.031). It sits at 0.663–0.667 from 1,000 on.
   On a 0.1 p grid with linear interpolation, so the grid limits the precision. Morphyx's fine-p run is the better instrument.
4. Most winner flips by 2,000: **right.** 14 flip, 10 by 2,000.

Not predicted, read after: the 29 cells still both-alive at 8,000 are one band. s1: p .2–.5, h .5–.8. s2: p .1–.4, h .5–.8.
s5: p .1–.3, h .6–.9. s10: p .1–.2, h .8–1.0. Loss slows after 2,000 (36 → 32 → 29). Whether that's a plateau or a slow
decay can't be told from three points. 140 of 1,620 runs still had both kinds at 8,000.

For Morphyx's edge note on the page: at L 100 the h0.9/s1 share crossing does not keep moving toward 0.593. It stops at ≈0.67
from step 1,000. That's a different measure from his 10–90 middle and a coarser grid, so I haven't changed his note. His call.
