# biome — CLAUDE.md (the ECOSYSTEM wing)

You are working on **biome**, the ecosystem wing of the O'Neill cylinder modelling package.
Read `biome/README.md` first — this file is the operational quick-reference.

## What biome is

The **closed ecology** of the cylinder interior, modelled as a living **food web** (not a
farm). The zeroth question of the whole package: *can the life-support loop close at all as
stocks and flows?* Everything lives under `cycles/`:

- `cycles/sim/cycles.mjs` — the deterministic, element-exact, data-driven box-model engine.
- `cycles/sim/allometry.mjs` — derive an animal's stat block from body mass (Kleiber) + guild.
- `cycles/sim/roster.mjs` — curated real-organism roster; `buildCommunity()` compiles it.
- `cycles/sim/lake.mjs` — the **lake bioengine**: an aquatic community + two figures of merit
  (surplus harvestable fish, effective water treatment). Reuses the engine + roster compiler.
- `cycles/sim/global.mjs` — the **global food web**: land roster ∪ lake roster in one box.
  Composes both, reports whole-ship figures of merit, and exposes a drawable typed graph.
- `cycles/sim/builder.mjs` — the **food-web builder** backend: compile/validate/run/analyse an
  arbitrary user **design** (same species shape as the rosters), plus a URL share codec + presets.
- `cycles/sim/{linalg,stability}.mjs` — community matrix → stability / reactivity / keystones.
- `cycles/index.html` — the dashboard; `cycles/stability.html` — the stability lab;
  `cycles/lake.html` — the **lake bioengine**; `cycles/global.html` — the **global food web**;
  `cycles/builder.html` — the **builder**: design any web, read its stability, share it by link.
