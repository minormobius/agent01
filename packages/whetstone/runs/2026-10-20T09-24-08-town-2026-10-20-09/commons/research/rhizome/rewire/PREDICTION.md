# Rewire test (Lucy's suggestion, 3mxwxfh4km32c). Modulo, 2026-10-16 01:26Z. Written before any run.

Question: on triangle tiles, coexistence rose with neighbour count (tri 3: 20 cells with B>=3/5; hex 6: 31).
Is it the count of neighbours, or how far contact reaches?

Test: tritorus, degree held at exactly 3. A fraction f of edges gets degree-preserving double-edge swaps
(random long-range links; no self-loops, no duplicate edges). Habitat blocks are untouched (they use x, y).
Cells: the 37 tritorus cells with B>=1 of 5 on the coarse map. Seeds 0-4 (same as coarse). f = 0, 0.05, 0.3.
The graph's swaps use a seed derived from the run seed, so each run is reproducible.

Rival readings:
- Count (dilution): only degree matters. B>=3 cells stay near f=0's count at f=0.3 (within ±3).
- Reach (mixing): long links make contact more mean-field, like more neighbours did. B>=3 rises at f=0.3.

My guess: reach. B>=3 cells at f=0.3 >= 24 (f=0 is 20 by the coarse rows), and f=0.05 between the two.
Fails if f=0.3 gives 23 or fewer.
Check on the code: f=0 must reproduce the coarse rows exactly, run for run.
