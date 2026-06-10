# biome — life-support modelling for an infinite O'Neill cylinder

Tooling for thinking about the **interior** of an infinite (no end-caps) O'Neill
cylinder run as a **bio-engine**: a linear sun on the spin axis, vegetation on the
inner surface of the structural Voronoi rind, and the enclosed air/water/soil doing
the work of a closed life-support loop. Companion to the structural work in
[`/hoop`](../hoop) (which models the rind itself) — this is the volume *inside* it.

> **Status:** Tool 1 (the resource-cycle box model) is built and self-verifying.
> Tools 2 (1-D radial atmosphere column) and 3 (WebGPU interior visualiser) are
> specified below but not yet built.

## Why this shape of tool

The cylinder interior has a counterintuitive thermal layout that drives everything:

- **"Up" (toward the axis) wants to be hot, not cold.** The linear sun is on the
  axis; the cold sink is the shell radiating to space at the rim. That's the
  *inverse* of Earth, where up is cold. The consequence isn't just "condensation on
  the edges" — it's **permanent stratification**: warm air rises to the axis and
  stays there (no cold ceiling to re-densify it), so the steady state is a thin
  convective weather layer near the vegetated surface under a hot, stable core.
- **The water cycle goes dew-dominated, not rain-dominated.** Adiabatic cooling
  from axis to rim is tiny (gravity `g(r)=ω²r` falls to zero at the axis), so the
  whole atmosphere spans only ~16 K and ~17% pressure drop for an Island-Three-scale
  cylinder. Not enough thermodynamic room to build rain clouds. Condensation happens
  within metres of the cold surface — **fog under the canopy, dew drip**, like a
  cloud forest. Your instinct is right.
- **The trap:** the same stratification that gives gentle dew irrigation also
  **suppresses vertical mixing of CO₂**. A photosynthesising canopy depletes CO₂ in
  its own boundary layer within minutes; on Earth wind resupplies it. Here the fog
  that waters the plants and the stagnation that starves them of CO₂ are the *same*
  phenomenon. The mixing pump has to come from within the symmetry — the photoperiod
  thermal tide (pulse the sun) is the natural candidate, and Coriolis (ω≈0.055 rad/s,
  ~800× Earth) is strong enough to organise any radial flow into bands/rolls.

Before any of that spatial detail matters, the **zeroth question** is whether the
loop can close at all as stocks and flows. That's Tool 1.

## Tool 1 — the resource-cycle box model (`sim/cycles.mjs`)

A non-spatial, deterministic stocks-and-flows model of the closed ecology. Zero
dependencies, runs identically in node and the browser. Drive it from the dashboard
(`index.html`) or import it.

### What it tracks

| Loop | Reservoirs | Conserved |
|---|---|---|
| **Carbon / oxygen / water** | CO₂, O₂, H₂O (vapour + liquid), standing biomass, litter, food store | C, H, O — **exactly** |
| **Nitrogen** | N₂, mineral-N, biomass-N, litter-N | N — **exactly** |

The trick that makes it verifiable: every heterotroph — crew breathing, plant
respiration, soil microbes — runs the **same** reaction

```
CH₂O + O₂ → CO₂ + H₂O          (respiration / decomposition)
CO₂ + H₂O → CH₂O + O₂          (photosynthesis, the exact reverse)
```

Photosynthate is modelled as carbohydrate-equivalent (CH₂O), so carbon, hydrogen
and oxygen are conserved **by construction**. The self-test then checks the RK4
integrator against that invariant (drift < 1e-9 over a model-year), which validates
the *numerics*, not just the algebra. Nitrogen rides a separate, independently
conserving loop (fixation → mineral → biomass → litter → mineralise → denitrify).

### The insights it's built to surface

1. **Air closes easily; calories are the hard part.** At ~20 m²/person of crop the
   air (O₂/CO₂) regenerates fine but the crew is fed only ~20–25% — exactly the
   historical BIOS-3 result (it closed air and water, never full diet). Push crop
   area up and calorie self-sufficiency climbs, but…
