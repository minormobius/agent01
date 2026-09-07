# math — math.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Hub for the extremal-geometry pack. Family-resemblance table sortable by era, technique, status — and an explicit roadmap of next entries (szemerédi–trotter, heilbronn, borsuk, viazovska, ...). Read this first if you want the lay of the series.

## Facts

| | |
|---|---|
| Surface | `math` |
| Dir | `geometry/` |
| Endpoint | `math.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/holder-continuous-procgen-arqnj4` |
| Deploy | `.github/workflows/deploy-math.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "math"`.

## How it works

Math/explainer pack (grows beyond geometry): hub geometry/ + scattered top-level explainer dirs + elements/. conjectures/ is a math-NATIVE new member (data-driven index of 193 open conjectures ranked by difficulty — the modelled odds each still stands in 2126 — with per-conjecture context pages, plus the CONJECTURE MACHINE at /generate: a generator that mints new statements from the same grammar and an executable REALITY ENGINE that actually runs them over small cases before a solvability oracle rates them; engine.selftest.mjs + reality.selftest.mjs gate both. Canonical URL math.mino.mobi/conjectures/, NOT served by root — no cross-link rewrite needed since it uses relative links). DEFERRED on-split work: the OTHER (root-shared) members cross-link by ABSOLUTE https://mino.mobi/<x>/ URLs — rewrite those to relative in all members + the hub, THEN carve these dirs out of root.serves + deploy-root.yml paths so root stops shipping them.

## Deploy status

MANAGED — additive launch via deploy-math.yml (Worker `math`, custom_domain math.mino.mobi). Members are STAGED from root at build time, not moved; root still serves the canonical mino.mobi/<x>/ URLs so nothing breaks.

## The geometry pack (`/geometry/` + siblings) — interactive math explainers

Single-file static canvas pages on extremal-geometry results, sharing a scaffold (crumb → mino.mobi, accent colour, sister crossref, tabs, docs). Hub at `/geometry/` (sortable resemblance table + roadmap in `geometry/IDEAS.md`). Members: `erdos`, `guthkatz`, `hadwiger`, `runner`, `kakeya`, `capset`, `szemeredi-trotter`, `heilbronn`, `borsuk`, `viazovska`, `cohomology`, `voronoi`, `arnold`; plus the adjacent `/elements/` periodic-table mandala. Pure static — deploy with the root Pages site. When adding one: follow `geometry/IDEAS.md` anti-patterns, validate the math in the commit body, add to the root `index.html` PROJECTS array, and re-run `scripts/generate-search-catalog.mjs` + `scripts/generate-og-card.mjs`.

## `/cohomology/` — the one page with its own engine module

`cohomology/` breaks the pack's single-file rule on purpose, following
`conjectures/`: the maths lives in **`cohomology/hodge.js`** (an ES module the
page loads with `<script type="module">`) so that **`cohomology/hodge.selftest.mjs`
imports the exact same file the browser runs**. There is no second copy to drift.

Run it before touching anything in that directory:

```bash
node cohomology/hodge.selftest.mjs   # ~20 s, 362 checks over 18 mesh configs
```

It asserts, per configuration: the complex is manifold and every face is
counterclockwise; d₁∘d₀ = 0; ω = exact + coexact + harmonic to machine
precision; the three summands are mutually orthogonal and Pythagoras holds;
d₀ᵀh = d₁h = 0; b₁ from the Euler characteristic equals both the number of voids
punched *and* the numerically measured rank of the harmonic space; ∮h is
constant on a homology class while ∮dα is identically zero; the period matrix is
nonsingular and its dual basis satisfies ∮ₖhₘ = δₖₘ; and the Whitney
interpolation drawn on screen integrates back to the cochain it came from.
`scripts/preflight.mjs` picks it up automatically for changed dirs.

Things worth knowing before editing the engine:

- **The mesh is a structured staggered lattice, not a Delaunay.** An earlier
  Bowyer–Watson version was O(n·T) and took minutes at the densities the slider
  offers. The lattice is O(n), and — more importantly — deleting a connected
  disk of triangles from a disk adds exactly 1 to b₁ every time, so the topology
  is not left to a filtering heuristic. Circular voids come from projecting the
  rim vertices onto the circle afterwards; the rim is found from **edge
  incidence**, never a distance threshold (missing one rim vertex leaves a
  visible notch), and every vertex move is rejected if it would invert a
  triangle.
- **`mesh.b1` is always measured**, never the requested hole count. `buildMesh`
  retries with a nudged seed if they disagree, but reports what it got.
- **h is never solved for.** It is ω minus the two projections, which is why the
  ledger's residuals are evidence rather than assertion. Don't "improve" this by
  projecting onto a harmonic basis — it would make the certificate circular.
- Both Laplacians are applied as compositions of `applyD0`/`applyD0T` and
  `applyD1`/`applyD1T` rather than assembled, so a change to an operator cannot
  desynchronise from its Laplacian.

## `/voronoi/` — the second engine module, and the pack's procgen entry

`voronoi/` follows `cohomology/` in breaking the single-file rule on purpose:
the engine is **`voronoi/life.js`**, an ES module the page loads with
`<script type="module">`, so **`voronoi/life.selftest.mjs` imports the exact file
the browser runs**. Same rule, same reason — no second copy to drift.

```bash
node voronoi/life.selftest.mjs   # ~1.5 s, 154 checks
```

Conway's Game of Life on a periodic Voronoi tessellation. `B3/S23` is a fact
about squares having eight neighbours, so the rule is restated as a *fraction*
of whatever neighbourhood a cell drew (4–8 sides, mean exactly 6) — a
generalisation that specialises back to Conway on a degree-8 Moore grid, which
the selftest holds it to cell-for-cell against a naive implementation.

It is also where this pack keeps a **procgen** page: two seeds generate
everything, a permalink reproduces a universe bit-for-bit, and a hunt tab rolls
soups until one clears an explicit emergence score. Six specimens found by an
offline sweep ship in `specimens.js` and are re-measured from their own links by
the selftest on every run.

Full notes, and the four things not to break in the engine, are in
[`../voronoi/CLAUDE.md`](../voronoi/CLAUDE.md). The short version: the cell
construction's stopping rule is a proof rather than a tolerance, adjacency is
tagged at the cut rather than matched by distance afterwards, and **Σdeg = 6n
exactly** (Euler on a torus with trivalent vertices) is the invariant that
catches everything else.

## `/arnold/` — the third engine module: a square filling a cube

`arnold/` follows the same rule as `cohomology/` and `voronoi/`: the maths is
**`arnold/surface.js`**, an ES module the page loads, and
**`arnold/surface.selftest.mjs` imports the exact file the browser runs**.

```bash
node arnold/surface.selftest.mjs   # ~1 s, ~1670 checks
```

Badger–Palmer's (2/3)-Hölder surjection from the square onto the cube
(arXiv:2608.21246, Arnold's problem 1988–5) rendered as a colour image, with the
paper's clipping replaced by a fold that makes the colour histogram flat — exactly
flat, to the pixel, at lattice-aligned sizes, which the selftest asserts. The page
draws it on the GPU from a GLSL port of the same tables, and a *GPU = CPU?*
button compares the two. Seeds vary the image only through area-preserving maps
of the torus and cube symmetries, so the flatness is never lost. Full notes and
the four things not to break in [`../arnold/CLAUDE.md`](../arnold/CLAUDE.md).

## Deploying

Pushes to `claude/holder-continuous-procgen-arqnj4` that touch this surface's paths trigger [`.github/workflows/deploy-math.yml`](../.github/workflows/deploy-math.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
