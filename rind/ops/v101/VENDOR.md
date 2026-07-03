# vendored: the hoop/v101 room-programme policy

Vendored from `hoop/v101` (the game wing's DEVELOPMENT surface) so the rind `ops/office.html`
thread-office can hew to the v101 world-painter conventions — the rind worker only serves
`rind/**`, so a cross-project import wouldn't resolve (same rule as `rind/ops/v100/` and
`rind/ops/sprites/`).

| file (here) | source (hoop/v101) | role |
|---|---|---|
| `rooms.js` | `rooms.js` | the v091/v101 ROOM POLICY: `TRAFFIC_FOOTPRINT` (busier roles claim bigger rooms), `GRAND_ROLES`/`GRAND_MIN` (civic centrepieces anchor big districts), `MIN_ROOM` (bulldoze micro-rooms), `MAX_FIXTURE_AREA` |

**Copied verbatim** (the module is pure data, zero-dep). If you tune these numbers, port the
change back to `hoop/v101/rooms.js` rather than letting the copies diverge. The rest of the
v101 look (baked pooled light, walls with door gaps, bollard concourse lamps, half-scale
residents with separation) is *adapted* in `ops/officeweave.js` + `ops/office-app.js` rather
than vendored — v101's `skin.js#paintChunk` consumes the v8 chunk-record shape, which the
curve-seeded 3D Voronoi substrate doesn't have.
