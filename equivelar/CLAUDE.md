# /equivelar/ — eight faces, all touching

Part of the **math** surface (`math.mino.mobi`); see [`../geometry/CLAUDE.md`](../geometry/CLAUDE.md)
for the pack and [`../CLAUDE.md`](../CLAUDE.md) for repo-wide rules. It is the
third of a run: [`../szilassi/`](../szilassi/) (seven faces, all touching),
[`../csaszar/`](../csaszar/) (its dual), and this — **eight**.

Eight planar nonagons on a surface of genus 3. 24 corners, 36 edges, three
faces at every corner, and all **28** pairs of faces adjacent. Same layout as
its siblings: object in the top two thirds, controls in the bottom third.

## Run this first

```bash
node equivelar/poly.selftest.mjs    # ~2 s, 288 checks
```

`preflight.mjs` picks it up automatically for changed dirs.

## Where the numbers come from, and how far to trust them

`REFERENCE_VERTICES`, `INTEGER_PLANES` and `PUBLISHED_FACES` are Tables 1 and 2
and the eight plane equations of

> Ruslan Mizhaev, *Integer Realization of an Equivelar Octahedron of Genus 3*,
> [arXiv:2609.17700v1](https://arxiv.org/abs/2609.17700) [math.CO], 15 September 2026

reproduced verbatim. That is a **v1 preprint**, not a peer-reviewed paper, and
its acknowledgments say a language model helped with "certain calculations". So
nothing here is taken on the paper's word: **the selftest re-derives the whole
certificate from the published integers before any of it is used**, and it
checked out completely. Specifically —

- All 72 corner-face incidences are exact: every residual is the integer `0`.
  Every quantity in that part of the test stays below 2⁵³, which the test
  asserts, so the checks are exact in double arithmetic and **no tolerance is
  used anywhere in them**.
- Every corner lies on exactly three of the eight planes, those three are
  independent over the integers, and Cramer's rule returns the published
  coordinates exactly.
- 36 edges each in two faces; every corner on three edges and three faces;
  χ = 24 − 36 + 8 = −4, so genus 3; the published sign vector orients it.
- All 28 face pairs adjacent, 20 sharing one edge and 8 sharing two, totalling
  the 36 edges; the eight overarching pairs are the ones the paper prints.
- `T(x, y, z) = (y, −x, −z)` permutes the corners, has order 4, and acts on the
  faces as `(F1 F7 F2 F8)(F3 F6 F4 F5)` — the paper's own cycle structure.
- Geometrically: all eight nonagons simple, none convex, and every pair meeting
  **exactly** in its prescribed edge(s) — checked once by the shipped line walk
  and again by a second method that samples the 28 crossing lines at 30 000+
  points and has to agree at every one.

Two things the page states more precisely than the paper does. Neither is an
error in what the paper claims, but both matter if you touch this code:

1. **The published orientation points inward.** With the signs
   (+,+,−,−,−,−,+,+) the enclosed volume comes out at −4 455 360. `FACES`
   therefore stores the opposite choice — F1, F2, F7 and F8 reversed — so the
   normals point out and the volume is +4 455 360. The selftest checks both the
   reversal pattern and the sign.
2. **The symmetry is not a rotation.** The paper says ⟨T⟩ ≅ C₄, which is true
   as an abstract group. But `det T = −1`: geometrically it is a four-fold
   **rotary reflection** — Schoenflies **S₄** — and it reverses the walk of all
   eight faces. Its square is the honest half-turn. This is load-bearing, see
   below.

## What it does and does not settle

The classical count for a solid whose `f` faces all touch pairwise is
`h = (f−4)(f−3)/12` holes, whole only for `f` ≡ 0, 3, 4, 7 (mod 12) — which is
why the tetrahedron (4) and Szilassi (7) stood alone. **That count assumes each
pair shares exactly one edge.** Here eight pairs share two, which Grünbaum &
Szilassi call *overarching* and explicitly assume away.

So: this answers "is there a non-self-intersecting polyhedron with more than
seven faces, all of which share an edge with each other?" as that question is
usually written. It does **not** settle the `f = 12`, `h = 6` case the formula
is about — 44 corners, 66 edges, every pair meeting exactly once. Say both.

## The engine

`poly.js` is the [`../szilassi/`](../szilassi/) architecture with one more
plane: every corner is 3-valent, so every corner is where three face planes
cross, and **eight planes are the entire solid**. 8 × 3 = 24 numbers; the
similarities of space take 7; **17** shape freedoms, against Szilassi's 14.
Measured as a Jacobian rank, not counted.

Things not to break:

- **`facePairMeeting` compares against a SET of segments, not one.** Eight
  pairs are meant to meet in two edges, both lying on the one line where the
  two planes cross (the selftest verifies that), and none of the eight nonagons
  is convex, so a face can meet that line in several stretches. The
  single-interval logic the seven-faced page can get away with is wrong here.
  The test reports both `extra` (faces cutting through each other) and
  `missing` (faces coming apart along a shared edge).
- **`symmetrize()` flips the tilt sign at every step round an orbit.** An
  orientation-reversing map conjugates a rotation into the opposite rotation:
  `T R(e, a) T⁻¹ = R(Te, −a)`. Copy the knobs unchanged, as the /szilassi/ page
  correctly does for its *proper* half-turn, and the symmetry silently breaks —
  the selftest pins exactly that, by doing the naive copy and checking it fails.
- **`triangulateFace` drops zero-area ears.** Clipping some of these nonagons
  leaves three corners in a line; those triangles cover nothing and the
  renderer should not see them. Faces clip to 6 or 7 triangles, not always 7.
- **This solid is fragile.** Clearance is 4.1% of the radius, and nudging all
  eight planes by a twentieth of the radius breaks it more often than not — so
  the sliders are ±0.15, not the ±0.5 the seven-faced page can afford, and
  `jiggle` works at amplitude 0.02. A random ±0.25 sweep finds no solids at
  all, which is worth knowing before "fixing" a test that seems to find none.
- **Near-degenerate builds lose precision, not flatness.** A knob setting can
  drive a plane triple towards dependence and throw its corner thousands of
  times the size; those are the only configurations where the planarity
  residual rises above 1e-12, and the selftest counts them separately rather
  than pretending they do not exist.

## Deploying

[`../.github/workflows/deploy-math.yml`](../.github/workflows/deploy-math.yml)
stages this directory into `math/dist/equivelar/` and serves it at
**`math.mino.mobi/equivelar/`**. A push to the math surface's owning branch
that touches `equivelar/**` deploys it. The apex `mino.mobi/equivelar/` only
answers once the **root** surface next deploys from its own branch, which is
why the catalogue points at `math.mino.mobi` — same as `szilassi`, `csaszar`
and `conjectures`.
