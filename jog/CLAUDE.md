# jog — running loops from your door

`jog.mino.mobi`. You give it an address (or tap the map, or use your location) and a
distance. It returns up to 12 distinct running loops that start and finish at that point,
each within a tolerance of the distance (±5/10/20%).

## Files

| File | What |
|---|---|
| `index.html` | the page and all CSS. Leaflet 1.9.4 from cdnjs, CARTO basemap tiles (light or dark to match the OS) |
| `app.js` | geocoding (Nominatim), map drawing, the results list, km/mi markers, GPX export, permalink hash |
| `solver.js` | the loop finder. One file that runs as a **Web Worker** (it fetches Overpass itself), as a script, or under node |
| `solver.selftest.mjs` | synthetic street grid → loops; the deploy workflow runs it before deploying |

There's no build step, no backend and no secrets. The worker `jog` only serves this directory.

## How a loop is found (`solver.js`)

1. **Fetch**: Overpass, ways with a runnable `highway=*` within `0.42 × distance` of the start.
   It drops `access`/`foot` = private/no, `area=yes`, driveways and parking aisles. Three
   Overpass mirrors are tried in order.
2. **Graph**: CSR adjacency, undirected. Routing cost is length × a per-highway factor
   (`HIGHWAY` table: paths 0.85 … primary 1.8, steps 2.0). "Prefer paths & parks" multiplies
   the off-road factors by 0.8. Reported distances are always the true length.
3. **Sweep**: for each shape (triangle × 24 bearings, square × 16, pentagon × 12), the code
   draws a regular polygon with the start as one vertex. Each other vertex snaps to the
   nearest node in a big component, and the legs are routed with A*. Every edge an earlier
   leg used costs ×5 on the next one, so the run home takes different streets.
4. **Clean**: out-and-back spurs (`u→v→u`) are cut, then the loop is measured. If it missed,
   the polygon is rescaled by target/measured, up to 3 attempts per plan. A road/straight
   tortuosity estimate (starts at 1.3) is learned across plans to size the first attempt.
5. **Rank**: score = 4·distance error + 1.6·retraced share + 0.35·(1 − roundness) − a bonus
   for off-road share. Loops sharing >60% of their edges count as duplicates; the better one
   is kept.

The A* heuristic is `haversine × MIN_FACTOR` (0.65). It must stay ≤ the cheapest cost
factor after the trail bonus (0.85 × 0.8 = 0.68), or A* stops returning shortest paths. If you
change either table, re-check it. On a 90k-node graph the whole sweep takes about 100 ms. Download
time is what dominates.

## Limits and known gaps

- The distance is capped at 25 km (`app.js`). Past that, the street download around a city
  gets bigger than what the public Overpass servers will hand one browser.
- No elevation, no surface or lighting data, no one-way handling (runners aren't bound by it).
- The worker caches the last graph by start point, radius and trails flag. A new search at the
  same spot with a shorter distance reuses it without downloading again.
- Nominatim's usage policy allows about 1 request/s. We geocode only on submit.

## Verified from the sandbox

The sandbox can't reach Overpass (proxy resets or 504s), so real-city behaviour has not been
checked here. The page was driven in headless Chromium with Overpass and Nominatim stubbed by
a synthetic 14k-node city: 12 loops, km markers, GPX download, mobile layout at 390px with
no horizontal scroll.
