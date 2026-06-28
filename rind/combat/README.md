# rind/combat — combat depth sandbox (vendors into hoop's arena)

A standalone tooling sandbox for deepening hoop's turn-based combat (`hoop/v098/arena/`) **without
touching hoop's deploy surface**. Built here on the rind branch because rind is pure-static and
node-test-friendly, and hoop already vendors *from* rind (`wayfind.js`) — so the same discipline
applies in reverse: build + tune here, then **vendor the matured kernel into hoop**.

The modules here are a workbench. The **playable surface** built on them is `rind/brawl/`
(`rind.mino.mobi/brawl`) — pick a faction, the encounter generator + oracle summon a certified-winnable
fight scaled to your hero, and you brawl on the continuum. `combat/dojo.html` is the developer tuner.
Both are served as static assets by rind's worker (no worker change needed); they ship with rind's
normal deploy (`deploy-rind.yml` on `main` or the rind owning branch touching `rind/**`).

## What's here

| File | Role |
|---|---|
| `engine.js` | The turn-based combat engine, v2 — forked from `hoop/v098/arena/engine.js` and deepened (factions, verbs, status effects, flanking, turn cap). **This is the artifact to vendor back.** Pure + seeded. |
| `factions.js` | The three faction combat styles as tunable data (passive, kit, cost discounts, AI archetype). |
| `stats.js` | **Copied** from `hoop/v098/stats.js` (one import path repointed to `./prng.js`). The FLESH·CHASSIS·ANIMA stat spine. |
| `prng.js` | **Copied** from `hoop/v098/sprite/item/prng.js`. Seeded RNG. |
| `sprite-core.js` · `crew.js` | **Vendored** pixel-actor engine (sprite genome → `frameRects` → rects). Renders the `/brawl` actors; the sprite set grows upstream — re-sync, don't fork. |
| `balance.mjs` | The headless balance harness — many seeded AI-vs-AI battles per faction matchup → a win/draw/TTK matrix. The reason the sandbox exists. |
| `solver.js` | The **solvability oracle** (fable/forge analog) — searches the deterministic combat tree vs the AI to certify a player party can win, with par + margin + a difficulty grade. |
| `encounter.js` | **Encounter generator** — given a hero (stat + equipment block), summons a foe roster (+ terrain) the oracle certifies is winnable-but-not-trivial at a target difficulty. |
| `encounter.mjs` | CLI: roll a hero, print a generated fight at one or all difficulties. |
| `dojo.html` | A visual tuner — pick factions + party sizes, roll a seed, step turns or auto-play, watch the log. |
| `../test/combat.selftest.mjs` | 45 invariants (determinism, kits, legality, every verb incl. multi-agent, terrain/LoS/hazards, passives, termination). |
| `../test/solver.selftest.mjs` | 13 invariants (determinism, easy-solvable, hard-unwinnable, det-mode math, grading, terrain). |
| `../test/encounter.selftest.mjs` | 10 invariants (winnable-not-trivial, determinism, difficulty ordering, equipment feeds in, terrain). |

`stats.js`/`prng.js` are **vendored copies** (the fork-engine-copy-stats decision): the sandbox stays
fully standalone and node-testable. If hoop's spine changes, re-sync these — don't let them drift.

`sprite-core.js` + `crew.js` are likewise **vendored** (from `hoop/v098/v3/sprite-core.js` + `hoop/v098/crew.js`,
themselves vendored from the Sprite Lab at `mega.mino.mobi/sprite`). They render the **pixel actors** in
`/brawl` (`crewSprite(seed, role)` → genome → `frameRects(g, dir, phase)` → drawable rects). The sprite
*set* is grown upstream (more heads/items/roles in sprite-core); **re-sync these two files** to pick up
the expanded set — don't fork them here.

## Run

```bash
node rind/test/combat.selftest.mjs          # 38 invariants (must be green before vendoring)
node rind/combat/balance.mjs                 # the matchup matrix (300 battles/cell)
node rind/combat/balance.mjs --n 1000        # tighter numbers
node rind/combat/balance.mjs --party 2       # NvN party battles (multi-agent path)
node rind/combat/balance.mjs --terrain       # scatter walls + hazards into every battle
node rind/combat/balance.mjs --pair drift:rindwalker   # one matchup, verbose
node rind/combat/balance.mjs --csv           # machine-readable
node rind/test/solver.selftest.mjs           # the solvability oracle invariants
node rind/test/encounter.selftest.mjs        # the encounter-generator invariants
node rind/combat/encounter.mjs --all         # generate a fight at every difficulty for a rolled hero
open rind/combat/dojo.html                    # the visual tuner (party sizes, step/auto-play)
```

