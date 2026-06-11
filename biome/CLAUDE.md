# biome — CLAUDE.md (the ECOSYSTEM wing)

You are working on **biome**, the ecosystem wing of the O'Neill cylinder modelling package.
Read `biome/README.md` first — this file is the operational quick-reference.

## What biome is

The **closed ecology** of the cylinder interior, modelled as a living **food web** (not a
farm). The zeroth question of the whole package: *can the life-support loop close at all as
stocks and flows?* Everything lives under `cycles/`:

- `cycles/sim/cycles.mjs` — the deterministic, element-exact, data-driven box-model engine.
- `cycles/sim/allometry.mjs` — derive an animal's stat block from body mass (Kleiber) + guild.
- `cycles/sim/roster.mjs` — curated real-organism roster; `buildCommunity()` compiles it.
- `cycles/sim/{linalg,stability}.mjs` — community matrix → stability / reactivity / keystones.
- `cycles/index.html` — the dashboard; `cycles/stability.html` — the stability lab.
- `cycles/solver/` — the Rust/WASM stability kernel (the precision/scale sister of linalg.mjs).

## The package it belongs to

Four surfaces, one cylinder. **game → [hoop](../hoop)** · **structure → [rind](../rind)** ·
**thermodynamics → [tide](../tide)** · **ecosystem → biome (you)**. biome is the volume inside
rind's shell; it shares the cylinder with tide (radius is altitude is temperature/humidity/CO₂).
The thermodynamic premise that makes the interior strange lives in tide; biome takes the
climate as a boundary condition. The thermo modules (atmosphere/fountain/systems) that used to
live here were split out to **tide** in the cylinder-refactor. Keep the "four wings" block and
footer cross-links in `index.html` working.

## Run / test (all run from the sandbox; deploy does not)

```bash
node biome/cycles/test/cycles.selftest.mjs        # 17 checks: conservation, food-web behaviour, determinism
node biome/cycles/test/allometry.selftest.mjs     # 13 checks: Kleiber scaling, calibration
node biome/cycles/test/roster.selftest.mjs        # 13 checks: real roster compiles, closes, conserves
node biome/cycles/test/linalg.selftest.mjs        # 15 checks: inverse + eigenvalues vs known spectra
node biome/cycles/test/stability.selftest.mjs     # 11 checks: stability verdict + decay cross-check
( cd biome/cycles/solver && cargo test )          # 6 checks: the Rust stability kernel
# or all the node tests at once:
for t in biome/cycles/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
```

The self-tests are the contract — run them before every push.

## Deploy

- Push `biome/**` on `main` or `claude/oneill-cylinder-refactor-xjknww` → `deploy-biome.yml`
  runs `wrangler deploy`. The sandbox cannot deploy; push and let the Action run. Verify the
  log binds `biome.mino.mobi (custom domain)` (the golden rule).
- **Stability wasm:** edit the Rust under `cycles/solver/` → `build-biome-solver.yml` rebuilds
  `cycles/solver/pkg/**`, commits it, and dispatches `deploy-biome.yml`. Don't hand-edit the
  committed `pkg/`.
- Ownership is in `deploy-registry.json` (surface `biome`). Edit the registry, then
  `node scripts/gen-deploy-triggers.mjs --write` + `node scripts/lint-deploy-registry.mjs`.

## Invariants — do not break

1. **Conservation by construction.** Carbon, hydrogen, oxygen and nitrogen conserve no matter
   how many trophic levels stack (drift < 1e-9 over a model-year). Every ecological interaction
   is a carbon transfer or the canonical respiration reaction. Don't add an organism or edge
   that leaks an element — the self-test will catch it.
2. **The food web is data, not code.** Organisms and relationships are arrays; the derivative
   loops over them. Adding a species is a stat block + an edge, never per-organism code.
3. **The stability lab is JS-first.** `linalg.mjs` is the guaranteed in-browser path; the Rust
   kernel is an optional accelerator. The lab must work without the wasm.
4. **Pure static.** No D1/DO/secrets; the worker just serves assets + `/health`.
