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
  into every cell's colour — plus room glyphs + seam ports. Heavy (~1 s for seven chunks), so it's computed
  lazily on first switch and cached per roll (a biome placeholder shows while it paints).

## How it's built

`nave.js#buildNave(seed)` composes the v2 engine: `solveChunk` per chunk with explicit `closedSides` (the
inter-faction walls) + inherited seam ports (the nine connections). All seven share **one foam seed**, so
neighbouring Voronoi cells abut without a clash. The topology is enforced purely by which sides are
ported vs walled — `sharedSide()` matches abutting sides, the `CONNECTIONS` list says which to open.

Pure + node-tested: `node hoop/nave/test/nave.selftest.mjs` (36 checks — the topology graph, the commons
completeness, exclusive-building isolation, faction role separation, one connected world, determinism).

Served at `/nave` via `worker.js`; deploys with `hoop/**` on the owning branch.
