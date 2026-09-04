# packages/bismuth — the hopper-crystal growth engine

The engine behind [bismuth.mino.mobi](https://bismuth.mino.mobi) (the
specimens and the playground) and [hopper.mino.mobi](https://hopper.mino.mobi)
(the platformer). No build step, no dependencies. **This directory is the
source; every site serves a byte-identical copy** from its own asset root
(`bismuth/js/`, `hopper/js/`), kept honest by `scripts/sync-dataviz.mjs
--check` (run in preflight and in both deploys). Edit here, then
`node scripts/sync-dataviz.mjs --write`.

| File | What |
|---|---|
| `prng.js` | xmur3 + mulberry32; `stream(seed, label)` named sub-streams, `rint`, `rf`, `pick` |
| `genome.js` | seed → habit, kinetics, rim, nucleus, oxide palette; `DEFAULT_BRAIN`, `DEFAULT_POPULATION`; `quasiSubstrate`, `icoSubstrate` + `icoBudget` (the /i namespace: radius 20, budget capped to the cylinder) |
| `crystal.js` | `Lattice` (cubic substrate with extent maps), `Mason`, `Colony`, `Growth` — Kossel kinetics, the terrace rule, deploy/freeze/remove |
| `prism.js` | `Prism` — any plane tiling from `packages/tilings` stacked into layers (Penrose → a decagonal quasicrystal) |
| `stack.js` | `Stack` — the same tilings with each layer staggered (AB, ABC: the close packings — hexagons AB is hexagonal close packing, ABC the rhombohedral family, the square grid AB face-centred cubic) and/or twisted a fixed angle a layer (moiré bonds, quasiperiodic along z). Vertical bonds are exact tile overlaps; the column top is a height field; the terrace rays run in world space. `isStacked(spec)`, `normalizeStack(spec)` |
| `ico.js` | `Ico` — the icosahedral quasicrystal: space tiled by the two golden rhombohedra (Ammann–Kramer), generated as the dual of a 6-grid with exact integer 6-tuple vertices; six face-bonds a brick, the melt above along a two-fold axis, thirty per-direction extent maps for the terrace rule, exact shadow columns for open sky, 3D point location. `icoTiling(R)` (cached), `ICO_R_MIN/MAX/DEFAULT` |
| `flux.js` | `Flux` — the crystal as a magnet: every brick a dipole (diamagnet as bismuth is, paramagnet, or a ferromagnet whose colonies are domains along the substrate's easy axes), the field on a coarse grid with multipole cells, flux lines traced through it and stopped at bricks; with the applied field off a ferromagnet is remanent and its own lines are seeded on its surface. `Section` — the field on a plane through the crystal (strength as colour, direction as line integral convolution, the cut in domain colours), quick from the grid and sharpened from the dipoles. `FluxDriver` recomputes a few slices a frame for a page and keeps the section facing the camera. Rendering, not physics |
| `worms.js` | `Worms` — the second wave: ghosts of the masonry that tunnel brick to brick along the bond graph and now and then take a brick with them; `recycle` feeds bitten bricks back to the live colony. Substrate-agnostic, deterministic (`stream(seed, "worms")`) |
| `render.js` | WebGL1: chunked voxel + prism meshers with baked AO, per-pixel thin-film interference, mason motes; an orbit camera or a first-person one (`renderer.fp`); props (`setProps`) and beacons for a page that puts things in the world that are not crystal |
| `tilings.js` | a synced copy of `packages/tilings/tilings.js`, so `prism.js` can import `./tilings.js` wherever the copy lands |
| `crystal.selftest.mjs` | determinism + golden brick hashes, connectivity, the melt-is-above rule, morphology, the playground contracts, the prism, the stack (overlaps, coordination, its own golden), the icosahedral quasicrystal (closure, φ, exactness against a rebuild, its own golden), deploy + remove, the API contract |
| `phase.mjs` / `phase-report.mjs` | the two-agent phase space: experiment grids over mason flux × worm pressure (the sink, the Allee threshold, breeding worms, the chemostat, one mason vs sixteen), JSON out; the report renders it as a page. Findings: `PHASE.md` |
| `flux.selftest.mjs` | a brick's dipole field has the right sign each way, a crystal's lines are finite and stop at bricks, the cells' far field matches the direct sum, colonies get distinct easy axes, prisms and the quasicrystal trace; remanence keeps the moments and falls as r⁻³ with seeds on the surface; the section's basis, cut, and sharp plane |
| `worms.selftest.mjs` | worms release, tunnel, bite exactly, are deterministic, stay a small effect against the masons, recycle only into a live colony, work on a tiling |

Determinism is the contract: every decision is integer arithmetic or IEEE
basic ops on doubles, drawn from named PRNG streams in a fixed order. The
selftest pins golden hashes for seeds 1, 7, 48112, 314159 (cubic) and 7
(Penrose); a change that moves them re-rolls every permalink on both sites.

```bash
node packages/bismuth/crystal.selftest.mjs     # ~40 s
node packages/bismuth/worms.selftest.mjs       # ~15 s
node scripts/sync-dataviz.mjs --write          # push edits out to the sites
```

The engine's ideas and the substrate interface are documented at length in
`bismuth/CLAUDE.md`; the platformer's use of colonies (deploy freezes, the
plane is the floor) in `hopper/CLAUDE.md`.
