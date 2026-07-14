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
  takeoff is firms + urban-K on a mechanised, steam-powered megacity — **scale-gated** by
  `industrialMinPop` (a config knob) so only a large, urbanised culture can reach it, not
  one lucky valley in a small world.
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
forward/backward, scrub, zoom/pan, colour by culture / **political** (territory ×
sovereignty) / **belief** (faith / ideology) / subsistence / era / wealth / market / density.
Two fill modes: **regions** (default) fills **mappa's actual spherical-Voronoi cells** — the
same tessellation mappa renders, so the design language is unified and cities/resources/faiths
sit in the real cells — and **particles** (a population-proportional swarm per cell). Plus
**migration flows** (travellers float from cell to cell during play), named-resource markers,
event markers on the timeline, and click a cell to inspect its "deal" (dominant culture,
subsistence, era, population, sovereignty, **faith**, resource, tech capabilities, language).
Frames are compact per-cell snapshots (opt in via `run(ticks, { frames:true, every })`); the
world snapshot ships the Voronoi polygons (`world.cells`, ~80 KB once). Runs are cached
client-side (`../../civ/lib/civ-cache.js`) so a run computed in one view loads instantly in
every other.

The **development view** (`../../civ/develop.html`) reads `/api/civ/run` and shows the
fine-grained history: a lineage-sorted **streamgraph** ("river of peoples" — each band a
culture, thickness = population, children branching from parents, population/share toggle,
event markers), a **dynasties table** (every culture that reached statehood, with its
rise / peak / fall), and a **named-resources table** (who holds each ore/gold/salt/delta
node). Culture colour is the same hue across every view, so a lineage is recognisable on
the map, in the river, and in the tables.

The **FRED view** (`../../civ/fred.html`) is the economic data browser — a St.-Louis-Fed-style
time-series explorer over `chronicle.fred`. The engine captures a **modular series registry**
(sampled to ~100 points across any run): headline macro (population, GDP, GDP/capita, Gini,
price level, stock index, interest rate, debt/GDP, capital, institution counts) **plus every
cross-tab we can muster** — population and wealth × subsistence, population × era, population
× landmass, output and capital × institution type, and an individual **equity series per
notable firm** (the "stocks"). The frontend is registry-driven: a **searchable, category-grouped
catalog** with sparklines; a **multi-series overlay chart** with FRED transforms
(**level / index=100 / % change / log**), automatic **dual axis** by unit, a **range brush**
+ drag-to-zoom, and hover readouts; a **macro dashboard**; and a **cross-tab explorer** that
renders any measure×dimension family as **small multiples / overlay / stacked share**. Nothing
in the chart engine knows what any series *is* — add a measure or a facet in `fredStep()` and it
appears in FRED automatically. Carries the run by the same URL params as the other views.

### Political structure, history, resources (what's emergent vs. derived)

- **Political map** — `cellDom` (dominant culture per cell) is the ethnolinguistic
  territory; `polity[c]` (band → chiefdom → state) adds sovereignty. Contiguous same-culture
  state cells are the sovereign states (`countStateComponents`). All emergent, not drawn.
- **History** — the event log + keyframe series are the annals; **polity lifecycle** turns
  them dynastic: every culture that reaches statehood records `firstStateTick`, `peakPop`,
  `peakTerritory`, `fellTick` → the dynasties table + `polityRise`/`polityFall` events.
- **Named resources** — derived from mappa's geology (arc volcanism → copper/iron, granite
  highlands → tin, cratonic rivers → gold, arid basins → salt, river mouths → deltas). They
  **concentrate carrying capacity** (`resBonusK`, so cities cluster on them) and **accelerate
  the tech they feed** (`resAccel` in `innovate`, so a culture on a metal node industrialises
  sooner). Control is tracked per node with `resourceCaptured` conquest events. This is the
  seam for future resource-driven war.
- **Institutions as composite actors (the recursive up/down layer)** — an institution is
  an *agent whose body is a set of lower actors*. Two pointers realise the hierarchy in
  O(n): `agent.org` points up to its most-specific institution, `inst.parent` points up the
  chain (`guild / firm / warband → state → [dynasty = culture]`); an unaffiliated agent is a
  household (the base actor). Institutions **self-assemble** where capabilities + surplus +
  pressure allow (guilds in writing/metallurgy cities, firms on mechanised megacities,
  warbands on contested frontiers, one state per dynasty), **persist as named entities**
  while members flow through them (a firm outlives its workers; hysteresis keeps them stable),
  hold a **treasury**, and **act/interact once per tick**: firms drive economic activity,
  guilds pool knowledge, states tax + stabilise, and **warbands wage organised war over the
  named resources and territory** (`war` events — "Vobe's Host took salt from culture #1").
  Surfaced in the development view's institutions table (companies / guilds / armies / states,
  with treasury, strength, conquests, alive/fell). Deterministic; per-tick work is O(live
  institutions). A pastoral kurgan run is all warbands; an industrial run grows companies.
