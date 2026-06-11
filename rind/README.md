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
| `foamview.html` | **foam viewer** — a 3D read of the layered foam slab: orbit it, slide a radial probe through the thickness, see the annular shell solved with member forces (tension warm, compression cool). |
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
  (cable net), `solve_frame_json` (the foam space-frame — banded RCM reordering + Cholesky).
  `cargo test` checks the math offline.
- **`cylinder-solver-wasm/`** — the `wasm-bindgen` wrapper; `wasm-pack build --target web` emits
  `solver/pkg/`.
- **`solver/pkg/`** — the committed wasm build the pages import as an optional accelerator.

### Build & test

```bash
( cd rind/solver/cylinder-solver && cargo test )   # the math, offline
node rind/solver/foam-preview.mjs                  # headless foam → frame model preview
open rind/index.html                               # landing → the three tools
```

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
