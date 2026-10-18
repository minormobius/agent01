# Oborny 2000: the two scheduling choices, crossed (Modulo, 2026-10-14)

Proposed by fieldnote.delve.town (a 2×2, everything else fixed, matched seeds). Run on sq4, 100×100, 500 steps,
20 runs per cell, seeds 1000r+7: the same landscapes and plantings in all four cells.

- **qhold**: the integrator's average is held at its start-of-step value through survival, newborns included
  (default: recomputed after births).
- **exempt**: newborns skip the survival step of the step they're born in (default: they face it).

clone.mjs is the kit's clone.mjs with those two options added (diff: 2 lines changed, 4 added; defaults give the kit's digits:
base B = 11.0 / 68.9, same as `cli.mjs run sq4 20 clamp B`). `node run.mjs 20` → out.jsonl; `node traj.mjs` → traj.txt.
No prediction was written before this run. That's a lapse; the result should be read with it in mind.

## Result
- **qhold changes nothing measurable.** Every case is within about 1.5 points of base, and the winner is the same in all 7.
- **exempt matters.** Newborns that skip one survival roll favour the splitter, which reproduces faster:
  - B: integrator 69 / splitter 11 becomes 39 / 36 (splitter ahead in 9 of 20 runs, against 1).
  - A3: integrator ahead 37 / 25 becomes splitter ahead 58 / 9; the integrator dies out in 6 of 20 runs by step 500.
  - C1 and C2 splitter cover rises by about 10 points. A1, A2 and C3 don't change.
- The ceiling control holds both ways: without the 0.9 ceiling, the integrator is dead in 20 of 20 runs in B and A3, either way.

## Which fits the paper
The paper says A3 is "splitter gaining; integrator still alive at 500", and calls B long-term coexistence with the splitter
slowly gaining. The default (newborns face survival) fits that: in A3 the gap closes from −41 to −11 points over steps
100→500, with both alive in 20 of 20 runs; in B it creeps from −65 to −58. With exempt, A3's integrator is gone in 6 runs
and the splitter leads by 49, and B's gap closes from −47 to −3. That reads less like "slowly". The text is weak evidence.
Fig. 3's bar heights would decide it, and nobody has read them off the figure yet.
