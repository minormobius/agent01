# tide — the thermodynamics of an infinite O'Neill cylinder

**Live at:** `tide.mino.mobi`
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules. No build step.
**Deploy:** `.github/workflows/deploy-tide.yml` — `wrangler deploy` on push to `tide/**`.

The **thermodynamics** wing of a four-part O'Neill cylinder modelling package. tide models the
air, the fog, the water cycle and the heat books of the interior: a 1-D radial atmosphere
column, the Mie fog optics, the fountain + linear-sun azimuthal cross-section, and the
water/energy ledger that closes across them.

### One package, four wings

| Wing | Surface | What it models |
|---|---|---|
| **The game** | [`hoop.mino.mobi`](../hoop) | the infinite game — a world you walk, where every place is a forum thread |
| **The structure** | [`rind.mino.mobi`](../rind) | the foam space-frame shell + the Rust/WASM frame solver |
| **The thermodynamics** | `tide.mino.mobi` *(this)* | the radial atmosphere, fog optics, the fountain & sun, the water/energy ledger |
| **The ecosystem** | [`biome.mino.mobi`](../biome) | the closed food-web box model + allometry + roster + stability lab |

tide is the climate; biome is the ecology that lives in it. They share the cylinder — **radius
is altitude is temperature/humidity/CO₂** — so the planned radius-niche coupling is where tide
and biome become one cylinder model. tide was split out of `biome` in the cylinder-refactor;
biome kept the food-web (the *ecology*), tide took the air/water/energy (the *climate*).

## Why the air is strange

The cylinder interior has a counterintuitive thermal layout that drives everything:

- **"Up" (toward the axis) wants to be hot, not cold.** The linear sun is on the axis; the cold
  sink is the shell radiating to space at the rim. That's the *inverse* of Earth. The
  consequence is **permanent stratification**: warm air rises to the axis and stays there (no
  cold ceiling to re-densify it), so the steady state is a thin convective weather layer near
  the vegetated surface under a hot, stable core.
- **The water cycle goes dew-dominated, not rain-dominated.** Adiabatic cooling from axis to
  floor is set by the cylinder size: an Island-Three-scale habitat (3.2 km) spans only ~16 K
  and ~17% pressure drop, while the build modelled here (an **8 km** floor with 1 g at the
  **outer** radius ⇒ ~0.8 g floor — see `shared/geometry.mjs`) spans **~31 K and ~32%** — a
  colder, thinner axis. Either way condensation happens near the cold surface — **fog under the
  canopy, dew drip**, like a cloud forest.
- **The trap:** the same stratification that gives gentle dew irrigation also **suppresses
  vertical mixing of CO₂**. A photosynthesising canopy depletes CO₂ in its own boundary layer
  within minutes; on Earth wind resupplies it. Here the fog that waters the plants and the
  stagnation that starves them of CO₂ are the *same* phenomenon. The mixing pump has to come
  from within the symmetry — the photoperiod thermal tide (pulse the sun), plus a **fountain**
  that lofts air mechanically. Coriolis (ω≈0.031 rad/s, ~430× Earth for the 8 km build) is
  strong enough to organise any radial flow into bands/rolls — and to curve a water jet into an
  irrigation sheet.
- **Fog is an optical medium, and the sun can burn it.** The cold-surface stratus deck is a
  cloud of ~10 µm droplets; the linear sun's light **Mie-scatters** through it (dimming the
  view) while its near-IR fraction is **absorbed**, warming the fog and evaporating it. The deck
  blooms dense at night (optical depth ~80–100, a near-blackout) and the sun **burns it off by
  day**, reopening the canopy to light. That optics lives in `atmosphere/sim/optics.mjs`.

## Module 2 — 1-D radial atmosphere column (`atmosphere/`)

The cylinder is symmetric along and around its axis, so the only gradient is **radius**. This is
that 1-D column — temperature, pressure, humidity and CO₂ as functions of radius (equivalently
altitude) and time — evolving under a pulsable axial sun. Live viewer at `atmosphere/index.html`;
kernel in `atmosphere/sim/column.mjs` (pure, zero-dep, node + browser).

**It reproduces the geometry's numbers by construction.** Centrifugal hydrostatic balance
(`dP/dr = ρω²r`) on a cylindrical finite-volume grid gives a **~32% pressure drop** axis→floor
for the 8 km build; the centrifugal adiabat (`Δ = ω²(R²−r²)/2cp`) gives a **~31 K** offset. The
axis runs near −5 °C with a dense near-surface stratus deck. Potential temperature carries the
adiabat, so "well mixed" means uniform θ, not T.

**The method** (idealised, Held–Suarez spirit): radiation is a Newtonian relaxation of θ toward
a prescribed radiative-equilibrium profile; dynamics is an explicit, **stability-dependent eddy
diffusion** (convective adjustment) that mixes hard where the column is statically unstable and
barely at all under the inversion. Finite-volume in true cylindrical geometry (flux area ∝ r,
the axis closes for free), so the diffusion operator conserves mass/heat/CO₂/water to machine
precision.

```bash
node tide/atmosphere/test/column.selftest.mjs   # 16 checks: structure, conservation, phenomena, Mie fog burn-off, fountain coupling
node tide/atmosphere/test/optics.selftest.mjs   # 11 checks: Mie extinction, Koschmieder visibility, beam march
open tide/atmosphere/index.html                 # the live radial-slice viewer
```

## Module 2b — fountain & sun: the azimuthal cross-section (`fountain/`)

Module 2 resolved the cylinder in radius; this resolves the other free dimension — **azimuth** —
looking straight down the axis. Two coupled pieces share one view (live at `fountain/index.html`):

