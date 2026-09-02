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
| `genome.js` | seed → habit, kinetics, rim, nucleus, oxide palette; `DEFAULT_BRAIN`, `DEFAULT_POPULATION`; `quasiSubstrate` |
| `crystal.js` | `Lattice` (cubic substrate with extent maps), `Mason`, `Colony`, `Growth` — Kossel kinetics, the terrace rule, deploy/freeze/remove |
| `prism.js` | `Prism` — any plane tiling from `packages/tilings` stacked into layers (Penrose → a decagonal quasicrystal) |
| `render.js` | WebGL1: chunked voxel + prism meshers with baked AO, per-pixel thin-film interference, mason motes; an orbit camera or a first-person one (`renderer.fp`); props (`setProps`) and beacons for a page that puts things in the world that are not crystal |
| `tilings.js` | a synced copy of `packages/tilings/tilings.js`, so `prism.js` can import `./tilings.js` wherever the copy lands |
| `crystal.selftest.mjs` | determinism + golden brick hashes, connectivity, the melt-is-above rule, morphology, the playground contracts, the prism, deploy + remove, the API contract |

Determinism is the contract: every decision is integer arithmetic or IEEE
basic ops on doubles, drawn from named PRNG streams in a fixed order. The
selftest pins golden hashes for seeds 1, 7, 48112, 314159 (cubic) and 7
(Penrose); a change that moves them re-rolls every permalink on both sites.

```bash
node packages/bismuth/crystal.selftest.mjs     # ~40 s
node scripts/sync-dataviz.mjs --write          # push edits out to the sites
```

The engine's ideas and the substrate interface are documented at length in
`bismuth/CLAUDE.md`; the platformer's use of colonies (deploy freezes, the
plane is the floor) in `hopper/CLAUDE.md`.
