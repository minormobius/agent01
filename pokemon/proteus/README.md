# proteus — Amoeba Qualia Prototype

A small browser prototype that tries to render what an *Amoeba proteus* might "see" of itself. The player never sees the amoeba directly. They see a Mercator-style projection of the cell surface, painted with four sensory heatmaps (adhesion, light, chemistry, cortical tension), and act by painting intent fields onto that map. The cell's hidden shape and position in the (also hidden) world update as a consequence. Core loop only — no growth, mitosis, or feeding yet.

Pure HTML + ES modules + Canvas 2D. No build step, no dependencies. Open `index.html` directly in a browser (file:// is fine).

## Controls

The cell carries a positive internal hydrostatic pressure that pushes every point on the membrane outward — it's a balloon. The cortex (per-segment spring stiffness, `cortexK`) is what holds it in. Player input modulates `cortexK` locally:

- **Tap** a point on the map — quickly weakens cortex there. Pressure wins locally, and that region extrudes as a pseudopod.
- **Tap and hold** — anchor at the touch point. The cortex stays low for as long as you hold; the foot keeps extending.
- **Drag up from the anchor** — flips the input over to *retract* mode. Cortex stiffens above baseline at the anchor point; that region pulls inward. Drag distance maps to strength (about 60 CSS pixels = full retract).
- **Drag down** — extra-strong extend.

The brush footprint sits at the anchor, not the current pointer. The pointer's motion is purely a vertical-slider gesture. Cortex recovers toward neutral (1.0) over a second or two when you let go, so taps fade naturally.

Self-intersection isn't explicitly prevented; the internal pressure works against folding inward, which keeps the cell broadly convex.

**Top bar** — sensor channel toggles, brush radius slider, and a **debug** top-down view (substrate fields, cell polyline, sensor dots, south-pole marker, chem-gradient arrow, food markers, live winding number + budget). Cortex deviation appears as a colored halo in debug: cool blue = extending, warm red = retracting.

## Files

- `index.html` — entry point, UI shell.
- `world.js` — procedural generation of the hidden world (substrate, light, chemistry, obstacles).
- `sim.js` — hidden cell simulation (polyline + sensor nodes + per-tick update).
- `render.js` — map rasterization and channel blending.
- `input.js` — pointer handling and intent painting.
- `flagella.js` — the ciliary apparatus: waveform, behavioural state machine, thrust.
- `flagella.selftest.mjs` — `node pokemon/proteus/flagella.selftest.mjs`. Run it before touching `flagella.js`.

## Cilia — the second gait

The cell also carries a **compound cilium**: four cilia at one point on the
membrane, bundled into one while swimming and unfurled while stopped. Crawling
is paid for in cortex and needs the substrate; swimming is paid for in beat and
does not. They sit on the same cell, sharing one membrane and one material
budget, and they do not cooperate — which is the reason to have both.

Every number in it comes from one paper:

> **Embodied behavioural complexity in a ciliated microorganism.**
> *Nature Communications* **17**, 8445 (2026).
> [doi:10.1038/s41467-026-75076-8](https://doi.org/10.1038/s41467-026-75076-8)

It films 125 *Pterosperma* cells — a marine prasinophyte, 9 × 7.1 µm of body
wearing four 67 µm cilia — and extracts 219,368 ciliary waveforms. Three things
in it are directly usable, and `flagella.js` is those three:

- **A shape basis.** The waveform is the tangent angle θ(s,t) on Chebyshev
  polynomials; twenty modes reconstruct a real cilium to 0.368 µm. So a
  flagellum's *state* is a 20-number vector, not a polyline. The prototype
  round-trips through that basis every tick on purpose: what the modes cannot
  hold does not reach the physics.
- **A dispersion relation.** The first empirical *f*–*k* relation for ciliary
  beating, and it is linear. Linear dispersion means one fixed wave speed, so
  beat frequency alone determines the wavelength — the waveform's free
  parameters collapse to a single scalar. Four quantized bands (37, 88, 184,
  265 Hz) sit on top of it, which the model snaps toward.
- **A behavioural state machine with measured rates.** Stop / Swim / Reorient,
  with a *linear* topology: Stop and Reorient both hang off Swim, so a stopped
  cell must swim before it can turn. Mean dwells 58 s / 1.42 s / 41 ms — four
  orders of magnitude — and a steady state of 96.6% stopped.

Thrust is resistive force theory (Gray & Hancock) evaluated on the reconstructed
centreline: drag is about twice as hard across the filament as along it, and
that asymmetry alone turns a travelling wave into propulsion. The selftest
breaks both halves — freezing the wave, and making the fluid isotropic — and
requires the thrust to vanish each time.

The one parameter the paper does not give is the dispersion relation's
*constant*. It is pinned by a different measurement in the same paper: given
the cilium's length and the observed 95 Hz beat, resistive force theory turns
wavelength into swimming speed, and requiring 646 µm/s leaves about **0.95
wavelengths along the cilium**. That is the model's one structural prediction,
and `WAVELENGTHS_PER_CILIUM` will fail the selftest if it drifts from what the
speed implies.

### Controls

Brush the map at the ciliary band — the tinted vertical strip — and the same
extend/retract gesture that grows a pseudopod elsewhere means something else
here: **extend urges the cell to swim, retract urges it to stop**. It leans on
the transition rates by up to about five-fold; it never sets the state. A
reorientation in progress ignores you completely. Left alone the cell is
stopped 96.6% of the time, exactly as measured — a sit-and-wait organism that
only swims because you lean on it.

### Three knowing departures from the data

Uniformly scaling every rate leaves the occupancy alone, so none of these
touches the 96.6%:

| | Model | Prototype | Why |
|---|---|---|---|
| state rates | as measured | ×8 | a faithful cell sits motionless for 58 s at a time. This deliberately destroys the four-orders-of-magnitude timescale separation the paper is partly about |
| cilium length | 67 µm on a 4.5 µm body radius, ~15:1 | 2.2 cell radii | 15:1 here is a 900 px whip in an 800 px world |
| swim vs. crawl speed | ~300:1 | ~2:1 | 300:1 puts the cell off the far edge of the world in under a second, and tears the cortex on the way |

Beat frequency is *displayed* divided by `beatScale` (default 12) because 95 Hz
cannot be drawn at 30 fps. The model frequency — the one that sets the
wavelength, the thrust, and the µm/s readout — is untouched.

### Why an amoeba has cilia

*Amoeba proteus* does not. The move is *Naegleria*'s: an amoeba that grows two
flagella in about an hour when the water changes. The numbers are
*Pterosperma*'s, the body is neither, and none of that is hidden — it is at the
top of `flagella.js`.

## Scientific notes

Two pieces of biology shaped the design:

- **Grebecki, A. (1986). Two-directional pattern of movements on the cell surface of *Amoeba proteus*.** *J. Cell Sci. 83, 23–35.* Established that the cortex shows a dominant anterograde (forward) flow with a slower retrograde counter-flow on a subset of the surface. In this prototype, each sensor node drifts along the polyline at a small anterograde rate, and a subset of nodes carries a slower retrograde counter-flow. Painted intents advect with this flow, which is why leading your action is part of the skill.

- **Taniguchi, D. et al. (2023). Dorsoventral asymmetry and surface flow in *Amoeba proteus*.** Observed that surface flow slows in the dorsal-posterior quadrant, where membrane material "bunches" before being recycled. This prototype models that as a per-quadrant flow attenuation that accumulates a "wrinkle" scalar, which modulates the drifting texture layer on the map.

The projection treats the 2D polyline as the **equator (skirt)** of a virtual sphere. Each sensor node's longitude (mapU) is its azimuth around the cell centroid. Latitude is not carried by the nodes: the map's two horizontal poles are *virtual readings* sampled at the cell footprint — the south (ventral) pole shows full substrate adhesion and almost no light; the north (dorsal) pole shows full ambient light and no adhesion. The renderer interpolates each pixel between the equator's per-azimuth band and the appropriate pole. This is what makes the four channels read as distinct colored regions instead of one identical perimeter ring.

## Level 1 + materials cycle

The current world is **Level 1**: no obstacles, broad smooth substrate adhesion, and a single piece of food. The food is the only chemistry source, so the chem gradient leads straight to it. Engulfment is detected as a winding-number threshold on the polyline around the food — wrap most of the way around and the food is consumed.

Each membrane patch carries a `restLenRatio` representing how much material it holds, defaulting to 1.0. Per tick:

- High-tension segments **draw** material from `sim.budget` (visible as the bottom strip). Their `restLenRatio` grows, the local spring rest length grows, and next-tick tension falls — the membrane feels itself relax.
- Wrinkled low-tension segments (the dorsal-posterior bunching zone) **shed** material into `sim.budget`, draining wrinkle and shrinking their `restLenRatio` (those edges tighten back up).
- Engulfing food dumps `food.value` directly into the budget. That's the resource payoff.
- `restLenRatio` slowly recovers toward 1.0 so the cell doesn't lock into permanent distortion if you leave it alone.

The top-down debug view shows live winding number and current budget in its legend, so you can watch engulfment fire in real time.

Note: this prototype intentionally does **not** prevent membrane self-intersection. Real engulfment involves the membrane wrapping past itself, and pinch-off + recycling will be handled when growth / death is added.

## Deploy

Served as a subpath of the `mino-poke` Cloudflare Pages project (parent directory `pokemon/`, wrangler at `pokemon/wrangler.jsonc`). No build step. Live URL: `poke.mino.mobi/proteus/`. See repository root `CLAUDE.md` for context.
