# FOLD

Origami one dimension up, at ana.mino.mobi/fold/.

## nets

The tesseract's 8 cubic cells (normals ±e₁…±e₄, edge 1) each share a square with the 6 that aren't opposite: the
cells' adjacency is the 16-cell's edge graph K₂,₂,₂,₂ (24 hinges). A net keeps 7 hinges, a spanning tree:
**82,944** of them (2⁶·4²·3⁴). `js/fold.js` unfolds each: the root cell (−w) stays in our space (x₄ = −½), and a child
turns a quarter turn about its hinge square (the plane where x·n_parent = ½ and x·n_child = ½), in the plane of the two
normals, from standing inside the tesseract to lying flat beyond the square; motions compose down the tree (`motions`).
None overlaps, and they make **261** shapes up to congruence (Turney, 1984; `canonicalCubes` over the cube's 48
symmetries), **455** counting mirror images apart (194 chiral pairs, 67 achiral). Dalí's net (Corpus Hypercubus: a
column of four with four round the second) is `daliNet`. `tools/build-nets.mjs` writes `js/nets-data.js` (GENERATED,
~30 s): each net's hinge tree, flat cube centres, longest row, how many trees give it, and whether it's chiral.

The page folds any of them (slider, ▶): in the **shadow** (perspective from an eye out in w, set beyond the furthest
the net reaches while folding, so the view stays steady; faces see-through, so the folded tesseract is its cube in a
cube) or the **slice** (our space: a cube turning about a hinge that lies in our space leaves it at once, all but the
hinge; push the lever ana to catch the rising cubes as cross-sections). Hinges gold.

## the 24-cell

