# The World Engine Suite — unification & expansion strategy

**civ.mino.mobi is the hub.** This document is the plan for pulling five tendrils —
`mappa/`, `civ/` (engine in `mappa/civ/`), `polis/`, `rite/names/`, `rite/org/` — into one
deterministic stack from planet to person, and for where the suite goes next.

---

## 1. Where things stand

| Layer | Scale | Lives at | Served from | State |
|---|---|---|---|---|
| **mappa** | planet | `mappa/` | `mino.mobi/mappa/` (rides the **root** surface) | Mature reference. Pure `engine.js` (seed → tectonics → climate → biomes → rivers), Rust mirror in `engine-rs/`, `?w=` permalinks + `com.minomobi.mappa.world` ATProto records, its own toponymy in `lib/names.js`. |
| **civ** | 10 000 years | engine `mappa/civ/`, surface `civ/` | `civ.mino.mobi` (own worker, **this branch owns the deploy**) | Mature. Headless-first coevolutionary sim; CORS-open no-key API (`/api/civ/run|frames|sweep`); browser bundle bit-identical to the edge; content-addressed chronicles; QD sweep; node CLI. Four good sub-pages (dashboard, particle playback, development, FRED). |
| **polis** | a city | `polis/` | `mino.mobi/polis/` (rides root) | Half-baked expansion, deliberately: deep theory (THEORY.md, docs charter) + a working vertical slice (site scoring, founding engine, Physarum arteries, chronicle). Imports the **real** `mappa/engine.js`; ports hoop's solvers. |
| **names** | a word | `rite/names/` | `rite.mino.mobi/names/` + `/api/names` (rite surface) | Mature engine. 12 blendable culture packs × 5 settings × 5 kinds; dep-free ES module; node selftest; public API. |
| **org** | an institution | `rite/org/` | `rite.mino.mobi/org/` + `/api/org` (rite surface) | Mature engine. 8 verticals × 7 shapes; deterministic *people* (`person.js`, hoop-compatible vocations); performance oracle; infinite drill-down; public API. |

Adjacent but out of scope as build targets: **hoop** (the walkable end of the stack — org
people are already designed to be valid hoop NPCs), the planned **fable `/city`** wing
(registry note says "extends mappa" — it should extend *polis*), and the mino.mobi atlas
(a projection of the site catalogue onto a mappa world).

### What already aligns (the suite's real contracts)

1. **Determinism.** Every engine is a pure function of a seed — same xmur3/mulberry32
   idiom throughout, bit-exact across node/browser/Worker. mappa seeds raw integers;
   rite hashes strings first; `siteSeed()` in `rite/org/engine.js` already documents the
   bridge between the two conventions.
2. **The URL is the artifact.** mappa `?w=` tokens, civ `(world, config, civSeed, ticks)`
   permalinks, names/org seed permalinks. Nothing needs a database to be reproduced.
3. **Pure-compute, CORS-open, no-key APIs** (civ, names, org) that edge-cache forever.
4. **Engines are imported, never forked.** polis imports `mappa/engine.js` live; the civ
   worker bundles it at build (`scripts/build-civ-engine.mjs`); org imports names.

### The fault lines (what's actually split)

1. **Three naming voices.** mappa has plate-language toponyms (`mappa/lib/names.js`);
   civ names prophets/faiths/guilds with bare CV syllable soup (`personName`,
   `beliefName`, `instName` in `mappa/civ/engine.js`); rite/names has the real
   culture-flavored engine. Civ cultures themselves are *numeric ids* with no names at all.
2. **The org bridge is one-way.** `siteSeed(worldSeed, cityName, cellIndex)` exists and is
   selftested on the rite side — nothing in mappa/civ/polis consumes it.
3. **polis has no history input.** It founds cities from raw terrain (site-vs-situation
   scoring), not from a civ chronicle. Civilization history and city history are disjoint.
4. **Deploy ownership was scattered.** civ had its own surface on a stale branch;
   mappa and polis ride the root landing surface (a sim change redeploys the landing);
   names/org ride the rite surface. Phase I below fixes the civ side; the rest is
   deliberate for now (see §3).

---

## 2. The phases

### Phase I — one address *(this commit)*

- `civ.mino.mobi/` becomes the **suite hub** (planet → history → city → people ladder,
  with the seams between layers stated explicitly). The dashboard moved to `/dash/`;
  the worker 301-redirects legacy root permalinks (`/?world=…`) so every shared run
  URL still resolves.
