# voronoi — Conway's Game of Life on a periodic Voronoi mesh

A member of the **math** surface (`math.mino.mobi`). Canonical URLs:
`math.mino.mobi/voronoi/` and, once root next deploys, `mino.mobi/voronoi/`.
Surface-wide facts live in [`../geometry/CLAUDE.md`](../geometry/CLAUDE.md);
repo-wide rules in [`../CLAUDE.md`](../CLAUDE.md).

## What it is

`B3/S23` is a statement about squares, not about life. "Three" only means
anything because every cell has exactly eight neighbours, so on a mesh where
cells have four to eight sides the rule is not even well defined — a four-sided
cell can never see three live neighbours the way an eight-sided one can, and a
count rule silently hands the automaton to the big cells.

So the rule here is a **fraction** of whatever neighbourhood a cell drew. That
is a genuine generalisation rather than a different game, and the claim is
checkable: on a degree-8 Moore torus the fractional rule with birth band
[3/8, 3/8] and survival band [2/8, 3/8] *is* Conway's B3/S23.

Everything else follows from the request this was built for — *roll some nodes,
build the mesh, roll initial conditions until emergence, keep it procgen with
permalinks*:

| Tab | Does |
|---|---|
| **life** | the mesh, running. Click any cell to flip it |
| **hunt** | rolls soups on the current mesh, scores each trajectory, stops at the first that clears the bar — and lists every reject |
| **anatomy** | the mesh ledger, recomputed live from whatever is loaded |
| **specimens** | six found universes, each a permalink |
| **docs** | the whole argument in prose |

## Files

| File | Is |
|---|---|
| `life.js` | the engine — PRNG, mesh, automaton, search, permalink codec |
| `life.selftest.mjs` | 154 known-answer checks, ~1.5 s |
| `search.mjs` | the offline sweep that found the specimens |
| `specimens.js` | the hall of fame, imported by both the page and the selftest |
| `index.html` | the page; loads `life.js` as a module |

**`index.html` and `life.selftest.mjs` import the same `life.js`.** There is no
second copy, and there must not be — the point of the selftest is that it is
evidence about the live page. This follows `cohomology/hodge.js`.

Run it before touching anything here:

```bash
node voronoi/life.selftest.mjs      # 154 checks, ~1.5s
node voronoi/search.mjs --emit      # re-run the sweep, ~2 min
```

`scripts/preflight.mjs` picks the selftest up automatically for changed dirs.

## Things worth knowing before editing the engine

- **The domain is a torus, not a patch.** On a bounded patch the border cells
  have fewer neighbours and act as sinks; every hunt then converges on artefacts
  of the edge instead of on anything about the rule. There is no boundary code
  because there is no boundary.

- **The stopping rule for cell construction is a proof, not a tolerance.**
  Cells are built by clipping a square against perpendicular bisectors, nearest
  first. After clipping against everything within distance R, let r be the
  furthest surviving vertex; a site at distance d > 2r has its bisector further
  than r from the site and therefore cannot touch the polygon. Ring k of the
  bucket grid holds nothing closer than (k−1)/cols, so the loop exits when
  (k−1)/cols ≥ 2r and the polygon is *the* Voronoi cell. Do not replace this
  with "clip against the 24 nearest and hope".

- **Adjacency is tagged at the cut, never recovered by distance.** Each polygon
  edge carries the id of the site whose bisector supports it. An earlier version
  finished the polygons and then matched each edge to a generator by distance;
  that needs a tolerance, and a relaxed mesh is full of near-degenerate quadruple
  points where the tolerance is wrong. The tagged Sutherland–Hodgman clip in
  `clipBisector` is the fix — if you touch it, keep the tag bookkeeping.

- **Σdeg = 6n is the load-bearing invariant.** On a torus V − E + F = 0, and
  Voronoi vertices are trivalent, so V = Σdeg/3 and E = Σdeg/2 with F = n, which
  forces Σdeg = 6n *exactly*. A dropped neighbour, a phantom neighbour and a wrap
  computed with the wrong sign all move it off 6n and none can cancel. It is the
  single cheapest thing to check and it is checked on every mesh.

- **The sliver filter is why that lands exactly.** Edges shorter than 1e-12 of
  the domain are numerical debris at quadruple points, not neighbours. Dropping
  them is what makes Σdeg hit 6n on the nose rather than a bit over.

- **`emergence()` is a stand-in and says so.** It is not a rigorous notion and
  the code should not pretend otherwise. Retuning the bands is fair game;
  quietly making it look objective is not.

- **"Unsettled" is a claim about the horizon, not aperiodicity.** The state space
  is finite, so every trajectory cycles eventually. Two specimens were run to
  5000 generations by hand without repeating; that is what the word means here
  and the docs tab says so.

- **Permalink thresholds are per-mille integers on purpose.** A rule that
  round-trips to within 1e-16 is a *different automaton* at the threshold. The
  bands sit at midpoints between neighbouring sixths — maximally far from every
  boundary they separate — so per-mille quantisation cannot change behaviour on
  any degree the mesh actually produces (4–8). `search.mjs --emit` re-measures
  each specimen *through its link* rather than through the sweep's in-memory
  rule, so a baked number is always a claim about the URL.

## Specimens

`specimens.js` is not decoration — `life.selftest.mjs` re-derives every record's
`kind`, `period`, `transient` and `score` from its own permalink on each run. If
an engine change moves any of them the test fails rather than the page quietly
lying. `loom` additionally carries a `decomposition` field (its per-cell period
histogram) because its blurb makes a specific claim about *why* the period is
210, and a claim like that should be checked.

Re-running the sweep will find different specimens if the scoring changes. That
is fine; update `specimens.js` from `--emit` output and let the selftest confirm
the new numbers.

## Deploying

This directory is in the **math** surface's `paths`, so a push to
`claude/conway-voronoi-procgen-wens91` that touches it fires
[`.github/workflows/deploy-math.yml`](../.github/workflows/deploy-math.yml),
which stages `voronoi/` into `math/dist/voronoi/` and deploys the `math` worker.

The page's cross-links point at `https://mino.mobi/<sibling>/` like every other
member of the pack — the surface-wide deferred work is to make those relative
(see `../geometry/CLAUDE.md`). Nothing here needs doing separately; when that
rewrite happens this page goes with it.
