# rind — floor 2 (`hoop.mino.mobi/rind`)

The **rind** is floor 2 of the ship: the **cold structural underworld** below the nave. Where the nave is
the lit market-deck where the ship pretends to be a city, the rind is the foam between the world and the
void — no sun-strip, only the navigation runs, the propulsion drum, and the first whisper of the Signal.
It is **deck 3 of the story spine** (Investigation / "The Vessel"): you reach it by **descending the shaft**
once you've cleared the nave (`narrative_tier ≥ 3`, which the load-bearing deck quest advances you to).

```
        ┌──────────┐            A central HUB (the shaft foot) with three stations spoked off it on
   nav  │  hub  ★  │  drum      alternating hex sides (dirs 0·2·4 → the spokes never touch each other,
        └────┬─────┘            only the hub). Hub links to all three; the three don't interlink — a
          signal                clean star. The hub carries the shaft UP to the nave commons.
```

## The four stations (infrastructure, not civic)

Where the nave runs all thirteen verbs, the rind runs only the **infrastructure** ones — **no grow** (no
farms in the cold hull), **no play** (no arcades down here). Each station carries a role mix + floors + a
principal `grand` room (`RIND_CHUNKS` in `rind.js`):

| Station | character | over-biases |
|---|---|---|
| **The Shaft Foot** (hub) | transit + control — where you arrive | `move` · `store` · `govern` · `mend` |
| **Navigation** | the nav runs, the Seven's instruments | `learn` · `govern` · `move` |
| **The Propulsion Drum** | the engine, fuel, repair | `make` · `mend` · `store` |
| **The Signal Chamber** | the descent's payoff — devotion + study + the toll it takes | `worship` · `learn` · `heal` |

The **Signal Chamber** is the natural tier-3 revelation seat (its `grand` is `worship`, a `lore_fragment` +
`plot_beat` slot): where doctrine meets the Signal, the floor's deepest plot lives. (See the nave's
[`/nave/slots`](/nave/slots) lexicon for what each verb means.)

## How it's built

`rind.js#buildRind(seed)` composes the **same v2 engine as the nave** (`solveChunk` + explicit
`closedSides` for the walls + inherited seam ports + one shared foam seed → seamless seams), so the two
floors are siblings, not special cases. `prepareRind(seed)` + `rindSolveNext(st)` pace the four solves one
chunk at a time — what the game streams in on descent (hub first, then the stations), exactly like the nave
streams its wards. Pure (no DOM); node-tested in `test/rind.selftest.mjs` (36 checks — the star topology,
the infrastructure character, role floors, the Signal payoff, determinism).

The standalone **`/rind`** page (`index.html` + `rind-app.js`) is a near-clone of the nave view: three
views with pan/zoom — **station** (tint by station) · **verb** (by role) · **full** (the real game skin,
`skin.js#paintChunk` per chunk, painted on demand: the hub first, then any station you click).

## NB — two "rinds"

This is the GAME's rind **floor** — the playable cousin of the repo-root [`/rind`](../../rind) structural
**wing** (which models the cylinder's hull, cables and secants). Same name, different layer: one you walk,
one you solve.

## The descent (in-game wiring — next)

The standalone view is the geometry proof; wiring the rind into the live `v099` game as the shaft
destination is the follow-up. The gate already exists (`v099/index.html#maybeBuildRind` fires at
`narrative_tier ≥ 3`); the change is to replace the single placeholder chunk with this streamed four-chunk
floor. The one care: the rind floor must be **offset** from the nave in world coordinates — its internal
hub↔station seams sit on the same hex lattice as the nave's, so co-locating the floors would collide their
ports and leak the player between decks at the boundaries. Offset + a dual shaft-marker (down on the nave
side, up on the rind side) keeps the chute the only crossing.

Served at `/rind` via `worker.js`; deploys with `hoop/**` on the owning branch.
