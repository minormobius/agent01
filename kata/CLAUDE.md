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
  (a closed centreline with analytic Frenet frame, carved flat within `R_TRACK`), the march and walking. `js/render.js`
  is the shader, `js/main.js` the page and IRIS⁴'s controls, plus "face the track" and the readout of the bend in your
  frame. See [`lean/README.md`](lean/README.md).
  - A cell's byte is **height in bits 0–5, material in bits 6–7** (IRIS⁴'s is height in 0–6 and a water bit). Heights
    cap at 63 voxels.
  - **The basin must stay closed.** The selftest floods every cell reachable from the start by `walk()`'s own rule and
    fails if any is outside the basin. Anything that moves the player (vehicles included) must go through `walk()` or
    keep its substep rule: at most one cell per axis per substep, each climbing at most `STEP` above where it began.
  - IRIS⁴'s march fixes reach Lean only by hand. After a change to `four/iris/js/world.js`'s `march()` or the shader's,
    port it here and run both selftests.

## Coordinates

The code keeps IRIS⁴'s: **y is up**, the ground is x, z and w. In conversation the principal's 4D bicycle has had z up
and y lateral; translate when writing prose.

## Testing

```bash
node kata/lean/test/lean.selftest.mjs   # ~2 s
```

`preflight` runs it whenever this directory changes. A browser check (headless Chromium renders it with SwiftShader):
serve `kata/` and load `/lean/?dt=30`; `window.LEAN` exposes the state (`me`, `track()`, `faceTrack()`, `timing`).

## Deploying

Pushes to `claude/kata-lean-track` that touch `kata/**` trigger
[`.github/workflows/deploy-kata.yml`](../.github/workflows/deploy-kata.yml): `route-dns.mjs` makes sure the host's DNS
record exists, `wrangler deploy` uploads, and the run fails unless `kata.mino.mobi` answers. `main` deploys nothing.

## Next

The w-cycle (stable in the slice, balanced in w), then the bicycle: lean as a 2-vector, a two-plane handlebar, and the
mechanics to precess into w. Physics in a DOM-free `js/bike.js` with a selftest that, with w switched off, reproduces
the 3D Whipple bicycle.
