# vendored: the hoop/v100 foam-and-rooms floor engine

These six modules are **vendored** from `hoop/v100` (the game wing of the O'Neill-cylinder
package) so the rind `ops/floor.html` demo floor can run them under the rind worker — the rind
worker only serves `rind/**`, so a cross-project import wouldn't resolve (same reason the sprite
kernel is vendored into `rind/ops/sprites/`).

| file (here) | source (hoop/v100) | role |
|---|---|---|
| `foam.js` | `v7/foam.js` | 3D Voronoi foam: nuclei → power cells → chunk polygon → concourse (`seize`) + rooms (`paintRooms`) + cast |
| `roomsfirst.js` | `v7/roomsfirst.js` | the v2 solver: partition into rooms first, then grow a concourse that reaches every room |
| `chunkgen.js` | `v8/chunkgen.js` | `solveChunk()` — wraps foam+rooms into one serializable district record |
| `manager.js` | `v8/manager.js` | multi-chunk world: reflect neighbours across shared edges, stitch the cross-chunk walk graph |
| `voronoi.js` | `paint/voronoi.js` | lattice/rng/zone primitives (`mulberry32`, `assignZones`, `relaxZones`, …) |
| `econ.js` | `econ/econ.js` | `ROLES`, `ROLE_MIX`, `DOMAINS`, `makePlace` — the room programme |

**Only the import paths were changed** (flattened from `../v7/…`/`../paint/…`/`../econ/…` to `./…`);
the logic is byte-identical to source. If you fix a bug here that also lives upstream, port it back
to `hoop/v100` rather than letting the copies diverge. `floor-app.js` drives them over the tessweave
hex lattice; `test/floor.selftest.mjs` pins the contract (districts valid, 7-flower connected,
6 nexus corners).
