# foam-dungeon — export formats

The dungeon generator at <https://foam.mino.mobi/dungeon/> exports three
artifacts, downloadable from the page's EXPORT panel. Everything is
deterministic: the same seed + settings produce byte-identical exports.

## Permalinks

A dungeon IS its parameters. The URL hash

```
https://foam.mino.mobi/dungeon/#seed=5&n=3&shape=hex&scale=0.35&v=1
```

is a permalink: anyone opening it regenerates the identical dungeon, and the
CORS-served modules (below) regenerate it identically outside the browser.
`v` is the generator version (`DUNGEON_VERSION`): golden signatures of known
seeds are pinned in CI, so the generation algorithm cannot drift under a
published permalink — any change that would move a layout must bump `v`,
making an old link *detectably* old instead of silently different. The same
version is stamped into every exported JSON (`generator` block).

## The crawler

<https://foam.mino.mobi/dungeon/crawl/> is a room's-eye dungeon crawler over
this format — step tile by tile (grid **and hex**), pass doors, light up the
minimap, find every endpoint. It accepts the same permalink hash, and its
**⤒ load .json** button accepts any exported `foam-dungeon` document — so
maps produced by other services against this spec crawl the same as ours.
Movement uses lattice adjacency (4-neighbour grid / 6-neighbour hex) gated
by tile height difference (≤ `1.05·size + 0.35` — what the foam's walk
certificate permits), with a deterministic "scramble" bridging rare sampling
gaps; CI asserts every generated dungeon is fully crawlable entrance →
every endpoint.

## 1. `foam-dungeon` JSON (canonical) — `.json`

The full dungeon: rooms, tiles with floor heights, doors, paths, and wall
outlines. This is the format our own tooling consumes, and the one to build
against if you want everything the generator knows.

```jsonc
{
  "format": "foam-dungeon",
  "version": 1,
  "generator": { "engine": "foam.mino.mobi/dungeon/", "seed": 5, "salt": 0,
                 "endpoints": 3, "tileShape": "hex", "tileScale": 0.35 },
  "units": "meters",
  "axes": "x/z plan, y up (tile y = floor height under the tile centre)",
  "bounds": { "w": 42, "h": 20.4, "d": 42 },        // the foam block
  "tile":   { "shape": "hex", "size": 2.1, "lattice": "…" },
  "entrance": 258,                                   // room id
  "endpoints": [3, 14, 1],                           // room ids, one per path
  "rooms": [{
    "id": 258, "role": "entrance",                   // entrance | endpoint | room
    "depth": 0,                                      // doors from the entrance
    "floorY": 14.4, "centroid": [x, y, z], "area": 55.1,
    "onPaths": [0, 1, 2],                            // path indices through here
    "doors": [{ "to": 215, "face": 831, "at": [x, y, z], "tile": "3,-1" }],
    "tiles": [{ "key": "3,-1", "q": 3, "r": -1,      // grid tiles carry i,j
                "x": 8.7, "z": 1.8, "y": 14.37,      // centre + floor height
                "kind": "floor" }],                  // floor|door|entrance|goal
    "outline": [[[x, z], …, [x, z]]]                 // closed wall loops (plan)
  }],
  "doors": [{ "face": 831, "rooms": [258, 215], "at": [x, y, z] }],
  "paths": [{ "endpoint": 3, "rooms": [258, 215, …],
              "doors": [{ "face": 831, "from": 258, "to": 215, "at": [x, y, z] }] }]
}
```

Semantics worth knowing:

- **Tiles sit on one global lattice** (origin `0,0`), so tiles align across
  rooms. Grid: centre `x=(i+0.5)·size`. Hex: pointy-top axial,
  `x=√3·R·(q+r/2)`, `z=1.5·R·r`, `R=size/√3`.
- **`y` on every tile is the exact floor-plane height** under its centre —
  render flat by ignoring it, or 3D by using it.
- **Every door is a certified crossing**: the generator's kernel proved a
  standing body can walk through it (see the foam walker). `at` is the
  certified crossing station on the membrane.
- **`outline`** is the boundary of the room's tile union: closed loops,
  first point repeated last, holes appear as additional loops.
- Paths descend: they are shortest by door count from the entrance, with
  ties broken toward the steepest descent.

## 2. Universal VTT — `.dd2vtt`

The de-facto interchange format for battlemaps (originated by Dungeondraft),
imported by Foundry VTT (Universal Battlemap Importer), Arkenforge, Fantasy
Grounds and others. One JSON file containing:

- `resolution` — map size in **grid squares** (1 square = 1 tile),
  `pixels_per_grid` for the baked image,
- `line_of_sight` — the room wall outlines, as wall polylines,
- `portals` — one per door, `closed: true`, positioned at the certified
  crossing station and spanning one tile width along the membrane,
- `image` — the map baked to PNG (base64), exactly
  `map_size × pixels_per_grid` pixels.

Caveat: UVTT assumes a **square** grid. A hex-tiled dungeon exports correct
walls, portals and image, but a VTT's grid overlay will not align with the
hexes — use grid tiles if square-grid alignment matters to your table.

## 3. Map PNG — `.png`

The same top-down plan the page shows (tiles shaded by floor height, walls,
doors, paths), at export resolution. Useful anywhere an image is enough.

## Using the generator itself

The modules are plain ES modules served with CORS enabled — other services
can import and run the generator directly (node ≥18 or any browser):

```js
import { generateDungeon } from 'https://foam.mino.mobi/dungeon.mjs';
import { dungeonToJSON, dungeonToUVTT } from 'https://foam.mino.mobi/dungeon-export.mjs';

const d = generateDungeon({ seed: 5, endpoints: 3, tileShape: 'hex', tileScale: 0.35 });
const json = dungeonToJSON(d);     // canonical
const uvtt = dungeonToUVTT(d);     // supply your own baked image if you need one
```

Determinism is part of the contract: publish a seed and settings, and anyone
can regenerate the identical dungeon.
