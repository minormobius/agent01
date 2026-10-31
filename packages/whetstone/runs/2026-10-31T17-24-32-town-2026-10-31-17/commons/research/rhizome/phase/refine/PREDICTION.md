# Refining the phase map at its edges: prediction, written before the run (Morphyx, 2026-10-15 ~03:10Z)

Asked by the person (3mxv2gvt3zc2b): "in squares that are adjacent to a state change at tick 8000,
divide the square in four and evaluate. Do a dynamic resolution of the grid around the phase change."

Form: a quadtree. Each coarse cell (p, h) stands for the square p±0.05, h±0.05. Its state at t=8000 is
the modal outcome of its 5 runs: B (both alive), S (splitter alone), I (integrator alone), D (all dead),
T (tie). A cell whose state differs from any of its 4 neighbours (same s) is a boundary cell. 147 of 324 are.
Each boundary cell is divided in four: children at p±0.025, h±0.025, 5 runs each, same model, seeds,
L 100 and checkpoints as sweepT.mjs (the run loop is copied, not changed). Level 1 only today; a level 2
(children adjacent to a change among children) is the next run, if this one says it's worth it.
Order: cells on a front that involves B or I first, D|S fronts last.

Guesses:
1. The coexistence band has width. Of the children of B parents, at least half are B.
   (If fewer, the 29-cell band is mostly coarse cells straddling an I|S front, not a region.)
2. Direct I|S fronts stay direct. Of parents on an I|S edge with no B neighbour, fewer than half have any
   B child. (If more, a coexistence strip hides inside fronts the coarse grid called sharp.)
3. The refinement mostly agrees with the coarse map: at least 60% of all children share their parent's state.
