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
| `dojo.html` | A visual tuner — pick factions, roll a seed, step turns or auto-play, watch the log. |
| `../test/combat.selftest.mjs` | 28 invariants (determinism, kits, legality, every verb, every passive, termination). |

`stats.js`/`prng.js` are **vendored copies** (the fork-engine-copy-stats decision): the sandbox stays
fully standalone and node-testable. If hoop's spine changes, re-sync these — don't let them drift.

## Run

```bash
node rind/test/combat.selftest.mjs          # invariants (must be green before vendoring)
node rind/combat/balance.mjs                 # the matchup matrix (300 battles/cell)
node rind/combat/balance.mjs --n 1000        # tighter numbers
node rind/combat/balance.mjs --pair drift:rindwalker   # one matchup, verbose
node rind/combat/balance.mjs --csv           # machine-readable
open rind/combat/dojo.html                    # the visual tuner
```

## The faction styles (the headline content)

Each Tabard faction is one triad domain turned into a way of playing the board:

| Faction | Domain | Style | Passive | Signature kit |
|---|---|---|---|---|
| **Continuant** | CHASSIS | attrition & control | tougher while holding station, counters when braced, steady flux | `bulwark` (heavy guard + counter), `rivet` (pin/slow), `mend` (cheap) |
| **Drift** | ANIMA | tempo & trickery | +2 move, crit bonus right after moving (hit-and-run) | `flit` (disengage-move), `feint` (mark), `siphon` (drain flux) |
| **Rindwalker** | FLESH | risk & resilience | hits harder the more hurt it is (berserk), regen each turn | `gore` (bleed-for-power), `adrenal` (HP→Flux), `scavenge` (deep heal) |

New verbs added over the v1 arena (`strike/overclock/mend/harden`): **brace** (guard + counter),
**flit**, **feint/rivet** (control), **gore**, **adrenal**, **siphon**, **scavenge**, plus
**status effects** (bleed · stun · mark · slow), **flanking** (a strike lands harder when an ally is
also adjacent), and a **turn cap** that resolves a stalemate by held HP.

## Balance state (run the harness for live numbers)

The harness immediately surfaced that the system is **not** the rock-paper-scissors triangle three
factions want — it's closer to a ladder, and one finding is **structural, not a tuning knob**:

- **Anima factions have no offense in the current damage model.** `deriveCombat` (in `stats.js`) ties
  attack to `servo` (a *chassis* attribute), so a pure-anima **Drift** literally can't deal damage —
  its whole kit is utility, and kiting can't save a unit that hits for ~3. **Fixing Drift means giving
  anima a flux/cogit-scaled damage source** (e.g. an anima attack whose damage = f(flux spent), or
  overclock scaling off Core/Flux). That's a decision about the shared spine, deferred on purpose.
- Tuning levers already in `factions.js` (move bonus, crit, berserk max, regen) and `engine.js` skill
  table (mults, costs, status durations) are where the knobs live. The harness is the feedback loop.

## Vendoring back into hoop (when ready)

1. Get `combat.selftest.mjs` green and the balance matrix where you want it.
2. Copy `engine.js` + `factions.js` into `hoop/v098/arena/` (engine.js replaces the v1; repoint its
   `./stats.js` import to `../stats.js`). Keep `stats.js`/`prng.js` here as the sandbox's own copies.
3. Wire `factions.js` into `arena/battle-ui.js` (faction picker, skill buttons from `skillsFor`).
4. Add a `hoop/test/arena.selftest.mjs` mirroring the invariants here.
