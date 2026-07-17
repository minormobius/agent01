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

### Phase IV — institutions with insides

- Civ institutions become org-engine organisations: State → `feudal`/`corp` by era,
  Guild/Company → `corp`, Host → `military`, faiths → `ecclesiastic`/`monastic`.
  An institution's org seed derives from `siteSeed` + institution id, so drilling into
  a 9th-millennium temple hierarchy is a permanent address.
- Notable people in chronicles become full `person.js` people (craft/drive/wit,
  vocation, quirks) — which by construction makes them valid **hoop NPCs**.
- org's performance oracle feeds back: institution efficiency (leadership, span
  overload, depth tax) modulates civ institution success and polis firm productivity.
  Same seed, different org shape → different history. That's the coevolutionary loop
  closing across three sites.

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
| IV — org institutions + people | medium | none (additive) | drill-down, hoop NPCs |
| V — canon, daily world, fable/city | ongoing | none | content flywheel |

II and III shipped together: the siteSeed string minted in III uses the city names
minted in II. Next up is IV — civ institutions becoming org-engine organisations
(the seat toponym + siteSeed already give every institution a stable org address).
