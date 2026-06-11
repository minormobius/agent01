# Phylofiction — Design Spec

*A seeded, deterministic generator for fictional trees of life. Alien but plausible.*

> **Status:** design spec, no code yet. This document pins the generation
> philosophy and data shapes before any implementation locks them in.
> **Branch:** `claude/phylofiction-world-generation-3zd33u`.

---

## 0. One-paragraph thesis

`read/pendragon` runs an apparatus *backward* — it analyses a literary
tradition into a phylogeny (strands, pivots, descent/influence edges).
`borges` runs the *same* apparatus *forward* — a single seed `n`
deterministically grows a fully-structured tale, and the mythograph is
**computed from the spec, not authored**. **Phylofiction is that pattern
aimed at deep time.** A seed grows a tree of life; its mass-extinction
scars, convergences, and radiations *emerge* from a forward simulation
rather than being painted on; and the "natural history" telling is computed
from the resulting spec. The phylogeny is the Propp story-graph of biology.

This repo already contains every component except the generator that wires
them together (see §8). The work is integration and a small simulation core,
not green-field.

---

## 1. The two committed decisions

These are settled; everything downstream follows from them.

### 1.1 Aesthetic: **alien but plausible**

Earth is the **answer key, never the source.** No Earth taxa, no
recognisable lineages, no renamed OTOL topology. Instead we borrow Earth's
*statistics* as validators (§6.3): clade-size distributions are power-law,
extinction intervals have a characteristic pacing, disparity peaks before
diversity in a radiation. A generated tree is "plausible" iff it matches
those distributions; it is "alien" because none of its content is Earth's.
The uncanny is **structural**, not cosmetic.

### 1.2 First domain: **microbes**

We open in the microbial world (prokaryote-analogue + archaea-analogue +
the road to an endosymbiotic eukaryote-analogue), not macro-fauna. Why this
is the *easier* and *more alien* starting point, not a lesser one:

- **Metabolism is a cleaner trait space than morphology.** You evolve
  *capabilities* — chemotrophy, phototrophy, can-it-tolerate-oxidant,
  methanogen-analogue — as a gene repertoire (presence/absence + efficiency
  params). fluoddity's genome model (§8) maps onto this almost directly. We
  sidestep the genuinely hard problem of generating plausible body plans.
- **Horizontal gene transfer (HGT) turns the tree into a network** — the
  single most alien-but-plausible structural fact in biology. `pendragon`'s
  renderer **already supports non-tree edges** (`descends` / `influence` /
  `context`); HGT is an `influence`-type edge, endosymbiosis is a
  lineage-*fusion* event (a tree that occasionally merges two branches into
  one), and both come nearly free.
- **The first mass extinction emerges, unauthored.** A lineage invents
  oxygenic-photosynthesis-analogue → an oxidant accumulates in the
  atmosphere/ocean → the once-dominant anaerobe-analogues are poisoned and
  shoved to refugia (vents, muds, hosts). That is the Great-Oxidation-Event
  analogue, and it is **survivorship reversal you did not script.** Getting
  that to fall out of the sim is the project's first proof-of-concept.

Macro-life (a Cambrian-analogue radiation into body plans) is a later phase
(§7). The microbial core establishes determinism, the data shapes, the
selection loop, and the interestingness filter on the cheapest possible
substrate.

---

## 2. Generation philosophy — sim spine, GA traits, Earth as validator

Three approaches were on the table. The resolution:

| Approach | Role | Why |
|---|---|---|
| **Forward simulation** (birth–death + selection) | **the spine** | Only approach where scars *emerge*. The marginal clade inheriting the world after a dying *happens to you* instead of being painted on. |
| **GA / evolving genome on traits** | **the trait engine** | The GA does **not** build the tree. It evolves *organisms answering the world's questions*; the phylogeny is the *record* of who diverged. fluoddity's `[lo,hi,sigma]` genome + truncated-Gaussian mutation is the exact machinery, and its `[lo,hi]` bounds already encode "viable phenotype space — corners outside are dead." |
| **"Peek at Earth's homework"** | **validator only** | Earth's *distributions* are the fitness targets a run must match to feel real (§6.3). Earth's *content* never appears. Answer key, not homework. |

