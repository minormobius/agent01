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

## Files

- `js/cell.js`: the grid, the Laplacian, the step, the presets, `waist()`. No DOM.
- `js/main.js`: the WebGL2 page. r is uploaded as a 2D atlas (3D) or a 3D texture (4D), and the shader marches
  `|p| − r(n)`.
- `test/cell.selftest.mjs`: about 50 s.
