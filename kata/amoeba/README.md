# AMOEBA

An amoeba built from its mechanics, at `kata.mino.mobi/amoeba/`, in 3D and in 4D. In 4D its membrane is a
3-dimensional mesh of tetrahedra, remeshed the same way, and the page shows your 3D slice through it.

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

## The nucleus

A stiff ball (a 4-ball in 4D) that the membrane can't pass:

- **Points and facets.** The membrane's points are pushed out of it. Once a step its facets are too: the nucleus's
  centre projected into each nearby facet, and the whole facet pushed out if that point is inside the facet and too
  near. In 4D an edge is as long as the nucleus is wide, so a tetrahedron could sweep across it with its corners all
  clear. In your slice that looked like a "dry nucleus", poking out of the cell.
- **Pushed back.** The membrane pushes back where it presses on it.
- **Held toward the middle of the enclosed volume.** That is each facet's cone, weighted by its signed volume. The
  average of the membrane's points could lie outside a sprawling cell.

## Piloting

Press and hold the smell sphere and the cell goes that way. Drag on the sphere to change direction; drag outside it to
turn the view. The press is a direction: the point on the sphere's near side under your finger, taken back through
the panel's view to the world. In 3D that is any direction (x, y, z). In 4D it is a direction along the floor
(x, z, w), so you can send the cell ana or kata, out of your slice. While you hold:

- **It fires that way.** Membrane facing that direction (its direction from the cell's middle, dotted with yours)
  fires more readily, and new pseudopods start there.
- **More pseudopods.** Nucleation is boosted, so a foot answers within about a second.
- **The axis follows.** The cell's front–rear axis swings toward your direction along the floor, so myosin gathers
  opposite and the rear comes in.

Let go and it goes back to its own devices (smell, if there is food). The selftest holds that piloted along z, a 3D
cell goes along z (≥ 85% of its travel). Piloted ana, a 4D cell goes ana (99% in a 15 s run), out of the slice it
started in. A cyan arrow shows the steer in the main view (in 4D, labelled with how far it leaves your slice ana or
kata), in the footprint and on the sphere.

## The panels

The view takes the top two-thirds. Below are two little 3D views, each turned by dragging and zoomed by pinch or
scroll, with labelled axes:

- **Footprint.** In 3D, the floor plane (x, z) with the footprint on it and the cell faintly above (y up). In 4D, the
  floor is a space (x, z, w), the footprint is a solid, and your slice's cut through the floor is drawn as a plane.
  The white arrow is the cell's heading.
- **Smell.** Every membrane point is placed by its direction from the cell's middle and coloured by the chemical it
  reads, dark to amber. With no food about it is coloured by firing and myosin instead. In 3D the directions are
  (x, y, z). In 4D the cell can only go along its floor, so they are the floor's (x, z, w): the sphere of every way
  it could crawl. The arrows are the gradient it reads (gold) and its heading (white); green marks the food.

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

- **Laplace's law:** P = σ(d − 1)/R at rest, 2.000 in 3D and 3.002 in 4D.
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

## 4D

The 4D membrane is a closed 3-dimensional mesh of tetrahedra. It starts as the 600-cell refined once (840 points,
4,800 tetrahedra) and is remeshed to a target edge length. It has the same mechanics, Laplace's law included
(P = σ·3/R). The remesher works for any dimension:

- **Split.** Splitting an edge cuts every tetrahedron round it in two. That is a whole ring of them, where in 3D an
  edge had two triangles.
- **Collapse.** The link condition is checked at every level: shared vertices, shared edges (pairs that make a
  triangle with both ends), and shared triangles (none may make a tetrahedron with both ends).
- **No flips yet.** 4D would need 2–3 and 3–2 flips. The edge springs keep the tetrahedra healthy without them.
- **Thresholds.** Split above 1.5× the target and collapse below 0.6×. With 4/3 and 4/5, a split edge's halves fell
  straight under the collapse threshold, and the remesher churned (~200 splits and ~180 collapses per pass).
- **Speed.** Checking the link condition cheapest-level first took a pass from 1.1 s to 0.05 s.

**Curvature-adaptive refinement (4D).** A trailing 4D foot wouldn't retract. Adhesion wasn't holding it (not stuck)
and myosin was there (fully loaded); 3D on 4D's settings retracted fine. The real physics says the opposite should
happen: a tail's tip is pulled in at σ(d − 1)(1/r − 1/R), half again as hard in 4D. The cause was resolution. The
tail was one mesh edge thick (0.34), and a tube that thin can't register its own curvature: the model read 1.4–2.3
where the geometry said ~9. Its tip came in at 0.03 radii/s against a predicted 0.65.

So in 4D an edge also splits where the surface bends sharply: its two ends' normals more than 50° apart, down to half
the target length, at most 2% of the points a pass (a midpoint lies on the chord, so unbounded, this ran away to 41,000
points in 3 s). Such an edge isn't collapsed. Now the tip reads 3.6 against the geometry's 4.3 and retracts at 0.09
against a predicted 0.13. A foot left behind shrinks (reach 1.4 → 1.2 over 12 s) instead of growing (2.8 → 4.6). 3D
doesn't need it: its mesh is fine enough, and refining it changed its gait.

**Would a 4D foot separate?** More readily than a 3D one, physically. A 4D tube beads for kr < √2, not kr < 1 (the
LAVALAMP threshold), and its own tension squeezes it at 2σ/r, not σ/r, so a long thin trailing foot would tend to neck
and pinch off, leaving a fragment behind (3D cells do this on long retraction fibres). The model can't: its membrane is
one surface for good, so the most it could show is a neck thinning to a thread. At this resolution the tails stay
~0.35–0.7 thick.

Two findings, both kept in 3D too:

- **Polymerisation stalls under load,** as a Brownian ratchet does. Its speed falls exponentially with the tension the
  membrane budget adds once the reserve is spent. As a fixed speed it ignored the budget, and a 4D foot ran out to
  15 radii.
- **4D needs its own settings** (`PAR4`). A 4D tube is squeezed by its own tension twice as hard (σ·2/r, not σ/r),
  so feet need a faster push (v_p 2) and a sharper tip (curvature feedback 0.7) to get going. The patches are one ring
  of a coarser mesh, the rear squeeze is softer, and the reserve is 1.8.

They were tuned by contact sheets with two cross-sections per moment: the cut at the cell's own w (x and z), and the
cut at its own z (x and w). A foot reaching along w shows only in the second.

What a 4D amoeba looks like from inside a 3D slice: a lobed body whose feet, reaching ana or kata, leave your slice
and show as islands cut off from it. The selftest holds that after 15 s of remeshing it is still a closed 3-sphere:
every triangle is in two tetrahedra, and the Euler characteristic is 0. It also checks the volume, the floor and the
nucleus, and that it moves (about 0.25 radii/s). A step costs ~30 ms here and 30–55 ms in a browser.

## Files

- `js/mesh.js`: the starting meshes, normals, volume and measure (any dimension).
- `js/amoeba.js`: the mechanics, the signalling, food, `inside()`. No DOM.
- `js/remesh.js`: the remesher, for triangles (3D) and tetrahedra (4D).
- `js/worker.js`: runs it off the page's thread, paced to the clock.
- `js/main.js`: the page. It ray-marches the floor, food and nucleus, rasterises the membrane, and draws the
  footprint map.
- `test/amoeba.selftest.mjs`: about 70 s.
