# One Coast — `/onecoast/`

A world-building tile game on a buckyball. In 1943 Buckminster Fuller
unfolded the Earth onto an icosahedron and cut it so the continents became
one island in one ocean; C60, the molecule named after him, is the same
shape. Build a world on one, tile by tile, until it closes.

## Rules

- The map is an icosahedral **Goldberg sphere**: C60 (20 tiles to lay), C80
  (30), C180 (80) or C240 (110). Its **12 pentagons** are laid from the
  start, each uniform: a mountain massif (all land) or an ocean deep (all
  sea).
- Every side of every tile is **land or sea**. Where a land side meets a sea
  side at a corner, a coast runs into the tile. The tile's **centre** decides
  how its runs join: a land centre makes one landmass with bays cut in; a
  sea centre makes one sea with separate capes. That gives 14 side patterns,
  and 26 kinds of hexagon (every pattern but the two uniform ones comes as a
  bay version and a cape version).
- You hold **three** tiles. Lay any of them on any empty cell beside the map,
  turned any way. A side where your tile disagrees with its neighbour is a
  **cliff**: allowed, but a cliff joins nothing.
- When the bag is empty, the world is scored by its **coastlines** (fewer is
  better; one is perfect), then its cliffs.

**Why coastlines.** On a sphere, "one continent and one ocean" is the same
as "exactly one coastline": land and sea are each connected exactly when the
shore between them is a single closed loop. In general, L land masses and S
seas make L + S − 1 coastlines. (On a torus this fails, which is a reason to
build one later.)

**A perfect world is always in the bag.** The bag is the hexagons of a
generated world with exactly one coastline, so a perfect finish (one coast,
no cliffs) exists when the game starts. At the end, "Fuller's world" shows
it. The selftest proves it: it lays each world's own tiles through the
game's rules and checks for 1 coastline and 0 cliffs.

## Why it plays like this (measured)

Strict edge matching was the first design, and it failed. With an exact bag
on a closing sphere, the last holes are walled on six sides and need one
exact tile. Bots got stuck about once every 9–10 tiles at every size, and a
careful bot did no better than a greedy one at any hand size. The shuffle
decided the game, not the player (Eternity II's problem).

So placement is free, cliffs are allowed, and the game is about **topology**:
keep one continent and one ocean while the world closes in, without sealing
off a lake or stranding an island. That has a strong skill gradient (median
coastlines at the end):

| sphere | random placement | matching edges | careful about topology |
|---|---|---|---|
| C60 | 9 | 2 | 2, perfect in 33% of games |
| C80 | 11 | 3 | 2, perfect in 17% |
| C180 | 15 | 4 | 3 |

## Coastlines

Each coast in a tile is a cape or bay: a band along its run of sides whose
inner edge (corner → inset corners → corner) is rounded (Chaikin) and given a
seeded fractal wiggle in the sphere's tangent plane (`js/coastart.js`). Both
ends are corners, which are shared by the three tiles meeting there, so the
shoreline is continuous across the whole sphere even though every tile is
drawn alone; the selftest checks every coast end is met by exactly one other.
Land is coloured by latitude (ice, taiga, forest, grassland, dry plains);
shores get shallows and a beach line.

## Atelier and mappa

The **atelier** is free play: paint tiles land or sea and the coasts follow
(a shore side goes land or sea by a fixed per-side coin, so coasts wander
across tiles). A world with exactly one coastline can be played as an
expedition.

Any world is a short token (`c240.` + its land/sea bits, about 80
characters). **mappa** can grow a full planet from it: `?coast=<token>` on
mappa passes the token through `mappa/lib/coast-mask.js` into
`generateWorld({ landmask })`. The mask steers the continents, the tectonic
relief stays as texture, and sea level follows the mask's land fraction.
Measured: mappa's land/sea agrees with the mask on 95–97% of cells and the
land fraction matches. Without a mask, mappa is bit-identical (its checksum
selftest). mappa keeps byte-identical copies of `js/geo.js` and
`js/world.js` in `mappa/lib/onecoast/`; this selftest fails if they drift.
The atelier's "open in mappa" button is switched off (`MAPPA_READY` in
`js/main.js`) until mappa's surface is redeployed with the hook.

## Files

| file | what |
|---|---|
| `js/geo.js` | the Goldberg spheres: icosahedron → split / √3 refinements → tiles (corners, aligned neighbours) |
| `js/world.js` | tiles, perfect-world generator, census (full and in-progress), free paint, share codec, smooth land field |
| `js/coastart.js` | coastline geometry per tile, on the sphere and flat |
| `js/game.js` | Expedition (bag, hand, cliffs) and Atelier (painting) |
| `js/view.js` | Canvas 2D renderer: globe, whole (equal-area), inset; tiles, shallows, beaches, massifs, deeps, cliffs, ghost |
| `js/main.js` | input and UI |

```bash
node games/onecoast/test/onecoast.selftest.mjs   # maps, the promise, continuity, codec, painting, mappa copies
node mappa/test/coast-mask.selftest.mjs          # mappa follows a One Coast mask
```
