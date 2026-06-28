# rind/combat — combat depth sandbox (vendors into hoop's arena)

A standalone tooling sandbox for deepening hoop's turn-based combat (`hoop/v098/arena/`) **without
touching hoop's deploy surface**. Built here on the rind branch because rind is pure-static and
node-test-friendly, and hoop already vendors *from* rind (`wayfind.js`) — so the same discipline
applies in reverse: build + tune here, then **vendor the matured kernel into hoop**.

Nothing in this directory deploys. It's a workbench.

## What's here

| File | Role |
|---|---|
| `engine.js` | The turn-based combat engine, v2 — forked from `hoop/v098/arena/engine.js` and deepened (factions, verbs, status effects, flanking, turn cap). **This is the artifact to vendor back.** Pure + seeded. |
| `factions.js` | The three faction combat styles as tunable data (passive, kit, cost discounts, AI archetype). |
| `stats.js` | **Copied** from `hoop/v098/stats.js` (one import path repointed to `./prng.js`). The FLESH·CHASSIS·ANIMA stat spine. |
| `prng.js` | **Copied** from `hoop/v098/sprite/item/prng.js`. Seeded RNG. |
| `balance.mjs` | The headless balance harness — many seeded AI-vs-AI battles per faction matchup → a win/draw/TTK matrix. The reason the sandbox exists. |
| `solver.js` | The **solvability oracle** (fable/forge analog) — searches the deterministic combat tree vs the AI to certify a player party can win, with par + margin + a difficulty grade. |
| `dojo.html` | A visual tuner — pick factions + party sizes, roll a seed, step turns or auto-play, watch the log. |
| `../test/combat.selftest.mjs` | 38 invariants (determinism, kits, legality, every verb incl. multi-agent, passives, termination). |
| `../test/solver.selftest.mjs` | 11 invariants (determinism, easy-solvable, hard-unwinnable, det-mode math, grading). |

`stats.js`/`prng.js` are **vendored copies** (the fork-engine-copy-stats decision): the sandbox stays
fully standalone and node-testable. If hoop's spine changes, re-sync these — don't let them drift.

## Run

```bash
node rind/test/combat.selftest.mjs          # 38 invariants (must be green before vendoring)
node rind/combat/balance.mjs                 # the matchup matrix (300 battles/cell)
node rind/combat/balance.mjs --n 1000        # tighter numbers
node rind/combat/balance.mjs --party 2       # NvN party battles (multi-agent path)
node rind/combat/balance.mjs --pair drift:rindwalker   # one matchup, verbose
node rind/combat/balance.mjs --csv           # machine-readable
node rind/test/solver.selftest.mjs           # the solvability oracle invariants
open rind/combat/dojo.html                    # the visual tuner (party sizes, step/auto-play)
```

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

Resulting edges (≈, run `balance.mjs` for live): **rindwalker > continuant** (76/27), **drift >
rindwalker** (69/27), **continuant ↔ drift** ~even. Each faction now wins one matchup and loses one.

Emergent finding (`--party 2`): **AoE scales superlinearly with party size** — Drift's `blast` makes it
markedly stronger at 2v2 than 1v1. Encounter design will need to account for this.

Tuning levers live in `factions.js` (move/crit/berserk/regen, kit, discounts) and the `engine.js` skill
table (mults, costs, ranges, status durations). The harness is the feedback loop.

## Roadmap — the larger arc (design intent)

The sandbox is being grown toward a deeper game. Shipped so far: faction styles, the multi-agent verb
set (summon/revive/assist/blast/agglomerate), range (lance), the AI archetypes, and the **solvability
oracle** (`solver.js`) — the fable/forge analog described below. Still ahead:

- **The board beyond the grid (open decision — pick this next).** Today it's a 9×9 Chebyshev grid.
  Options: a **bigger grid** (+ terrain/cover/elevation), or a **continuum** (Euclidean positions +
  radii). The engine routes distance/range through `cheb` and skill `range`/`radius` — abstracting that
  to a swappable metric (`dist(a,b)`) lets the same verbs (and the oracle) run on either. This is the
  hinge; the oracle's state space follows from it.
- **Oracle v2.** Today `solver.js` searches a bounded macro-action menu against the AI. Next: real
  expectiminimax (so it's robust to RNG, not just expected-value), a **fragility** read (what fraction of
  lines lose), and forge-style **encounter generation** — lay out foes + a board, let the oracle certify
  it solvable at a target difficulty, mint the n-th encounter as a permalink.
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
