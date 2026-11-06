# CELL

A cell's membrane in 3D and in 4D, side by side: `kata.mino.mobi/cell/`.

## The model

The membrane is star-shaped round the centre: a radius `r(n)` for every direction `n` on the sphere S^{d−1}. The sphere
is gridded as a cube-sphere (2d faces, each an equi-angular grid: 6 × 24² in 3D, 8 × 12³ in 4D). Each patch moves along
its normal at

    v = μ (P − σ H + f)

- `H` is the mean curvature, (d − 1)/r − Δ_S r / r². The Laplacian uses least-squares weights fitted in each node's
  tangent coordinates over its two rings of neighbours. The plain axis-neighbour stencil was badly wrong at the seams.
- `σ` is the cortex tension (1 at rest). The presets change it.
- `f` is any other push, such as a contractile ring's or a belt's pull.
- `P` is the pressure. It is the Lagrange multiplier that keeps the volume fixed. A uniform shift then restores the
  volume exactly every step.

The curvature term is stepped implicitly, with Jacobi sweeps.

## What it shows

- **Laplace's law is P = σ(d − 1)/R.** The same tension squeezes a 4D cell 1.5× as hard. Its membrane per volume is
  d/R, so a 4D cell carries a third more membrane than ours.
- **A ring can't divide a 4D cell.** A 1D loop of tension pinches our cell's equator (waist 0.37). In 4D the equator
  is a 2-sphere, and a ring is only a great circle on it, so the cell is dented (0.60 at the ring) while the equator
  away from it stays out (1.08). To divide a 4D cell you need a *belt*, a contractile 2-sphere, which pinches it to
  0.17.
- The pseudopod (reach), rear contraction, wave and bleb run in both dimensions.

## The nucleus

The nucleus is a stiff ball, a 4-ball in 4D. It is part of the physics, not painted on:

- **The membrane can't pass it.** Within a soft zone the membrane is pushed outward, and that push is in the
  pressure balance like any other force. At a hard limit the membrane is held exactly: for each direction, the ray from
  the centre leaves the nucleus at a known distance, and the membrane may come no nearer than that plus a small gap.
- **It is pushed back.** The membrane's push on the nucleus moves it, slowly, through the cytoplasm.
- **It is centred.** The cytoskeleton pulls it toward the cell's centre of mass. In a reach that centre moves forward,
  so the nucleus is carried into the pseudopod. In a rear contraction the back pushes it forward.
- **It divides.** Under divide or ring it splits at t = 1.5 into two daughters, each with half the volume (radius
  0.34 × 2^(−1/d)), and each goes to the centre of mass of its own half. In 3D they end up one per lobe. In 4D the
  belt does the same; under a ring the cell keeps both nuclei in one body.

The selftest holds the membrane clear of every nucleus in every preset.

## Moving: crawl and hunt (PROTEUS's amoeba, in d dimensions)

This builds on [`pokemon/proteus/`](../../pokemon/proteus/README.md), the amoeba-qualia prototype: a pressurised
balloon held in by its cortex, a pseudopod wherever the cortex weakens, a ventral face stuck to the substrate, chemistry
from food, engulfment, and growth on eating. PROTEUS moves its cell with a 2D spring polyline. Here the same ingredients
run on CELL's membrane in 3D and 4D, with one mechanism doing the moving:

- **The cortex flows toward where it is tight**, because myosin pulls it there: v_c = κ ∇σ along the surface.
- **Friction turns that flow into motion.** Whatever the surface rubs against takes the flow as a push the other way:
  the water everywhere (ζ_f), and the floor where it touches, much harder (ζ_s = 20 ζ_f). With no outside force the
  pushes balance, so

      V = −Σ ζ A v_c / Σ ζ A

  In open water this is a squirmer's speed, U = −⟨v_c⟩, the reciprocal-theorem result for a sphere. This is
  adhesion-independent amoeboid motion by cortical flow (Bergert et al. 2015; Ruprecht et al. 2015). On a floor the
  contact dominates: a tank's tread.
