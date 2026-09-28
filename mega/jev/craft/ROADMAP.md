# craft — what Minecraft has that we don't, and what to build next

An audit of jevcraft against Minecraft (Java, 1.21), written 2026-09-28. For each
system: what Minecraft has, what we have, and what building it here would test.
The last column is the point. This game exists to measure a decision model (Jev)
choosing among macros that a planner writes. A feature earns its place by
making a decision harder, a measurement sharper, or a long run possible, not
by being in Minecraft.

Status: **have**, **partial**, **missing**. Size: S (a session), M (a few), L
(a programme).

## What we have that Minecraft doesn't

Worth keeping in view, because the roadmap should build on these rather than
flatten them:

- **Any of foam's ten tilings as the ground.** Every lateral rule runs on the
  tile graph: walking, reach, tree crowns, ore veins, houses, portals, mine
  layouts (a connected dominating set is the tiling's own "tunnel every third
  block").
- **An ecology written in tile shapes.** A moonpetal grows only on the rarest
  shape, a starbloom only on a tile whose neighbours all differ from it.
- **Headless and deterministic.** The same seed and policy give a byte-identical
  stream, so every experiment is repeatable and every claim has a number.
- **A typed decision layer.** Options carry computed facts: project, survival,
  wear, what they yield. There's also a way out (the bail) that feeds a planner.

## The audit

### World

| Minecraft | here | status | what it would test |
|---|---|---|---|
| infinite world, streamed in chunks | islands of radius 28 / 44 / 64 (≤ ~16k columns) | partial | explore stops saturating; long projects stop running out of world. Periodic tilings are infinite for free; Penrose needs the pentagrid. **L** |
| height 384 (y −64…320) | 40 layers | partial | the travel findings (stairs ≈ shafts here) hinge on depth. At 120+ layers, shafts, drops and rails start to matter. **S** to raise, **M** to rebalance |
| ~60 biomes | 7 world kinds, `mixed` blends them by region | partial | biome-specific resources force travel and trade-offs. **M** |
| noise caves, ravines, aquifers | worm caves (`caverns`), lava pockets, flooding caves | partial | — |
| structures: villages, mineshafts, dungeons, temples, strongholds, fortresses, bastions, ancient cities | none | missing | exploration with a payoff, not just seen-%. Strongholds gate the End. **M–L** |
| weather: rain, thunder, snow | none | missing | a changing state that options must read (rain puts out fire, thunder spawns). **S** |
| day 20 min, moon phases | day 4800 ticks (20 min at 4 ticks/s), no moon | have | — |

### Blocks and materials

| Minecraft | here | status | what it would test |
|---|---|---|---|
| ~1000 blocks | 48 | partial | most don't matter to decisions; the ones below do |
| saplings; trees regrow; leaves decay | trees are finite; leaves never decay | **missing** | **wood runs out on a long run** (seen: `gather_wood: no reachable tree`, 120+ times). A renewable base is the precondition for 10-day runs. **S** |
| gravel/flint, clay, snow, ice, cactus | none | missing | flint & steel (the real portal lighter), bricks. **S** each |
| gold, copper, lapis, redstone ore, emerald | coal, iron, diamond, quartz | partial | more ore types make mining choose. Redstone and lapis gate automation and enchanting. **S** |
| stairs, slabs, fences, gates, panes | none | missing | building with cheaper materials; fences pen animals (breeding). **S** |
| decorative stone variants, deepslate | none | missing | low value here |

### Tools, items and combat

| Minecraft | here | status | what it would test |
|---|---|---|---|
| pick / shovel / axe / sword / hoe in wood → netherite | pick, shovel, axe, sword in wood → diamond; wooden hoe only | have (no gold, netherite; one hoe) | — |
| durability, repair (anvil, crafting two together), mending | durability, spares, a reserve rule; no repair | partial | repair is the durability sink a long run needs. **S** |
| enchanting (XP, lapis), books | none | missing | a spend-now-or-save decision (XP) that Jev reads. **M** |
| bow, arrows, crossbow, trident; shield | melee only; armor as one abstract piece | missing | ranged threats need ranged answers or cover; a shield is a timing choice. **M** |
| armor slots (helmet … boots) | one "armor" item, 40 / 60% | partial | fine as is |
| flint & steel, fishing rod, compass, clock, map | torch lights portals; none of the others | missing | a map is what a human uses to navigate; our planners use the seen set. **S** each |
| boats, minecarts, horses, elytra | walking, ladders, drops, portals | partial | transport is the long-run cost the mining experiments keep circling. **M–L** |
| death drops items where you fell, recoverable for 5 min | death wipes the inventory | partial | "go back for your stuff" is a classic risk decision. **S** |
| XP, levels | none | missing | feeds enchanting and repair. **S** |

### Mobs

| Minecraft | here | status | what it would test |
|---|---|---|---|
| zombie | zombie: chases on the graph, blocked by doors, burns in daylight | have | — |
| skeleton (ranged) | none | **missing** | a threat you can't answer by closing a door: cover, shields, reach. **M** |
| creeper (explodes blocks) | none | **missing** | breaks the sealed-house invariant: houses need repair, and "stay inside" stops being safe. Survival finally separates policies. **M** |
| spider (climbs walls) | none | missing | walls aren't enough; overhangs and lit ground are. **S** |
| enderman, drowned, witch, slime, phantom | none | missing | enderman gates the End (pearls); phantom punishes not sleeping. **S–M** each |
| cows, chickens (leather, beef, eggs, feathers → arrows) | pigs, sheep (wool, mutton, shearing) | partial | — |
| **breeding** (wheat, carrots…), baby animals | none | **missing** | renewable food and wool without roaming; pens on a graph. **S** |
| wolves (tame), cats, horses | none | missing | allies change survival maths. **M** |
| villagers, trading, iron golems, raids | none | missing | an economy: a second currency (emeralds) and a planning horizon. **L** |
| blaze | blaze: nether spawns, hits harder | have (no ranged fireballs, no blaze rods) | blaze rods → brewing, eyes of ender. **S** |
| ghast, piglin, wither skeleton, hoglin | none | missing | nether variety. **M** |
| ender dragon, wither | none | missing | a capstone fight for a team. **L** |

### Survival

| Minecraft | here | status | what it would test |
|---|---|---|---|
| health, hunger, saturation, regen when fed | health, hunger, regen at food ≥ 18; no saturation | partial | saturation separates good food from bad. **S** |
| drowning, fall damage, lava, fire | all but fire | partial | fire spread from lava and lightning, wooden houses burn. **M** |
| status effects, potions | none | missing | brewing is a long, branching recipe tree: a good project. **M** |
| sprint, jump, knockback, crits, attack cooldown | one tick per step, flat attacks | partial | **the movement cost model decides the transport experiments** (below). **S** |

### Crafting and processing

| Minecraft | here | status | what it would test |
|---|---|---|---|
| shaped recipes in a 3×3 grid | bags (a grid means nothing on a Penrose floor) | deliberate | keep |
| furnace fuel: coal smelts 8, a log 1.5, lava bucket 100 | one fuel per item | partial | fuel planning, charcoal loops. **S** |
| smoker, blast furnace, stonecutter, loom, anvil, grindstone, smithing, brewing stand, enchanting table | crafting table, furnace | missing | each is a station that turns a resource into a choice. **S–M** each |

### Farming

| Minecraft | here | status | what it would test |
|---|---|---|---|
| wheat, carrots, potatoes, beetroot, pumpkin, melon, sugar cane, cocoa, nether wart | 5 species, 3 of them bound to tile shapes; water bonus; light rules | have (different, and richer on the graph) | — |
| bone meal, composter | none | missing | a speed-up worth spending on. **S** |
| sugar cane → paper → books | none | missing | enchanting's feedstock. **S** |
| skipped nights don't grow crops | same | have | the moonpetal trade-off: sleep, or stay up for it |

### Automation (redstone)

| Minecraft | here | status | what it would test |
|---|---|---|---|
| redstone dust (15 blocks, signal decays), torches, repeaters, comparators | none | **missing** | **a natural fit for a graph**: signal strength decays by hop along tile adjacency, and a circuit's shape depends on the tiling. **L** |
| levers, buttons, pressure plates, observers | none | missing | — |
| pistons, sticky pistons | none | missing | moving blocks is a new kind of action. **M** |
| hoppers, droppers, dispensers | none | missing | **item pipes: chests that fill themselves.** Automation is a macro made physical, and it outlasts the player. **M** |
| rails, powered rails, minecarts | none | missing | transport that beats walking on long runs. **M** |
| auto-farms (water, observers, pistons) | none | missing | the ultimate S2 test: design a machine, not a macro. **L** |

### Dimensions

| Minecraft | here | status | what it would test |
|---|---|---|---|
| nether: 8 : 1 scale, fortresses, bastions, nether wart, ghasts, piglins | nether 1 : 1 (tile c is tile c), glowstone, quartz, blazes | partial | 8 : 1 makes nether highways a transport choice, and needs a big overworld to mean anything. **M** once the world is big |
| the End: strongholds, eyes of ender, the dragon, end cities, elytra | none | **missing** | **Minecraft's finish line**, and the natural capstone project: pearls (endermen) + blaze powder → eyes → find a stronghold → a team fight. **L** |

### Building

| Minecraft | here | status | what it would test |
|---|---|---|---|
| free building, any shape | houses as graph blueprints (interior ball, wall ring), proven sealed by a mob path search; doors, glass, beds, chests, trapdoors, ladders | have (different: provable) | — |
| stairs, slabs, fences, colours, signs, item frames | none | missing | art with no oracle (the operator's idea): is there a measurable aesthetic on a tiling? **M** |

### People and play

| Minecraft | here | status | what it would test |
|---|---|---|---|
| multiplayer | co-op (you + Jev), a 3-Jev swarm, a shared chest, requests, sleeping together | have | — |
| advancements (~120 goals) | 3 projects: tech (16–17 steps), grow, explore | partial | advancements as a long, branching project tree: the project fact at scale. **S** |
| chat | typed asks between agents | have (typed, by design) | — |

## The research gaps (not Minecraft, but what this game is for)

These matter more than any single feature:

1. **The planner loop.** Goals and the bail log → System 2 writes a macro →
   check it headlessly → add it → rerun on held-out worlds. The hooks exist
   (`sim.escalate`, `sim.bails`, the palette as data). The loop doesn't, and it
   spends model budget.
2. **A macro surface a planner can write safely.** Today macros are JS with the
   whole engine in scope.
3. **A held-out scoreboard on current code.** The last live scoreboard predates
   the nether, the team, tools and durability.
4. **Survival that separates deciders.** It hasn't, since round two: the
   scripted baseline doesn't die. Creepers, skeletons and item-drop-on-death are
   the cheapest fixes.
5. **Movement costs.** Every step costs one tick, a staircase step included, so
   stairs are as fast as ladders here (see the access experiment). Minecraft's
   costs (sprinting on the flat, slower climbing, instant falls) would change
   every transport result. Worth deciding before rails.
6. **Human play data.** The segmenter reads a saved stream back as episodes; no
   human game has been recorded yet.

## Roadmap

Ordered by what each phase unlocks, not by size.

**Phase 0: the harness (now).** A held-out scoreboard on current code;
a movement-cost decision (flat steps 1, climbing 2, falls free?) re-measured
against the life sweep; one planner-loop round on one goal (iron armor from
scratch).

**Phase 1: a world that renews.** Saplings and regrowing trees, leaf decay,
cows and chickens, **breeding** and fences, fuel values (coal smelts 8), items
dropped on death and recoverable, saturation. *Unlocks: 10-day runs that don't
starve. Measure: a 10-day life sweep.*

**Phase 2: threats that need different answers.** Skeletons (ranged), creepers
(blocks destroyed, houses need repair), spiders (climb walls); bow and arrows,
shield. *Unlocks: survival that separates policies, the gap open since round two.
Measure: deaths and damage across deciders at the same difficulty.*

**Phase 3: resources and tiers.** Gold, redstone ore, lapis; XP and levels;
anvil repair; enchanting; smoker and blast furnace. *Unlocks: durability sinks
and a spend-or-save currency. Measure: Jev's choices with XP on the menu.*

**Phase 4: automation on a graph.** Redstone dust with hop-decay along tile
adjacency; levers, buttons, plates; hoppers between chests; pistons; rails and
minecarts. *Unlocks: machines that outlast the player, the physical form of a
macro. Measure: can System 2 design an auto-farm on Penrose?*

**Phase 5: the End.** Strongholds (the first structure), endermen and pearls,
blaze rods and powder, eyes of ender, the End, the dragon as a team fight.
*Unlocks: Minecraft's finish line as the capstone project.*

**Phase 6: people.** Villages, villagers, trading with emeralds, iron golems.
*Unlocks: an economy with a second currency.*

**Phase 7: an infinite world.** Chunked generation on the periodic tilings,
the pentagrid for Penrose; the nether at 8 : 1; structures scattered to find.
*Unlocks: exploration that never saturates, and transport that matters.*

Phases 1 and 2 are the next ones worth doing. Both are cheap, and each closes a
gap that has shaped the measurements so far: things run out on long runs, and
the scripted player doesn't die.
