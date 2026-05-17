# proteus — Amoeba Qualia Prototype

A small browser prototype that tries to render what an *Amoeba proteus* might "see" of itself. The player never sees the amoeba directly. They see a Mercator-style projection of the cell surface, painted with four sensory heatmaps (adhesion, light, chemistry, cortical tension), and act by painting intent fields onto that map. The cell's hidden shape and position in the (also hidden) world update as a consequence. Core loop only — no growth, mitosis, or feeding yet.

Pure HTML + ES modules + Canvas 2D. No build step, no dependencies. Open `index.html` directly in a browser (file:// is fine).

## Controls

- **Left button / single touch** — paint outward pressure (locally extrude the membrane).
- **Right button / two-finger** — paint adhesion release (locally let the cell slide / retract).
- **Top bar** — toggle sensor channels and adjust brush size.

Intents decay over ~2s and drift rearward with membrane flow while active.

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

The map projection is intentionally a degenerate equirectangular: south pole = adhesion centroid, north pole = geodesic antipode along the polyline, with two longitudes (one per side of the cell). The lateral skirt is the widest band, which matches the biology — that's where most action happens.

## Deploy

Served as a subpath of the `mino-poke` Cloudflare Pages project (parent directory `pokemon/`, wrangler at `pokemon/wrangler.jsonc`). No build step. Live URL: `poke.mino.mobi/proteus/`. See repository root `CLAUDE.md` for context.
