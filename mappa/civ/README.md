# mappa/civ — a headless civilization-evolution engine

A deterministic, coevolutionary **agent-based civilization simulation** that runs on a
generated [mappa](../) world. One unchanging agent substrate and one tick loop run an
entire civilizational arc — **nucleation → forager expansion → agriculture → settlement
→ states → industry → modernity** — where individuals turn over by birth and death while
lineages, cultures and institutions carry unbroken identity across ten millennia. Nothing
about eras is scripted: **agriculture and industry are emergent phase transitions**.

Two nested Darwinian loops: coevolution *within* a run (genes, cultures, institutions),
and a **quality-diversity search** *over* runs that surfaces a diverse archive of
qualitatively distinct interesting civilizations — not one optimum. It is the
civilizational analogue of mappa's `world-signals`, one level up.

**Headless-first.** Everything runs and is tested from a Node CLI — no browser, no UI.
The engine emits a **chronicle** (keyframes + event log); it draws nothing.

## Quick start

```bash
# run a civilization on a bundled world, score it
node mappa/civ/civ.js run --world-fixture worlds/seed7.json --config configs/neolithic.json --ticks 4000 --score

# quality-diversity sweep → a diverse archive of distinct civilizations
node mappa/civ/civ.js sweep --world-fixture worlds/seed7.json --method qd --budget 60 --ticks 1000

# determinism gate: run twice, assert identical chronicle hash
node mappa/civ/civ.js verify --world-fixture worlds/seed7.json --config configs/kurgan.json --ticks 2000

# selftest (determinism, DAG, token round-trip, signals discrimination, adapter)
node mappa/civ/test/civ.selftest.mjs
```

World sources: `--world-fixture <path>` (bundled) or `--world <seed | seed:N | ?w= token>`.
Config sources: `--config <path.json | token>` (omit → defaults). All offline.

## Architecture (the discipline it inherits from mappa)

- **Deterministic core.** `mulberry32` PRNG + orthogonal named streams keyed by
  `(seed, streamId)`; the gene-trick (draw seed-default first, then override) keeps
  config dimensions orthogonal. No `Math.random`, no wall-clock, no unordered iteration
  leaking into results. Same `(world, config, civSeed, ticks)` ⇒ byte-identical chronicle.
- **Struct-of-arrays over typed arrays.** Agents are parallel typed arrays (GC-flat,
  cache-friendly, WASM-portable — the same JS↔Rust split mappa uses). Slots recycle via a
  free list so storage tracks the **peak living** population, not cumulative births.
- **No O(n²), anywhere.** Every interaction — mating, dispersal, encounter, meme
  transmission, conflict — is bucketed by cell, or mediated by a **stigmergic field**.
- **Config is the artifact.** A run reconstructs from `{ world, config, civSeed, ticks }`
  — a base64url token (floats as fixed-point ×1000) and a `com.minomobi.mappa.civ` PDS
  record (`../lexicons/civ.json`), mirroring mappa's `?w=` / `com.minomobi.mappa.world`.

## Files

| File | Role |
|---|---|
| `prng.js` | PRNG streams, hashing, fixed-point, softmax pick — the determinism substrate |
| `caps.js` | the capability ladder (tech DAG + tiers) + subsistence packages (the density ratchet) |
| `world.js` | world adapter: CSR adjacency, area, habitability, per-package subsistence viability, `K(cell,pkg)` |
| `climate.js` | time-varying `K`/passability fields (the migration valve): stable / kurgan / beringia / 4.2ka presets |
| `engine.js` | the sim core: SoA agents, demography, dispersal, culture-as-program, encounter, institutions, stigmergy, the tick loop, chronicle emission |
| `signals.js` | `civ-signals` — the interestingness battery (0–100, degeneracy flags, evocative descriptor) |
| `qd.js` | the outer loop: MAP-Elites / grid / random quality-diversity search over configs |
| `config.js` | the civConfig genome + base64url token codec + PDS record shaping |
| `chronicle.js` | canonical chronicle hashing (determinism gate) + world-argument loading |
| `civ.js` | the headless CLI (`run` / `sweep` / `verify`) — the primary interface |
| `configs/*.json` | preset configs: neolithic, kurgan, bantu, austronesian, americas |
| `worlds/*.json` | bundled world fixtures (config-style + one API-shape data fixture) |
| `test/civ.selftest.mjs` | node selftest |

