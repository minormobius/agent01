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
- **Lean at `/lean/`**: the track. Its engine is a **copy** of IRIS⁴'s (`four/iris/`), cut down to the tesseract grid
  with no foams or rainbows: a static site can't import across surfaces. `js/world.js` (no DOM) is the basin, the track
  (a closed centreline with analytic Frenet frame, marked within `R_TRACK` on a floor that is flat everywhere inside the rim), the march and walking. `js/render.js`
  is the shader, `js/main.js` the page and IRIS⁴'s controls, plus "face the track", the readout of the bend in your
  frame, and the map: the ground in x, z, w (w up) drawn orthographically, the track as a tube of its true width. See [`lean/README.md`](lean/README.md).
  - A cell's byte is **height in bits 0–5, material in bits 6–7** (IRIS⁴'s is height in 0–6 and a water bit). Heights
    cap at 63 voxels.
  - **The basin must stay closed.** The selftest floods every cell reachable from the start by `walk()`'s own rule and
    fails if any is outside the basin. Anything that moves the player (vehicles included) must go through `walk()` or
    keep its substep rule: at most one cell per axis per substep, each climbing at most `STEP` above where it began.
  - **The bike** is `js/bike.js` (no DOM): the kinematic autopilot in the steady-turn calibration (tan φ = v²κ/g along
    N), the two steering mechanisms (`two-axis`: frame non-twisting, Bishop; `one-axis`: frame rolls at τv), and
    `parts()`/`sdf()`, the shapes the shader's `sdBike()` draws, line for line. Keep the part count ≤ 24 (the shader's
    capsule array) and inside `BOUND`; `test/bike.selftest.mjs` checks both. Riding moves the camera, not the walking
    body, so the basin's closure proof is untouched; stepping off goes back through `walk()`.
  - IRIS⁴'s march fixes reach Lean only by hand. After a change to `four/iris/js/world.js`'s `march()` or the shader's,
    port it here and run both selftests.

## Coordinates

The code keeps IRIS⁴'s: **y is up**, the ground is x, z and w. In conversation the principal's 4D bicycle has had z up
and y lateral; translate when writing prose.

## Testing

```bash
node kata/lean/test/lean.selftest.mjs   # ~2 s
node kata/lean/test/bike.selftest.mjs   # < 1 s
```

`preflight` runs it whenever this directory changes. A browser check (headless Chromium renders it with SwiftShader):
serve `kata/` and load `/lean/?dt=30`; `window.LEAN` exposes the state (`me`, `track()`, `faceTrack()`, `timing`).

## Deploying

Pushes to `claude/kata-lean-track` that touch `kata/**` trigger
[`.github/workflows/deploy-kata.yml`](../.github/workflows/deploy-kata.yml): `route-dns.mjs` makes sure the host's DNS
record exists, `wrangler deploy` uploads, and the run fails unless `kata.mino.mobi` answers. `main` deploys nothing.

## Next

The bike's dynamics: a 4D Whipple model (both mechanisms) whose selftest, with w switched off, reproduces the
benchmark's eigenvalues (Meijaard et al. 2007), and a controller that reaches the kinematic calibration. The track may
need scaling up once people try to ride it. Then the w-cycle.