- Deploy takeover: `deploy-registry.json` civ surface → `claude/civ-deploy-unification-vt35ju`,
  triggers regenerated, lint green. The registry remains the source of truth.
- The seed-is-the-URL contract is frozen suite-wide: any change that would alter what an
  existing permalink regenerates is a **config-epoch** change (see §4).

### Phase II — one naming voice *(SHIPPED)*

Civ's world speaks rite/names. As built:

- `mappa/civ/names.js` wraps `rite/names/engine.js` (dep-free, runs in the same three
  targets civ builds for). `deploy-civ.yml` paths and the committed browser bundle
  (`scripts/build-civ-engine.mjs`) both track it — edge and client stay bit-identical.
- Each civ culture draws a deterministic culture-pack blend at first use (one pack,
  40% a blend of two) and lazy per-(culture, kind) namebooks: **cultures have names**
  (`final.cultures[].name`, `final.polities[].name`), people are `full`-kind
  (epithets included — *Thremund the Younger*, *Vyevmund of Serruborg*), beliefs read
  like founders' names, institutions keep their English wrappers around culture-book
  roots (*the Dylfjord State*), and state seats get toponyms (*Vylfstrand*).
- **The hash discipline turned out even cleaner than planned**: `chronicleHash`
  serialises events/series/final *without* name strings, so the swap is hash-invariant
  — verified against the pre-change engine (same params, same `67eee302`). The
  `names: 'rite' | 'legacy'` config field exists anyway; `'legacy'` reproduces the old
  syllable strings bit-exactly (selftested) for byte-stable payload replays.
- Still open (deliberately): unify mappa's own toponym generator (`mappa/lib/names.js`)
  with rite/names culture packs. Low priority; landform vs. people registers tolerate
  divergence.

### Phase III — the civ → polis handoff *(SHIPPED — first slice)*

Cities inherit history, not just terrain. As built:

- **`GET /api/civ/sites?world&preset|config&civSeed&ticks`** (same run, same cache
  keys, same hash as `/run`) returns the foundings contract: every culture that
  reached statehood → `{culture, cultureName, city, cell, lon, lat, tick, year, tier,
  peakPop, alive, siteSeed}`. `siteSeed` is org's convention, `${world}:${city}:${cell}`
  — **adopted as the suite-wide city identity**. Foundings also ride along on
  `/api/civ/run` as `chronicle.final.foundings`.
- **Resolution honesty**: mappa terrain is *not* mesh-resolution-stable (same seed at
  N=900 vs N=7000 gives different coastlines — civ seats land in the N=7000 ocean).
  The contract therefore carries `n`, the requested mesh N; regenerating at that N
  reproduces the identical mesh, cell ids and all. This is a suite-wide rule now:
  **a lon/lat is only meaningful alongside the N it was found at.**
- polis consumes it: `?civ=1&world=&preset=|config=&civSeed=&ticks=&site=i` on
  `mino.mobi/polis/` fetches the foundings, rolls the mappa world at the contract's
  `n`, centres the region on the seat via `regionAtLL()` (new in `mappaWorld.js`),
  and seeds mesh + chronicle from `xmur3(siteSeed)`. A banner names the city and
  links back to the civ run; the dashboard links each founding into polis.
- Still open: deeper inheritance (founding-date offsets into polis's climate arc,
  culture → initial institutions), and the eventual `/api/polis/*` mounted in the civ
  worker once polis has server-side needs. Note polis rides the **root** surface —
  its half of the handoff deploys when this branch's `polis/**` changes reach `main`
  (or the root owner branch).

### Phase IV — institutions with insides *(SHIPPED — first slice)*

As built:

- **Org addresses, not embedded simulation.** `mappa/civ/org.js` maps institution kind →
  org vertical/shape (state→feudal/tall, firm→corp/pyramid, guild→corp/flat,
  warband→military/cellular; faiths by register: folk→monastic, temple/scripture→
  ecclesiastic, philosophy/ideology→academic). Every institution in the payload carries
  `{seatName, org:{vertical,shape}, namePack}`; the org seed is composed by consumers as
  **`${world}:${seatName}:${seat}:${kind}${id}`** (the siteSeed convention extended one
  level down). The development page renders an "org ↗" link per institution — a
  9th-millennium temple hierarchy is a permanent address, generated on demand by the
  org engine, never stored.
