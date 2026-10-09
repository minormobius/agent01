# Ecumene

A transit game on a small planet, at `games.mino.mobi/ecumene/`. The
planet is a world from [mappa](../../mappa/)'s engine; towns grow where the
water is; cities grow where your lines reach; the lines fill as they do.

## The loop

The game rests on one claim, which the selftest measures on every run:
**a line grows the city along it.** An 8-train line across the home city
at the start leaves more people along it 25 years later than the same
planet without it: +19%, +11% and +33% on worlds 3, 11 and 896933214
(mean +21%). The selftest asks for a gain on every one and +12% on
average. It is measured on three worlds since the market came in: one
world's 25 years are sensitive to anything, and world 3 alone has ranged
from −9% to +60% as food, ships, the countryside, prices and farm
know-how came in. "Along it" counts the districts whose centres lie
within 5 km of the line, which undercounts where the line works: a line
makes its city split more, and a split moves two thirds of a district's
people to new centres beside it, some outside the band.

It works like this, once a year:

1. **The network.** Roads join neighbouring land zones. Their speed falls
   with density, `40 km/h / (1 + density/250)`: a downtown of 1000/km² moves
   at 8 km/h. Lines are the player's: stops, rides at 70 km/h, boarding
   (3 min plus half a headway) and alighting. A line's headway is its round
   trip divided by its trains; an open line also spends 3 min turning back
   at each end, which a loop never does. Stops of two lines at one place are
   an **interchange**: a change there costs a minute plus half the other
   line's headway, where it used to cost a walk out to the street and back
   (alight 2, board 3 plus the headway).
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
  (`yieldKm` in `js/world.js`), at 20 units per yield-km², a yield that improves 1.5% a year (the
  farms get better). A zone loses its farms as it fills (none past
  300/km²). Everyone eats a unit a year.
- **Farms need farmers.** Open country holds the people it takes to farm
  it: 22 per yield-km² until the player arrives, then fewer each year as
  the farms mechanize (an e-folding of 90 years, down to 3). A farm with
  under 70% of its hands grows less. The countryside starts settled (60%
  of its farmers at year 0) and empties into the cities as the machines
  come: on world 3, 78% of people live on the land at the start and about
  30% by 80 years in. Farmers work their own fields: they don't commute,
  don't make the jobs others travel to, and don't spill into the towns
  until the machines put them over what the land takes. A town is the
  people who don't farm, and that is what its population counts.
- **Ore** comes from deposits the geology places (`deposits` in
  `js/world.js`): iron, copper and tin where plates collide or a volcanic
  arc stands, coal in warm wet lowlands far from any boundary. A deposit
  is worked once a town is within 45 km or a freight stop is on it. A
  town's industry wants 0.25 units a person.
- **Every land zone belongs to its nearest town**, so a town is a region,
  and it pools its own farms' food at no cost (a simplification: a farm
  60 km out feeds its town free, while the next town over pays carriage).
- **A market, not a planner.** Each town has a price for food and for ore,
  in units of the usual price. Each year the market is settled by
  adjustment (`market` in `js/freight.js`):
  - every seller (a town's harvest, a working mine) spreads what it has
    over its buyers by what a unit **nets** there: the price, times the
    share that arrives, less the carriage. Carriage is by **road** (any two
    towns within 70 km with no sea between: 0.006 a km, and food spoils as
    exp(−km/65)), by **ship** (ports within 350 km: 0.002 a km, spoiling
    4× slower), or by your **lines with wagons** (your tariff, 0.0008 a
    km, spoiling 80× slower, but 40k units a year a wagon). Selling at home
    costs nothing. Unsold, a unit is worth 0.2 (stores, fodder).
  - every buyer's price is the one at which its people would buy exactly
    what arrives: demand is need × price^−0.4 for food (a necessity: twice
    the price, a quarter less eaten) and ^−0.8 for ore;
  - a line's run charges a **toll** that climbs steeply as it fills
    (0.05 at its wagons, ×20 at 120%), so a full line is rationed by price
    and keeps the gap between its ends.
  The flows are averaged over 160 rounds (the method of successive
  averages, as in traffic assignment). Chasing each round's best buyer
  outright swung everything back and forth and never settled; neither did
  a toll that rose and fell with each round's load. What comes out is a
  spatial price equilibrium, near enough: where food flows, the dear end
  pays the cheap end's price plus the way, which the selftest checks on
  every flow (within 15%; measured, within 7–8%).
- **Hunger is what you can't afford.** A town is fed by what arrives
  (food share = what it eats over what it needs, capped at 1). A dear
  price cuts what it eats; its food share scales its zones' ceilings
  (down to 30% when starving) and now its growth rate too, which falls
  with hunger and stops at 50% fed. Ore's share draws jobs (±15%).
- **The farms answer the price.** Each town's land farmed, and the farmers
  on it, go as last year's price^0.2 (between ×0.85 and ×1.3, eased in
  over a few years): dear food puts more land under the plough and draws
  people to it; cheap food lets fields go and sends their people to town.
  The farms' share of GDP is what they grow, at the price.