- **Credentials + reputation (the individual layer)** — every agent carries a `cred` bitset
  (its **résumé**: skills/offices earned) and a reputation (`status`). Credentials are *issued*
  by institutions through participation (a guild issues `smith`/`scribe`/`master`, a firm
  `engineer`/`trader`, a warband `soldier`/`officer`, a state `citizen`), are **portable**
  (a credentialed migrant deposits its skills' capabilities into the destination's meme field —
  person-borne diffusion), and **heritable** (apprenticeship: children inherit parents' creds).
  Reputation accrues from credentials + wealth + office and **drives individual selection**:
  who **leads** an institution (its elite / great person), and — via a reputation tournament
  in mating (on a separate RNG stream, so it never perturbs demography) — who reproduces more,
  so **reputation lineages** accumulate and *some agents matter*. Institutions get a mean
  reputation (their "brand") that feeds war (a great captain multiplies a host). Surfaced as
  named **great persons** with résumés (develop view) and clickable **notable people** on the
  map (playground) — e.g. "Labigo of #2, ★3.39, age 73 — farmer/smith/scribe/mason/trader/
  master/elder". Deterministic, O(n) (bit-ops folded into existing passes).
- **Microeconomy** — firms and guilds *produce wares*; a stigmergic **price field** rises
  with local demand and falls with supply (smoothing to neighbours = market integration).
  Revenue = output × price, split by an evolvable ruleset into **wages** (→ member wealth)
  and **profit** → **capital** → higher output next tick — the growth loop, so an industrial
  takeoff is an *economic* takeoff, not just a tech flag. Wealth buys survival (the rich
  weather famine), so success feeds back into demography and inequality (a **Gini** falls out,
  ~0.5). Deterministic, O(n).
- **Meritocratic recruitment + evolvable institution rulesets (the org-level Darwinian loop)**
  — role assignment is biased by reputation × credentials to the degree an institution's
  `merit` ruleset says (a hereditary society recruits at random); a meritocratic firm fields
  higher-reputation members → higher output → it grows → **its ruleset gets imitated**. Every
  institution carries a ruleset `{tax, wage, merit, invest}` that new institutions inherit from
  the most-successful exemplar of their type (imitation) with drift, and the economy *selects*
  it. Institutional forms differentiate under selection — e.g. firms converge on high investment
  + meritocracy, guilds on low tax. Surfaced in the development view (Economy card with Gini /
  prices / output and the evolved exemplar rulesets; per-institution capital + ruleset columns)
  and the playground (`wealth` and `market`-price colour modes).
- **Financial markets (capital, equity, debt)** — every firm carries an **equity price**
  that moves on its fundamentals (earnings/output growth) *plus* a shared market
  **sentiment**; the capital-weighted mean is the **stock index**. Sentiment is momentum
  (`0.7·last-return + 0.3·prior`, tiny orthogonal noise), so the whole market **booms and
  busts** together (`marketBoom` events). Firms **raise capital two ways**: issuing equity
  in a bull market (only when equity is high and their `invest` ruleset is aggressive), or
  **borrowing** — a firm short of retained profit for its target capital takes on **debt**.
  The **interest rate is a genuine loanable-funds market**, clearing two *per-tick flows*:
  **borrowing demand** (firms' external financing needs, made procyclical by sentiment — a boom
  emboldens borrowing) against **savings supplied** (retained firm/guild profit + a slice of
  state treasuries). Signed excess demand `(D−S)/(D+S)` sets a target around a ~5% neutral rate
  (`0.05·e^{1.35·pressure}`) plus a stress premium per default, and the rate adjusts *stickily*
  toward it — so a pre-industrial **savings glut** sits near ~1%, an industrial **investment boom**
  drives it toward the mid-teens, and borrowing is itself **rate-elastic** (dear money is drawn
  down less). Overlevered firms whose output collapses **default**, and a cluster of defaults (or a
  sharp index drop) is a **`financialCrisis`**.
  All of it is on the `R.econ` stream and folded into the existing institution pass — O(live
  firms), fully deterministic. Surfaced in FRED (stock index, rate, debt/GDP, per-firm
  equities) and the development view's Economy card (`market` block).
- **Memetics — religion → philosophy → ideology (the belief phylogeny)** — belief is a
  **second heritable program**, orthogonal to culture and language, so its map cuts *across*
  the political and linguistic ones (a world religion spans cultures; one culture hosts rival
  sects). Each agent carries `A.belief` + `A.piety`; each **belief** entity has a **doctrine
  vector** whose six axes (`universal, moral, hierarchy, ascetic, martial, rational`) couple to
  real mechanics, so beliefs are **selected by how well they spread**. The four forces mirror
  the culture layer (own `R.meme` stream, O(n)): **founding** — a prophet in a bronze-era city
  founds a faith (doctrine drawn from `R.meme`; late eras skew rational → philosophies/ideologies);
  **transmission** — agents convert toward the locally-dominant or a missionary neighbour's faith
  (weighted by the `universal` axis), inherit the mother's faith at birth, and lose it to
  secularization (the `rational` axis raises piety decay) — conversion uses a deterministic hash,
  never a shared RNG draw, so demography stays byte-identical; **schism** — a large, spread faith
  splits into a sect with drifted doctrine, growing the belief tree; **selection couplings**
  (value-only, no extra draws) — `moral` → in-group trust (lower death) + fertility, `martial` →
  holy-war warband strength, `universal` → conversion reach. Emergent: **world religions**
  (a faith across many cultures) vs. folk faiths, reformations, and the religion→ideology arc.
  Surfaced as a third **belief map cut** (playground), a **Faiths table** with doctrine profiles
  + phylogeny (development), FRED **Belief** series (living faiths, believer share, mean piety,
  largest-faith share), and `beliefFounded`/`schism` events. Deterministic; selftest covers it.

The worker (`../../civ/worker.js`) imports this engine unchanged. Note determinism is
load-bearing: never introduce `Math.random` / `Date.now` into the core.

**Compute: edge OR client (same code, same bits).** The request logic (`params → chronicle`)
lives in one shared module, `api.js` (`doRun` / `doFrames` / `doSweep` + presets), imported by
**both** the Cloudflare Worker (the API) **and** a browser bundle (`../../civ/lib/civ-engine.js`,
built from `api.js` by `scripts/build-civ-engine.mjs`). Because the sim is deterministic pure JS
(typed arrays + `Math`, zero platform deps), a run computed in the browser is **bit-identical** to
one from the edge — same `chronicleHash` — so permalinks and cross-view liquidity stay valid
regardless of where it ran. The views compute **client-side by default**: `civ-cache.js` runs the
sim in a module **Web Worker** (off the main thread, no UI freeze), caches the result in
`localStorage`, and only falls back to the `/api/civ/*` endpoint if Web Workers/modules are
unavailable or the bundle fails. This means **no Cloudflare CPU limit** on the hot path (the 503
that a 1500-tick run tripped is gone), the user's machine does the work, and the edge serves as a
capped fallback (`limits.cpu_ms` raised in `wrangler.jsonc` for that role). Regenerate the bundle
after any `mappa/civ/**` change — the deploy does it automatically (`deploy-civ.yml` runs the build
before `wrangler deploy`); locally, `node scripts/build-civ-engine.mjs`.

*Profile (1500-tick run):* ~35% demography (births/deaths/dispersal — sequential, bound by the
ordered RNG draws that make it deterministic), ~13% institution assembly, ~8% belief passes, the
rest fields/culture/capture. The dominant cost is sequential-by-determinism, so it is a poor GPU
fit; the realized win was **moving it off the fixed edge budget onto the client**, not vectorizing
it. A future path to raw speedup is region-parallel demography via re-keyed per-agent RNG (breaks
bit-parity — a separate mode), or capping population growth (a design lever).

**Cross-view liquidity.** A run's identity is `(world, config|preset, civSeed, ticks)`,
carried in the page URL. The dashboard, the particle playground, and the mappa map all
read/write those params, so the ★ you roll on one is the exact run you open on another —
and the "world on mappa" link (`?seed=N` or `?w=<token>`) opens the same planet. Same
config ⇒ same chronicle, so the score and history match across surfaces by construction.