### Encounter generation (`encounter.js`)

```js
import { generateEncounter, describeEncounter } from './encounter.js';
const hero = { faction: 'drift', character, weapon, armour };       // stat block + equipment
const enc = generateEncounter(hero, { difficulty: 'fair', seed: 3, terrain: true });
// enc.setup → ready for createBattle / solveCombat ; enc.grade → {solvable, par, margin, tier}
```

Difficulty is a **target band on the oracle's margin** (hero HP fraction left at an optimal win):
`trivial`(≥70%) · `comfortable`(50–70) · `fair`(30–50, the "winnable but not trivial" default) ·
`tight`(15–30) · `brutal`(2–15). The generator rolls a foe roster (+ optional terrain) scaled by a
single `threat` dial and runs a **feedback controller** — grade with the oracle, nudge threat up if the
fight came out too easy / down if too hard, re-roll — converging in a handful of oracle calls. The
admitted fight is the one the oracle certifies lands in-band. Equipment feeds in via `deriveCombat`
(weapon/armour), so a better-geared hero is met with a tougher roster to hold the same difficulty.

**Limitation:** very tanky heroes (a chassis-heavy Continuant that out-sustains) have a *narrow or empty*
tight/brutal window — the foes hard enough to chip it to 15–30% also tend to kill it — so the controller
returns the closest winnable fight it found with `ok:false` instead of an in-band one. A bisection /
multi-axis (foe-count × power × terrain) search would reach more of those; single-axis threat is v1.

### The solvability oracle (`solver.js`)

```js
import { solveCombat, gradeEncounter } from './solver.js';
// can the player party beat this AI, played well?
solveCombat({ player, allies, foes, seed });   // → { solvable, par, margin, nodes, capped }
gradeEncounter({ player, foes });              // → adds tier: comfortable|fair|tight|brutal|impossible|unknown
```

`par` = player decisions to the win (≈ optimal, via BFS by ply). `margin` = player HP fraction left at
the win (comfort). `capped` = hit the node budget → inconclusive, never a false "unwinnable". It runs the
engine in **deterministic mode** (`det:true`: every blow lands for its expected value) and treats the
foe as the deterministic AI, so the search is single-agent (forge-style) and reproducible — the same
encounter always grades the same. This is the loop encounter design runs on once boards/parties make
hand-tuning impossible.

## The faction styles (the headline content)

Each Tabard faction is one triad domain turned into a way of playing the board:

| Faction | Domain | Style | Passive | Signature kit |
|---|---|---|---|---|
| **Continuant** | CHASSIS | attrition, control, **party support** | tougher while holding station, counters when braced, steady flux | `bulwark` (guard + counter), `rivet` (pin), `mend`, `summon`, `revive`, `assist` |
| **Drift** | ANIMA | tempo, trickery, **ranged + AoE** | +2 move, hit-and-run crit, flux regen (flux-native) | `lance` (ranged magic), `blast` (AoE), `agglomerate` (gravity knot), `flit`, `feint`, `siphon` |
| **Rindwalker** | FLESH | risk & resilience | hits harder the more hurt it is (berserk), regen each turn | `gore` (bleed-for-power), `adrenal` (HP→Flux), `scavenge` (deep heal) |

Verbs over the v1 arena (`strike/overclock/mend/harden`): **brace** (guard + counter), **flit**,
**feint/rivet** (control), **gore**, **adrenal**, **siphon**, **scavenge**; the **multi-agent & range**
set — **lance** (ranged magic), **blast** (AoE), **agglomerate** (pull units together), **summon** (add
an allied drone), **revive** (raise a downed ally), **assist** (give an ally an extra turn); plus
**status effects** (bleed · stun · mark · slow), **flanking** (melee pincer bonus), and a **turn cap**
that resolves a stalemate by held HP. Magic verbs scale off **`apow`** (anima spell power), the spine
fix that gives anima a real offense.

## Balance state (run the harness for live numbers)

The harness drove the system from a strict **ladder** (rindwalker ≫ continuant ≫ drift, drift losing to
everyone) to a real **rock-paper-scissors triangle**, via two changes the harness pointed straight at:

1. **Anima had no offense** (structural). `deriveCombat` tied attack to `servo` (a *chassis* attr), so a
   pure-anima **Drift** couldn't deal damage. Fix: added **`apow`** (anima spell power = f(cogit, core,
   flux)) to `deriveCombat`, and a ranged magic verb (`lance`) + AoE (`blast`) that scale off it. **This
   `apow` line must flow back into `hoop/v098/stats.js` when vendoring** (see below).