The tesseract is all-net; the 24-cell isn't. This mode folds the 24-cell's unfoldings (`unfold4.js` `motionsAt`: every
hinge turned by t of its full angle, composed down the tree; `cellFaces`: each octahedron's 8 triangles) with the frame
set so your slice is the root cell's hyperplane, where the flat unfolding lies. **the collision** is the overlapping
unfolding found by search (`unfold4-data.js` `OVERLAP_24`): two octahedra red, and a gold cross at the witness point,
inside both by 0.085. Fold it up and they pull apart into w. **a net** is `NET_24`. **draw a random one** draws a
spanning tree as the search did (three in four long winding DFS trees, one in four bushy BFS), says whether it
collides, and keeps a tally (expect about 1 in 23). Framing eases from the flat layout to the closed 24-cell as it
folds. `#24` opens it.

## mirror

`turnXW`: half a turn in the plane of x and w brings a solid back into our space with x reversed, its mirror image.
The page turns the snub dodecahedron or one of the chiral Johnson solids (J44–J48) through w onto a gold wire of its
mirror image. `congruence(A, B)` matches point sets by every vertex-and-neighbour frame and says whether a rotation or
only a reflection does it: for these six, only a reflection.

## Checks

`node ana/fold/test/fold.selftest.mjs` (15 checks, ~40 s; `V=1` prints each): 8 cubes and 24 hinges, every cell on the
boundary; 82,944 trees, none overlapping, 261 nets, 455 with mirrors apart, the shipped data the same; Dalí's among
them; folding rigid (8.9·10⁻¹⁶), hinged at every angle, closing exactly into the tesseract and lying flat in w = −½; the
xw half-turn is the mirror, rigid on the way; the snub dodecahedron chiral; exactly J44–J48 chiral among the 92.

Imports `../../johnson/js/johnson-data.js` (same site). Controls are CAD⁴'s, as on JOHNSON.

## Ridge unfoldings in 4D (an experiment, not a proof)

Whether every convex polytope has a **net** (an unfolding cut only along faces of codimension 2, with no overlap) is
open in every dimension ≥ 3: Dürer's problem, posed formally by Shephard (1975). With arbitrary cuts it's settled:
every convex polytope, in every dimension, has a non-overlapping unfolding (Miller and Pak, 2008, by the source
unfolding). The weaker question "is *every* ridge unfolding a net?" ("all-net") has answers for the regular
4-polytopes: yes for the simplex, tesseract and 16-cell; no for the 600-cell (Devadoss and Harvey); the 24-cell and
120-cell were conjectured no, and recent preprints claim them.

`js/unfold4.js` (no DOM) unfolds any 4-polytope given by vertices and cell normals along any spanning tree of its
cells (`unfold`: each child turned about the shared ridge, in the plane of the two normals, by the angle between
them) and finds overlaps by clipping (`overlaps`, `overlapVolume`), with a `witness` point strictly inside two
overlapping cells. `js/unfold4-data.js` holds what a random search found, re-checked by `test/unfold4.selftest.mjs`:

- calibration: random unfoldings of the tesseract are all nets (it's all-net);
- the **24-cell** has an overlapping unfolding (cells 9 and 13 share volume 0.079; a witness point is inside both by
  0.085, against rounding error ~10⁻¹⁴): independently confirming it is not all-net. In a run of 5,001 random
  spanning trees (three quarters long DFS trees), 219 overlapped and 4,782 were nets;
- the **600-cell** has a net: 600 tetrahedra in an 8.3 × 8.3 × 8.6 region of our space, rigid, hinged, no two
  overlapping (checked by clipping to 10⁻⁹ in volume, and again by sampling points). Every "radial" tree (each cell's
  parent its neighbour nearest the root cell) and every random BFS tree tried was a net; every long DFS tree overlapped.

Limits: double precision, not exact arithmetic (the overlaps are far above rounding; the net's "no overlap" means no
overlap above 10⁻⁹ in volume, with exact contacts where cells touch). And none of this decides Dürer's problem.

### The counterexample hunt (on the runners)

`tools/netsearch.mjs` hunts for a convex 4-polytope with **no** net. Each shard draws polytopes from its own seeded
stream (hulls of points on the 3-sphere; hulls of random half-spaces' vertices; either stretched up to 40× along a
random axis; and, a third of the time, mutations of the shard's hardest so far: nudged vertices or further stretching,
so the search climbs toward polytopes whose nets are rarest). For each with 5–12 cells it samples spanning trees until
one is a net; if 300 samples find none, it enumerates every spanning tree (`eachTree`; `treeCount` is Kirchhoff's
count, checked against enumeration on the tesseract: 82,944 both ways), stopping at the first net. A polytope with
none would be written out whole as a **candidate**, to be checked in exact arithmetic before anyone believes it.
Hardness is the rate of nets among 200 sampled trees. Resumable: its state is `$TMPDIR/ana-netsearch/<shard>.json`.
It runs on GitHub's runners through `.github/compute/ana.json` (see `.github/compute/README.md`); `report` summarises.

A 90-second local trial: 7,942 polytopes, every one netted within 9 random tries; a minute of hill-climbing drove a
lineage of stretched 11-cell polytopes down to nets in 6% of sampled trees. Nothing found, which is what to expect:
finding nothing is evidence, not proof.

## Folding without collisions

Turning every hinge at the same rate (*all at once*) folds 228 of the 261 nets cleanly, but in the other 33 some cubes
pass through each other near the end, up to a tenth of a cube deep. A cube several hinges from the bottom has turned by
a composition of partial turns in different planes, and on the way that path can sweep it through a cube it will only
meet edge to edge when everything is home. *Ring by ring* (`hingeAngles(parent, t, true)`) folds the bottom cube's
neighbours first, carrying their subtrees flat, then the next ring out: every part already folded is in its final place,
and the ring that's moving turns about squares on it. None of the 261 collide that way.

Checked by `js/clash.js` `depthCells`: for each pair of cells, the deepest point inside both (0 is touching, along a
hinge, an edge or a corner; negative is apart). Two hyperplanes in 4D meet in a 2-plane or coincide, so this is a linear
programme in 3 or 4 variables, solved by trying every vertex (a small simplex was tried first and misreported touching
cells, judged against HiGHS). The page runs it every frame and colours a clashing pair red; the
selftest checks it against hand answers and makes both claims at 48 moments of every fold. It was cross-checked
against scipy's HiGHS on all 261 nets at 96 moments (agreement to 2·10⁻¹¹).

This is a measurement for the tesseract's nets, not a theorem. For 3D polyhedra, continuous non-colliding folding
("blooming") is a studied question (Demaine, Demaine, Hart, Iacono, Langerman and O'Rourke, *Continuous blooming of
convex polyhedra*, 2011); the same switch works on the 24-cell (`motionsAt(P, parent, t, ring)`): over 200 random nets (75% DFS, as the
page draws), all at once 148 have octahedra passing through each other, up to 0.50 deep on an edge of √2; ring by ring,
none (deepest 4·10⁻¹², rounding). HiGHS agreed with all 148 to 10⁻¹⁵. A sample, not a proof.

## Duoprisms

The p,q-duoprism (`unfold4.js` `duoprism`) is a p-gon times a q-gon, edges 1: pq vertices, p q-gonal prisms (cells
0…p−1, one over each edge of the p-gon) and q p-gonal prisms (cells p…p+q−1). Each prism meets its two ring neighbours
on a polygon and every prism of the other ring on a square, so the two rings close into two solid tori, linked. The page
(mode *duoprism*, `#duo5,6`, p and q from 3 to 12) is the 24-cell's machinery made general: `solid`, `setPoly` and
`buildPoly` in `main.js` serve both, with a hinge polygon of any size (`ringOrder`).

Measured (the selftest re-checks the first three and the 8,8 overlap):

| | |
|---|---|
| 4,4 | the tesseract: 82,944 hinge trees, all nets |
| 3,3 · 3,4 · 3,5 · 3,6 | all-net: every one of 1,296 · 8,575 · 53,824 · 326,592 unfoldings checked |
| 4,6 · 5,5 · 5,6 · 4,8 · 3,12 | 0 overlaps in 2,000 random unfoldings each (not a proof) |
| 6,6 · 4,12 | 28 and 15 of 2,000 overlap; 5,8 · 8,8 · 10,10: 9, 26, 64 of 200 |

Folding: all at once, prisms cross in many sampled nets; ring by ring, in none sampled (3,3 to 10,10). Kirchhoff's counts
for the big ones are floating point (the page says "about").

**The quick separating test.** Big duoprisms made the clash check slow (most nearby pairs only touch, and the exact test
enumerates vertices of a small LP). `depthCells` now first projects both cells' vertices on each face normal lifted into
4D and both hyperplane normals; a gap rules the pair out. A direction along which both cells are flat (two cells in one
hyperplane, along its normal) is skipped: an early version counted it and missed real crossings, caught by comparing
against the exact answer on 22,524 pairs. The selftest keeps that comparison.

## The grand antiprism

Conway and Guy's (1965) one convex uniform polytope that Wythoff's kaleidoscope can't build. `unfold4.js`
`grandAntiprism()` makes it from the 600-cell (`h600` from JOHNSON's `poly.js`, edge 1) by deleting the 20 vertices on two
completely orthogonal great decagons, then finds its facets directly: every hyperplane through four nearby vertices
(within 2.05) with all 100 on one side, merged by vertex set. Half a second; the page builds it on first use. Checked by
the selftest: 100 vertices, 500 unit edges, 700 triangles and 20 pentagons, 300 tetrahedra and 20 pentagonal antiprisms,
Euler, and the antiprisms joining pentagon to pentagon into two rings of ten. About 3.59 × 10¹⁷⁸ hinge trees.

Measured: every one of 40 random winding (DFS) unfoldings overlaps, with witnesses up to 0.35 deep on an edge of 1; none
of 40 bushy (BFS) ones does. Folding 8 bushy nets at 15 moments, all at once 7 have cells crossing (up to 0.11 deep);
ring by ring none. The page draws bushy trees for "a net" and winding ones for "find an overlap", and marks the deepest
witness of the first 30 overlapping pairs.

**Speed.** `motionsAt` now composes each cell's motion as one affine matrix instead of a chain of closures: on a winding
tree 255 hinges deep that made every point cost 255 calls, and turning the view took 260 ms a frame (43 ms now). The page
also keeps each solid's 4D vertex positions until the fold changes.