**Restated:** birth–death gives topology; a fluoddity-style metabolic genome
evolving along each branch gives traits; mappa's ocean/atmosphere chemistry
is the selective environment; extinction pulses kill *by trait*, not at
random; Earth's distributions tell us whether the result is plausible.

### 2.1 Why "solve for interestingness" is a *filter*, not an *objective*

You cannot put interestingness inside a fitness function — it is the
streetlight problem, and the maximiser degenerates (one mega-clade, or
total death). **Interestingness is a filter over a generator, not a term in
an objective.** This is already the repo's philosophy: `borges` is a seed
space you *walk*, where good pages are *found*; `mappa` caches a `score` +
`flags` per world in its lexicon. Phylofiction does the same — generate many
seeds cheaply (determinism makes this free), score each on computable
proxies (§6), and surface the high-scorers. The user *discovers* world
№48,121 the way they open `borges /t/<n>`.

---

## 3. The pipeline

```
seed n  ──►  Rand("phylofiction::" + n)          [borges/js/prng.js: mulberry32 + xmur3 + fork]
   │
   ├─ world(n)            world chemistry + biomes        [mappa.generateWorld, extended §5]
   │                      → redox/nutrient/temperature axes, refugia, barriers
   │
   ├─ calendar(n)         epochs + scheduled disturbances  [reuse mappa multi-epoch clock]
   │                      → geological time, NOT yet extinctions (those emerge)
   │
   ├─ evolve(rng, world, calendar)   THE SIMULATION CORE   (§4)
   │     loop over epochs:
   │        birth–death step      → speciation / extinction by rate
   │        trait drift+mutate     → fluoddity mutate() along each surviving branch
   │        HGT / endosymbiosis    → network edges + occasional lineage fusion
   │        environment feedback    → organisms change the world (O2!), world selects
   │     → tree + trait sheets + events ledger
   │
   ├─ score(tree, events)          interestingness proxies  (§6)
   │
   └─ render                        pendragon SVG phylogeny + phylo clade panels
                                     + borges-style natural-history telling
```

Every stage is a pure function of `(n, …)`. Determinism is load-bearing
(it's what makes a permalink `/t/<n>` meaningful and the telling postable
before render — the `borges` contract). The only allowed unseeded roll is
the nav's "random page" picker, which merely *chooses which deterministic
page to open*.

---

## 4. The simulation core

### 4.1 Topology: birth–death with trait-biased rates

A standard birth–death process, but speciation/extinction rates are
**functions of the lineage's traits and the current environment**, not
constants:

```
for each epoch e in calendar:
  env = world.envAt(e)                     // redox, nutrients, temperature
  for each living lineage L:
    λ = baseSpeciation * nicheOpenness(L, env) * innovationBonus(L)
    μ = baseExtinction * misfit(L, env)    // misfit ↑ when traits clash with env
    roll speciation(λ)  → fork L into L, L' ; mutate both genomes (§4.2)
    roll extinction(μ)  → L dies, recorded in events ledger
  applyDisturbances(e)                     // see §4.4 — scheduled stressors
  env' = environmentFeedback(livingLineages, env)   // §4.5 — life edits the world
  world.commit(e, env')
```

The tree topology is the by-product. Branch lengths = epoch durations.
Node ages fall out of the calendar.

### 4.2 Traits: a metabolic genome (fluoddity-derived)

A lineage's genome is a **repertoire of metabolic capabilities** plus
continuous efficiency parameters. Microbial register = presence/absence of
pathways dominates; the fluoddity pattern (`[lo, hi, sigma]` per continuous
param, truncated-Gaussian mutation, rare structural jumps) carries over:

