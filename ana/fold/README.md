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
