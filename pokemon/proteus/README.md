# proteus — Amoeba Qualia Prototype

A small browser prototype that tries to render what an *Amoeba proteus* might "see" of itself. The player never sees the amoeba directly. They see a Mercator-style projection of the cell surface, painted with four sensory heatmaps (adhesion, light, chemistry, cortical tension), and act by painting intent fields onto that map. The cell's hidden shape and position in the (also hidden) world update as a consequence. Core loop only — no growth, mitosis, or feeding yet.

Pure HTML + ES modules + Canvas 2D. No build step, no dependencies. Open `index.html` directly in a browser (file:// is fine).

## Controls

- **Left button / single touch** — paint outward pressure (locally extrude the membrane).
- **Right button / two-finger** — paint adhesion release (locally let the cell slide / retract).
- **Top bar** — toggle sensor channels, adjust brush size, toggle the drifting texture, and flip into the **debug** top-down view (world + cell polyline + sensor dots + south-pole marker + chem-gradient arrow).

Intents decay over ~2s and drift rearward with membrane flow while active.

The brush is strongest along the horizontal centerline of the map (the equator — where sensor nodes actually live). Painting deep in the polar bands has reduced effect, which is correct: the poles are the cell's ventral / dorsal apex, sampled in aggregate rather than per-patch.

## Files

- `index.html` — entry point, UI shell.
- `world.js` — procedural generation of the hidden world (substrate, light, chemistry, obstacles).
- `sim.js` — hidden cell simulation (polyline + sensor nodes + per-tick update).
- `render.js` — map rasterization and channel blending.
- `input.js` — pointer handling and intent painting.

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