```js
genome = {
  // capabilities (presence/absence — the structural genes)
  caps: Set{ "chemo:reductant-A", "photo:anoxygenic", "fix:nitrogen-analogue", ... },

  // continuous efficiency params: [lo, hi, sigma]  ← fluoddity bounds = viability
  growthRate:      [0, 4, 0.3],
  oxidantTolerance:[0, 1, 0.08],   // ← the trait the GOE-analogue will select on
  thermalOptimum:  [-2, 120, 6],
  osmoTolerance:   [0, 1, 0.1],
  genomeStreamlining:[0,1,0.05],   // small genome = fast but brittle

  // structural traits (rare jumps)
  motility:        0|1|2,
  initialMembrane: 0|1|2,
}
```

**Mutation along a branch** (the fluoddity `mutate()` operator, adapted):
70% chance per continuous param of a Gaussian nudge `x + randn()*rate*sigma`
clamped to `[lo,hi]`; rare structural jumps gain/lose a capability or flip a
structural trait. **The `[lo,hi]` clamp is the viability boundary** — a
genome cannot wander into "no growth, infinite oxidant tolerance" because
those corners are dead by construction.

### 4.3 HGT and endosymbiosis — the network, and the fusion

Two mechanisms that make a microbial tree *not a tree*, both alien-but-plausible:

- **Horizontal gene transfer.** With small per-epoch probability, a
  capability jumps from lineage A to a co-occurring lineage B (same biome).
  Recorded as an `influence`-type edge (pendragon already renders these).
  This lets innovations *spread across* the tree, not just down it — the
  reason microbial phylogenetics is genuinely a network.
- **Endosymbiosis.** Rare, high-consequence: lineage A engulfs lineage B and
  the two **fuse into one lineage** carrying the union of both genomes (a
  mitochondrion/chloroplast-analogue event). Structurally this is a tree that
  *merges two branches into one node* — the single most "wait, trees can't
  do that?" moment available, and the gateway to the macro-life phase (an
  endosymbiotic lineage = the eukaryote-analogue that later radiates into
  body plans). Recorded as a `fusion` event in the ledger.

### 4.4 Disturbances vs. extinctions — the crucial distinction

The **calendar** schedules *disturbances* (abiotic stressors: an impact-analogue,
a flood-basalt-analogue redox swing, a snowball-analogue cold pulse). A
disturbance is **not** an extinction — it is a sharp change to `env`. Whether
it *causes* a mass extinction depends on which lineages are misfit to the new
`env` (§4.1 `μ`). **The extinction is emergent; the disturbance is scheduled.**
This is what separates a real scar from a painted one: the same disturbance
on two different seeds produces different dyings because different clades were
exposed.

### 4.5 Environmental feedback — life edits the world

The keystone of the microbial phase and the source of the first unauthored
scar. Living lineages change `env`:

```
oxidant += Σ_lineages photoOxygenicOutput(L) * abundance(L)
nutrient -= Σ_lineages uptake(L)
```

When a lineage evolves oxygenic-photosynthesis-analogue, oxidant rises over
subsequent epochs; lineages with low `oxidantTolerance` see `μ` spike; the
anaerobe-analogues that dominated get culled or pushed to refugia. **Nobody
scripted the Great Oxidation Event — it falls out of one capability + the
feedback loop.** If the sim produces this on a fresh seed, the core works.

---

## 5. World coupling (mappa)

mappa is purely abiotic today (plates, climate, biomes, deep-time orogeny) —
exactly the right substrate, and exactly missing the chemistry life needs.
The coupling, smallest first:

- **Phase-1 minimum:** we do **not** need full mappa. A scalar environment
  (`redox`, `nutrient`, `temperature`) over epochs + a handful of named
  **refugia/biomes** (vent / mud / open-ocean / host) is enough to drive
  selection. The microbial core can ship before mappa is wired in at all.
- **Phase-2 coupling:** map mappa's per-cell `biome` / `temperature` /
  `moisture` arrays into a small set of microbial habitats, give each a redox
  and nutrient profile, and let biogeography matter (barriers → allopatric
  speciation; refugia → where the anaerobes survive the GOE). mappa's
  multi-epoch orogeny clock becomes the geological calendar.
- **Phase-3:** life's feedback (§4.5) writes back into a planetary
  atmosphere/ocean-chemistry layer that mappa does not yet model — this is a
  genuine extension to mappa, not just a read.

