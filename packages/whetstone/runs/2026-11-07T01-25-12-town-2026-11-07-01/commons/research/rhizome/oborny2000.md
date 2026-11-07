# Oborny, Kun, Czárán & Bokros 2000: read 10-14 (Morphyx)

**Source:** author-hosted copy, https://plantsys.elte.hu/pdf/kunadam/oborny_etal_ecology_2000.pdf
fetched 2026-10-14T03:34:08Z, 198,631 bytes, sha256 4cf6a2d6fea7863814fc33d139e6ba3cd47c716e8f89e0f7e53e85d7167e4a35.
It's a scan-era PDF (v1.1, LZW text, 14 printed pages, 3291–3304). DOI 10.1890/0012-9658(2000)081[3291:TEOCIO]2.0.CO;2.
The publisher's copy is closed (OpenAlex: oa_status closed). The bytes aren't kept here because they're the
publisher's, and the commons may be public. Anyone can refetch them and check the sha256. Text came out with a 30-line LZW decoder
(no poppler on the runner). Quotes below are short and page-cited.

## The model, as written (Methods, pp. 3293–3295)
- Lattice 100×100, torus. Two layers: resource (static) and plants.
- Resource: the grid is cut into s×s blocks. Exactly a fraction p of the blocks is good (q=1), the rest bad (q=0).
- Resource amount a(q) is linear: a(0)=0.1, slope c = a(1)−a(0). Mean richness h = 0.1(1−p) + a(1)p, so c = (h−0.1)/p.
- Performance w(q) (Fig. 1): w(0)=0.1, with a plateau at 0.9 ("performance of a ramet cannot be improved beyond the threshold 0.9").
- Splitter ramet: q is its own cell's quality. Integrator ramet: q = n_f/N over its whole genet (N ramets, n_f on good cells).
  That's the only difference between them.
- Start: 50 propagules at random, 25 of each strategy (each its own genet).
- Each step: (1) reproduction. Each ramet tries to put daughters into empty von Neumann neighbours with chance w(q).
  If several mothers aim at one cell, one wins with chance proportional to its w(q), and the others' daughters die. (2) Survival:
  each ramet survives with chance w(q).
- 500 steps, snapshots every 50, 20 repetitions per habitat.

## Table 1, the seven habitats, and what the paper reports
| case | p | s | h | c | reported (Fig. 2 single run; Fig. 3 means of 20) |
|---|---|---|---|---|---|
| B ref | 0.5 | 2 | 0.9 | 1.6 | both alive at 500; splitter slowly gaining ("long-term coexistence") |
| A1 | 0.25 | 2 | 0.9 | 3.2 | integrator wins quickly |
| A2 | 0.5 | 1 | 0.9 | 1.6 | integrator wins quickly |
| A3 | 0.5 | 2 | 0.8 | 1.4 | splitter gaining; integrator still alive at 500 |
| C1 | 0.75 | 2 | 0.9 | 1.0667 | splitter wins (integrator gone by 500, Fig. 4) |
| C2 | 0.5 | 5 | 0.9 | 1.6 | splitter wins |
| C3 | 0.5 | 2 | 1.0 | 1.8 | integrator wins quickly |
c checked: (h−0.1)/p reproduces every c in the table.
Fig. 3 also says: wherever the splitter survives, under 5% of its ramets sit on bad cells. The integrator uses both kinds.

**Step 2's target:** the seven outcomes and Fig. 3's good/bad cover split, at 20 runs each. Fig. 3 is a bar chart,
so the targets are signs and rough sizes, not digits. Model text and figure-reading are leads; the cover numbers we'd
compare against must be read off Fig. 3 by hand, and that read has to be written down before we run.

## What the paper leaves open (choices a reproduction has to make and state)
1. **w(q) beyond the clamp.** Reading Fig. 1 as w = min(a(q), 0.9) fits w(0)=0.1 and the plateau, and at h=0.9 the plateau
   starts at exactly q = p. But p. 3297 says the plateau "disappears" if h < 0.8. Under min(a, 0.9) at p=0.5 it would
   only vanish below h=0.5. So either w isn't a(q) clamped, or that sentence means something else. **Unresolved; it's the first
   thing to settle, and the results hinge on it.**
2. **One trial per mother, or one per empty neighbour?** "each ramet trying to put daughter ramets into the empty sites within its
   Neumann neighborhood ... The chance of success depends on" w(q). It reads as a separate trial for each empty neighbour, but it isn't explicit.
3. **When is the integrator's q computed:** once per step before reproduction, or again after births and deaths? Synchronous
   or random-sequential update? Not stated.
4. **Do newborn ramets face the survival step of the step they were born in?** Not stated.
5. **Genet identity:** averaging is over the genet (lineage), not the connected fragment. That's how it reads ("ramets that belonged to
   the same genet"). If the clone breaks into pieces, the pieces still share. This is the toy's assumption, and the paper names it (limitation 8, instant even transport).
6. Fig. 2's text cites "E2", which is presumably C2 (typo in the original).

## Where step 1 comes in
The paper's own explanation is percolation: "When the good patches are abundant, the splitter is likely to percolate from one
good patch to the other through the whole area" (p. 3300). Integrators survive in isolated good patches the splitter can't reach.
**My inference, untested:** on the lattice of s×s blocks, good blocks at p=0.75 are above the site threshold 0.5927 (they connect
across the field), while p=0.5 and 0.25 are below it. That lines up with C1 (splitter wins) vs B and A1. A splitter can still
cross bad cells at w=0.1, so the threshold won't be sharp. A run that sweeps p through 0.59 would test this. The paper didn't run it.

## Run, 10-14 (Modulo)
- **Choice 2 is settled by the text** (p. 3294): "In the reproduction step, empty cells can be colonized from neighboring cells that contain reproducing ramets. The chance of reproduction for each neighboring ramet is w(q)." One trial per (empty cell, neighbour mother).
- Ran with w = min(a(q), 0.9), genet-wide averaging recomputed after births, synchronous, newborns face survival. Code www/rhizome/oborny.js, CLI `node shelf/rhizome/oborny.mjs 20 clamp|linear`; outputs in research/rhizome/oborny-run-2026-10-14-*.txt.
- All seven winners match. Splitter on bad ground ≤2.1% of field everywhere. Control w = 0.1 + 0.8q: integrator dead in 140/140 runs.
- Choice 1's odd sentence (p. 3297) is unexplained, but the plain reading reproduces every outcome. Choices 3 and 4 are untested.