- **Farming gets better where it pays** (induced innovation: Boserup;
  Hayami and Ruttan). Without it the planet outgrew its farms: by year 100
  every big city sat at 63–67% fed, just above where growth stops, with
  food at ×3. Now each town has its own farming know-how (×1 at the
  start), multiplying its harvest. Where food is dear the farms invest:
  know-how grows 0.08 × (price − 1) a year (at most 8%), at 60% of that
  without ore, since machines and fertiliser are made of it. Cheap food
  invests nothing, and nothing is forgotten. Know-how also travels with
  trade: each year a town closes 4% of the gap to the best farms it trades
  food with by road or sea, and 12% along a line. The slow drift in yields
  (1.5% a year) runs only until you arrive; after that it is 0.5% and the
  rest is investment. The log says when a town's farms double.
  Measured: a century on, world 3 is 85% fed with 24.6M people, its best
  farms ×12; a freight line to a town with farms ×4 lifts a ×1 town to
  ×1.36 in a year, where roads alone get it to ×1.20. It is the world's
  doing, not a menu of yours; your hand in it is the ore you haul and the
  lines that carry the know-how.
- **Your margin is the toll.** A line earns its tariff on every unit-km
  and, where it is full, the toll on every unit: ₵0.005 a unit per price
  unit. So wagons are worth most where they are scarce: on world 3, 30
  years in, a 4-wagon line into the hungry home city runs full at a toll
  of ×0.09 and earns ₵200 a year; with 16 wagons it isn't full and the
  toll is gone. More wagons feed more people and earn less a unit: the
  monopolist's choice is yours.

The old allocation served every (short town, source) pair cheapest first.
A least-cost flow is what a competitive market settles on too (the prices
are its dual), so it found roughly the same flows, but it had no prices:
no demand that falls when food is dear, no farms that answer it, no reason
to pay a line more where it is full. Across worlds 3, 11 and 896933214 the
fed share and the planet's people come out within a few percent of the old
model; cities run 5–15% bigger, because cheap food sends farmers to town. The
oracle after it (`test/economy.mjs 60`): the metro bot ends year 60 with
₵6.2k, ₵18k and ₵6.0k on worlds 3, 11 and 896933214 (₵5.2k, ₵3.8k and
₵3.8k before; that end balance swings with when the bot buys its last
line), its first line paying back in 22, 6 and 22 years; greedy and
sprinkle still lose money. With farm know-how in (bigger, hungrier cities
early, then richer ones): ₵1.8k, ₵12k and ₵759, paying back in 33, 12 and
5 years; greedy and sprinkle still lose. World 3 is the hard one now.

The selftest measures it, 30 years in on world 3: a 4-wagon line from a
breadbasket into the hungriest city (the home city, 91% fed at ×1.25 the
usual price) makes it 100% fed at ×0.95, keeps 3% more people 12 years
later, and pays. The line's food also displaces what came by road, so the
city gains less than the line carries: the rest goes to the towns that
food used to feed.

A metro line through the home city, against none, 25 years on: +19%,
+11% and +33% more people along it on worlds 3, 11 and 896933214; on
worlds 3, 11, 896933214, 5 and 7, +11% to +34% (mean +22%), and the whole
home city 0% to +15% bigger. Before the market it was +10% to +52% (mean
+29%). With the market but no farm know-how it fell to −9% on world 3:
the line's growth made its home city hungry, and hunger slows growth, so
dear food ate the gain. Farms that answer dear food gave it back. Feed a
city as well as move it.

## The century

A run is a century: you arrive in 1900 and it ends in 2000 with a report,
after which you can keep playing (`js/main.js` `century`, `report`).