- **The fountain (`fountain/sim/fountain.mjs`).** The water cycle's actuator. A jet throws
  pre-treated pond water inward toward the axis; in the rotating frame a parcel feels only
  centrifugal (`+ω²r`) and Coriolis (`−2Ω×v`) — an exact ODE, RK4-integrated and **conserved**
  (specific energy holds to ~1e-15). Because `2ωv ~ g`, the jet curves into a **sheet** that lays
  irrigation across a broad arc. One actuator answers two stagnations: spraying aerates stagnant
  *water*, and the plume lofts surface *air* through the inversion. Four nozzles trade off (jet /
  fan / symmetric fan / mist).
- **Momentum coupling.** `Fountain.ventilationK()` expresses the plume's mechanical work on the
  air as an equivalent eddy diffusivity fed into Module 2's column — the night-time pump buoyant
  convection can't provide. With thermal convection off, the fountain alone **cuts the canopy CO₂
  swing ~60%**. `Fountain.inducedWind()` is the same coupling seen as a *wind*: the jet's momentum
  flux (ρ_w·Q·v₀) handed to a momentum-conserving entrained-air plume (b = b₀ + αh, α ≈ 0.12),
  giving w(h) = √(F/ρ_aπb²) — a gale at the nozzle, a fresh breeze at the inversion, calm above
  the plume top. The viewer draws it as chevrons riding the jet sheet, gated by the diurnal jet
  phase, and the jets rise from inside their lakes (the wall is the lake bed, the chord its surface).
- **The luminous-flux budget (`fountain/sim/light.mjs`).** The axial sun is a **line**, so
  irradiance falls as **1/r**. Flooding the 8 km wall at 1 sun takes a **~50 MW-per-metre** lamp.
  All that light becomes heat, radiated from the larger 10 km outer skin — at half a sun a benign
  ~24 °C radiator, at 1 sun ~81 °C; the foam rind *insulates*, it is not the heat path, so heat
  must be actively pumped to the radiator. Half a sun is the sweet spot.

```bash
node tide/fountain/test/fountain.selftest.mjs   # 25 checks: energy conservation, deflection, nozzles, ventilation K, induced wind, jet mechanics
node tide/fountain/test/light.selftest.mjs      # 15 checks: 1/r falloff, the 50 MW/m headline, radiator + foam heat closure
open tide/fountain/index.html                   # the looking-down-the-axis viewer, with the live diurnal column
```

## Module 4 — the systems ledger: water & energy (`systems/`)

The spatial modules each conserve their own books; this closes the two that cross all of them —
**energy** and **water** (`systems/sim/resources.mjs`, surfaced in the fountain view). Reactors
are the only source; light and jets the only loads.

- **Energy** is instantaneous accounting on the light budget. Lighting **dwarfs everything
  mechanical by ~1000×**, so the reactor is sized *entirely* by light; the jets are a rounding
  error.
- **Water** is a four-box model (lake / soil / vapour / fog) with every flow paired, so total
  water **conserves to ~1e-16**. Lake depth falls out of the reservoir charge ÷ footprint;
  residence time (~40 days) is the treatment + thermal buffer.
- **Phase separation** (the design answer): run the jet **day-phased** — it ventilates the canopy
  when photosynthesis needs CO₂ and the sun is burning the fog anyway, then backs off at night so
  the cool surface breeds **free dew irrigation**.
- **The aquatic biome.** `aquaticCapacity()` turns lake surface into a sustainable fish stock —
  the natural hand-off point to biome's food web (lake → fish).

```bash
node tide/systems/test/resources.selftest.mjs   # 17 checks: water conservation, lake depth, energy, jet phase, fish
```

## Module 3 — WebGPU interior visualiser (planned)

The iconic O'Neill view — looking "up" and seeing land curve overhead — but with the
**atmosphere** rendered: the linear axial sun, the canopy on the inner surface, fog banding by
altitude (from Module 2), and a compute-shader `(r,θ)` slice showing Coriolis-organised
convection rolls. Fed by this wing's validated state, so it visualises physics, not assumptions.

## Layout

```
tide/
├── index.html                    # landing page — the premise + module cards
├── worker.js                     # assets worker (+ /health); model runs client-side
├── wrangler.jsonc                # name=tide, custom_domain route tide.mino.mobi
├── shared/geometry.mjs           # the canonical cylinder (8 km habitat, 10 km hull, 1 km foam rind)
├── atmosphere/                   # MODULE 2 — 1-D radial atmosphere column
│   ├── index.html · sim/column.mjs · sim/optics.mjs · test/{column,optics}.selftest.mjs
├── fountain/                     # MODULE 2b — azimuthal cross-section: fountain + light
│   ├── index.html · sim/fountain.mjs · sim/light.mjs · test/{fountain,light}.selftest.mjs
└── systems/                      # MODULE 4 — water & energy ledger
    └── sim/resources.mjs · test/resources.selftest.mjs
```

`shared/geometry.mjs` is **the canonical cylinder** for this wing: atmosphere, fountain and
systems all import it via `../../shared/geometry.mjs`. It is the single source of the build's
numbers (8 km habitat radius, 10 km hull, 1 km foam rind, 1 g at the outer radius). If biome
later adds radius-niche coupling, it should vendor a copy of this module rather than reach
across surfaces.

## Conventions & pitfalls

- **Pure static, golden rule.** `wrangler.jsonc` `name` is `tide` and declares `tide.mino.mobi`
  as a `custom_domain` route — verify the deploy log binds `tide.mino.mobi (custom domain)`.
- **Every model is deterministic, zero-dep, node + browser.** The self-tests are the contract;
  run them before pushing. No build step.
- **Conservation is the discipline.** Each module conserves its books to machine precision; the
  systems ledger closes the two that cross modules. Don't introduce a flow without its pair.
