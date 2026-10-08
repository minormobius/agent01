# Ecumene

A transit game on a small planet, at `games.mino.mobi/ecumene/`. The
planet is a world from [mappa](../../mappa/)'s engine; towns grow where the
water is; cities grow where your lines reach; the lines fill as they do.

## The loop

The game rests on one claim, which the selftest measures on every run:
**a line grows the city along it.** On world 3, an 8-train line across the
biggest city at the start leaves about 60% more people along it 25 years
later than the same planet without it.

It works like this, once a year:

1. **The network.** Roads join neighbouring land zones. Their speed falls
   with density, `40 km/h / (1 + density/250)`: a downtown of 1000/km² moves
   at 8 km/h. Lines are the player's: stops, rides at 70 km/h, boarding
   (3 min plus half a headway) and alighting. A line's headway is its round
   trip divided by its trains.
2. **Demand.** From every settled zone, one Dijkstra over roads and lines
   together, cut off at 2 hours. Workers spread over the jobs they reach,
   weighted by `exp(−0.04 t)` (a gravity model). Where the best path rides a
   line, a logit share of the trip goes by transit, set against the best
   road-only time. Transit trips are assigned down the shortest-path tree,
   so every ride segment knows its load. (This is what morph's mobility
   model, on the city-growth branch, doesn't do yet: riders actually ride.)
3. **Lines.** Load against capacity (trains × trips a day × 260). An
   overfull ride gets slower the next year, and the riders it can't carry
   are **stranded**.
4. **Growth.** A zone's ceiling is `area × livability × wet × (18 + 6000 ×
   reach)`. `reach` is its access (the jobs it reaches, the same sum the
   trips came from) over 100k. `wet` is its fresh water over (fresh water
   + 400): a river carries a city, rain alone a town. Growth is logistic
   toward the ceiling, with spill into the neighbours. Every 4 years a new
   town is founded at the best open site.
5. **The mesh.** A zone over 8,000 people splits into three, and the
   spherical Voronoi diagram is rebuilt from the sites (`ORB.voronoi`, from
   `../orb/js/sphere.js`). So the map is finest where the city is dense.
   Splitting on a count, not a density (as polis does), means a split never
   cascades.

So a line raises the reach of every zone along it. The ceiling follows,
the city grows along the line, and the line fills, so you buy trains, or it
strands people and slows down.

### What it took to make the loop real

The first version took the lower of the water ceiling and the access
ceiling, and the water bound everywhere: a line changed nothing (−4% to
+4% in the counterfactual, noise). Making water a scale, and roads jam
hard with density, gave +51% with 3 trains and +69% with 8. The tuning
scripts that found this are not committed; the selftest's counterfactual is
the one that guards it.

## Money

You start with ₵700. A train costs ₵90 and ₵10 a year. Track costs ₵4 a km,
three times that over water and more over rough ground, plus ₵0.25 a km a
year. A stop costs ₵20. Fares bring in ₵0.008 per rider per day, every year. A line through a dense
core pays for itself. A long line out to a small town loses money every
year. Closing a line, a stop or a train refunds half its cost.

## The planet

`js/world.js` reads a mappa world (`js/mappa-engine.js`, a byte-identical
copy of `mappa/engine.js` that the selftest checks; refresh it with
`cp mappa/engine.js games/ecumene/js/mappa-engine.js`) at about 1,500
cells, radius 250 km. For each cell it computes:

| field | what it is |
|---|---|
| `hab` | livability by biome |
| `fresh` | fresh water in people per km²: rain (frozen ground counts for little), a river through it (flow accumulation), a lake beside it. The sea is not fresh. |
| `rough` | relief and ice, which slow roads and make track dearer |

The game starts after a 60-year warm-up (about 2.5 s, in the worker), so
the towns are already cities of 20–40 zones.

## Not yet

This is v1 of the plan. Next:
- **v2:** water and food as freight; aqueducts as lines; dry years from
  `computeClimate` with a shifted forcing.
- **v3:** mappa's ores and civ's price field.

Also missing: saving a game (a replay log of line edits would do it,
since the sim is deterministic), city names, and a fail state.

## Files

| | |
|---|---|
| `js/world.js` | the planet from mappa: water, livability, roughness |
| `js/sim.js` | zones, the network, demand, lines, growth, splitting, money |
| `js/worker.js` | runs the sim off the main thread |
| `js/view.js` | the globe: zones lit by population, rivers, lines, trains |
| `js/main.js` | the page: building lines, the clock, the HUD |
| `test/ecumene.selftest.mjs` | `node games/ecumene/test/ecumene.selftest.mjs` (~20 s) |
