# rind — floor 2, the UPPER RIND (`hoop.mino.mobi/rind`)

The **rind** is floor 2 of the ship: the **structural skin** below the nave. Per hoopy's bible (*"The Seven
as Rind Factions"*), in the rind you leave the three nave factions and walk into the **domain of one of the
Seven** — the thirteen verbs persist but are **re-read at the ship's true scale and age**: a workshop
becomes a forge-cathedral, a chapel a megastructure to a forgotten machine-god. The **upper rind** is where
the strange is still familiar — four of the Seven: **Mercury · Mars · Venus · Jupiter**. (The **lower rind**
— Saturn · Sol · Luna, and the Signal Chamber Luna keeps — is the deeper floor, built separately.) It is the
bible's **Zone 3 (The Upper Rind)**: you reach it by **descending the shaft** once you've cleared the wards
(`narrative_tier ≥ 3`).

```
        ┌──────────┐            Mercury (the arteries) is the HUB — the shaft foot, where you arrive from
  mars  │ mercury ★│  venus     the nave and disperse — with three domain-stations spoked off alternating
        └────┬─────┘            hex sides (dirs 0·2·4 → the spokes touch only the hub). Hub links to all
          jupiter               three; the three don't interlink — a clean star. The hub carries the shaft
                                UP to the nave commons.
```

## The four domains of the Seven (the verbs re-read at scale)

Every verb is re-read as one of the Seven's domains — including **grow** (Venus's gardens) and **play**
(Jupiter's court), which the old "infrastructure-only" rind wrongly banned. Each domain carries a role mix +
floors + a principal `grand` megastructure (`RIND_CHUNKS` in `rind.js`):

| Domain | the Seven | megastructure | over-biases |
|---|---|---|---|
| **Mercury · the Arteries** (hub) | signals/transit between zones | the humming transit halls | `move` · `trade` · `learn` |
| **Mars · the Forge-Cathedral** | hull, welding, damage-control | repair as rite at continental scale | `make` · `mend` |
| **Venus · the Green Deep** | green decks, life-support | vast strange gardens off any schedule | `grow` · `heal` |
| **Jupiter · the Long Table** | the court | an abandoned hall of judgment too large to fill | `govern` · `play` |

There is **no worship** on the upper rind — that is **Saturn/Sol**, the lower rind, where the **Signal
Chamber** (Luna's domain) waits. (See the nave's [`/nave/slots`](/nave/slots) lexicon for what each verb means.)

## The lower rind (bible Zone 4 — `LOWER_RIND_CHUNKS`)

The deeper floor: the deep stasis machinery that predates civilization aboard. Three of the Seven whose
domains predate the Nave, plus the **Signal Chamber** — Luna's lost inner sanctum, the descent's payoff
where Luna makes contact through the terminal that uses the name she knows. Same four-chunk star builder
(`prepareLowerRind`/`buildLowerRind` reuse `rindSolveNext` with the lower-rind biome), **Saturn is the hub**
(the shaft foot from the upper rind):

| Domain | the Seven | over-biases |
|---|---|---|
| **Saturn · the Cold Deep** (hub) | structural deep, the tale-count | `worship` · `store` · `dwell` |
| **Sol · the Fusion-Heart** | the burning center | `worship` · `make` |
| **Luna · the Dream-Archive** | navigation, dream-logs | `learn` · `store` |
| **The Signal Chamber** | Luna's lost sanctum — the chapter's close | `learn` · `worship` |

The register is sacred/archive (worship + learn), no grow/play/heal — the deep is not civic. Pinned by
`rind/test/lowerrind.selftest.mjs` (34 checks). **Wired into v100**: `maybeBuildLowerRind` builds it at
`narrative_tier ≥ 4`, offset ~12000 east, reached by descending a **second shaft** from the upper-rind hub
(the decks are a linear stack — `shafts[k]` joins deck k↔k+1 — so the player walks nave → upper rind →
lower rind, each crossing a teleport pair).

## How it's built

`rind.js#buildRind(seed)` composes the **same v2 engine as the nave** (`solveChunk` + explicit
`closedSides` for the walls + inherited seam ports + one shared foam seed → seamless seams), so the two
floors are siblings, not special cases. `prepareRind(seed)` + `rindSolveNext(st)` pace the four solves one
chunk at a time — what the game streams in on descent (the Mercury hub first, then the domain-stations),
exactly like the nave streams its wards. Pure (no DOM); node-tested in `test/rind.selftest.mjs` (37 checks —
the star topology, the Seven's-domains character incl. grow/play, role floors, Jupiter's grand, determinism).

The standalone **`/rind`** page (`index.html` + `rind-app.js`) is a near-clone of the nave view: three
views with pan/zoom — **station** (tint by station) · **verb** (by role) · **full** (the real game skin,
`skin.js#paintChunk` per chunk, painted on demand: the hub first, then any station you click).

## NB — two "rinds"

This is the GAME's rind **floor** — the playable cousin of the repo-root [`/rind`](../../rind) structural
**wing** (which models the cylinder's hull, cables and secants). Same name, different layer: one you walk,
one you solve.

## The descent (in-game wiring — DONE in v100)

Wired into the **v100** game as the shaft destination. `v100/index.html#maybeBuildRind` fires at
`narrative_tier ≥ 3` (set when the nave campaign completes) and builds this streamed four-chunk floor via
`prepareRind`/`rindSolveNext` (the Mercury hub first, then the three domain-stations, paced like the nave
wards). The floor is laid **offset** ~6000 world-units east of the nave — its internal hub↔station seams sit
on the same hex lattice as the nave's, so co-locating would collide ports and leak the player between decks;
offset makes the **shaft a teleport pair** (`shaftNodes`), the only crossing. A **deck-aware shaft marker**
(`shaftAt[deck]`/`shaftHere()`) reads "down to the rind" on the nave and "up to the Nave" on the rind.
Combat **creeps arm on the rind** (deck 1); the nave stays baddie-free. Pinned by
`v100/test/rind-floor.selftest.mjs`. The standalone `/rind` page stays the geometry/design proof.

Served at `/rind` via `worker.js`; deploys with `hoop/**` on the owning branch.
