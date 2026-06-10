# flux — physics puzzles with no grid

Live: **fable.mino.mobi/flux** · continuous physics, every world pre-swept, no backend.

The third wing of [fable](https://mino.mobi/). The progression: [puzz](../puzz/)
broke nothing (static logic on a grid); [knack](../knack/) kept the grid but
added time (discrete moves a BFS searches); **flux throws the grid away** —
continuous space, real physics. A ball launched once flies under a sum of forces.

The form is loose, but the discipline that makes the interestingness engine
rigorous survives. The player has exactly two degrees of freedom — **launch angle
and power** — so the whole space of attempts is a 2D map. The solver **sweeps that
map**, simulating every launch, and records which ones win. From the win-map it
reads solvability (gate), difficulty (how small/precise the best winning *basin*
is), and interest (basin count + how the canonical shot curves and banks). Toggle
**show win-map** to see it as a polar diagram at the launch pad; "watch the
solver" replays the most-robust winning shot.

## Pipeline

```
seed n
  └─ atlas.worldForSeed(n)              deterministic: same n ⇒ same world + answer, for ever
       ├─ bundleForSeed(n)              weighted roll over the five genres
       ├─ bundle.build(rand)            place wells / magnets / goo / bumpers / walls
       ├─ solver.solve(world)           sweep 96×18 launches → win-map, basins, robustness
       │     └─ refine answer to a FINE-robust launch (survives float drift → JS=Rust)
       └─ difficulty.grade(world, solve)   → difficulty + interest battery
```

## The physics (`engine.js`)

Continuous 2D, fixed timestep, semi-implicit Euler, deterministic f64. Forces:
inverse-square **attractors** (positive pull = magnets/wells, negative push =
repel magnets), viscous **goo** drag fields, elastic **bumpers** and **walls**,
optional **gravity**. A launch ends on goal (win), rest, or timeout.

## The five genres (`bundles.js`)

| Bundle | Forces | Feel |
|---|---|---|
| **Lob** | gravity + bumpers + walls | arc shots and banks |
| **Orrery** | gravity wells (zero-g) | slingshots |
| **Magneto** | magnets, attract + repel (zero-g) | curve through fields |
| **Goop** | goo fields (+ a bumper) | thread the viscous bits |
| **Chaos** | all of the above | the anarchy dial |

## Why the answer is trustworthy across engines

Chaotic regions make the win-map fractal at fine scale, so a launch that looks
safe on the coarse grid can flip within a fraction of a degree. The solver
therefore refines its chosen answer to a **fine-robust** launch (a launch whose
small angle/power neighbourhood wins solidly), and generation rejects any world
whose answer isn't fine-robust. That margin is what lets the **Rust** mirror
(`engine-rs/`) and the JS engine agree without bit-for-bit float parity — the
basis of the CI cross-check.

## One engine, two languages

The live site runs the physics in **JavaScript** — one ball at 60fps needs
nothing heavier, and it keeps the site endless and instant. The same engine is
mirrored in **Rust** (`engine-rs/`). `.github/workflows/build-flux-catalog.yml`
generates a catalog of seeds (node) and runs the **Rust solver to independently
re-verify** every stored answer wins and every world is solvable — a cross-engine
gate — then commits `fable/flux/data/catalog.json` for fast gallery loads.

## Files

| File | Role |
|---|---|
| `js/engine.js` | Deterministic continuous physics + `simulate(world, angle, power)`. |
| `js/solver.js` | Action-space sweep → win-map, basins, fine-robust canonical answer. |
| `js/bundles.js` | The five genres (force layouts). |
| `js/generate.js` | build → solve → filter (solvable, robust, interesting). |
| `js/difficulty.js` | Solver stats → difficulty + interest battery. |
| `js/atlas.js` | `worldForSeed`, `rankBand`, `hunt`. |
| `js/render.js` | Canvas: forces, ball + trail, aim, the polar win-map overlay. |
| `js/play.js` | Drag-to-aim launch, trajectory animation, solver replay, map toggle. |
| `js/app.js` | Routing, controls, verdict panel, gallery. |
| `engine-rs/` | Rust mirror of engine + solver; CI catalog generator / cross-check. |
| `test/engine.test.mjs` | Re-verified answers, determinism, fine-robustness, ranking. |

## Run the tests

```bash
node fable/flux/test/engine.test.mjs        # JS engine/solver/generator
cd fable/flux/engine-rs && cargo test       # Rust physics mirror
```

Deploys with the rest of `fable/**` via `.github/workflows/deploy-fable.yml`.
