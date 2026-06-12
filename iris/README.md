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
  cools toward the axis) plus a radiative **inversion that is solved, not set**: the axial sun
  absorbed by the greenhouse gases (chiefly the solved water vapour, `τ=κW+τ₀`) is radiated from
  the warm axis to the cold floor, `σ(T_axis⁴−T_floor⁴)=(1−e^−τ)F`. More lights or more water →
  stronger inversion → "up" flips hot. It's an outcome of the energy/water, not a dial.
- **Pressure** — centrifugal hydrostatic balance `dP/dr=ρω²r` integrated with the *local*
  temperature. Air pools at the rim; the bore runs ~80 kPa at the axis to 101 kPa at the floor.
- **Humidity** — *solved, not set.* The lakes ARE the cold reservoir water, so they both source
  the vapour and cap it (saturation over cold water); the floor RH follows the **lake coverage**.
  The **vapour scale height is solved too** — a buoyancy length `H_q≈MIX·w/N` set by the mixing
  against the inversion's stability. **Jets** ventilate — lofting floor moisture upward (drying
  the floor, wetting the axis), *conserving* total water. **Fog** here is **mist over the cold
  lakes** (the warm-floored bore is sub-saturated — dew, not rain) — a toggleable observable.
- **Wind** — a convective velocity scale `w*=(B·z_i)^⅓` from the surface heat flux, choked by the
  inversion's stability, plus the fountain's **induced breeze** (a few m/s — the entrained air the
  jet drags, *not* the 120 m/s water exit speed). The frame is strongly rotating (`f=2ω`, Rossby
  number ≪ 1), so rotation organises the flow.

The inner rim carries the **ratchet** topography (`sim/ratchet.mjs`): asymmetric teeth — a steep
scarp, a long glide — that let lakes sit as constant-radius (equipotential) arcs at all, and route
the fountain runoff prograde around the rim.

- **Time** — the sun is a photoperiod (peak at noon, dark at night) carrying a fixed daily-mean
  flux. Convection and the greenhouse follow the instantaneous sun, so at night both collapse and
  the bore goes isothermal; the floor temperature is a damped, lagged diurnal wave (real thermal
  mass — air + lake water). The jets run on a schedule (default: at night, to ventilate the
  stagnant dark hours). Energy closes over the day, not each instant (the floor stores heat by day,
  releases it by night). "Play the day" animates it.

## Files

| File | Role |
|---|---|
| `shared/geometry.mjs` | the circle: `R_floor`, `R_skin`, `ω` |
| `sim/section.mjs` | the coupled solve — energy, temperature, pressure, humidity, wind |
| `sim/fountain.mjs` | vendored rotating-frame ballistic jet solver — trajectory + induced wind |
| `sim/ratchet.mjs` | inner-rim topography (3 teeth) + the topology-aware lake fill |
| `index.html` | the circular renderer — 4 views, fog toggle, the diurnal clock (play the day), a line graph along two draggable angle cuts |
| `test/*.selftest.mjs` | the contract (55 checks) |
| `worker.js`, `wrangler.jsonc` | assets worker for `iris.mino.mobi` |

## Run / test

```bash
node iris/test/section.selftest.mjs    # 46 checks
node iris/test/ratchet.selftest.mjs    # 9 checks
open iris/index.html                    # the viewer
```

Pure static, zero-dep, no build step. Every model runs in your browser.
