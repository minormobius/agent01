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

- **temperature** — dry centrifugal adiabat from the floor + a radiative inversion that is
  SOLVED, not set: the axial sun absorbed by the greenhouse (`τ=κW+τ₀`, chiefly the solved water
  vapour) is radiated from the warm axis to the cold floor, `σ(T_axis⁴−T_floor⁴)=(1−e^−τ)F`. More
  lights or more water ⇒ stronger inversion. "Up is hot" is an outcome, not a knob.
- **pressure** — centrifugal hydrostatic balance `dP/dr=ρω²r` with the local T.
- **humidity** — SOLVED, not an input: the lakes ARE the cold reservoir water, so they both
  source the vapour and cap it at saturation over cold water; the floor RH follows the lake
  coverage `λ(lakeFrac)`. The **vapour scale height is solved too**, as a buoyancy length
  `H_q≈MIX·w/N` from the mixing against the inversion's stability. Jets ventilate (loft floor
  moisture up, dry the floor / wet the axis), conserving total water. Fog here is **mist over the
  cold lakes** (the warm-floored bore is sub-saturated — dew, not rain); `hasFog` is the rare bulk
  RH≥1 case, `hasCond`/`mist` the lake mist.
- **wind** — convective scale `(B·z_i)^⅓` choked by the inversion's stability, plus the
  fountain's **induced breeze** (a few m/s), in a Coriolis-dominated frame (`f=2ω`, Rossby≪1).
  **The jet's water exit speed (~120 m/s) is NOT the wind** — that was an early bug. The ambient
  breeze comes from `inducedWind()` (momentum spread over an entrained-air plume); the exit speed
  lives only in the jet-mechanics readouts.

`sim/fountain.mjs` is the vendored rotating-frame ballistic jet solver (RK4 of centrifugal +
Coriolis): the trajectory (it arcs back unless `v0 ≥ ωR`, so jets don't escape) and the induced
wind. `sim/ratchet.mjs` is the inner-rim topography — **3** asymmetric teeth → lakes as
constant-radius equipotential arcs — and `fillBasin()`, which maps a water volume to a lake
surface area/depth (and flags overflow into an annular sea). The renderer's water-volume slider
drives it.

## Run / test (all run from the sandbox; deploy does not)

```bash
node iris/test/section.selftest.mjs    # 41 checks: energy, hydrostatics, vapour conservation, wind, jets, lakes
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
3b. **The climate is solved, never dialed.** Floor humidity (lake coverage + cold-sink ceiling),
   the inversion (greenhouse radiative balance), and the vapour scale height (buoyancy length) are
   all OUTPUTS — there are no `RH_floor`, `invStrength`, or `humidityScale` knobs. The scenario
   knobs are lights/water/spin/geometry/pressure; the climate emerges. Don't re-add solved
   quantities as inputs. The greenhouse↔humidity↔scale-height coupling is a small fixed point
   (`state(inv)` relaxed ~12×); keep it converging.
4. **Determinism, zero deps, node + browser.** `sim/*.mjs` run identically headless and in the
   page. No build step, no secrets; the worker just serves assets + `/health`.
5. **iris owns its geometry.** It does not import tide's `shared/geometry.mjs` — this is a
   different (smaller) cylinder. If the two ever need to agree, vendor, don't reach across.
