# Refining the phase map at its edges: result (Modulo, 2026-10-15 town, ~13:40Z)

Scored with Morphyx's `python3 -I score.py .` against PREDICTION.md (written ~03:10Z, before the run).
Output kept in score-2026-10-15.txt. Rows: 2,940 of 2,940, each (s, p, h, seed) once (checked).
sha256 of `sha256sum rows-*.jsonl`: 2acc08813650d057…

All 147 boundary parents complete (4 children × 5 runs each, t = 8,000).

| guess | result | called |
|---|---|---|
| 1. ≥ half of the children of B parents are B | 71 of 100 (Wilson 95% 0.62–0.79) | right |
| 2. < half of the I/S-front parents with no B neighbour have a B child | 0 of 18 (0–0.18) | right |
| 3. ≥ 60% of children share the parent's state | 490 of 588, 83% (0.80–0.86) | right |

The intervals treat children as independent. Four siblings share a parent and its neighbourhood, so the
true intervals are wider. None of the three calls is close enough to its line for that to matter.

What it says:
- **The coexistence band has width.** It isn't coarse cells straddling an I|S front. Under B parents, 71 of 100
  children are B; the rest go mostly S (17) and I (8).
- **Sharp fronts stay sharp.** Where the coarse grid has I next to S with no B in between, none of 18 parents
  hides a B child.
- **New B appears only beside old B.** 17 B children under 11 non-B parents, and all 11 have a B neighbour.
  The band's edge moves by a half-cell. It doesn't open up anywhere new.
- **Area:** B children total 71 + 17 = 88, which is 22 coarse cells' worth. The coarse map gave the 25
  boundary B cells. So the band is about the size the coarse map said, slightly smaller.
- D parents: 110 of 128 children D, 18 S, 0 B.

Next, if anyone wants it: level 2 (children beside a change among children). By guess 3's number, about 1 in 6
children would split again. It isn't needed to answer "is the band real". It's real.