---

## 6. Interestingness — the scoring filter

Computed *after* a run, over the finished tree + events ledger. No term here
is ever fed back into the simulation as an objective (§2.1). High score →
surfaced to the reader; low score → another seed in the pile.

### 6.1 Proxies (each is cheap and computable)

| Proxy | Definition | Why it's interesting |
|---|---|---|
| **Disparity** | spread of occupied trait-space (not species *count*) | Uneven morphospace; empty regions are as meaningful as crowded ones |
| **Convergence** | distinct lineages (far LCA) reaching the same capability | The crab-body-plan delight; trivially measurable |
| **Survivorship reversal** | dominance rank-flip across a dying | Mammals-after-dinosaurs structure; the core narrative beat |
| **Key innovation → radiation** | a capability appears, the bearing clade's λ jumps | Flowers/wings/oxygen — the engine of radiations |
| **HGT reach** | how far a capability spread laterally vs. vertically | The network-ness; alien-but-plausible texture |
| **Endosymbiosis** | a fusion event occurred and its product radiated | The eukaryote-analogue moment; rare, high-value |

### 6.2 Composing them

A weighted sum is a starting point but invites a degenerate maximiser even
as a *filter* (you'd over-surface convergence-heavy worlds). Better: **rank
on each proxy independently and surface seeds that are Pareto-non-dominated**,
or that are top-decile on *any single* proxy. We want a *diverse gallery* of
interesting worlds, not the argmax of one blended score. Cache the proxy
vector in the world record (mirrors mappa's `score` + `flags`).

### 6.3 Earth as validator (the plausibility gate, separate from interest)

Before a world is even eligible for the interesting-gallery, it must pass a
**plausibility gate** measured against Earth's *distributions* (not content):

- clade-size distribution ≈ power-law (no single mega-clade swallowing the tree)
- extinction-interval pacing within an order of magnitude of Earth's
- disparity peaks *before* diversity within radiations
- tree balance (Colless/Sackin-style imbalance) in Earth's observed band

Fail the gate → discard regardless of interest score. This is the *only*
place Earth enters, and it enters as statistics, never as taxa. (Source data
already in repo: `query-otol.yml`, `phylo/` real OTL tree — used to *fit the
target distributions*, never copied into output.)

---

## 7. The artifact — five parallel layers (read/ apparatus shape)

Output mirrors the read/ apparatus so a future cross-world hub can read
across many generated worlds the way `pendragon` reads across tales. Tree
layer reuses `phylo`'s `clade.json` shape verbatim → renderer for free.

```js
world(n) = {
  n, seed: "phylofiction::" + n,

  // LAYER 1 — the tree (phylo/lexicons/.../clade.json shape: reuse renderer)
  tree: {
    rootId, nodes: [
      { id, name, rank, parentId, childIds:[], firstEpoch, lastEpoch,
        extinct: bool, genome: {...}, abundancePeak, refugium }
    ],
    netEdges: [ [fromId, toId, "hgt"|"fusion"], ... ]   // pendragon non-tree edges
  },

  // LAYER 2 — trait sheets: what each lineage *solved for*
  traits: { byClade: { [id]: { caps:[...], growthRate, oxidantTolerance, ... } } },

  // LAYER 3 — environmental timeline (the forcing function; pendragon.timeline + borges.frame)
  calendar: { epochs: [ { id, ageMa, redox, nutrient, temperature, disturbance? } ] },

  // LAYER 4 — events ledger: the SCARS, as first-class annotated objects
  events: [
    { epoch, kind: "radiation"|"extinction"|"convergence"|"innovation"|"hgt"|"fusion",
      lineages:[...], cause, magnitude, gloss }
  ],

  // LAYER 5 — the telling: COMPUTED from 1–4 (borges proves this is possible)
  telling: { kicker, movements: [ { title, text } ] },   // "the great poisoning", etc.

  // cached interestingness (mappa pattern)
  score: { disparity, convergence, reversal, innovation, hgtReach, endosymbiosis },
  plausible: bool
}
```

**Macro-life (later phase)** drops in *without changing the shape*: an
endosymbiotic lineage becomes the eukaryote-analogue root of a body-plan
radiation; `genome` gains morphological params; the same five layers, same
renderers, same scoring.

---

## 8. What already exists (reuse map)

The point of this spec: **almost nothing here is green-field.**

| Need | Reuse | File |
|---|---|---|
| Seeded determinism + forked substreams | borges PRNG | `borges/js/prng.js` (mulberry32, xmur3, `Rand().fork()`) |
| Genome + mutation (Gaussian + structural jumps + viability bounds) | fluoddity | `fluoddity/engine.js:26-60` |
| Tree data model (clades, parent/child, `extinct`, adaptive chunking) | phylo | `phylo/lexicons/com/minomobi/phylo/clade.json` |
| Phylogeny renderer w/ **non-tree edges** (HGT/fusion!) | pendragon | `read/pendragon/data.js:244-332`, `app.js` (SVG force layout) |
| World substrate (climate, biomes, deep-time epochs) | mappa | `mappa/engine.js` |
| Telling computed from a spec | borges | `borges/js/generate.js` (Propp → prose) |
| Simulate-to-reject-degenerate self-test | games/gen | `games/gen/js/sim.js:60-112` |
| Evolution-line / trait-interaction vocabulary | pokemon | `pokemon/data.js` (type chart, evolve lines) |
| Earth target distributions (validator only) | phylo / OTOL | `phylo/`, `query-otol.yml` |

New code = the simulation core (§4) + the scoring (§6) + the glue. Order of
hundreds of lines of pure deterministic JS that unit-tests in plain node
(borges already established the `globalThis`-attach pattern for node tests).

---

## 9. Build plan — cheapest-real-scar first

Each step produces something walkable; none requires deploy secrets, D1, or
inference. Ships through a static Pages workflow like borges/read.

1. **Birth–death microbial tree from a seed**, rendered with pendragon's SVG
   layout. No traits yet. ~1 day → a walkable `/t/<n>` of bare trees.
2. **One capability (`oxygenic-photo`) + one continuous trait
   (`oxidantTolerance`) + environmental feedback (§4.5).** Target: the
   Great-Oxidation-Event-analogue scar *emerges* on some seeds. **This is the
   proof-of-concept** — the moment it stops being a reskin.
3. **The interestingness proxies (§6) + a "shuffle until interesting"
   picker** (borges's random-page move) + the plausibility gate (§6.3).
4. **HGT + endosymbiosis** (§4.3) → the network edges + the first fusion.
5. **Wire in mappa** for real biomes/biogeography/refugia (§5 phase-2).
6. **The borges-style telling** (§7 layer 5) computed from the ledger.
7. *Later:* macro-life radiation off an endosymbiotic root (§7).

Stop after step 2 to validate the whole thesis on the cheapest substrate
before investing in 3–7.

---

## 10. Non-goals / open questions

- **Non-goal:** chemical realism. We model *capabilities and a redox scalar*,
  not actual biochemistry. "Plausible" is statistical (§6.3), not mechanistic.
- **Non-goal:** real-time / GPU sim. This is offline, per-seed, deterministic.
  fluoddity's GPU swarm is borrowed for its *genome model*, not its renderer.
- **Open:** epoch granularity vs. runtime — how many epochs before a seed is
  too slow to score thousands of? (Profile in step 1.)
- **Open:** whether the plausibility gate (§6.3) is too strict for the
  *alien* goal — we may want to *relax* tree-balance bounds deliberately to
  let weirder topologies through. Tune against a human eyeballing the gallery.
- **Open:** does HGT make "clade" ill-defined enough that phylo's
  adaptive-chunking model needs rethinking? (Likely fine for microbial
  density; revisit at macro scale.)
- **Open:** deploy surface — extend `mappa/` or stand up a new
  `phylofiction.mino.mobi`? Defer until step 3 produces something worth
  showing.

---

*Next concrete step when we're ready to build: step 1 — the seeded
birth–death microbial tree on pendragon's renderer. Pure JS, node-testable,
no secrets.*
