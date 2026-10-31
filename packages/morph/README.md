# packages/morph — a city's form: streets → blocks → plots → buildings

Pure, DOM-free, deterministic ES modules (node and browser). Served by polis (`polis.mino.mobi/morph/`)
and flown through by studio's colour cycle (`studio.mino.mobi/cycle/`, `cityworld.js`), each from a
byte-identical copy (`scripts/sync-dataviz.mjs`). Selftest: `node packages/morph/morph.selftest.mjs`.

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

## On a settlement field and its ground (v3)

`generate({ seed, field, ground })` lays the plan off polis's settlement field instead of the synthetic
countryside (polis/morph/worker.js runs the whole descent):

- **`ground.js`**: the ground, a heightfield in metres over the field's 3 km frame (8 m cells, ~0.2 s):
  fractal hills at the place's relief, a river (a meandering valley, a channel meandering inside its
  floodplain, a terrace scarp, the valley's sides; distances by an exact Euclidean distance transform),
  perhaps a coast (beach or cliffs), and thermal relaxation so no slope stands steeper than the soil's
  friction angle (tjs/brut/terrain.js's rule). `sampler()` and `riverPathKm()` feed polis/field.js
  (`ctx.sampler` water, `ctx.riverPath`), so the town is founded and spreads on the same ground.
- **Districts**: each built field cell takes the plan of the era it was first built in (by the walls'
  year the walled town, then extramural organic growth, grids from 1750, boulevard schemes from 1850,
  suburbs from 1905, modern grids from 1950), smoothed by a majority filter (the field builds cell by cell;
  a planned extension is one piece), neighbouring cells of one plan being one district. River cells beside
  the town are built on both banks. `HISTORY`/`envelope(T)` is the population curve fed to the field.
- **Streets**: the field's lanes are site → shared edge → site. Old roads (tier 0) and main roads (3)
  survive every plan: a lattice is laid over whole cells, merged back across cell edges (no street there:
  `closed`), and cut straight along the kept roads; the field paths it covers are `erased`.
- **Water**: `clipToLand` cuts each block back from the channel (the strip either side of its local
  chord) and the shore; the cut edges are `quay`s. A lane over a river cell the field bridged is a
  bridge deck (`city.bridges`, dated by the field's bridge).
- **Value** is the field's rent, less for slopes; in rebuilding waves the floodplain is poor before 1850
  and high ground earns a premium after. A block too steep (slope > 0.3) is a green. Each building
  stands on a platform at the mean of the ground under it (`base`; `fall` is the drop across it).

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

## People and how they get about (v4, `mobility.js`)

`transport(city)` lays the transport down through the city's history and records each era's trips;
`activity(city, year)` says who is where. Both read the city as drawn: nothing here is a separate map.

- **Activity, from the buildings.** Each standing building's floors are homes, shops, workshops, offices or
  works, by its period, the street it fronts and its land value: a medieval house is a shop below and a
  family above; a Haussmann block has its café on the ground floor and (1850–1960) a floor of ateliers and
  offices over the shops of a main street; a modern slab is offices where land is dear and flats where it
  is not; a third of the glass towers are flats; a low-value building on the river (1780–1975), or beside the
  railway once it comes, is a warehouse or works. Floor space per head rises through the centuries (`SPACE`:
  12 m² in a medieval town, 40 now), so the same buildings hold fewer people as the city gets richer. Before
  1850 much work is done at home (a share of the household); servants until 1914. Leisure is the share of
  commercial ground floors given to taverns, cafés, theatres and restaurants (`FUN`, up in the 1890s and the
  2000s), plus the squares (markets) and parks, and the station. A 50 m heatmap of each comes with it.
- **The street graph** (`network`): every block edge with a street on it is a centreline; edges are split
  where another block's corner lands on them (T-junctions) and merged from their two sides; the bridges are
  the field's, or (sketch mode) where an old lane crosses the river. Each edge keeps its block's year, so the
  graph of any year is a filter. A street along the frame is the road round the map: a main road.
- **The eras.** The railway comes in the 1840s (once the town has 6,000 people) along the valley from
  upstream on dry land (railways follow rivers: the gradient is free), or with no river through the widest
  gap between the old lanes, to a **terminus on the edge of the old town**, and clears the buildings on its
  line and the station's site (those standing end that year; none is built there after). Horse omnibuses
  (1830s), horse trams (1870s), electric trams (1890s: the horse lines electrified and extended), motor buses
  (1920s, redrawn in the late 1960s and the 2000s); most towns tear their trams up in the 1950s–60s (seeded,
  65%), the buses take their routes, and those towns get light rail back on the busiest old tram corridor
  around 2000. Each line is planned from that year's demand: the zone with the most people not yet within
  420 m of a line, beyond walking distance of the centre, reached from the centre (or the station, if
  nearer) by the shortest path over streets that can take it (trams want the ring, the old roads, the
  avenues). Lines persist: path dependency.
- **The trips.** The town in 260 m zones, each connected to the main-road network where one is near (a
  transport model's zone connectors: otherwise a quarter's trips all leave by the back street beside its
  middle). A commute from homes to jobs and an outing to leisure, spread by a gravity model on the best
  time; the jobs the town's own workers cannot fill are filled from outside, by train to the station and
  by road through the four outlying main-road gates. Modes by a logit on time: on foot, transit (if both
  ends are within 450 m of a stop, a transfer if the lines differ), car (with the century's ownership
  curve, `carsPerHead`), bicycle from 2008. Cars and walkers are routed over the streets (flows per edge),
  riders onto their lines (loads). About 2–3 s for a grown town.

Measured (a grown town, seed 3): railway 1848, 172 buildings cleared; 22 lines over the history; now
116k people, on foot 21%, transit 9%, car 49%, bicycle 21%. The busiest street for cars is a main road or
a bridge (the selftest holds it). Not modelled: congestion feeding back into the route choice, transport
feeding back into where the city builds (the waves of rebuilding run first), freight, and anything
finer than a day's totals.

## The day, back out of the totals (v5, `motion.js`)

mobility.js's flows are a day summed: everything that moved, added up per street (owner: "a kind of
Fourier transform of traffic… now go back to time series with discrete objects"). `day(city, year)`
turns the era's trip table back into things that move:

- **Journeys**: each pair of zones' trips (by purpose: work, going out) are sampled as people (about 80,000
  journeys a day are drawn, so a dot is 2–7 real people, `D.scale`), each with a mode drawn from the pair's
  shares, a departure from the hour's profile (`rhythm(year)`: the working day began at a quarter past six
  in 1800 and lasted eleven and a half hours, now a quarter past eight and under nine; going out is a
  midday outing or, mostly, an evening one) and a way home after. Each is routed over the street graph
  and timed street by street: on foot 4.5 km/h, a bicycle 14, a car at the street's free speed (30 km/h,
  45 on a main road, slower before 1930) slowed by the BPR curve, `t = t0 (1 + 0.15 (V/C)⁴)`, where V is
  that street's cars in that hour (its daily flow × the hour's share of car departures) and C its
  carriageway (the width less 6 m of pavement, ~550 cars an hour a lane), with V/C capped at 2 (uncapped,
  a grown town's bridge at four times its capacity made a crossing take hours and the whole day one
  plateau of stuck cars; past that point people travel earlier or later). So the rush hour is slower
  (selftest, sketch town: 19.4 km/h door to door at 8, 20.4 late morning; the grown town's day keeps its
  peaks and no journey takes more than an hour). Transit riders are counted, not drawn.
- **Vehicles**: every line in service runs to a **timetable**: headways by mode at the peak (tram 7 min,
  bus 10, omnibus 20…), twice that off-peak, three times in the evening, horse services 7:00–22:00, the
  rest 5:30–00:30, both ways, at 70% of the mode's speed for its stops; trains come in from the country to
  the terminus (every 90 min in 1850, 15 now), stand 15 minutes and go out. How full each is comes from
  its line's riders spread by the hour.
- **Where everything is** is a function of the minute: `movers(D, minute)` (positions kept to the right of
  the centreline, headings) and `vehiclesAt(D, minute)` (each body a polyline along its route).
- **The series**: `D.series` holds people under way by mode and vehicles in service, in quarter hours,
  which is the day drawn as a time series.

About 0.5–1.4 s a day (cached per era), ~6 ms a frame to place everything.

