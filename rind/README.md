# rind — the structure of an infinite O'Neill cylinder

**Live at:** `rind.mino.mobi`
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules + an optional Rust/WASM frame solver. No build step for the site.
**Deploy:** `.github/workflows/deploy-rind.yml` — `wrangler deploy` on push to `rind/**`.

The **structure** wing of a four-part O'Neill cylinder modelling package. rind models the
shell that holds the air in: a thick, layered, braced **foam** — a Voronoi space-frame whose
*edges* form a "monster truss" and whose *plates* seal compartments without cutting the load
path — and the **frame solver** that proves it carries the spin load.

### One package, four wings

| Wing | Surface | What it models |
|---|---|---|
| **The game** | [`hoop.mino.mobi`](../hoop) | the infinite game — a world you walk, where every place is a forum thread |
| **The structure** | `rind.mino.mobi` *(this)* | the foam space-frame shell + the Rust/WASM frame solver |
| **The thermodynamics** | [`tide.mino.mobi`](../tide) | the radial atmosphere column, fog optics, the fountain & sun, the water/energy ledger |
| **The ecosystem** | [`biome.mino.mobi`](../biome) | the closed food-web box model + allometry + roster + stability lab |

rind is the shell; tide and biome are the air and life *inside* it. The wings cross-link
from each landing page. rind was split out of `hoop` (the game) in the cylinder-refactor:
the structural tooling that used to live alongside the game now stands on its own.

## Why the shell is the hard part

Spin gravity `g(r) = ω²r` is full at the rim and falls to zero at the axis — the same spin
that makes the floor habitable loads the shell. Every tonne on the inner surface pulls
outward, and the rind has to take that as **hoop tension** and radial compression. At the huge
radius of a real habitat a shell patch is essentially a flat slab, so the structural question
is local: can a foam of a given relative density, cell size and wall thickness carry the load
without overstressing — and stay navigable while it does?

The honest answer needs real structural mechanics, not a closed-form hand-wave. So rind
*generates* the foam geometry in JS and *scores* it with a Rust/WASM **frame solver** (banded
RCM + Cholesky). Dial the radius, spin, material and safety factor and watch the cylinder pass
or tear — the walls recolour by the solver's actual stress (green holds → red overstresses)
and the deflection is exaggerated so you can see it carry load.

## Surfaces

| Page | What it is |
|---|---|
| `index.html` | the landing page — the premise, the four wings, the three tools |
| `cylinder.html` | **thinking about cylinders** — the structural + radiative scratchpad. Sizes the cable weave (closed form) and the real foam shell (frame solver) from the cylinder parameters; live play-slice of stacked floors coloured by stress. |
| `foamview.html` | **foam viewer** — a 3D read of the layered foam slab: orbit it, slide a radial probe through the thickness, see the annular shell solved with member forces (tension warm, compression cool). The cylinder scene solves **the load of the ship** — spin gravity on every chamber's tributary mass plus the payload entering at the inner floor — through the Rust/WASM `solve_truss3d` (matrix-free PCG, ~100k DOF; identical JS solve as fallback), reports max stress vs allowable (steel tears, carbon holds — toggle with ⚙), and shows the exaggerated sag. It also finds and draws a **drivable route** through the chamber graph: two full-depth corkscrew spiral ramps joined by a level azimuthal road every ~300 m of climb (see *Wayfinding* below). |
| `walk.html` | **walk the foam** — drop in as a denizen and walk a planar cut through the foam (a roguelike level extracted by fitting a best-fit plane through the 3D cell-cloud). Climb radially and the gravity shifts: lighter core-ward, heavier hull-ward. |

## How it's built

```
rind/
├── index.html          # landing page
├── cylinder.html       # structural + radiative scratchpad (loads foam.js + solver/pkg)
├── foamview.html       # 3D foam viewer (loads foam3d.js)
├── walk.html           # first-person foam walker (loads foam.js)
├── foam.js             # layered, braced, navigable cellular structure generator
│                       #   → emits a ready-to-solve frame model; runs in node + browser
├── foam3d.js           # top-down level extractor: 3D seeds → PCA best-fit plane → 2D rooms
├── wayfind.js          # wayfinding: sector foam + spiral-ramp / azimuthal-road planner
│                       #   (single source for foamview's cylinder scene; node + browser)
├── test/wayfind.selftest.mjs   # certifies the wayfinding claims offline (node, no deps)
├── solver/             # the Rust frame solver (the structural scoring kernel)
│   ├── cylinder-solver/        # native crate (hoop_json / solve_net_json / solve_frame_json)
│   ├── cylinder-solver-wasm/   # wasm-bindgen wrapper
│   ├── pkg/                    # committed wasm build (cylinder_solver.js + _bg.wasm)
│   └── foam-preview.mjs        # headless preview of the foam → solver pipeline
├── worker.js           # assets worker (+ /health); everything runs client-side
└── wrangler.jsonc      # name=rind, custom_domain route rind.mino.mobi
```