2. **Drift ran its flux dry mid-kite** (tuning). Fix: `fluxRegen: 2` on Drift's passive.

The **continuum move re-tuned this** — geometry changed the fights, and the harness drove it back to a
playable spread (no faction 's overall win-rate outside ~44–55%): **continuant > drift** is the clean
edge, **drift ↔ rindwalker** and **rindwalker ↔ continuant** are near-coinflips. Two continuum findings:

- **A kiter's ranged attack must out-distance the pursuer's reach+move, or the kite collapses.** On the
  bigger board Drift's `lance` at range 3 left a razor-thin safe zone (a faster rindwalker closed from
  lance-range into melee in one move); bumping `lance` to **range 5** restored the kite. A pure geometry
  fact the grid hid.
- **AoE scales superlinearly with party size** (`--party 2`): Drift's `blast` makes it markedly stronger
  at 2v2 than 1v1. Encounter design must account for this.
- **Terrain needs navigation, not just geometry** (`--terrain`): with walls in play, straight-line
  movement stalled the AI and draw rates spiked to ~70%. Adding *local deflection* to `moveToward` (round
  the wall) pulled draws back to baseline and kept the triangle intact — but dense terrain would still
  need real pathfinding (see roadmap).

Tuning levers live in `factions.js` (move/crit/berserk/regen, kit, discounts) and the `engine.js` skill
table (mults, costs, ranges, status durations). The harness is the feedback loop.

## Roadmap — the larger arc (design intent)

The sandbox is being grown toward a deeper game. Shipped: faction styles, the multi-agent verb set
(summon/revive/assist/blast/agglomerate), range (lance), the AI archetypes, the **solvability oracle**
(`solver.js`, the fable/forge analog below), and the **continuum board** (Euclidean positions, free-disk
movement, radii ranges, body collision — `dist`/`moveToward`/`canReach` replaced the old grid layer).
Also shipped: **terrain** — circular **walls** (block movement + line-of-sight) and **hazard fields**
(`burn`/`mire`/`emp`, applied at turn start). Ranged/area verbs need a clear shot (`hasLoS`); melee and
ally-support ignore LoS. `scatterTerrain(seed)` lays a deterministic field; `createBattle({terrain})`
takes it; the oracle and balance harness honour it for free (it's all in the shared engine). Still ahead:

- **Oracle v2.** Today `solver.js` searches a bounded macro-action menu against the AI, quantizing
  continuous positions (`Q`) to dedup. Next: real expectiminimax (robust to RNG, not just expected
  value) and a **fragility** read (what fraction of lines lose). *(Encounter generation — shipped, see
  `encounter.js` above. Next for it: bisection/multi-axis search for tanky heroes, and minting the n-th
  encounter as a permalink the way forge mints the n-th puzzle.)*
- **Smarter terrain navigation.** `moveToward` does *local* obstacle deflection (rounds a wall), not
  full pathfinding — fine for scattered cover, but a maze would still stall the AI. A nav layer (visibility
  graph / A* over the free space) is the next step if terrain gets dense.
- **Elevation / decks**, line-of-sight *cover bonuses* (partial), and **skill trees** (seeded from
  `CONVERSIONS`, unlocking kit verbs + passives, gated by items/narrative).
- **Skill trees.** The `CONVERSIONS` in `stats.js` are the seeds; unlocks gate via items + narrative
  (the existing progression model). A tree would unlock kit verbs + passives per faction.
- **Range/terrain depth.** Cover, hazards, elevation (decks), line-of-sight for ranged attacks.

## Vendoring back into hoop (when ready)

1. Get `combat.selftest.mjs` green and the balance matrix where you want it.
2. **Port the `apow` line into `hoop/v098/stats.js`'s `deriveCombat`** (the anima-offense spine fix) —
   without it the vendored engine's magic verbs do ~0 damage.
3. Copy `engine.js` + `factions.js` into `hoop/v098/arena/` (engine.js replaces the v1; repoint its
   `./stats.js` import to `../stats.js`). Keep `stats.js`/`prng.js` here as the sandbox's own copies.
4. Wire `factions.js` into `arena/battle-ui.js` (faction picker, skill buttons from `skillsFor`,
   target/ally/downed selection for the new verbs).
5. Add a `hoop/test/arena.selftest.mjs` mirroring the invariants here.
