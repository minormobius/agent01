# packages/morph — a city's form: streets → blocks → plots → buildings

Pure, DOM-free, deterministic ES modules (node and browser). Served by polis (`polis.mino.mobi/morph/`)
as a byte-identical copy (`scripts/sync-dataviz.mjs`). Selftest: `node packages/morph/morph.selftest.mjs`.

## The model

Urban morphology's (Conzen, 1960): a town plan is three things laid down at different times, the
**streets**, the **plots**, and the **buildings** on the plots.

- **Districts are grains** (bismuth's word, `packages/bismuth/poly.js`): each was laid out in one era by one
  idea of a street. `ERAS`: `organic` (Voronoi cells, burgage plots, hipped roofs), `grid` (a lattice at
  the district's own angle, avenues every k lines), `radial` (rings and spokes round a rond-point, sectors
  doubling outward so the spokes run straight), `modern` (a big grid, merged plots, set back, flat roofs,
  the odd tower), `suburb` (big irregular cells, detached houses with front and side yards). A district's
  lattice is clipped to its region, so seams leave boulevards and triangular (flatiron) plots.
- **Streets** are what is left between blocks: every block edge moves in by half its street's width
  (`geom.inset`, one width per edge), ranked lane/street/avenue/boulevard.
- **Plots**: a block is shared among the streets it fronts by its **straight skeleton** (`geom.zones`: in a
  convex polygon the land nearest each edge is a convex zone), each frontage cut into strips back to the
  middle of the block, as wide as the era's plots, neighbouring strips merged more often in later eras.
- **Buildings** stand on the front of each plot, era-deep, era-tall (falling with distance from the core),
  roofed by the skeleton again (`geom.hipRoof`: height = pitch × distance to the eave), or mansard, or flat.

Everything is a convex clip of a convex polygon, so it is exact: plots tile their lots to 1e-9.

## API

`generate({ seed, size, districts, kinds, plotScale, streetScale, heightScale })` →
`{ frame, districts[{ kind, era, region, seed, centre, angle }], blocks[{ cell, lot, widths, square }],
streets[{ a, b, width, rank }], plots[{ poly, front, frontEdge, width, depth, block }],
buildings[{ footprint, storeys, height, roof, roofFaces, plot }], stats }`. Metres, y north.

`geom.js`: `area`, `centroid`, `clipHalf`, `clipConvex`, `inset`, `zones`, `slices`, `voronoi`, `hipRoof`,
`inradius`, `inside`, `isConvex`, `orientedRect`, `onBoundary`.

## Next

1. polis: the settlement field's cells, eras, walls (→ ring boulevards) and lanes (→ ranks) become the
   districts, seams and streets; terrain from the hinterland sampler; river, quays, bridges.
2. brut on plots: plot → bays, height limit, street front, party walls, a shell-only mode, new typologies.
3. A city to fly (studio/cycle): the plan as a heightmap world, every window a palette entry.
