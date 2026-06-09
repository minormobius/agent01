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
- **The simulation core** (`js/evolve.js`) — birth–death with trait-and-
  environment-driven rates, budding cladogenesis, and **environmental feedback**:
  oxygenic phototrophs pump an oxidant into the world, and the rising oxidant
  poisons the anaerobes that used to dominate. **Nobody scripts the mass
  extinction — it falls out** (the Great-Oxidation analogue). Aerobic
  respiration evolves *from* the oxygen-makers and radiates into the world they
  poisoned: an emergent survivorship reversal.
- **A renderer** (`js/render.js`) — rectangular cladogram with deep time on the
  X-axis, capability-coloured lineages, extinction marks (reddened when the
  cause was the oxidant), the oxidant trajectory, and event bands. Visual
  conventions borrowed from `read/pendragon`.
- **An interestingness filter** (`scoreWorld` + `findSeed`) — proxies
  (disparity, convergence, survivorship reversal, innovation) computed *after*
  a run and used to *find* dramatic seeds, never as a simulation objective.

## Run it

It's pure static + ES modules, no build step.

```bash
# tests (determinism + the oxygenation proof-of-concept)
cd phylofiction && npm test

# preview the reader (needs a static server — ES modules don't load over file://)
python3 -m http.server 8000      # then open http://localhost:8000/phylofiction/
#  ?n=1 is a good first world; the "find a Great Oxidation" button walks the
#  seed space for the full story.
```

The engine attaches nothing global and is plain ESM, so you can drive it from
node directly:

```js
import { evolveWorld, findSeed } from "./js/evolve.js";
const world = evolveWorld(1);                 // → {tree, env, events, summary, score}
const hit = findSeed(w => w.summary.oxygenated && w.score.reversal > 0.2);
```

## Not yet (next steps, SPEC §9)

HGT + endosymbiosis network edges (§4.3), real biomes/biogeography via mappa
(§5), the borges-style "natural history" telling computed from the ledger
(§7 layer 5), and macro-life off an endosymbiotic root (§7). **Not wired to any
deploy workflow yet** — choosing the surface (`phylofiction.mino.mobi` vs.
extending `mappa/`) is deferred (SPEC §10).