**The score is the time your trains give back.** Each year, every commuter
who takes a train because it beats the road saves the difference (the road-only
time less the train's, counted for the share who ride, both ways, every day);
the sum over the century is the score, in hours (`demand` → `stats.hoursSaved`,
summed into `sim.hours`). It is what transport appraisal counts, it is what
your lines actually do, the car erodes it, and hoarding money can't buy it. On
world 3 over a century, the oracle's metro bot gives back 6.4 billion hours;
scattering short lines, 10 million.

**Against the world without you.** A second worker runs the same seed with no
railway (`worker.js`, `twin`), stepped to each year you reach, and the report
sets the two planets side by side: people, GDP at 1900 prices, how well fed.
A world with no railway is exactly its twin, which the selftest checks. This
is context, not the score: the planet's people are set by its food, so a
railway mostly moves them (into the cities it serves) rather than adds them,
and the difference is a few percent either way (the oracle's bots: −9% to +3%
GDP at year 100). GDP now rises with reach as reach^0.25 (agglomeration); it
was capped at a reach of 1, which every downtown passes, so no railway could
show in it.

**Fares follow prices.** Everything you paid already rose with the world's
wealth (the index) and fares didn't, so over a full century every railway
went broke as the planet got rich: the oracle's bots ran ₵1–2k a year in the
red by 2000 with a million riders a day. Fares and freight earnings are
indexed now, and the same bots end the century in profit.

### Track

Every line has a grade (`GRADES` in `js/sim.js`), which sets how fast its
trains run and how closely they can follow each other:

| grade | speed | a train every | from | to upgrade | upkeep |
|---|---|---|---|---|---|
| single | 70 km/h | 8 min | — | — | ×1 |
| double | 85 km/h | 3 min | — | 0.7 × the track's price | ×1.6 |
| electric | 100 km/h | 1.5 min | 1925 | 0.9 × | ×2.2 |
| rapid | 140 km/h | 1.5 min | 1960 | 1.6 × | ×3 |

So track has a carrying capacity: trains past what it takes wait in the
sidings and carry nothing (the panel counts them as idle), and upgrading is
how a busy line grows. Before, capacity was trains × runs, with no limit at
all. On the selftest's 15 km line, forty trains on single track carry what
4.7 do; double track carries 94k a day where single carried 35k, electric
140k. Trains come five at a time with **+5**. The oracle's bots upgrade a
line when it is full and has idle trains.

### The car

Roads ran at 40 km/h for the whole game. Now motor cars come in 1912, and the
open road's speed climbs toward 90 km/h, half way by 1950 (`roadKmh`). A
dense city still jams (speed ÷ (1 + density/250)), so the car takes the
countryside first, then the suburbs, and the downtowns last. On the same line
in the same city, 2.27% of trips went by train on 1900's roads and 0.46% on
1970's. The second half of the century is spent answering it: faster track,
lines where the roads are jammed. The log marks the car's arrival and the
open road passing 55, 70 and 85 km/h.

## Shaping a line

Pick a line and tap:

- **land**: a stop at the end you're building from. Tap an **end stop** to
  build from that end instead (or use the `from end ▶` / `◀ from start`
  button). The end you're building from has a ring that breathes.
- **its own track**: a stop between the two stops that leg joins. You pay for
  the stop and for the detour only, never for track you already have.
- **one of its stops**: picks it (a ring), and **remove stop** takes it out,
  refunding half its cost. With nothing picked, it removes the end you're
  building from.
- **another line's stop**: the new stop snaps to its exact place, and the two
  are an interchange (◎).

**Loop** (from three stops) lays the track from the last stop to the first.
A loop runs half its trains each way round, so its headway per kilometre is
an open line's; what it saves is the turnbacks. A ring of six stops 5 km
round a city carries about what the same stops open did (the closing leg
costs what the turnbacks saved), and its closing leg is ridden. On a loop, a
tap off the track puts the stop wherever it adds the least track. Opening
the loop refunds half its track.

**Interchanges** do two things. Changing there is quick (above), and
**jobs gather** there: a zone holding an interchange of *m* lines draws
×(1 + 0.5(*m* − 1)) of the jobs it would, out of the same total, so a
station district forms where lines meet and every zone that reaches it
gains reach. The selftest crosses two lines in the home city at one shared
stop, against the same lines 1.5 km apart: the shared stop carries 7% more
journeys in the first year (3.6k changes a day) and holds ×1.48 the jobs.
The log says when lines meet.

What the turnbacks cost the economy was measured with the oracle. The metro
bot's net a year at year 60 moves 10–20% either way between variants (with
and without turnbacks, with and without the jobs at interchanges), inside
the noise of when it buys its last line.

## The log

