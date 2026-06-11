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

### Substrate: the live deck is the *foam*, and it's even more stable

The game doesn't actually walk `ship.js`'s 4-rooms-per-chunk layout — `world.js` renders and
moves over the **foam** (`FoamField` / `chunkSeeds`), and it already mints a stable chamber id
per tile: `field.chamberAt(wx,wy) → { gid: "cx,cy,i" }` (the seed's home chunk + local index),
with `field.chamberLocation(gid)` as the inverse "for spawning / targeting NPCs". Crucially
**`chunkSeeds` takes no genome at all** — the foam chambers are *fully* genome-independent, so
the live chamber id never drifts. postal does **not** replace this id; it **wraps** it: the gid
is the raw chamber, and `addressFromGid` / `gidFromAddress` give it the hierarchical address
below (and back). The `ship.js` `chambersIn` / `chamberAt` in `postal.js` are the canonical
*engine reference* and the test fixture; the game reaches the foam through the gid bridge. One
extra coordinate the foam needs and `ship.js` doesn't: **depth** (the radial layer — each depth
is its own `FoamField` with its own seed), tracked alongside the address.

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
| `addressFromGid / gidFromAddress` | bridge the live foam gid `"cx,cy,i"` ⇄ a hierarchical address |

---

## Part 2 — wayfinding (`nav.js`), two-tier HPA\*

The single windowed tile-BFS in `world.js` can't route across the unbounded map. The chunk
structure gives the textbook hierarchical answer:

- **Coarse — the portal graph.** Chunks connect *only* through their four seam doors, always
  open, so the inter-chunk graph is a 4-regular lattice. `routeChunks(seed, from, to)` is A\*
  over chunk coords (Manhattan heuristic), realising chunks lazily. Returns the chunk sequence;
  `doorBetween()` gives the door tile to cross at each seam. The seam offsets come from a
  pluggable `ports` fn — `ship.js` `edgePorts` (the reference) or `world.js` `foamPorts` (the live
  deck); they use different RNG streams, so the caller must pass the one matching its substrate.
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

## The wiring plan

1. **✅ Addresses for places — DONE.** Every place now carries `{ gid, addr, depth }` alongside its
   tile: `store.js` sources the chamber from a lookup the app injects
   (`setChamberLookup((x,y) => world.field.chamberAt(x,y))`), wraps the foam gid with
   `addressFromGid`, and persists all three on both backends (the `com.minomobi.hoop.place`
   lexicon gained optional `addr` / `gid` / `depth`). The tile stays the canonical drop
   coordinate + rkey, so legacy records still load; the address is best-effort and back-fills on
   read once the lookup is set. A place is now "the thread of chamber X", stable across drift.
2. **NPC records.** An NPC carries the same `{ addr/gid, depth }`. `field.chamberLocation(gid)`
   (or `resolve()` on the `ship.js` reference) gives its current tile for spawning/rendering;
   `chambersNear()` answers "who's around the player" via the address-prefix neighbourhood.
   Reuse the place plumbing — it's the same address space, by design.
3. **Click-to-walk → `route()`.** Replace `world.js`'s windowed `_pathTo` BFS with
   `nav.route(seed, player, target, field.isFloor, { ports: foamPorts })`; keep `stepMotion`
   for the per-tile walk. **Seam-port integration — RESOLVED.** The foam stitches its seams on
   *different* RNG streams (71/72) than `ship.js` `edgePorts` (1/2), so the coarse tier must use
   the foam's offsets, not the engine's. `world.js` now exports `foamPorts(seed,cx,cy)` (the single
   source `foamChunk` itself uses), and `nav` takes a pluggable `ports` fn (default = `edgePorts`,
   the reference; pass `foamPorts` for the live deck). `nav.selftest` proves a full route over the
   **real `FoamField`** with `foamPorts` is a connected run of foam-floor tiles to the goal. The
   fine tier already routes over `field.isFloor`, so it was substrate-correct all along.
4. **(Optional) sector digests** for the forum/atproto layer: a place/sector can show its
   `blockDigest` as a verifiable "state of this region @ genome" — forkable design state.

Each step is independently shippable and leaves the game working; the kernels are proven, so the
refactor is wiring, not invention.
