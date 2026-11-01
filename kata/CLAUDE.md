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
  The selftest holds the page's claims (Huygens on a 3D surface, 1/r against 1/√r, swell's apparent speed, standing
  orbitals). See [`wavelab/README.md`](wavelab/README.md).
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
node kata/wavelab/test/wavelab.selftest.mjs # ~1 s
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
