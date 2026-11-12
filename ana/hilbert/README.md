# HILBERT⁴

The Hilbert curve on the unit tesseract, at ana.mino.mobi/hilbert/.

## What it shows

Cut the unit n-cube into a 2^b-per-side grid. The order-b Hilbert curve is a path through every one of the 2^(n·b)
cells, each step to a cell sharing a face. At order 1 in 4D it walks the tesseract's 16 corners as a Gray code, flipping
axes in the ruler sequence `w z w y w z w x w z w y w z w`, and ends one edge along x from where it began. At order b it
is that walk with each corner replaced by a turned, reflected copy of the order-(b−1) curve, each copy starting where
the last ended.

Its index in base 2^n reads the nesting: digit k picks which of the 2^n sub-cubes the cell is in at level k. The page's
readout shows that, and each axis's coordinate in binary.

## Construction

`js/hilbert.js` follows John Skilling, *Programming the Hilbert curve*, AIP Conf. Proc. 707, 381 (2004):

1. Deal the index's n·b bits round the n axes, most significant first ("transpose").
2. Gray-decode across the axes.
3. For each bit scale Q from 2 up: if axis i has bit Q, reflect axis 0's lower bits; otherwise exchange the lower bits of
   axes 0 and i.

The inverse runs the same steps backwards. No tables, no recursion, any n.

## Claims and checks (`test/hilbert.selftest.mjs`)

For n = 2 and 3 at orders 1–6 and n = 4 at orders 1–4:

- every cell visited exactly once, all inside the grid;
- every step changes one coordinate by one;
- `pointToIndex` inverts `indexToPoint`;
- it starts at the origin's corner cell and ends at a corner one edge away;
- **self-similarity**: blocks of 2^(n·k) consecutive cells fill aligned 2^k-cubes, and those cubes in order are the
  order-(b−k) curve, for every k;
- 2D order 1 is the U; 4D order 1 flips axes in the ruler sequence;
- path length is (2^(n·b) − 1)/2^b in the unit cube;
- locality, measured: the worst |Δx|⁴/Δh over all pairs at 4D orders 2 and 3 is held under 100 (17.8, then 44.5).
  The limit isn't computed; this only catches a regression.

And the view maths: rotations stay orthogonal, `turn4` there and back returns home, the n-cube has 2^n corners and
n·2^(n−1) edges.

## Controls

Drag turns in xz/yz; "into w" (or shift, or the `w` key) turns in xw/yw. Pinch or wheel zooms. Space plays the trace,
`r` resets the view. The slice shows cells with |w − w₀| under the thickness, in the turned frame, so turning into w
moves cells through it.