- **One voice, two engines**: the link carries `?names=<pack>` (the civ culture's
  culture-pack blend), and the org page + its infinite-lens expansion honor it — so
  *the Dylfjord State*'s org chart is peopled in the same phonotactic voice civ named
  it with.
- **Great people are full org persons**: `civPerson(civSeed, agentId, kind)` →
  `person.js` `makePerson` at the apex (triad, cast, vocation `govern`, quirks,
  output/leadership) — deterministic from (civSeed, agent id) alone, so the same
  person whatever they led, and by construction a valid **hoop NPC**. Shown on the
  development page's great-people table (cast · vocation, full detail in the tooltip).
- All additive and hash-invariant (selftested).
- **Still open (the deep half)**: org's performance oracle feeding *back* — institution
  efficiency (leadership, span overload, depth tax) modulating civ institution success
  and polis firm productivity, so same seed + different org shape → different history.
  That's the coevolutionary loop closing across three sites, and it's real engine work,
  not addressing.

### Phase VI — the city epoch *(SHIPPED — epoch 2)*

**Cities as actors.** The declared hash break (epoch 1 pinned `67eee302`; epoch 2 pins
`3c9a4a61`; `meta.epoch = 2`). What a city IS, architecturally: **an org of orgs** —
the city entity is the *container*; its members are the institutions seated at its
cell (guilds, firms, warbands, the state — each already carrying a Phase-IV org
address into rite/org) plus the population itself, plus the notable agents who lead
those institutions. `final.cities[].institutions` is the rollup. A future "city
council" org chart (the apexes of the member institutions as one hierarchy) is the
natural next rung and needs no new engine state.

The dynamics that make it an epoch, not an overlay:

- **Agglomeration**: a city's peak scale multiplies effective carrying capacity at its
  cell (`cityK`, up to +25%) — urban gravity; cities feed their own growth.
- **Walls**: a city whose holding culture knows masonry fortifies after 30 ticks;
  walls multiply effective defense ×1.8 in war resolution.
- **Sieges**: one combat roll decides both outcome and counterfactual — an assault
  that would have carried an unwalled town but breaks on walls is a `citySiege`
  event ("stone outlasts fury").
- **Sackings**: taking a city is bloodier (more killed/converted) and recorded —
  `sacked` counter + `sackTicks` (exact history, event log throttled to annals).
- **Falls and revivals**: `cityFall` when a real city empties; re-crossing the
  threshold revives it.

All of it surfaces: city events in the playback event bar, sack/siege/fall entries in
both timeline historiographies, and the full shock history in `/api/civ/sites`.

**The polis inversion (client of the world beyond).** polis no longer authors its own
catastrophes when a civ run is upstream: `/api/civ/sites` now carries the run's
global climate curve, and each city its `sackTicks`. The polis boot maps both into
`worldShocks` (`{frac, kind: 'sack'|'drought', mag}`) consumed by
`runChronicle(..., { worldShocks })` — a sacking recorded in civ history lands on the
biggest polis town at the same fraction of the timeline; a global forcing peak
arrives as drought. polis's own deep-time volcanic backbone remains (it comes from
the mappa *world*, which is also global-view); what moved is authorship of
*historical* events. Remaining polis work: retire its internal tech clock in favour
of the founder culture's tier trajectory, and surface the shock provenance in its
event ribbon.

### Phase VII — the city cascade (civ → hinterland → city)

**The reframe (structural, decided):** what polis had built was never the city — it
was the **hinterland**: a regional multi-town sim. So the surface is restructured:
`/polis/hinterland/` is the former region sim (moved verbatim, civ-client boot and
all), `/polis/continent.html` the former continent view, and `/polis/` itself is now
the charter for the **city proper** — which runs as a *cascade of three histories*,
each level a client of the one above. Every city's history requires running civ AND
the hinterland before the town — and that's fine: the civ run is content-addressed
(cached forever), the hinterland runs in milliseconds. This is dynamical
**downscaling**, the climate-model discipline: a regional model nested in a global
one, nested again for the site.

**The two facts the cascade rests on** (verified in code):

1. **Mappa has no sub-cell truth.** A civ cell at n=900 is ~a week's walk across.
   `polis/mesh.js` already *mints* the finer geography deterministically: IDW-smoothed
   real fields + rivers **re-derived by flow accumulation on the finer graph** +
   coasts recomputed per-era sea level. Resolution on coasts/mountains/rivers/biome
   edges is *born* at the hinterland level, conditioned on the coarse tile — so map
   creation genuinely starts at the hinterland view. (Upgrade path when zooming
   further: conditional fractal detail — midpoint displacement constrained to the
   coarse field — same principle, one level down.)