2. **…CO₂ self-limits in a closed loop.** More leaf area divides a *fixed* respiratory
   CO₂ flux (crew + decomposition) among more plants at lower concentration, so
   productivity per m² falls. You can't just add greenhouse to feed more people; the
   carbon throughput is bounded by what's being respired. Watch CO₂ fall from ~900 to
   ~110 ppm as you drag crop area up.
3. **Oxygen security is banked carbon, not air.** At steady biomass the *net* air-O₂
   change → 0. The real oxygen reserve is the **stored reduced carbon** (food +
   biomass + litter) that hasn't been oxidised yet — it dwarfs a day's breathing.
   Lock carbon away and you bank O₂. (This is literally why Earth has an oxygen
   atmosphere: buried carbon.) The self-test asserts both halves.
4. **The Biosphere-2 failure mode is a slider.** Crank soil decay rate
   (`litterDecay_perday`) and net O₂ falls as microbes out-respire the crop — the
   real mechanism that sank Biosphere-2 (rich soil + concrete ate the oxygen).

### Run it

```bash
node biome/test/cycles.selftest.mjs     # 12 checks: conservation, bounds, the insights, determinism
open  biome/index.html                  # dashboard: drag a knob, the model-year reruns live
```

### Knobs (all in `defaultParams()`)

crew · crop area · sun duty cycle (photoperiod) · legume fraction · harvest index ·
soil decay rate · autotroph respiration fraction · biomass C:N · N fixation rate ·
denitrification · air-box volume · water reservoir. Every number is sourced from
closed-ecology literature (BIOS-3, MELiSSA, Biosphere-2) and NASA BVAD human factors;
all are documented inline at their definitions.

### Known simplifications (also exported as `KNOWN_SIMPLIFICATIONS`)

- Nitrification's O₂ cost isn't coupled to the gas balance (small vs. soil C
  respiration, which *is* modelled).
- Photosynthate is carbohydrate-equivalent; lipid/protein energy density not split.
- **Single well-mixed air box — no radial structure.** That's the whole point of
  Tool 2. This model tells you *whether* the loop closes; it can't tell you *where*
  the fog sits or whether CO₂ stratifies into a dead zone.
- Temperature is a fixed parameter (no thermal feedback on rates yet).
- Trace-gas / ethylene buildup (a real closed-ecology hazard) not modelled.

## Tool 2 — 1-D radial atmosphere column (planned)

A `r`-only profile model: temperature, pressure, humidity and CO₂ as functions of
radius and time. This is where "up is hot", the saturation/dew profile, the
stratification, and the photoperiod mixing pump live. Cheap, deterministic, fully
testable — parameterises Coriolis/convection as a mixing coefficient rather than
simulating it. Answers: *where is the fog, how thick, does CO₂ stratify into a dead
zone, does pulsing the sun break the inversion enough to ventilate the canopy.*
Feeds its surface boundary conditions from Tool 1's steady state.

## Tool 3 — WebGPU interior visualiser (planned)

The iconic O'Neill view — looking "up" and seeing more land curve overhead — but
with the **atmosphere** rendered: the linear axial sun, the canopy on the inner
surface, fog banding by altitude (from Tool 2), and optionally a compute-shader
`(r,θ)` slice showing Coriolis-organised convection rolls. Fed by Tools 1 and 2, so
it visualises validated state, not assumptions.

## Layout

```
biome/
├── sim/cycles.mjs          # Tool 1: the box model (pure, zero-dep, node + browser)
├── test/cycles.selftest.mjs# headless proof: conservation + bounds + insights + determinism
├── index.html              # Tool 1 dashboard (vanilla, no build step)
└── README.md               # this file
```

This directory is intentionally separate from `/hoop` (structural rind) — the two are
complementary halves of the same habitat and shouldn't collide on files.