The sim names its towns (seeded, so a world always names them the same)
and says what happens, once per change: a town founded, a town going
hungry (and fed again), a mine opening, a line passing 50k of freight, a city passing
100k, 250k, 500k, 1M, a new largest city, a line full and stranding riders
(and room again), a line passing 50k riders, two lines meeting at an
interchange, funds overdrawn, the planet
passing a mark, the mesh reaching its cap. The page keeps the whole log
(newest first; tap an entry to look there) and pops the big ones up.

## The screen

The planet gets the top two thirds; the bottom third is the dock, and it
never changes height: the charter, the lines, then a body that shows the
picked line's panel or, with no line picked, the **cities**: every town
with its people, its farmers, how well it eats, and its GDP (jobs, worth
more where they reach more and where the ore comes in, plus the farms;
₵ a year at today's prices). Tap a town to fly there. No page
zoom, no text selection, no double-tap zoom: the globe takes every touch.

## The map

Five layers, on the layer button: **terrain**; **people** and **GDP**,
every district by its density (people or ₵ a year per km²) on a log
scale fixed across the years so maps from different decades compare,
with a key; **food** (what the land yields, and each city tinted by its
food price); and **towns** (whose land is whose). Tap a district for its
people, its GDP and its GDP a head, and its town's food price, fed share
and farm know-how.

The WebGL ground had been under a blue haze since it went in: the
atmosphere's radial gradient was filled over the whole disc, and inside
its inner circle a gradient keeps its first colour, so the canvas above
the ground tinted every district 28% blue. It is a ring outside the limb
now.

The ground is drawn in WebGL (`js/gl.js`; `?gl=0` for the 2D fallback).
Every zone is a triangle fan; a corner takes the average colour of the
zones of its own kind that meet there, so biomes blend smoothly across the
tiles while the coast stays crisp, and a city's districts keep flat
colours so its grain shows. Normals come from the heights at twice the 2D
relief's exaggeration, averaged per corner, and the shader lights them
(and tames the snow), adds a fine texture that fades in with zoom, and
does the sea: shelf to abyss by depth, moving waves, the sun's glint. The
2D canvas on top keeps everything with edges: the faint tile lines, a
city's seams, rivers, lines, labels.

**Rivers** run along the district boundaries. Every zone a river of flow
≥ 30 crosses is split twice at the start (finer valleys), and each of
mappa's river segments is routed over the Voronoi edges, avoiding the
shore, and stops at the first shore vertex where it meets the sea or a
lake. They're drawn as a dark bank and a light current, smoothed, wider
downstream.

**Deep zoom shows the city.** Past ~20 px a km (zoom goes to ~140 px a
km), every dense district fills with a grid of ~150 m blocks at its own
angle: lots built up by its density, each building extruded with its
shadow, terracotta houses in the suburbs, stone and then glass toward the
towers, a park here and there. Seeded per district and lot, so a building
stays put; a lot fills in as the district gets denser.

- **Relief, exaggerated.** Each zone's height is interpolated from
  mappa's cells round it, and a normal is fitted to its neighbours'
  heights at 14× exaggeration, lit from the upper left. The colour is a
  hypsometric tint mixed with mappa's biome. People light it up.
- **The sea has no cells.** One deep gradient, a pale shelf haloed round
  every coast, and a field of small waves: 40k points fixed on the sphere,
  thinned to about 2,000 on screen, breathing in phase.
- **Three layers** (the button cycles them): *terrain*; *food* (where it
  grows, and how well each city eats); *towns* (each zone in its town's
  colour, with white borders between towns: whose land is whose, which is
  what the food and freight run on). The charter is a dashed gold circle.
- **The grain of a city.** Districts are drawn with a dark seam and each
  its own shade, so the splits show.
- **Deep zoom.** Pinch or scroll, anchored where you point. Only zones on screen are drawn. Stops go
  exactly where you tap.

## Money, and the oracle that balances it

You start with ₵700. At start prices:
- A train costs ₵90 and ₵10 a year to run; a freight wagon ₵60 and ₵6.
- A stop costs ₵20.
- Track costs ₵4 a km, three times that over water and more over rough
  ground, plus ₵0.25 a km a year.
- Fares: ₵0.000005 a day per **journey** (however many lines it takes)
  plus ₵0.0000005 per km ridden, every day of the year.
- Closing a line, a stop, a train or a wagon refunds half what it cost.

Four rules ramp the costs, because without them the game printed money:

- **The charter.** You may build only within 35 km of your home city (the
  biggest at the start). Carrying 20k, 60k, 150k and then 400k riders a
  day earns the right to buy a wider one: 70 km, 140 km, 300 km, the whole
  planet, for ₵400, ₵1,200, ₵3,500 and ₵9,000 at start prices. Intercity
  freight is a mid-game unlock, not a day-one exploit.
- **Prices follow the world's wealth.** (The ₵ index, not the food
  market's prices, which are relative to the usual.) Everything you buy, and all
  upkeep, costs `(people / people at the start)^0.5` times its start
  price.
- **Building through a city costs more.** Stops and track cost ×(1 +
  density/1200): tunnels and land.
- **The cities take a cut.** Their levy is
  `0.6 · f / (f + 4000·index)` of fares `f` a year. You always keep more
  for carrying more, but ever less of each extra fare.
- And on the freight side, **ships**: coastal towns trade by sea without
  you, so the freight business is inland.

`test/economy.mjs` plays the game headless with bots (`idle`, `metro`,
`greedy`, `freight`, `sprinkle`, `sprinkle+`, `core`) and prints the money
curve; read it after moving any price. Before these rules, world 3's
metro bot went ₵300 (year 10), ₵2.5k (30), ₵14k (40), ₵49k (60): a
hockey stick from riders compounding against fixed prices. After them, and the fare change below:

| world | bot | y10 | y20 | y40 | y60 | net/yr at 60 | lines | first line pays back |
|---|---|---|---|---|---|---|---|---|
| 3 | metro | ₵65 | ₵499 | ₵4.5k | ₵7.0k | ₵858 | 12 | 18 yr |
| 3 | greedy | ₵71 | ₵175 | ₵547 | ₵345 | ₵209 | 5 | 12 yr |
| 3 | core | ₵34 | ₵47 | ₵145 | −₵197 | −₵41 | 2 | 18 yr |
| 11 | metro | ₵526 | ₵583 | ₵3.2k | ₵12k | ₵451 | 12 | 10 yr |
| 11 | greedy | ₵363 | ₵198 | ₵784 | ₵653 | ₵110 | 6 | 5 yr |
| 11 | core | −₵14 | ₵21 | ₵57 | −₵451 | −₵48 | 2 | never |

(Retuned twice after the countryside came in: denser cities at first made
the first line pay back in 3 years and world 11's metro bot reach ₵42k,
so fares came down by a third and the levy up; then finer river valleys
changed the worlds' histories and smaller home cities slowed the start,
so fares went back up a quarter. The metro bot now spends
its peaks on charters and new lines; buying trains past need, and short
core lines, lose money.)

### Why fares are per journey and per km

A player's strategy, "short lines in the metro cores, sprinkled around",
found what the bots hadn't: a fare was charged per **boarding**, so a
journey that changed lines paid twice. Measured on one chain of six
districts: built as one line it carried 1.88% of trips, built as five
two-stop lines it carried 1.12%, and the five earned the same (₵142 vs
₵146 a year) from 40% fewer people. Now a journey pays once, plus its
km: the five earn ₵47 to the one line's ₵88. The selftest pins that
chopping a line up never pays. Charter milestones count journeys, not
boardings, for the same reason. The `sprinkle`, `sprinkle+` and `core`
bots play the strategy and now lose money.

The bots spend what they can (a line across a city at a new heading, a
train wherever a ride is 90% full, the next charter when they can afford
it), so these are the floor of what a player earns, not the ceiling.
The clock is slower too: a year takes 4 s (1.5 s fast).

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
- **Carriage inside a region**: a farm's food reaching its own town at a
  cost, so the farm-gate price falls with distance (von Thünen's rings).
- **Goods**: the ore turned into something the cities trade back.

A sandbox purse: `?funds=5000` starts you with that much.

Next for the century: a fail state (the cities revoking your charter after
years of stranded riders or debt), a daily world (one seed for everyone, the
hours given back compared), and road freight getting better with the trucks.

Also missing: saving a game. Saving should follow hoop's
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
| `test/ecumene.selftest.mjs` | `node games/ecumene/test/ecumene.selftest.mjs`: the invariants (~45 s) |
| `test/loop.selftest.mjs` | a line grows the city along it, on three worlds (~50 s) |
| `test/market.selftest.mjs` | freight feeds a hungry city; prices, tolls, farms answering the price (~50 s) |
| `test/farms.selftest.mjs` | farm know-how, and a century on (~45 s). Four files so each fits preflight's two-minute cap per selftest |
