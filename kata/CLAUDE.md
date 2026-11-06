# kata — kata.mino.mobi

Four dimensions, ridden: vehicles you pilot through a four-dimensional world, starting with the bicycle, whose lean has
a direction as well as a size. A landing page and its demos. The first demo is **Lean**, the track.

## Facts

| | |
|---|---|
| Surface | `kata` |
| Dir | `kata/` |
| Endpoint | `kata.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/kata-lean-track` |
| Deploy | `.github/workflows/deploy-kata.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "kata"`.

## How it works

One static site: no build, no worker script, no bindings (worker `kata`, assets only, on the plain route
`kata.mino.mobi/*`). `.assetsignore` keeps this file, the tests and `wrangler.jsonc` out of the upload.

- **the landing at `/`**: `index.html`, self-contained (inline CSS). The premise, a card per demo (live, next, then),
  and what we think we know about a 4D bicycle. When a demo ships, its card goes live; when a claim is settled by a
  simulation, its bullet changes.
- **TAILSPIN at `/tailspin/`**: the level series. The Cheshire cat, its one-axis bike, easy mode, no autopilot.
  Courses are segment lists integrated in the rider's non-twisting frame (`js/course.js`, a segment's `dir` is where
  the stick goes); an oracle rides each with a reaction delay (`js/oracle.js`), and the difficulty /10 is its timing
  plus the out-of-plane, twist and lean demands; ten hand-made levels (`js/levels.js`, scores stored, held to the
  oracle and to rising by the selftest); a seeded generator (`js/gen.js`). It imports Lean's engine from `../lean/js/`
  (same site: not a copy), so **a change to Lean's world, shader, dynamics or cat runs TAILSPIN's selftest too**. See
  [`tailspin/README.md`](tailspin/README.md).
