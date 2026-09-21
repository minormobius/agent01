# /szilassi/ — seven faces, every pair touching

Part of the **math** surface (`math.mino.mobi`); see [`../geometry/CLAUDE.md`](../geometry/CLAUDE.md)
for the pack it belongs to and [`../CLAUDE.md`](../CLAUDE.md) for repo-wide rules.

The Szilassi polyhedron: 7 hexagons, 21 edges, 14 corners, genus 1, and every
one of the C(7,2) = 21 face pairs sharing an edge. It and the tetrahedron are
the only two polyhedra known with that property. The page is a WebGL model you
turn with a finger — **object in the top two thirds of the viewport, controls in
the bottom third**, which is what the layout is built around; a wide viewport
flips it to canvas-beside-panel.

## Run this first

```bash
node szilassi/poly.selftest.mjs    # ~1 s, 449 checks
```

`preflight.mjs` picks it up automatically for changed dirs.

It asserts the combinatorics (7/21/14, χ = 0, all 21 face pairs adjacent, every
corner 3-valent, the seven cycles orient the surface), that the edge graph is
the Heawood graph (cubic + bipartite + girth 6 pins it uniquely), that the
published coordinates are planar to the last bit of a double, that planes and
vertices round-trip exactly, that the half-turn permutes faces and vertices as
claimed, the measured degrees of freedom, and that every preset still has the
clearance and dihedral it advertises.

## The one idea

Like [`../cohomology/`](../cohomology/) and [`../voronoi/`](../voronoi/), the
maths is an ES module — **`poly.js`** — that the page loads with
`<script type="module">` and `poly.selftest.mjs` imports unchanged. There is no
second copy to drift.

Everything in it follows from one observation:

> Every corner has degree 3, so every corner is where three face planes cross.
> There are only seven faces. **Seven planes are the entire solid.**

So the model is 7 × (unit normal, offset) = **21 numbers**, `verticesFromPlanes`
intersects the right triples, and that is the whole geometry engine. Nothing is
solved for, nothing is relaxed, and **the faces are planar by construction** —
the selftest drives 400 random configurations through it and the worst
out-of-plane residual stays below 1e-12.

## Degrees of freedom

Because 21 numbers describe the solid and 7 similarities of space (3 slide,
3 turn, 1 scale) change where it is but not what it is, the Szilassi polyhedron
is a **14-parameter family** and the published solid is one point in it. With
the 180° symmetry held, **7**. `degreesOfFreedom()` measures both as the rank of
d(corners)/d(knobs) rather than counting on paper, and the page reports them
live; the selftest checks they do not change away from the published point.

What deformation cannot break is flatness. What it can break is the *solid*:
the acoptic region is an open piece of the 14, and not a large one.

## Acopticity — and the shortcut that does not work

Two faces lie in two planes, so they can only meet on the line where those
planes cross. `facePairMeeting` walks that line: mark every place either
hexagon's boundary touches it, test the midpoint of each stretch for being
inside both, and what both cover *is* the intersection. It must be exactly the
shared edge.

**Do not replace this with the cheap one-sided test.** "All the other corners of
each face are strictly on one side of the other's plane" is *sufficient* but not
necessary, and the published solid fails it: faces 1 and 2 each have corners on
both sides of the other's plane and still meet only along their shared edge.
These hexagons are not convex. The selftest pins that case.

`closestApproach` is the separate *margin* — the nearest a corner comes to a
face it is not a corner of — and it is what the verdict chip shows as
"clearance". The reference solid has only 3.8% of its radius to spare.

## Things worth knowing before editing

- **The published numbers are exact.** `REFERENCE_VERTICES` is Table 3 of
  Grünbaum & Szilassi, *Geometric realizations of special toroidal complexes*,
  Contributions to Discrete Mathematics 4 (2009) 21–39
  ([open access](https://doi.org/10.11575/cdm.v4i1.61986)). Do not "tidy" them.
- **`FACES` is the published face list re-oriented**, so all seven cycles induce
  the same orientation and `planeOfFace`'s normal points out of the solid for
  every face at once. `orientFaces` is exported so the selftest re-derives it
  rather than trusting the constant.
- **`TILT_BASIS` is C2-equivariant on purpose.** The tangent basis of a face is
  the exact mirror of its partner's, which is the only reason `symmetrize()` can
  be a plain copy of three numbers.
- **The camera fit is silhouette-based, maximised over yaw.** This solid is a
  thin wedge — fitting its bounding sphere wastes two thirds of a phone screen,
  and fitting the current silhouette makes it pulse while it spins. Fitting the
  worst silhouette over a full turn is what keeps it both large and steady. The
  vertical offset is then re-centred at that distance, which can only shrink the
  projected extent, so it cannot spoil the fit.
- **Culling is off and the shader is two-sided.** You look through the tunnel of
  a torus; interior faces are shaded darker and cooler so the inside reads as
  inside.
- **Presets are re-measured, never trusted.** `search.mjs` finds them offline;
  the selftest rebuilds each from its knobs and checks the clearance and
  dihedral it claims.

## Regenerating the presets

```bash
node szilassi/search.mjs              # all objectives
node szilassi/search.mjs --only=roomy
```

Paste the printed block into `PRESETS` in `poly.js` **together with its measured
clearance and minDihedral**, then re-run the selftest.

## Deploying

This directory is staged into `math/dist/szilassi/` by
[`../.github/workflows/deploy-math.yml`](../.github/workflows/deploy-math.yml);
it is also served from the repo root, so the page lives at both
`math.mino.mobi/szilassi/` and `mino.mobi/szilassi/`. A push to the math
surface's owning branch that touches `szilassi/**` deploys it. Adding a file
here needs no workflow change; adding a *sibling* directory does — the staging
loop names its directories explicitly.
