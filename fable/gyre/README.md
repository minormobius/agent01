# gyre — physics puzzles on a torus

Live: **fable.mino.mobi/gyre** · a closed 3D world, every launch pre-swept, no backend.

The fourth wing of [fable](https://mino.mobi/), and the 3D answer to
[flux](../flux/). The progression: puzz broke nothing → knack added time →
flux dropped the grid → **gyre drops the boundary**. The ball lives on the
surface of a torus — a closed 2-manifold embedded in 3D. There are no walls
because there is no edge; a shot that "leaves" just comes around.

## Why a surface (and not free 3D space)

Constraining the ball to a surface keeps the player at exactly **two degrees of
freedom** — a heading ψ in the tangent plane and a power — so flux's entire
win-map / basin / fine-robustness solver machinery carries over *unchanged in
shape*, while the physics underneath becomes genuinely non-Euclidean. Free 3D
space would have ballooned the action space to 3D (≈50× the sweep cost) for less
interesting trajectories.

## The physics (`engine.js`)

Intrinsic-coordinate integration on the torus metric
`ds² = A²du² + r²dv²`, `A = R + r·cos v`:

- **Geodesic terms** (Christoffel symbols) — free motion already precesses,
  wraps the tube, and threads the hole. Validated in the test suite against
  mathematical fact: the outer equator and meridians are geodesics (a shot
  along either stays on it to machine precision).
- **Forces in the embedding, projected to the tangent plane** — magnets are 3D
  inverse-square attractors, so a magnet genuinely pulls across the hole of the
  donut. `Heavy` worlds add embedded −z gravity (the underside of the ring is a
  valley).
- Goo patches (chordal drag fields), surface bumpers (tangent-plane
  reflection), deterministic f64 fixed-step throughout.

## Winding numbers — torus-native interestingness

Every trajectory on a closed surface has a topological signature: how many times
it wraps the ring (windU) and the tube (windV). The solver records the winding
of its canonical answer and the interest battery rewards it — "winds 2× around,
3× through" is a *measured* property of the certified answer, a kind of
interestingness only this topology can express.

## The five genres (`bundles.js`)

| Bundle | Forces | Feel |
|---|---|---|
| **Meridian** | none — curvature + bumpers | the torus IS the puzzle |
| **Polar** | surface magnets ± | curve through the field |
| **Slick** | goo patches | thread or brake |
| **Heavy** | embedded −z gravity | the world has a "down" |
| **Maelstrom** | everything | the anarchy dial |

## Rendering (`render.js`)

Hand-rolled 3D in the torus-pack house style — no three.js, no build:
painter's-algorithm shaded quad mesh on canvas 2D; goo and the goal painted
onto the surface quads at bake time; trajectory and items dimmed when they pass
the far side ("x-ray" occlusion); drag-to-orbit camera; the flux polar win-map
as a corner dial; and an **unwrapped (u,v) inset map** — the same trajectory in
both views, the torus pack's favourite trick.

Aiming maps a screen drag through the inverse of the projected tangent basis at
the launch pad, so "drag the way you want it to go" works at any camera angle.

## Files

| File | Role |
|---|---|
| `js/engine.js` | Torus-surface physics: geodesics + projected forces + goo/bumpers. |
| `js/solver.js` | Action-space sweep (ψ × power) → win-map, basins, fine-robust answer. |
| `js/bundles.js` | The five genres (placement in intrinsic coordinates). |
| `js/generate.js` | build → solve → filter. |
| `js/difficulty.js` | Solver stats → difficulty + interest battery (incl. winding). |
| `js/atlas.js` | `worldForSeed`, `rankBand`, `hunt`. |
| `js/render.js` | Hand-rolled 3D: mesh, x-ray trail, dial, inset, orbit camera. |
| `js/play.js` | Aim-drag vs orbit-drag, launch animation, solver replay. |
| `js/app.js` | Routing, controls, verdict panel, gallery. |
| `test/engine.test.mjs` | Geodesic facts, re-verified answers, determinism, robustness. |

## Run the tests

```bash
node fable/gyre/test/engine.test.mjs
```

Deploys with the rest of `fable/**` via `.github/workflows/deploy-fable.yml`.
