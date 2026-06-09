# Phylofiction

A seeded, deterministic generator for **fictional trees of life** — alien but
plausible. Page number `n` grows the same tree of life for ever: a forward
birth–death simulation in which the scars of mass extinction *emerge* rather
than being painted on.

Full rationale and roadmap: **[SPEC.md](SPEC.md)**.

## Status — Phase 1 + the proof-of-concept (SPEC §9 steps 1–2)

This is the microbe-first slice. It implements:

- **Deterministic seeded engine** (`js/prng.js`) — mulberry32 + xmur3, ported
  from borges. Same `n` → identical world, in browser and node.
- **A metabolic genome** (`js/genome.js`) — capabilities (chemotrophy,
  anoxygenic/oxygenic phototrophy, oxidant respiration, methanogenesis, …)
  plus fluoddity-style `[lo,hi,sigma]` continuous params with truncated-Gaussian
  mutation. The `[lo,hi]` clamp is the viability boundary.
- **The simulation core** — birth–death with trait-and-environment-driven
  rates, budding cladogenesis, and **environmental feedback**: oxygenic
  phototrophs pump an oxidant into the world, and the rising oxidant poisons the
  anaerobes that used to dominate. **Nobody scripts the mass extinction — it
  falls out** (the Great-Oxidation analogue). Aerobic respiration evolves *from*
  the oxygen-makers and radiates into the world they poisoned: an emergent
  survivorship reversal.
  - The core exists **twice, bit-for-bit identical**: in Rust → WASM
    (`engine-rs/`, the primary in-browser engine) and in JS (`js/evolve.js`, the
    reference + fallback). A permalink resolves to the same world on either
    backend — proven by `test/parity.test.mjs` (80 seeds, exhaustive field
    compare). The badge in the reader shows which one ran.
- **A renderer** (`js/render.js`) — rectangular cladogram with deep time on the
  X-axis, capability-coloured lineages, extinction marks (reddened when the
  cause was the oxidant), the oxidant trajectory, and event bands. Visual
  conventions borrowed from `read/pendragon`.
- **An interestingness filter** (`scoreWorld` + `findSeed`) — proxies
  (disparity, convergence, survivorship reversal, innovation) computed *after*
  a run and used to *find* dramatic seeds, never as a simulation objective.

## Run it

The site is pure static (HTML + ES modules + a committed `.wasm`) — no build
step to *serve* it.

```bash
# tests: JS determinism + the oxygenation PoC + WASM⇄JS parity (8 tests)
cd phylofiction && npm test

# preview the reader (needs a static server — modules + wasm don't load over file://)
python3 -m http.server 8000      # then open http://localhost:8000/phylofiction/
#  ?n=2 is the first Great Oxidation; the "find a Great Oxidation" button walks
#  the seed space (in Rust, on the WASM backend). The badge shows which engine ran.
```

### Rebuilding the Rust/WASM engine

Only needed if you change `engine-rs/`. The committed `engine/phylofiction.wasm`
is what the site loads.

```bash
rustup target add wasm32-unknown-unknown          # once
cd engine-rs
cargo test --release                              # host-side: determinism + PoC
cargo build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/phylofiction_engine.wasm ../engine/phylofiction.wasm
cd .. && npm test                                 # re-check parity against the JS engine
```

In CI this is automated by `.github/workflows/build-phylofiction-wasm.yml`
(builds, parity-checks, commits the artifact, dispatches the deploy) — the same
"committed wasm + JS fallback" pattern as `mappa/`.

The JS engine is plain ESM and drives from node directly (it's the reference
the WASM is validated against):

```js
import { evolveWorld, findSeed } from "./js/evolve.js";
const world = evolveWorld(2);                 // → {tree, env, events, summary, score}
const hit = findSeed(w => w.summary.oxygenated && w.score.reversal > 0.2);
```

## Deploy

`.github/workflows/deploy-phylofiction.yml` ships the static reader + worker to
**phylofiction.mino.mobi** (Cloudflare Worker, assets binding — all compute is
client-side, so no secrets beyond the shared Cloudflare credentials). Pushing
`phylofiction/**` on `main` or the feature branch triggers it.

## Not yet (next steps, SPEC §9)

HGT + endosymbiosis network edges (§4.3), real biomes/biogeography via mappa
(§5), the borges-style "natural history" telling computed from the ledger
(§7 layer 5), and macro-life off an endosymbiotic root (§7).
