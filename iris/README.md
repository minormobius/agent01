# iris — the O'Neill cylinder, end-on

Look straight down the axis of a small O'Neill ring habitat and you see a **circle**. iris is a
solver and viewer for that circle: switch which gradient you're looking at — **temperature,
pressure, humidity, wind** — and toggle the **fog** and the **fountain jets** on and off.

It is the end-on companion to the [tide](https://tide.mino.mobi) thermodynamics wing. tide
resolves the cylinder as 1-D radial columns and an azimuthal fountain slice; iris draws the
whole disk at once.

## The design

A deliberately small ring (its own geometry, not tide's 8/10 km build):

| | radius | role |
|---|---|---|
| bore | 0 → 4 km | the air, axis to floor |
| **floor** | **4 km** | the inner rim — where people stand (max gravity), the ratchet teeth and the lakes |
| shell | 4 → 5 km | structure + water reservoirs + heat pipes |
| **radiator skin** | **5 km** | the outer surface that radiates to space |

Gravity is centrifugal, `g(r)=ω²r` — zero at the axis, full at the floor. Spin defaults to 1 g
at the floor (`ω=√(g/R_floor)≈0.0495 rad/s`, ~0.47 rpm).

## The model — one coupled steady state

The spine is a single energy balance: **the lights are the only heat in, the radiator skin the
only heat out.** The user's design choice — that the habitat's heat reaches the skin through the
floor's **water reservoirs and heat pipes** — is the thermal path. The balance

```
F_light·(2πR_floor)  =  εσ(T_skin⁴ − T_space⁴)·(2πR_skin)
```

pins the radiator temperature, and the reservoir/floor sit above it by the heat-pipe and contact
ΔTs. Because heat flows *outward*, the floor is always the warm end: `T_floor > T_reservoir > T_skin`.

Everything else is a gradient hung off that:

- **Temperature** — a dry centrifugal adiabat from the floor (`cp·T+Φ=const`, `Φ=−½ω²r²`, so it
  cools toward the axis) plus a radiative **inversion** that warms the axis (the sun is on the
  axis). Crank the inversion and "up" flips from cold to hot — the signature O'Neill inversion.
- **Pressure** — centrifugal hydrostatic balance `dP/dr=ρω²r` integrated with the *local*
  temperature. Air pools at the rim; the bore runs ~80 kPa at the axis to 101 kPa at the floor.
- **Humidity** — vapour hung off the floor's relative humidity. **Jets off:** it stratifies and
  traps under the inversion. **Jets on:** the fountain well-mixes the column, *conserving* total
  water. **Fog** is wherever RH≥1 — a toggleable observable band.
- **Wind** — a convective velocity scale `w*=(B·z_i)^⅓` from the surface heat flux, choked by the
  inversion's stability, plus the jet sheet when the jets are on. The frame is strongly rotating
  (`f=2ω`, Rossby number ≪ 1), so rotation organises the flow.

The inner rim carries the **ratchet** topography (`sim/ratchet.mjs`): asymmetric teeth — a steep
scarp, a long glide — that let lakes sit as constant-radius (equipotential) arcs at all, and route
the fountain runoff prograde around the rim.

## Files

| File | Role |
|---|---|
| `shared/geometry.mjs` | the circle: `R_floor`, `R_skin`, `ω` |
| `sim/section.mjs` | the coupled solve — energy, temperature, pressure, humidity, wind |
| `sim/fountain.mjs` | vendored rotating-frame ballistic jet solver — trajectory + induced wind |
| `sim/ratchet.mjs` | inner-rim topography (3 teeth) + the topology-aware lake fill |
| `index.html` | the circular renderer — 4 views, fog + jets toggles, reservoirs/heat pipes/radiator |
| `test/*.selftest.mjs` | the contract (42 checks) |
| `worker.js`, `wrangler.jsonc` | assets worker for `iris.mino.mobi` |

## Run / test

```bash
node iris/test/section.selftest.mjs    # 33 checks
node iris/test/ratchet.selftest.mjs    # 9 checks
open iris/index.html                    # the viewer
```

Pure static, zero-dep, no build step. Every model runs in your browser.
