# PRODUCTION.md — turning the everything factory into a game of production

The v106 deck has functions and material moving between them, but no player role in their
functioning. This memo is the design brainstorm for that role. Constraint set: deterministic and
inference-free (the borges discipline), oracle-scored (the econ/forge lineage), verbs-as-fixtures
(the errand pattern), and **the map is the mechanic** (the weave's topology should BE the gameplay,
not a backdrop behind menus).

## The load-bearing observation: the player is the only free thread

Everything else in the factory is topology-bound. A droid rides ONE thread. Material crosses
threads only at the antechambers, slowly, along the rings. The white-collar ops can *see* the whole
factory (that's their job) but *live* only in the white threads. **The player is the only entity
that walks the entire weave** — every K-crossing, both rings, both nexuses. So the player's
production role should be exactly that: **the factory's one free variable.** Not a machine
operator (machines run themselves), not a manager screen (we have solvers for that) — the
*circulating agent* that the steady-state solve cannot express. Every idea below is a variation on
this.

## The Shift — one loop, three verbs, one oracle

Proposal: a work loop called **the shift**, with three tiers that mirror the game's triad
(body · craft · mind), all scored by ONE oracle — the upperrind econ solver
(`rind/upperrind/econ.js`: demand→run-rate back-prop, gating populations, closure, keystone,
vitality tier). The deck's *vitality* (Thriving · Healthy · Stable · Fragile · Failing) becomes the
season score and, crucially, the deck's ambient mood — the player feels production because
production is the weather.

### 1. HAUL (body) — the wage table is the router

The dispatch thread (Drift's white-collar role) posts **manifests**: carry N crates of a commodity
from hall A's antechamber to ring/hall B. The player physically carries them (the Voronoi
inventory already exists; commodities wear their producer's colour, the upperrind convention).

The elegant part: **pay is priced by weavenav.** The wage of a haul is literally proportional to
its route's crossing count — the router IS the wage table. A 2-crossing pair-hop pays little; a
6-crossing rim-to-core relay pays well. No tuning table to rot; the topology prices its own labor.

Why hauls exist in-fiction: the rings move bulk slowly (the loop is long); a *priority* packet —
the reagent a stalled hall is starving for — needs a thread-crosser. Droids can't. You can.

### 2. FIX (craft) — the seeded fault stream + the six lenses

A deterministic per-seed **fault stream** (mulberry over world-day) perturbs the solve: a hall
starves, an antechamber jams, a ring segment backs up, a reclaimer underruns (the Biosphere-2
failure — scrap visibly piles at the rim). Each fault is visible three ways:

- **physically** — conveyors stop, the flux floor dims, droids idle in a queue at the jammed door;
- **economically** — the solver re-runs with the faulted rate and the vitality tier moves;
- **socially** — the responsible white thread posts a work order (the errand pattern, factory-grade).

Diagnosis is the gameplay of information, and it uses the topology the user built: **each white
thread is one LENS** on the same factory (forge/micro's WHITE_COLLAR roles: perfusion-watch ·
dispatch · scheduling · gate-control · telemetry · inventory). Perfusion sees *where flow is thin*;
inventory sees *what's piling*; telemetry sees *which machine reads wrong*. No single lens
localizes a fault — cross-referencing two or three does. That is the murder-mystery loop
(mystery.js), industrialized: clues live on different threads, and *walking between them is the
weave-navigation game we just built waypoints for.*

The repair itself is the afflicted hall's **family minigame** (one per engine topology, the
arcade/gauntlet precedent): foundry (star) = timing the pours · mill (path) = resequencing ·
chemworks (cycle) = rebalancing the loop · fab (dag) = rerouting · weave (comb) = pattern repair ·
fluid (flow) = valve pressures · reclaim (fan) = sorting. Each repair tallies planetary alignment
(mars for the foundry, etc.) — the factory feeds the character sheet.

### 3. STEER (mind) — two dials on two rings, consequences both directions

The player earns govern-verb access to exactly TWO dials, one per ring — few dials, real
consequences:

- **The assembly ring sets the PRODUCT MIX** — what rides the NX lift up to the nave: tools vs
  consumables vs fixtures. This feeds the nave economy the player already lives in: smithy
  material prices, shop stock, garden fertilizer. The deck becomes the *supply side of screens the
  player already uses* — the strongest possible "feel", because production changes their own
  buying life upstairs.
- **The reclaim ring sets the RECLAIM PRIORITY** — which commodity's loop closes first. Starve it
  and the closure law (`reclaimCap ≥ wearDemand`) breaks per-commodity: scrap mountains render at
  the rim, and the shortage propagates up as nave prices.

The keystone-press machinery in econ.js is the drama generator: whatever valve the solver names
keystone *this season* is the story ("the fluid hall is the city's kidney this month") —
deterministic per seed, provable like the quest oracle, zero authored content per season.

## Ambient first (the cheap wins, in order)

Before any mechanic ships, the deck should *show* production — most of this is tested code in
`rind/upperrind/app.js` waiting to be ported into the game skin:

1. **Droids hauling coloured commodities** along the rings and halls (`nextHaul`), density ∝ the
   solver's run-rates — a healthy factory bustles, a Failing one stands still.
2. **Conveyor runs + machine bays** in the halls (`machinehall.js`) so the eight processes read as
   eight processes.
3. **The flux floor** (`fluxfield.js`) per thread — the flavour layer that makes fourteen floors
   read distinct.
4. **Scrap piles at the rim / empty shelves at the core** as the closure readout — the oracle
   rendered as set dressing.

## The topology tricks worth keeping

- **The hall shortcut.** weavenav found white→white is 4 crossings via the ring *or* via
  interface→hall→interface — distance decides. Make the choice mean something: the ring is the
  safe corridor; cutting through a hall is shorter but crosses a live shopfloor (hazard pulses on
  the conveyor lanes, or a foreman drafts you into a micro-errand). Corridor vs. shopfloor is a
  real traversal decision, purely from the topology.
- **The antechambers are the marketplaces.** They're the only places two threads touch — natural
  spots for handoff contracts (leave crates, droids collect), the physical form of the K-contact.
- **NX/ND asymmetry.** Product up through the top nexus, waste down through the bottom — hauls and
  faults should respect the gradient, so the player internalizes rim=entropy, core=order.

## Sequence

ambience (1–4 above) → HAUL (needs only manifests + inventory + weavenav pricing) → FIX (fault
stream + lenses + one minigame, then grow the family) → STEER (dials + nave price coupling).
Each stage is independently shippable and oracle-scored from day one.
