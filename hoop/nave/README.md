# nave — floor 1 (`hoop.mino.mobi/nave`)

The **nave** is floor 1 of the ship: a central **commons** ringed by **six faction wards** arrayed
compactly (the six neighbours of a hex), in **three two-chunk lobes**. Roll the whole group, view it three
ways, pan and zoom.

```
        ┌─ continuant ─┐            • the commons (★) has ≥1 of EVERY building type.
   drift │   commons   │ continuant • each of the six wards is one biome.
        └──   (★)    ──┘            • center connects to ALL six wards.
   drift │  rindwalker │ rindwalker • a ward connects ONLY to the center + its SIBLING
        └──────────────┘              (the other ward of its faction) → three lobes.
                                     • every cross-faction adjacency is a portless WALL.
```

## The three factions (two biomes each)

Each faction owns **4 roles**: two **exclusive** buildings (one per biome, appearing in no other faction
ward — only here + the commons) and two **shared** over-biased roles. Housing (`dwell`) is universal. The
two biomes of a faction carry the faction's two exclusives at two relative **intensity levels** (`high`
cranks the bias; `mild` keeps more housing).

| Faction | over-biases | exclusives (one per biome) |
|---|---|---|
| **Rindwalker** | make · store · *worship* · *mend* | worship (high) · mend (mild) |
| **Continuant** | serve · heal · *govern* · *grow* | govern (high) · grow (mild) |
| **Drift** | move · trade · *learn* · *play* | learn (high) · play (mild) |

A faction ward's roleMix is **only** housing + its two shared roles + its one exclusive — every other role
has weight 0, so the factions stay distinct and the exclusives stay exclusive.

## Views (all with scroll-to-zoom, drag-to-pan)

- **▣ biome** — each ward painted by its faction colour; the commons gold. Reads the lobe structure.
- **✶ verb** — cells coloured by **role** (the verb of the building), so you see the programme.
- **⊞ full** — the **real game-engine render** (`skin.js#paintChunk` per chunk): the coarse generation
  "bones" hidden, **seeded walls** along the real membranes, the **concourse retiled**, and lighting baked
  into every cell's colour — plus room glyphs + seam ports. Each chunk's skin is ~120 ms and painting all
  seven at once chokes the tab, so the full view paints **on demand**: the **center first**, then any ward
  you **click**. The rest show as dim flat placeholders until painted, so the view is always whole. Every
  paint is wrapped — if the skin ever throws it's caught and the error is shown in the rail (and console),
  not silently bailed. Cached per roll.

## How it's built

`nave.js#buildNave(seed)` composes the v2 engine: `solveChunk` per chunk with explicit `closedSides` (the
inter-faction walls) + inherited seam ports (the nine connections). All seven share **one foam seed**, so
neighbouring Voronoi cells abut without a clash. The topology is enforced purely by which sides are
ported vs walled — `sharedSide()` matches abutting sides, the `CONNECTIONS` list says which to open.

The nave uses the deformed **tessellation** chunk shape (`SAMPLE_SHAPE`). The game skin used to assume a
**convex** chunk polygon, which made a non-convex tile paint only its convex core (a sliver); that's now
fixed in `skin.js` — `inConvex` is a ray-cast point-in-polygon (any simple polygon), `clipToConvex` clips
the *polygon* against the convex *cell* (Sutherland–Hodgman only needs the window convex), and the WebGPU
triangulation fans from each cell's centroid — so the wiggly tile fills fully. A convex `hexShape()` is
exported as an alternative, but the tessellation is the default.

Pure + node-tested: `node hoop/nave/test/nave.selftest.mjs` (36 checks — the topology graph, the commons
completeness, exclusive-building isolation, faction role separation, one connected world, determinism).

## Content slots (the hoopy handoff)

`manifest.js` describes the **content slots** the nave exposes, so the existing distribution engine
(`v099/story/engine.js` — deal a tier-legal pool item onto a feature_key on first touch) can be filled.
Every room is a feature; its **role** is the dispatcher tag, **faction** the flavour, the role **tier** the
band to author at; the six **exclusive** buildings are the lobe anchors (quest hooks). `slotProfile()`
averages the guaranteed floors + typical depth over many seeds. Regenerate the handoff doc with
`node hoop/nave/gen-slots.mjs` → **[`SLOTS.md`](SLOTS.md)** (+ `slots.json`). Pinned by
`test/manifest.selftest.mjs` (29 checks). Floor 1 is no-baddies, so no creature pools.

A **shareable HTML report** of the same manifest is served at **`hoop.mino.mobi/nave/slots`** (`slots.html`):
the guaranteed floors, the pool-requirements table (per role tag: tier band · factions · slot depth ·
content types · anchors), the six lobe anchors, and a live "roll a world" sample. Renders from `slots.json`
(instant) with an opt-in live re-roll via `manifest.js`.

Served at `/nave` via `worker.js`; deploys with `hoop/**` on the owning branch.
