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
| gold, copper, lapis, redstone ore, emerald | coal, iron, diamond, quartz, gold, redstone, lapis (world v4) | **have** (phase 3; no copper, emerald) | — |
| stairs, slabs, fences, gates, panes | fences and gates (pens) | partial (fences done) | stairs and slabs: building with cheaper materials. **S** |
| decorative stone variants, deepslate | none | missing | low value here |

### Tools, items and combat

| Minecraft | here | status | what it would test |
|---|---|---|---|
| pick / shovel / axe / sword / hoe in wood → netherite | pick, shovel, axe, sword in wood → diamond; wooden hoe only | have (no gold, netherite; one hoe) | — |
| durability, repair (anvil, crafting two together), mending | durability, spares, a reserve rule; anvil repair with the tool's material, dearer each time | **have** (phase 3; no two-tool combining, no mending) | — |
| enchanting (XP, lapis), books | the table, bookshelves (power), three offers per item, efficiency / unbreaking / fortune / sharpness / power / protection | **have** (phase 3; no enchanted books) | Jev's choices with XP on the menu: not measured yet |
| bow, arrows, crossbow, trident; shield | bow, arrows, shield (no crossbow, trident) | **have** (phase 2) | — |
| armor slots (helmet … boots) | one "armor" item, 40 / 60% | partial | fine as is |
| flint & steel, fishing rod, compass, clock, map | torch lights portals; none of the others | missing | a map is what a human uses to navigate; our planners use the seen set. **S** each |
| boats, minecarts, horses, elytra | boats, minecarts on rails (2 tiles a tick), ladders, drops, portals | partial (no horses, elytra) | — |
| death drops items where you fell, recoverable for 5 min | the same: items on the ground, `recover`, `collect` | **have** (phase 1) | — |
| XP, levels | Minecraft's curve; from ores, kills, breeding, smelting; some dropped on death | **have** (phase 3) | — |

### Mobs

| Minecraft | here | status | what it would test |
|---|---|---|---|
| zombie | zombie: chases on the graph, blocked by doors, burns in daylight | have | — |
| skeleton (ranged) | shoots from 7 with sight, backs off, burns by day; doors block its sight | **have** (phase 2) | — |
| creeper (explodes blocks) | hisses, blows holes in houses; `flee`, `repair_house` | **have** (phase 2) | survival spread less than hoped: see jev/CLAUDE.md |
| spider (climbs walls) | climbs 3, neutral by day | **have** (phase 2) | — |
| enderman, drowned, witch, slime, phantom | none | missing | enderman gates the End (pearls); phantom punishes not sleeping. **S–M** each |
| cows, chickens (leather, beef, eggs, feathers → arrows) | pigs, sheep, cows, chickens (no eggs) | **have** (phase 1) | — |
| **breeding** (wheat, carrots…), baby animals | feed two, a young one grows up; pens with gates; animals follow their food | **have** | — |
| wolves (tame), cats, horses | none | missing | allies change survival maths. **M** |
| villagers, trading, iron golems, raids | none | missing | an economy: a second currency (emeralds) and a planning horizon. **L** |
| blaze | blaze: nether spawns, hits harder | have (no ranged fireballs, no blaze rods) | blaze rods → brewing, eyes of ender. **S** |
| ghast, piglin, wither skeleton, hoglin | none | missing | nether variety. **M** |
| ender dragon, wither | none | missing | a capstone fight for a team. **L** |

### Survival

| Minecraft | here | status | what it would test |
|---|---|---|---|
| health, hunger, saturation, regen when fed | all four | **have** (phase 1) | — |
| drowning, fall damage, lava, fire | all but fire | partial | fire spread from lava and lightning, wooden houses burn. **M** |
| status effects, potions | none | missing | brewing is a long, branching recipe tree: a good project. **M** |
| sprint, jump, knockback, crits, attack cooldown | one tick per step, flat attacks | partial | **the movement cost model decides the transport experiments** (below). **S** |