- `cycles/robustness.html` — the **intermingling lab**: wires *cross-web* trophic edges (an amphibian,
  a waterbird, a chthonic soil web of earthworm/fungus/ground-beetle) and reads off the community matrix
  whether coupling the land & lake webs makes the closed ecosystem more robust (May 1972 vs McCann/Rooney).
  It composes these on the fly via `builder.mjs` + `stability.mjs`; the **canonical `global.mjs` stays
  trophically disjoint** (invariant #6) — this lab *explores* the alternative, it does not change the model.
  Finding: one weak fast–slow bridge (the frog) shortens return time; dense/strong coupling spikes
  reactivity and erodes the margin. Pure client-side, two model runs per render.
- `cycles/solver/` — the Rust/WASM stability kernel (the precision/scale sister of linalg.mjs).
- `cycles/sim/maximal.mjs` — the **maximalist intermingled web**: land ∪ lake ∪ a chthonic soil web
  (earthworm + saprotroph fungus + the springtail) wired together by real CROSS-WEB couplers — a frog
  (lake↔soil) and a farmed duck (lake↔land). Unlike `global.mjs` it HAS cross-web trophic edges (that
  is the point). Tuned (weak-coupling regime: few couplers, prey refuges, the duck heavily harvested)
  so **every species persists** and C/H/O/N still conserve — both pinned by `cycles/test/maximal.selftest.mjs`.
  Exposes `CONTAINERS` (land/lake/soil/bridge) + `buildMaximalGraph()` (edges tagged `.cross` when they
  bridge containers). NB: a fast soil predator (a ground beetle) is intentionally omitted — it over-eats
  the worm and collapses the brown web (the reactivity spike the intermingling lab flags).
- `graph/index.html` — the **trophic-web force graph** at `biome.mino.mobi/graph`. The **maximalist**
  web as one force-directed graph: each organism wears its iNaturalist photo, **sized by present
  standing biomass**, and the three habitats are each held in their own **basin** (LAND · LAKE · SOIL),
  with the couplers (frog, duck) floating in the gaps and the shared pools (air/N/detritus/larder) in the
  centre where all three webs meet. Cross-container edges are drawn gold; a toggle isolates them. Reads
  `buildMaximalGraph()`/`maximalReport()` from `cycles/sim/maximal.mjs` + the committed `graph/organisms.json`
  imagery (built by `node biome/graph/build-organisms.mjs` over land+lake+soil+coupler rosters; engine never
  reads it). **The whole script is wrapped in an error overlay** (`#err`) — any throw shows on the page
  instead of blanking the canvas; keep it that way. The worker normalises the no-slash `/graph` to `/graph/`
  — the only non-asset route, a rewrite to a page, not server compute.

## The sprite lab (`sprite/`) — live at `biome.mino.mobi/sprite` (Phase 1)

Deterministically generate an **animated, articulated SKELETON for any organism in the deck**. The
insight (borrowed from "the guy", `mega/sprite/core.js`): a human is *one fixed body plan* you can
hardcode a rig for; an arbitrary organism is not. The first attempt — one soft quadruped topology
scaled by size + a few knobs — landed in the **uncanny valley** (every animal a stretched blob, because
size is the least characterful axis). The fix: draw the **literal skeleton**. What makes a horse a horse
is the *bones* — limb-element ratios, vertebral formula, digit reduction, stance — and those are real,
measured comparative-anatomy data. The skeleton is also abstract enough to escape the realism contract
(a naturalist's bone plate, not a fake animal). The bones **are** the rig, so the clip animates real joints.

- `sprite/bauplan.mjs` — the **classifier + orchestrator**. `classify(org)` → `{clade, archetype}`
  (curated genus→clade table; Phase 2 swaps for iNaturalist `ancestor_ids`). `build(org)` resolves a
  family + osteometric profile and articulates a skeleton, with a seeded ivory **bone palette**.
  **Determinism is load-bearing** — the seed is the organism's stable iNaturalist taxon id, so a
  creature has ONE canonical skeleton for ever and `/sprite/?id=…` is a permalink. Reuses `gacha/prng.js`.
- `sprite/osteo.mjs` — **the comparative-osteology dataset** (the research artifact). Per mammal family
  (equid, felid, canid, bovid, cervid, ursid, leporid, suid, murid, mustelid, + reptile/generic):
  stance, vertebral formula, limb-bone ratios, digit formula, skull proportions. Grounded in the
  cursoriality-index literature (crural/brachial/intermembral, MT/F). `familyOf` / `profileFor` resolve it.
- `sprite/skeleton.mjs` — **the builder**. `buildSkeleton(org, profile, rand)` → a parent-before-child
  bone list: vertebral column (neural spines, withers), ribcage, skull+mandible, scapula/pelvis blades,
  four named-bone limbs with stance-correct feet + digit reduction. A `groundLevel()` pass tilts the body
  so all feet plant on one line (slopes the back for saltatorial leapers). Limb bones tagged `leg`+`joint`.
- `sprite/render.mjs` — the **phenotype**. `solve()` (forward kinematics) + the clips (the walk clip is
  the generalisation of the guy's one gait — phase→per-bone Δangle, dispatched by leg/joint tags) +
  `bbox()` (canvas-free → headless self-test) + `draw()` (bone/vertebra/blade/skull/rib/hoof primitives;
  the only browser-only fn).
- `sprite/index.html` — the lab. Focused animated stage + a gallery; meta shows family/stance/vertebral
  formula/digits. Same `#err` overlay as `/graph`+`/gacha`. Worker normalises no-slash `/sprite`.
- `sprite/proof.mjs` — dev tool: renders the SAME `solve()` geometry to an **SVG contact sheet** so the
  skeleton can be eyeballed from the sandbox (no browser). `node biome/sprite/proof.mjs [ids…] [--phases N]`.
- `sprite/test/sprite.selftest.mjs` — 20 checks: classifier total, deterministic build/solve, finite
  geometry across the walk cycle, four tagged limbs, skull+spine+ribcage present, osteology (C7, digit
  formula) resolves, digit reduction expressed (horse < bear), mass→size.

**Phase 1 rigs the `quadruped` archetype deeply** (mammals + walking reptiles — `buildable(org)` gates
it; non-quadrupeds classify honestly but `build()` refuses). Roadmap: Phase 2 = sister archetypes
(avian · serpent · finned · hexapod · …) + digitise more of the osteometric literature into `osteo.mjs`;
Phase 3 = drop the skeletons into the gacha force graph as animated nodes (toggle vs the flat photo nodes).
Known polish: stance-aware limb flexion for leapers (rabbit forelimb), felid/canid spine flexibility.

### The muscular-system solver (`muscle.mjs` · `mechanics.mjs` · `myology.mjs`) — Phase 1: standing

Given a skeleton, GROW a muscular system by mechanically modelling stability — and kill the failing
arrangements. The endgame is mythical beasts (no reference exists), so the algorithm is tuned against
real animals, where the answer is known. Same gacha/oracle shape: generate candidates → a physical
scorer kills the unfit → survivors are the answer. **Deterministic** (no RNG → one canonical musculature).

- `muscle.mjs` — the MODEL (how muscles work) + candidate generation. A muscle spans two bones across a
  joint via attachments `{bone, t, d}` (fraction along, perpendicular offset). Physics: muscles only
  PULL (⇒ antagonist pairs); torque = force × MOMENT ARM (perp distance from joint to the line of action,
  so attachments are offset — real tendons stand off the bone); cost = force × length ∝ volume.
  `candidatesForJoint` generates a fixed grid both sides and **kills zero-lever** (degenerate) candidates.
- `mechanics.mjs` — the ORACLE (2D sagittal statics, g=1, normalised mass). Segment masses → centre of
  mass → ground-reaction forces split fore/aft by CoM. `standingDemand` gives each joint's raw **buckling
  torque** (free-body the distal sub-chain: gravity + GRF of feet below it). `evaluateStanding` →
  per-joint {held (capacity on the correct side ≥ |required|), antagonised (both sides)} + CoM-over-support.
  `evaluateWalking` replays the gait clip quasi-statically (lifted feet drop out of support).
  Every presacral VERTEBRA is an actuated joint (the trunk is a loaded bridge). `actuatedJoints` =
  limbs + head + spine; boundary conditions via `passiveFraction` (ligaments / the stay apparatus carry a
  share before muscle — nuchal, supraspinous). `evaluateWalking` replays the gait quasi-statically.
- `myology.mjs` — `growMuscles(sprite)`. LIMB joints get a mono-articular agonist+antagonist. The SPINE is
  coupled: generate POLY-ARTICULAR candidates (a dorsal cord with a leverage floor spanning many vertebrae)
  and a greedy coupled cover picks the cheapest set — a **long axial muscle emerges** (one long belly beats
  many short ones). Then an oracle-driven REPAIR loop adds short deep muscles (multifidus) until
  `evaluateStanding` reports every joint held. Sized past the hold threshold (SAFE). Deterministic — NO RNG.
- `muscle.mjs` also exports `crossedJoints` (which actuated joints a hand-drawn muscle spans) for the lab.
- `solver.mjs` — **the structural force solve** (`solveForces`): given the muscles, find the pull-only
  tensions (F ≥ 0) that balance every joint — least-squares by projected **symmetric** Gauss-Seidel
  (`min ‖A F − b‖²`, A = moment arms, b = buckling torques; symmetric sweeps because plain GS crawls on
  the coupled vertebral chain). Splits `balanced` (the layout *can* hold — residual ≈ 0) from `feasible`
  (and strong enough — no force over capacity). `collapseStep` relaxes an unsupported pose (clamped to
  joint ROM) so the lab animates the crumble. Natural Rust/WASM kernel (cf. `cycles/solver`); JS-first.
- `myology.mjs growMuscles` ends with **`coupledRepair`** — grow-against-the-solver: a muscle carries ONE
  tension that must satisfy every joint it crosses, so the per-joint grower is optimistic. coupledRepair
  runs `solveForces`, and for each joint it leaves unbalanced adds a local actuator in the residual's
  direction — crucially incl. **single-joint** spine muscles (interspinales) that fix an anti-correlated
  adjacent pair without disturbing neighbours — until the layout is coupled-feasible, then sizes every
  capacity to its solved force. Result: Auto-grow → Solve STANDS (no crumble) for the whole deck.
- `muscle.html` — **the myology lab (construction interface)** at `/sprite/muscle.html`. Muscles attach to
  real skeletal NODES (joint centres, bone ends, neural-spine tips — the dorsal/ventral side is just which
  node). Click two nodes to add a muscle; press **SOLVE** → tensions drawn (brightness = how hard each
  pulls), ground-reaction arrows, balanced/unbalanced joints; with too few muscles it **crumbles**
  (animated collapse). View toggles (bones/muscles/nodes/forces/balance) + Auto-grow.
- `gait.mjs` — **WALK by contracting muscles** (forward dynamics). `makeGait(sprite, muscles)`: each LIMB
  joint is integrated `q̈ = τ/I`; muscles are driven by a controller tracking the walk rhythm (a CPG keyed
  to `CLIPS.walk`), so the legs move because muscles pull, capped by each muscle's strength (too weak →
  lags). The trunk muscles hold the spine; the body is pinned (treadmill = no balance problem). Returns
  per-step muscle ACTIVATIONS. The lab's 🏃 button runs it: scrolling belt, body bob, muscles glow as they
  fire. `gait-proof.mjs` renders a headless walk strip. NB it *tracks* the kinematic gait (controller-driven),
  not a learned/emergent one; forward locomotion + balance (off-treadmill) are the next step.
- `muscle-proof.mjs` — `node biome/sprite/muscle-proof.mjs [ids…]` → SVG contact sheet (headless).

**Checkable result (the answer key):** muscle-less skeleton collapses (0/N joints); grown one STANDS
(44/44 across the deck, ~70 muscles incl. the whole spine); the trunk is LOAD-BEARING (remove axial muscles
→ collapse); a long poly-articular axial muscle EMERGES; auto-grow is COUPLED-feasible (Solve → stands);
deterministic. **Honest open items:** (1) walking is quasi-static (46–74% coverage — muscles sized for
standing only); next is inverse dynamics over the gait. (2) The dorsal-vs-ventral (epaxial/hypaxial)
*identity* of the load-bearing trunk muscles is the key thing to validate against real myology — the grower
picks whichever side aligns with its sign convention. (3) bi-articular limb muscles emerging from
volume-minimisation (hamstrings/gastrocnemius).
Modelling: it's a structural-equilibrium / redundancy-resolution solve (LP/NNLS), not continuum FEM; stays
2D sagittal for now (the math is vector-based so 3D is a later swap, not a rewrite).

Test: `muscle.selftest.mjs` (12 checks).

## The package it belongs to

Four surfaces, one cylinder. **game → [hoop](../hoop)** · **structure → [rind](../rind)** ·
**thermodynamics → [tide](../tide)** · **ecosystem → biome (you)**. biome is the volume inside
rind's shell; it shares the cylinder with tide (radius is altitude is temperature/humidity/CO₂).
The thermodynamic premise that makes the interior strange lives in tide; biome takes the
climate as a boundary condition. The thermo modules (atmosphere/fountain/systems) that used to
live here were split out to **tide** in the cylinder-refactor. Keep the "four wings" block and
footer cross-links in `index.html` working.

## Run / test (all run from the sandbox; deploy does not)

```bash
node biome/cycles/test/cycles.selftest.mjs        # 17 checks: conservation, food-web behaviour, determinism
node biome/cycles/test/allometry.selftest.mjs     # 13 checks: Kleiber scaling, calibration
node biome/cycles/test/roster.selftest.mjs        # 13 checks: real roster compiles, closes, conserves
node biome/cycles/test/linalg.selftest.mjs        # 15 checks: inverse + eigenvalues vs known spectra
node biome/cycles/test/stability.selftest.mjs     # 11 checks: stability verdict + decay cross-check
node biome/cycles/test/lake.selftest.mjs          # 20 checks: harvest conserves, both figures of merit, failure modes, stability
node biome/cycles/test/global.selftest.mjs        # 18 checks: union conserves, land↔lake coupling, interior closes, stable
node biome/cycles/test/maximal.selftest.mjs       # 14 checks: intermingled web conserves, every species persists, couplers bridge containers
node biome/gacha/test/gacha.selftest.mjs          # 13 checks: ECOSYSTEM GACHA engine — catalog, deterministic rolls, conservation, valid wiring, rarity spread
node biome/sprite/test/sprite.selftest.mjs        # 20 checks: SPRITE engine — classifier total, deterministic build/pose, finite geometry, mass→size
node biome/sprite/test/muscle.selftest.mjs        # 9 checks: MUSCLE solver — bare collapses, grown stands, antagonised, minimal, deterministic
node biome/cycles/test/builder.selftest.mjs       # 23 checks: presets compile/close/conserve/stable, validation, share codec, graceful failure
( cd biome/cycles/solver && cargo test )          # 6 checks: the Rust stability kernel
# or all the node tests at once:
for t in biome/cycles/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
```

The self-tests are the contract — run them before every push.

## Deploy

- Push `biome/**` on `main` or `claude/oneill-cylinder-refactor-xjknww` → `deploy-biome.yml`
  runs `wrangler deploy`. The sandbox cannot deploy; push and let the Action run. Verify the
  log binds `biome.mino.mobi (custom domain)` (the golden rule).
- **Stability wasm:** edit the Rust under `cycles/solver/` → `build-biome-solver.yml` rebuilds
  `cycles/solver/pkg/**`, commits it, and dispatches `deploy-biome.yml`. Don't hand-edit the
  committed `pkg/`.
- Ownership is in `deploy-registry.json` (surface `biome`). Edit the registry, then
  `node scripts/gen-deploy-triggers.mjs --write` + `node scripts/lint-deploy-registry.mjs`.

## The ecosystem gacha (`gacha/`) — live at `biome.mino.mobi/gacha` (Phases 0–1)

A procedural ecosystem **generator + viability oracle** that turns the trophic solver into a
roll-and-discover game (pattern borrowed from `/fable` + `/mappa`: seeded determinism → an oracle
scores → rarity emerges from the oracle, not RNG). Phase 0 (engine, fully sandbox-tested) is in:

- `gacha/prng.js` — the shared `xmur3→mulberry32` `Rand` (copied from fable/mappa/borges). A roll
  number `n` must reproduce the identical ecosystem for ever — the `/gacha/?n=<n>` permalink contract.
- `gacha/catalog.json` — ~150 real organisms ("the deck"), built by `node biome/gacha/build-catalog.mjs`
  (the build throttles + retries iNat lookups, so a big run still resolves ~all photos)
  (curated traits + iNaturalist photos). Each carries the traits the assembler needs: guild, mass_g,
  thermy, habitats[], producer growth params / per-guild starting biomass, flags (pollinator, harvestable).
- `gacha/sim/assemble.mjs` — `rollDesign(n, catalog)`: seed → a valid food web in the **builder's
  `design` shape**, wiring diets by **guild + body-size + habitat rules** (carnivores eat present
  animals in a prey-mass window; species spanning two habitats become couplers automatically), with
  prune-the-starvers + reject-and-reroll (salt 0..7). Output compiles through `builder.designToParams`.
- `gacha/sim/score.mjs` — `evaluateRoll(roll)`: runs `analyzeDesign` (closure + community-matrix
  stability) and returns one `interest` 0..100 + a rarity tier. **Rarity = VIABILITY** (closes · persists ·
  stable · fed · air · robust · crew carried), minus degeneracy penalties (collapse/monoculture/runaway).
  Legendary = a self-closing, stable, crew-carrying world. (Axis chosen by the user; not "interestingness".)

- `gacha/index.html` — the **page** (Phase 1): a ROLL button → reveal → the rolled web drawn in a
  habitat-clustered force graph (photo nodes sized by biomass, shared pools in the centre) + a
  collectible **card** (rarity foil + stars, procedural name, the viability readout, the species cast).
  `⛏ Hunt a gem` searches the seed-space forward (budgeted, yields to the UI) for an Epic+. Every roll is
  a permalink `/gacha/?n=<n>` (deterministic). Pure client-side; wrapped in the same `#err` overlay as
  `/graph`. The worker normalises no-slash `/gacha` → `/gacha/`.

Roadmap: ✅ Phase 0 (engine) · ✅ Phase 1 (page). Next: Phase 2 = filters + an Atlas gallery of the
best seeds (move the hunt to a Web Worker if it janks); Phase 3 = keep/publish pulls to PDS
(`com.minomobi.biome.ecosystem`) + OG cards; Phase 4 = automated iNat+GloBI harvest to deepen the deck.
Calibration TODO: confirm Legendaries (≥88) are reachable across a big sweep and tune the tier bands.
NB the gacha runs the box model at dt=3h (fast, interactive) — conservation is exact by flux
construction. As the deck grew (~150 organisms), dense random rolls can be too stiff for the explicit
integrator at that coarse step: the run overshoots into a numerical blow-up (negative biomass, CO₂ →
~1e10 ppm). We do NOT chase these with a finer step (one run is ~1s; the dt a stiff web needs is ~12s
— too slow for the reveal). Instead `evaluateRoll` (score.mjs `blewUp`) detects the blow-up and scores
it honestly as a **runaway** (rarity = viability, and an un-integrable web isn't viable), sanitising
`last` so the biomass graph never renders a negative/NaN node. The self-test still proves element
conservation at a step where the integrator is stable (dt=0.1h) and asserts no scored roll diverges.

## Invariants — do not break

1. **Conservation by construction.** Carbon, hydrogen, oxygen and nitrogen conserve no matter
   how many trophic levels stack (drift < 1e-9 over a model-year). Every ecological interaction
   is a carbon transfer or the canonical respiration reaction. Don't add an organism or edge
   that leaks an element — the self-test will catch it.
2. **The food web is data, not code.** Organisms and relationships are arrays; the derivative
   loops over them. Adding a species is a stat block + an edge, never per-organism code.
3. **The stability lab is JS-first.** `linalg.mjs` is the guaranteed in-browser path; the Rust
   kernel is an optional accelerator. The lab must work without the wasm.
4. **Pure static.** No D1/DO/secrets; the worker just serves assets + `/health`. New "endpoints"
   are pages (like `cycles/lake.html`), not server routes.
5. **Harvest conserves like everything else.** The animal `harvest` field on cycles.mjs (used by
   the lake to land fish in the food store) is a paired carbon transfer — biomass C → food C, the
   exact twin of a producer's `harvestIndex`. Communities without it are byte-for-byte unchanged
   (the lake self-test proves both). Don't add a yield path that bypasses a tracked pool.
6. **Land and lake are trophically disjoint by design.** The global web (global.mjs) unions the two
   rosters; they couple only through shared abiotic pools (air, N, detritus, larder), never through a
   cross-web trophic edge. That's the model's coupling thesis, not a missing edge — don't "fix" it by
   wiring a land animal to a lake species unless you mean to (and update the self-test if so). The
   only barrier between the webs is spatial, and this box model is non-spatial on purpose.
7. **The builder's stat-block defaults must never clobber an explicit value.** `normalizeSpecies`
   (builder.mjs) fills missing fields, but `count` defaults only when neither `count` nor `initBio`
   is given — otherwise it would override a decomposer's `initBio` (via makeAnimal's count-wins rule)
   and collapse the web. The builder self-test pins this (springtail initBio 20000). The share codec
   (`encodeDesign`/`decodeDesign`) is a public contract — a shared link is a saved design — so keep it
   backward-compatible (additive fields only); the self-test round-trips every preset.