2. **"A town every day's walk" cannot come from civ** — the macro's atom is bigger
   than the pattern. It must be (and already is) minted at the mesoscale:
   `foundTowns` places towns by site-vs-situation score under a minimum-`spacing`
   constraint — central-place theory as a generator. Civ's role is to *constrain* it,
   not author it.

**The contracts (what flows down):**

- **civ → hinterland**: founding + founder culture + `sackTicks` + global climate
  curve (all shipped, Phase VI) + the **demographic envelope** — `final.cities[]`
  now carries `popSeries` (fred-cadence per-city population, zeros before founding),
  so the hinterland's towns can be nudged to sum toward the macro city's curve
  (soft conservation, downscaling-style — nudge, don't clamp).
- **hinterland → city**: which town is THE city, its neighbor towns + artery field
  (trade directions become gate/road orientations), its local terrain patch.
- **city (Phase VII proper, to build)**: districts/blocks/streets by recursive
  Voronoi descent, habitat-determined — the river bend fixes the port, the
  defensible rise the citadel, epoch-2 `walls` the boundary polygon, district kinds
  from the city's `institutions` rollup (a city is an org of orgs). Streets are the
  dual of the block tessellation; arteries promote to main streets; hoop's
  fixture-growth generates interiors; org persons occupy them. Every address
  extends the siteSeed — `world:city:cell:d2:b5:lot3` — generated lazily on zoom.

**Still open at the hinterland level**: nudge-to-envelope isn't wired yet (towns run
free; the envelope ships but isn't consumed), and the hinterland's internal tech
clock should follow the founder culture's tier trajectory rather than its own
logistic.

### Phase V — outward

- **Frozen canon.** Star-worthy runs (QD sweep elites) freeze as ATProto records —
  the lexicon (`com.minomobi.mappa.civ`) and the borges first-write-wins pattern both
  exist. A gallery of canonical histories, each a permalink + a record.
- **A daily world.** bisk-pattern cron: mint one interesting world → civ run → founded
  city chain per day, "today in the multiverse."
- **fable `/city`** builds on polis (not fresh), consuming the same handoff contract.
- **hoop** is the far end: a hoop society sited by `siteSeed` into a civ-run world means
  you can *walk around* in year 9 400 of a history you can also read as FRED charts.

---

## 3. Deploy posture (what deploys what, and why it stays that way)

- **civ surface** (this branch): `civ/**`, `mappa/civ/**`, `mappa/engine.js`,
  `mappa/lib/world-share.js`. Phase II adds `rite/names/engine.js` to these paths.
- **mappa + polis stay on the root surface** near-term. Splitting them would break
  established `mino.mobi/mappa/`+`/polis/` URLs for zero user benefit. Revisit only when
  polis gets an API (Phase III) — and then move *compute* into the civ worker, not the URLs.
- **names/org stay on the rite surface.** They are engines with public APIs; civ consumes
  the engine *by import at build time*, so a rite deploy never changes a civ permalink —
  only a civ redeploy (with its paths watching `rite/names/engine.js`) can.
- One rule inherited from the repo: the registry is the source of truth; edit it, then
  `gen-deploy-triggers --write` + `lint-deploy-registry` + `gen-surface-map --write`.

## 4. Engineering guardrails

- **Config epochs.** Any change that alters what an existing permalink regenerates
  (Phase II names, engine physics tweaks) ships as an explicit config field first,
  default-flipped in a single announced commit. Chronicle hashes make violations
  detectable: keep a fixture file of `(params → hash)` pairs and check it in the deploy
  workflow — a hash drift that isn't a declared epoch fails the deploy.
- **Import, never fork.** The suite's one structural law. polis already models it
  (its hoop solver ports are marked "re-sync from source, never diverge" — acceptable
  only because hoop is outside the suite).
- **Selftests before engines.** names, org, and mappa/civ all have node selftests; any
  new seam (foundings contract, siteSeed consumers) gets one. They run in CI free —
  they're plain node scripts.
- **Determinism red lines.** No `Date.now()`, no unseeded `Math.random()` in any engine
  path (borges rule). The nav-level "random seed" roll is the only allowed exception.

## 5. Sequencing & effort

| Phase | Size | Risk | Unlocks |
|---|---|---|---|
| I — hub + deploy takeover | **done** | none | everything below has an address |
| II — names into civ | **done** (hash-invariant, legacy mode kept) | none in the end | legible cultures everywhere |
| III — civ → polis foundings | **done** (first slice; polis half ships with the root surface) | resolved (`n` in contract) | polis inherits history |
| IV — org institutions + people | **done** (addresses + persons; perf feedback open) | none (additive) | drill-down, hoop NPCs |
| V — canon, daily world, fable/city | ongoing | none | content flywheel |

II–IV shipped in sequence: III's siteSeed uses II's city names, IV's org seeds extend
III's convention one level down, and IV's org charts speak II's culture packs. What
remains of IV is the feedback half (org performance → civ/polis economies); V items
are independent and can interleave.

### Shipped alongside (pre-V infrastructure)

- **The timeline** — `GET /api/civ/timeline?mode=greatman|forces|tech|both|all` +
  `/timeline.html`. One chronicle, three lenses: *great man* (named actors — prophets,
  dynasts, warlords, the eminent with their org-person temperaments), *forces* (phase
  transitions, climate, credit cycles, meme selection), and *tech* (first inventions,
  independent reinventions, diffusion milestones — knowledge outrunning armies). This
  is where beliefs and cultures surface as content: entries carry machine-readable
  `refs` with culture names, belief doctrine vectors, and the evolved exemplar
  **rulesets** — the numbers selection actually wrote. The refs spine is deliberate
  Phase-V groundwork (a borges-style reteller or fable wing can build on it directly).
- **Continents as a first-class axis** — every located object (institutions, beliefs,
  foundings, cities, great people, timeline entries) carries `landmass`; continents
  are *named* (`final.landmasses`) and the timeline filters by them
  (`?landmass=<id>`, world-scale entries retained). The cell→landmass lookup rides
  `chronicle.geo`, deliberately outside chronicleHash — events serialize `e.landmass`,
  so events must never gain the field retroactively.
- **Cities** — settlement is now explicit: any cell whose population crosses
  `CITY_MIN` (popScale-scaled) is recorded as a city — founding tick, founder culture,
  toponym in the founder's tongue, peak, and the mappa geography that sited it
  (river / coast / resource flags; empirically ~70% of cities sit on rivers or
  coasts, driven by dispersal's corridor weights and resource K-bonuses — the mappa
  river data was already load-bearing, now it's visible). Cities join the timeline
  (both narrative lenses) and `/api/civ/sites` (`cities[]`, same siteSeed convention;
  polis grows any of them via `?civ=1&city=k`). Observation-only: no dynamics, no
  events, hash-invariant. Open question, deliberately deferred: cities as *actors*
  (markets, walls, sieges) — that's an engine epoch, not an overlay.
- **Major organizations** — institutions with peak ≥ 250 get their own timeline
  entries in both narrative lenses, carrying the full Phase-IV org address; the
  timeline page renders an "org ↗" link that opens the hierarchy in the institution's
  own culture voice.
- **Climate made visible** (the polis aspiration) — a `climate.pulse` +
  `climate.affected` series in FRED (hash-safe: fred is never hashed), a per-frame
  `clim` scalar feeding a forcing ribbon under the playback transport, and timeline
  entries for onset/peak/release phrased per preset (kurgan drying, beringia thaw,
  4.2ka drought-and-recovery) in both historiographies.
- **Mesh resolution** (the mappa move) — every page has a mesh selector; `n` rides the
  shared URL state. Up to the edge cap (1200) the API serves it; above (1600/2400) the
  edge **rejects rather than clamps** (a clamped n would silently generate a different
  world) and the run computes in the browser via the bundled engine (`BROWSER_CAP`,
  n ≤ 2600). Known limit: a fine-mesh run can't hand off to polis through the edge API
  (polis has no local civ engine), so `?civ=1&n>1200` falls back to polis's default boot.
- **Hash pin in CI** — the selftest asserts the canonical permalink hash so any
  hash-breaking change fails the suite unless declared as an epoch. Epoch history:
  epoch 1 → `67eee302`; epoch 2 (cities as actors, Phase VI) → `3c9a4a61`.
- Particle playback captures up to 300 frames (every ~5 ticks at 1500 ticks) with
  sub-1 fps speeds.
