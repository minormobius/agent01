# iris — CLAUDE.md (the END-ON cross-section)

You are working on **iris**, the end-on view of an O'Neill cylinder: a circle you look at down
the axis. It is the companion to the [tide](../tide) thermodynamics wing — tide resolves the
radius as 1-D columns and the azimuth as the fountain; iris draws the whole disk at once and
lets you switch which gradient you're seeing.

## The design it models

A small ring habitat, deliberately its OWN geometry (not tide's 8/10 km build):

- bore (air): `r ∈ [0, R_floor]`, `R_floor = 4 km` — the floor is the inner rim (max gravity).
- shell: `4 → 5 km` — structure + water reservoirs + heat pipes.
- radiator skin: `R_skin = 5 km` — the only heat-rejection surface.

All in `shared/geometry.mjs`. Gravity is `g(r)=ω²r`; spin defaults to 1 g at the floor.

## What it solves (`sim/section.mjs`, one coupled steady state)

The spine is **energy: heat in == heat out**. The lights are the only input; the radiator skin
the only output; the path between is reservoirs → heat pipes → skin. That balance pins every
temperature (`T_floor > T_reservoir > T_skin`, because heat flows outward). Hung off it:

- **temperature** — dry centrifugal adiabat from the floor + a radiative inversion that warms
  the axis (crank `invStrength` and "up" flips cold→hot).
- **pressure** — centrifugal hydrostatic balance `dP/dr=ρω²r` with the local T.
- **humidity** — vapour off the floor; jets OFF stratifies it, jets ON well-mixes it
  (conserving total water); fog is exactly where RH≥1.
- **wind** — convective scale `(B·z_i)^⅓` choked by the inversion's stability + the jet sheet,
  in a Coriolis-dominated frame (`f=2ω`, Rossby≪1).

`sim/ratchet.mjs` is the inner-rim topography (asymmetric teeth → lakes as constant-radius arcs).

## Run / test (all run from the sandbox; deploy does not)

```bash
node iris/test/section.selftest.mjs    # 23 checks: energy closure, hydrostatics, vapour conservation, wind
node iris/test/ratchet.selftest.mjs    # 9 checks: tooth periodicity + asymmetry, inward build, lake arc
```

The self-tests are the contract — run them before every push.

## Deploy

- Push `iris/**` on `main` or `claude/oneill-cylinder-solver-djdpdm` → `deploy-iris.yml` runs
  `wrangler deploy`. The sandbox cannot deploy; push and let the Action run. Verify the log
  binds `iris.mino.mobi (custom domain)` (the golden rule). iris.mino.mobi is a brand-new
  subdomain — the `custom_domain` route provisions it on first deploy.
- Ownership is in `deploy-registry.json` (surface `iris`). Edit the registry, then
  `node scripts/gen-deploy-triggers.mjs --write` + `node scripts/lint-deploy-registry.mjs`.

## Invariants — do not break

1. **Energy closes by construction.** `T_skin` is solved FROM the in==out balance; never set it
   independently. The `energyResidual` must stay ~0.
2. **Heat flows outward.** `T_floor > T_reservoir > T_skin` always. If you add a thermal layer,
   keep the ordering.
3. **Water is conserved across the jets toggle.** On/off only redistribute vapour
   (`totalVapor` identical); they never create or destroy it.
4. **Determinism, zero deps, node + browser.** `sim/*.mjs` run identically headless and in the
   page. No build step, no secrets; the worker just serves assets + `/health`.
5. **iris owns its geometry.** It does not import tide's `shared/geometry.mjs` — this is a
   different (smaller) cylinder. If the two ever need to agree, vendor, don't reach across.
