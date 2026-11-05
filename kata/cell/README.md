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

## Files

- `js/cell.js`: the grid, the Laplacian, the step, the presets, `waist()`. No DOM.
- `js/main.js`: the WebGL2 page. r is uploaded as a 2D atlas (3D) or a 3D texture (4D), and the shader marches
  `|p| − r(n)`.
- `test/cell.selftest.mjs`: about 60 s.