- **FALL LINE at `/fallline/`**: downhill. A height map over the 3D ground (x, z, w), a tree of benched trails down
  it (more than one way to the bottom), speed from the slope (`js/trails.js`), an oracle that rides every way down
  (`js/descent.js`, par = the fastest), eight levels and a seeded generator. Drawn by Lean's shader in **hill mode**
  (`Renderer.hill(H, F, …)`: a smooth heightfield in an R16F 3D texture and the trails' field in RG16F, one sample a
  metre, ray-marched with a global slope bound `L`, then bisection). Its Kelvin grain uses `js/foam.js`, a
  **byte-identical copy** of `games/foam4/js/foam.js` (edit the lab's, copy it over; the selftest fails on drift). The
  hill mode lives in `lean/js/render.js` beside the voxel march; keep Lean's path untouched by it (`uHillMode` 0).
  See [`fallline/README.md`](fallline/README.md).
- **WAKE at `/wake/`**: the boat. A lake (Fall Line's heightfield, analytic in `js/lake.js`, flooded to y = 0), a
  boat whose hulls are 4D capsules (`js/boat.js`: hydrostatics with a 2×2 metacentric matrix, so a boat heels two ways;
  the triad, the tender catamaran, the skiff that can't float upright), a Bishop-frame rudder on the stick, Kelvin's
  wake as a cone (`js/wake.js`), an oracle that helms each course (`js/oracle.js`), eight courses and a generator.
  Drawn by Lean's shader in hill mode **with water on** (`Renderer.water(y)`, `.wake(shells)`, `.buoys(list)`; off
  unless a page turns it on, so Lean, TAILSPIN and Fall Line draw as before). The boat is drawn through the bike's
  capsule array (`Renderer.bike`, two dummy tyres far away). See [`wake/README.md`](wake/README.md).
- **WAVELAB at `/wavelab/`**: water waves in 4D, solved exactly (linear theory: every plane wave turned at
  ω² = g k tanh(k h); `js/waves.js`, a 64³ periodic surface, inverse 3D FFT in `js/fft.js`, run in a Web Worker,
  `js/worker.js`). Its own small shader, not Lean's: your slice as a height field, the whole 3D surface as a volume.
  Your slice is a free frame (twist pad, ana/kata lever, keys). Corks are pushed by the slope, a = −g∇η, in all three
  directions, so they bob out of your slice. Tanks: periodic, walls (Neumann) or open (Dirichlet) by the method of
  images (`waves.js` `setSym`/`images`: the half-box [24, 48] m, the other half its mirror), and a seiche. The selftest holds the page's claims (Huygens on a 3D surface, 1/r against
  1/√r, swell's apparent speed, standing orbitals, Airy's velocity and cork orbits, the walls' and edges' conditions, the seiche). See [`wavelab/README.md`](wavelab/README.md).
- **ORBITAL at `/orbital/`**: hydrogen's electron cloud in 4D, exactly, on ATOM⁴'s terms (the force pinned at 1/r;
  `js/hydrogen.js`, no DOM: R = r^l e^{−κr} L(2κr), κ = Z/(n + ½), harmonics as c0 + b·x + xᵀQx plus a cubic, for s, p, d, f; 1, 4, 9, 16
  of them; the sp⁴ hybrids, five lobes at the 5-cell's corners, as mixtures with an exact rejection sampler; **time**: complex
  superpositions turning at e^{−i(E−E₀)t}, phase as colour, the probability current as arrows, presets for the beat
  ana–kata and the double rotation in two planes). The shader's time path loops over up to six parts: keep shader
  comments off the ends of statement lines (a `//` there once swallowed an `else`). A slice of it volume-rendered (teal ψ > 0, rose ψ < 0) with WAVELAB's twist pad and ana/kata lever, our
  3D atom beside it, and a dartboard of sampled electrons against P(r). See [`orbital/README.md`](orbital/README.md).
- **SQUID at `/squid/`**: jet through an open 4D sea with no down (`js/squid.js`, no DOM: a game model, each force
  the right shape: pulsed thrust along the heading, anisotropic drag, the funnel's 3-vector aim turning the heading,
  the Munk moment against the arms' weathercocking; the frame turned in the single plane of F and ω, so no roll). Its
  own shader: your slice from the heading, 200 jellies and 8 axis giants as 4D balls read from a float texture (too
  many for uniforms on a phone), halos for those within 30 m of the slice. See [`squid/README.md`](squid/README.md).
- **TENTACLE at `/tentacle/`**: a muscular hydrostat in 3D (calibration) and 4D (`js/rod.js`, no DOM: a discrete
  Cosserat rod, 64 segments, strains bend/twist/stretch, 4 per segment in 3D and 7 in 4D, the frame carried by exact
  matrix exponentials; longitudinal fibres as a pattern over the skin (a ring; Lebedev's 26 on the 2-sphere), dipole →
  bend, mean → shorten; transverse at constant volume; helical twist, whose 4D fields have the hairy ball's bald
  poles). Its own shader sphere-traces the hypertube and its suckers (2D cup profiles turned round their axes) from a
  float texture of nodes (`js/render.js`, shared with OCTOPUS). **Physics** (`js/dyn.js`, `js/arm.js`): position-based dynamics in d dimensions,
  shape matching to the muscles' shape with a tone-set stiffness, implicit anisotropic drag, segment–segment contact;
  the knot (jams in 3D, slips out through w in 4D, jams in 4D held in w = 0). Keep shader comments off the ends of
  code lines, and never `mix()` a 1e9 "no hit" distance (single precision makes it 0: black blobs). See
  [`tentacle/README.md`](tentacle/README.md).
- **OCTOPUS at `/octopus/`**: eight of TENTACLE's arms on a head (`js/octo.js`, no DOM), importing
  `../tentacle/js/rod.js`, `dyn.js` and `render.js` (same site: not copies), so **a change to TENTACLE's rod, dynamics or
  renderer runs OCTOPUS's selftest too**. The eight are one `dyn.js` rod of eight chains (one solve: they touch each
  other, the head and mantle are `solids`). In 4D the roots are a cube's corners on the 2-sphere round the mouth, turned
  45° in z–w so four lie in w = 0. The renderer takes arms × per nodes (8 × 65; texture 640 wide) and body 2 (head,
  mantle, eyes). Cost: ~10 ms a frame for all eight here, after making `build()` allocation-free and halving the
  muscle rate, shape-matching windows and contact passes; the page sheds substeps, then resolution, below 40 fps. See
  [`octopus/README.md`](octopus/README.md).
- **PHASELAB at `/phase/`**: two liquids un-mixing, 3D (32³) beside your slice of 4D (32⁴), Cahn–Hilliard solved
  spectrally (`js/phase.js`, no DOM: stabilised semi-implicit steps, energy never rises; WAVELAB's 1D FFT **imported**
  from `../wavelab/js/fft.js` and batched across axes, so **a change to WAVELAB's FFT runs PHASELAB's selftest too**;
  `makeGridFFT` there now takes any number of axes). Each dimension in its own worker (`js/worker.js`), the 3D one held
  to the 4D one's time, the 4D one cutting your slice itself. Its own ray-march shader in `js/main.js` (R16F 3D textures:
  they filter on every WebGL2 phone, R32F doesn't). The claims, held by the selftest: interface per volume at a given
  domain size is the same in both; a droplet's squeeze μR/σ is 1 vs 3/2; R = 7 grows in 3D and dissolves in 4D
  (critical 5.5 vs 8.3); a quarter-minority fragments in 3D and stays one network in 4D. A 4D step is ~190 ms here.
  See [`phase/README.md`](phase/README.md).
- **LAVALAMP at `/lamp/`**: a lava lamp in the classic glass (`glassR(y)`, a metal base and cap drawn in the shader; in
  4D the profile turned round the vertical axis, so your slice at w shows radius √(R² − w²)), 3D beside your slice of 4D,
  both 16 across and 32 tall (`js/lamp.js`, no DOM). The glass in the solver: flow masked and re-projected, transport by
  face fluxes that skip glass faces, a stiff wall potential (W 40, stabiliser raised to match) so the liquid outside
  can't soak up the wax. The physics: PHASELAB's Cahn–Hilliard pair carried by creeping (Stokes) flow, solved exactly in Fourier space, driven by buoyancy
  and the capillary force μ∇φ; heat advected (slope-limited upwind fluxes: plain upwind's numerical diffusion swamped κ) and conducted. Floor and ceiling are
  mirror walls (the doubled box, symmetrised: T every step, φ every tenth); the sides are periodic. `makeFFTn` (mixed
  axis lengths) is its own, built on WAVELAB's 1D FFT, **imported**. The force's real components go two to a transform,
  and the Nyquist modes carry no flow (their projection isn't conjugate-symmetric, and the packed pairs would mix).
  The selftest holds: Stokes to rounding; the walls; wax conserved; a kR = 1.18 thread straightens in 3D and pinches in
  4D (thresholds 1 and √2); a hot ball's half-life 1.9× shorter in 4D; the 3D glass lamp cycles and its wax never leaves
  the glass; it climbs from the pool (no wax from nothing: transport is u·∇φ = ∇·(uφ) − φ∇·u, since the flow beside the
  shut glass faces isn't divergence-free; and the lamp's mobility is low, so wax isn't carried up dissolved); the
  threaded FFT is exact; the wax stays wax (the interface's tension acts only deep inside the glass, φ is transported
  centred, mobility 0.35: the window between mixing and going up dissolved; settings from a sweep, README). Speed: the flow every other step, CFL 0.7, and the FFT split across threads sharing memory
  (`js/pfft.js`; needs `kata/_headers`' cross-origin isolation for `/lamp/*`): 4D ~72–88 ms a step here, from 178.
  See [`lamp/README.md`](lamp/README.md).
- **CELL at `/cell/`**: a cell's membrane in 3D and in 4D, viewed like TENTACLE (3D/4D toggle, twist pad, ana lever).
  `js/cell.js` (no DOM) holds the membrane as a radius r(n) over the sphere S^{d−1} on a cube-sphere grid (2d faces,
  each an equi-angular N^{d−1} grid; 24² × 6 in 3D, 12³ × 8 in 4D), moving at v = μ(P − σH + f) with H the mean
  curvature, the Laplacian part implicit (Jacobi sweeps on least-squares weights fitted in tangent coordinates; the
  plain axis-neighbour stencil was wrong by ~5 at the face seams, so don't go back to it). P is the Lagrange multiplier
  that holds the volume; a uniform shift restores it exactly each step. Presets set the cortex tension σ and pushes f:
  rest, reach (pseudopod), contract, wave, bleb, divide (`belt`: the equatorial 2-sphere in 4D) and ring (a 1D great
  circle). Claims: Laplace's law is P = σ(d − 1)/R; a ring pinches a 3D cell (waist 0.37) but only dents a 4D one
  (0.60 at the ring, 1.08 away), a belt pinches 4D (0.17). The shader samples r from an RGBA16F atlas (3D) or a 3D
  texture (4D), faces stacked. **The nucleus is a body** (`cell.nuc`, one or two balls; uniforms `uNc`/`uNa`): the
  membrane is pushed off it within `NUC_SOFT` of a `NUC_GAP` and held off it exactly (radially: the far root of the
  ray–ball hit, so the star-shaped membrane never cuts it), the reaction pushes the nucleus, and the cytoskeleton
  pulls it toward the cell's centre of mass. Divide and ring split it at `SPLIT_T` (half the volume each), each daughter
  drawn to its own half's centroid. **Moving** (crawl, hunt; from PROTEUS's amoeba, `pokemon/proteus/`): the cortex
  flows at κ∇σ (`surfGrad`, gradient weights from the Laplacian's least-squares fit), and friction balances it,
  V = −Σ ζ A v_c / Σ ζ A (water everywhere, the floor where it touches: crawl; water alone: swim, so every preset with a
  tension gradient drifts). The floor is y = 0 under a centre at `FLOOR_H`, a hard upper limit on r (the volume's
  restoring shift respects both limits; P is taken over the free membrane only) plus adhesion within `ADH_BAND` and a
  flattening pressure (`FLATTEN`·y) that lays it out as a splat. The front's softness is lobed (a few pseudopods). `hunt` smells food (c ∝ 1/r^{d−2}, least-squares
  gradient over the membrane), follows it above `SMELL_MIN` and wanders below, engulfs, grows; `FOOD` keeps a per-dimension population of morsels
  (denser in 4D, under its nearer horizon), `cell.foods`, up to eight drawn. The camera follows the
  cell's centroid; the floor's grid and smell are drawn in world coordinates (`uX`). On a floor, an overlay minimap
  shows the footprint (3D: from above; 4D: the footprint solid in x, z, w with your slice's plane through it). `window.CELL` exposes the state. See [`cell/README.md`](cell/README.md).
- **AMOEBA at `/amoeba/`**: an amoeba from its mechanics, 3D and 4D. The membrane is one closed mesh, triangles or
  tetrahedra (`js/mesh.js`: refined icosahedron / 600-cell), moved by normal velocity:
  implicit tension (σΔx, a symmetric graph-Laplacian system solved by CG), pressure as the Lagrange multiplier (a
  second solve, linear), polymerisation as a speed where the signalling fires, floor adhesion/stick/flatten, a
  membrane budget (polymerisation stalls exponentially once it's spent). **Remeshed** (`js/remesh.js`, any d: split
  > 1.5 L, collapse < 0.6 L with the full link condition checked vertex/edge/triangle and fold checks, flips in 3D;
  u, v carried; every 5 steps in 3D, 10 in 4D), edge springs between. 4D has its own settings (`PAR4`). Signalling: Barkley with
  nucleated patches, slow recovery, global inhibition, curvature feedback, one polarity axis (absolute units), myosin
  at the rear. Settings were found by contact sheets (README: the path, including the failures). Physics in a worker
  (`js/worker.js`, mesh re-sent when remeshed); the page ray-marches floor, food and nucleus with depth, then
  rasterises the membrane over it (top two-thirds); below, two 2D-canvas 3D panels (footprint; smell sphere), each
  with its own drag/pinch and labelled axes. The nucleus collides with facets, not just points (once a step: in 4D
  an edge is as long as it is wide). See [`amoeba/README.md`](amoeba/README.md).
- **Lean at `/lean/`**: the track. Its engine is a **copy** of IRIS⁴'s (`four/iris/`), cut down to the tesseract grid
  with no foams or rainbows: a static site can't import across surfaces. `js/world.js` (no DOM) is the basin, the track
  (a closed centreline with analytic Frenet frame, marked within `R_TRACK` on a floor that is flat everywhere inside the rim), the march and walking. `js/render.js`
  is the shader, `js/main.js` the page and IRIS⁴'s controls, plus "face the track", the readout of the bend in your
  frame, and the map: the ground in x, z, w (w up) drawn orthographically, the track as a tube of its true width. See [`lean/README.md`](lean/README.md).
  - A cell's byte is **height in bits 0–5, material in bits 6–7** (IRIS⁴'s is height in 0–6 and a water bit). Heights
    cap at 63 voxels.
  - **The world is 320 × 320 × 128 cells of 0.5 m** (160 × 160 × 64 m), the basin 148 × 148 × 58 m, the track an
    oval of 55 × 48 m half-axes swinging ±10 m in w, 3 m in radius (a 336 m lap, bends 40–71 m). It has been enlarged three times for riders who
    couldn't get their bearings (the first basin was 42 × 42 × 15 m with the wall 3 m off the track in w; then the
    basin doubled; then track and world doubled together, the voxels going from 0.25 to 0.5 m to keep the cell count;
    then the track alone grew to fill the stadium, bends 2.5× gentler). The aim, agreed with the principal: keep making
    this introductory level easier until it's trivially easy. The shader's atlas is `ATLAS_C` = 12 slices across (3840 × 3520); keep both sides under
    4096 (the selftest checks), and change `DIM`, `NB` and `AC` in `render.js` with `world.js`.
  - **The basin must stay closed.** The selftest floods every cell reachable from the start by `walk()`'s own rule and
    fails if any is outside the basin. Anything that moves the player (vehicles included) must go through `walk()` or
    keep its substep rule: at most one cell per axis per substep, each climbing at most `STEP` above where it began.
  - **The bike** is `js/bike.js` (no DOM): the kinematic autopilot in the steady-turn calibration (tan φ = v²κ/g along
    N), the two steering mechanisms (`two-axis`: frame non-twisting, Bishop; `one-axis`: frame rolls at τv), and
    `parts()`/`sdf()`, the shapes the shader's `sdBike()` draws, line for line. Keep the part count ≤ 24 (the shader's
    capsule array) and inside `BOUND`; `test/bike.selftest.mjs` checks both. Riding moves the camera, not the walking
    body, so the basin's closure proof is untouched; stepping off goes back through `walk()`.
  - **The dynamics** are `js/dyn.js` (no DOM): the benchmark Whipple bicycle (Meijaard et al. 2007) built from its
    parameters, two copies for 4D (y as given, w with each body's spread in y swapped for its spread in w), LQR riders,
    pure pursuit, and the `Bike` the page steps. The page draws it through `bike.js`'s `parts()`. `test/dyn.selftest.mjs`
    holds the matrices to the published ones; never loosen that check to pass a change.
  - **The Cheshire cat** (`js/catbike.js`, `js/cat.js`): `cat.js` is a **byte-identical copy** of
    `games/cheshire/js/cat.js` (the cat lab). Edit the lab's and copy it over, never the other way;
    `test/catbike.selftest.mjs` fails on any drift. The shader's `catSD` is the cat lab's `cat()`, formula for formula;
    after a change to the lab's shader joins or materials, port it here. The cat bike is the benchmark × 0.4, one-axis
    only, and the tail carries the twist (I_body/I_tail from the posed parts).
  - **Courses and kerbs.** `world.js` takes any course (`course(pts, closed, R)`; Lean's is `OVAL_COURSE`):
    `trackCells` keeps each track cell's distance and place along it, `markTrack`/`unmarkTrack` put a course on the
    floor and take it off (heights never change, so the blocks stand), and `trackBins`/`binTangents` give the shader
    the course's direction at every track cell. The kerbs are coloured by where the track goes out of your slice
    (teal ana, rose kata), which needs `v.N` (your unseen direction) passed to `Renderer.draw`.
  - IRIS⁴'s march fixes reach Lean only by hand. After a change to `four/iris/js/world.js`'s `march()` or the shader's,
    port it here and run both selftests.

## Coordinates

The code keeps IRIS⁴'s: **y is up**, the ground is x, z and w. In conversation the principal's 4D bicycle has had z up
and y lateral; translate when writing prose.

## Testing

```bash
node kata/lean/test/lean.selftest.mjs   # ~2 s
node kata/lean/test/bike.selftest.mjs   # < 1 s
node kata/lean/test/dyn.selftest.mjs    # ~2 s
node kata/lean/test/catbike.selftest.mjs # ~1 s
node kata/tailspin/test/tailspin.selftest.mjs # ~50 s
node kata/fallline/test/fallline.selftest.mjs # ~40 s
node kata/wake/test/wake.selftest.mjs # ~3 s
node kata/wavelab/test/wavelab.selftest.mjs # ~15 s
node kata/orbital/test/orbital.selftest.mjs # ~8 s
node kata/squid/test/squid.selftest.mjs # < 1 s
node kata/tentacle/test/tentacle.selftest.mjs # ~1 s
node kata/tentacle/test/dyn.selftest.mjs # ~30 s
node kata/octopus/test/octopus.selftest.mjs # ~60 s
node kata/phase/test/phase.selftest.mjs # ~90 s
node kata/lamp/test/lamp.selftest.mjs # ~50 s
node kata/cell/test/cell.selftest.mjs # ~85 s
node kata/amoeba/test/amoeba.selftest.mjs # ~70 s
```

`preflight` runs it whenever this directory changes. A browser check (headless Chromium renders it with SwiftShader):
serve `kata/` and load `/lean/?dt=30`; `window.LEAN` exposes the state (`me`, `track()`, `faceTrack()`, `timing`).

## Deploying

Pushes to `claude/kata-lean-track` that touch `kata/**` trigger
[`.github/workflows/deploy-kata.yml`](../.github/workflows/deploy-kata.yml): `route-dns.mjs` makes sure the host's DNS
record exists, `wrangler deploy` uploads, and the run fails unless `kata.mino.mobi` answers. `main` deploys nothing.

## Next

Sailing (WAKE's next): a sail is a 3D slab with one normal, so a keel resists drift in one direction across and a 4D
sailboat needs two keels crossed; the angles you can't sail into the wind make a cone. Riding it by hand (phone tilt asks for a lean): see how people do, and scale the track if needed. The second-order 4D
couplings the linear model drops, and a twist actuator with dynamics for one-axis steering. Then the w-cycle.
