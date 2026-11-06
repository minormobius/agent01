# AMOEBA (work in progress)

**Not finished, and not deployed.** This branch (`claude/kata-amoeba-wip`) holds it; the kata deploy branch doesn't.

An amoeba's mechanics on its membrane, in 3D and 4D. The membrane is a mesh: triangles in 3D, tetrahedra in 4D. The
3D mesh is a refined icosahedron (2,562 points); the 4D mesh is a refined 600-cell (6,480 points, 38,400 tetrahedra).
The forces:

- **Tension:** the cortex, σ per vertex. It is solved implicitly: a graph-Laplacian system, made symmetric by scaling
  each row, solved by conjugate gradients. Laplace's law holds exactly: P = 2.000 (3D) and 3.0005 (4D) for σ = 1, R = 1.
- **Pressure:** the Lagrange multiplier that holds the volume (a second linear solve), plus an exact Newton fix.
- **Polymerisation:** a speed, not a force, where the signalling fires.
- **The floor:** adhesion, stickiness by position along the cell's axis, and flattening.
- **The membrane budget:** a reserve, past which tension rises.
- **The nucleus.**
- **The signalling:** Barkley's excitable medium with nucleated patches, a slow recovery so it doesn't spiral, global
  inhibition, curvature feedback, and smell.
- **Polarity:** one front–rear axis for the whole cell. Myosin sits at the rear.

## What works

- `mesh.js`: the meshes, their volume and measure, and the generalised normal.
- Laplace's law and the volume.
- The worker-driven page: rasterised in 3D, sliced tetrahedra in 4D, a ray-marched floor, food and nucleus, and the
  footprint minimap.
- `inside()`: a ray-parity test for whether a point is inside the membrane, in both dimensions.

## What doesn't yet

Crawling with an honest, healthy mesh. The lessons, in order:

1. **Tension's stiffness must be implicit.** A diagonal stand-in slowed every motion about 36×. Pressure and tension
   barely acted, and the cell sat still.
2. **Forces should move the membrane only along its normal.** It is a fluid. In-plane pull piled mesh points into the
   contracting rear.
3. **A mesh keeper is needed.** Edge springs along the surface work. Moving points to their neighbours' average doesn't.
4. **Polarity must be one axis, measured in absolute units.** Relative units let a growing tail call its own base
   "middle".
5. **Protrusion must be a speed.** A protrusion force only finds a static bulge.
6. **What's left:** a firing patch pushed out kinematically stretches the edges to its base into long ramps (edges up
   to 2.5 against a mean of 0.05). This needs **true remeshing**: edge split, collapse and flip as membrane flows into a
   foot. That is routine in 3D and hard in 4D (tetrahedral remeshing of a 3-manifold).

Try it locally with `?d=3&p=explore` and `&o={json}` to override the physics settings (`PAR` in `js/amoeba.js`).