### Crafting and processing

| Minecraft | here | status | what it would test |
|---|---|---|---|
| shaped recipes in a 3×3 grid | bags (a grid means nothing on a Penrose floor) | deliberate | keep |
| furnace fuel: coal smelts 8, a log 1.5, lava bucket 100 | coal and charcoal 8, planks 1, lava bucket 100, fuel credit | **have** (phase 1) | — |
| smoker, blast furnace, stonecutter, loom, anvil, grindstone, smithing, brewing stand, enchanting table | crafting table, furnace, smoker, blast furnace, anvil, enchanting table | partial (phase 3) | the loom, the grindstone, brewing. **S–M** each |

### Farming

| Minecraft | here | status | what it would test |
|---|---|---|---|
| wheat, carrots, potatoes, beetroot, pumpkin, melon, sugar cane, cocoa, nether wart | 5 species, 3 of them bound to tile shapes; water bonus; light rules | have (different, and richer on the graph) | — |
| bone meal, composter | none | missing | a speed-up worth spending on. **S** |
| sugar cane → paper → books | the same; cane grows 3 tall by water | **have** (phase 3) | — |
| skipped nights don't grow crops | same | have | the moonpetal trade-off: sleep, or stay up for it |

### Automation (redstone)

| Minecraft | here | status | what it would test |
|---|---|---|---|
| redstone dust (15 blocks, signal decays), torches, repeaters, comparators | dust decaying by hop on the tile graph, redstone torches (always on), repeaters, lamps; no comparators, no torch inversion | **have** (phase 4) | inverters and clocks on a tiling. **M** |
| levers, buttons, pressure plates, observers | all four | **have** (phase 4) | — |
| pistons, sticky pistons | pistons (push 12, straight on along the tiling; plants break and drop past) | partial (no sticky) | — |
| hoppers, droppers, dispensers | hoppers between chests and furnaces (input from above, fuel from the side), locked by power | partial (no droppers, dispensers) | — |
| rails, powered rails, minecarts | all three; powered rails placed by the cart's momentum arithmetic | **have** (phase 4) | — |
| auto-farms (water, observers, pistons) | a sugar-cane farm (observer, piston, wire, hopper, chest per plant), laid out by a site search on every tiling; an automatic smelter | partial (written by System 2 by hand, not designed by a planner) | the planner loop: design one from a blank sheet. **L** |

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

**Phase 1: a world that renews. DONE (2026-09-28; fences and pens after).** Saplings and regrowing trees, leaf decay,
cows and chickens, **breeding** and fences, fuel values (coal smelts 8), items
dropped on death and recoverable, saturation. *Unlocks: 10-day runs that don't
starve. Measure: a 10-day life sweep.*

**Phase 2: threats that need different answers. DONE (2026-09-28), boats with it.** Skeletons (ranged), creepers
(blocks destroyed, houses need repair), spiders (climb walls); bow and arrows,
shield. *Unlocks: survival that separates policies, the gap open since round two.
Measure: deaths and damage across deciders at the same difficulty.*

**Phase 3: resources and tiers. DONE (2026-09-28).** Gold, redstone ore, lapis; XP and levels;
anvil repair; enchanting; smoker and blast furnace. *Unlocks: durability sinks
and a spend-or-save currency. Measure: Jev's choices with XP on the menu.*

**Phase 4: automation on a graph. DONE (2026-09-28): the parts, and two machines written by hand.** Redstone dust with hop-decay along tile
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

Phases 1 and 2 are built, and the results are in jev/CLAUDE.md (§ A world
that renews, boats, and threats). Long runs no longer depend on finite stock,
but the baseline wasn't running out in 10 days anyway. Survival spreads a
little (random's deaths 13 → 24 at hard) and the sensible deciders still
barely die: a door now stops arrows too. So separating policies on survival
still needs a harder setting, or threats that get past a house. The next
phase worth doing is phase 0's held-out scoreboard on current code.
