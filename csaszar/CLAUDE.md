# /csaszar/ — seven points, no diagonals

Part of the **math** surface (`math.mino.mobi`); see [`../geometry/CLAUDE.md`](../geometry/CLAUDE.md)
for the pack and [`../CLAUDE.md`](../CLAUDE.md) for repo-wide rules. This page
is the **dual** of [`../szilassi/`](../szilassi/) and the two are meant to be
read together.

The Császár polyhedron: 7 vertices, 21 edges, 14 triangles, genus 1, and every
one of the 21 vertex pairs is an edge — so the solid has **no diagonals at
all**. Its skeleton is K₇ drawn on a torus. Same layout as the dual page:
object in the top two thirds of the viewport, controls in the bottom third.

## Run this first

```bash
node csaszar/poly.selftest.mjs    # ~3 s, 168 checks
```

`preflight.mjs` picks it up automatically for changed dirs. **It imports
`../szilassi/poly.js` as well as its own module**, on purpose: the duality is
one of the things it checks, so a change on either page that breaks it fails
here.

## The one idea, and how it inverts the dual page

| | `/szilassi/` | `/csaszar/` |
|---|---|---|
| the object is | 7 **planes** | 7 **points** |
| flatness | bought by construction — corners are plane triples | free — three points are always coplanar |
| 21 numbers | 7 planes × (normal, offset) | 7 points × (x, y, z) |
| minus 7 similarities | **14** shape freedoms | **14** shape freedoms |
| what can go wrong | the hexagons stop bounding a solid | the triangles stop bounding a solid |

So on this page there is nothing to construct: `build()` adds the knobs to the
points and that is the whole geometry engine. What this page has instead is a
**classification**.

## The four, and why you cannot deform between them

For each of the 35 quadruples of corners, record which side of the plane of the
first three the fourth lies on. Those 35 signs are the oriented matroid.

> **No solid can have four corners in one plane.** Every pair of corners is an
> edge, so four coplanar corners put two whole edges in one plane, and two
> edges of a complete graph in one plane have to cross. A crossing is not a
> solid.

Hence along any continuous path of solids the 35 signs never touch zero, so
they never change: **different signs means different connected piece of the
realization space.** The *walk* tab walks straight at another realization and
shows where the wall is; the selftest asserts all 12 ordered pairs hit one, and
that a walk from a shape to itself never does.

`PRESETS` are Szilassi's four models, taken verbatim from
`jgypk.hu/tanszek/matematika/polieder/toroid/Csaszar/Cs1.wrl` … `Cs4.wrl`. The
first is labelled there *"the original variant — these are the coordinates Ákos
Császár published in 1949"*. They differ in exactly one visible way: **the
order in which the three mirror pairs and the lone corner stack up the symmetry
axis**, which the selftest recomputes from the z-coordinates and checks against
each preset's `stack` string.

Two of them (III and IV) are published a hair off the half-turn — 16.7 against
16.97, 11.414 against 11.314. **That is kept as published**, and the selftest
pins the deviation rather than tidying it away.

## How many are there really? Not four.

Some secondary sources say there are four essentially different Császár
polyhedra. There are not; four is the number of models Szilassi drew.
Bokowski & Eggert, *All realizations of Möbius' torus with 7 vertices*,
Topologie Structurale 17 (1991) 59–78, enumerate **72** oriented matroids up to
equivalence, and all are realizable (see Hougardy, Lutz & Zelke,
[*Polyhedral Tori with Minimal Coordinates*](https://arxiv.org/abs/0709.2794),
which also records that this triangulation is neighbourly, so every realization
of it is automatically in general position).

`census.mjs` checks that from here:

```bash
node csaszar/census.mjs --rolls=24000000 --seed=11   # ~4 min
```

24,000,000 uniform rolls gave 4,139 solids — about **1 in 5,800** — falling into
**62** distinct types, with all four published ones among them. The page quotes
those numbers. Re-run it before changing them.

## Things worth knowing before editing

- **The acopticity test must stay the line walk.** Two triangles meet only on
  the line where their planes cross; walk it, span each triangle, compare. The
  case that catches naive code is **parallel planes**: distinct parallel planes
  never meet and are perfectly fine — the two far triangles of an octahedron
  are the everyday example — while coincident ones are fatal. Getting that
  wrong makes the test reject valid solids, and an octahedron is the cheapest
  thing to catch it with.
- **The selftest carries a second, independent verdict**, built a different
  way: no two edge-sharing triangles coplanar, every vertex link a simple
  closed spherical polygon, and no edge piercing a triangle it shares no vertex
  with. The two have to agree on 3000 random configurations and on all four
  presets. Don't delete it — it is the only thing standing between a subtle
  tolerance bug and a page that lies.
- **`symmetrize()` rotates, it does not copy.** These knobs are displacements
  of points, so a mirror partner's knob is the *rotated* displacement: +x on
  one side is −x on the other. (The dual page's knobs turn planes, and there
  the tangent frames are built C2-equivariant so the same job is a plain copy.
  Same symmetry, opposite bookkeeping — this was a real bug, caught by the
  selftest.)
- **Colours are per corner, and the triangles blend their three.** Because
  every pair of corners is joined by an edge, every pair of colours meets along
  one — the seven-colour fact the dual page states with its faces. The palette
  is byte-identical to `szilassi/poly.js`'s `FACE_COLOURS` and the selftest
  checks it has not drifted.
- **The camera fit is silhouette-based, maximised over yaw**, same as the dual
  page and for the same reason. See `../szilassi/CLAUDE.md`.

## Deploying

[`../.github/workflows/deploy-math.yml`](../.github/workflows/deploy-math.yml)
stages this directory into `math/dist/csaszar/` and serves it at
**`math.mino.mobi/csaszar/`**. A push to the math surface's owning branch that
touches `csaszar/**` deploys it. The apex `mino.mobi/csaszar/` only answers
once the **root** surface next deploys from its own branch, which is why the
catalogue points at `math.mino.mobi` — same as `szilassi` and `conjectures`.