The site is **pure static** — geometry generation is JS, structural scoring is the optional
WASM solver with a JS-free fallback, so every page works whether or not the solver loaded.

## The frame solver (`solver/`)

A small structural-mechanics kernel in Rust, mirrored to WASM, following the repo's
beam-solver / flight-solver pattern (native-tested, wasm-built in CI):

- **`cylinder-solver/`** — the native crate. `hoop_json` (analytic hoop tension), `solve_net_json`
  (cable net), `solve_frame_json` (the foam space-frame — banded RCM reordering + Cholesky), and
  `truss3d` / `solve_truss3d` (the foam-scale pin-jointed 3D truss — matrix-free Jacobi-PCG,
  ~10⁵ DOF, typed-array ABI instead of JSON; non-convergence is its mechanism flag).
  `cargo test` checks the math offline — including PCG-vs-dense agreement and a mini sector foam
  in equilibrium.
- **`cylinder-solver-wasm/`** — the `wasm-bindgen` wrapper; `wasm-pack build --target web` emits
  `solver/pkg/`.
- **`solver/pkg/`** — the committed wasm build the pages import as an optional accelerator.

### Build & test

```bash
( cd rind/solver/cylinder-solver && cargo test )   # the math, offline
node rind/solver/foam-preview.mjs                  # headless foam → frame model preview
node rind/test/wayfind.selftest.mjs                # wayfinding certificates (see below)
open rind/index.html                               # landing → the three tools
```

## Wayfinding (`wayfind.js`) — roads through the foam

The chamber adjacency graph (the same one the solver stiffens) doubles as a road network.
`wayfind.js` finds **drivable routes** through it and foamview's cylinder scene draws them:

- **Spiral ramp** — a corkscrew around a **radial axis** (the parking-garage spiral): loop
  in the (azimuthal, axial) plane at loop radius ρ while climbing radially at deck grade
  *g* — the radius advances g·ρ per radian of winding. Spin gravity points along +r̂, so
  grade = dr/ds is exactly the slope a vehicle feels (hull-ward = downhill, core-ward =
  uphill). One ramp threads the full 900 m usable depth in ~20 turns at 12%.
- **Azimuthal road** — constant radius = a level street around the ring.

`findSpiralRamp()` walks the ideal corkscrew waypoint by waypoint (16 per turn), chaining
each to the next through a bounded local search over graph-adjacent chambers near the deck.
`findRoad()` is a corridor-confined A* between a chamber **on** one ramp's chain and a
chamber **on** the other's, strictly monotone in azimuth at near-constant radius. A found
chain is a **constructive certificate**: every chamber centre within ~1.4 cells of the deck
(rooms are a cell = 20 m wide), consecutive chambers share a wall — so the smooth deck
provably threads the chain. Why it works *just about anywhere*: seeds are a jittered grid
(each site holds ≤ 1 seed, displaced ≤ ¼ cell per axis) and the adjacency threshold
1.85·cell exceeds the worst face-adjacent distance (≈ 1.66·cell), so wherever thinning
spares the sites, grid connectivity survives and the deck's corridor holds parallel
candidate chains. `proveAnywhere()` measures the realised rate (~99% of 300 random anchors
for a 300 m corkscrew on the default 33k-chamber sector — the misses are real thinning
gaps near the core, the "just about").

foamview composes the demo — **two full-depth corkscrew ramps at opposite ends of the
sector, connected by a level azimuthal road every ~300 m of climb** (4 roads, ~1.2 km each,
worst grade ~2%) — drawn as road ribbons with the ideal corkscrew decks dashed alongside;
the `⌁ ramp route` button re-anchors it somewhere new, and the `view: route` state shows
the route alone. `node rind/test/wayfind.selftest.mjs` certifies determinism, the per-chain
certificates, the road spacing, and the anywhere-rate offline.

**Deploy of the wasm:** `.github/workflows/build-cylinder-solver.yml` compiles
`cylinder-solver-wasm` and commits `rind/solver/pkg/**` (which lands under `rind/**`), then
dispatches `deploy-rind.yml` to publish it (a `GITHUB_TOKEN` push doesn't trigger other
workflows). The trigger is scoped to the Rust *source*, not `pkg/`, so there's no loop.

## Conventions & pitfalls

- **The solver is optional.** Never make a page hard-depend on `solver/pkg`. The JS fallback
  (geometry only, or the closed-form estimate) must keep the page working. Verify the
  `solver: …` pill degrades to "offline — geometry only" gracefully.
- **"hoop" in this code is the structural term** (hoop tension / hoop BC / the annular hoop
  solve), *not* the game site. Don't rename those — they're load-path physics.
- **Edges are structure, plates are not.** Doors and stairs are openings in plates; they must
  never cut a structural edge, or the navigability guarantee and the load path both break.
- **Pure static, golden rule.** `wrangler.jsonc` `name` is `rind` and declares
  `rind.mino.mobi` as a `custom_domain` route — verify the deploy log binds
  `rind.mino.mobi (custom domain)`, not a stray `rind.workers.dev`.
