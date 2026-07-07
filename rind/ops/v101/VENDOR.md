# vendored: the hoop/v101 room-programme policy

Vendored from `hoop/v101` (the game wing's DEVELOPMENT surface) so the rind `ops/office.html`
thread-office can hew to the v101 world-painter conventions — the rind worker only serves
`rind/**`, so a cross-project import wouldn't resolve (same rule as `rind/ops/v100/` and
`rind/ops/sprites/`).

| file (here) | source (hoop/v101) | role |
|---|---|---|
| `rooms.js` | `rooms.js` | the v091/v101 ROOM POLICY: `TRAFFIC_FOOTPRINT` (busier roles claim bigger rooms), `GRAND_ROLES`/`GRAND_MIN` (civic centrepieces anchor big districts), `MIN_ROOM` (bulldoze micro-rooms), `MAX_FIXTURE_AREA` |
| `consoles.js` | `consoles.js` | voronoi-grown WALL FIXTURES: `growWallFixtures` (a fixture claims a cluster of a room's own tiles — corner-anchored, door-clear, area-capped) + `drawWallFixture` (extruded gold-seamed form with the glowing UI crown) + `ROLE_CONSOLE` |
| `v5/voronoi.js` | `v5/voronoi.js` | `bucketGrid`/`clipCell` — the tiling primitives consoles + lights ray-trace through |
| `v5/lights.js` | `v5/lights.js` | PHYSICAL wall lamps: `lightGenome` (sconce/coral/crystal), `placeWallLights`, `drawWallLight`, `tintLights`, and the occluded-bake primitives `occlusionGrid`/`visible`/`bakeFloorRGB` |
| `v5/deco.js` | `v5/deco.js` | the art-deco COMPONENT: `deviceGenome` (superformula {m,n1,n2,n3} + fBm faceting) + `drawDevice` — the room's emissive medallion, luminescence derived from its construction |

**Copied verbatim** (directory layout preserved so the internal `./voronoi.js` imports resolve
unchanged). If you fix a bug here that also lives upstream, port it back to `hoop/v101` rather
than letting the copies diverge. What is *adapted* rather than vendored (in `ops/officeweave.js`
+ `ops/office-app.js`): the walls-with-door-gaps + occlusion/sight geometry, the pooled light
bake, bollard concourse lamps, and half-scale residents with separation — v101's
`skin.js#paintChunk` consumes the v8 chunk-record shape, which the curve-seeded 3D Voronoi
substrate doesn't have. The sprite-people kernel is NOT here — it was already vendored at
`ops/sprites/core.js` (buildGenome/frameRects/walkPose), and the residents draw from it.
