# IRIS⁴

A rainbow you shape. You walk a four-dimensional landscape just after rain,
grained by tiny tesseract voxels, Kelvin's foam or the 24-cell foam, with the sun low behind you. You see the 3D slice of it
you're standing in, and the bow on your screen is a conic section whose shape is
set by how you're turned. An understanding toy, like Foam⁴ and Lumen⁴.

## The idea

The rainbow is every direction about 42° from the point opposite the sun: a
cone in 4D. Who moved doesn't matter. Only that antisolar direction in your own
camera's frame does, a = (a_F, a_R, a_U, a_N):

- the bow is in your slice if and only if |a_N| ≤ sin θ;
- on your screen it's a conic with **e = √(a_R² + a_U²) / cos θ**: an ellipse
  below 1, a parabola at 1, one branch of a hyperbola above.

So **turning** (and looking up and down) changes the shape, and so does
**twisting** (right toward w). **Looking into w** (forward toward w) can't: it
leaves a_R and a_U alone, so the bow keeps its shape while it shrinks and
slides, until it's gone. Moving the **sun** (height, bearing, lean into w) does
the same from the other side. The dashed gold line is the conic the formula
predicts, drawn over the rendered bow. The map in the panel plots where you
are: off in w (|a_N|) against across your screen (√(a_R² + a_U²)), with the
parabola line between hyperbolas and ellipses, and no bow past sin θ. The
derivation and its checks are in [Lumen⁴](../lumen4/README.md).

## The world (`js/world.js`)

- **The ground** is a heightfield over x, z and w: 192 × 192 × 64 cells, each
  0.25 m across, and each a column of voxels. Any slice through you that keeps
  your up is a landscape of little cubes. It's built from three octaves of value
  noise (hills, ridges, roughness), periodic so the world wraps with no seam,
  in about 0.3 s. Below the water level the ground is a lake.
- **The march** is two-level: a DDA over blocks of 8³ cells skips any block
  whose tallest column the ray stays above, and inside the rest a DDA steps
  through cells. A column met right at a block's edge is met on the side the
  ray crossed into the block. The selftest caught an early version reporting
  it as a top. `march()` is the JS twin of the shader's, line for line, which
  is what lets the selftest check it.
- **The other foams.** The same land can be grained by Kelvin's foam (A₄*,
  whose cells are permutohedra) or the 24-cell foam (D₄), PLATEAU's other two
  seed crystals, chosen under "the land". The lattices are Foam⁴'s, scaled to
  cells 1.4 voxels each way. A cell is ground when its seed lies under the
  land's height at the seed's column; under a lake a little deeper, so you meet
  the water. A ray walks the foam cell by cell, leaving each through the
  nearest of its facets (the bisector planes to its relevant neighbours: 30
  for Kelvin, 24 for the 24-cell, half of them facing any given ray, worked out
  once per ray). So what you see are the foam's own facets cut by your slice:
  hexagons on Kelvin's tops, and the 24-cell's own tiling. The edges are drawn
  where two of a cell's facets meet.
  - **Skipping blocks** works as in the tesseract march, but on the tallest
    column of a block and its neighbours, plus a cell's circumradius (measured,
    with 10% more). Then the cell the walk resumes in is always air.
  - **Keeping the cell.** The walk keeps its cell from block to block, and a
    steep ray that runs long inside one block carries on rather than giving up.
  - **No wrapping.** The lattices don't repeat on the world's box, so in a foam
    you don't wrap: the land's heights repeat every 48 m, but the foam under
    them never does.
  - **Your ground** is the foam's, the first solid cell straight down.

  `marchFoam()` is the shader's twin, line for line.
- **Walking.** Your eye is 1.7 m over the ground. You step up at most 0.5 m;
  a cliff stops you and you slide along it, each axis tried on its own. The
  world wraps under you.

## The drawing (`js/render.js`)

- **The land.** The sun is low: warm light where it falls, the sky's blue in
  the shade. There's grass with wildflowers on the tops and earth under it,
  sandstone in strata on the cliffs, stone higher up and snow on the peaks.
  Each voxel's faces are seamed.
- **Fae colours.** A surface's tint follows how far off in w it lies from you.
  Squared up to the grid, everything you see is at your own w and the land
  looks natural. Lean into w and the distance turns teal, violet, rose and
  gold.
- **The sky and the bows.** For each direction, ψ is its 4D angle from the
  antisolar point. Each of eight wavelengths has a narrow primary band at
  θ₁(λ) (40.3° violet to 42.3° red) and a secondary at θ₂(λ) (about 51°,
  colours reversed), from Lumen⁴'s `rainbowAngle` and `rainbowAngle2`. The rain
  is brighter inside the primary and darker in Alexander's band between them.
  The bow hangs in front of far hills too, and the lakes mirror it.

## Controls

- **Desktop:** WASD walk, the mouse turns and looks (click to grab it), Z/C or
  the wheel twist, Q/E look into w, X squares up.
- **Phone:** the view is the top two thirds and the controls the bottom
  third. The stick walks, dragging turns and looks, and the buttons twist, look
  ana and kata, and square up.
- **The panel** also holds the sun's height, bearing and lean into w, and
  toggles for the fae colours, the second bow and the conic.

## Checks

```bash
node games/iris4/test/iris4.selftest.mjs   # ~10 s
```

- the land is deterministic, within its heights, and wraps with no seam in x,
  z or w;
- every block holds its tallest column;
- the two-level march agrees with brute-force stepping on 120 rays, including
  ones that cross a seam and ones straight along an axis;
- every face it reports is met from outside, and a top at its column's height;
- walking never climbs more than a step, stays in the wrapped world, settles
  to eye height, and slides along a cliff;
- for both foams: the circumradius bounds every point's distance to its seed;
  the facet-to-facet march agrees with brute force (near-vertical rays too) and
  meets every facet from outside; the ground under a point is the first solid
  cell straight down; and walking on it never climbs more than a step;
- under a lake nothing near the surface is ground;
- the shader's grid and blocks are `world.js`'s.

The bows' physics (both angles against the closed form
cos²i = (n² − 1)/(k(k + 2)), and the conic in any frame) is checked in
Lumen⁴'s selftest.

## Next

- Long shadows from the low sun: one more march per pixel, toward the sun.
- Bows from a sun you can see: a 4D sun is a point, so it's in your slice only
  at exactly β = 0. Its glow is all you get otherwise.
- A 4D creature's view: the bow on a 3D sensor is a quadric (a spheroid,
  paraboloid or hyperboloid), and your screen is a slice of it.