- **The floor.** It is the plane y = 0, and the cell's centre stands 0.2 radii above it (× (V/V₀)^{1/d} as it grows).
  The membrane can't go below it: along n with n_y < 0, r ≤ h/(−n_y), held exactly like the nucleus's limit. Within
  0.3 of it, adhesion pulls the membrane down, so the cell spreads. A patch touching it counts as stuck.
- **Flat, not an orb.** An amoeba lies as a splat. Its weight and its dorsal cortex press it down, modelled as a
  pressure falling with height (−12·y). It spreads to a footprint about twice its radius, with a hump over the
  nucleus. The pressure that holds the volume is taken over the free membrane only, since the floor holds the rest.
- **Several pseudopods at once.** The soft front is broken into lobes that come and go: one sideways direction in 3D,
  two in 4D. The cell meanders a little.
- **Polarised** (`crawl`). Along a heading h, the cortex lets go at the front, so pseudopods push out (in
  pulses). It tightens at the back, the uropod. Tension rising front to back gives a rearward cortical flow, so the
  cell goes forward.
- **Smell** (`hunt`). Food on the floor leaks a chemical. Held steady, a point source gives c ∝ 1/r^{d−2}, smoothed
  over 0.3. Each patch reads c where it is. The cell fits c ≈ c̄ + g·(x − x̄) over its whole membrane (least squares, so
  the fit holds whatever the cell's shape) and turns its heading toward g at 1.5 a second. It follows the scent only
  above c̄ = 0.1, the horizon; below that it wanders (the heading diffuses at 0.15 rad²/s). Food that ends up inside its
  membrane is engulfed: the volume grows 5% (to at most 1.6×), and the next morsel appears 5 radii away.

What it shows:

- **Crawling needs no knots.** Protrusion, adhesion, contraction and release are all local pushes, so crawling works
  in 4D. The 4D floor is a 3D space, the footprint a solid, and the leading edge a 2D surface. The same cortex crawls
  at about 0.14 radii/s in 4D against 0.41 in 3D. As dimensions rise, more of a sphere's surface crowds toward its
  equator (n·h has variance 1/d), sideways to the heading, where the cortex is neither front nor back and doesn't flow.
- **Smell is short and steep.** Relative gradient across the cell is (d − 2)/r, measured to 2%. The horizon is 10
  radii in 3D and √10 ≈ 3.2 in 4D: the 3D cell finds food 6 away in about 10 s, and the 4D one can't smell it and
  wanders. On a 3D floor a random walk usually never returns: it comes back 19% of the time, against 34% in 3D and
  certainly on a 2D floor.
- **Every preset swims now.** With a tension gradient the cortex flows, so `contract` swims the cell in open water,
  more slowly than crawling.

The source strength and the threshold are a modelling choice: concentrations in 3D and 4D don't share units. The
scalings (1/r against 1/r², (d − 2)/r) are not.

## The minimap

When the cell is on a floor, the top-right map shows its footprint, the part stuck down:

- **3D:** seen from above. The footprint is filled and coloured by cortex tension (cool front, warm back), inside the
  cell's shadow. It also shows the nucleus, the heading, the food and the smell horizon.
- **4D:** the floor is a 3D space, so the footprint is a solid. The map is a small 3D view of it (x and z across, w
  up), turned with your camera. Your slice's cut through the floor is drawn as a plane, and the footprint points the
  plane passes through, which the main view shows, are drawn brighter.

The camera and the map centre on the cell's centre of mass. Crawling, the centre the membrane is held round trails at
the back.

## Files

- `js/cell.js`: the grid, the Laplacian and gradient, the step, the presets, the floor, `velocity()`, `sense()`, the hunt, `waist()`. No DOM.
- `js/main.js`: the WebGL2 page. r is uploaded as a 2D atlas (3D) or a 3D texture (4D), and the shader marches
  `|p| − r(n)`.
- `test/cell.selftest.mjs`: about 75 s.
