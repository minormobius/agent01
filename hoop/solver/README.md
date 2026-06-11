# cylinder-solver

The structural brain behind `hoop/cylinder.html` — answers *"does this spin-gravity
O'Neill cylinder hold, or does it tear, and what weave makes an infeasible one work?"*

## Layout (the `flights` split)

```
hoop/solver/
  cylinder-solver/        # pure, zero-dependency core — `cargo test` runs offline
  cylinder-solver-wasm/   # thin wasm-bindgen + serde JSON wrapper, built in CI
  pkg/                    # wasm-pack output, committed by CI (gitignored locally)
```

The core has **no dependencies on purpose**, so the math is verified by `cargo test`
in the sandbox with no network and no wasm toolchain. The dense linear solve is
hand-rolled (`la::solve`, Gaussian elimination with partial pivoting).

## Two layers

1. **`analytic`** — closed-form feasibility, identical to the JS in `cylinder.html`:
   - `σ_hoop = ρ_wall·v² + p_eff·R/t_wall`, `p_eff = P_atm + (ρ_reg·t_reg + m_int)·ω²R`
   - the irreducible self-spin floor `ρv²` (tethers can't touch it),
   - the specific-strength ceiling (`v_max`, `r_max` at the chosen g),
   - verdict: feasible / material-limited.
   The WASM build is therefore a **cross-check** of the JS, not a separate black box.

2. **`net`** — a general pin-jointed **3D** cable/strut stiffness solver:
   - nodes are `[f64; 3]`; a 2D cross-section is just `z = 0`,
   - `tension_only` cables drop out under compression (active-set iteration),
   - a singular stiffness matrix is reported as `mechanism` — i.e. the solver tells
     you when a weave **cannot** carry load (a design answer in itself).
   - `cylinder::spoked_wheel` and `cylinder::secant_web` build the cross-section webs.

   **Architected for the full 3D net:** because everything is already 3D direction
   cosines, the next step — swapping the hub for an axial spine and adding helical /
   diagonal members across the cylinder surface — needs no change to the solver, only
   new builders.

## Build

- **Native (here):** `cd cylinder-solver && cargo test` — the math, offline.
- **WASM (CI):** `.github/workflows/build-cylinder-solver.yml` runs the tests, then
  `wasm-pack build --release --target web --out-dir ../pkg`, commits `pkg/`, and
  dispatches `deploy-hoop`. The sandbox can't emit wasm (no wasm32 target / rustup),
  so the browser artifact always comes from CI — same pattern as `mappa/pkg`.

## Wiring (next)

`cylinder.html` will load `pkg/cylinder_solver.js` as an **optional accelerator** with
the existing JS as fallback (so the page works with or without the wasm), then call
`solve_net_json` to solve and optimize arbitrary weaves rather than score a given one.

## JSON entry points (wasm)

- `hoop_json(req)` → closed-form report (camelCase in/out).
- `solve_net_json(req)` → `{ disp, members:[{force,stress,length,active}], iters, mechanism }`.
