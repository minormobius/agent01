# hoop — the postal system & wayfinding (NAV)

How NPCs and places get a stable address in the infinite ship, and how anything routes from
A to B across it. This is the **plumbing**: two pure, deterministic, node-tested kernels —
`js/postal.js` (addressing) and `js/nav.js` (routing) — that the game navigation will be
refactored onto. Nothing here touches `world.js` yet.

> Pinned by `test/postal.selftest.mjs` (27 checks) and `test/nav.selftest.mjs` (20 checks).
> Run: `node hoop/test/postal.selftest.mjs && node hoop/test/nav.selftest.mjs`.

---

## The premise: derive, don't store

The world is a pure function of `(shipSeed, chunkCoord, genome)` — `ship.js` generates any
chunk on demand and **nothing is persisted**. So an address can't be a database row; it has to
be *derivable* from the seed. Two facts from the engine make that possible:

1. **Seams are seed-only.** `edgePorts()` (the four doors a chunk shares with its neighbours)
   come from `rngFor(seed, …)`, never the genome. The connectivity skeleton is fixed for ever.
2. **Chamber slots are genome-stable.** A chunk always places exactly **4 rooms** in a fixed
   order (commons, then quadrants `(1,0)`,`(0,1)`,`(1,1)`), and `genome.sample()` draws the RNG
   **exactly once** regardless of the weights — so a room's *slot* never disappears as the
   ship drifts. Only its *type/flavour* changes (garden → forge), not its existence or ordinal.

The consequence that unlocks the whole design: **an NPC bound to `(chunk, ordinal)` survives
genome drift.** Its physical position is *resolved at lookup time* under the current genome
(it may shift a few tiles as the room re-rolls), but its identity — "the east-garden slot of
chunk (3,−2)" — is permanent.

---

## Part 1 — the address (`postal.js`)

### The postal code

```
shipSeed : <quadtree block path over chunk space> : ordinal(0..3)
```

The block path is the base-4 digits of the **Morton (Z-order) key** of the chunk coordinate
(signed → unsigned via zig-zag), so:

- **Nearby chambers share long address prefixes** — locality clustering. "Who's near here",
  range queries, and routing heuristics are prefix operations, not scans. (Tested: adjacent
  chunks share a longer prefix than far ones.)
- A prefix *is* a **sector handle** (`blockPrefix(addr, level)`): the enclosing quadtree block.

`encodeAddress({cx,cy,ord})` → `"0301…2233.2"`; `decodeAddress` round-trips exactly (incl.
negatives). `addressOf(seed, wx, wy)` gives the address of whatever chamber owns a world tile;
`resolve(seed, addr, genome)` gives the live chamber back.

### Ordering chambers by nearest neighbour

