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
- `cycles/sim/lake.mjs` — the **lake bioengine**: an aquatic community + two figures of merit
  (surplus harvestable fish, effective water treatment). Reuses the engine + roster compiler.
- `cycles/sim/global.mjs` — the **global food web**: land roster ∪ lake roster in one box.
  Composes both, reports whole-ship figures of merit, and exposes a drawable typed graph.
- `cycles/sim/builder.mjs` — the **food-web builder** backend: compile/validate/run/analyse an
  arbitrary user **design** (same species shape as the rosters), plus a URL share codec + presets.
- `cycles/sim/{linalg,stability}.mjs` — community matrix → stability / reactivity / keystones.
- `cycles/index.html` — the dashboard; `cycles/stability.html` — the stability lab;
  `cycles/lake.html` — the **lake bioengine**; `cycles/global.html` — the **global food web**;
  `cycles/builder.html` — the **builder**: design any web, read its stability, share it by link.
- `cycles/robustness.html` — the **intermingling lab**: wires *cross-web* trophic edges (an amphibian,
  a waterbird, a chthonic soil web of earthworm/fungus/ground-beetle) and reads off the community matrix
  whether coupling the land & lake webs makes the closed ecosystem more robust (May 1972 vs McCann/Rooney).
  It composes these on the fly via `builder.mjs` + `stability.mjs`; the **canonical `global.mjs` stays
  trophically disjoint** (invariant #6) — this lab *explores* the alternative, it does not change the model.
  Finding: one weak fast–slow bridge (the frog) shortens return time; dense/strong coupling spikes
  reactivity and erodes the margin. Pure client-side, two model runs per render.
- `cycles/solver/` — the Rust/WASM stability kernel (the precision/scale sister of linalg.mjs).
- `cycles/sim/maximal.mjs` — the **maximalist intermingled web**: land ∪ lake ∪ a chthonic soil web
  (earthworm + saprotroph fungus + the springtail) wired together by real CROSS-WEB couplers — a frog
  (lake↔soil) and a farmed duck (lake↔land). Unlike `global.mjs` it HAS cross-web trophic edges (that
  is the point). Tuned (weak-coupling regime: few couplers, prey refuges, the duck heavily harvested)
  so **every species persists** and C/H/O/N still conserve — both pinned by `cycles/test/maximal.selftest.mjs`.
  Exposes `CONTAINERS` (land/lake/soil/bridge) + `buildMaximalGraph()` (edges tagged `.cross` when they
  bridge containers). NB: a fast soil predator (a ground beetle) is intentionally omitted — it over-eats
  the worm and collapses the brown web (the reactivity spike the intermingling lab flags).
- `graph/index.html` — the **trophic-web force graph** at `biome.mino.mobi/graph`. The **maximalist**
  web as one force-directed graph: each organism wears its iNaturalist photo, **sized by present
  standing biomass**, and the three habitats are each held in their own **basin** (LAND · LAKE · SOIL),
  with the couplers (frog, duck) floating in the gaps and the shared pools (air/N/detritus/larder) in the
  centre where all three webs meet. Cross-container edges are drawn gold; a toggle isolates them. Reads
  `buildMaximalGraph()`/`maximalReport()` from `cycles/sim/maximal.mjs` + the committed `graph/organisms.json`
  imagery (built by `node biome/graph/build-organisms.mjs` over land+lake+soil+coupler rosters; engine never
  reads it). **The whole script is wrapped in an error overlay** (`#err`) — any throw shows on the page
  instead of blanking the canvas; keep it that way. The worker normalises the no-slash `/graph` to `/graph/`
  — the only non-asset route, a rewrite to a page, not server compute.

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
node biome/cycles/test/lake.selftest.mjs          # 20 checks: harvest conserves, both figures of merit, failure modes, stability
node biome/cycles/test/global.selftest.mjs        # 18 checks: union conserves, land↔lake coupling, interior closes, stable
node biome/cycles/test/maximal.selftest.mjs       # 14 checks: intermingled web conserves, every species persists, couplers bridge containers
node biome/cycles/test/builder.selftest.mjs       # 23 checks: presets compile/close/conserve/stable, validation, share codec, graceful failure
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
4. **Pure static.** No D1/DO/secrets; the worker just serves assets + `/health`. New "endpoints"
   are pages (like `cycles/lake.html`), not server routes.
5. **Harvest conserves like everything else.** The animal `harvest` field on cycles.mjs (used by
   the lake to land fish in the food store) is a paired carbon transfer — biomass C → food C, the
   exact twin of a producer's `harvestIndex`. Communities without it are byte-for-byte unchanged
   (the lake self-test proves both). Don't add a yield path that bypasses a tracked pool.
6. **Land and lake are trophically disjoint by design.** The global web (global.mjs) unions the two
   rosters; they couple only through shared abiotic pools (air, N, detritus, larder), never through a
   cross-web trophic edge. That's the model's coupling thesis, not a missing edge — don't "fix" it by
   wiring a land animal to a lake species unless you mean to (and update the self-test if so). The
   only barrier between the webs is spatial, and this box model is non-spatial on purpose.
7. **The builder's stat-block defaults must never clobber an explicit value.** `normalizeSpecies`
   (builder.mjs) fills missing fields, but `count` defaults only when neither `count` nor `initBio`
   is given — otherwise it would override a decomposer's `initBio` (via makeAnimal's count-wins rule)
   and collapse the web. The builder self-test pins this (springtail initBio 20000). The share codec
   (`encodeDesign`/`decodeDesign`) is a public contract — a shared link is a saved design — so keep it
   backward-compatible (additive fields only); the self-test round-trips every preset.
