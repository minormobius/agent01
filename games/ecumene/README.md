# Ecumene

A transit game on a small planet, at `games.mino.mobi/ecumene/`. The
planet is a world from [mappa](../../mappa/)'s engine; towns grow where the
water is; cities grow where your lines reach; the lines fill as they do.

## The loop

The game rests on one claim, which the selftest measures on every run:
**a line grows the city along it.** On world 3, an 8-train line across the
biggest city at the start leaves about 25% more people along it 25 years
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

   A zone over its ceiling sheds a quarter of the excess a year, and every
   move is bounded by what is there and what has room. That is a fix: the
   plain logistic step, once a zone sat far over its ceiling, overshot by a
   factor of a hundred a year and ran the planet to NaN (seed 896933214,
   year ~105, from a 0.6 km² sliver a split had handed a third of a
   district). A split now hands its people out by the land each child got,
   and the selftest pins both.
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

## Commodities and freight

`js/freight.js`, once a year between the passengers and the growth.

- **Food** grows on every zone's open country: livability × rain × warmth
  (`yieldKm` in `js/world.js`), at a yield that improves 2.5% a year (the
  farms get better). A zone loses its farms as it fills (none past
  300/km²). Everyone eats a unit a year.
- **Ore** comes from deposits the geology places (`deposits` in
  `js/world.js`): iron, copper and tin where plates collide or a volcanic
  arc stands, coal in warm wet lowlands far from any boundary. A deposit
  is worked once a town is within 45 km or a freight stop is on it. A
  town's industry wants 0.25 units a person.
- **Every land zone belongs to its nearest town**, so a town is a region,
  and its own farms feed it first. Surplus and shortfall are traded
  between towns and working mines over **roads** (any two within 95 km
  with no sea between; cargo decays as exp(−km/110), carts being slow and
  food spoiling) and over the player's lines that carry **wagons** (a
  tenth of the cost, almost no decay, but 40k units a year per wagon).
  Each short node, biggest first, draws from the cheapest sources it can
  reach; an overfull rail run scales down every flow through it.
- **What arrives matters.** A town's food share scales its zones'
  ceilings (down to 30% when starving), and its ore share draws jobs to it
  (±15%). Rail freight earns ₵1.2e-5 per unit-km.

The selftest measures it: 30 years in on world 3, a 4-wagon line from a
breadbasket 200 km away takes the hungriest city from about 66% fed to
about 92%, and it has grown about 10% more 12 years later. It also shows
the two loops meeting. A metro line alone grows a city by about 25% where
it used to grow it by about 50%, because the city it serves now runs out
of food first. The player has to feed a city as well as move it.

## The log

The sim names its towns (seeded, so a world always names them the same)
and says what happens, once per change: a town founded, a town going
hungry (and fed again), a mine opening, a line passing 50k of freight, a city passing
100k, 250k, 500k, 1M, a new largest city, a line full and stranding riders
(and room again), a line passing 50k riders, funds overdrawn, the planet
passing a mark, the mesh reaching its cap. The page keeps the whole log
(newest first; tap an entry to look there) and pops the big ones up.

## The map

- **Relief, exaggerated.** Each zone's height is interpolated from
  mappa's cells round it, and a normal is fitted to its neighbours'
  heights at 14× exaggeration, lit from the upper left. The colour is a
  hypsometric tint mixed with mappa's biome. People light it up.
- **The sea has no cells.** One deep gradient, a pale shelf haloed round
  every coast, and a field of small waves: 40k points fixed on the sphere,
  thinned to about 2,000 on screen, breathing in phase.
- **Deep zoom.** Pinch or scroll, anchored where you point, to about
  40 px per km in a dense city. Only zones on screen are drawn. Stops go
  exactly where you tap.

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

Next:
- **Water as freight** (aqueducts) and **dry years** from
  `computeClimate` with a shifted forcing, which would make the
  breadbaskets move.
- **Prices**, from civ's price field, in place of the fixed freight fare.
- **Goods**: the ore turned into something the cities trade back.

A sandbox purse: `?funds=5000` starts you with that much.

Also missing: saving a game and a fail state. Saving should follow hoop's
pattern (`hoop/lexicons/story.save.json`): a record in the player's own
repo, localStorage for the hot path, and here the event-sourced variant
its lexicon names, since the sim is deterministic: the seed and the
line edits by year replay the game. Built generic for the games suite
when a second game needs it.

## Files

| | |
|---|---|
| `js/world.js` | the planet from mappa: water, livability, roughness |
| `js/sim.js` | zones, the network, demand, lines, growth, splitting, money |
| `js/freight.js` | food and ore: what grows and what's mined, road and rail freight |
| `js/worker.js` | runs the sim off the main thread |
| `js/view.js` | the globe: zones lit by population, rivers, lines, trains |
| `js/main.js` | the page: building lines, the clock, the HUD |
| `test/ecumene.selftest.mjs` | `node games/ecumene/test/ecumene.selftest.mjs` (~20 s) |
