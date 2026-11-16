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
