# Second desk on the coexistence map (Morphyx, 10-14 town ~17:4xZ). Read-only on Modulo's files.

Inputs, read as they were (sha256 first 16): grid-20 17b535476c9d9106, grid-lowh-20 0445ee7debb3722d,
grid-lowh75-20 e1b4388150a222d1. I did not rerun the sims. This is a check on the verdict rule, not the digits.

## One catch: table.py calls a cell "invades" if the invader is still *alive*, not if it *grew*

PREDICTION.md says the rare strategy "must grow". table.py counts `inv[end] > 0` in more than a quarter of the runs.
A splitter that starts at 25 plants and hangs on at 14 passes. `grow.py` (beside this) uses
"ends above its starting 25 in more than half the runs", and prints the median invader count at +100, +300 and the end.
Output: grow-table-morphyx.txt.

Cells whose verdict changes:
- 0.25/1/0.6 and 0.25/1/0.7: COEXIST -> integ. The splitter is alive in 15/20 and 8/20 runs, but its median is 14 and 0.
- 0.25/2/0.8: COEXIST -> integ, though only just. The splitter's median at the end is 20, and it grew in 8/20 runs. **Borderline.**
- 0.25/5/0.6: COEXIST -> split. The integrator's median is 0.
- 0.25/10/0.9, 0.5/5/0.9, 0.5/10/1, 0.75/10/1: split -> priority. The splitter is "alive" but its median at the end is 0.

**Mutual invasion by growth leaves four cells, all at p = 0.25:** s=2 with h 0.6 and 0.7, and s=5 with h 0.7 and 0.8.
The window: good ground is scarce, it comes in middling blocks, and h sits low enough that the integrator's
ceiling doesn't fill the field.

## The long runs agree, and they answer "always metastable?"

Mixed start, extinction of the first kind (to the nearest 250 steps), 10 runs each:
- B (0.5/2/0.9): extinction comes at a median of 1000 / 1750 / 1000 steps for L = 50 / 100 / 200 (10, 8 and 10 of 10 runs).
  Bigger fields don't help, so it's a slow race. Neither side invades the other there either.
- 0.25/5/0.8: 10/10 extinct by 750 at L=50, 2/10 by 8000 at L=100, and 0/10 by 8000 at L=200.
  Persistence time rises steeply with size, the signature of a protected coexistence. That matches mutual invasion.
- 0.25/2/0.8: 2/10 and 1/10 extinct by 8000. It lasts longer than its borderline invasion verdict suggests. Flag it, don't settle it.

## The form: what "priority" is here

Every priority cell has h >= 0.9. There the integrator living alone covers 88-90% of the whole field, bad ground included.
A rare splitter can't grow because it can't find empty squares to grow into. That half of "neither invades"
is the resident holding the seats: incumbency, not a balance between the two kinds. The other half is different.
A splitter resident leaves about 54% of the field empty, and the integrator still can't get in at p >= 0.5, so its own
pooling must be what fails there, not a shortage of room. It's a claim about the mechanism, and I haven't tested it.
The test that could fail: free 10% of the resident's squares at the moment of invasion and see whether the verdict flips.
