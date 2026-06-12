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

## Part 3 — the map as a wayfinding fan (`wayfan`, the overhaul substrate)

The map the player sees is being reconceived. Today a deck is a **best-fit plane** sliced through
the 3-D foam (`foam3d.js`'s PCA cut; each radial `depth` is its own plane). The overhaul replaces
that fixed planar cut with a **player-centric wayfinding fan**: the visible map is the set of
routes that **radiate from the player out to the cells on its perimeter** — a shortest-path tree,
truncated at a view radius. `wayfan(isFloor, origin, { radius, cost })` builds it:

- Dijkstra over the same `isFloor` graph nav routes on, from the player out to `radius`.
- Returns the **tree** (`reached`: each cell → its parent), the **tips** (the perimeter the fan
  reaches — the leaves), and `pathTo(x,y)` to reconstruct any geodesic.
- A pluggable **`cost(from,to)`** is the wayfinding *rule*: uniform today (a round planar fan);
  a directional/azimuthal/radial bias elongates or curves it. **Same player, different rule →
  different map.** That is the knob the overhaul turns.

Why this is powerful: the layout that gets drawn is the *embedding of the tree*, not a fixed
plane. Lay the geodesics out by `(dist, bearing)` and a uniform fan reads as a disc; bias the cost
toward "descend a connector while winding in azimuth" and the same renderer draws the **corkscrew
ramp** from `foamview` — because the tree now follows that structure. The corkscrew, the azimuthal
road, a planar slice: all become *modes of the same fan*, selected by the cost/neighbour rule.

**The one extension the corkscrew needs:** the radial dimension. On a single deck `isFloor` is 2-D;
a true corkscrew threads **depths** via the connectors (`field.connectorAt` — chutes/ladders).
Fold that into the fan's neighbour expansion (a connector cell also steps to the next depth's
matching tile) and `wayfan` grows a 3-D tree the renderer can lay out as a spiral. The kernel is
already shaped for it: swap the 4-neighbour step for a neighbour fn that includes connector hops.

`wayfan` is pure and pinned by `nav.selftest` (the tree is all-floor with adjacent parents,
truncated at the radius; every tip's `pathTo` is a connected geodesic rooted at the player; and a
changed `cost` provably reshapes the fan — the map-morph property).

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
3. **✅ Click-to-walk → `route()` — DONE.** `world.js`'s windowed `_pathTo` BFS is replaced by
   `navRoute(field.seed, player, target, field.isFloor, { ports: foamPorts })`; `stepMotion` still
   does the per-tile walk along the returned tile list (`this.path`). The ±48 window is gone — you
   can now auto-walk across many chunks (a far click yields a connected route; verified end-to-end).
   **Seam-port integration was resolved here:** the foam stitches its seams on *different* RNG
   streams (71/72) than `ship.js` `edgePorts` (1/2), so `world.js` exports `foamPorts` (the single
   source `foamChunk` uses) and `nav` takes a pluggable `ports` fn (default `edgePorts`; pass
   `foamPorts` for the live deck). `nav.selftest` proves a full route over the **real `FoamField`**.
4. **The map overhaul → `wayfan()` (Part 3). ✅ PLANAR FAN RENDERED.** `world.js`'s `_draw` now
   computes the player's fan (`_ensureFan`, bounded to ~the viewport so the recompute stays a few
   ms and never gen-hitches), **dims deck cells the fan doesn't reach**, and draws the **geodesic
   routes + perimeter tips** over the deck (`_drawFan`). So the map already reads as "where you can
   go" — a planar fan, not a fixed slice — with the base deck intact underneath. Still to come (a
   dedicated rendering pass): lay the tree out by `(dist, bearing)` for a true fan layout, and fold
   `connectorAt` depth-hops + a radial/azimuthal `cost` into the fan for the foamview corkscrew.
5. **NPC records** reuse step 1's address space (`{addr/gid, depth}`); `chamberLocation`/`resolve`
   spawn them, `chambersNear` queries them.
6. **(Optional) sector digests** for the forum/atproto layer: a place/sector can show its
   `blockDigest` as a verifiable "state of this region @ genome" — forkable design state.

Each step is independently shippable and leaves the game working; the kernels are proven, so the
refactor is wiring, not invention.
