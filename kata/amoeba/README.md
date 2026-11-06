# AMOEBA

An amoeba built from its mechanics, at `kata.mino.mobi/amoeba/`. It runs in 3D. 4D is next: its membrane is a mesh of
tetrahedra, and that mesh needs the same remeshing (see the end).

## The membrane

The membrane is one closed triangle mesh. It covers the top, the sides and the underside alike, and it starts as a
refined icosahedron. It moves overdamped, by its normal velocity: the membrane is a fluid, so forces along it only make
it flow. Five things act on it:

- **Tension.** The cortex, σ per vertex. Its pull per unit area is σΔx (the normal part is σH). It is solved
  implicitly as (1 − dt·m·σΔ)x' = …, a graph Laplacian plus a diagonal. Scaling each row makes it symmetric, so
  conjugate gradients solves it. Implicit, the tension can be stiff without slowing everything else.
- **Pressure.** Whatever holds the volume. A second solve gives the response to a unit pressure. P is then chosen so
  that the volume, linearised, holds. A Newton shift along the volume's gradient removes the last rounding.
- **Polymerisation.** A speed, not a force: v_p·u along the normal, wherever the signalling fires. As a force it only
  found a new balance, a bulge that stopped.
- **The floor.** The membrane can't go below y = 0. Within a band, adhesion pulls it down, and a flattening pressure
  presses the cell down. A vertex touching the floor is stuck (more friction) only toward the front and middle: it
  isn't stuck while firing, and it lets go where myosin is.
- **The membrane budget.** As PROTEUS's: a reserve of 1.6 times a ball's area, past which tension rises everywhere.
  A foot grows only by drawing the rest of the cell in.

## Remeshing (`js/remesh.js`)

Every 5 steps the mesh is rebuilt where it needs it, by isotropic remeshing (Botsch & Kobbelt):

- **Split** edges longer than 4/3 of the target length.
- **Collapse** edges shorter than 4/5 of it, unless that would pinch the surface (the link condition), fold a triangle
  over, or make a long edge.
- **Flip** edges toward six neighbours per vertex.

The signalling's fields go with the mesh: a new point takes the average of its edge's two ends. Between remeshes, edge
springs along the surface keep the points even. Without remeshing, a firing patch pushing out stretched the edges back
to its base into long ramps, and the rear crowded its points into degenerate needles.

## The signalling

Barkley's excitable medium, an activator u and a recovery v, with these additions:

- **Firing patches nucleate** at random, at a rate per unit of membrane, at the best of a dozen recovered spots. Spots
  are scored by smell and by lying at the front.
- **Recovery** rises fast while u fires and fades over a few seconds, so a patch can't fire again at once and waves
  can't circle into spirals.
- **Global inhibition:** the more of the membrane is firing, the higher the threshold, so it makes a few feet.
- **Curvature feedback:** a sharply bent tip fires more readily, so a pseudopod keeps going instead of stopping as a
  bump.
- **Polarity** is one front–rear axis for the whole cell, grown along where it has fired and fading over 6 s.
  - The front fires more readily.
  - Myosin gathers at the rear, measured in absolute distance behind the middle, and tightens the cortex there.

## What it does (the selftest holds these)

- **Laplace's law:** P = σ(d − 1)/R at rest, 2.000 in 3D and 3.003 in 4D.
- **Volume:** held to within 0.5% while it remeshes.
- **The remeshed membrane stays a closed surface:** every edge is in two triangles, the Euler characteristic is 2,
  and edges stay within bounds.
- **Constraints:** the membrane never goes through the floor or its nucleus.
- **Not round:** up to about 1.7 times a ball's membrane, reaching about 3 radii.
- **It crawls:** about 0.15–0.25 radii/s.
- **It hunts:** it finds food by smell (c ∝ 1/r) and engulfs it. A point is inside when an upward ray crosses the
  membrane an odd number of times.

Floating, it still drifts at about two-thirds the speed. Its feet push out in front and are drawn in behind, a cycle
that doesn't undo itself, and amoebae and neutrophils have been seen to swim that way (Barry & Bretscher 2010). The
water here is local drag, not a full flow, so that speed is a sketch.

## How the settings were found

By looking. `PAR` in `js/amoeba.js` holds them. They came from contact sheets: the cell from above every 6 s, across
sweeps. The path, in order:

1. Tension stiffness had been damped per vertex, which slowed everything 36×. Fixed with the implicit Laplacian.
2. In-plane forces had moved the mesh. Now only normal forces do.
3. Polarity had been a field. It is now one axis, in absolute units, because a long tail had called its own base
   "middle".
4. Protrusion had been a force. It is now a speed.
5. The mesh had no remeshing. Now it does.
6. Mobility had been 1, and the cell glided at 3 radii/s on its rear squeeze alone. Now it is 0.05.
7. The cell had been pressed into a pancake whose whole rim fired. It is now pressed gently, with stronger
   inhibition.
8. Curvature feedback is on.

## 4D (next)

The 4D mesh (a refined 600-cell: 6,480 points, 38,400 tetrahedra) has the same mechanics, Laplace's law included. It
needs remeshing tetrahedra on a 3-manifold: splitting long edges (a tetrahedron's edge is shared by a ring of them),
collapsing short ones under a link condition, and flips (2–3 and 3–2 instead of edge flips). Until then the page runs
3D only.

## Files

- `js/mesh.js`: the starting meshes, normals, volume and measure (any dimension).
- `js/amoeba.js`: the mechanics, the signalling, food, `inside()`. No DOM.
- `js/remesh.js`: the 3D remesher.
- `js/worker.js`: runs it off the page's thread, paced to the clock.
- `js/main.js`: the page. It ray-marches the floor, food and nucleus, rasterises the membrane, and draws the
  footprint map.
- `test/amoeba.selftest.mjs`: about 40 s.