For a strict nearest-neighbour *linear order* (the "order the chambers by their neighbours"
question), `hilbertKey(cx, cy)` beats Morton: sort chunks by it and consecutive entries are
almost always grid-adjacent (measured average step **1.07** cells vs Morton's 1.55). Morton is
used for the *address* (clean quadtree prefixes); Hilbert is offered for spatial iteration.

### The Merkle digest (verifiable, forkable region state)

The quadtree doubles as a hash tree. `chunkDigest(seed,cx,cy,genome)` hashes a chunk's
identity + room layout; `blockDigest(seed,bx,by,level,genome)` folds its four children
(Merkle). So a whole sector "@ this genome" has one verifiable hash — derived on demand, never
stored. This is the atproto thesis made concrete: a region's design state is content-addressed
and forkable. (A Merkle tree does **not** speed up routing — the Hilbert/quadtree index does
that; Merkle is purely for verifiable/forkable state.)

### API

| Function | Purpose |
|---|---|
| `chunkOf(wx,wy)` | world tile → `{cx,cy,lx,ly}` |
| `chambersIn(seed,cx,cy,genome?)` | the 4 chambers of a chunk, `ord 0..3`, world centres + rects |
| `chamberAt(seed,wx,wy,genome?)` | reverse: which chamber owns a tile |
| `encodeAddress / decodeAddress` | `{cx,cy,ord}` ⇄ string |
| `addressOf(seed,wx,wy)` / `resolve(seed,addr,genome?)` | tile → address / address → live chamber |
| `blockPrefix(addr,level)` | the enclosing sector handle |
| `mortonKey / unmorton / hilbertKey` | the space-filling indices |
| `chambersNear(seed,wx,wy,radiusChunks)` | distance-sorted chambers in a neighbourhood |
| `chunkDigest / blockDigest` | the Merkle region digests |

---

## Part 2 — wayfinding (`nav.js`), two-tier HPA\*

The single windowed tile-BFS in `world.js` can't route across the unbounded map. The chunk
structure gives the textbook hierarchical answer:

- **Coarse — the portal graph.** Chunks connect *only* through their four seam doors, always
  open, so the inter-chunk graph is a 4-regular lattice. `routeChunks(seed, from, to)` is A\*
  over chunk coords (Manhattan heuristic), realising chunks lazily. Returns the chunk sequence;
  `doorBetween()` gives the door tile to cross at each seam.
- **Fine — the chamber/tile graph.** `fineRoute(from, to, isFloor, {bound})` is a bounded A\*
  over an **`isFloor(x,y)` predicate** — so nav is decoupled from the substrate and works against
  `ship.js` tiles *or* `world.js` foam, whichever the caller exposes.
- **Stitch — `route(seed, from, to, isFloor)`.** Coarse plans the chunks; fine fills each leg
  (entry-door → exit-door, final door → goal); a one-tile step crosses each seam. Returns a
  single connected tile path `start → goal`, plus the portal waypoints and chunk list.

This is **HPA\*** — and the 2-D-deck cousin of `rind/wayfind.js`, which does the 3-D structural
version (spiral ramps + azimuthal roads through the foam). When we want long-range "roads", we
can borrow rind's corridor-confined A\* at the coarse tier.

`makeShipFloor(seed)` is a test/integration helper: an `isFloor` over the canonical `ship.js`
tiles, so nav routes headlessly over the real engine (that's what the selftest does — every
asserted route is a connected run of real floor tiles from start to goal, across up to 16
chunks, into negative space, deterministically).

---

## Gotchas (designed around; carry into the wiring)

1. **`addPlaceTile` remeshes the local Voronoi** ("a place adds floor"), so live Voronoi cells
   are **not** stable identity. Addresses derive from the **pristine** generation; dropped
   places / NPCs are an *overlay* on top, never the basis of the ordinal.
2. **Tile vs. chamber.** Keep tiles as the continuous-motion substrate (movement physics,
   `isFloor`). Bind *addressing* (places, drops, presence, NPCs) to the **chamber address**. The
   refactor is "introduce a chamber layer and rebind the nouns", not rewrite movement.
3. **Positions drift, slots don't.** Resolve an NPC's tile from its address every time you need
   it; don't cache a tile as identity.
4. **Substrate connectivity.** The `ship.js` corridor is fully connected by construction (every
   port → hub → every room), so routes always exist there. If the game routes over the *foam*
   membrane substrate instead, fine-routing still works (the foam keeps a spanning tree), but
   verify the seam doors are passable in the foam too at integration time.

---

## The wiring plan (next step — not done yet)

1. **Addresses for places.** `store.js` currently keys a place by `placeId = "${x}-${y}"` (raw
   tile). Add a chamber address alongside (`addressOf`), so a place is "the thread of chamber
   X", stable across drift. Keep the tile for back-compat / continuous drops.
2. **NPC records.** An NPC carries a chamber address (`{cx,cy,ord}` / encoded). `resolve()` gives
   its current tile for spawning/rendering; `chambersNear()` answers "who's around the player".
3. **Click-to-walk → `route()`.** Replace `world.js`'s windowed `_pathTo` BFS with
   `nav.route(seed, player, target, field.isFloor)`; keep `stepMotion` for the per-tile walk.
   Long taps route across chunks; the path is the same `{x,y}` tile list the walker already
   consumes.
4. **(Optional) sector digests** for the forum/atproto layer: a place/sector can show its
   `blockDigest` as a verifiable "state of this region @ genome" — forkable design state.

Each step is independently shippable and leaves the game working; the kernels are already
proven, so the refactor is wiring, not invention.
