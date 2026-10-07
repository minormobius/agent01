# packages/morph — a city's form: streets → blocks → plots → buildings

Pure, DOM-free, deterministic ES modules (node and browser). Served by polis (`polis.mino.mobi/morph/`)
as a byte-identical copy (`scripts/sync-dataviz.mjs`). Selftest: `node packages/morph/morph.selftest.mjs`.

## The model

Urban morphology's (Conzen, 1960): a town plan is three things laid down at different times and lasting
differently long, the **streets** (longest), the **plots**, and the **buildings** (shortest). So a city
is a palimpsest, and v2 generates it in the order it happened. `standing(city, year)` gives what stood.

- **The countryside first**: lanes radiating from the market town to the frame, and hamlets on them.
  Districts come from a **power diagram** (`geom.power`, weighted Voronoi): a hamlet's weight makes its
  cell reach ~110–160 m toward its neighbours, so it stays a small **urban village** that later plans flow
  round. Toward the frame a hamlet keeps an octagon of its fields; the land beyond goes to the district it
  borders most, so a district is one or more convex `parts`. Every district is cut along the lanes that
  cross it (the core into wedges), so **a lane is never erased**: it stays a street ranked `old road`.
- **Districts are grains** (bismuth's word): `PLANS` organic, village, grid, radial, suburb, modern, each a
  lattice at its own angle clipped to its pieces. The core's boundary is the `ring` (where the wall stood);
  other district boundaries are `seam`s; then `avenue`, `street`. Radial rings take the next ring's
  spokes on their outer side, so rings meet without gaps; the rond-point is a square.
- **Slivers**: a lot under 450 m² or with inradius under 6.5 m is absorbed by its biggest neighbour across
  a street or seam (that street closes: width 0, rank `closed`), else it is an island (< 200 m²) or a
  pocket square. A plot that only fronts a closed street is a `yard`.
- **The fabric is a field**: land value (`plot.value`) falls from the core (bid-rent), rises round a
  rond-point and on the ring, avenues and old roads. Heights follow it. An **unplanned** district (core,
  village, suburb) leans its plot widths and storeys up to half-way toward its neighbour's over 150 m of
  a seam; a **planned** one keeps its edge.
- **Plots**: the block's straight skeleton (`geom.zones`) gives each frontage its land; it is cut into
  strips as wide as the plan's plots.
- **Buildings have histories**. `STYLES` village, medieval, georgian, haussmann, villa, modern, glass. Each
  parcel is first built in its plan's style; then `WAVES` (1780 georgian, 1870 haussmann, 1965 modern,
  2005 glass) rebuild it with probability `p · value^1.6` (the rent gap; villas and villages resist), never
  a building under 45 years old, and a merging style takes the next parcels too (up to its `maxW`): the
  burgage cycle. A building is `{ strips, from, to, style, … }`, its parcel the hull of its strips.

Everything is a convex clip of a convex polygon, so it is exact: plots tile their lots to 1e-9.

## API

`generate({ seed, size, districts, kinds, villages, lanes, plotScale, streetScale, heightScale })` →
`{ frame, years, lanes[{ o, u }], districts[{ kind, plan, year, parts, region, seed, centre, angle, isCore }],
blocks[{ cell, lot, widths[{ w, rank }], year, square, island, absorbed, plaza }],
streets[{ a, b, width, rank, block }], frontages, plots[{ poly, frontEdge, width, depth, value, yard, block }],
buildings[{ footprint, strips, style, from, to, storeys, height, roof, roofFaces, plot }], stats }`.
Metres, y north. ~0.3 s a city. `standing(city, year)` → `{ blocks, buildings, districts }`.

`geom.js`: `area`, `centroid`, `clipHalf`, `clipConvex`, `inset`, `zones`, `slices`, `voronoi`, `power`,
`hull`, `split`, `lineSpan`, `sharedLength`, `hipRoof`, `inradius`, `inside`, `isConvex`, `orientedRect`, `onBoundary`.

## Next

1. polis: the settlement field's cells, eras, walls (→ ring boulevards) and lanes (→ ranks) become the
   districts, seams and streets; terrain from the hinterland sampler; river, quays, bridges.
2. brut on plots: plot → bays, height limit, street front, party walls, a shell-only mode, new typologies.
3. A city to fly (studio/cycle): the plan as a heightmap world, every window a palette entry.