## The mechanisms (milestones M0–M9)

- **Carrying capacity** `K = areaNorm × hab × subMult(package) × subViability(cell,package) × popScale`.
  The `subMult` ratchet (forager ≪ horticulture < plough < irrigation) is the engine of
  expansion: the higher-K package outbreeds and out-fills the frontier.
- **Dispersal** is a per-agent softmax over neighbours (habitability, subsistence viability,
  crowding, corridor bonus, barrier/passability penalty). Summed over a front, this rule
  *is* the wave of advance — no path is ever scripted. Sail cultures island-hop via sea links.
- **Culture is the program**: a heritable, mutable, shared object (subsistence, a tech
  bitset, norm weights, a language id) that many agents point at. Cultures **innovate**
  (cities recombine — slow, tier-gated → late-then-accelerating), **diffuse** (via the
  stigmergic meme field), **split** (a detached branch forks a daughter culture + language
  → the phylogeny), and **upgrade subsistence** when a higher-K package unlocks (the
  agriculture / industry phase transition).
- **Frontier encounter** rolls intermarry / displace / convert, reproducing the whole
  spectrum from demic replacement to pure acculturation.
- **Climate** is a set of time-varying fields; a drying event or a thaw shifts `K`, density
  stress spikes, and a migration pulse *emerges*.
- **Institutions** (band → chiefdom → state → firm) are emergent aggregates; industrial
  takeoff is firms + urban-K on a mechanised, steam-powered megacity.
- **Stigmergy** (a per-cell meme field + activity field) is the O(n) coordination substrate:
  memes diffuse agent → environment → agent; innovation scales with connectivity.
- **civ-signals** scores variety / contrast / structure / story-potential and screens out
  degeneracy (instant-extinction, single-hegemon-sweep, stuck-foraging, monoculture,
  runaway-population, static).
- **QD/MAP-Elites** discretises an archive by behaviour (cultures × era × homelands ×
  independent industry) and keeps the best run per cell — the diverse shelf.

## API (deployed at `civ.mino.mobi`)

CORS-open, no-key, edge-cached by content (same posture as `/api/world`). CPU-capped —
the browser/CLI runs bigger.

```
GET  /api/civ/run?world=<seed|token>&preset=<name>&config=<token>&civSeed=1&ticks=800&n=900
     → { meta, score, descriptor, flags, highlights, signals, facts, chronicle }
GET|POST /api/civ/sweep  { world, method:"qd"|"grid"|"random", budget, ticks }
     → { archive:[ { config, score, descriptor, coords, facts } ], meta }
GET  /api/civ/frames?world=&preset=&civSeed=1&ticks=1000&maxFrames=48
     → { world_mesh, dict, frames:[per-cell snapshots], events, meta }   # particle playback
GET  /api/civ/health
```

The **particle playback viewer** (`../../civ/view.html`) fetches `/api/civ/frames` and
renders the population as a particle swarm on the map through the whole run — play
forward/backward, scrub, zoom/pan, colour by culture / subsistence / era / density,
event markers on the timeline, and click a particle to inspect its cell's "deal"
(dominant culture, subsistence, era, population, tech capabilities, language). Frames are
compact per-cell snapshots (opt in via `run(ticks, { frames:true, every })`), so the whole
playback is ~90 KB and fully deterministic.

The worker (`../../civ/worker.js`) imports this engine unchanged. Note determinism is
load-bearing: never introduce `Math.random` / `Date.now` into the core.
