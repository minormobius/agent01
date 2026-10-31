# Foam⁴

A toy for seeing a four-dimensional Voronoi foam, one 3D slice at a time, at
[games.mino.mobi/foam4/](https://games.mino.mobi/foam4/). It's not a game:
it's for getting a feel for the thing.

## What it shows

A **4D Voronoi foam** is a set of seeds scattered through four dimensions,
each owning the points nearer to it than to any other seed. Each owned region
is a cell, a convex 4D polytope, and the cells fill 4D with no gaps. You see a
**3D slice** of it, inside a box you can orbit.

- **A slice is a foam, but not a Voronoi one.** A seed a distance *h* off the
  slice lands at *q* in it. For a point *x* in the slice, |*x* − *s*|² =
  |*x* − *q*|² + *h*², so the seed competes with a handicap of *h*². This is a
  **power diagram** (Laguerre tessellation), and every power diagram is a
  slice of a Voronoi foam one dimension up. Seeds near the slice own big
  cells; far ones own small cells or none. The seeds are drawn as dots,
  bigger the nearer the slice.
- **A generic 4D foam's slices obey Plateau's laws, topologically.** In a
  generic 4D foam, 3 cells share every 2-face, 4 every edge and 5 every
  corner. So in every slice, 3 cells share every edge and 4 every vertex.
  The selftest checks this on the random foam.
- **Sweeping w changes only the handicaps,** and the foam changes shape in
  exactly three ways. They happen as the slice passes a 4D corner, a point
  equally near five seeds:
  - a cell is **born** as a tiny tetrahedron where four cells met;
  - a cell **dies**, shrinking to a point;
  - a face **flips**, closing to an edge between three cells, or an edge
    opening into a face.

  These are the four Pachner moves (1–4, 4–1, 2–3, 3–2) on the dual
  triangulation. Real 3D foams coarsen by the deaths and the flips. The page
  counts them exactly as you sweep.

## The species

All four have one seed per unit of 4D volume, so their cells are the same size
on average.

| | cell | |
|---|---|---|
| **random** | irregular | a jittered grid (one seed per unit cell of Z⁴, moved by up to half a cell, the most for which its 80 surrounding seeds are exactly its possible neighbours). Generic, so it's foam-like everywhere. Jitter 0 is the tesseract foam |
| **A₄\*** | the 4D permutohedron: 30 facets (10 truncated octahedra, 20 hexagonal prisms) | the **4D Kelvin foam**. Its 3D cousin A₃\* is the body-centred cubic lattice, whose cell is Kelvin's truncated octahedron. Sliced square to w at w = 0, it *is* Kelvin's foam (the selftest pins it). 5 cells at every corner |
| **D₄** | the 24-cell: 24 octahedral facets | the densest lattice packing in 4D. Many cells crowd each corner: a crystal |
| **Z⁴** | the tesseract | sliced square to w, unit cubes |

## The controls

| | |
|---|---|
| **w** | moves the slice along its normal; **sweep** plays it |
| **tilt** | turns the slice's normal away from w, through x, y and z; *along (1,1,1,1)* points it down the long diagonal |
| **glass** | every membrane translucent, edges bright |
| **solid block** | the box as a block cut from the foam |
| **one cell** | glass, with the cell at the centre solid |
| **box** | the size of the window |

The readout gives:
- the cells in the box, and how many are clear of its walls;
- the centre cell's faces by their number of sides, its corners, and how
  far its seed is off the slice;
- the tally of births, deaths and flips since you last moved anything but w,
  with a log of the latest.

## How it works

| | |
|---|---|
| `js/foam.js` | the geometry, no DOM. The species (each lattice scaled to unit covolume, with its Voronoi-relevant vectors: 30, 24, 8), the nearest seed (round in basis coordinates, then walk down the relevant vectors; it ends at the nearest), the slice frame, and `slice()`: each candidate cell clipped from the box by its bisector planes, in slice coordinates with the h² handicap, exact |
| `js/slice-worker.js` | runs `slice()` off the page's thread |
| `js/render.js` | one fragment shader that ray-traces the slice. A ray starts in the cell of the seed nearest where it enters the box and leaves where it first crosses a bisector with a neighbour, so it steps membrane by membrane, exactly, with no mesh. The random seeds' jitter is an integer hash the shader computes exactly as `foam.js` does |
| `js/main.js` | the controls, the orbit camera, the seeds, the readouts, the event tally |
| `test/foam4.selftest.mjs` | unit covolume and relevant vectors; nearest vs brute force; every slice partitions its box exactly; Plateau's topology in the random foam; A₄\* sliced square to w is Kelvin's foam, Z⁴'s is cubes; sweeping back undoes every event |

```bash
node games/foam4/test/foam4.selftest.mjs   # a few seconds
```
