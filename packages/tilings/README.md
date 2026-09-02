# tilings — plane tilings as exact cell complexes

`tilings.js` builds a disk of a plane tiling as an adjacency-complete complex
with **integer coordinates**: a square grid, pointy-top hexes, the de Bruijn
multigrid rhomb tilings (Penrose P3, Ammann–Beenker, a 7-fold quasicrystal),
the rhombille, and the Archimedean snub-square, kagome, rhombitrihexagonal and
truncated-square tilings.

The generators are the ones `foam/dungeon.mjs` draws its rooms with, with the
same fixed multigrid offsets, so a `penrose` here is the same Penrose tiling
of the plane the dungeon uses. What the package adds is what every consumer
otherwise re-does: vertex quantisation to `FIX` (1024) units per edge length
and welding, so shared corners are the same integer corner; edge adjacency
(the tile across every directed edge) and vertex adjacency as CSR arrays;
per-edge "along" tiles; exact point location by bucket grid and integer cross
products (every tile is convex).

```js
import { tiling, SHAPES, FIX } from "./tilings.js";
const T = tiling("penrose", 30);          // tiles whose centroid is within 30 edge lengths of the origin
T.n                                       // tile count
T.polygon(t)                              // [[x, y], …] in unit lengths
T.cx[t], T.cy[t]                          // centroid, fixed point (÷ FIX)
T.nbrList.subarray(T.nbrStart[t], T.nbrStart[t + 1])     // tiles sharing an edge with t
T.vnbrList.subarray(T.vnbrStart[t], T.vnbrStart[t + 1])  // tiles sharing a corner with t
T.across[T.polyStart[t] + i]              // the tile across edge i of t, or -1
T.locate(x, y)                            // tile containing a fixed-point point, or -1
T.interior[t], T.deep[t]                  // every edge has a neighbour / every corner neighbour is interior
```

Why exact: a growth engine that decides where to lay a brick by comparing
positions must not depend on the last bit of a cosine. Quantise once here and
everything downstream is integer arithmetic, bit-identical across JS engines.

```bash
node packages/tilings/tilings.selftest.mjs        # closure, coverage, exactness, golden signatures per shape
node packages/tilings/tilings.selftest.mjs --pin  # print signatures (after an INTENDED change; bump TILINGS_VERSION)
```

Consumers that serve it as a static asset keep a byte-identical copy
(`bismuth/js/tilings.js`), kept honest by `scripts/sync-dataviz.mjs --check`.
**Edit `packages/tilings/`, never a copy.** `foam/dungeon.mjs` still carries
its own original of the generators; switch its import when you are next in
that code.
